import {
  DRIVE_APPDATA_SCOPE,
  GoogleDriveAuthSpikeError,
  createGoogleDriveAuthSpike,
  type GoogleDriveAuthNativeModule,
} from '../authContract';

function createFakeNativeModule(
  overrides: Partial<GoogleDriveAuthNativeModule> = {},
): jest.Mocked<GoogleDriveAuthNativeModule> {
  const nativeModule: GoogleDriveAuthNativeModule = {
    authorizeInteractively: jest.fn(async (_scopes: readonly string[]) => ({
      status: 'success' as const,
      accessToken: 'interactive-token',
      account: {
        subject: 'account-subject',
        email: 'owner@example.test',
        displayName: 'Test Owner',
      },
    })),
    authorizeHeadlessly: jest.fn(async (_scopes: readonly string[]) => ({
      status: 'success' as const,
      accessToken: 'headless-token',
      account: {
        subject: 'account-subject',
        email: 'owner@example.test',
        displayName: 'Test Owner',
      },
    })),
    clearCachedAccessToken: jest.fn(async (_accessToken: string) => undefined),
    signOut: jest.fn(async () => undefined),
    ...overrides,
  };
  return nativeModule as jest.Mocked<GoogleDriveAuthNativeModule>;
}

describe('Google Drive authorization spike contract', () => {
  it('requests only drive.appdata during interactive authorization', async () => {
    const nativeModule = createFakeNativeModule();
    const auth = createGoogleDriveAuthSpike(nativeModule);

    await expect(auth.authorizeInteractively()).resolves.toEqual({
      accessToken: 'interactive-token',
      account: {
        subject: 'account-subject',
        email: 'owner@example.test',
        displayName: 'Test Owner',
      },
    });
    expect(nativeModule.authorizeInteractively).toHaveBeenCalledWith([DRIVE_APPDATA_SCOPE]);
  });

  it('does not fall back to interactive UI during headless authorization', async () => {
    const nativeModule = createFakeNativeModule({
      authorizeHeadlessly: jest.fn(async () => ({ status: 'interaction_required' as const })),
    });
    const auth = createGoogleDriveAuthSpike(nativeModule);

    await expect(auth.authorizeHeadlessly()).rejects.toMatchObject({
      name: 'GoogleDriveAuthSpikeError',
      code: 'interaction_required',
    });
    expect(nativeModule.authorizeHeadlessly).toHaveBeenCalledWith([DRIVE_APPDATA_SCOPE]);
    expect(nativeModule.authorizeInteractively).not.toHaveBeenCalled();
  });

  it('maps a successful native response without a token to token_required', async () => {
    const nativeModule = createFakeNativeModule({
      authorizeHeadlessly: jest.fn(async () => ({
        status: 'success' as const,
        accessToken: '',
        account: {
          subject: 'account-subject',
          email: 'owner@example.test',
        },
      })),
    });
    const auth = createGoogleDriveAuthSpike(nativeModule);

    await expect(auth.authorizeHeadlessly()).rejects.toEqual(
      new GoogleDriveAuthSpikeError('token_required', 'Google authorization returned no access token.'),
    );
  });

  it('clears a cached access token without persisting or returning it', async () => {
    const nativeModule = createFakeNativeModule();
    const auth = createGoogleDriveAuthSpike(nativeModule);

    await expect(auth.clearCachedAccessToken('stale-token')).resolves.toBeUndefined();
    expect(nativeModule.clearCachedAccessToken).toHaveBeenCalledWith('stale-token');
  });
});
