import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import {
  driveAppPropertiesSchema,
  driveFileListSchema,
  driveFileSchema,
  type DriveCategory,
  type DriveErrorCode,
} from './contracts';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_FIELDS = 'id,name,size,sha256Checksum,modifiedTime,appProperties';

export class DriveClientError extends Error {
  constructor(readonly code: DriveErrorCode, message: string) {
    super(message);
    this.name = 'DriveClientError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const metadataInputSchema = z.object({
  name: z.string().min(1).max(500),
  appProperties: driveAppPropertiesSchema,
}).strict();

export type DriveFile = z.infer<typeof driveFileSchema>;
export type DriveFileMetadataInput = z.infer<typeof metadataInputSchema>;
export type DriveFileFilter = Partial<z.infer<typeof driveAppPropertiesSchema>>;
export type ResumableProgress =
  | { status: 'incomplete'; nextOffset: number }
  | { status: 'complete'; file: DriveFile };

type Http = (input: string, init?: RequestInit) => Promise<Response>;

function byteHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function defaultSha256(bytes: Uint8Array): Promise<string> {
  const exactBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return byteHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, exactBytes));
}

function safeId(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,500}$/.test(value)) throw new DriveClientError('BACKUP_INVALID', 'Invalid Drive file identifier.');
  return value;
}

function encodedFileId(value: string): string {
  return encodeURIComponent(safeId(value));
}

function safeSessionUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'www.googleapis.com' || !url.pathname.startsWith('/upload/drive/v3/files')) {
      throw new Error('Unexpected upload host');
    }
    return url.toString();
  } catch {
    throw new DriveClientError('BACKUP_INVALID', 'Invalid Google Drive upload session.');
  }
}

function responseErrorCode(status: number, reason?: string, resumable = false): DriveErrorCode {
  if (status === 401) return 'AUTH_REQUIRED';
  if (resumable && status === 404) return 'UPLOAD_SESSION_EXPIRED';
  if (status === 429 || reason?.toLowerCase().includes('ratelimit')) return 'RATE_LIMITED';
  if (status === 403 && reason?.toLowerCase().includes('quota')) return 'QUOTA_EXCEEDED';
  return 'UNKNOWN';
}

async function apiReason(response: Response): Promise<string | undefined> {
  try {
    const body = await response.json() as { error?: { errors?: { reason?: unknown }[] } };
    const reason = body?.error?.errors?.[0]?.reason;
    return typeof reason === 'string' ? reason : undefined;
  } catch {
    return undefined;
  }
}

async function requireOk(response: Response, resumable = false): Promise<void> {
  if (response.ok) return;
  const code = responseErrorCode(response.status, await apiReason(response), resumable);
  throw new DriveClientError(code, `Google Drive request failed (${response.status}).`);
}

async function parseJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  try {
    return schema.parse(await response.json());
  } catch {
    throw new DriveClientError('BACKUP_INVALID', 'Google Drive returned an invalid response.');
  }
}

function quoteQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function appPropertiesQuery(filter: DriveFileFilter = {}): string {
  const properties = driveAppPropertiesSchema.partial().parse(filter);
  const required: Record<string, string> = { app: 'oshilog', ...properties };
  return Object.entries(required)
    .map(([key, value]) => `appProperties has { key='${quoteQuery(key)}' and value='${quoteQuery(String(value))}' }`)
    .join(' and ');
}

function withAppDataParent(input: DriveFileMetadataInput) {
  const metadata = metadataInputSchema.parse(input);
  return { ...metadata, parents: ['appDataFolder'] };
}

function multipartBody(metadata: object, content: string, mimeType: string, boundary: string): string {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function nextOffset(response: Response): number {
  const range = response.headers.get('Range');
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  if (!match) throw new DriveClientError('BACKUP_INVALID', 'Google Drive returned an invalid upload range.');
  return Number(match[1]) + 1;
}

export function driveArtifactName(category: DriveCategory, snapshotId: string): string {
  safeId(snapshotId);
  return `oshilog-${category}-${snapshotId}.json`;
}

export function createDriveClient(dependencies: {
  acquireAccessToken: () => Promise<string>;
  http?: Http;
  sha256?: (bytes: Uint8Array) => Promise<string>;
}) {
  const http = dependencies.http ?? fetch;
  const sha256 = dependencies.sha256 ?? defaultSha256;

  const request = async (url: string, init: RequestInit = {}, resumable = false): Promise<Response> => {
    const accessToken = await dependencies.acquireAccessToken();
    if (!accessToken) throw new DriveClientError('AUTH_REQUIRED', 'Google authorization is required.');
    let response: Response;
    try {
      response = await http(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      if (init.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new DriveClientError('CANCELLED', 'Google Drive request was cancelled.');
      }
      throw new DriveClientError('UNKNOWN', 'Google Drive request failed.');
    }
    if (!(resumable && response.status === 308)) await requireOk(response, resumable);
    return response;
  };

  const resumableResult = async (response: Response): Promise<ResumableProgress> => {
    if (response.status === 308) return { status: 'incomplete', nextOffset: nextOffset(response) };
    await requireOk(response, true);
    return { status: 'complete', file: await parseJson(response, driveFileSchema) };
  };

  return {
    async listFiles(filter?: DriveFileFilter, signal?: AbortSignal): Promise<DriveFile[]> {
      const files: DriveFile[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          spaces: 'appDataFolder',
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          q: `'appDataFolder' in parents and trashed = false and ${appPropertiesQuery(filter)}`,
          pageSize: '1000',
        });
        if (pageToken) params.set('pageToken', pageToken);
        const response = await request(`${DRIVE_API}?${params}`, { method: 'GET', signal });
        const page = await parseJson(response, driveFileListSchema);
        files.push(...page.files);
        pageToken = page.nextPageToken;
      } while (pageToken);
      return files;
    },
    async getMetadata(id: string, signal?: AbortSignal): Promise<DriveFile> {
      const response = await request(`${DRIVE_API}/${encodedFileId(id)}?fields=${encodeURIComponent(FILE_FIELDS)}`, { signal });
      return parseJson(response, driveFileSchema);
    },
    async download(id: string, signal?: AbortSignal): Promise<Uint8Array> {
      const response = await request(`${DRIVE_API}/${encodedFileId(id)}?alt=media`, { signal });
      return new Uint8Array(await response.arrayBuffer());
    },
    async downloadVerified(id: string, expected: { size: number; sha256: string }, signal?: AbortSignal): Promise<Uint8Array> {
      const bytes = await this.download(id, signal);
      if (bytes.byteLength !== expected.size) {
        throw new DriveClientError('CHECKSUM_MISMATCH', 'Downloaded Drive file size mismatch.');
      }
      if (await sha256(bytes) !== expected.sha256) {
        throw new DriveClientError('CHECKSUM_MISMATCH', 'Downloaded Drive file checksum mismatch.');
      }
      return bytes;
    },
    async createMultipart(metadata: DriveFileMetadataInput, content: string, mimeType: string, signal?: AbortSignal): Promise<DriveFile> {
      const boundary = 'oshilog-drive-boundary';
      const body = multipartBody(withAppDataParent(metadata), content, mimeType, boundary);
      const response = await request(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`, {
        method: 'POST', signal, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
      });
      return parseJson(response, driveFileSchema);
    },
    async updateMultipart(id: string, metadata: DriveFileMetadataInput, content: string, mimeType: string, signal?: AbortSignal): Promise<DriveFile> {
      const boundary = 'oshilog-drive-boundary';
      const body = multipartBody(metadataInputSchema.parse(metadata), content, mimeType, boundary);
      const response = await request(`${DRIVE_UPLOAD_API}/${encodedFileId(id)}?uploadType=multipart&fields=${encodeURIComponent(FILE_FIELDS)}`, {
        method: 'PATCH', signal, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
      });
      return parseJson(response, driveFileSchema);
    },
    async updateMetadata(id: string, metadata: DriveFileMetadataInput, signal?: AbortSignal): Promise<DriveFile> {
      const response = await request(`${DRIVE_API}/${encodedFileId(id)}?fields=${encodeURIComponent(FILE_FIELDS)}`, {
        method: 'PATCH', signal, headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(metadataInputSchema.parse(metadata)),
      });
      return parseJson(response, driveFileSchema);
    },
    async startResumable(metadata: DriveFileMetadataInput, mimeType: string, totalBytes: number, signal?: AbortSignal): Promise<string> {
      const response = await request(`${DRIVE_UPLOAD_API}?uploadType=resumable&fields=${encodeURIComponent(FILE_FIELDS)}`, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(totalBytes) },
        body: JSON.stringify(withAppDataParent(metadata)),
      });
      const location = response.headers.get('Location');
      if (!location) throw new DriveClientError('BACKUP_INVALID', 'Google Drive did not create an upload session.');
      return safeSessionUrl(location);
    },
    async uploadChunk(sessionUrl: string, chunk: Uint8Array, offset: number, totalBytes: number, signal?: AbortSignal): Promise<ResumableProgress> {
      const end = offset + chunk.byteLength - 1;
      const response = await request(safeSessionUrl(sessionUrl), {
        method: 'PUT', signal,
        headers: { 'Content-Length': String(chunk.byteLength), 'Content-Range': `bytes ${offset}-${end}/${totalBytes}` },
        body: chunk as unknown as BodyInit,
      }, true);
      return resumableResult(response);
    },
    async queryResumable(sessionUrl: string, totalBytes: number, signal?: AbortSignal): Promise<ResumableProgress> {
      const response = await request(safeSessionUrl(sessionUrl), {
        method: 'PUT', signal,
        headers: { 'Content-Length': '0', 'Content-Range': `bytes */${totalBytes}` },
      }, true);
      return resumableResult(response);
    },
    async deleteFile(id: string, signal?: AbortSignal): Promise<void> {
      await request(`${DRIVE_API}/${encodedFileId(id)}`, { method: 'DELETE', signal });
    },
  };
}

export type DriveClient = ReturnType<typeof createDriveClient>;
