import { TurboModuleRegistry } from 'react-native';
import { createGoogleDriveAuthSpike } from './authContract';
import { requireGoogleWebClientId } from './config';
import {
  createNitroGoogleDriveAuthNativeModule,
  type NitroGoogleSignInLike,
} from './nitroAdapter';

/**
 * The Nitro sign-in package throws during module evaluation when the native
 * NitroModules TurboModule is missing (Expo Go, or a dev build that predates
 * the package), and Metro reports that throw through `ErrorUtils` — it cannot
 * be suppressed from the call site. Probe the native module registry first so
 * a missing module degrades to a clean, caught Drive error instead.
 * `get()` is the non-throwing variant of the exact `getEnforcing('NitroModules')`
 * lookup the library performs internally.
 */
function isNitroModulesInstalled(): boolean {
  try {
    return TurboModuleRegistry.get('NitroModules') != null;
  } catch {
    return false;
  }
}

export async function createInstalledNitroGoogleDriveAuthSpike() {
  if (!isNitroModulesInstalled()) {
    throw new Error(
      'Google Drive backup needs a dev build with react-native-nitro-google-signin installed. Rebuild with `npx expo run:android` (Expo Go cannot run this library).',
    );
  }
  const { GoogleOneTapSignIn } = await import('react-native-nitro-google-signin');
  const webClientId = requireGoogleWebClientId(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
  const nativeModule = createNitroGoogleDriveAuthNativeModule(
    GoogleOneTapSignIn as NitroGoogleSignInLike,
    webClientId,
  );
  return createGoogleDriveAuthSpike(nativeModule);
}
