# M0 known prototype risks

These are evidence-backed hazards to avoid, not behaviors to reproduce.

| ID | Risk | Evidence/impact | Native guardrail |
|---|---|---|---|
| R-001 | Invalid visual seed ownership | Yuki's event falls back to Hoshino's cheki type and production trigger aborts startup with `invalid cheki relation` | Typed fixture builders; FK/ownership validation; seed test must launch release DB |
| R-002 | Membership-date ambiguity in seed | Hinata's 2026 Lumière event was associated with a membership ending in 2023; current SQL trigger checks ownership but not event-date validity | Enforce date validity in domain transaction and test historical/solo reassignment |
| R-003 | Installed build drift | Existing `com.oshilog.app` reported `0.2.0-kotlin`, did not match active source `0.1.0`, and black-screened | Golden evidence always records source/build hash and uses isolated package |
| R-004 | Backup writer/reader admissibility drift | A manifest can be produced by one path but rejected or interpreted differently by another | One versioned contract, golden fixtures, property tests and round-trip gate |
| R-005 | Shared-media deletion | One physical asset may be referenced by multiple domain rows; naïve deletion can break remaining references | Reference-count/ownership query in one transaction; delete file only after final reference |
| R-006 | Partial hash trust | Hashes/metadata can become stale or cover only part of backup/media content | Stream and verify every payload; seal canonical manifest; reject before DB mutation |
| R-007 | Startup cleanup can race recovery | Cleanup of staging/temp/orphan files during startup may remove evidence needed for retry | Explicit staging lifecycle, age/ownership checks and crash-recovery tests |
| R-008 | Drive O(N) scans | Repeated remote listing/history/media reconciliation grows linearly and can become slow/costly | App-owned folder, indexed manifest, page tokens/deltas, bounded reconciliation |
| R-009 | Release dependency drift | Debug can work while release bundle/native modules fail or show debug-only overlays | Release build/install/smoke is mandatory per milestone; pin versions and lock files |
| R-010 | Long Windows native build paths | CMake/native modules fail or become fragile under the long workspace path | Keep native target paths short enough; CI builds from a short checkout; no prototype junction dependency |
| R-011 | Currency aggregation | Combining IDR and JPY as one number creates false totals | Store integer minor units plus currency; group every aggregate by currency |
| R-012 | Historical identity mutation | Renaming idols/groups/types can rewrite how old events appear if snapshots are absent | Immutable display snapshots on event/media records; migration and edit tests |
| R-013 | Overlapping membership main flags | Concurrent/overlapping memberships can produce multiple “main” records | Transactional overlap rules and database constraints/tests |
| R-014 | Background backup duplication | Re-registering periodic tasks can create duplicate uploads/notifications | WorkManager unique work, idempotency keys and persisted run ownership |
| R-015 | UI parity lost to Material defaults | Standard Compose components differ in padding, typography, radius and elevation | Custom primitives driven by measured tokens and golden pixel-diff gates |

No risk above is waived by M0. Each relevant milestone must link its mitigation evidence before closing.
