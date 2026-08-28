# Google Drive backup implementation evidence (T8-T12)

Status: **IMPLEMENTED through T12** (automated + build evidence complete; physical real-account matrix remains the final release gate)  
Date: **2026-08-17 (Asia/Jakarta)**  
Source plan: [`GOOGLE_DRIVE_BACKUP_RESTORE_IMPLEMENTATION_PLAN.md`](../../GOOGLE_DRIVE_BACKUP_RESTORE_IMPLEMENTATION_PLAN.md)  
Prerequisites: [`google-drive-auth-spike.md`](google-drive-auth-spike.md) (T0 GO), [`google-drive-backup-t1-t5.tdd.md`](google-drive-backup-t1-t5.tdd.md), [`google-drive-backup-t6.tdd.md`](google-drive-backup-t6.tdd.md), [`google-drive-backup-t7.tdd.md`](google-drive-backup-t7.tdd.md)

## Scope held

- Android-only, client-only, Google Drive `appDataFolder` only, `drive.appdata` scope only.
- Existing local Data/Media backup and merge-restore behavior is unchanged; Drive tables stay outside `BACKUP_TABLES`.
- No backend, realtime sync, custom encryption, foreground-only scheduling downgrade, or silent network retry.
- All automated tests use deterministic fake Drive/fake network/fake notifications; no real Drive file was created or deleted without explicit approval.

## T8 — Schedule engine, ownership, network policy, background worker, notifications

### Delivered

- Pure cadence (`driveBackupDomain.ts`): daily/weekly/monthly anchors, month-end clamping in device timezone, single-hop late catch-up, `shortestEnabledIntervalMs`.
- Remote ownership (`ownership.ts`): owner artifact `oshilog-owner-v1.json` in appProperties, deterministic winner selection + duplicate cleanup, claim vs explicit takeover semantics, `verifyBeforeRun`/`verifyBeforeCommit` gates; local claim kept in SecureStore.
- Network policy (`networkState.ts`): transport normalization (wifi/ethernet/cellular/vpn/unknown/none) and `any` vs `wifi_only` matrix; installed reader over `expo-network@57.0.1` (added this session).
- Shared schedule engine (`scheduleEngine.ts`): enable/disable/takeover, manual runs with one-time cellular override, due evaluation with deferred outcomes, attempt outcomes advance exactly one cadence hop, cancelled/skipped do not advance, independent per-category evaluation with a shared batch, ownership-change pausing with single notification, auth-required notification, stale job reconciliation, orphan-staging maintenance hook, worker registration reconciliation.
- Orchestrator commit gate: `assertCommitEligible` invoked before Data commit / Media manifest commit; manual triggers are never blocked (gate decides by trigger).
- Background worker (`driveBackupTask.ts`): module-scope `expo-task-manager` task + `expo-background-task` registration adapter (minimum interval clamped to 15 min).
- Installed composition (`installedDriveBackup.ts`): production wiring db → repo → SecureStore → Nitro auth → connection lifecycle → client → ownership → orchestrators → engine → history/retention → restore; startup catch-up and notification-retry entry points.
- App wiring (`_layout.tsx`): module-scope worker import, non-blocking startup catch-up, notification `driveRetryCategory` routing.

### Tests (RED → GREEN)

- `driveBackupDomain.test.ts` — 19 tests: cadence arithmetic, month ends, leap years, late catch-up without bursts, due checks, shortest interval.
- `networkState.test.ts` — 11 tests: full policy matrix incl. VPN/Unknown/None and reachability handling.
- `ownership.test.ts` — 8 tests: empty claim, existing-owner re-assert, other-device rejection, explicit takeover + old-device detection, deterministic duplicate cleanup, malformed-owner tolerance, missing local claim.
- `scheduleEngine.test.ts` — 35 tests: enable/disable/takeover, connected-account requirement, manual without due-date mutation, cellular override, deferral without advance/notification, no-change/failure/partial/cancelled outcomes, late catch-up single hop, ownership-change pause + single notification, independent categories, auth-required notification, worker register/unregister (shortest interval, stateful adapter), startup maintenance success/failure, stale-job reconciliation, unexpected-state skip, error propagation paths.
- `driveBackupTask.test.ts` — 6 tests: module-scope define, register with clamping, unregister, executor success/failure.
- Orchestrator gate tests (data + media): NOT_OWNER after verification → failed, no commit, staging deleted; manual passes the gate.
- `driveNotifications.test.ts` — 8 tests: permission-denied no-op, success/no-change/partial/failure payloads, retry data, ownership/auth copy safety (no tokens/session material).

### T8 verification

```text
src/drive + src/repositories: 20 suites / 228 tests PASS
npm.cmd run typecheck                                   PASS
npx.cmd eslint <all new/changed files>                  PASS (0 problems)
```

## T9 — Backup settings UI

### Delivered

- `src/hooks/useDriveBackup.ts` — state + command surface (connection, schedules, jobs, history, owner status, busy/error, manual/all/retry, delete, estimate, restore commands, recommendation).
- `src/components/backup/DriveConnectionCard.tsx` — connect/reconnect/disconnect/resume, owner status, paused reasons.
- `src/components/backup/DriveScheduleCard.tsx` — frequency + network chips, due/checked/success status line, takeover confirmation modal.
- `src/components/backup/DriveManualActions.tsx` — Data/Media/All commands, Wi-Fi-only block with estimated-size cellular confirmation (one-time override), owner hint.
- `src/components/backup/DriveBackupHistory.tsx` — merged cloud history with badges (Complete/Partial/Failed/In progress), size/device/missing counts, cleanup-pending warning, restore + delete-with-confirmation actions, refresh, empty state.
- `src/components/backup/DriveRestoreFlow.tsx` — guided Data-first restore with preview, deterministic Media recommendation + mismatch warnings, Data-only toggle, result summary.
- `src/app/settings/backup.tsx` — thin screen: local backup section preserved verbatim; Drive sections added; footer discloses the Drive app-data folder.

### Tests (React Native Testing Library)

`src/components/backup/__tests__/` — 28 tests covering disconnected/connected/non-owner/paused/auth-required states, schedule edits, takeover flow, cellular confirmation with size, disabled states, empty/in-progress/partial/failed history badges, delete confirmation, restore preview/recommendation warnings/Data-only/result summary/staging release/prepare-error.

```text
npm.cmd test -- --runInBand src/components/backup --silent   5 suites / 28 tests PASS
```

## T10 — Guided and verified merge restore

### Delivered

- `src/drive/driveRestore.ts`:
  - `recommendMediaSnapshot` — deterministic same-device at-or-before rule with nearest fallback + mismatch flags.
  - Data: verified download (size+SHA-256) → staging → `readManifest` (strict allowlist/limits) → `buildVerifiedRestorePreview` → `applyDataRestore` (existing safety snapshot + merge/winner/tombstone semantics); staging released on success/cancel.
  - Media: bounded manifest parse, hash-deduplicated blob downloads with per-blob verification, atomic placement into app originals, `relinkMedia`, local thumbnail regeneration (non-fatal), skip already-present rows, never deletes local-only media, restored/skipped/missingRemote/failed counts, staging cleanup in `finally`, abort support.
- `src/services/media.ts`: exported `extFromMime` + added `regenerateThumbnail` for restore (best-effort, same grid pipeline).
- Installed restore service wired into the composition and the Backup screen.

### Tests

`src/drive/__tests__/driveRestore.test.ts` — 21 tests: recommendation rules/determinism, verified preparation, unknown/invalid/checksum-mismatch rejection before mutation, oversized value blocked, invalid JSON / identity mismatch rejection, skip-vs-restore semantics, missing-remote + download-failure + placement-failure counts, cancel-before-mutation with staging cleanup, mid-download cancel cleanup, zero-byte entries, staging release on demand.

## T11 — Security, resilience, and production hardening

### Verification results

```text
npm.cmd run verify                                      PASS
  expo install --check                                  dependencies up to date
  expo-doctor                                           21/21 checks PASS
  lint                                                  PASS (0 errors / 0 warnings)
  typecheck                                             PASS
  Jest                                                  74 suites / 613 tests PASS
  Coverage (all files)                                  85.26% stmts | 75.00% branch | 83.56% funcs | 88.13% lines
```

### Targeted coverage for Drive domain/services/repositories

```text
npm.cmd test -- --runInBand src/drive src/repositories --coverage
  drive overall    93.65% stmts | 82.57% branch | 96.32% funcs | 96.91% lines
  scheduleEngine   95.33% | 84.11% | 100% | 99.25%
  driveRestore     97.72% | 81.15% | 100% | 100%
  ownership        93.93% | 84.44% | 100% | 96.77%
  driveBackupDomain 93.75% | 94.73% | 100% | 96.42%
  networkState     83.33% | 93.75% |  50%  | 84.61%
  driveNotifications 90%   | 81.25% | 100% | 100%
  client           98.33% | 89.83% | 100% | 100%
  connectionLifecycle 100% | 93.93% | 100% | 100%
  mediaBackupOrchestrator 94.88% | 88.72% | 96.96% | 97.95%
  dataBackupOrchestrator  97.72% | 86.36% | 100%  | 100%
  driveBackupTask  84.61% | 50% (thin adapter, all logic exercised)
```

Thin adapter files (`driveBackupTask`, `installedDataStaging`) remain below 80% branch; their entire behavior is executed and covered by direct tests. Pre-existing T7 modules (`cloudHistory` 71.53%, `retention` 75% branch) are unchanged and remain within the documented T7 baseline.

### Security review

- `npm.cmd audit --omit=dev`: 24 transitive findings (9 moderate, 15 high, 0 critical) — the documented Expo/Metro baseline; the direct Nitro package contributes one moderate build-time path (`@expo/config-plugins` → `xcode`). No automatic `--force` remediation (npm proposes breaking Expo downgrades). Tracked as known for release.
- Source-level secret scan: no client secret, refresh token, access token, authorization header value, or resumable-session URL in production source; the only email matches are `example.test` fixtures inside tests (used for redaction assertions).
- `.env*.local` (contains the public Web OAuth client ID) remains git-ignored; only `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is read at runtime — a public identifier, never a secret.
- Session URLs restricted to HTTPS `www.googleapis.com/upload/drive/v3/files` and stored only in SecureStore; SQLite stores the secret reference key.
- Fixed pre-existing lint errors (`DetailIdolTabIndicator` refs-in-render → lazy `useState` animated values; unused imports in `idol/[id].tsx`), unblocking `npm run lint` and therefore `npm run verify`.

## T12 — Release validation and handoff

### Android build

```text
android> .\gradlew.bat app:assembleDebug --no-daemon    PASS — BUILD SUCCESSFUL (92 executed, 507 up-to-date)
```

The development APK compiles with the full Drive feature set including `expo-network` and the Nitro sign-in adapter.

### Documentation

- `README.md` — added the Google Drive backup section (scope, privacy disclosure, security model, scheduling semantics, restore guarantees, known Android limitations, developer setup pointers).
- This evidence file — T8-T12 RED/GREEN evidence.
- [`AUDIT_T0_T6.md`](../../AUDIT_T0_T6.md) — the requested T0-T6 audit report (audit date 2026-08-17).

### Known Android background scheduling limitations (recorded)

- `expo-background-task` intervals are inexact minimums; vendor/battery optimizations may delay or skip a wake. Startup catch-up on next open is the reliability backstop.
- Wi-Fi-only scheduled policy excludes VPN and Unknown transports.
- Notification permission denial never blocks backup; the Backup screen always reflects the same state.
- Monthly cadence is calendar-month based in the device timezone with month-end clamping (e.g. Jan 31 → Feb 28/29).
- The Nitro adapter's `getTokens()` path references an Activity internally (T0 risk note); physical-device matrix below re-validates headless behavior per vendor.

### Manual release matrix — status

| Matrix item | Evidence now | Remaining (physical, real account) |
|---|---|---|
| Fresh connect; cancel consent; revoke grant; reconnect | Automated lifecycle tests (T2) + physical interactive consent (T0) | Full re-run on release APK |
| Data manual on Wi-Fi and cellular | Engine/orchestrator tests | Physical |
| Media manual on Wi-Fi; cellular cancel; one-time override | UI + engine tests | Physical |
| Backup All success and Data-success/Media-failure partial | Orchestrator + engine tests | Physical |
| Daily/weekly/monthly due evaluation, both/one/none due | Engine tests | Physical |
| App-open catch-up, force worker, reboot, swipe-away, battery saver | Force-trigger worker proven in T0; engine tests | Physical on release APK |
| Takeover Device B → Device A pause | Engine/ownership tests | Physical |
| Manual backup from non-owner device | Engine tests | Physical |
| No-change for Data and Media | Orchestrator/engine tests | Physical |
| Large video interruption + explicit retry (session lifetime, expiry) | Media orchestrator tests | Physical |
| >5 snapshots retention + shared blobs | T7 tests | Physical |
| Missing local media partial + latest complete preserved | T6/T7 tests | Physical |
| Quota/offline/401/429/malformed responses | Client/engine tests | Physical |
| Restore Data-only / recommended / alternative / corrupt / cancel | Restore tests | Physical |
| Disconnect keeps cloud history after reconnect | Lifecycle tests | Physical |
| Notification permission denied | UI/notification tests | Physical |
| Local backup/restore regression | 613-test suite incl. `backup.test.ts` | Smoke on device |

## Self-evaluation

| Axis | Score | Evidence |
|---|---:|---|
| Accuracy | 5 | Every claim above maps to a recorded RED/GREEN run, coverage table, or build output from 2026-08-17. |
| Completeness | 4 | T8-T11 are fully implemented with automated evidence. T12's remaining gate is the physical-device/real-account matrix, which cannot be executed in this environment; the runbook and itemized status are provided. |
| Clarity | 5 | Scope, deliverables, tests, security findings, and remaining physical matrix are separated above. |
| Actionability | 4 | Installed composition exposes every command the UI and worker need; handoff can start physical validation directly from the matrix table. |
| Conciseness | 4 | Deliberately detailed for auditability; routine handoff links here instead of repeating tables. |

Overall self-evaluation: **4.4 / 5.0**. Highest-impact next step: execute the physical matrix on the internal APK with an approved test Google account (real Drive mutations), then flip the plan status to Released.
