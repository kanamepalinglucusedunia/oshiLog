import { GoogleDriveProbeError, listAppDataFolderForSpike } from '../driveProbe';

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

describe('Google Drive appDataFolder spike probe', () => {
  it('lists only appDataFolder with the supplied bearer token', async () => {
    const fetchImpl = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => response(200, { files: [] }),
    );

    await expect(listAppDataFolderForSpike('drive-token', fetchImpl)).resolves.toEqual({
      fileCount: 0,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('/drive/v3/files?');
    expect(String(url)).toContain('spaces=appDataFolder');
    expect(String(url)).toContain('pageSize=1');
    expect(init).toEqual({
      method: 'GET',
      headers: { Authorization: 'Bearer drive-token' },
    });
  });

  it('rejects malformed Drive responses at the boundary', async () => {
    const fetchImpl = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response(200, { files: [{ id: 123, name: null }] }),
    );

    await expect(listAppDataFolderForSpike('drive-token', fetchImpl)).rejects.toEqual(
      new GoogleDriveProbeError('invalid_response', 'Google Drive returned an invalid list response.'),
    );
  });

  it('does not expose Drive response bodies or access tokens in errors', async () => {
    const fetchImpl = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response(401, { error: { message: 'private account data and drive-token' } }),
    );

    await expect(listAppDataFolderForSpike('drive-token', fetchImpl)).rejects.toMatchObject({
      code: 'request_failed',
      message: 'Google Drive list failed with status 401.',
    });
    await listAppDataFolderForSpike('drive-token', fetchImpl).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('drive-token');
      expect(message).not.toContain('private account data');
    });
  });
});
