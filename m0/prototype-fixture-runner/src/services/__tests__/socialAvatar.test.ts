import { File } from 'expo-file-system';
import {
  SocialAvatarError,
  fetchSocialAvatarPreview,
} from '@/services/socialAvatar';

const MAX_BYTES = 5 * 1024 * 1024;

function response(options: {
  status?: number;
  contentType?: string;
  contentLength?: number;
  bytes?: Uint8Array;
  json?: unknown;
}) {
  const status = options.status ?? 200;
  const bytes = options.bytes ?? new Uint8Array([1, 2, 3]);
  const headers = new Map<string, string>();
  if (options.contentType) headers.set('content-type', options.contentType);
  if (options.contentLength !== undefined) headers.set('content-length', String(options.contentLength));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    arrayBuffer: jest.fn(async () => bytes.buffer),
    text: jest.fn(async () => JSON.stringify(options.json ?? {})),
  };
}

describe('social avatar preview service', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_UNAVATAR_KEY = 'pk_test_publishable_key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not request invalid profile input', async () => {
    await expect(fetchSocialAvatarPreview({ platform: 'x', value: 'bad-name' }))
      .rejects.toMatchObject({ code: 'invalid-input' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requires a publishable key and never accepts a secret key', async () => {
    delete process.env.EXPO_PUBLIC_UNAVATAR_KEY;
    await expect(fetchSocialAvatarPreview({ platform: 'x', value: 'openai' }))
      .rejects.toMatchObject({ code: 'not-configured' });
    process.env.EXPO_PUBLIC_UNAVATAR_KEY = 'sk_server_secret';
    await expect(fetchSocialAvatarPreview({ platform: 'x', value: 'openai' }))
      .rejects.toMatchObject({ code: 'not-configured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('makes one bounded request with fallback=false and the publishable token', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ contentType: 'image/jpeg' }));

    const preview = await fetchSocialAvatarPreview({ platform: 'x', value: '@OpenAI' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://unavatar.io/x/openai?fallback=false&token=pk_test_publishable_key',
      expect.objectContaining({ credentials: 'omit', signal: expect.any(Object) }),
    );
    const options = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(options.headers).toEqual({ Accept: 'image/jpeg, image/png, image/webp' });
    expect((global.fetch as jest.Mock).mock.calls[0][0]).not.toContain('ttl=');
    preview.dispose();
  });

  test.each([
    ['image/jpeg', '.jpg'],
    ['image/png; charset=binary', '.png'],
    ['image/webp', '.webp'],
  ])('stages a unique %s response and disposes it idempotently', async (contentType, extension) => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ contentType }));

    const preview = await fetchSocialAvatarPreview({ platform: 'instagram', value: 'open.ai' });

    expect(preview.stagingUri).toContain('/staging/');
    expect(preview.stagingUri.endsWith(extension)).toBe(true);
    expect(preview.byteLength).toBe(3);
    expect(new File(preview.stagingUri).exists).toBe(true);
    preview.dispose();
    preview.dispose();
    expect(new File(preview.stagingUri).exists).toBe(false);
  });

  test.each([
    ['missing MIME', response({}) , 'invalid-response'],
    ['HTML response', response({ contentType: 'text/html' }), 'unsupported-image'],
    ['JSON response', response({ contentType: 'application/json' }), 'unsupported-image'],
    ['empty image', response({ contentType: 'image/png', bytes: new Uint8Array() }), 'invalid-response'],
    ['declared oversize', response({ contentType: 'image/png', contentLength: MAX_BYTES + 1 }), 'image-too-large'],
    ['actual oversize', response({ contentType: 'image/png', bytes: new Uint8Array(MAX_BYTES + 1) }), 'image-too-large'],
  ])('rejects %s', async (_label, mockResponse, code) => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
    await expect(fetchSocialAvatarPreview({ platform: 'tiktok', value: 'openai' }))
      .rejects.toMatchObject({ code });
  });

  test.each([
    { status: 404, json: undefined, code: 'not-found' },
    { status: 403, json: { code: 'EPRO' }, code: 'paid-provider' },
    { status: 429, json: { code: 'ERATE' }, code: 'rate-limited' },
    { status: 500, json: undefined, code: 'provider-failure' },
    { status: 418, json: undefined, code: 'invalid-response' },
  ])('maps provider status $status to $code', async ({ status, json, code }) => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ status, contentType: 'application/json', json }));
    await expect(fetchSocialAvatarPreview({ platform: 'x', value: 'openai' }))
      .rejects.toMatchObject({ code });
  });

  it('maps a network failure to offline without exposing its raw message', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('private provider detail'));
    await expect(fetchSocialAvatarPreview({ platform: 'x', value: 'openai' }))
      .rejects.toEqual(new SocialAvatarError('offline'));
  });

  it('distinguishes caller cancellation from the internal timeout', async () => {
    jest.useFakeTimers();
    const abortingFetch = jest.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    global.fetch = abortingFetch as unknown as typeof fetch;

    const caller = new AbortController();
    const cancelled = fetchSocialAvatarPreview({ platform: 'x', value: 'openai', signal: caller.signal });
    caller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: 'cancelled' });

    const timedOut = fetchSocialAvatarPreview({ platform: 'x', value: 'openai' });
    jest.advanceTimersByTime(15_000);
    await expect(timedOut).rejects.toMatchObject({ code: 'timeout' });
  });
});
