# Event detail card TDD evidence

Source plan: none. User journeys and acceptance criteria were derived from the supplied Figma node `504:5637` and the attached event-detail reference image.

## User journey

As an oshiLog user, I want the event detail summary and spending breakdown presented as one Figma-aligned card, so that the event context and total cost are easy to scan together.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The card renders the date header, title/location, dashed ticket divider with both notches, spend rows, and combined total. | `src/components/ui/__tests__/EventDetailCard.test.tsx` | component | PASS |
| 2 | The card uses the theme surface border/radius and renders readable empty money values. | `src/components/ui/__tests__/EventDetailCard.test.tsx` | component | PASS |
| 3 | The real event detail screen renders the combined card before cheki entry cards with venue/location and total values. | `src/app/event/__tests__/detail.test.tsx` | integration | PASS |

## Execution evidence

- RED: `npm test -- --runInBand src/components/ui/__tests__/EventDetailCard.test.tsx src/app/event/__tests__/detail.test.tsx` failed because the new card module was missing and the existing screen had no `event-summary-card`.
- GREEN: the same focused command passed with 2 suites and 3 tests.
- Typecheck: `npm run typecheck` passed.
- Lint: `npm run lint` passed.
- Full coverage: `npm run test:coverage` passed with 103 suites and 872 tests; global coverage was 85.09% statements, 76.08% branches, 87.53% functions, and 88.41% lines.
- Graph refresh: `graphify update .` completed and rebuilt the project graph.

## Checkpoints

- `91378bf test: add event detail card red coverage`
- `9687d71 fix: match event detail card design`

Known gap: no native-device screenshot test was available in this workspace; visual structure is covered through the extracted Figma metadata, component styles, and screen-level rendering assertions.
