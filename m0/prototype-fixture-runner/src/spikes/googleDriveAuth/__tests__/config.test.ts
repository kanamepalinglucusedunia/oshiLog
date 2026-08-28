import { GoogleDriveAuthSpikeConfigError, requireGoogleWebClientId } from '../config';

describe('Google Drive authorization spike configuration', () => {
  it('accepts a public Google Web OAuth client identifier', () => {
    expect(
      requireGoogleWebClientId('123456789-abc.apps.googleusercontent.com'),
    ).toBe('123456789-abc.apps.googleusercontent.com');
  });

  it.each([undefined, '', 'android-client-id', 'client-secret-value'])(
    'rejects missing or malformed client configuration: %p',
    (value) => {
      expect(() => requireGoogleWebClientId(value)).toThrow(
        new GoogleDriveAuthSpikeConfigError(
          'missing_web_client_id',
          'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to the Google Web OAuth client ID for this spike.',
        ),
      );
    },
  );
});
