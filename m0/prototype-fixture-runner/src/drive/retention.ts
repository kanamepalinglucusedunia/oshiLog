import type { DriveCategory } from './contracts';

export const MAX_RETAINED_SNAPSHOTS = 5;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type RetentionSnapshot = {
  category: DriveCategory;
  remoteFileId: string;
  snapshotId: string;
  deviceId?: string;
  createdAt: string;
  complete: boolean;
};

export type MediaBlobReference = {
  remoteFileId: string;
  sha256?: string;
};

export type MediaManifestReference = {
  entries: readonly { blobSha256: string | null; missing: boolean }[];
};

export type RetentionSelection<T extends RetentionSnapshot> = {
  retained: T[];
  obsolete: T[];
};

function compareStringsDescending(left: string, right: string): number {
  return right.localeCompare(left);
}

/** Sorts newest-first, with stable IDs breaking timestamp ties. */
export function compareSnapshotsNewest<T extends RetentionSnapshot>(left: T, right: T): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (left.createdAt !== right.createdAt) return compareStringsDescending(left.createdAt, right.createdAt);
  const snapshotOrder = compareStringsDescending(left.snapshotId, right.snapshotId);
  if (snapshotOrder !== 0) return snapshotOrder;
  return compareStringsDescending(left.remoteFileId, right.remoteFileId);
}

/**
 * Chooses the committed snapshots that remain on Drive.
 *
 * Media always keeps the newest complete manifest, then fills the remaining
 * slots with the newest snapshots. This prevents a newer partial upload from
 * evicting the only usable complete Media restore point.
 */
export function selectRetainedSnapshots<T extends RetentionSnapshot>(
  candidates: readonly T[],
  limit = MAX_RETAINED_SNAPSHOTS,
): RetentionSelection<T> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Retention limit must be a non-negative integer.');
  if (candidates.length === 0 || limit === 0) {
    return { retained: [], obsolete: [...candidates] };
  }

  const category = candidates[0].category;
  if (candidates.some((candidate) => candidate.category !== category)) {
    throw new Error('Retention selection requires one category at a time.');
  }

  const ordered = [...candidates].sort(compareSnapshotsNewest);
  const retained: T[] = [];
  const retainedIds = new Set<string>();

  if (category === 'media') {
    const newestComplete = ordered.find((candidate) => candidate.complete);
    if (newestComplete) {
      retained.push(newestComplete);
      retainedIds.add(newestComplete.remoteFileId);
    }
  }

  for (const candidate of ordered) {
    if (retained.length >= limit) break;
    if (retainedIds.has(candidate.remoteFileId)) continue;
    retained.push(candidate);
    retainedIds.add(candidate.remoteFileId);
  }

  const obsolete = ordered.filter((candidate) => !retainedIds.has(candidate.remoteFileId));
  return { retained, obsolete };
}

export function collectMediaBlobReferences(manifests: readonly MediaManifestReference[]): Set<string> {
  const references = new Set<string>();
  for (const manifest of manifests) {
    for (const entry of manifest.entries) {
      if (!entry.missing && entry.blobSha256 && SHA256_PATTERN.test(entry.blobSha256)) {
        references.add(entry.blobSha256);
      }
    }
  }
  return references;
}

/**
 * Returns only verifiable app-owned blobs that no retained manifest uses.
 * Blobs without a valid hash are intentionally left untouched for safety.
 */
export function selectOrphanMediaBlobs(
  blobs: readonly MediaBlobReference[],
  references: ReadonlySet<string>,
): MediaBlobReference[] {
  return [...blobs]
    .filter((blob) => Boolean(blob.sha256 && SHA256_PATTERN.test(blob.sha256) && !references.has(blob.sha256)))
    .sort((left, right) => left.remoteFileId.localeCompare(right.remoteFileId));
}
