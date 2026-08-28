import {
  SocialProfileValidationError,
  normalizeSocialProfileInput,
  usernameFromProfileUrl,
} from '@/services/socialProfile';

describe('social profile normalization', () => {
  test.each([
    ['x', '  @OpenAI  ', 'openai', 'https://x.com/openai', 'https://unavatar.io/x/openai?fallback=false'],
    ['instagram', 'Open.AI', 'open.ai', 'https://www.instagram.com/open.ai/', 'https://unavatar.io/instagram/open.ai?fallback=false'],
    ['tiktok', '@Open_AI', 'open_ai', 'https://www.tiktok.com/@open_ai', 'https://unavatar.io/tiktok/open_ai?fallback=false'],
  ] as const)('normalizes %s usernames', (platform, input, username, profileUrl, avatarUrl) => {
    expect(normalizeSocialProfileInput(platform, input)).toEqual({
      platform,
      username,
      profileUrl,
      avatarUrl,
    });
  });

  test.each([
    ['x', 'https://x.com/OpenAI', 'https://x.com/openai'],
    ['x', 'https://www.twitter.com/OpenAI?lang=en#top', 'https://x.com/openai'],
    ['instagram', 'https://instagram.com/Open.AI/', 'https://www.instagram.com/open.ai/'],
    ['tiktok', 'https://www.tiktok.com/@Open_AI?lang=en', 'https://www.tiktok.com/@open_ai'],
  ] as const)('accepts supported %s profile URLs', (platform, input, profileUrl) => {
    expect(normalizeSocialProfileInput(platform, input)?.profileUrl).toBe(profileUrl);
  });

  it('returns null for an empty optional value', () => {
    expect(normalizeSocialProfileInput('x', '   ')).toBeNull();
  });

  test.each([
    ['x', 'http://x.com/openai'],
    ['x', 'https://example.com/openai'],
    ['x', 'https://x.com/openai/status/123'],
    ['x', 'https://x.com/search'],
    ['x', 'https://user:password@x.com/openai'],
    ['x', 'https://x.com:444/openai'],
    ['instagram', 'https://www.instagram.com/reel/abc'],
    ['instagram', 'https://www.instagram.com/reels'],
    ['instagram', 'https://www.instagram.com/openai/p/abc'],
    ['tiktok', 'https://www.tiktok.com/@openai/video/123'],
    ['tiktok', 'https://www.tiktok.com/share/user/123'],
    ['x', 'invalid-name'],
    ['instagram', 'invalid name'],
    ['tiktok', 'invalid@name'],
    ['x', 'abcdefghijklmnop'],
    ['instagram', 'abcdefghijklmnopqrstuvwxyz12345'],
    ['tiktok', 'abcdefghijklmnopqrstuvwxy'],
  ] as const)('rejects invalid %s input: %s', (platform, input) => {
    expect(() => normalizeSocialProfileInput(platform, input)).toThrow(SocialProfileValidationError);
  });

  test.each([
    ['x', 'https://x.com/openai', 'openai'],
    ['instagram', 'https://www.instagram.com/open.ai/', 'open.ai'],
    ['tiktok', 'https://www.tiktok.com/@open_ai', 'open_ai'],
  ] as const)('round-trips canonical %s URLs', (platform, url, username) => {
    expect(usernameFromProfileUrl(platform, url)).toBe(username);
  });

  it('does not derive usernames from empty or non-canonical stored values', () => {
    expect(usernameFromProfileUrl('x', null)).toBeNull();
    expect(usernameFromProfileUrl('x', 'https://twitter.com/openai')).toBeNull();
    expect(usernameFromProfileUrl('instagram', 'https://example.com/openai')).toBeNull();
  });
});
