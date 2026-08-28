# M0 gate report — COMPLETE

**Closed:** 28 Agustus 2026  
**Scope:** freeze reproducible visual and feature contract from the active prototype source.

## Exit criteria

| Criterion | Result | Evidence |
|---|---|---|
| Chosen prototype build/session identity | PASS | `M0_SOURCE_SNAPSHOT.json`; branch `main`, HEAD `db1833c…`, tracked diff `c3899c…`, source/package-lock hashes |
| Deterministic small visual fixture | PASS | `M0_FIXTURE_CONTRACT.json`; release runner package `com.oshilog.prototype.m0` |
| Deterministic large performance fixture | PASS | 100,000 event/entry target seed 12345 and 10,000 album target seed 98765 |
| Route/state inventory with owner/evidence | PASS | 34 states; automated validation found 0 missing owners/screens |
| Golden primary screens/states | PASS | 33 unique 900×2000 PNGs; every manifest SHA-256 verified |
| Feature behavior classification | PASS | preserve / improve internals / not relevant in `M0_FEATURE_BEHAVIOR_CHECKLIST.md` |
| Known risk register | PASS | 15 risks with native guardrails in `M0_KNOWN_RISKS.md` |
| Golden manifest approved | PASS | `M0_GOLDEN_MANIFEST.json` approved for native implementation after release capture, hierarchy inspection and visual spot checks |
| No runtime/data dependency on prototype | PASS | separate package and synthetic Android user; no original DB/media/token/signing access; synthetic user removed |

## Verification results

- Prototype `npm run typecheck`: PASS.
- Prototype `npm test -- --runInBand`: PASS — 111/111 suites, 901/901 tests.
- Test warnings: several React UI tests log overlapping/unwrapped `act()` warnings; these are recorded as test-harness debt, not failed assertions.
- Inventory/manifest verifier: `states=34 files=33 errors=0`.
- Active prototype identity after audit: branch/HEAD unchanged, dirty entries remain 68, `git diff HEAD` hash remains `c3899c75aae2c4098795cf6b4d591b47da125207`.
- Release capture APK: `m0/artifacts/prototype-m0-fixture-release.apk`, SHA-256 `9FB6614108B19D6968D3310047F776AB82ACC47E683617C506CAC934479A215B`.
- Emulator restored to owner, physical 1080×2400 / 420 dpi, animation scales 1; synthetic user 10 removed and emulator stopped.

## Important baseline interpretation

- The 33 goldens freeze UI geometry/content, not known data bugs or system status-bar time.
- Runner-only fixture corrections are documented and must not become product behavior.
- Dynamic routes use route templates plus seeded-card actions; native ids need not match prototype UUIDs.
- The developer Drive auth spike is source evidence only and has no production screenshot requirement.
- Context7 is mandatory when selecting/using Kotlin and Android APIs during implementation milestones; M0 itself freezes source behavior and contains no new production API implementation.

## Gate decision

M0 is **DONE**. M1 becomes the active milestone. M1 must consume these contracts and must not recapture or reinterpret them unless the user explicitly changes the product baseline.
