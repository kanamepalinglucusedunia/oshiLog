import type { GoogleDriveAuthorization } from '../authContract';
import { runGoogleDriveBackgroundAuthProbe, type AuthSpikeEvidence } from '../backgroundProbe';

const authorization: GoogleDriveAuthorization = {
  accessToken: 'secret-drive-token',
  account: {
    subject: 'private-subject',
    email: 'private@example.test',
    displayName: 'Private Name',
  },
};

describe('Google Drive background authorization probe', () => {
  it('records redacted success evidence after headless token acquisition and Drive listing', async () => {
    const recorded: AuthSpikeEvidence[] = [];

    await expect(
      runGoogleDriveBackgroundAuthProbe({
        authorizeHeadlessly: jest.fn(async () => authorization),
        listAppDataFolder: jest.fn(async () => ({ fileCount: 1 })),
        recordEvidence: jest.fn(async (evidence) => recorded.push(evidence)),
        now: jest
          .fn()
          .mockReturnValueOnce('2026-08-16T01:00:00.000Z')
          .mockReturnValueOnce('2026-08-16T01:00:01.000Z'),
      }),
    ).resolves.toBe('success');

    expect(recorded).toEqual([
      {
        adapter: 'nitro',
        phase: 'background',
        status: 'success',
        startedAt: '2026-08-16T01:00:00.000Z',
        completedAt: '2026-08-16T01:00:01.000Z',
        tokenAcquired: true,
        accountMetadataPresent: true,
        driveListSucceeded: true,
        fileCount: 1,
      },
    ]);
    expect(JSON.stringify(recorded)).not.toContain('secret-drive-token');
    expect(JSON.stringify(recorded)).not.toContain('private@example.test');
    expect(JSON.stringify(recorded)).not.toContain('private-subject');
  });

  it('records only a safe code when headless authorization fails', async () => {
    const recorded: AuthSpikeEvidence[] = [];

    await expect(
      runGoogleDriveBackgroundAuthProbe({
        authorizeHeadlessly: jest.fn(async () => {
          throw {
            code: 'IN_PROGRESS',
            message: 'No Activity; secret-drive-token; private@example.test',
          };
        }),
        listAppDataFolder: jest.fn(),
        recordEvidence: jest.fn(async (evidence) => recorded.push(evidence)),
        now: jest
          .fn()
          .mockReturnValueOnce('2026-08-16T01:00:00.000Z')
          .mockReturnValueOnce('2026-08-16T01:00:01.000Z'),
      }),
    ).resolves.toBe('failed');

    expect(recorded[0]).toMatchObject({
      adapter: 'nitro',
      phase: 'background',
      status: 'failed',
      tokenAcquired: false,
      driveListSucceeded: false,
      errorCode: 'IN_PROGRESS',
    });
    expect(JSON.stringify(recorded)).not.toContain('secret-drive-token');
    expect(JSON.stringify(recorded)).not.toContain('private@example.test');
    expect(JSON.stringify(recorded)).not.toContain('No Activity');
  });

  it('records a bounded safe failure when headless authorization never settles', async () => {
    jest.useFakeTimers();
    const recorded: AuthSpikeEvidence[] = [];

    try {
      const result = runGoogleDriveBackgroundAuthProbe({
        authorizeHeadlessly: jest.fn(() => new Promise<GoogleDriveAuthorization>(() => undefined)),
        listAppDataFolder: jest.fn(),
        recordEvidence: jest.fn(async (evidence) => recorded.push(evidence)),
        now: jest
          .fn()
          .mockReturnValueOnce('2026-08-16T01:00:00.000Z')
          .mockReturnValueOnce('2026-08-16T01:00:01.000Z'),
        headlessAuthorizationTimeoutMs: 1,
      });

      await jest.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBe('failed');
    } finally {
      jest.useRealTimers();
    }

    expect(recorded[0]).toMatchObject({
      adapter: 'nitro',
      phase: 'background',
      status: 'failed',
      tokenAcquired: false,
      driveListSucceeded: false,
      errorCode: 'headless_authorization_timeout',
    });
  });
});
