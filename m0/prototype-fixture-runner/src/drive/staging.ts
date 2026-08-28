import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { BackupManifest } from '@/services/backup';

const DEFAULT_CHUNK_BYTES = 1024 * 1024;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeJson(item)]),
    );
  }
  throw new Error('Canonical backup content contains an unsupported value.');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hashText(value: string): string {
  return hex(sha256(utf8ToBytes(value)));
}

function sortedRecords(records: BackupManifest['records']): BackupManifest['records'] {
  return Object.fromEntries(
    Object.entries(records)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([table, rows]) => [table, [...rows].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))]),
  );
}

export type DataArtifact = {
  json: string;
  bytes: number;
  itemCount: number;
  fingerprint: string;
  contentSha256: string;
  createdAt?: string;
  appVersion?: string;
  schemaVersion?: number;
  deviceLabel?: string;
};

export async function buildDataArtifact(manifest: BackupManifest): Promise<DataArtifact> {
  if (manifest.category !== 'data') throw new Error('Data staging requires a Data backup manifest.');
  const records = sortedRecords(manifest.records);
  const normalizedManifest = { ...manifest, records };
  const json = stableStringify(normalizedManifest);
  const fingerprintPayload = {
    ...normalizedManifest,
    createdAt: undefined,
    deviceLabel: undefined,
    checksums: undefined,
  };
  return {
    json,
    bytes: utf8ToBytes(json).byteLength,
    itemCount: Object.values(records).reduce((total, rows) => total + rows.length, 0),
    fingerprint: hashText(stableStringify(fingerprintPayload)),
    contentSha256: hashText(json),
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    schemaVersion: manifest.schemaVersion,
    deviceLabel: manifest.deviceLabel,
  };
}

export type MediaSource = {
  id: string;
  role: string;
  path: string | null;
  mimeType?: string | null;
  contentHash: string | null;
  size: number | null;
};

export type MediaInventoryEntry = {
  id: string;
  role: string;
  localPath: string | null;
  mimeType: string | null;
  contentHash: string | null;
  size: number;
  missing: boolean;
};

export type ChunkedFileReader = {
  stat(path: string): Promise<{ exists: boolean; size: number }>;
  readChunk(path: string, offset: number, length: number): Promise<Uint8Array>;
};

async function hashFile(path: string, size: number, reader: ChunkedFileReader, chunkBytes: number): Promise<string> {
  const hash = sha256.create();
  let offset = 0;
  while (offset < size) {
    const length = Math.min(chunkBytes, size - offset);
    const chunk = await reader.readChunk(path, offset, length);
    if (chunk.byteLength === 0 || chunk.byteLength > length) throw new Error('Media file changed while it was being hashed.');
    hash.update(chunk);
    offset += chunk.byteLength;
  }
  return hex(hash.digest());
}

export async function buildMediaInventory(
  sources: readonly MediaSource[],
  reader: ChunkedFileReader,
  options: {
    chunkBytes?: number;
    saveHash?: (id: string, hash: string, size: number) => Promise<void>;
  } = {},
) {
  const chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) throw new Error('Invalid media hash chunk size.');
  const entries: MediaInventoryEntry[] = [];
  for (const source of [...sources].sort((left, right) => `${left.id}\0${left.role}`.localeCompare(`${right.id}\0${right.role}`))) {
    if (!source.path) {
      entries.push({ id: source.id, role: source.role, localPath: null, mimeType: source.mimeType ?? null, contentHash: source.contentHash, size: source.size ?? 0, missing: true });
      continue;
    }
    let stat: Awaited<ReturnType<ChunkedFileReader['stat']>>;
    try {
      stat = await reader.stat(source.path);
    } catch {
      entries.push({ id: source.id, role: source.role, localPath: source.path, mimeType: source.mimeType ?? null, contentHash: null, size: source.size ?? 0, missing: true });
      continue;
    }
    if (!stat.exists) {
      entries.push({ id: source.id, role: source.role, localPath: source.path, mimeType: source.mimeType ?? null, contentHash: null, size: source.size ?? 0, missing: true });
      continue;
    }
    if (stat.size === 0) {
      entries.push({ id: source.id, role: source.role, localPath: source.path, mimeType: source.mimeType ?? null, contentHash: null, size: 0, missing: true });
      continue;
    }
    const canReuseHash = source.contentHash !== null && source.size === stat.size;
    let contentHash: string;
    try {
      contentHash = canReuseHash ? source.contentHash! : await hashFile(source.path, stat.size, reader, chunkBytes);
    } catch (error) {
      if (error instanceof Error && /changed while/i.test(error.message)) throw error;
      entries.push({ id: source.id, role: source.role, localPath: source.path, mimeType: source.mimeType ?? null, contentHash: null, size: stat.size, missing: true });
      continue;
    }
    if (!canReuseHash) await options.saveHash?.(source.id, contentHash, stat.size);
    entries.push({ id: source.id, role: source.role, localPath: source.path, mimeType: source.mimeType ?? null, contentHash, size: stat.size, missing: false });
  }
  const canonicalEntries = entries.map(({ id, role, mimeType, contentHash, size, missing }) => ({ id, role, mimeType, contentHash, size, missing }));
  return {
    entries,
    fingerprint: hashText(stableStringify(canonicalEntries)),
    totalBytes: entries.reduce((total, entry) => total + (entry.missing ? 0 : entry.size), 0),
    missingCount: entries.filter((entry) => entry.missing).length,
  };
}

export function createStagingManager(dependencies: {
  directory: string;
  files: { write(path: string, content: string): Promise<void>; remove(path: string): Promise<void> };
  createId: () => string;
}) {
  const active = new Set<string>();
  const directory = dependencies.directory.replace(/\/$/, '');
  return {
    async stageData(artifact: DataArtifact): Promise<{ path: string; artifact: DataArtifact }> {
      const id = dependencies.createId();
      if (!/^[A-Za-z0-9._:-]{1,200}$/.test(id)) throw new Error('Invalid staging identifier.');
      const path = `${directory}/drive-data-${id}.json`;
      await dependencies.files.write(path, artifact.json);
      active.add(path);
      return { path, artifact };
    },
    activePaths(): string[] {
      return [...active].sort();
    },
    async release(path: string): Promise<void> {
      if (!active.has(path)) return;
      await dependencies.files.remove(path);
      active.delete(path);
    },
  };
}

export async function cleanupOrphanStaging(
  files: readonly { path: string; modifiedAt: string }[],
  activePaths: ReadonlySet<string>,
  cutoff: string,
  stagingDirectory: string,
  remove: (path: string) => Promise<void>,
): Promise<number> {
  const prefix = `${stagingDirectory.replace(/\/$/, '')}/`;
  let removed = 0;
  for (const file of files) {
    if (!file.path.startsWith(prefix) || activePaths.has(file.path) || file.modifiedAt >= cutoff) continue;
    await remove(file.path);
    removed += 1;
  }
  return removed;
}
