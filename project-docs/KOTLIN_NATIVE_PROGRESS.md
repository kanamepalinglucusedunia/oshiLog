# oshiLog Kotlin Native — Progress

**Program state:** M0 COMPLETE / FIRST RUNNABLE VERTICAL SLICE / M1–M2 PARTIAL  
**Last updated:** 28 Agustus 2026

## Milestone status

| Milestone | Status | Gate/evidence |
|---|---|---|
| M0 Freeze visual/feature contract | DONE | 34 owned states, 33 approved release goldens, fixture/source contracts, behavior checklist, risk register, 901 passing tests; see `project-docs/m0/M0_GATE_REPORT.md` |
| M1 Kotlin foundation | IN PROGRESS | Gradle/Compose scaffold, side-by-side debug APK, unit/instrumentation/lint gate pass; remaining architecture dependencies and startup fallback are not implemented |
| M2 Design system/app shell | IN PROGRESS | Nunito, initial tokens, onboarding, persistence, and five-tab shell run; dark mode, complete primitives/icons, and visual diff matrix remain |
| M3 Room/native backup | BLOCKED | Schema/invariant/fresh-install/native-backup evidence |
| M4 Master data | BLOCKED | Idol/Group/membership/Cheki Type parity |
| M5 Venue/Trip | BLOCKED | Provider/offline/expense parity |
| M6 Event/Cheki | BLOCKED | Atomic event and media relation parity |
| M7 Home/stats/details | BLOCKED | SQL aggregation + visual/performance parity |
| M8 Media/Album | BLOCKED | 10k album, hash/editor/shared media evidence |
| M9 Backup/Drive | BLOCKED | Large round-trip, WorkManager, Drive state evidence |
| M10 Performance | BLOCKED | Macrobenchmark/baseline profile/device metrics |
| M11 Fresh release | BLOCKED | New signing identity, fresh-install smoke, final APK |

## Baseline facts

- Prototype: `C:\Users\chimuchimu\App\oshiLog V2`
- Native target: `C:\Users\chimuchimu\App\oshiLog`
- Prototype branch/HEAD: `main` / `db1833c611c555d53dbe2757210733beb79a0ce1`
- Active prototype dirty entries at planning time: 68
- Prototype schema: v18
- Package: `com.oshilog.app`
- Prototype risks yang tidak boleh disalin: backup writer/reader admissibility, shared media deletion, partial hash trust, startup cleanup, Drive O(N), dan release dependency drift.

## Confirmed decisions

- [x] BD-001 prototype hanya referensi fitur/visual; golden manifest membekukan target UI.
- [x] BD-002 visual parity menerima perbedaan rasterisasi kecil dengan toleransi yang direncanakan.
- [x] BD-003 minSdk 26.
- [x] BD-004 tidak ada migrasi/import/signing compatibility dengan app lama; native adalah fresh app.
- [x] BD-005 source aktif menjadi referensi fitur termasuk dark mode dan scheduled Drive backup.
- [x] BD-006 external credentials akan diberikan saat milestone integrasi membutuhkannya.

## Evidence log

Append milestone evidence below; do not overwrite previous entries.

### M0 reproducible-baseline checkpoint — 28 Agustus 2026

- Active prototype snapshot is frozen by branch, HEAD, dirty diff id, package-lock hash, and a 273-file source hash in `project-docs/m0/M0_SOURCE_SNAPSHOT.json`.
- A separate-package audit runner (`com.oshilog.prototype.m0`) was built successfully in release mode; current x86_64 capture APK SHA-256 is `9FB6614108B19D6968D3310047F776AB82ACC47E683617C506CAC934479A215B`.
- Small deterministic visual and large 100k-event/10k-album fixture contracts are frozen in `project-docs/m0/M0_FIXTURE_CONTRACT.json`.
- Fourteen primary-screen captures exist. The onboarding capture is explicitly invalid and must be replaced using the new runner; dynamic detail/edit captures and final manifests are outstanding.
- Runner-only corrections exposed prototype fixture risks: Yuki's event row falls back to another idol's cheki type and is rejected by `validate_cheki_relation_insert`; Hinata's 2026 Lumière row also references a membership ending in 2023 and was ungrouped to preserve intended date semantics.
- Resume instructions and remaining gate work are recorded in `project-docs/m0/M0_SAFE_CHECKPOINT.md`.
- **Status:** SAFE_CHECKPOINT; M0 remains IN PROGRESS and is not claimed complete.

### M0 closure — 28 Agustus 2026

- **Deliverables:** source/build identity, capture environment, visual/performance fixture contract, 34-state route inventory, 33-file golden manifest, behavior checklist, 15-risk register and final gate report under `project-docs/m0/`.
- **Golden evidence:** all 33 PNGs are release-runner captures at 900×2000; owner/path/hash/dimension validation returned `states=34 files=33 errors=0`.
- **Source gate:** `npm run typecheck` passed; `npm test -- --runInBand` passed 111/111 suites and 901/901 tests. Existing React `act()` console warnings are documented test-harness debt.
- **Isolation/cleanup:** audit package was separate, only synthetic fixture data was used, synthetic Android user 10 was removed, device settings were restored and emulator stopped. Original prototype data/source were not mutated.
- **Prototype consistency:** branch `main`, HEAD `db1833c…`, dirty count 68 and tracked `git diff HEAD` hash `c3899c…` match the selected snapshot.
- **Status:** DONE. M1 is now active; M0 must not be silently regenerated.

### Planning self-evaluation — 27 Agustus 2026

============================================================
AGENT SELF-EVALUATION REPORT
============================================================

Summary: Overall score 4.2/5 across 5 quality axes.

- **Accuracy — 4/5:** feature, route, schema, design-token, test, dan audit claims diverifikasi pada source aktif; Compose/Room/WorkManager conventions diperiksa melalui Context7. Native runtime dan screenshot parity belum dapat diverifikasi karena implementasi belum dimulai.
- **Completeness — 4/5:** scope mencakup feature parity, architecture, native backup, visual protocol, milestones, acceptance, performance, test, fresh release, dan prompt implementer. Golden screenshot/state manifest belum ada dan menjadi deliverable M0.
- **Clarity — 4/5:** master plan dipisah dari handoff/progress dan memakai dependency/gate eksplisit. Dokumen master panjang (867 baris), tetapi handoff 90 baris disediakan sebagai entry point.
- **Actionability — 5/5:** model berikutnya memiliki mandatory read order, first-session scope, copy-paste prompt, hard stops, acceptance, dan required evidence format.
- **Conciseness — 4/5:** beberapa invariant muncul kembali pada feature, milestone, dan acceptance section; pengulangan dipertahankan hanya ketika diperlukan sebagai execution gate.

**Overall:** 4.2/5.

**Critical issues:** None.

**Self-check:** Ya. User meminta plan detail yang dapat dieksekusi model lebih hemat biaya; output menyediakan kontrak eksekusi, tetapi dengan jujur belum mengklaim parity sebelum baseline/golden evidence tersedia.

**Top improvements:** Tidak ada axis di bawah 4. Improvement berikutnya adalah menjalankan M0, bukan menambah planning prose.

**Verdict:** Revised after user decisions; M0 dapat dimulai tanpa data migration/cutover work.

### M0/M1/M2 first runnable vertical slice — 27 Agustus 2026

- **Baseline/source snapshot:** Prototype feature/UI source read from `C:\Users\chimuchimu\App\oshiLog V2`; active installed prototype remained untouched. Its current Idol Detail state was captured only as audit evidence at `visual-baseline/prototype/idol-detail/current.png`. A deterministic prototype onboarding golden is not yet available, so no pixel-parity claim is made.
- **Scope completed:** Fresh Kotlin/Compose app; onboarding Country → Style → Accent; country minimum-selection guard; accent HEX validation; Nunito 300/400/600/700; persisted onboarding choices; Home/Idol/Event/Venue/Trip main shell; independent side-by-side debug package.
- **Key files changed:** root Gradle wrapper/catalog/build files, `app/src/main/java/com/oshilog/app/**`, unit/instrumentation tests, fonts, `README.md`, and native screenshots under `visual-baseline/native/`.
- **Pinned toolchain:** AGP `9.1.1`, Gradle `9.3.1`, Compose compiler plugin/Kotlin `2.3.21`, Compose BOM `2026.06.01`, Activity Compose `1.13.0`, lifecycle `2.10.0`, compile/target SDK 36, minSdk 26, Java bytecode 17. BOM `2026.08.00` was rejected because it requires API 37, which is not available through the installed SDK Manager.
- **Context7 references used:** official Android project/SDK DSL; Kotlin 2.x Compose compiler plugin; Compose BOM/dependency/testing setup. Google Maven metadata was used to verify that `2026.06.01` is the latest published BOM before `2026.08.00`.
- **RED evidence:** `:app:compileDebugUnitTestKotlin` failed on unresolved `OnboardingState`, `OnboardingStep`, `CountryCode`, `SurfaceStyle`, and `normalizeAccentHex` before production implementation.
- **GREEN evidence:** `OnboardingStateTest` reports `tests=4`, `failures=0`, `errors=0`; `MainActivityTest` reports `tests=1`, `failures=0`, `errors=0` on Pixel 8a AVD.
- **Full gate:** `:app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:connectedDebugAndroidTest` → `BUILD SUCCESSFUL`; lint HTML at `app/build/reports/lint-results-debug.html`.
- **Launch evidence:** cold start status `ok`; foreground activity `com.oshilog.app.native.dev/com.oshilog.app.MainActivity`; onboarding, all three steps, main shell, and cold relaunch persistence smoke-tested. Final app was reinstalled, cleared to fresh state, launched, and left open on the emulator.
- **APK:** `app/build/outputs/apk/debug/app-debug.apk`, SHA-256 `5161F3C4A1AE2E8C26BDAE3B0DEF0D2AC146BFAA67C1E5F33E58023EE6333AE9`.
- **Visual diff:** Native onboarding and main-shell captures exist. Required prototype onboarding golden/diff/overlay do not yet exist; M2 visual gate is therefore not complete.
- **Coverage evidence:** Targeted behavior has 4 unit tests plus 1 device launch test. Numeric 80% coverage reporting is not configured yet and remains an M1 quality-gate task.
- **Known limitations:** This is a launchable shell, not the full app. Room/Hilt/Paging/WorkManager/navigation library, dark mode, exact icon set, full settings, feature CRUD, backup, and API integrations remain. Initial cold launch on the development emulator was about 4.2 seconds and is not a release performance baseline.
- **Build environment note:** Codex Windows subprocesses required `TEMP=C:\jtmp` and `TMP=C:\jtmp` to avoid Java NIO loopback socket-path failure; Android Studio can build normally.
- **Rollback:** Remove the new target workspace files or uninstall only `com.oshilog.app.native.dev`; prototype package `com.oshilog.app` and its data were not modified.
- **Status:** IMPLEMENTED_AWAITING_VISUAL_BASELINE; M0, M1, and M2 remain IN PROGRESS.

### Implementation self-evaluation — 27 Agustus 2026

Summary: the requested runnable native milestone is complete and verified; full product parity was intentionally not claimed.

- **Accuracy — 5/5:** Current source was compiled, unit/device-tested, installed, cold-launched, inspected as foreground, and captured; package/hash/test counts above come from tool output.
- **Completeness — 4/5:** The app can be opened and the first journey reaches a persistent main shell. Numeric coverage and approved prototype onboarding golden remain absent, so the broader M1/M2 gates are partial.
- **Clarity — 4/5:** `README.md` gives an immediate run path and this log separates completed scope from limitations. The temporary overlap across M0–M2 requires careful status wording.
- **Actionability — 5/5:** Android Studio can open the root directly; a runnable APK and exact CLI gate are available; the next model has file, version, test, limitation, and next-gate evidence.
- **Conciseness — 4/5:** The implementation is intentionally single-module and small, though onboarding UI remains one relatively long screen file that should be split only when real reuse appears.

**Overall:** 4.4/5.

**Top improvements:** (1) capture/approve deterministic prototype onboarding golden and produce overlay/diff; (2) complete M1 architecture/startup fallback and numeric coverage gate; (3) replace remaining placeholder shell visuals with exact vectors/primitives during M2.

**Self-check:** Ya. Pengguna akan melihat app native benar-benar terbuka, tetapi juga melihat secara eksplisit bahwa ini baru vertical slice pertama dan bukan klaim seluruh fitur/UI sudah selesai.
