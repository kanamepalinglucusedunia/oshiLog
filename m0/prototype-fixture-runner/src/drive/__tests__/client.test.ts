import { createDriveClient, DriveClientError, driveArtifactName } from '@/drive/client';

const TOKEN = 'top-secret-access-token';
const SESSION_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&session=secret';

type FakeResponseOptions = {
  status?: number;
  json?: unknown;
  text?: string;
  bytes?: Uint8Array;
  headers?: Record<string, string>;
};

function response(options: FakeResponseOptions = {}): Response {
  const status = options.status ?? 200;
  const headers = new Map(Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    json: jest.fn(async () => options.json),
    text: jest.fn(async () => options.text ?? JSON.stringify(options.json ?? {})),
    arrayBuffer: jest.fn(async () => {
      const bytes = options.bytes ?? new Uint8Array();
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }),
  } as unknown as Response;
}

function file(id: string) {
  return { id, name: `file-${id}`, size: '3', sha256Checksum: 'a'.repeat(64) };
}

describe('typed Google Drive appDataFolder client', () => {
  it('lists every page, handles an empty folder, and encodes appProperties filters', async () => {
    const http = jest.fn()
      .mockResolvedValueOnce(response({ json: { files: [file('1')], nextPageToken: 'page two' } }))
      .mockResolvedValueOnce(response({ json: { files: [] } }));
    const client = createDriveClient({ acquireAccessToken: async () => TOKEN, http });

    await expect(client.listFiles({ artifactType: 'data', commitState: 'committed' })).resolves.toEqual([file('1')]);

    expect(http).toHaveBeenCalledTimes(2);
    const firstUrl = String(http.mock.calls[0][0]);
    const secondUrl = String(http.mock.calls[1][0]);
    const query = new URL(firstUrl).searchParams.get('q');
    expect(query).toContain("'appDataFolder' in parents");
    expect(query).toContain("key='artifactType' and value='data'");
    expect(secondUrl).toContain('pageToken=page+two');
    for (const call of http.mock.calls) {
      expect(call[1]).toMatchObject({ headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }) });
    }
  });

  it('gets metadata, downloads bytes, and verifies size and SHA-256', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const http = jest.fn()
      .mockResolvedValueOnce(response({ json: file('1') }))
      .mockResolvedValueOnce(response({ bytes }));
    const client = createDriveClient({
      acquireAccessToken: async () => TOKEN,
      http,
      sha256: async () => 'a'.repeat(64),
    });

    await expect(client.getMetadata('1')).resolves.toEqual(file('1'));
    await expect(client.downloadVerified('1', { size: 3, sha256: 'a'.repeat(64) })).resolves.toEqual(bytes);
  });

  it.each([
    [{ size: 2, sha256: 'a'.repeat(64) }, 'size'],
    [{ size: 3, sha256: 'b'.repeat(64) }, 'checksum'],
  ])('rejects a verified download with a %s mismatch', async (expected, label) => {
    const client = createDriveClient({
      acquireAccessToken: async () => TOKEN,
      http: jest.fn(async () => response({ bytes: new Uint8Array([1, 2, 3]) })),
      sha256: async () => 'a'.repeat(64),
    });
    await expect(client.downloadVerified('1', expected)).rejects.toThrow(new RegExp(label, 'i'));
  });

  it('creates and updates multipart files in appDataFolder and can permanently delete them', async () => {
    const http = jest.fn()
      .mockResolvedValueOnce(response({ status: 201, json: file('created') }))
      .mockResolvedValueOnce(response({ json: file('updated') }))
      .mockResolvedValueOnce(response({ json: file('metadata') }))
      .mockResolvedValueOnce(response({ status: 204 }));
    const client = createDriveClient({ acquireAccessToken: async () => TOKEN, http });
    const metadata = { name: driveArtifactName('data', 'snapshot-1'), appProperties: {
      app: 'oshilog' as const, formatVersion: '1' as const, artifactType: 'data' as const,
      category: 'data' as const, snapshotId: 'snapshot-1', commitState: 'staging' as const,
    } };

    await expect(client.createMultipart(metadata, '{"ok":true}', 'application/json')).resolves.toMatchObject({ id: 'created' });
    await expect(client.updateMultipart('created', metadata, '{"ok":true}', 'application/json')).resolves.toMatchObject({ id: 'updated' });
    await expect(client.updateMetadata('updated', metadata)).resolves.toMatchObject({ id: 'metadata' });
    await expect(client.deleteFile('updated')).resolves.toBeUndefined();
    expect(String(http.mock.calls[0][0])).toContain('uploadType=multipart');
    expect(String(http.mock.calls[1][0])).toContain('/created?uploadType=multipart');
    expect(String(http.mock.calls[2][0])).toContain('/updated?fields=');
    expect(http.mock.calls[2][1]).toMatchObject({ method: 'PATCH' });
    expect(http.mock.calls[3][1]).toMatchObject({ method: 'DELETE' });
  });

  it('starts, reconciles, and completes a resumable upload', async () => {
    const http = jest.fn()
      .mockResolvedValueOnce(response({ status: 200, headers: { Location: SESSION_URL } }))
      .mockResolvedValueOnce(response({ status: 308, headers: { Range: 'bytes=0-2' } }))
      .mockResolvedValueOnce(response({ status: 308, headers: { Range: 'bytes=0-5' } }))
      .mockResolvedValueOnce(response({ status: 201, json: file('done') }));
    const client = createDriveClient({ acquireAccessToken: async () => TOKEN, http });
    const metadata = { name: 'blob', appProperties: {
      app: 'oshilog' as const, formatVersion: '1' as const, artifactType: 'media_blob' as const,
      sha256: 'a'.repeat(64), commitState: 'staging' as const,
    } };

    await expect(client.startResumable(metadata, 'application/octet-stream', 6)).resolves.toBe(SESSION_URL);
    await expect(client.uploadChunk(SESSION_URL, new Uint8Array([1, 2, 3]), 0, 6)).resolves.toEqual({ status: 'incomplete', nextOffset: 3 });
    await expect(client.queryResumable(SESSION_URL, 6)).resolves.toEqual({ status: 'incomplete', nextOffset: 6 });
    await expect(client.uploadChunk(SESSION_URL, new Uint8Array([4, 5, 6]), 3, 6)).resolves.toEqual({ status: 'complete', file: file('done') });
    expect(http).toHaveBeenCalledTimes(4);
  });

  it('maps expired sessions and API errors without leaking credentials or response bodies', async () => {
    const cases: [number, unknown, string][] = [
      [401, { error: { message: TOKEN } }, 'AUTH_REQUIRED'],
      [403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } }, 'QUOTA_EXCEEDED'],
      [403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }, 'RATE_LIMITED'],
      [429, { error: { message: SESSION_URL } }, 'RATE_LIMITED'],
      [500, { error: { message: TOKEN } }, 'UNKNOWN'],
    ];
    for (const [status, body, code] of cases) {
      const client = createDriveClient({
        acquireAccessToken: async () => TOKEN,
        http: jest.fn(async () => response({ status, json: body })),
      });
      let caught: DriveClientError;
      try {
        await client.listFiles();
        throw new Error('Expected Drive request to fail');
      } catch (error) {
        caught = error as DriveClientError;
      }
      expect(caught.code).toBe(code);
      expect(`${caught.message}${JSON.stringify(caught)}`).not.toContain(TOKEN);
      expect(`${caught.message}${JSON.stringify(caught)}`).not.toContain(SESSION_URL);
    }

    const expired = createDriveClient({
      acquireAccessToken: async () => TOKEN,
      http: jest.fn(async () => response({ status: 404, json: {} })),
    });
    await expect(expired.queryResumable(SESSION_URL, 6)).rejects.toMatchObject({ code: 'UPLOAD_SESSION_EXPIRED' });
  });

  it('rejects malformed JSON and unexpected response schemas', async () => {
    const malformed = createDriveClient({
      acquireAccessToken: async () => TOKEN,
      http: jest.fn(async () => ({ ...response(), json: jest.fn(async () => { throw new SyntaxError('bad json'); }) } as Response)),
    });
    await expect(malformed.listFiles()).rejects.toMatchObject({ code: 'BACKUP_INVALID' });

    const invalid = createDriveClient({
      acquireAccessToken: async () => TOKEN,
      http: jest.fn(async () => response({ json: { files: [{ id: 42 }] } })),
    });
    await expect(invalid.listFiles()).rejects.toMatchObject({ code: 'BACKUP_INVALID' });
  });

  it('forwards AbortSignal and performs no automatic retry', async () => {
    const controller = new AbortController();
    const http = jest.fn(async (_input: string, _init?: RequestInit) => response({ status: 500 }));
    const client = createDriveClient({ acquireAccessToken: async () => TOKEN, http });
    await expect(client.listFiles(undefined, controller.signal)).rejects.toBeInstanceOf(DriveClientError);
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0][1]).toMatchObject({ signal: controller.signal });
  });

  it('uses the native binary SHA-256 implementation by default', async () => {
    const client = createDriveClient({
      acquireAccessToken: async () => TOKEN,
      http: jest.fn(async () => response({ bytes: new Uint8Array([1]) })),
    });
    await expect(client.downloadVerified('file-1', { size: 1, sha256: '0'.repeat(64) }))
      .resolves.toEqual(new Uint8Array([1]));
  });

  it('rejects invalid identifiers, empty authorization, and invalid resumable ranges', async () => {
    const client = createDriveClient({ acquireAccessToken: async () => TOKEN, http: jest.fn() });
    await expect(client.getMetadata('../unsafe')).rejects.toMatchObject({ code: 'BACKUP_INVALID' });

    const unauthorized = createDriveClient({ acquireAccessToken: async () => '', http: jest.fn() });
    await expect(unauthorized.listFiles()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await expect(unauthorized.queryResumable(SESSION_URL, 6)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });

    const invalidRange = createDriveClient({
      acquireAccessToken: async () => TOKEN,
      http: jest.fn(async () => response({ status: 308, headers: { Range: 'invalid' } })),
    });
    await expect(invalidRange.queryResumable(SESSION_URL, 6)).rejects.toMatchObject({ code: 'BACKUP_INVALID' });
  });

  it('maps transport cancellation and failure without retrying or leaking details', async () => {
    const aborted = new AbortController();
    aborted.abort();
    const abortError = Object.assign(new Error('private token'), { name: 'AbortError' });
    const cancelledHttp = jest.fn(async () => { throw abortError; });
    const cancelled = createDriveClient({ acquireAccessToken: async () => TOKEN, http: cancelledHttp });
    await expect(cancelled.listFiles(undefined, aborted.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(cancelled.uploadChunk(SESSION_URL, new Uint8Array([1]), 0, 1, aborted.signal))
      .rejects.toMatchObject({ code: 'CANCELLED' });

    const failedHttp = jest.fn(async () => { throw new Error('response contained private material'); });
    const failed = createDriveClient({ acquireAccessToken: async () => TOKEN, http: failedHttp });
    await expect(failed.listFiles()).rejects.toMatchObject({ code: 'UNKNOWN', message: 'Google Drive request failed.' });
    await expect(failed.uploadChunk(SESSION_URL, new Uint8Array([1]), 0, 1))
      .rejects.toMatchObject({ code: 'UNKNOWN', message: 'Google Drive request failed.' });
    await expect(failed.queryResumable(SESSION_URL, 1))
      .rejects.toMatchObject({ code: 'UNKNOWN', message: 'Google Drive request failed.' });
    expect(failedHttp).toHaveBeenCalledTimes(3);
  });

  it('handles an unreadable API error body as a safe unknown failure', async () => {
    const bad = response({ status: 500 });
    bad.json = jest.fn(async () => { throw new SyntaxError('bad'); });
    const client = createDriveClient({ acquireAccessToken: async () => TOKEN, http: jest.fn(async () => bad) });
    await expect(client.listFiles()).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('never sends authorization to a non-Google resumable session URL', async () => {
    const http = jest.fn();
    const client = createDriveClient({ acquireAccessToken: async () => TOKEN, http });
    await expect(client.queryResumable('https://attacker.example/upload', 1))
      .rejects.toMatchObject({ code: 'BACKUP_INVALID' });
    expect(http).not.toHaveBeenCalled();
  });
});
