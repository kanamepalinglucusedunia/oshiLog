import {
  appendAuthSpikeEvidence,
  clearAuthSpikeEvidence,
  readAuthSpikeEvidence,
} from '../evidenceStore';
import type { AuthSpikeEvidence } from '../backgroundProbe';

function evidence(index: number): AuthSpikeEvidence {
  return {
    adapter: 'nitro',
    phase: 'background',
    status: 'success',
    startedAt: `2026-08-16T01:00:${String(index).padStart(2, '0')}.000Z`,
    completedAt: `2026-08-16T01:00:${String(index + 1).padStart(2, '0')}.000Z`,
    tokenAcquired: true,
    accountMetadataPresent: true,
    driveListSucceeded: true,
    fileCount: 0,
  };
}

describe('authorization spike evidence store', () => {
  beforeEach(() => {
    clearAuthSpikeEvidence();
  });

  it('persists only the newest 20 redacted probe records', async () => {
    for (let index = 0; index < 22; index += 1) {
      await appendAuthSpikeEvidence(evidence(index));
    }

    const records = readAuthSpikeEvidence();
    expect(records).toHaveLength(20);
    expect(records[0].startedAt).toBe(evidence(2).startedAt);
    expect(records[19].startedAt).toBe(evidence(21).startedAt);
  });

  it('rejects token-shaped extra fields instead of persisting them', async () => {
    await expect(
      appendAuthSpikeEvidence({
        ...evidence(0),
        accessToken: 'must-not-be-written',
      } as AuthSpikeEvidence),
    ).rejects.toThrow();
    expect(JSON.stringify(readAuthSpikeEvidence())).not.toContain('must-not-be-written');
  });
});
