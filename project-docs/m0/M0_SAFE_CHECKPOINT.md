# M0 safe checkpoint

> Historical checkpoint only. It was superseded by the completed gate in `M0_GATE_REPORT.md` later on 28 Agustus 2026.

**Checkpoint:** 28 Agustus 2026, after successful release audit build

## Stable assets

- Prototype source identity is frozen in `M0_SOURCE_SNAPSHOT.json`.
- Deterministic fixture contract is frozen in `M0_FIXTURE_CONTRACT.json`.
- Isolated audit runner is at `m0/prototype-fixture-runner`; original prototype source/data were not edited.
- Latest x86_64 release audit APK is `m0/artifacts/prototype-m0-fixture-release.apk`, SHA-256 `9FB6614108B19D6968D3310047F776AB82ACC47E683617C506CAC934479A215B`.
- Existing valid primary captures are under `visual-baseline/prototype/m0-golden`.

## Important evidence

- The original deterministic seed violates `validate_cheki_relation_insert`: Yuki Mizuki has no cheki type and falls back to Hoshino Hinata's type. A runner-only Yuki type fixes ownership. A separate runner correction ungroups Hinata's 2026 Lumière entry because her membership ended in 2023. Both must be retained as prototype fixture risks, not copied into Kotlin.
- An older installed package reported `0.2.0-kotlin` while the active source reports `0.1.0`; it produced a black screen and is excluded from golden evidence.
- `onboarding-step-1.png` currently in the golden folder is invalid because the previous runner redirected completed onboarding to Home. The newly built runner fixes direct capture; overwrite this file before approving the manifest.

## Exact resume point

1. Start `Pixel_8a`, recreate/select an isolated synthetic Android user, and reapply the capture environment (900x2000 px, density 400, font scale 1, animations off, `en-US`, Asia/Jakarta).
2. Install the checkpoint APK only for that user and clear only `com.oshilog.prototype.m0` in that user.
3. Capture onboarding steps 1–3, then dynamic detail/edit/album states by tapping seeded list rows.
4. Build and validate route/state inventory, golden manifest, behavior checklist, and risk register.
5. Run original-source typecheck/tests read-only, verify JSON/hash coverage, restore emulator settings/remove synthetic user, then close M0.

## Current gate

At this checkpoint M0 was **not complete**. The outstanding work listed above was subsequently completed; current status is recorded in `M0_GATE_REPORT.md`.
