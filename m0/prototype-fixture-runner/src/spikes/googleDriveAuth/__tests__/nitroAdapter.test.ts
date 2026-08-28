import { DRIVE_APPDATA_SCOPE } from '../authContract';
import {
  createNitroGoogleDriveAuthNativeModule,
  type NitroGoogleSignInLike,
} from '../nitroAdapter';

function successfulUser() {
  return {
    user: {
      id: 'account-subject',
      email: 'owner@example.test',
      name: 'Test Owner',
    },
    scopes: [DRIVE_APPDATA_SCOPE],
    idToken: 'id-token',
    serverAuthCode: null,
  };
}

function createFakeNitro(
  overrides: Partial<NitroGoogleSignInLike> = {},
): jest.Mocked<NitroGoogleSignInLike> {
  const nitro: NitroGoogleSignInLike = {
    configure: jest.fn((_params: Parameters<NitroGoogleSignInLike['configure']>[0]) => undefined),
    checkPlayServices: jest.fn(async (_showErrorResolutionDialog?: boolean) => undefined),
    signIn: jest.fn(async () => ({ type: 'success' as const, data: successfulUser() })),
    createAccount: jest.fn(async () => ({ type: 'success' as const, data: successfulUser() })),
    presentExplicitSignIn: jest.fn(async () => ({ type: 'success' as const, data: successfulUser() })),
    getCurrentUser: jest.fn(() => successfulUser()),
    getTokens: jest.fn(async () => ({ idToken: 'id-token', accessToken: 'drive-token' })),
    clearCachedAccessToken: jest.fn(async (_accessToken: string) => undefined),
    signOut: jest.fn(async () => undefined),
    ...overrides,
  };
  return nitro as jest.Mocked<NitroGoogleSignInLike>;
}

describe('Nitro Google Drive authorization spike adapter', () => {
  it('uses interactive account selection only when silent sign-in has no saved credential', async () => {
    const nitro = createFakeNitro({
      signIn: jest.fn(async () => ({ type: 'noSavedCredentialFound' as const, data: null })),
    });
    const adapter = createNitroGoogleDriveAuthNativeModule(nitro, 'web-client-id');

    await expect(adapter.authorizeInteractively([DRIVE_APPDATA_SCOPE])).resolves.toMatchObject({
      status: 'success',
      accessToken: 'drive-token',
      account: { subject: 'account-subject', email: 'owner@example.test' },
    });
    expect(nitro.configure).toHaveBeenCalledWith({
      webClientId: 'web-client-id',
      scopes: [DRIVE_APPDATA_SCOPE],
      offlineAccess: false,
      autoSelectOnSignIn: true,
    });
    expect(nitro.createAccount).toHaveBeenCalledTimes(1);
    expect(nitro.presentExplicitSignIn).not.toHaveBeenCalled();
  });

  it('returns interaction_required when every interactive sign-in route is unavailable', async () => {
    const noCredential = { type: 'noSavedCredentialFound' as const, data: null };
    const nitro = createFakeNitro({
      signIn: jest.fn(async () => noCredential),
      createAccount: jest.fn(async () => noCredential),
      presentExplicitSignIn: jest.fn(async () => noCredential),
    });
    const adapter = createNitroGoogleDriveAuthNativeModule(nitro, 'web-client-id');

    await expect(adapter.authorizeInteractively([DRIVE_APPDATA_SCOPE])).resolves.toEqual({
      status: 'interaction_required',
    });
    expect(nitro.presentExplicitSignIn).toHaveBeenCalledTimes(1);
    expect(nitro.getTokens).not.toHaveBeenCalled();
  });

  it('reacquires a token headlessly without invoking any sign-in UI method', async () => {
    const nitro = createFakeNitro();
    const adapter = createNitroGoogleDriveAuthNativeModule(nitro, 'web-client-id');

    await expect(adapter.authorizeHeadlessly([DRIVE_APPDATA_SCOPE])).resolves.toMatchObject({
      status: 'success',
      accessToken: 'drive-token',
      account: { subject: 'account-subject' },
    });
    expect(nitro.getTokens).toHaveBeenCalledTimes(1);
    expect(nitro.signIn).not.toHaveBeenCalled();
    expect(nitro.createAccount).not.toHaveBeenCalled();
    expect(nitro.presentExplicitSignIn).not.toHaveBeenCalled();
  });

  it('maps a missing signed-in session to interaction_required without opening UI', async () => {
    const nitro = createFakeNitro({ getCurrentUser: jest.fn(() => null) });
    const adapter = createNitroGoogleDriveAuthNativeModule(nitro, 'web-client-id');

    await expect(adapter.authorizeHeadlessly([DRIVE_APPDATA_SCOPE])).resolves.toEqual({
      status: 'interaction_required',
    });
    expect(nitro.getTokens).not.toHaveBeenCalled();
    expect(nitro.signIn).not.toHaveBeenCalled();
  });

  it('maps Nitro SIGN_IN_REQUIRED to interaction_required', async () => {
    const nitro = createFakeNitro({
      getTokens: jest.fn(async () => {
        throw { code: 'SIGN_IN_REQUIRED', message: 'Sign in first' };
      }),
    });
    const adapter = createNitroGoogleDriveAuthNativeModule(nitro, 'web-client-id');

    await expect(adapter.authorizeHeadlessly([DRIVE_APPDATA_SCOPE])).resolves.toEqual({
      status: 'interaction_required',
    });
  });

  it('clears the native credential session on sign out', async () => {
    const nitro = createFakeNitro();
    const adapter = createNitroGoogleDriveAuthNativeModule(nitro, 'web-client-id');

    await adapter.signOut();

    expect(nitro.signOut).toHaveBeenCalledTimes(1);
  });
});
