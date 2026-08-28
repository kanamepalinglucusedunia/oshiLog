# Default drink logic TDD evidence

Source plan: none. Journeys and acceptance criteria were derived during the `grill-me` decision pass.

## Decisions

- `venue_drink_price.is_default` is the persisted source of truth.
- A venue has at most one active default. Setting another drink automatically replaces the previous default.
- Archiving or deleting the default clears the default; no drink is promoted implicitly.
- Existing rows are not backfilled from the legacy `label = 'Drink'` convention.
- Venue Form's optional Drink Price remains a shortcut: it updates the explicit default or creates one when the venue has none.
- Event Form preselects the default only for a new event. Existing events continue to resolve their saved amount/currency snapshot.

## User journeys and evidence

| # | Guarantee | Test file or command | Result |
|---|---|---|---|
| 1 | A regular active drink can be set as default and replaces the previous default. | `src/repositories/__tests__/repositories.test.ts` | PASS |
| 2 | Default state is independent from the label; archive/delete clears it. | `src/repositories/__tests__/repositories.test.ts` | PASS |
| 3 | Migration adds `is_default`, creates the per-venue unique index, and leaves legacy `Drink` rows unset. | `src/db/__tests__/migration.test.ts` | PASS |
| 4 | Venue Form updates the explicit default and creates a default when none exists. | `src/components/forms/__tests__/VenueForm.test.tsx` | PASS |
| 5 | Manage Drinks exposes a Set as default action and refreshes the detail screen. | `src/app/venue/__tests__/detail.test.tsx` | PASS |
| 6 | New Event Form preselects a venue default drink. | `src/components/forms/__tests__/EventForm.test.tsx` | PASS |
| 7 | Data restore reconciles a local default before applying a backup default. | `src/services/__tests__/backup.test.ts` | PASS |

## TDD run

- RED: the focused suite failed with 5 suites and 8 tests failing before production changes (`isDefault` and `setDefaultDrinkPrice` were intentionally missing).
- GREEN: the focused suite passed with 5 suites and 82 tests.
- Regression: the complete suite passed with 88 suites and 767 tests.
- Coverage: `npm run test:coverage` passed with 84.65% statements, 76.12% branches, 85.25% functions, and 87.47% lines. The repository's configured global branch threshold is 60%; branch coverage remains below the aspirational 80% skill target because of existing unrelated paths.
- Typecheck: `npm run typecheck` passed.
- Lint: `npm run lint` passed.
- Graph: `graphify update .` completed; the known five zero-node config-file warning remains.
