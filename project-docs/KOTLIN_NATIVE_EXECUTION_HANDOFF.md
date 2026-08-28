# oshiLog Kotlin Native — Execution Handoff

Dokumen ini adalah entry point singkat bagi model implementer. Kontrak lengkap berada di `project-docs/KOTLIN_NATIVE_REBUILD_MASTER_PLAN.md`.

## Mandatory read order

1. `C:\Users\chimuchimu\App\oshiLog\project-docs\KOTLIN_NATIVE_REBUILD_MASTER_PLAN.md`
2. `C:\Users\chimuchimu\App\oshiLog\project-docs\KOTLIN_NATIVE_PROGRESS.md`
3. `C:\Users\chimuchimu\App\oshiLog\project-docs\m0\M0_GATE_REPORT.md`
4. `C:\Users\chimuchimu\App\oshiLog\project-docs\m0\M0_ROUTE_STATE_INVENTORY.json`
5. `C:\Users\chimuchimu\App\oshiLog\project-docs\m0\M0_FEATURE_BEHAVIOR_CHECKLIST.md`
6. Bagian prototype dan audit/tes yang disebut oleh milestone aktif.

## Current entry point: M1 foundation, then continue M2

M0 telah ditutup dengan 34-state inventory dan 33 approved release goldens. Scaffold dan first runnable vertical slice juga sudah ada. Jangan membuat scaffold kedua, mengganti package/build system, atau meregenerasi M0 tanpa keputusan pengguna.

1. Pertahankan project Kotlin/Compose yang sudah dapat dibuka dan package debug `com.oshilog.app.native.dev`.
2. Gunakan `project-docs/m0/M0_ROUTE_STATE_INVENTORY.json` dan `M0_GOLDEN_MANIFEST.json` sebagai frozen parity contract.
3. Selesaikan M1 yang tersisa: dependency architecture sesuai master plan, startup fallback, static/coverage gate, serta error/clock/UUID/dispatcher boundaries.
4. Lanjutkan M2 dari token/onboarding/shell yang ada; jangan mengklaim visual parity sebelum diff/overlay terhadap M0 goldens lulus.
5. Jangan menyalin database, backup, media nyata, token, atau signing identity prototype.
6. Update progress setiap gate. Perubahan baseline memerlukan keputusan pengguna, bukan recapture diam-diam.

## Session prompt template

Gunakan prompt berikut untuk setiap milestone:

```text
Anda mengimplementasikan oshiLog native Android di C:\Users\chimuchimu\App\oshiLog.

Baca penuh:
1) project-docs/KOTLIN_NATIVE_REBUILD_MASTER_PLAN.md
2) project-docs/KOTLIN_NATIVE_EXECUTION_HANDOFF.md
3) project-docs/KOTLIN_NATIVE_PROGRESS.md

Milestone aktif: <M-ID dan nama>.

Prototype referensi berada di C:\Users\chimuchimu\App\oshiLog V2. Keputusan pengguna dan master plan native adalah kontrak utama. Source aktif dipakai untuk inventaris fitur—termasuk dark mode dan scheduled Drive backup—serta golden visual, bukan untuk kompatibilitas database atau penyalinan bug. Pertahankan seluruh perubahan pengguna. UI tidak boleh didesain ulang.

Sebelum coding:
- catat git/status baseline kedua workspace;
- baca semua source/test yang ditautkan milestone;
- query Context7 untuk API dependency yang akan digunakan;
- tulis acceptance checklist dan test RED.

Implementasikan hanya scope milestone aktif. Gunakan Kotlin, Jetpack Compose, Room, Flow, dan pendekatan bounded/paged sesuai master plan. Setelah selesai jalankan targeted test lalu quality gate. Capture screenshot diff bila UI tersentuh. Update KOTLIN_NATIVE_PROGRESS.md dengan file, command, hasil, limitation, rollback, dan next gate. Jangan menandai DONE bila required evidence belum ada.
```

## Required handoff format

```markdown
### <M-ID> implementation evidence
- Baseline/source snapshot:
- Scope completed:
- Files changed:
- Context7 references used:
- RED evidence:
- GREEN evidence:
- Full gate:
- Visual diff:
- Performance/query evidence:
- Known limitations:
- Rollback:
- Status: IN_PROGRESS | IMPLEMENTED_AWAITING_REVIEW | DONE
```

## Hard stops

Stop dan minta keputusan pengguna bila:

- baseline prototype berubah di tengah milestone;
- Figma/source/token memberi dua geometry yang bertentangan;
- golden screenshot/state reference saling bertentangan;
- native backup atau future native migration memerlukan destructive behavior;
- API/library tidak memiliki stable compatible version;
- visual parity hanya dapat dicapai dengan mengurangi accessibility atau data safety;
- test menemukan behavior prototype yang saling bertentangan dan source/test tidak menentukan pemenang.

## Never do

- Jangan membaca/mengimpor database, backup, token, media, atau signing identity prototype.
- Jangan `fallbackToDestructiveMigration` untuk upgrade native berikutnya.
- Jangan hardcode credential/API key.
- Jangan filter/sort list besar di Compose/ViewModel.
- Jangan menggunakan floating point untuk uang.
- Jangan menghapus media hanya berdasarkan `mediaAssetId` global.
- Jangan menganggap screenshot mirip sebagai bukti 100% parity.
- Jangan menambah feature baru selama parity rebuild.
