export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export type GoogleDriveAuthAccount = {
  subject: string;
  email: string;
  displayName?: string;
};

type NativeAuthorizationResult =
  | {
      status: 'success';
      accessToken: string;
      account: GoogleDriveAuthAccount;
    }
  | { status: 'interaction_required' };

export type GoogleDriveAuthNativeModule = {
  authorizeInteractively(scopes: readonly string[]): Promise<NativeAuthorizationResult>;
  authorizeHeadlessly(scopes: readonly string[]): Promise<NativeAuthorizationResult>;
  clearCachedAccessToken(accessToken: string): Promise<void>;
  signOut(): Promise<void>;
};

export type GoogleDriveAuthorization = {
  accessToken: string;
  account: GoogleDriveAuthAccount;
};

export type GoogleDriveAuthSpikeErrorCode = 'interaction_required' | 'token_required';

export class GoogleDriveAuthSpikeError extends Error {
  constructor(
    readonly code: GoogleDriveAuthSpikeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleDriveAuthSpikeError';
  }
}

function requireToken(result: NativeAuthorizationResult): GoogleDriveAuthorization {
  if (result.status === 'interaction_required') {
    throw new GoogleDriveAuthSpikeError(
      'interaction_required',
      'Google authorization requires user interaction.',
    );
  }
  if (!result.accessToken) {
    throw new GoogleDriveAuthSpikeError(
      'token_required',
      'Google authorization returned no access token.',
    );
  }
  return { accessToken: result.accessToken, account: result.account };
}

export function createGoogleDriveAuthSpike(nativeModule: GoogleDriveAuthNativeModule) {
  return {
    async authorizeInteractively(): Promise<GoogleDriveAuthorization> {
      return requireToken(await nativeModule.authorizeInteractively([DRIVE_APPDATA_SCOPE]));
    },
    async authorizeHeadlessly(): Promise<GoogleDriveAuthorization> {
      return requireToken(await nativeModule.authorizeHeadlessly([DRIVE_APPDATA_SCOPE]));
    },
    async clearCachedAccessToken(accessToken: string): Promise<void> {
      await nativeModule.clearCachedAccessToken(accessToken);
    },
    async signOut(): Promise<void> {
      await nativeModule.signOut();
    },
  };
}
