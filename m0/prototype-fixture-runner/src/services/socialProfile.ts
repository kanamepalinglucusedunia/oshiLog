import type { SocialPlatform } from '@/types/domain';

export interface SocialPlatformConfig {
  label: string;
  hosts: readonly string[];
  usernamePattern: RegExp;
  maxLength: number;
  reservedUsernames: readonly string[];
  profileUrl(username: string): string;
  avatarUrl(username: string): string;
}

export interface NormalizedSocialProfile {
  platform: SocialPlatform;
  username: string;
  profileUrl: string;
  avatarUrl: string;
}

export class SocialProfileValidationError extends Error {
  readonly code = 'invalid-input';

  constructor(message = 'Enter a valid profile username or supported HTTPS profile URL.') {
    super(message);
    this.name = 'SocialProfileValidationError';
  }
}

export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = ['x', 'instagram', 'tiktok'];

export const SOCIAL_PLATFORM_CONFIG: Record<SocialPlatform, SocialPlatformConfig> = {
  x: {
    label: 'X',
    hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
    usernamePattern: /^[a-z0-9_]+$/i,
    maxLength: 15,
    reservedUsernames: ['home', 'explore', 'search', 'notifications', 'messages', 'settings', 'compose', 'intent'],
    profileUrl: (username) => `https://x.com/${username}`,
    avatarUrl: (username) => `https://unavatar.io/x/${encodeURIComponent(username)}?fallback=false`,
  },
  instagram: {
    label: 'Instagram',
    hosts: ['instagram.com', 'www.instagram.com'],
    usernamePattern: /^[a-z0-9._]+$/i,
    maxLength: 30,
    reservedUsernames: ['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct'],
    profileUrl: (username) => `https://www.instagram.com/${username}/`,
    avatarUrl: (username) => `https://unavatar.io/instagram/${encodeURIComponent(username)}?fallback=false`,
  },
  tiktok: {
    label: 'TikTok',
    hosts: ['tiktok.com', 'www.tiktok.com'],
    usernamePattern: /^[a-z0-9._]+$/i,
    maxLength: 24,
    reservedUsernames: [],
    profileUrl: (username) => `https://www.tiktok.com/@${username}`,
    avatarUrl: (username) => `https://unavatar.io/tiktok/${encodeURIComponent(username)}?fallback=false`,
  },
};

function usernameFromSupportedUrl(platform: SocialPlatform, input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new SocialProfileValidationError();
  }

  const config = SOCIAL_PLATFORM_CONFIG[platform];
  if (
    parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.port !== ''
    || !config.hosts.includes(parsed.hostname.toLowerCase())
  ) {
    throw new SocialProfileValidationError();
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length !== 1) throw new SocialProfileValidationError();

  const segment = decodeURIComponent(segments[0]);
  if (platform === 'tiktok') {
    if (!segment.startsWith('@') || segment.length === 1) throw new SocialProfileValidationError();
    return segment.slice(1);
  }
  return segment;
}

export function normalizeSocialProfileInput(
  platform: SocialPlatform,
  input: string,
): NormalizedSocialProfile | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const looksLikeUrl = trimmed.includes('://');
  const rawUsername = looksLikeUrl
    ? usernameFromSupportedUrl(platform, trimmed)
    : trimmed.replace(/^@/, '');
  const username = rawUsername.toLowerCase();
  const config = SOCIAL_PLATFORM_CONFIG[platform];

  if (
    !username
    || username.length > config.maxLength
    || !config.usernamePattern.test(username)
    || config.reservedUsernames.includes(username)
  ) {
    throw new SocialProfileValidationError(
      `${config.label} usernames may contain only supported letters, numbers, periods, or underscores and must be ${config.maxLength} characters or fewer.`,
    );
  }

  return {
    platform,
    username,
    profileUrl: config.profileUrl(username),
    avatarUrl: config.avatarUrl(username),
  };
}

export function usernameFromProfileUrl(
  platform: SocialPlatform,
  profileUrl: string | null,
): string | null {
  if (!profileUrl) return null;
  try {
    const normalized = normalizeSocialProfileInput(platform, profileUrl);
    return normalized?.profileUrl === profileUrl ? normalized.username : null;
  } catch {
    return null;
  }
}
