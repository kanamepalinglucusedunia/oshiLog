# Google Drive backup implementation evidence (T1-T5)

Status: **COMPLETE through T5**  
Date: **2026-08-16 (Asia/Jakarta)**  
Source plan: [`GOOGLE_DRIVE_BACKUP_RESTORE_IMPLEMENTATION_PLAN.md`](../../GOOGLE_DRIVE_BACKUP_RESTORE_IMPLEMENTATION_PLAN.md)  
Prerequisite: [`google-drive-auth-spike.md`](google-drive-auth-spike.md) records the physical-device T0 **GO**.

## Scope held

- Android-only, client-only, and Google Drive `appDataFolder` only.
- Data restore remains the existing local merge-restore implementation; no replace restore was added.
- No backend, realtime sync, custom encryption, foreground-only scheduling downgrade, or silent network retry.
- Existing local Data/Media backup formats and history remain unchanged. Drive tables are excluded from `BACKUP_TABLES`.
- T6-T12 are intentionally outside this completion boundary; Media upload, retention hardening, scheduling/ownership UI, cloud restore, and release hardening remain later milestones.

## Milestone result

| Milestone | Delivered | Exit result |
|---|---|---|
| T1 | Strict Drive contracts, schema v11 migration, default schedules, repositories, SecureStore references, and transaction-backed operation lease | PASS |
| T2 | Production Nitro adapter lifecycle for connect/reconnect/headless token/disconnect/resume, single local account, preserved paused schedules, and `AUTH_REQUIRED` mapping | PASS |
| T3 | Typed/redacted Drive REST client for list/metadata/download, multipart create/update, resumable start/chunk/status, delete, pagination, verification, abort, and safe errors | PASS |
| T4 | Canonical Data artifact/fingerprint, chunked Media SHA-256 inventory and estimates, staging references, cleanup, and installed Data staging adapter | PASS |
| T5 | Shared manual/scheduled Data orchestrator with lease collapse, persistent transitions, no-change, verification-before-commit, cancellation, retention warning, and cleanup | PASS |

## RED/GREEN evidence

| Task | RED evidence | GREEN evidence |
|---|---|---|
| T1 contracts/repository/migration | New tests failed on missing Drive contract, secret-store, lock-table, and repository behavior | Targeted T1 run passed 5 suites / 55 tests; typecheck and lint passed |
| T2 lifecycle | `connectionLifecycle.test.ts` failed because `connectionLifecycle` did not exist; Nitro sign-out test failed because `signOut` was absent | `npm.cmd test -- --runInBand src/drive/__tests__/connectionLifecycle.test.ts src/spikes/googleDriveAuth` passed 10 suites / 34 tests |
| T3 REST client | `client.test.ts` failed because `drive/client` did not exist; later RED regressions exposed missing metadata-only commit, unsafe resumable host acceptance, and an unredacted resumable transport path | Final `client.test.ts` passed 14 tests; typecheck and lint passed |
| T4 staging/change detection | `staging.test.ts` failed because `drive/staging` did not exist | Final `staging.test.ts` passed canonical Data, chunked Media, orphan cleanup, and installed staging cases |
| T5 orchestrator | `dataBackupOrchestrator.test.ts` failed because the orchestrator did not exist; a later regression test exposed stale `cleanupPending` after local cleanup failure | Final Drive-domain run passed 44 tests; the cleanup regression now returns committed success with `cleanupPending=true` |

## Test guarantees

| Guarantee | Primary test |
|---|---|
| Populated v10 data survives v11 migration; fresh databases receive both default schedule rows | `src/db/__tests__/migration.test.ts` |
| Drive state is not exported by existing local Data backups | `src/services/__tests__/backup.test.ts` |
| Lease contention, expiry replacement, holder-only release, legal state transitions, and strict repository boundaries | `src/repositories/__tests__/drive.test.ts` |
| Connect cancellation/failure, one active account, disconnect without remote deletion, preserved settings, explicit resume, revoked grant pause, and no SQLite token | `src/drive/__tests__/connectionLifecycle.test.ts` |
| Pagination, empty folder, app-properties filtering, multipart/resumable semantics, error mapping, checksum/size validation, abort, no retry, redaction, and Google-only session URLs | `src/drive/__tests__/client.test.ts` |
| Volatile Data metadata does not affect fingerprints; logical changes do; Media ordering is stable; large files are chunk-hashed; active staging is protected | `src/drive/__tests__/staging.test.ts` |
| Exact happy-path state sequence, no-change, duplicate collapse, checksum failure, cancellation, manual due-date preservation, and non-fatal cleanup warnings | `src/drive/__tests__/dataBackupOrchestrator.test.ts` |

## Final verification

Scoped T1-T5 coverage:

```text
9 suites / 95 tests PASS
Statements 97.04% | Branches 87.71% | Functions 100% | Lines 99.52%
```

Full project verification:

```text
npm.cmd run verify                                      PASS
  expo install --check                                  dependencies up to date
  expo-doctor                                           21/21 checks PASS
  lint                                                  PASS
  typecheck                                             PASS
  Jest                                                  57 suites / 432 tests PASS

android> .\gradlew.bat app:assembleDebug --no-daemon   PASS
  BUILD SUCCESSFUL (599 tasks)
```

The Android build emitted non-blocking Gradle/plugin deprecation, SDK XML-version, generated Nitro
`RawPropsParser`, and debug-manifest warnings. It produced no compile or packaging failure.

Security review:

- Scoped secret/log scan found identifiers and deliberate runtime header injection only; no concrete client secret, refresh token, OAuth private key, token value, or credential logging.
- Access tokens stay ephemeral. Resumable session URLs are SecureStore references in SQLite, are absent from safe errors, and are restricted to HTTPS `www.googleapis.com/upload/drive/v3/files` before authorization is attached.
- All Drive queries are parameterized or locally constructed from strict schemas; all Drive response bodies pass Zod validation before use.
- `npm.cmd audit --omit=dev` reports 24 existing transitive findings (9 moderate, 15 high, 0 critical) in the Expo/Metro toolchain. Available automatic remediation proposes breaking Expo/React Native downgrades, so `npm audit fix --force` was not run. This remains a tracked T11 hardening item.
- Verification used the deterministic fake Drive required by the T5 tests plus a successful Android development build. It did not create or delete a real file in the user's Google Drive; that external mutation requires explicit approval and is part of the later physical release-validation gate.

## Self-review

| Axis | Score | Evidence / improvement |
|---|---:|---|
| Accuracy | 5 | T0-T5 claims are backed by the listed RED/GREEN runs, scoped coverage, full verification, and Android build. |
| Completeness | 4 | All implementation and fake-Drive test criteria through T5 are present. A real-account Data upload was deliberately not performed without explicit approval; T6-T12 are also explicitly outside this boundary. |
| Clarity | 5 | Milestones, guarantees, commands, scope, and open findings are separated above. |
| Actionability | 5 | The installed adapters and shared orchestrator are callable by the later UI/scheduler milestones, and failures use persistent safe codes. |
| Conciseness | 4 | This evidence file is intentionally detailed for auditability; routine handoff can link here instead of repeating it. |

Overall self-evaluation: **4.6 / 5.0**. Highest-impact next improvement is a user-approved physical Data upload/verification run during the later release-validation gate.
