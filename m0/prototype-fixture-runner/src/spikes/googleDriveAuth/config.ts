const GOOGLE_WEB_CLIENT_ID = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;

export class GoogleDriveAuthSpikeConfigError extends Error {
  constructor(
    readonly code: 'missing_web_client_id',
    message: string,
  ) {
    super(message);
    this.name = 'GoogleDriveAuthSpikeConfigError';
  }
}

export function requireGoogleWebClientId(value: string | undefined): string {
  const clientId = value?.trim();
  if (!clientId || !GOOGLE_WEB_CLIENT_ID.test(clientId)) {
    throw new GoogleDriveAuthSpikeConfigError(
      'missing_web_client_id',
      'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to the Google Web OAuth client ID for this spike.',
    );
  }
  return clientId;
}
