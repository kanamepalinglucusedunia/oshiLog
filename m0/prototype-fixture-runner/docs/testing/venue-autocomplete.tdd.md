# Venue Autocomplete — TDD Evidence Report

**Date:** 2026-08-13
**Source plan:** [VENUE_AUTOCOMPLETE_IMPLEMENTATION_PLAN.md](../../VENUE_AUTOCOMPLETE_IMPLEMENTATION_PLAN.md)
**Provider:** Geoapify Address Autocomplete API (direct client calls, zero backend)

## User journeys

- As a user, I want to search for a venue or address from the Venue form, so that I can prefill Venue Name, Country, Region, and Address instead of typing them.
- As a user, I want to review and edit every autofilled field before saving, so that I keep full control over the saved record.
- As a user, I want venue search to fail gracefully (offline, rate limit, no key, provider error), so that manual venue entry always remains available.
- As a user, I want provider location data to carry attribution, so that Geoapify and OpenStreetMap terms are honored.

## Milestone evidence

### Milestone 0 — Preflight and baseline

- Package manager: npm; runner: Jest via `jest-expo` preset (`npm test`, `npm run test:coverage`).
- Baseline targeted suites before edits: `VenueForm`, `venue detail`, `startup`, `repositories`, `backup` — **5 suites, 54 tests, all PASS** (no pre-existing failures).
- Geoapify contract rechecked against `https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/`: endpoint, `text/format/limit/lang/filter/apiKey` parameters, and GeoJSON `properties` fields (`place_id`, `name`, `address_line1/2`, `formatted`, `country_code`, `state`, `county`, `city`) match the plan's integration contract. No contract change found.
- Secret scan: no real API key present in repository files (only the env-var name inside the plan/README documentation).

### Milestone 1 — Provider contract and normalizer

- **RED:** `npx jest --runInBand --runTestsByPath src/services/__tests__/venueSearch.test.ts`
  - Failure excerpt: `Cannot find module '../venueSearch' from 'src/services/__tests__/venueSearch.test.ts'` (23 tests, module missing).
- **GREEN:** same command after creating `src/services/venueSearch.ts` → `Tests: 23 passed, 23 total`.
- Guaranteed by the passing tests: query length bounds (3–120 after trim), `NOT_CONFIGURED` without key, encoded HTTPS URL with `limit=5`, `lang=en`, deduplicated lowercase `filter=countrycode:...`, injected abort signal forwarded to `fetch`, name/region/address fallback precedence, per-feature discard rules (place_id, name, address, unsupported/inactive country), and status classification (401/403 → UNAUTHORIZED, 429 → RATE_LIMITED, 5xx/other → PROVIDER_UNAVAILABLE, network → NETWORK, abort → silent ABORTED, malformed/structural JSON → INVALID_RESPONSE). Errors never contain response bodies, stacks, or the key.

### Milestone 2 — Search bottom sheet behavior

- **RED:** `npx jest --runInBand --runTestsByPath src/components/forms/__tests__/VenueSearchBottomSheet.test.tsx`
  - Failure excerpt: `Cannot find module '../VenueSearchBottomSheet'` (18 tests, module missing).
- **GREEN:** same command after creating `src/components/forms/VenueSearchBottomSheet.tsx` → `Tests: 18 passed, 18 total`.
- Guaranteed: no request below 3 characters, single request after 400 ms debounce, previous request aborted on query change, three skeleton rows while loading, result rows with semantic labels (name + address), empty state with spelling hint, all six typed error states mapped to the plan's exact user-safe strings, explicit `Try again` retries only the current query, stale responses cannot replace newer results, closing aborts/resets and emits no selection, selection emits exactly once and closes, attribution links open the documented URLs.

### Milestone 3 — Venue form integration and persistence

- **RED:** `npx jest --runInBand --runTestsByPath src/components/forms/__tests__/VenueForm.test.tsx`
  - Failure excerpt: `Unable to find an element with accessibility label: Find venue or address` (6 new tests failed; 5 pre-existing tests stayed green).
- **GREEN:** same command after integrating the button, sheet, field mapping, and persistence type → `Tests: 11 passed, 11 total`.
- Guaranteed: button visible with no search UI until pressed; Venue Name typing never calls the provider and the sheet opens with an empty search field; closing without selecting leaves all values unchanged; selecting a complete result fills all four fields without auto-submitting; edited values (including Address) reach `onSubmit`; missing Region shows the notice and existing required-validation blocks Save; `createOrUpdateVenue` persists Address; the migration flow (`createVenueAndMigrate`) receives the complete `VenueFormValues` payload including Address.

### Milestone 4 — Attribution, configuration, documentation

- **RED:** `src/app/venue/__tests__/detail.test.tsx` attribution test → `Unable to find an element with accessibility label: Powered by Geoapify` (1 new test failed, 3 pre-existing stayed green).
- **GREEN:** after adding `LocationDataAttribution` below the saved address → `Tests: 4 passed, 4 total`.
- Created: `src/components/ui/LocationDataAttribution.tsx` (theme/token based, reused by the search sheet and the detail screen), `.env.example`, README setup/offline/public-key notes, SECURITY.md zero-backend key section. Missing-key behavior covered at the service level (`NOT_CONFIGURED`) and the sheet level (user-safe UI) — no key is needed for startup or manual Venue creation.

### Milestone 5 — Refactor and full verification

- Refactor: moved reset-on-visibility to render-phase state adjustment; `runSearch`/`abortInFlight` memoized; region-notice dismissal moved into the `onRegionChange` handler to satisfy `react-hooks/set-state-in-effect` and `react-hooks/refs`. Lint: **0 errors, 0 warnings**. Typecheck: clean.
- Added new files to Jest `collectCoverageFrom`.

## Test guarantee table (AC mapping)

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| AC-001 | `Find venue or address` button present; no search UI until pressed; manual fields intact | `VenueForm.test.tsx: renders the Find venue or address button...` | PASS |
| AC-001A | Venue Name typing never requests; sheet opens with empty field | `VenueForm.test.tsx: never sends provider requests...` | PASS |
| AC-002 | 0–2 character queries make no request; helper visible | `VenueSearchBottomSheet.test.tsx: does not call the provider...` | PASS |
| AC-003 | One request after 400 ms with limit/lang/active-country filter | `VenueSearchBottomSheet.test.tsx: fires exactly one request...`; `venueSearch.test.ts: builds an HTTPS URL...` | PASS |
| AC-004 | Normalized `{id,name,country,region,address}` with fallback precedence | `venueSearch.test.ts: maps a valid feature...`, region/name/address fallback tests | PASS |
| AC-005 | Invalid/inactive/unsupported features dropped individually | `venueSearch.test.ts: drops features...` | PASS |
| AC-006 | Explicit selection fills all four fields, validates, closes, no auto-save | `VenueForm.test.tsx: selecting a complete result...` | PASS |
| AC-007 | Autofilled values editable; edited Address persists | `VenueForm.test.tsx: keeps selected values editable...`, `persists the address through createOrUpdateVenue` | PASS |
| AC-008 | Missing Region notice + required validation blocks Save | `VenueForm.test.tsx: shows the missing-Region notice...` | PASS |
| AC-009 | Closing/`Enter manually` leaves form unchanged | `VenueForm.test.tsx: closing search without selecting...` | PASS |
| AC-010 | Latest request wins over stale responses | `VenueSearchBottomSheet.test.tsx: ignores a stale response...` | PASS |
| AC-011 | Closing aborts, resets, no post-close state update | `VenueSearchBottomSheet.test.tsx: closing the sheet aborts...` | PASS |
| AC-012 | All provider failure states user-safe; manual entry intact | `venueSearch.test.ts: error classification...`; `VenueSearchBottomSheet.test.tsx: maps error ...` (it.each × 6) | PASS |
| AC-013 | Missing config does not affect startup/manual entry | `venueSearch.test.ts: returns NOT_CONFIGURED...`; startup suite green; sheet `NOT_CONFIGURED` UI | PASS |
| AC-014 | Attribution visible, accessible, links work | `VenueSearchBottomSheet.test.tsx: opens the Geoapify and OpenStreetMap attribution links`; `detail.test.tsx: shows the location-data attribution...` | PASS |
| AC-015 | Design-system compliance (tokens, AppText, existing icons) | Code review: `useTheme()`/`theme.surface`/`theme.color`/`AppText`/`Icon search` only; no hex values in new UI files; visual review pending physical device | PASS (review) |
| AC-016 | Zero backend; no proxy/database/auth added | Diff review: only `fetch` + Geoapify; repository search for server/cloud code | PASS (review) |
| AC-017 | No schema change; existing suites stay green | Repositories, backup, migration, startup suites: 54→54 PASS | PASS |
| AC-018 | Provider quality on target countries | **Not executed** — requires a real non-production key + physical device. See Known gaps. | PENDING |

## Coverage result

- New files (per-file): `venueSearch.ts` 95% stmts / 95.3% branch / 100% funcs / 96.2% lines; `VenueSearchBottomSheet.tsx` 94.8% / 88.9% / 94.4% / 94.3%; `LocationDataAttribution.tsx` 100% (all above the 80% expectation).
- Global: statements 79.31 (threshold 68), branches 68.41 (60), functions 76.1 (60), lines 81.99 (70) — thresholds unchanged and exceeded.
- No skipped, focused, or disabled tests. All provider payloads in tests are synthetic with a fake key.

## Verification commands (all PASS)

```
npm test -- --runInBand                        → 31 suites, 278 tests
npm run lint                                   → 0 errors, 0 warnings
npm run typecheck                              → clean
npm run test:coverage                          → thresholds met (above)
npm run deps:check                             → Dependencies are up to date
npm run doctor                                 → 20/20 checks passed
npm run verify                                 → all of the above green
```

## Security review checklist

- [x] No real API key in tracked files or test output (source scan clean; only documented placeholder text).
- [x] No API key logged; no full provider URL logged; no user query logged.
- [x] Query length bounded (3–120), URL built with `URLSearchParams`, response validated with `zod` before use.
- [x] Only supported country codes reach the form; provider errors mapped to generic local messages; no response body/stack in UI.
- [x] No automatic retries (retry is user-triggered only); previous requests aborted; late responses ignored (sequence guard).
- [x] Dedicated key, quota, monitoring, and rotation documented in `SECURITY.md`; README states the client key is extractable.
- [ ] Provider storage/attribution/plan terms rechecked before release (flagged in the plan; recheck at release time).

## Manual smoke matrix and device QA

- **Provider smoke matrix (AC-018):** NOT EXECUTED. Requires a dedicated non-production Geoapify key on a physical device. The 20-query sample from the plan is ready to run; the release decision rule (18/20 in top five results) applies.
- **Physical-device QA (§16 checklist):** NOT EXECUTED. Requires an Android device and optionally a key. Keyboard, sheet behavior, network states, and real provider quality remain to be validated on hardware.

## Known gaps

- AC-018 and the manual device QA checklist are pending; the automated suites prove behavior only with mocked provider responses.
- The 8-second client timeout path (timeout → NETWORK state) is implemented but not directly exercised by an automated test (hard to fake deterministically); the abort/sequence machinery it shares is covered.
- Graphify: `graphify update .` completed successfully (4255 nodes, 6312 edges rebuilt); the pre-existing "5 source files produced zero nodes" warning (config JSON files) is unrelated to this feature.

## Final diff review summary

Scoped changes only: new `src/services/venueSearch.ts` + test; new `src/components/forms/VenueSearchBottomSheet.tsx` + test; `VenueForm.tsx` + test (search button, sheet wiring, field mapping, missing-Region notice, persistence input type `VenueFormValues`); new `src/components/ui/LocationDataAttribution.tsx`; `src/app/venue/[id].tsx` + test (attribution below saved address); `package.json` (coverage collection only — no dependency); `.env.example`, `README.md`, `SECURITY.md`; this report. No changes to `src/db/schema.ts`, `src/types/domain.ts`, `src/repositories/venue.ts`, `src/services/backup.ts`, `app.json`, or native projects. No database migration, no new dependency, no location permission.
