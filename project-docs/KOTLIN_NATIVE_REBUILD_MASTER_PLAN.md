# oshiLog — Master Plan Rebuild Native Android (Kotlin)

**Status:** Draft siap review, belum boleh dieksekusi sebelum Gate 0 selesai  
**Revision:** 2  
**Tanggal:** 27 Agustus 2026  
**Target implementasi:** `C:\Users\chimuchimu\App\oshiLog`  
**Prototype referensi:** `C:\Users\chimuchimu\App\oshiLog V2`  
**Package final:** `com.oshilog.app`  
**Prototype yang diaudit:** branch `main`, HEAD `db1833c611c555d53dbe2757210733beb79a0ce1`, schema SQLite v18, dan 68 perubahan/untracked file pada waktu audit; prototype hanya referensi fitur/visual, bukan dependency aplikasi baru  
**Tujuan dokumen:** menjadi kontrak implementasi yang dapat dijalankan model lain tanpa menebak scope, flow, atau acceptance.

---

## 1. Keputusan utama

oshiLog akan dibuat ulang sebagai aplikasi Android native dengan Kotlin dan Jetpack Compose. Rebuild dilakukan dari nol di folder target, tetapi behavior dan visual prototype aktif dipertahankan. Perubahan teknologi tidak memberi izin untuk mengubah produk.

Keputusan arsitektur:

1. **UI:** Jetpack Compose, single-activity, custom design system; Material dipakai sebagai primitive, bukan sebagai bahasa visual bawaan.
2. **State:** immutable `UiState` + `StateFlow`; screen mengoleksi state dengan lifecycle; child composable menerima state dan callback.
3. **Database:** Room di atas SQLite, foreign key aktif, WAL, migration versioned, transaksi eksplisit, query agregasi di SQL.
4. **Collection besar:** keyset/cursor pagination melalui custom `PagingSource`; jangan mengambil seluruh riwayat lalu filter/sort di memory.
5. **Media:** app-private storage, streaming SHA-256 penuh, thumbnail terpisah, Coil untuk display/cache, Media3 untuk video, Android `Matrix.setPolyToPoly`/Canvas untuk perspective transform sebelum mempertimbangkan library besar.
6. **Background work:** WorkManager unique work untuk reminder, scheduled Drive backup, retry, dan pekerjaan yang tahan process death.
7. **Networking:** OkHttp + Kotlin serialization; adapter terpisah untuk Google Drive, Geoapify, dan Unavatar.
8. **Dependency injection:** Hilt karena repository, worker, credential, dan test doubles lintas banyak fitur. Hindari interface yang hanya punya satu implementasi kecuali merupakan boundary eksternal atau dibutuhkan test.
9. **Struktur Gradle:** satu module `app` selama feature implementation. Tambahkan `benchmark` dan `baselineprofile` hanya pada fase performa. Jangan membuat module per feature.
10. **Fresh application:** native app memiliki database, backup format, signing, dan lifecycle sendiri. Tidak ada import, upgrade, atau compatibility contract dengan aplikasi prototype.

### Alasan pendekatan ini lebih baik

- Room + SQL aggregation mengganti cache global dan full-array aggregation prototype.
- Compose lazy containers dengan stable key menjaga render sebanding dengan viewport.
- WorkManager mengganti orchestration background lintas bridge JavaScript dan lebih tahan restart/proses dibunuh.
- File I/O dan hashing berjalan langsung pada coroutine `Dispatchers.IO`, tanpa bridge React Native.
- Backup importer memberi jalur upgrade yang aman walaupun storage layout native berbeda.
- Satu module menjaga biaya implementasi dan compile complexity tetap rendah bagi model eksekutor.

---

## 2. Hierarki keputusan dan referensi

Bila artefak bertentangan, gunakan urutan berikut:

1. **Keputusan eksplisit pengguna dan master plan native ini.** Ini kontrak produk utama.
2. **Visual prototype yang telah masuk golden screenshot manifest.** Ini kontrak UI parity.
3. Source/test working tree prototype untuk inventaris fitur dan behavior yang belum diputuskan eksplisit.
4. `project-docs/PRD V2.md`, audit, dan dokumentasi TDD sebagai konteks tambahan.
5. Graphify hanya sebagai navigasi; klaim fitur penting diverifikasi ke source.

Konsekuensi yang harus dipertahankan:

- Dark mode **in scope**, walaupun PRD lama menyebut light-only.
- Drive scheduled backup **in scope**, selain reminder dan backup manual.
- Social profile/avatar import, venue autocomplete, Instax/perspective crop, media viewer/share, dan membership status periods **in scope**.
- Struktur internal, format database/backup, bug, dan technical debt prototype **tidak perlu disalin**.
- Source prototype boleh terus berubah; hanya golden screenshot/state manifest yang telah disetujui yang membekukan target UI.

---

## 3. Goal, scope, dan non-goal

### Goal

Menghasilkan APK Android native yang mempertahankan seluruh fitur, flow, data semantics, dan UI oshiLog V2, tetapi memiliki startup, list, media, backup, dan interaction performance yang lebih konsisten pada data besar.

### In scope

- Seluruh route, modal, sheet, popup, empty/loading/error state, gesture, filter, sort, search, dan konfirmasi pada prototype.
- Onboarding; Home; Activity Summary; Idol/Group; Event/Cheki; Venue; Trip/Expense; Album/Media; Settings; local backup; Google Drive backup/restore.
- Outline dan Soft Shadow, light/dark, custom accent, Nunito, icon/vector parity, motion 200/240 ms.
- Data model dan business invariants schema v18.
- Fresh-install dan release APK native yang sepenuhnya independen dari prototype.
- Accessibility, offline operation, large-data performance, dan physical-device verification.

### Out of scope

- Backend pusat, realtime sync, social feed, katalog online, currency conversion, analytics eksternal, Play Store, dan iOS.
- Redesign, mengganti wording tanpa bukti, atau mengubah navigation hierarchy.
- Menggunakan WebView atau membungkus React Native lama.
- Generic form/list framework yang tidak menghapus duplikasi nyata.
- Migrasi database Expo secara langsung tanpa backup dan rollback plan.

---

## 4. Keputusan yang telah dikonfirmasi

| ID | Keputusan | Rekomendasi | Mengapa blocking |
|---|---|---|---|
| BD-001 | Baseline visual | **Diputuskan:** capture build prototype yang dipilih ke golden screenshot/state manifest; source prototype bukan baseline code yang immutable | Target visual perlu bukti stabil tanpa mengikat app native ke repository lama. |
| BD-002 | Definisi “100% identik” | **Diputuskan:** geometry/token/content/state identik; visual diff maksimum 0,5% pixel di luar mask anti-alias, tidak ada deviasi layout >1 dp, dan manual overlay | Render font/shadow RN dan Compose tidak dapat dijamin bit-identical. |
| BD-003 | Android minimum | **Diputuskan:** `minSdk 26`; compile/target memakai stable SDK saat scaffold | Memberi baseline native API dan test matrix yang jelas. |
| BD-004 | Hubungan dengan app lama | **Diputuskan:** tidak ada migrasi data, backup compatibility, update-in-place, atau signing compatibility | Aplikasi native adalah produk fresh-install yang benar-benar baru. |
| BD-005 | Feature conflict | **Diputuskan:** source aktif dipakai sebagai referensi fitur; dark mode dan scheduled Drive backup dipertahankan | Menutup kontradiksi dengan PRD lama. |
| BD-006 | API credentials | **Diputuskan:** pengguna menyediakan Google OAuth, Geoapify key, dan Unavatar publishable token ketika milestone terkait dimulai | Secret tidak boleh ditulis ke repository atau fixture. |

Seluruh keputusan di atas sudah dikonfirmasi pengguna. API key boleh belum tersedia sampai milestone integrasi, tetapi adapter dan fake test tetap dapat dibuat lebih dahulu.

---

## 5. Kontrak visual dan design system

### 5.1 Token wajib

Port nilai prototype tanpa normalisasi Material:

- Font: Nunito Light 300, Regular 400, SemiBold 600, Bold 700.
- Size/line-height: `xs 10/12`, `small 12/14`, `body 16/20`, `large 20/24`, `h3 24/30`, `h2 32/38`, `h1 48/56`.
- Spacing: `4, 8, 16, 24, 32` dp.
- Radius: `8, 16, 16`, pill.
- Default accent `#7F6EB5`; preset: Lavender, Rose, Sky, Emerald, Amber, Coral, Teal, Indigo.
- Motion: element 200 ms; screen/tab 240 ms; easing cubic ease-in-out; tanpa spring/bounce.
- Outline: border 1 dp, shadow 0.
- Soft Shadow: border 1 dp netral, elevation setara 3, radius shadow 8, opacity light 0,08/dark 0,28.
- Light background berasal dari tint accent P10; dark background `#121216`, surface `#1C1C22`, muted `#26262E`.
- Contrast foreground accent mengikuti algoritme prototype dan dites minimal WCAG 2.1.

Source referensi:

- `src/design-system/colors.ts`
- `src/design-system/typography.ts`
- `src/design-system/theme.ts`
- `src/design-system/resolveTheme.ts`
- `src/design-system/accentGenerator.ts`
- `src/animation/motion.ts`
- `src/components/ui/icons.ts`

### 5.2 Primitive Compose yang dibuat lebih dulu

`OshiText`, `OshiCard`, `OshiButton`, `OshiField`, `OshiDropdown`, `OshiDateField`, `OshiChip`, `OshiModal`, `OshiBottomSheet`, `OshiHeader`, `OshiScreen`, `OshiSearchBar`, `FilterSortSheet`, `WheelFilter`, `OshiCounter`, `OshiCalendar`, `OshiEmptyState`, `FavoriteButton`, `NavbarPill`, dan `SpeedDial`.

Aturan:

- Primitive hanya menerima token/theme, tidak hardcode accent.
- Semantics/accessibility label disalin dari prototype.
- Bottom sheet menangani keyboard dengan scroll-to-focused-field, sticky footer, drag threshold, dan tidak menggeser seluruh layout.
- Icon custom dipindahkan dari vector path prototype ke `ImageVector`/VectorDrawable; jangan mengganti dengan icon generik bila geometry berbeda.
- Gunakan `Modifier.testTag` konsisten dengan manifest screenshot/test.

### 5.3 Golden capture protocol

Sebelum screen pertama dipindahkan:

1. Jalankan prototype dengan fixture deterministik yang sama.
2. Tetapkan emulator/device baseline: rekomendasi 360 × 800 dp, API level yang disetujui, font scale 1, display scale default, locale English, timezone Asia/Jakarta.
3. Matikan animator untuk screenshot test; lakukan test motion terpisah dengan animator aktif.
4. Capture setiap state dalam `visual-baseline/prototype/<route>/<state>.png`.
5. Capture native pada state yang sama ke `visual-baseline/native/...`.
6. Simpan diff heatmap dan overlay 50%.
7. Parity gate gagal bila ada komponen hilang, wording berbeda, order berbeda, geometry >1 dp, atau diff >0,5% di luar mask anti-alias/shadow yang disetujui.
8. Uji tambahan pada narrow phone, wide phone, font 1,3×, light/dark, Outline/Soft Shadow, lavender/custom accent.

Jangan menyebut layar “pixel perfect” hanya karena screenshot terlihat mirip secara kasat mata.

---

## 6. Arsitektur target

```text
app/src/main/java/com/oshilog/app/
  OshiLogApp.kt
  MainActivity.kt
  core/
    common/          Result/error, dispatcher, clock, UUID, money/date
    designsystem/    tokens, theme, typography, icons, primitives
    navigation/      route contract, tab shell, deep links
    database/        Room DB, converters, migration, transaction helpers
    media/           files, hash, thumbnails, crop, share/save
    network/         OkHttp, safe error mapping, connectivity
    drive/           auth, REST client, upload, schedule, restore
    testing/         fixtures, fakes, screenshot helpers
  data/
    entity/          Room entities
    dao/             bounded query APIs
    repository/      domain-specific repositories
    backup/          serialization, validation, merge, compatibility
  domain/
    model/           UI-independent domain model
    service/         membership, aggregation, validation, timeline
  feature/
    onboarding/
    home/
    stats/
    idol/
    group/
    event/
    venue/
    trip/
    album/
    settings/
```

### Dependency direction

```text
Compose screen -> ViewModel -> repository/domain service -> DAO/file/API adapter
WorkManager worker -> orchestration service -> repository/API adapter
```

- UI tidak mengakses DAO, file path, atau HTTP client langsung.
- DAO tidak mengembalikan mutable entity ke UI; mapping dilakukan di repository.
- External adapters menerima interface kecil: Drive, Geoapify, Unavatar, clock, connectivity, secret store.
- Room invalidation + `Flow` menggantikan global `dataVersion` cache invalidation.
- Operasi composite write memakai `@Transaction` atau `withTransaction`.

### Threading

- Main: Compose/state event ringan.
- IO: Room suspend query/write, file, hash, image encode, network.
- Default: pure CPU aggregation/geometry bila belum dapat dipindah ke SQL/GPU.
- Jangan membuat unbounded `GlobalScope`; semua pekerjaan terikat ViewModel/WorkManager/application scope yang jelas.

---

## 7. Data contract parity

### 7.1 Entitas yang harus tersedia

- `app_settings`, `country_preference`, `region`, `member_color`
- `media_asset`, `media_local_files` bila dipisah secara native
- `idol`, `groups`, `group_membership`, `group_membership_status_period`, `idol_name_history`
- `cheki_type`
- `venue`, `venue_drink_price`
- `trip`, `trip_country`, `trip_expense`
- `event`, `cheki_entry`
- `idol_media`, `group_media`, `cheki_entry_media`
- `backup_snapshot`
- `drive_connection`, `drive_backup_schedule`, `drive_backup_job`, `drive_upload_session`, `drive_operation_lock`, `drive_media_hash_cache`

### 7.2 Invariant wajib

1. Semua syncable record memakai UUID, `createdAt`, `updatedAt`, `deletedAt`, `schemaVersion`.
2. Domain date disimpan `YYYY-MM-DD`; audit timestamp UTC ISO.
3. Uang disimpan integer minor units; tidak pernah `Float`/`Double` untuk nilai persisten.
4. Event hanya completed; title/date/country wajib; venue/trip opsional.
5. Trip event harus sesuai date range dan country trip.
6. Membership active pada event date mengikuti boundary inclusive dan dapat overlap lintas group.
7. Satu membership Main aktif per idol; status timeline tidak gap/overlap/repeated status.
8. Cheki type price/currency immutable; default tunggal per idol.
9. Venue drink default tunggal; event menyimpan snapshot amount/currency.
10. Cheki entry menyimpan snapshot idol/group/type dan subtotal = unitPrice × quantity.
11. Cheki photo position 1-based, maksimal quantity, composite identity entry+media.
12. Shared media tidak boleh ikut terhapus ketika satu relasi/event dihapus.
13. Hash identity SHA-256 seluruh file dengan metadata versi/trust; legacy partial hash tidak boleh dipercaya.
14. Soft-deleted master tetap dapat ditampilkan melalui historical snapshots.
15. Semua agregasi currency-separated; tidak ada conversion/combined total.
16. Foreign key check lulus setelah migration dan restore.

### 7.3 Paging/query contract

- Page default 50, hard maximum 100.
- Cursor terdiri dari seluruh sort key + UUID sebagai tie-breaker.
- Search/filter/sort dilakukan di SQL.
- List: event, idol, group, venue, trip, history, album, picker, backup history, dan job history harus bounded.
- Gunakan `EXPLAIN QUERY PLAN`; query hot path tidak boleh full scan/temp sort pada fixture target kecuali scan terbatas yang didokumentasikan.
- Compose list menggunakan stable key dan `contentType`.

### 7.4 Fresh database dan native backup contract

1. Install pertama membuat database native kosong dengan schema v1 native yang mencakup seluruh domain requirement final.
2. Migration Room hanya berlaku untuk versi native berikutnya; tidak ada migration dari SQLite/backup prototype.
3. Native Data backup memiliki format/version namespace baru, misalnya `oshilog-native-data-v1`, agar tidak salah dibaca sebagai artifact prototype.
4. Restore hanya menerima artifact native dengan allowlist, checksum, size/count limit, dan compatibility reader yang didokumentasikan.
5. Safety snapshot, merge rules, tombstone semantics, dan Media restore tetap diwajibkan untuk backup native.
6. Fixture backup dibuat sintetis dari schema native; jangan menyalin data nyata prototype.

---

## 8. Feature and route parity matrix

### 8.1 App shell, onboarding, navigation

| Area | Behavior wajib | Source prototype |
|---|---|---|
| Startup | Splash, DB init, font load, recoverable startup error, notification/deep-link handling, non-blocking scheduled catch-up | `src/app/_layout.tsx` |
| Onboarding | 3 step: active countries (JP+ID default), surface style, accent; minimal satu country; redirect setelah complete | `src/app/onboarding.tsx` |
| Bottom nav | Home, Idol, Event, Venue, Trip; pill geometry; active label only; central FAB | `src/app/(tabs)/_layout.tsx`, `NavbarPill.tsx` |
| Quick action | Home/Event langsung New Event; Idol: New Idol/New Group/New Event; Venue: New Venue/New Event; Trip: New Trip/New Event | `buildActions()` |
| Gesture | Swipe antar tab, segment Idol/Group, scrim close, sheet close animation | tab layout/stores |

### 8.2 Home dan Activity Summary

- Header `Oshilog` + configurable subtitle + Settings.
- Activity card: spending per currency, Cheki/Event/Trip count, detail shortcut.
- Calendar month/year picker, event markers, date-event modal.
- Ongoing trip card.
- Top Idol filter Cheki/Event, horizontal cards, favorite action.
- Four recent events.
- Activity Summary per year: hero metrics, event calendar, spending/cheki breakdown (pie/bar), currency selection, top-3 podium.

Source: `src/app/(tabs)/index.tsx`, `src/app/stats.tsx`, `activitySummary.ts`, `dashboard.ts`.

### 8.3 Idol dan Group

- One tab with Idol/Group segmented control, 2-column grid, search, favorite-only, filter/sort, paging.
- Idol filter: status/country/region/group; sort name/events/cheki/recent.
- Group filter: country/region; sort name/events/cheki/recent.
- Create/edit bottom sheet, photo source (local/social), crop, canonical X/Instagram/TikTok links.
- Idol: birth date, country, region, member color, status, notes, membership episodes, Main group, Cheki types.
- Membership Active/Hiatus/Grad timeline, multiple hiatus cycle, overlap lintas group, reassignment modal bila history terdampak.
- Idol detail tabs exactly `Details`, `Cheki`, `Album`.
- Details: hero, social links, counts, profile fields, membership history manager.
- Cheki: counters, type summary/default management, six-month chart, month/year/sort history.
- Album: lazy load, All/Cheki/Photo/Video, month/year/sort, 4-column mixed aspect grid, viewer.
- Group detail: hero, favorite/edit, social profiles, country/region/active period, scoped counters, listed/former members, notes.
- Delete/archive confirmation; completed history tetap utuh.

Source: `src/app/(tabs)/idols.tsx`, `src/app/idol/*`, `src/app/group/*`, `IdolForm.tsx`, `GroupForm.tsx`, `MembershipHistoryManager.tsx`.

### 8.4 Event dan Cheki

- Event list: search; month/year/country/region/trip presence; sort event date/cheki/recent; page 50.
- New/Edit Event single-save: event name, date card, country/region, optional Trip, ticket, searchable Venue, optional registered drink.
- Trip auto-attach bila satu trip meliputi tanggal; modal choice bila lebih dari satu; detach supported.
- Venue picker scoped by country/region.
- Cheki entry hanya di Event: membership-aware Idol/Solo picker, multiple Cheki Type per idol entry, default type, inline type create, quantity, snapshot price.
- Photo limit <= quantity; immediate preview; batch crop; re-crop; delete explicit; rotation/flip/ratio/perspective/Instax preset/enhance.
- Detail: combined ticket-style Event card, total per currency, venue/trip navigation, entries grouped by Idol, photos/media.
- Edit/Delete preserves historical snapshots and shared media.

Source: `src/app/(tabs)/events.tsx`, `src/app/event/*`, `EventForm.tsx`, `EventIdolPicker.tsx`, `EventVenuePicker.tsx`, `EventTripCard.tsx`.

### 8.5 Venue

- List search/country/region and name/visits/recent sort.
- Create/Edit: required name/country/region, address, optional default drink.
- Explicit `Find venue or address`; Geoapify query min 3/max 120, 400 ms debounce, cancellation/stale response guard, manual fallback, attribution links.
- Detail: inline name rename, address/attribution, visit counter, used drink summary, month/year/sort visit history.
- Drink manager: explicit default, add/edit/archive/restore/delete only when unused; no inferred default by label.
- Delete venue: direct if unused; otherwise migrate event/drink data to existing/new venue atomically.

Source: `src/app/(tabs)/venues.tsx`, `src/app/venue/[id].tsx`, `VenueForm.tsx`, `VenueSearchBottomSheet.tsx`, `venueSearch.ts`.

### 8.6 Trip dan Expense

- List search, status All/On Going/Upcoming/Passed, country, start/events/recent sort.
- Create/Edit: title, one or more countries, start/end, description.
- Detail: date/country/description, Event/Cheki/Expense counter, spending breakdown per currency, expense list, event history with month/year/sort.
- Expense inline modal: Flight/Hotel/Transport/Meal/Other, custom label for Other, currency, integer minor amount, date within applicable rules, edit/delete.
- Archive Trip detaches events atomically tanpa menghapus event.

Source: `src/app/(tabs)/trips.tsx`, `src/app/trip/*`, `TripForm.tsx`, `repositories/trip.ts`.

### 8.7 Album dan media

- Import multiple photo/video, optional shared date, app-owned copy.
- Profile photo crop 4:3, optional square guide, repeated re-crop from source.
- Album editor: per-photo draft, ratio 1:1/16:9, rotate, flip, reset, perspective four-corner handles, loupe, Instax Mini/Square/Wide/Auto, debounced enhance preview.
- Preserve originals; derivative/thumbnail terpisah; EXIF GPS sanitized.
- Fullscreen viewer: metadata chips, save to gallery, native share, video playback.
- Missing media placeholder with restore/relink/remove-reference actions sesuai state.
- Streaming full-file SHA-256 and shared-reference-safe deletion.

Source: `src/components/album/*`, `src/services/media*.ts`, `instax*.ts`, `perspective.ts`.

### 8.8 Settings

- Country & Region: active countries minimal one; add/delete region; historical records unaffected.
- Theme & Appearance: light/dark, Outline/Soft Shadow, 8 preset accents + custom HEX.
- Member Colors: name/HEX catalog, usage marker, deletion leaves stored membership color.
- Language: interface remains English, editable Home header label.
- Credits: Unavatar, Geoapify/OpenStreetMap, direct links.
- Backup & Restore: bagian 8.9.

### 8.9 Local dan Google Drive backup

Local:

- Separate Data/Media snapshots and reminder Off/Daily/Weekly/Monthly.
- Data export/import picker, Media snapshot/restore, history/delete, checksum, restore preview, safety snapshot.

Drive:

- Connect/disconnect/reconnect/auth-required state.
- Private `appDataFolder`.
- Data/Media schedule independent: Off/Daily/Weekly/Monthly and Any/Wi-Fi only.
- Cross-device ownership/takeover and paused state.
- Manual Backup Data/Media/All, one-time cellular confirmation, retry/resume failed job.
- Job state machine: queued/preparing/uploading/verifying/committed/no_change/partial/failed/cancelled.
- Resumable 5 MiB chunks, remote checksum/size verification, idempotent commit, retention five snapshot/category, safe shared blob GC.
- Cloud history, partial/missing count, cleanup-pending state.
- Restore: verified Data preview, recommended Media snapshot warning (device/time), Data-only option, staged apply/release.
- Credential/error messages tidak membocorkan token, response body, atau path sensitif.

Source: `src/app/settings/backup.tsx`, `src/components/backup/*`, `src/drive/*`, `src/services/backup.ts`.

---

## 9. Milestone execution plan

Setiap milestone memiliki urutan RED -> GREEN -> verification -> visual gate -> handoff. Jangan mengerjakan milestone berikutnya jika gate required gagal.

### M0 — Freeze visual/feature contract dan evidence baseline

**Tujuan:** mengubah prototype aktif menjadi kontrak yang reproducible.

Tasks:

1. Pilih build/session prototype yang akan dicapture; rekam identitasnya hanya untuk audit visual, bukan compatibility.
2. Bekukan fixture sintetis kecil untuk visual dan fixture sintetis besar untuk performance.
3. Buat route/state inventory JSON: route, precondition, action, expected text, screenshot name.
4. Capture golden screenshot seluruh layar/state utama.
5. Buat feature behavior checklist dari source/test aktif, lalu tandai mana yang dipertahankan, diperbaiki internal, atau tidak relevan.
6. Rekam known prototype risks agar tidak ikut disalin ke arsitektur native.

**Exit:** tidak ada route/state tanpa owner/evidence; golden manifest disetujui; tidak ada dependency runtime/data terhadap prototype.

### M1 — Kotlin foundation dan quality gate

Tasks:

1. Scaffold Kotlin/Gradle dengan version catalog dan package final; debug memakai `applicationIdSuffix=.native.dev`.
2. Pin stable compatible versions setelah Context7/official docs check.
3. Setup Compose, Hilt, Room, Paging, WorkManager, Navigation, Coil, Media3, serialization, OkHttp.
4. Add static analysis, unit test, instrumentation, screenshot test, Jacoco/Kover, CI scripts.
5. Implement `AppError`, safe error mapping, clock/UUID/dispatcher injection.
6. Add root Compose error boundary/fallback pattern dan startup state machine.

**Exit:** clean build/test/lint; debug APK terpasang berdampingan dengan prototype; startup fallback test lulus.

### M2 — Design system dan app shell parity

Tasks:

1. Port token/theme/accent algorithm dan Nunito assets.
2. Port exact icon vectors.
3. Implement primitives, calendar, modal, keyboard-safe sheet, pill navbar, FAB/speed dial.
4. Implement onboarding, navigation, settings shell, light/dark + surface/accent.
5. Capture golden states Outline/Soft Shadow, light/dark, lavender/custom accent.

**Exit:** primitive semantic tests dan visual diff gate lulus; tidak ada hardcoded primary color di feature UI.

### M3 — Room schema dan native backup foundation

Tasks:

1. Rancang schema native v1 dari domain requirement prototype; pertahankan invariant, bukan nomor/format schema lama.
2. DAO bounded query contract dan transaction helper.
3. Port money/date/id/validation pure functions.
4. Implement native backup v1 parser/writer, restore preview, merge, rollback, dan safety snapshot.
5. Room migration-test harness disiapkan untuk upgrade native v1->vNext; fresh-install schema diuji sekarang.
6. Tambahkan keyset `PagingSource` foundation dan query-plan harness.

**Exit:** domain invariant checklist 100%; FK/transaction tests; native backup round-trip; corrupted/tampered/path traversal rejected.

### M4 — Master data: Country, Region, Member Color, Group, Idol

Tasks:

1. Country/Region dan Member Color settings.
2. Group CRUD/form/detail/social/photo/archive.
3. Idol CRUD/form/detail/favorite/social/photo/archive.
4. Membership timeline, overlapping group, Main, name/member-color snapshot, reassignment guard.
5. Cheki Type immutable price/currency, default, archive/reactivate, inline create.
6. Paged Idol/Group list, search/filter/sort.

**Exit:** business tests ported; form and detail visual goldens pass; no full-table list query.

### M5 — Venue dan Trip

Tasks:

1. Venue CRUD, drink defaults/history, detail aggregation, migration-delete.
2. Geoapify adapter, debounce/cancel/stale guard, manual fallback, attribution.
3. Trip CRUD/country/date/status, archive detach.
4. Expense CRUD/presets/custom Other.
5. Paged list/history/filter/sort dan SQL aggregation.

**Exit:** offline/manual flow tetap usable; provider errors safe; visual and query-plan gates pass.

### M6 — Event dan Cheki transaction core

Tasks:

1. Event validator dan atomic create/update/delete.
2. Trip/date/country dan venue/drink snapshot validation.
3. Membership-aware Idol/Solo picker dan snapshot naming.
4. Multi-type Cheki entry, quantity, price snapshot, photo position.
5. Event list/detail/edit, filter/sort/search/paging.
6. Shared-media deletion regression sebelum media UI lengkap.

**Exit:** event tanpa Cheki dan complex event lulus; failed write rollback total; historical values tidak berubah setelah master rename/archive.

### M7 — Home, stats, dan detail aggregations

Tasks:

1. SQL aggregate Home and detail counters per currency.
2. Calendar markers/date modal, ongoing trip, top Idol, recent Event.
3. Activity Summary, breakdown switch, podium.
4. Idol Cheki chart/history, Group member scoped stats, Venue/Trip history.
5. Lazy-load only tab/section yang aktif.

**Exit:** parity screenshot; 100k fixture tidak melakukan O(total-history) heap aggregation pada hot path.

### M8 — Media, Album, crop, viewer

Tasks:

1. App media directories, file ownership, full hash, metadata, thumbnail.
2. Photo Picker/video import, EXIF sanitation, social avatar import.
3. Profile crop dan general editor (ratio/rotate/flip/perspective/Instax/enhance).
4. Lazy paged Album grid dan viewer/share/save.
5. Missing/orphan/shared media recovery dan cleanup batch pasca first paint.

**Exit:** 10k album scroll stable; large file hashing bounded; shared-reference tests; editor geometry regression; no original overwritten.

### M9 — Backup, Drive, WorkManager

Tasks:

1. Versioned bounded-memory Data/Media artifact.
2. Local snapshot/reminder/history/restore.
3. Native Google authorization boundary + Drive appDataFolder client.
4. Resumable upload, verify, commit, retry/cancel/resume.
5. WorkManager unique schedules, network constraints, ownership, startup catch-up.
6. Retention five, shared blob GC, cloud history, staged restore.
7. Foreground notification/progress untuk operasi panjang sesuai Android policy.

**Exit:** >50 MiB/>250k round-trip, concurrent write snapshot consistency, 10k media incremental call-count, process-death recovery, `TestDriver` coverage.

### M10 — Performance hardening dan baseline profile

Tasks:

1. Macrobenchmark cold/warm startup, tab navigation, 100k lists, 10k album, event save, backup.
2. Inspect recomposition, jank, memory, DB query plan, file/network call count.
3. Add Baseline Profile hanya setelah user journeys stabil.
4. Move remaining startup cleanup setelah first meaningful paint dan batch-kan.
5. Remove dead code dan duplicated shell only with evidence.

**Exit:** performance budgets section 11 lulus pada release build dan physical device.

### M11 — Fresh release

Tasks:

1. Buat signing identity baru untuk app native dan simpan melalui secure release process.
2. Verifikasi fresh install/uninstall/reinstall behavior; tidak ada import atau akses ke storage prototype.
3. Run complete Maestro, visual matrix, accessibility, offline, interrupted backup, low storage.
4. Clean release build dan fresh-install smoke test.
5. Archive evidence dan final user acceptance.

**Exit:** tidak ada P0/P1, parity sign-off, fresh-install smoke lulus, release APK reproducible.

---

## 10. Acceptance criteria

### AC-001 — Visual parity per state
- **Scenario:** prototype dan native memakai fixture/device/theme yang sama.
- **Action:** route/state manifest dijalankan.
- **Expected:** hierarchy, text, icon, spacing, size, color, radius, surface, z-order, dan scroll position setara.
- **Must not:** mengganti komponen custom dengan default Material yang mengubah geometry.
- **Verification:** automated screenshot diff + overlay manual.
- **Priority:** Required.

### AC-002 — Feature inventory completeness
- **Scenario:** seluruh route dan modal prototype tercatat.
- **Action:** parity suite menjalankan happy/error/empty/loading paths.
- **Expected:** setiap item memiliki implementasi native dan evidence.
- **Must not:** menandai fitur selesai hanya karena happy path tersedia.
- **Verification:** route/state traceability matrix.
- **Priority:** Required.

### AC-003 — Offline CRUD
- **Scenario:** airplane mode, database dan media lokal tersedia.
- **Action:** create/edit/archive Idol, Group, Venue, Trip, Expense, Event, dan Cheki.
- **Expected:** seluruh operasi lokal berhasil dan agregasi berubah setelah commit.
- **Must not:** menunggu koneksi atau kehilangan write saat process recreation.
- **Verification:** instrumentation + Maestro physical-device.
- **Priority:** Required.

### AC-004 — Membership history integrity
- **Scenario:** Idol memiliki overlapping memberships dan beberapa hiatus cycle.
- **Action:** create Event pada boundary, kemudian edit timeline.
- **Expected:** picker menunjukkan opsi aktif yang tepat; invalid history meminta reassignment; completed history tetap pada snapshot lama.
- **Must not:** memindahkan Group history diam-diam.
- **Verification:** unit + Room transaction integration.
- **Priority:** Required.

### AC-005 — Monetary correctness
- **Scenario:** event/expense memakai JPY, IDR, MYR, KRW, THB.
- **Action:** save dan tampilkan summary/detail/backup/restore.
- **Expected:** integer minor units dan formatting decimal benar; totals tetap per currency.
- **Must not:** memakai floating point atau conversion lintas currency.
- **Verification:** parameterized unit + DB round-trip.
- **Priority:** Required.

### AC-006 — Event atomicity
- **Scenario:** event berisi venue, trip, beberapa entry/type/photo.
- **Action:** paksa failure pada write akhir.
- **Expected:** database/file relation kembali ke state sebelum action.
- **Must not:** menyisakan entry/media relation parsial.
- **Verification:** transaction failure injection.
- **Priority:** Required.

### AC-007 — Shared media safety
- **Scenario:** satu asset direferensikan dua event dan satu Idol/Group.
- **Action:** delete salah satu event.
- **Expected:** relasi target hilang, referensi lain tetap; tombstone hanya bila benar-benar orphan.
- **Must not:** delete global berdasarkan media id.
- **Verification:** repository integration + filesystem check.
- **Priority:** Required.

### AC-008 — Media identity dan editor
- **Scenario:** file besar same prefix/different tail, identik, dan beberapa transform.
- **Action:** import/crop/restore.
- **Expected:** full hash membedakan konten; identical dedupe; transform repeatable; original tetap ada.
- **Must not:** load seluruh file besar ke heap atau overwrite original.
- **Verification:** streaming instrumentation + golden image geometry.
- **Priority:** Required.

### AC-009 — Bounded collections
- **Scenario:** 100k event/entry dan 10k media.
- **Action:** open/search/filter/sort/scroll list dan album.
- **Expected:** initial query <=50 row, subsequent <=100; stable cursor tanpa duplicate/omission.
- **Must not:** full-array fetch/cache/render.
- **Verification:** query count/plan, heap, Compose semantics count.
- **Priority:** Required.

### AC-010 — Theme personalization
- **Scenario:** light/dark × Outline/Soft Shadow × lavender/custom accent.
- **Action:** ubah Settings dan navigate seluruh screen.
- **Expected:** semua surfaces/icon/text berubah konsisten dan contrast aman.
- **Must not:** hardcoded primary/background leak.
- **Verification:** token unit + screenshot matrix + accessibility contrast.
- **Priority:** Required.

### AC-011 — Provider fallback
- **Scenario:** Geoapify/Unavatar tidak dikonfigurasi, offline, timeout, malformed response.
- **Action:** gunakan venue/social photo flow.
- **Expected:** safe error dan manual/local path tetap tersedia.
- **Must not:** leak key/raw response atau mengubah form tanpa selection.
- **Verification:** MockWebServer + UI test.
- **Priority:** Required.

### AC-012 — Local backup restore
- **Scenario:** Data/Media snapshot valid, legacy, tampered, oversized, dan partial.
- **Action:** preview dan restore.
- **Expected:** valid artifact merge sesuai timestamp; invalid ditolak sebelum mutation; safety snapshot dibuat.
- **Must not:** status success untuk artifact yang reader tidak dapat restore.
- **Verification:** round-trip >250k, checksum/security fixtures, rollback test.
- **Priority:** Required.

### AC-013 — Drive orchestration
- **Scenario:** manual/scheduled Data dan Media, Wi-Fi/cellular, process restart, auth revoke.
- **Action:** start/retry/cancel/takeover/restore.
- **Expected:** unique job/state transition/idempotent commit, progress, safe resume, correct ownership.
- **Must not:** duplicate concurrent upload, auto-send token ke non-Google URL, atau advance due date pada cancel/defer.
- **Verification:** MockWebServer + WorkManager TestDriver + device interruption.
- **Priority:** Required.

### AC-014 — Fresh application isolation
- **Scenario:** prototype dan native build tersedia pada test environment.
- **Action:** install dan gunakan native app dari keadaan kosong.
- **Expected:** native app membuat database/media/backup namespace sendiri dan seluruh feature dapat dibangun dari data baru.
- **Must not:** membaca, mengubah, atau mengasumsikan database, media, backup, token, atau signing identity prototype.
- **Verification:** fresh-install instrumentation + storage/package inspection.
- **Priority:** Required.

### AC-015 — Startup resilience
- **Scenario:** tombstone backlog, interrupted migration, corrupt font/media, DB init failure.
- **Action:** cold start/retry.
- **Expected:** first meaningful paint tidak menunggu bulk cleanup; failure memberi recovery tanpa data mutation.
- **Must not:** blank screen atau unbounded synchronous startup work.
- **Verification:** Macrobenchmark + fault injection.
- **Priority:** Required.

### AC-016 — Accessibility
- **Scenario:** TalkBack, font 1,3×, narrow screen.
- **Action:** jalankan form, filter, nav, media, backup.
- **Expected:** label/state/role benar, touch target >=48 dp kecuali documented visual control dengan expanded hit target, tidak ada critical clipping.
- **Must not:** mengubah golden geometry normal untuk menyembunyikan masalah accessibility.
- **Verification:** Compose accessibility checks + manual TalkBack.
- **Priority:** Important.

### AC-017 — Release safety
- **Scenario:** final signed APK native pada clean device.
- **Action:** install, create data, upgrade antar-build native bila ada, dan reinstall pada test device.
- **Expected:** fresh install stabil; signing/release config reproducible; backup native menjadi satu-satunya jalur restore.
- **Must not:** memasukkan demo seed, secret, atau artifact prototype ke release.
- **Verification:** clean-device release smoke + native backup restore drill.
- **Priority:** Required.

---

## 11. Performance budgets

Budgets awal diuji pada release build physical device mid-range; angka dapat direvisi sekali setelah M1 baseline dengan alasan tertulis.

| Metric | Budget awal |
|---|---:|
| Cold start ke first meaningful Home, DB normal | p95 <= 1.5 s |
| Warm start | p95 <= 500 ms |
| Tab switch tanpa data load baru | p95 <= 100 ms response, animation 240 ms |
| Frame jank user journeys utama | <5% slow frames; 0 frozen frame |
| Initial list DB result | <=50 rows |
| Max page | <=100 rows |
| Search debounce venue | 400 ms, exactly one current request |
| Album 10k | tidak membuat 10k composable/bitmap; scrolling tanpa OOM |
| Full hash | heap mengikuti buffer <=2 MiB, bukan file size |
| Add 1 media ke library 10k Drive | remote metadata verification O(changed/ambiguous), bukan 10k |
| Backup >50 MiB/>250k | round-trip berhasil; peak heap mengikuti chunk/window |
| Startup cleanup | dimulai setelah first paint, batch/time-budgeted |

Evidence wajib: device/build metadata, fixture seed, wall time, heap, query count, network call count, dan raw output.

---

## 12. Test strategy dan quality gates

### Unit

- Money/date/accent/contrast/cursor/filter/sort.
- Membership boundary/timeline/reassignment.
- Event/Trip/Venue validation dan aggregation.
- Backup conflict/checksum/tombstone/version parser.
- Crop/perspective/Instax geometry.
- Drive state machine, cadence, ownership, retry.

### Integration JVM/Room

- Schema/migration export dan `MigrationTestHelper`.
- FK/constraint/transaction rollback.
- DAO paging traversal dan query plan.
- Native backup round-trip dan future Room migration harness.
- Shared media lifecycle.

### Compose UI

- Semantics, empty/loading/error, keyboard, sheet/dropdown, filter state.
- State restoration setelah Activity recreation.
- Screenshot golden per manifest.

### Network/background

- MockWebServer untuk Drive/Geoapify/Unavatar.
- WorkManager test configuration + TestDriver untuk constraints/delay/retry.
- No real paid/external call di default test suite.

### E2E

Maestro pada release-like APK:

1. onboarding dan personalisasi;
2. Group + Idol + overlapping membership + Cheki Type;
3. Venue autocomplete/manual + drinks;
4. multi-country Trip + Expense;
5. Event + multiple Cheki types + photos;
6. verify Home/detail/stat totals;
7. Album add/edit/view/share;
8. theme matrix;
9. local backup/import;
10. Drive manual/schedule/retry/restore;
11. process kill/relaunch dan offline flow.

### Gate command concept

Implementer membuat wrapper `./gradlew qualityGate` yang minimal menjalankan:

- compile debug/release;
- lint;
- unit tests;
- Room migration/import tests;
- Compose instrumentation/screenshot tests;
- baseline profile/macrobenchmark pada fase M10;
- dependency vulnerability review tanpa force downgrade.

Coverage minimum untuk domain/data: 80% lines/branches. UI screenshot/semantics dinilai dengan traceability, bukan angka coverage saja.

---

## 13. Context7-backed implementation conventions

Context7 diverifikasi pada 27 Agustus 2026 terhadap dokumentasi official Android.

### Compose screen state

```kotlin
@HiltViewModel
class EventListViewModel @Inject constructor(
    repository: EventRepository,
) : ViewModel() {
    val uiState: StateFlow<EventListUiState> = repository
        .observeEventListState()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), EventListUiState())
}

@Composable
fun EventListRoute(viewModel: EventListViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    EventListScreen(state = state, onAction = viewModel::onAction)
}
```

Child composable stateless. Lazy list memakai stable `key`; `derivedStateOf` hanya untuk state yang berubah lebih sering daripada kebutuhan UI.

### Room migration evidence

Aktifkan schema export dan uji setiap migration dengan `MigrationTestHelper`; insert fixture pada old version, jalankan migration, lalu verifikasi data dan invariant. Jangan bergantung pada destructive migration untuk user data.

### WorkManager

Gunakan unique work dan constraints:

```kotlin
val request = OneTimeWorkRequestBuilder<DriveBackupWorker>()
    .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
    .addTag("drive:data")
    .build()

workManager.enqueueUniqueWork(
    "drive:data:manual",
    ExistingWorkPolicy.KEEP,
    request,
)
```

Worker transient failure mengembalikan `Result.retry()`. Gunakan TestDriver untuk constraint/delay/period tests. Signature API/version harus dicek ulang melalui Context7 saat dependency dipin.

---

## 14. Instruksi wajib untuk model eksekutor

1. Baca dokumen ini seluruhnya, lalu baca `KOTLIN_NATIVE_EXECUTION_HANDOFF.md`.
2. Kerjakan **satu milestone** per sesi; jangan melakukan broad refactor di luar scope aktif.
3. Sebelum coding, baca source prototype yang ditautkan pada milestone. Jangan hanya memakai PRD.
4. Sebelum memakai API library, resolve/query Context7 untuk versi yang dipin; simpan keputusan di handoff.
5. Tulis test gagal terlebih dahulu untuk business rule, migration, data loss, dan bug regression.
6. Jangan mengubah visual untuk “lebih Android”; targetnya parity.
7. Jangan memuat collection penuh untuk mempermudah implementasi sementara.
8. Jangan menyimpan secret, token, user data, atau raw provider error di source/log/test fixture.
9. Perlakukan native app sebagai fresh application; jangan menambahkan compatibility/cutover code untuk prototype.
10. Setelah milestone: jalankan gate, capture evidence, update progress, tulis limitations/rollback, lalu berhenti untuk review.

### Definition of done sebuah task

- Behavior dan prohibited side effect memiliki test/evidence.
- UI normal/empty/loading/error state tercakup bila relevan.
- Query/file/network work bounded.
- Accessibility label/state tersedia.
- Context7/API reference dicatat bila external dependency dipakai.
- Tidak ada skipped test atau TODO yang mengurangi acceptance required.
- Handoff menyebut file, command, output, limitation, dan rollback.

---

## 15. Final definition of done

Rebuild dianggap selesai hanya bila:

1. M0–M11 selesai dan seluruh AC required lulus.
2. Route/state matrix tidak memiliki `MISSING`, `ASSUMED`, atau screenshot tanpa review.
3. Fresh install dan native backup round-trip berhasil pada clean device.
4. Tidak ada P0/P1 data-loss, restore, security, atau large-data finding terbuka.
5. Release APK signed reproducibly dan fresh-install/native-backup recovery drill didokumentasikan.
6. User menyetujui visual overlay pada baseline dan minimal satu physical Android device.
