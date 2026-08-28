# Google Drive backup implementation evidence (T7)

Status: **COMPLETE through T7**  
Date: **2026-08-16 (Asia/Jakarta)**  
Source plan: [`GOOGLE_DRIVE_BACKUP_RESTORE_IMPLEMENTATION_PLAN.md`](../../GOOGLE_DRIVE_BACKUP_RESTORE_IMPLEMENTATION_PLAN.md)  
Prerequisite: [`google-drive-backup-t6.tdd.md`](google-drive-backup-t6.tdd.md)

## Scope

T7 implements cloud history, five-snapshot retention, safe Media blob garbage collection, and explicit Data/Media delete semantics. It keeps the existing local backup flow separate and performs no real Google Drive mutations in automated tests.

## Delivered

- Added pure deterministic retention selection: newest five Data snapshots; for Media, the newest complete manifest is protected before filling the remaining slots.
- Added committed remote history derivation with Media manifest checksum/size/schema validation.
- Merged remote history with local `drive_backup_job` progress, status, errors, and `cleanupPending` state; exposed `listJobs()` from the Drive repository.
- Added safe Media GC that computes references from retained manifests and deletes only verifiable, unreferenced app-owned blobs.
- Added explicit `deleteSnapshot('data', ...)` and `deleteSnapshot('media', ...)` behavior. Data deletion removes only the selected file; Media deletion removes the manifest and then safely collects orphan blobs.
- Connected retention to both Data and Media post-commit paths. Cleanup failures preserve the committed result and mark its local job `cleanupPending`.
- Added Drive app properties for created time, device label, content fingerprint/checksum, schema version, and byte size so history ordering and integrity checks do not depend only on mutable Drive timestamps.

## RED/GREEN evidence

| Task | RED evidence | GREEN evidence |
|---|---|---|
| T7 retention/history domain | `npm.cmd test -- --runInBand src/drive/__tests__/retention.test.ts` failed because the new `retention` and `cloudHistory` modules did not exist | The same target passes 8 tests covering retention, history merge, pagination-facing Drive adapter calls, shared references, delete semantics, and safety guards |
| Media cleanup integration | New cleanup-failure test exercised the missing optional Media retention hook | `mediaBackupOrchestrator.test.ts` passes with a committed job and `cleanupPending: true` when cleanup throws |

## Test guarantees

| Guarantee | Test |
|---|---|
| More than five snapshots produce the exact deterministic deletion set | `src/drive/__tests__/retention.test.ts` |
| Newer partial Media snapshots cannot evict the newest complete restore point | `src/drive/__tests__/retention.test.ts` |
| Shared Media blobs survive while any retained manifest references them | `src/drive/__tests__/retention.test.ts` |
| Unverifiable blob metadata is left untouched | `src/drive/__tests__/retention.test.ts` |
| Remote committed artifacts merge with local uploading/partial job progress | `src/drive/__tests__/retention.test.ts` |
| Cross-device manifests participate in retention and reference calculations | `src/drive/__tests__/retention.test.ts` |
| Data deletion does not delete unrelated Media blobs; Media deletion performs GC | `src/drive/__tests__/retention.test.ts` |
| Cleanup failure does not roll back a committed Media result | `src/drive/__tests__/mediaBackupOrchestrator.test.ts` |
| Existing Data/Media backup, Drive client, repository, and local backup tests remain green | Full Jest suite |

## Verification

```text
npm.cmd test -- --runInBand                         PASS — 62 suites / 470 tests
npm.cmd run test:coverage                           PASS — 81.99% statements, 71.64% branches,
                                                       79.86% functions, 84.78% lines
npm.cmd run typecheck                               PASS
npx.cmd eslint <T7 changed files>                   PASS
graphify update .                                   PASS — graph refreshed after code changes
```

The full `npm.cmd run lint` remains blocked by pre-existing errors in `src/components/ui/DetailIdolTabIndicator.tsx` (`react-hooks/refs`) and two unused-import warnings in `src/app/idol/[id].tsx`; targeted lint for all T7 files passes.

`npm.cmd audit --audit-level=high` reports 24 existing transitive Expo/Metro findings (9 moderate, 15 high). `npm audit fix --force` was not run because npm reports that it would install a breaking Expo downgrade.

No Git checkpoint commits were created because this checkout has no `.git` repository.

## Security notes

- Remote manifest content is validated with the existing strict Zod boundary and verified Drive size/SHA-256 before use.
- Blob deletion requires app-owned Media blob metadata, a valid SHA-256, and a matching Drive checksum; unknown or unverifiable blobs are preserved.
- No access token, response body, manifest content, or resumable URL is logged or persisted by T7.
- Retention and deletion operate only on committed `appDataFolder` artifacts returned through the typed Drive client.

## Remaining scope

The T7 service is ready for the T9 history UI and T10 restore flow. Real-account Drive deletion/retention testing remains a user-approved physical-device release-validation task, not an automated test side effect.

## Self-evaluation

| Axis | Score | Evidence / improvement |
|---|---:|---|
| Accuracy | 5 | The claims above map to passing tests, typecheck, targeted lint, coverage output, and Graphify refresh. |
| Completeness | 4 | T7 work and listed tests are covered; real-account Drive behavior and UI invocation are intentionally deferred to T9/T12. |
| Clarity | 5 | Scope, behavior guarantees, verification results, and known baseline blockers are separated and actionable. |
| Actionability | 4 | The service API is ready for later UI wiring; the checkout has no Git metadata, so commit checkpoint evidence cannot be provided. |
| Conciseness | 4 | The report is longer than a handoff note because it preserves auditable TDD evidence. |

Overall self-evaluation: **4.4 / 5.0**.
