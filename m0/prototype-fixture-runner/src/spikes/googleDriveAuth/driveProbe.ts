import { z } from 'zod';

const driveListResponseSchema = z
  .object({
    files: z.array(z.object({ id: z.string(), name: z.string() }).strict()).max(1),
    nextPageToken: z.string().optional(),
  })
  .strict();

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GoogleDriveProbeErrorCode = 'request_failed' | 'invalid_response';

export class GoogleDriveProbeError extends Error {
  constructor(
    readonly code: GoogleDriveProbeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleDriveProbeError';
  }
}

export async function listAppDataFolderForSpike(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ fileCount: number }> {
  const url =
    'https://www.googleapis.com/drive/v3/files' +
    '?spaces=appDataFolder&pageSize=1&fields=files(id%2Cname)%2CnextPageToken';
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new GoogleDriveProbeError(
      'request_failed',
      `Google Drive list failed with status ${response.status}.`,
    );
  }

  const parsed = driveListResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new GoogleDriveProbeError(
      'invalid_response',
      'Google Drive returned an invalid list response.',
    );
  }

  return { fileCount: parsed.data.files.length };
}
