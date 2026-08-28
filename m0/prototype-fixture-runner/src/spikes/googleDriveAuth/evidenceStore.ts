import { File, Paths } from 'expo-file-system';
import { z } from 'zod';
import type { AuthSpikeEvidence } from './backgroundProbe';

const MAX_EVIDENCE_RECORDS = 20;

const authSpikeEvidenceSchema = z
  .object({
    adapter: z.enum(['nitro', 'authorization_client']),
    phase: z.enum(['interactive', 'background']),
    status: z.enum(['success', 'failed']),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    tokenAcquired: z.boolean(),
    accountMetadataPresent: z.boolean(),
    driveListSucceeded: z.boolean(),
    fileCount: z.number().int().min(0).max(1).optional(),
    errorCode: z.string().regex(/^[A-Za-z0-9_]{1,64}$/).optional(),
  })
  .strict();

const authSpikeEvidenceListSchema = z.array(authSpikeEvidenceSchema).max(MAX_EVIDENCE_RECORDS);
const evidenceFile = new File(Paths.document, 'google-drive-auth-spike-evidence.json');

export function readAuthSpikeEvidence(): AuthSpikeEvidence[] {
  if (!evidenceFile.exists) return [];

  try {
    const parsed = authSpikeEvidenceListSchema.safeParse(JSON.parse(evidenceFile.textSync()));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function appendAuthSpikeEvidence(evidence: AuthSpikeEvidence): Promise<void> {
  const safeEvidence = authSpikeEvidenceSchema.parse(evidence);
  const records = [...readAuthSpikeEvidence(), safeEvidence].slice(-MAX_EVIDENCE_RECORDS);
  evidenceFile.write(JSON.stringify(records));
}

export function clearAuthSpikeEvidence(): void {
  if (evidenceFile.exists) evidenceFile.delete();
}
