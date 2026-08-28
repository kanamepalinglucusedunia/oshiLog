# Venue detail Figma implementation — TDD evidence

Source plan: journeys were derived from the requested Figma node `259:11696` and the existing idol Cheki History behavior.

## User journeys

- As a user, I want venue details to match the Figma layout, so the venue name/location, visit counter, drink summary, and visit history are easy to scan.
- As a user, I want the drink table hidden when no drink is registered, so an empty card does not take space.
- As a user, I want Visit History to filter by month/year and toggle sort order like idol Cheki History, so I can find a visit quickly.
- As a user, I want the page to scroll until Visit History fills the viewport, then scroll only the history list, so the title, filters, sort button, and separator remain fixed.

## RED/GREEN evidence

- RED: the new helper test could not resolve the missing `@/services/venueDetail` module, and the screen tests could not find the new venue history test IDs.
- GREEN: `npm test -- --runInBand src/services/__tests__/venueDetail.test.ts src/app/venue/__tests__/detail.test.tsx` — 2 suites, 9 tests passed.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result |
|---|---|---|---|---|
| 1 | Drink visit snapshots aggregate by currency/price into count and total. | `src/services/__tests__/venueDetail.test.ts` | unit | PASS |
| 2 | The drink table is omitted when no drink amount is registered. | `src/app/venue/__tests__/detail.test.tsx` | component | PASS |
| 3 | Visit History exposes fixed controls, a separator, and a nested scroll list with a viewport-derived height. | `src/app/venue/__tests__/detail.test.tsx` | component | PASS |
| 4 | Month filtering removes visits outside the selected month. | `src/app/venue/__tests__/detail.test.tsx` | component | PASS |

## Verification

- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `npm test -- --runInBand` — 88 suites, 760 tests passed
- `npm run test:coverage` — PASS; global statements 84.41%, branches 75.67%, functions 84.62%, lines 87.18%

Known gap: nested scroll handoff is asserted through the React Native `nestedScrollEnabled`/bounded-list configuration; a physical-device gesture smoke test remains useful for platform-specific scroll physics.

## Follow-up regression: blank venue body

- RED: the venue detail render had no `Screen` content test ID, and the regression test could not verify a bounded content wrapper.
- GREEN: `npm test -- --runInBand src/app/venue/__tests__/detail.test.tsx` — 1 suite, 9 tests passed.
- Current verification: `npm test -- --runInBand` — 88 suites, 768 tests passed; coverage — 84.65% statements, 76.12% branches, 85.25% functions, 87.47% lines.

## Follow-up: inline drink price management

- RED: the focused tests exposed the old nested `New Drink Price` modal, label-based actions, missing delete controls, and an unguarded repository delete path.
- GREEN: `npm test -- --runInBand src/app/venue/__tests__/detail.test.tsx src/repositories/__tests__/repositories.test.ts` — 2 suites, 41 tests passed.
- The component tests guarantee inline creation with venue-derived currency, null labels, label-free display, and delete visibility only for unused prices.
- The repository test guarantees active venue visits prevent deletion of a matching drink price.

## Follow-up: formatted money inputs

- RED: the money utility and venue detail regression tests failed because editable values were not formatted as the user typed.
- GREEN: `npm test -- --runInBand src/app/idol/__tests__/detail.test.tsx src/app/venue/__tests__/detail.test.tsx src/utils/__tests__/money.test.ts src/components/forms/__tests__/VenueForm.test.tsx src/components/forms/__tests__/EventForm.test.tsx` â€” 5 suites, 50 tests passed.
- `formatMoneyInput` keeps comma thousands separators, dot decimals, unfinished decimal input, and currency-specific precision while preserving invalid fractional input for whole-number currencies so validation still works.
- Venue drink prices, venue default drink price, event drink/ticket/cheki prices, trip expenses, and Idol cheki type prices use the formatter while editing.
- Current verification: `npm run typecheck` â€” PASS; `npm run lint` â€” PASS; `npm run test:coverage` â€” 88 suites, 772 tests passed; 84.64% statements, 76.07% branches, 85.14% functions, 87.48% lines.
- Current verification: `npm test -- --runInBand` — 88 suites, 771 tests passed; `npm run test:coverage` — 84.65% statements, 76.13% branches, 85.26% functions, 87.49% lines.
## Current verification

- Formatter changes: typecheck PASS, lint PASS, and 88 suites / 772 tests passed.
- Coverage: 84.64% statements, 76.07% branches, 85.14% functions, 87.48% lines.
