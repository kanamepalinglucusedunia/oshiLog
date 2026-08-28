# M0 feature behavior contract

This checklist freezes externally observable behavior from the active prototype source and tests. “Internal improvement” means Kotlin may use a better native implementation while preserving the same user-visible result. No old-app data migration is in scope.

## Preserve exactly

| Area | Required behavior | Primary evidence |
|---|---|---|
| First run | Three-step Country → Surface Style → Accent flow; at least one country; JP and ID initially selected; validated custom HEX; completion persists | `src/app/onboarding.tsx`, startup tests, onboarding goldens |
| Navigation | Home, Idol/Group, Event, Venue, Trip bottom navigation; settings, stats, detail/edit and quick-action routes | `src/app/**`, route inventory |
| Idol | Create/edit/soft-delete, favorite, country/region/status/birthday/member color, social links, membership history and name history | `src/repositories/idol.ts`, `src/services/idolSave.ts`, idol tests |
| Group | Create/edit/soft-delete, favorite, location, debut/end dates, social links, member list and member statistics | group screens/tests, aggregation service |
| Membership | Multiple historical memberships; date/status periods; main-membership overlap guard; affected cheki reassignment before destructive date changes | `membership.ts`, `membershipGuard.ts`, `membershipTimeline.ts`, tests |
| Cheki type | Type belongs to exactly one idol; currency and unit price preserved; invalid prices rejected | schema triggers, repository/service tests |
| Event | Atomic create/update/delete with ticket/drink costs and one-or-more cheki entries; entry snapshots preserve historical names/labels | `repositories/event.ts`, `services/event*.ts`, tests |
| Event relation | Cheki type must belong to selected idol and match currency/unit price; membership, when present, must belong to idol | schema relation triggers, migration/repository tests |
| Venue | Create/edit/detail/search; country/region; multiple drink prices; one default; event count/history | venue repository/service/screens/tests |
| Trip | Create/edit/detail; start/end/countries/description; expenses; linked events; status derived from dates | trip repository/screens/tests |
| Home | Per-currency activity totals, cheki/event/trip counts, month calendar, event dates, ongoing/passed trip card | dashboard/activity-summary services and Home golden |
| Stats | Time-range and entity aggregation without combining currencies into a fake converted total | aggregation/activity-summary tests and Stats golden |
| Lists | Search, favorites, country/region filters, entity-specific sort/order, result count and cursor pagination | `mainListFilter.ts`, `mainListSort.ts`, pagination tests, filter goldens |
| Album/media | Idol album tabs and filters, direct and event-linked media, stable snapshots, add/view/share/delete/edit actions | media services/repository tests and Album golden |
| Appearance | Light/dark/system theme, outline/soft-shadow surfaces, accent presets/custom accent, Nunito typography and current geometry | theme store/hook, design system, settings/onboarding goldens |
| Settings | Country/region activation, language screen, member-color management, appearance, backup and credits | settings repositories/screens/goldens |
| Local backup | Versioned, validated, integrity-sealed data manifest; media inventory handled separately; restore is all-or-nothing | backup services/tests |
| Drive backup | Connect/disconnect lifecycle, data/media backup, restore, retention/history, network awareness, notifications and scheduled execution | `src/drive/**`, hooks, tests |
| Reliability | Fresh database startup, migrations, soft-deletion filtering, transactional writes and user-facing startup recovery | schema/migration/startup tests |

## Preserve behavior, improve internals natively

| Prototype mechanism | Kotlin-native direction | Non-negotiable parity |
|---|---|---|
| Expo SQLite repositories | Room entities/DAO/transactions with explicit foreign keys, indices and migration tests | schema invariants, atomicity, soft-delete semantics |
| Zustand/settings persistence | DataStore for preferences; Room for domain data | same defaults and persisted choices |
| JS list pagination/cache | Paging 3 + Flow with SQL-backed filters/sorts | same order, filter counts and no duplicate/missing rows |
| Expo image/media APIs | Android Photo Picker, scoped storage, Coil and Media3 as appropriate | media ownership, snapshots, edit/share/delete behavior |
| Expo background tasks | WorkManager unique periodic work with constraints and idempotency | schedule state, retry/notification semantics, no duplicate jobs |
| Nitro Google sign-in/Drive code | Credential Manager/Google Identity plus Drive REST client behind interfaces | visible connection and backup state machine |
| JS manifest/hash processing | Streaming Kotlin serialization and SHA-256; staged atomic restore | compatibility within the new native app, validation before mutation |
| JS aggregation | Indexed Room SQL and precomputed/query projections where measured | exact per-currency results under large fixture |
| Runtime styling | Compose custom primitives/tokens, not default Material geometry | pixel-level hierarchy, spacing, radius, color and z-order |

All Android/Kotlin implementation choices must be checked against current Context7 documentation at implementation time. Source code remains the product contract if a library example conflicts with observable behavior.

## Not relevant to the new app

- Importing or migrating installed prototype data.
- Reusing prototype signing identity, package id, database file, backup format, media directory or auth tokens.
- iOS and web runtime support.
- Expo Router, React Native bridge, Metro, EAS and developer-menu behavior.
- `/dev/google-drive-auth-spike` as a production screen; only its proven auth requirements may inform the native integration.
- Matching known defects, invalid synthetic data, debug overlays, transient status-bar time or an unrelated installed `0.2.0-kotlin` package.

## Definition of feature parity

A feature is not complete merely because its main screen opens. It is complete only when CRUD/state transitions, validation, empty/error/loading states, persistence after relaunch, accessibility labels, golden visual state and relevant unit/instrumentation/performance evidence all pass.
