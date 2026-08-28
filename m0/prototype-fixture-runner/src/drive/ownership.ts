import { z } from 'zod';
import { DriveClientError, type DriveFile, type DriveFileMetadataInput, type DriveClient } from './client';
import type { DriveSecretStore } from './secretStore';

const OWNER_FILE_NAME = 'oshilog-owner-v1.json';
const OWNER_CLAIM_KEY = 'drive-owner-claim';

const isoTimestampSchema = z.string().datetime({ offset: true });
const safeIdSchema = z.string().min(1).max(500);
const safeTextSchema = z.string().min(1).max(500);

const ownerClaimPropertiesSchema = z.object({
  app: z.literal('oshilog'),
  formatVersion: z.literal('1'),
  artifactType: z.literal('owner'),
  deviceId: safeIdSchema,
  deviceLabel: safeTextSchema,
  claimId: safeIdSchema,
  claimedAt: isoTimestampSchema,
}).strict();

export type OwnerClaim = z.infer<typeof ownerClaimPropertiesSchema>;

export type DriveOwnership = {
  readOwner(signal?: AbortSignal): Promise<OwnerClaim | null>;
  isCurrentlyOwner(signal?: AbortSignal): Promise<boolean>;
  claimOwnership(signal?: AbortSignal): Promise<string>;
  takeOver(signal?: AbortSignal): Promise<string>;
  verifyBeforeRun(signal?: AbortSignal): Promise<void>;
  verifyBeforeCommit(signal?: AbortSignal): Promise<void>;
};

/**
 * Deterministically selects the winning owner file: newest Drive modifiedTime,
 * then highest file id. Losers from duplicate-write races are cleaned up.
 */
export function selectOwnerWinner(files: readonly DriveFile[]): { winner?: DriveFile; losers: DriveFile[] } {
  if (files.length === 0) return { losers: [] };
  const sorted = [...files].sort((left, right) => {
    const leftTime = Date.parse(left.modifiedTime ?? '0');
    const rightTime = Date.parse(right.modifiedTime ?? '0');
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return right.id.localeCompare(left.id);
  });
  const [winner, ...losers] = sorted;
  return { winner, losers };
}

function ownerClaimFromFile(file: DriveFile): OwnerClaim | null {
  const parsed = ownerClaimPropertiesSchema.safeParse(file.appProperties);
  return parsed.success ? parsed.data : null;
}

export function createDriveOwnership(dependencies: {
  client: DriveClient;
  secrets: Pick<DriveSecretStore, 'get' | 'set'>;
  now: () => string;
  createId: () => string;
  deviceId: () => string;
  deviceLabel: () => string;
}): DriveOwnership {
  const { client, secrets, now, createId, deviceId, deviceLabel } = dependencies;

  async function listOwners(signal?: AbortSignal): Promise<DriveFile[]> {
    return client.listFiles({ artifactType: 'owner' }, signal);
  }

  async function resolveWinner(signal?: AbortSignal): Promise<{ winner?: DriveFile; owner?: OwnerClaim }> {
    const files = await listOwners(signal);
    const { winner, losers } = selectOwnerWinner(files);
    for (const loser of losers) {
      try {
        await client.deleteFile(loser.id, signal);
      } catch {
        // Best-effort cleanup of duplicate owner artifacts.
      }
    }
    return { winner, owner: winner ? (ownerClaimFromFile(winner) ?? undefined) : undefined };
  }

  async function readOwner(signal?: AbortSignal): Promise<OwnerClaim | null> {
    const { owner } = await resolveWinner(signal);
    return owner ?? null;
  }

  async function writeClaim(claimId: string, signal?: AbortSignal): Promise<void> {
    const properties = ownerClaimPropertiesSchema.parse({
      app: 'oshilog',
      formatVersion: '1',
      artifactType: 'owner',
      deviceId: deviceId(),
      deviceLabel: deviceLabel(),
      claimId,
      claimedAt: now(),
    });
    const metadata: DriveFileMetadataInput = { name: OWNER_FILE_NAME, appProperties: properties };
    const files = await listOwners(signal);
    const { winner } = selectOwnerWinner(files);
    if (winner) {
      await client.updateMultipart(winner.id, metadata, '{}', 'application/json', signal);
    } else {
      await client.createMultipart(metadata, '{}', 'application/json', signal);
    }
    // Re-read and verify the exact claim won (race-safe).
    const refreshed = await readOwner(signal);
    if (!refreshed || refreshed.deviceId !== deviceId() || refreshed.claimId !== claimId) {
      throw new DriveClientError('NOT_OWNER', 'Another device won the scheduled backup ownership claim.');
    }
    await secrets.set(OWNER_CLAIM_KEY, claimId);
  }

  return {
    async readOwner(signal) {
      return readOwner(signal);
    },

    async isCurrentlyOwner(signal) {
      const storedClaim = await dependencies.secrets.get(OWNER_CLAIM_KEY);
      if (!storedClaim) return false;
      const owner = await readOwner(signal);
      return owner?.deviceId === deviceId() && owner?.claimId === storedClaim;
    },

    async claimOwnership(signal) {
      const storedClaim = await dependencies.secrets.get(OWNER_CLAIM_KEY);
      const owner = await readOwner(signal);
      const alreadyOurs = storedClaim !== null
        && owner?.deviceId === deviceId()
        && owner?.claimId === storedClaim;
      if (alreadyOurs) return storedClaim;
      // No owner record: this device may claim it.
      if (!owner) {
        const claimId = storedClaim ?? createId();
        await writeClaim(claimId, signal);
        return claimId;
      }
      // Another device owns the schedules: only an explicit takeover may overwrite it.
      throw new DriveClientError('NOT_OWNER', 'Another device owns scheduled backups.');
    },

    async takeOver(signal) {
      const claimId = createId();
      await writeClaim(claimId, signal);
      return claimId;
    },

    async verifyBeforeRun(signal) {
      const storedClaim = await dependencies.secrets.get(OWNER_CLAIM_KEY);
      if (!storedClaim) throw new DriveClientError('NOT_OWNER', 'This device is not the scheduled backup owner.');
      const owner = await readOwner(signal);
      if (owner?.deviceId !== deviceId() || owner?.claimId !== storedClaim) {
        throw new DriveClientError('NOT_OWNER', 'Another device now owns scheduled backups.');
      }
    },

    async verifyBeforeCommit(signal) {
      await this.verifyBeforeRun(signal);
    },
  };
}