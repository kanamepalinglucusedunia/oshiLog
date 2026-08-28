import * as Crypto from 'expo-crypto';

export function uuid(): string {
  return Crypto.randomUUID();
}

export async function sha256Hex(data: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data);
}
