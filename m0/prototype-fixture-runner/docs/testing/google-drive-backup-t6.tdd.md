# Google Drive backup implementation evidence (T6)

Status: **COMPLETE through T6**  
Date: **2026-08-16 (Asia/Jakarta)**  
Source plan: [`GOOGLE_DRIVE_BACKUP_RESTORE_IMPLEMENTATION_PLAN.md`](../../GOOGLE_DRIVE_BACKUP_RESTORE_IMPLEMENTATION_PLAN.md)  
Prerequisites: [`google-drive-auth-spike.md`](google-drive-auth-spike.md) records the physical-device T0 **GO**; [`google-drive-backup-t1-t5.tdd.md`](google-drive-backup-t1-t5.tdd.md) records T1-T5.

## Scope held

- Android-only, client-only, Google Drive `appDataFolder` only.
- Existing local Data/Media backup and merge-restore behavior is unchanged.
- No backend, realtime sync, custom encryption, foreground-only scheduling downgrade, or silent retry was added.
- T6 performs no automatic network retry. A saved resumable session is queried and resumed only when `retryJobId` is supplied by an explicit user retry.
- Tests use a deterministic fake Drive. No real Drive file was created or deleted during automated verification.

## Delivered

- Incremental Media inventory of referenced local originals, including explicit missing/unreadable/zero-byte classification.
- Drive-specific full-file SHA-256 cache in schema v12. This avoids treating the existing local deduplication hash as a Drive checksum and leaves local deduplication semantics untouched.
- Exact 5 MiB bounded-memory reads through Expo `FileHandle`.
- Immutable `media-blob-{sha256}` uploads with verified remote SHA-256, size, and `appProperties`.
- Resumable session URLs stored only in SecureStore; SQLite stores the secret reference, acknowledged offset, local path, total size, and expiry.
- Server-offset reconciliation on explicit retry, safe restart after local expiry or Drive 404 expiry, and progress persistence after every acknowledgement.
- `media-manifest-{snapshotId}.json` staging, checksum verification, and metadata commit only after every available blob verifies.
- Partial committed manifests that explicitly record missing media.
- Backup All as sequential, independent Data then Media child jobs with a shared batch ID; a failed Media child does not roll back committed Data, and retry invokes Media only.

## RED/GREEN evidence

| Task | RED evidence | GREEN evidence |
|---|---|---|
| Media orchestrator/gateway | `mediaBackupOrchestrator.test.ts` failed because `@/drive/mediaBackupOrchestrator` did not exist | Targeted T6 suite passes incremental reuse, 5 MiB chunking, persisted acknowledgements, explicit resume, expiry restart, verify-before-manifest, partial manifests, cancellation, redacted errors, and gateway metadata |
| Installed inventory/cache | `installedMediaInventory.test.ts` failed because `@/drive/installedMediaInventory` did not exist; the FileHandle test then failed on missing test-native `FileMode.ReadOnly` | Installed adapter tests pass referenced-media selection, full SHA-256 cache reuse, missing/unreadable classification, and exact random-offset FileHandle reads |
| Backup All | `backupAllOrchestrator.test.ts` failed because `@/drive/backupAllOrchestrator` did not exist | Data success remains committed when Media fails; explicit retry calls Media once and never reruns Data |
| Zero-byte classification | Focused staging test was RED because an empty file was treated as an available SHA-256 blob | Empty media is now classified missing and contributes to a partial manifest without a blob upload |

## Test guarantees

| Guarantee | Primary test |
|---|---|
| Existing verified SHA-256 blobs are reused; only absent/changed hashes open resumable sessions | `src/drive/__tests__/mediaBackupOrchestrator.test.ts` |
| Large media is read in chunks no larger than 5 MiB | `src/drive/__tests__/mediaBackupOrchestrator.test.ts` |
| Every Drive acknowledgement is persisted and explicit retry begins at the server-confirmed offset | `src/drive/__tests__/mediaBackupOrchestrator.test.ts` |
| Expired sessions restart without a duplicate committed manifest | `src/drive/__tests__/mediaBackupOrchestrator.test.ts` |
| No Media manifest is uploaded until every available blob passes size/SHA-256 verification | `src/drive/__tests__/mediaBackupOrchestrator.test.ts` |
| Missing/unreadable/empty media is represented explicitly in a partial committed manifest | `src/drive/__tests__/staging.test.ts`, `installedMediaInventory.test.ts`, `mediaBackupOrchestrator.test.ts` |
| Session URLs never enter SQLite; cancellation clears the SecureStore value and session row | `src/drive/__tests__/mediaBackupOrchestrator.test.ts`, `src/drive/__tests__/secretStore.test.ts` |
| Backup All preserves Data success and retry targets Media only | `src/drive/__tests__/backupAllOrchestrator.test.ts` |
| Existing local backup/merge-restore round trips remain valid on schema v12 | `src/services/__tests__/backup.test.ts` |

## Verification

Targeted T6 coverage:

```text
3 suites / 24 tests PASS
All T6 modules: Statements 95.78% | Branches 88.88% | Functions 100% | Lines 98.61%
backupAllOrchestrator.ts:   Branches 100%
installedMediaInventory.ts: Branches 84.61%
mediaBackupOrchestrator.ts: Branches 89.31%
```

Drive/migration regression:

```text
11 suites / 95 tests PASS
```

Local backup/restore regression:

```text
src/services/__tests__/backup.test.ts: 25 tests PASS
```

Full project verification:

```text
npm.cmd run verify                                      PASS
  expo install --check                                  dependencies up to date
  expo-doctor                                           21/21 checks PASS
  lint                                                  PASS
  typecheck                                             PASS
  Jest                                                  60 suites / 457 tests PASS

android> .\gradlew.bat app:assembleDebug --no-daemon   PASS
  BUILD SUCCESSFUL (599 tasks; 73 executed, 526 up-to-date)
```

The Android build emitted existing non-blocking Gradle deprecation and Android SDK XML-version warnings. It produced no compile or packaging failure.

## Security review

- OAuth scope remains only `drive.appdata`.
- Access tokens remain ephemeral and are injected centrally by the Drive client.
- Resumable URLs are restricted by the Drive client to HTTPS `www.googleapis.com/upload/drive/v3/files` and are stored in SecureStore, never SQLite, logs, notifications, or job errors.
- Source/log scanning found expected runtime header injection and secret-key identifiers only; no concrete client secret, refresh token, access token, authorization value, or resumable session URL was found.
- Media manifest input is schema bounded and blob/manifest metadata must match exact byte size and SHA-256 before commit.
- `npm.cmd audit --omit=dev` reports 24 existing transitive findings (9 moderate, 15 high, 0 critical) in Expo/Metro tooling. The proposed automatic remediation is a breaking Expo/React Native downgrade, so `npm audit fix --force` was not run.

## Exit decision

T6 exit criteria are met by automated evidence: Media backup is bounded-memory, deduplicated, and resumable only by explicit user action; partial snapshots and Backup All isolation are covered. Physical real-account Media upload/interruption testing remains part of the later release-validation milestone and requires an explicit user-approved Drive mutation.

## Self-evaluation

| Axis | Score | Evidence / improvement |
|---|---:|---|
| Accuracy | 5 | T6 claims map directly to RED/GREEN tests, targeted coverage, full verification, Android compilation, and the refreshed graphify graph. |
| Completeness | 4 | Every T6 software criterion is implemented. The remaining confidence gap is a user-approved real-account large-video interruption/retry run, intentionally deferred to physical release validation because it mutates Drive. |
| Clarity | 5 | Scope, delivered behavior, guarantees, commands, security findings, and the remaining physical check are separated above. |
| Actionability | 5 | Installed inventory, Drive gateway, Media orchestrator, and Backup All/Retry Media entry points are ready for the later scheduler and UI milestones. |
| Conciseness | 4 | The evidence report is deliberately detailed for auditability; routine handoff should link here instead of repeating its tables. |

Overall self-evaluation: **4.6 / 5.0**. Highest-impact improvement is the later user-approved physical interruption/expiry matrix using a real large video and the internal Android build.
