import { File } from 'expo-file-system';
import { STAGING_DIR, ensureAppDirs } from '@/services/media';
import {
  SocialProfileValidationError,
  normalizeSocialProfileInput,
  type NormalizedSocialProfile,
} from '@/services/socialProfile';
import type { SocialPlatform } from '@/types/domain';
import { uuid } from '@/utils/id';

export type SocialAvatarErrorCode =
  | 'invalid-input'
  | 'not-configured'
  | 'not-found'
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'rate-limited'
  | 'paid-provider'
  | 'provider-failure'
  | 'invalid-response'
  | 'unsupported-image'
  | 'image-too-large';

export class SocialAvatarError extends Error {
  constructor(readonly code: SocialAvatarErrorCode) {
    super(errorMessage(code));
    this.name = 'SocialAvatarError';
  }
}

export interface SocialAvatarPreview {
  profile: NormalizedSocialProfile;
  stagingUri: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteLength: number;
  dispose: () => void;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

function errorMessage(code: SocialAvatarErrorCode): string {
  const messages: Record<SocialAvatarErrorCode, string> = {
    'invalid-input': 'Enter a valid username or supported profile URL.',
    'not-configured': 'Profile photo import is not configured.',
    'not-found': 'No profile photo was found for this account.',
    'offline': 'Could not connect. Check your internet connection and try again.',
    'timeout': 'The profile photo request timed out. Try again.',
    'cancelled': 'Profile photo request cancelled.',
    'rate-limited': 'Too many profile photo requests. Try again later.',
    'paid-provider': 'This social network is unavailable for the configured plan.',
    'provider-failure': 'The profile photo service is temporarily unavailable.',
    'invalid-response': 'The profile photo service returned an invalid response.',
    'unsupported-image': 'The returned profile photo format is not supported.',
    'image-too-large': 'The profile photo is larger than 5 MB.',
  };
  return messages[code];
}

function readPublishableKey(): string {
  const key = process.env.EXPO_PUBLIC_UNAVATAR_KEY?.trim() ?? '';
  if (!key.startsWith('pk_') || key.length <= 3) throw new SocialAvatarError('not-configured');
  return key;
}

async function providerErrorCode(response: Response): Promise<string | null> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  const declaredLength = Number(response.headers.get('content-length'));
  if (contentType !== 'application/json' || (Number.isFinite(declaredLength) && declaredLength > MAX_ERROR_BYTES)) {
    return null;
  }
  try {
    const body = (await response.text()).slice(0, MAX_ERROR_BYTES);
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'code' in parsed && typeof parsed.code === 'string') {
      return parsed.code;
    }
  } catch {
    // Error bodies are untrusted and optional; status-based mapping still applies.
  }
  return null;
}

async function mapProviderFailure(response: Response): Promise<SocialAvatarError> {
  const providerCode = await providerErrorCode(response);
  if (response.status === 404) return new SocialAvatarError('not-found');
  if (response.status === 403 && providerCode === 'EPRO') return new SocialAvatarError('paid-provider');
  if (response.status === 429 || providerCode === 'ERATE') return new SocialAvatarError('rate-limited');
  if (response.status >= 500) return new SocialAvatarError('provider-failure');
  return new SocialAvatarError('invalid-response');
}

function safeDelete(file: File | null): void {
  if (!file) return;
  try {
    if (file.exists) file.delete();
  } catch {
    // Staging cleanup is best-effort and must not mask the primary result.
  }
}

export async function fetchSocialAvatarPreview(input: {
  platform: SocialPlatform;
  value: string;
  signal?: AbortSignal;
}): Promise<SocialAvatarPreview> {
  let profile: NormalizedSocialProfile | null;
  try {
    profile = normalizeSocialProfileInput(input.platform, input.value);
  } catch (error) {
    if (error instanceof SocialProfileValidationError || error instanceof URIError) {
      throw new SocialAvatarError('invalid-input');
    }
    throw error;
  }
  if (!profile) throw new SocialAvatarError('invalid-input');

  const publishableKey = readPublishableKey();
  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => controller.abort();
  if (input.signal?.aborted) throw new SocialAvatarError('cancelled');
  input.signal?.addEventListener('abort', onCallerAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let stagingFile: File | null = null;
  try {
    const response = await fetch(
      `${profile.avatarUrl}&token=${encodeURIComponent(publishableKey)}`,
      {
        credentials: 'omit',
        headers: { Accept: 'image/jpeg, image/png, image/webp' },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw await mapProviderFailure(response);

    const mimeType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (!mimeType) throw new SocialAvatarError('invalid-response');
    if (!(mimeType in MIME_EXTENSIONS)) throw new SocialAvatarError('unsupported-image');

    const declaredLengthHeader = response.headers.get('content-length');
    if (declaredLengthHeader !== null) {
      const declaredLength = Number(declaredLengthHeader);
      if (!Number.isFinite(declaredLength) || declaredLength < 0) throw new SocialAvatarError('invalid-response');
      if (declaredLength > MAX_IMAGE_BYTES) throw new SocialAvatarError('image-too-large');
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) throw new SocialAvatarError('invalid-response');
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new SocialAvatarError('image-too-large');

    ensureAppDirs();
    const acceptedMime = mimeType as keyof typeof MIME_EXTENSIONS;
    stagingFile = new File(STAGING_DIR, `social-avatar-${uuid()}.${MIME_EXTENSIONS[acceptedMime]}`);
    stagingFile.create({ intermediates: true, overwrite: false });
    stagingFile.write(bytes);
    let disposed = false;

    return {
      profile,
      stagingUri: stagingFile.uri,
      mimeType: acceptedMime,
      byteLength: bytes.byteLength,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        safeDelete(stagingFile);
      },
    };
  } catch (error) {
    safeDelete(stagingFile);
    if (error instanceof SocialAvatarError) throw error;
    if (input.signal?.aborted) throw new SocialAvatarError('cancelled');
    if (timedOut) throw new SocialAvatarError('timeout');
    throw new SocialAvatarError('offline');
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener('abort', onCallerAbort);
  }
}
