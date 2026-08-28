import type { GoogleDriveAuthorization } from './authContract';

export const DEFAULT_HEADLESS_AUTHORIZATION_TIMEOUT_MS = 30_000;
export const HEADLESS_AUTHORIZATION_TIMEOUT_CODE = 'headless_authorization_timeout';

export type AuthSpikeEvidence = {
  adapter: 'nitro' | 'authorization_client';
  phase: 'interactive' | 'background';
  status: 'success' | 'failed';
  startedAt: string;
  completedAt: string;
  tokenAcquired: boolean;
  accountMetadataPresent: boolean;
  driveListSucceeded: boolean;
  fileCount?: number;
  errorCode?: string;
};

type BackgroundProbeDependencies = {
  authorizeHeadlessly(): Promise<GoogleDriveAuthorization>;
  listAppDataFolder(accessToken: string): Promise<{ fileCount: number }>;
  recordEvidence(evidence: AuthSpikeEvidence): Promise<unknown>;
  now(): string;
  headlessAuthorizationTimeoutMs?: number;
};

class HeadlessAuthorizationTimeoutError extends Error {
  code = HEADLESS_AUTHORIZATION_TIMEOUT_CODE;
}

async function authorizeHeadlesslyWithin(
  authorizeHeadlessly: () => Promise<GoogleDriveAuthorization>,
  timeoutMs: number,
): Promise<GoogleDriveAuthorization> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      authorizeHeadlessly(),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new HeadlessAuthorizationTimeoutError()),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export function safeAuthSpikeErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'unknown';
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : 'unknown';
}

export async function runGoogleDriveBackgroundAuthProbe(
  dependencies: BackgroundProbeDependencies,
): Promise<'success' | 'failed'> {
  const startedAt = dependencies.now();

  try {
    const authorization = await authorizeHeadlesslyWithin(
      dependencies.authorizeHeadlessly,
      dependencies.headlessAuthorizationTimeoutMs ?? DEFAULT_HEADLESS_AUTHORIZATION_TIMEOUT_MS,
    );
    const drive = await dependencies.listAppDataFolder(authorization.accessToken);
    await dependencies.recordEvidence({
      adapter: 'nitro',
      phase: 'background',
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
    return 'success';
  } catch (error) {
    await dependencies.recordEvidence({
      adapter: 'nitro',
      phase: 'background',
      status: 'failed',
      startedAt,
      completedAt: dependencies.now(),
      tokenAcquired: false,
      accountMetadataPresent: false,
      driveListSucceeded: false,
      errorCode: safeAuthSpikeErrorCode(error),
    });
    return 'failed';
  }
}
