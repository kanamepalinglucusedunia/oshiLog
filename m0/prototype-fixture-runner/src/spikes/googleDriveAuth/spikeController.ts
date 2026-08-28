import {
  GoogleDriveAuthSpikeError,
  createGoogleDriveAuthSpike,
} from './authContract';
import { safeAuthSpikeErrorCode, type AuthSpikeEvidence } from './backgroundProbe';

type GoogleDriveAuthSpike = ReturnType<typeof createGoogleDriveAuthSpike>;

type SpikeControllerDependencies = {
  auth: GoogleDriveAuthSpike;
  listAppDataFolder(accessToken: string): Promise<{ fileCount: number }>;
  recordEvidence(evidence: AuthSpikeEvidence): Promise<unknown>;
  registerBackgroundProbe(): Promise<void>;
  triggerBackgroundProbe(): Promise<boolean>;
  now(): string;
};

export function createGoogleDriveAuthSpikeController(dependencies: SpikeControllerDependencies) {
  let lastAccessToken: string | null = null;

  return {
    async runInteractiveProbe() {
      const startedAt = dependencies.now();
      try {
        const authorization = await dependencies.auth.authorizeInteractively();
        const drive = await dependencies.listAppDataFolder(authorization.accessToken);
        lastAccessToken = authorization.accessToken;
        await dependencies.recordEvidence({
          adapter: 'nitro',
          phase: 'interactive',
          status: 'success',
          startedAt,
          completedAt: dependencies.now(),
          tokenAcquired: true,
          accountMetadataPresent: Boolean(
            authorization.account.subject && authorization.account.email,
          ),
          driveListSucceeded: true,
          fileCount: drive.fileCount,
        });
        return {
          accountMetadataPresent: Boolean(
            authorization.account.subject && authorization.account.email,
          ),
          fileCount: drive.fileCount,
        };
      } catch (error) {
        await dependencies.recordEvidence({
          adapter: 'nitro',
          phase: 'interactive',
          status: 'failed',
          startedAt,
          completedAt: dependencies.now(),
          tokenAcquired: false,
          accountMetadataPresent: false,
          driveListSucceeded: false,
          errorCode: safeAuthSpikeErrorCode(error),
        });
        throw error;
      }
    },

    async clearLastCachedAccessToken(): Promise<void> {
      if (!lastAccessToken) {
        throw new GoogleDriveAuthSpikeError(
          'token_required',
          'Run the interactive authorization probe before clearing its cached token.',
        );
      }
      await dependencies.auth.clearCachedAccessToken(lastAccessToken);
      lastAccessToken = null;
    },

    async triggerRegisteredBackgroundProbe(): Promise<boolean> {
      await dependencies.registerBackgroundProbe();
      return dependencies.triggerBackgroundProbe();
    },
  };
}
