import type { GoogleDriveAuthNativeModule } from './authContract';

type NitroUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

type NitroSuccessData = {
  user: NitroUser;
  scopes: string[];
  idToken: string;
  serverAuthCode?: string | null;
};

type NitroResponse = {
  type: 'success' | 'noSavedCredentialFound' | 'cancelled';
  data: NitroSuccessData | null;
};

export type NitroGoogleSignInLike = {
  configure(params: {
    webClientId: string;
    scopes: string[];
    offlineAccess: boolean;
    autoSelectOnSignIn: boolean;
  }): void;
  checkPlayServices(showErrorResolutionDialog?: boolean): Promise<void>;
  signIn(): Promise<NitroResponse>;
  createAccount(): Promise<NitroResponse>;
  presentExplicitSignIn(): Promise<NitroResponse>;
  getCurrentUser(): NitroSuccessData | null;
  getTokens(): Promise<{ idToken: string; accessToken: string }>;
  clearCachedAccessToken(accessToken: string): Promise<void>;
  signOut(): Promise<void>;
};

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function accountFrom(data: NitroSuccessData) {
  if (!data.user.id || !data.user.email) {
    throw new Error('Google sign-in returned incomplete account metadata.');
  }
  return {
    subject: data.user.id,
    email: data.user.email,
    ...(data.user.name ? { displayName: data.user.name } : {}),
  };
}

export function createNitroGoogleDriveAuthNativeModule(
  nitro: NitroGoogleSignInLike,
  webClientId: string,
): GoogleDriveAuthNativeModule {
  const configure = (scopes: readonly string[]) => {
    nitro.configure({
      webClientId,
      scopes: [...scopes],
      offlineAccess: false,
      autoSelectOnSignIn: true,
    });
  };

  return {
    async authorizeInteractively(scopes) {
      configure(scopes);
      await nitro.checkPlayServices();

      let response = await nitro.signIn();
      if (response.type === 'noSavedCredentialFound') {
        response = await nitro.createAccount();
      }
      if (response.type === 'noSavedCredentialFound') {
        response = await nitro.presentExplicitSignIn();
      }
      if (response.type !== 'success' || !response.data) {
        return { status: 'interaction_required' };
      }

      const tokens = await nitro.getTokens();
      return {
        status: 'success',
        accessToken: tokens.accessToken,
        account: accountFrom(response.data),
      };
    },

    async authorizeHeadlessly(scopes) {
      configure(scopes);
      const currentUser = nitro.getCurrentUser();
      if (!currentUser || !scopes.every((scope) => currentUser.scopes.includes(scope))) {
        return { status: 'interaction_required' };
      }

      try {
        const tokens = await nitro.getTokens();
        return {
          status: 'success',
          accessToken: tokens.accessToken,
          account: accountFrom(currentUser),
        };
      } catch (error) {
        if (isErrorCode(error, 'SIGN_IN_REQUIRED')) {
          return { status: 'interaction_required' };
        }
        throw error;
      }
    },

    async clearCachedAccessToken(accessToken) {
      await nitro.clearCachedAccessToken(accessToken);
    },

    async signOut() {
      await nitro.signOut();
    },
  };
}
