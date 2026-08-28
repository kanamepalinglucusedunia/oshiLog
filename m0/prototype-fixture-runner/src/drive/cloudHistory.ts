import type { DriveBackupJob, DriveCategory, DriveJobState } from './contracts';
import { DriveClientError, type DriveClient, type DriveFile } from './client';
import { mediaManifestSchema, type MediaManifest } from './mediaManifest';
import {
  collectMediaBlobReferences,
  selectOrphanMediaBlobs,
  selectRetainedSnapshots,
  type MediaBlobReference,
  type RetentionSnapshot,
} from './retention';
import type { DriveRepo } from '@/repositories/drive';

const EPOCH = '1970-01-01T00:00:00.000Z';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type CloudHistoryDrive = Pick<DriveClient, 'listFiles' | 'downloadVerified' | 'deleteFile'>;

export type CloudHistoryRemoteArtifact = RetentionSnapshot & {
  deviceLabel?: string;
  modifiedTime?: string;
  byteSize?: number;
  contentSha256?: string;
  contentFingerprint?: string;
  missingCount: number;
};

export type CloudHistoryItem = {
  category: DriveCategory;
  remoteFileId?: string;
  snapshotId?: string;
  deviceId?: string;
  deviceLabel?: string;
  createdAt: string;
  modifiedTime?: string;
  byteSize?: number;
  contentSha256?: string;
  contentFingerprint?: string;
  complete?: boolean;
  missingCount?: number;
  status: DriveJobState;
  jobId?: string;
  jobState?: DriveJobState;
  bytesTotal?: number;
  bytesUploaded?: number;
  itemCount?: number;
  errorCode?: DriveBackupJob['errorCode'];
  errorDetailSafe?: string;
  cleanupPending: boolean;
};

export type RetentionRunResult = {
  category: DriveCategory;
  retainedSnapshotIds: string[];
  deletedSnapshotIds: string[];
  deletedBlobIds: string[];
};

export type DeleteSnapshotResult = {
  category: DriveCategory;
  deletedSnapshotId: string;
  deletedBlobIds: string[];
};

type MediaArtifact = CloudHistoryRemoteArtifact & { manifest: MediaManifest };

function invalidRemote(message: string): never {
  throw new DriveClientError('BACKUP_INVALID', message);
}

function parseByteSize(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) invalidRemote('Google Drive returned an invalid artifact size.');
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 0) invalidRemote('Google Drive returned an unsafe artifact size.');
  return size;
}

function requiredByteSize(file: DriveFile): number {
  const size = parseByteSize(file.size ?? file.appProperties?.byteSize);
  if (size === undefined) invalidRemote('Committed Media manifest has no verifiable size.');
  return size;
}

function requiredChecksum(file: DriveFile): string {
  const checksum = file.sha256Checksum ?? file.appProperties?.contentSha256 ?? file.appProperties?.sha256;
  if (!checksum || !SHA256_PATTERN.test(checksum)) {
    invalidRemote('Committed Media manifest has no verifiable checksum.');
  }
  return checksum;
}

function createdAtFor(file: DriveFile): string {
  return file.appProperties?.createdAt ?? file.modifiedTime ?? EPOCH;
}

function snapshotIdFor(file: DriveFile): string {
  return file.appProperties?.snapshotId ?? file.name ?? file.id;
}

function assertArtifactProperties(
  file: DriveFile,
  artifactType: 'data' | 'media_manifest',
  category: DriveCategory,
): void {
  const properties = file.appProperties;
  if (!properties) return;
  if (
    properties.artifactType !== artifactType
    || properties.category !== category
    || properties.commitState !== 'committed'
  ) {
    invalidRemote('Google Drive returned an artifact outside the committed appDataFolder contract.');
  }
}

function assertRemoteMetadataIntegrity(file: DriveFile): void {
  const properties = file.appProperties;
  const driveSize = parseByteSize(file.size);
  const declaredSize = parseByteSize(properties?.byteSize);
  if (driveSize !== undefined && declaredSize !== undefined && driveSize !== declaredSize) {
    invalidRemote('Artifact size metadata does not match Drive.');
  }
  const declaredChecksum = properties?.contentSha256 ?? properties?.sha256;
  if (file.sha256Checksum && declaredChecksum && file.sha256Checksum !== declaredChecksum) {
    invalidRemote('Artifact checksum metadata does not match Drive.');
  }
}

function dataArtifactFromFile(file: DriveFile): CloudHistoryRemoteArtifact {
  assertArtifactProperties(file, 'data', 'data');
  assertRemoteMetadataIntegrity(file);
  const properties = file.appProperties;
  return {
    category: 'data',
    remoteFileId: file.id,
    snapshotId: snapshotIdFor(file),
    deviceId: properties?.deviceId,
    deviceLabel: properties?.deviceLabel,
    createdAt: createdAtFor(file),
    modifiedTime: file.modifiedTime,
    byteSize: parseByteSize(file.size ?? properties?.byteSize),
    contentSha256: file.sha256Checksum ?? properties?.contentSha256 ?? properties?.sha256,
    contentFingerprint: properties?.contentFingerprint,
    complete: true,
    missingCount: 0,
  };
}

function mediaArtifactFromManifest(file: DriveFile, manifest: MediaManifest): MediaArtifact {
  const missingCount = manifest.entries.filter((entry) => entry.missing).length;
  return {
    category: 'media',
    remoteFileId: file.id,
    snapshotId: manifest.snapshotId,
    deviceId: manifest.deviceId,
    deviceLabel: manifest.deviceLabel,
    createdAt: manifest.createdAt,
    modifiedTime: file.modifiedTime,
    byteSize: parseByteSize(file.size ?? file.appProperties?.byteSize),
    contentSha256: file.sha256Checksum ?? file.appProperties?.contentSha256 ?? file.appProperties?.sha256,
    contentFingerprint: manifest.contentFingerprint,
    complete: missingCount === 0,
    missingCount,
    manifest,
  };
}

async function parseMediaManifest(drive: CloudHistoryDrive, file: DriveFile, signal?: AbortSignal): Promise<MediaArtifact> {
  assertArtifactProperties(file, 'media_manifest', 'media');
  assertRemoteMetadataIntegrity(file);
  const size = requiredByteSize(file);
  const checksum = requiredChecksum(file);
  const bytes = await drive.downloadVerified(file.id, { size, sha256: checksum }, signal);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    invalidRemote('Google Drive returned an invalid Media manifest.');
  }
  const parsed = mediaManifestSchema.safeParse(value);
  if (!parsed.success) invalidRemote('Google Drive returned an invalid Media manifest.');
  const properties = file.appProperties;
  if (properties?.snapshotId && properties.snapshotId !== parsed.data.snapshotId) {
    invalidRemote('Media manifest metadata does not match its content.');
  }
  if (properties?.deviceId && properties.deviceId !== parsed.data.deviceId) {
    invalidRemote('Media manifest device metadata does not match its content.');
  }
  if (properties?.sha256 && properties.sha256 !== checksum) {
    invalidRemote('Media manifest checksum metadata does not match Drive.');
  }
  return mediaArtifactFromManifest(file, parsed.data);
}

function toHistoryItem(remote: CloudHistoryRemoteArtifact, job?: DriveBackupJob): CloudHistoryItem {
  const status: DriveJobState = remote.category === 'media' && !remote.complete ? 'partial' : 'committed';
  return {
    category: remote.category,
    remoteFileId: remote.remoteFileId,
    snapshotId: remote.snapshotId,
    deviceId: remote.deviceId,
    deviceLabel: remote.deviceLabel,
    createdAt: remote.createdAt,
    modifiedTime: remote.modifiedTime,
    byteSize: remote.byteSize,
    contentSha256: remote.contentSha256,
    contentFingerprint: remote.contentFingerprint,
    complete: remote.complete,
    missingCount: remote.missingCount,
    status,
    jobId: job?.id,
    jobState: job?.state,
    bytesTotal: job?.bytesTotal ?? remote.byteSize,
    bytesUploaded: job?.bytesUploaded ?? remote.byteSize,
    itemCount: job?.itemCount ?? undefined,
    errorCode: job?.errorCode ?? undefined,
    errorDetailSafe: job?.errorDetailSafe ?? undefined,
    cleanupPending: job?.cleanupPending ?? false,
  };
}

function matchesJob(remote: CloudHistoryRemoteArtifact, job: DriveBackupJob): boolean {
  if (remote.category !== job.category) return false;
  return (job.remoteFileId !== undefined && job.remoteFileId === remote.remoteFileId)
    || (job.snapshotId !== undefined && job.snapshotId === remote.snapshotId);
}

function localJobItem(job: DriveBackupJob): CloudHistoryItem {
  return {
    category: job.category,
    remoteFileId: job.remoteFileId ?? undefined,
    snapshotId: job.snapshotId ?? undefined,
    deviceId: job.deviceId,
    createdAt: job.createdAt,
    status: job.state,
    jobId: job.id,
    jobState: job.state,
    bytesTotal: job.bytesTotal ?? undefined,
    bytesUploaded: job.bytesUploaded ?? undefined,
    itemCount: job.itemCount ?? undefined,
    errorCode: job.errorCode ?? undefined,
    errorDetailSafe: job.errorDetailSafe ?? undefined,
    cleanupPending: job.cleanupPending,
  };
}

function compareHistory(left: CloudHistoryItem, right: CloudHistoryItem): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
  if (left.createdAt !== right.createdAt) return right.createdAt.localeCompare(left.createdAt);
  return `${left.category}\0${left.snapshotId ?? ''}\0${left.jobId ?? ''}`
    .localeCompare(`${right.category}\0${right.snapshotId ?? ''}\0${right.jobId ?? ''}`);
}

export function mergeCloudHistory(
  remote: readonly CloudHistoryRemoteArtifact[],
  jobs: readonly DriveBackupJob[] = [],
): CloudHistoryItem[] {
  const matchedJobs = new Set<string>();
  const merged = remote.map((artifact) => {
    const matchingJob = jobs.find((candidate) => matchesJob(artifact, candidate));
    if (matchingJob) matchedJobs.add(matchingJob.id);
    return toHistoryItem(artifact, matchingJob);
  });
  for (const job of jobs) {
    if (!matchedJobs.has(job.id)) merged.push(localJobItem(job));
  }
  return merged.sort(compareHistory);
}

export function createDriveCloudHistoryService(dependencies: {
  client: CloudHistoryDrive;
  listJobs?: () => readonly DriveBackupJob[];
  repo?: Pick<DriveRepo, 'listJobs'>;
}) {
  const { client } = dependencies;

  async function listDataFiles(signal?: AbortSignal): Promise<DriveFile[]> {
    return client.listFiles({ artifactType: 'data', category: 'data', commitState: 'committed' }, signal);
  }

  async function listMediaFiles(signal?: AbortSignal): Promise<DriveFile[]> {
    return client.listFiles({ artifactType: 'media_manifest', category: 'media', commitState: 'committed' }, signal);
  }

  async function listMediaState(signal?: AbortSignal): Promise<{ manifests: MediaArtifact[]; blobs: MediaBlobReference[] }> {
    const [mediaFiles, blobFiles] = await Promise.all([
      listMediaFiles(signal),
      client.listFiles({ artifactType: 'media_blob', category: 'media' }, signal),
    ]);
    const manifests: MediaArtifact[] = [];
    for (const file of mediaFiles) manifests.push(await parseMediaManifest(client, file, signal));
    const blobs = blobFiles
      .filter((file) => file.appProperties?.artifactType === 'media_blob')
      .filter((file) => file.appProperties?.sha256 && SHA256_PATTERN.test(file.appProperties.sha256))
      .filter((file) => file.sha256Checksum === file.appProperties?.sha256)
      .map((file) => ({ remoteFileId: file.id, sha256: file.appProperties?.sha256 }));
    return { manifests, blobs };
  }

  async function listRemoteArtifacts(signal?: AbortSignal): Promise<CloudHistoryRemoteArtifact[]> {
    const [dataFiles, mediaFiles] = await Promise.all([listDataFiles(signal), listMediaFiles(signal)]);
    const artifacts: CloudHistoryRemoteArtifact[] = dataFiles.map(dataArtifactFromFile);
    for (const file of mediaFiles) artifacts.push(await parseMediaManifest(client, file, signal));
    return artifacts;
  }

  return {
    async listHistory(signal?: AbortSignal): Promise<CloudHistoryItem[]> {
      const remote = await listRemoteArtifacts(signal);
      const jobs = dependencies.listJobs?.() ?? dependencies.repo?.listJobs() ?? [];
      return mergeCloudHistory(remote, jobs);
    },

    async runRetention(category: DriveCategory, signal?: AbortSignal): Promise<RetentionRunResult> {
      if (category === 'data') {
        const candidates = (await listDataFiles(signal)).map(dataArtifactFromFile);
        const selection = selectRetainedSnapshots(candidates);
        for (const candidate of selection.obsolete) await client.deleteFile(candidate.remoteFileId, signal);
        return {
          category,
          retainedSnapshotIds: selection.retained.map((candidate) => candidate.snapshotId),
          deletedSnapshotIds: selection.obsolete.map((candidate) => candidate.snapshotId),
          deletedBlobIds: [],
        };
      }

      const state = await listMediaState(signal);
      const selection = selectRetainedSnapshots(state.manifests);
      const references = collectMediaBlobReferences(selection.retained.map((candidate) => candidate.manifest));
      const orphaned = selectOrphanMediaBlobs(state.blobs, references);
      for (const candidate of selection.obsolete) await client.deleteFile(candidate.remoteFileId, signal);
      for (const blob of orphaned) await client.deleteFile(blob.remoteFileId, signal);
      return {
        category,
        retainedSnapshotIds: selection.retained.map((candidate) => candidate.snapshotId),
        deletedSnapshotIds: selection.obsolete.map((candidate) => candidate.snapshotId),
        deletedBlobIds: orphaned.map((blob) => blob.remoteFileId),
      };
    },

    async deleteSnapshot(category: DriveCategory, remoteFileId: string, signal?: AbortSignal): Promise<DeleteSnapshotResult> {
      if (category === 'data') {
        const target = (await listDataFiles(signal)).find((file) => file.id === remoteFileId);
        if (!target) invalidRemote('The requested Data snapshot was not found.');
        await client.deleteFile(remoteFileId, signal);
        return { category, deletedSnapshotId: snapshotIdFor(target), deletedBlobIds: [] };
      }

      const state = await listMediaState(signal);
      const target = state.manifests.find((manifest) => manifest.remoteFileId === remoteFileId);
      if (!target) invalidRemote('The requested Media snapshot was not found.');
      const retainedManifests = state.manifests.filter((manifest) => manifest.remoteFileId !== remoteFileId);
      const references = collectMediaBlobReferences(retainedManifests.map((manifest) => manifest.manifest));
      const orphaned = selectOrphanMediaBlobs(state.blobs, references);
      await client.deleteFile(remoteFileId, signal);
      for (const blob of orphaned) await client.deleteFile(blob.remoteFileId, signal);
      return {
        category,
        deletedSnapshotId: target.snapshotId,
        deletedBlobIds: orphaned.map((blob) => blob.remoteFileId),
      };
    },
  };
}

export const createDriveRetentionService = createDriveCloudHistoryService;
