let mockUuidCounter = 0;

const mockFiles = new Map<string, string>();

jest.mock('expo-crypto', () => ({
  randomUUID: () => `test-uuid-${++mockUuidCounter}`,
  digestStringAsync: jest.fn(async () => 'test-hash'),
  digest: jest.fn(async () => new Uint8Array(32).buffer),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => {}),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', TIME_INTERVAL: 'timeInterval' },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'bare' },
  ExecutionEnvironment: { StoreClient: 'storeClient', Bare: 'bare', Standalone: 'standalone' },
}));

jest.mock('expo-task-manager', () => {
  const definedTasks = new Map<string, (...args: unknown[]) => unknown>();
  return {
    defineTask: jest.fn((name: string, executor: (...args: unknown[]) => unknown) => {
      definedTasks.set(name, executor);
    }),
    isTaskDefined: jest.fn((name: string) => definedTasks.has(name)),
    isTaskRegisteredAsync: jest.fn(async () => false),
  };
});

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
  triggerTaskWorkerForTestingAsync: jest.fn(async () => true),
  getStatusAsync: jest.fn(async () => 2),
}));

jest.mock('react-native-nitro-google-signin', () => ({
  GoogleOneTapSignIn: {
    configure: jest.fn(),
    checkPlayServices: jest.fn(async () => undefined),
    signIn: jest.fn(async () => ({ type: 'noSavedCredentialFound', data: null })),
    createAccount: jest.fn(async () => ({ type: 'noSavedCredentialFound', data: null })),
    presentExplicitSignIn: jest.fn(async () => ({ type: 'cancelled', data: null })),
    getCurrentUser: jest.fn(() => null),
    getTokens: jest.fn(async () => ({ idToken: '', accessToken: '' })),
    clearCachedAccessToken: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
  },
}));

jest.mock('expo-file-system', () => {
  const normalizeUri = (parts: unknown[]): string => {
    return parts
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && 'uri' in p) return String((p as { uri: unknown }).uri);
        return 'file:///mock';
      })
      .join('/');
  };

  return {
    File: class {
      uri: string;
      constructor(...parts: unknown[]) {
        this.uri = normalizeUri(parts);
      }
      get type() {
        if (this.uri.endsWith('.png')) return 'image/png';
        if (this.uri.endsWith('.mp4')) return 'video/mp4';
        return 'image/jpeg';
      }
      get size() {
        return 100;
      }
      get exists() {
        return mockFiles.has(this.uri) || mockFiles.has(this.uri.replace('file:///document/oshilog/', 'file:///document/oshilog/'));
      }
      copy(dest: { uri: string }) {
        if (mockFiles.has(this.uri)) mockFiles.set(dest.uri, mockFiles.get(this.uri)!);
      }
      delete() {
        mockFiles.delete(this.uri);
      }
      create() {}
      write(content: string) {
        mockFiles.set(this.uri, content);
      }
      textSync(): string {
        return mockFiles.get(this.uri) ?? '';
      }
      async base64() {
        return 'dGVzdA==';
      }
      open() {
        const bytes = new TextEncoder().encode(mockFiles.get(this.uri) ?? '');
        let cursor = 0;
        let closed = false;
        return {
          get offset() {
            return closed ? null : cursor;
          },
          set offset(value: number | null) {
            if (!closed && value !== null) cursor = value;
          },
          readBytes(length: number) {
            if (closed) throw new Error('File handle is closed');
            const chunk = bytes.slice(cursor, cursor + length);
            cursor += chunk.byteLength;
            return chunk;
          },
          close() {
            closed = true;
          },
        };
      }
    },
    Directory: class {
      uri: string;
      constructor(...parts: unknown[]) {
        this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
      }
      get exists() {
        return true;
      }
      create() {}
      delete() {}
      list() {
        return [];
      }
    },
    Paths: {
      document: { uri: 'file:///document' },
      cache: { uri: 'file:///cache' },
    },
    FileMode: { ReadOnly: 'r' },
  };
});

// Perspective warp uses react-native-skia natively; tests never execute the
// real module (perspective.ts is mocked where used), but keep the import from
// crashing suites that transitively load it.
jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Data: {},
    Image: {},
    Surface: {},
    Paint: jest.fn(() => ({ setAntiAlias: jest.fn(), setShader: jest.fn() })),
    Matrix: jest.fn(() => ({})),
    XYWHRect: jest.fn(() => ({})),
  },
  TileMode: { Clamp: 0, Repeat: 1, Mirror: 2, Decal: 3 },
  FilterMode: { Nearest: 0, Linear: 1 },
  MipmapMode: { None: 0, Nearest: 1, Linear: 2 },
  ImageFormat: { JPEG: 3, PNG: 4, WEBP: 6 },
}));
