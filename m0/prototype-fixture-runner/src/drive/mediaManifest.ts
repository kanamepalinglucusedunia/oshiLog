import { z } from 'zod';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const mediaManifestEntrySchema = z.object({
  id: z.string().min(1).max(500),
  role: z.string().min(1).max(100),
  blobSha256: z.string().regex(SHA256_PATTERN).nullable(),
  byteSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(500).nullable(),
  missing: z.boolean(),
}).strict();

export const mediaManifestSchema = z.object({
  formatVersion: z.literal(1),
  snapshotId: z.string().min(1).max(500),
  batchId: z.string().min(1).max(500).optional(),
  category: z.literal('media'),
  createdAt: z.string().datetime({ offset: true }),
  appVersion: z.string().min(1).max(100),
  schemaVersion: z.number().int().positive(),
  deviceId: z.string().min(1).max(500),
  deviceLabel: z.string().min(1).max(500),
  contentFingerprint: z.string().regex(SHA256_PATTERN),
  entries: z.array(mediaManifestEntrySchema).max(250_000),
}).strict();

export type MediaManifest = z.infer<typeof mediaManifestSchema>;
