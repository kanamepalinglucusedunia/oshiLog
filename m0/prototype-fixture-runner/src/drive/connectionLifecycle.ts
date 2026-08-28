import type { DriveSecretStore } from './secretStore';
import type { DriveConnection } from './contracts';
import type { DriveRepo } from '@/repositories/drive';
import {
  GoogleDriveAuthSpikeError,
  type GoogleDriveAuthorization,
} from '@/spikes/googleDriveAuth/authContract';

export type DriveAuthAdapter = {
  authorizeInteractively(): Promise<GoogleDriveAuthorization>;
  authorizeHeadlessly(): Promise<GoogleDriveAuthorization>;
  clearCachedAccessToken(accessToken: string): Promise<void>;
  signOut(): Promise<void>;
};

export type DriveConnectionErrorCode = 'ACCOUNT_MISMATCH' | 'AUTH_REQUIRED';

export class DriveConnectionError extends Error {
  constructor(readonly code: DriveConnectionErrorCode, message: string) {
    super(message);
    this.name = 'DriveConnectionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type Dependencies = {
  repo: DriveRepo;
  auth: DriveAuthAdapter;
  secrets: Pick<DriveSecretStore, 'delete'>;
  now: () => string;
  deviceId: () => string;
  deviceLabel: () => string;
};

function isInteractionRequired(error: unknown): boolean {
  return error instanceof GoogleDriveAuthSpikeError && error.code === 'interaction_required';
}

export function createDriveConnectionLifecycle(dependencies: Dependencies) {
  const { repo, auth, secrets, now, deviceId, deviceLabel } = dependencies;

  const pause = (reason: 'disconnected' | 'auth_required'): void => {
    for (const schedule of repo.listSchedules()) {
      repo.updateSchedule({ ...schedule, pausedReason: reason });
    }
  };

  const persistAuthorization = async (
    authorization: GoogleDriveAuthorization,
    preservePause: boolean,
  ): Promise<DriveConnection> => {
    const current = repo.getConnection();
    if (
      current?.connectionState === 'connected' &&
      current.accountSubject &&
      current.accountSubject !== authorization.account.subject
    ) {
      await auth.signOut();
      throw new DriveConnectionError('ACCOUNT_MISMATCH', 'Disconnect the current Google account before connecting another account.');
    }
    const timestamp = now();
    return repo.saveConnection({
      id: 'primary',
      accountSubject: authorization.account.subject,
      accountEmail: authorization.account.email,
      accountDisplayName: authorization.account.displayName,
      deviceId: current?.deviceId ?? deviceId(),
      deviceLabel: current?.deviceLabel ?? deviceLabel(),
      connectionState: 'connected',
      schedulesPaused: preservePause,
      pauseReason: preservePause ? (current?.pauseReason ?? 'disconnected') : null,
      ownerLastCheckedAt: current?.ownerLastCheckedAt,
      connectedAt: timestamp,
      disconnectedAt: null,
      updatedAt: timestamp,
    });
  };

  const authorizeInteractive = async (preservePause: boolean) => {
    try {
      const authorization = await auth.authorizeInteractively();
      const connection = await persistAuthorization(authorization, preservePause);
      return { status: 'connected' as const, connection };
    } catch (error) {
      if (isInteractionRequired(error)) return { status: 'cancelled' as const };
      throw error;
    }
  };

  return {
    connect() {
      const current = repo.getConnection();
      return authorizeInteractive(Boolean(current?.schedulesPaused));
    },
    reconnect() {
      return authorizeInteractive(true);
    },
    async acquireAccessToken(): Promise<string> {
      try {
        const authorization = await auth.authorizeHeadlessly();
        const current = repo.getConnection();
        if (current?.accountSubject && current.accountSubject !== authorization.account.subject) {
          throw new DriveConnectionError('AUTH_REQUIRED', 'Google authorization must be confirmed again.');
        }
        return authorization.accessToken;
      } catch (error) {
        if (!isInteractionRequired(error) && !(error instanceof DriveConnectionError)) throw error;
        const current = repo.getConnection();
        if (current) {
          repo.saveConnection({
            ...current,
            connectionState: 'auth_required',
            schedulesPaused: true,
            pauseReason: 'auth_required',
            updatedAt: now(),
          });
        }
        pause('auth_required');
        throw new DriveConnectionError('AUTH_REQUIRED', 'Google authorization must be confirmed again.');
      }
    },
    async disconnect(): Promise<void> {
      for (const session of repo.listUploadSessions()) {
        await secrets.delete(session.sessionUriSecretKey);
        repo.deleteUploadSession(session.id);
      }
      await auth.signOut();
      const current = repo.getConnection();
      if (current) {
        repo.saveConnection({
          ...current,
          connectionState: 'disconnected',
          schedulesPaused: true,
          pauseReason: 'disconnected',
          disconnectedAt: now(),
          updatedAt: now(),
        });
      }
      pause('disconnected');
    },
    resumeSchedules(): void {
      const current = repo.getConnection();
      if (!current || current.connectionState !== 'connected') {
        throw new DriveConnectionError('AUTH_REQUIRED', 'Connect Google Drive before resuming schedules.');
      }
      repo.saveConnection({ ...current, schedulesPaused: false, pauseReason: null, updatedAt: now() });
      for (const schedule of repo.listSchedules()) repo.updateSchedule({ ...schedule, pausedReason: null });
    },
  };
}
