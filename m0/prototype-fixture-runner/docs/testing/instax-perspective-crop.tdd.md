# Instax Perspective Crop TDD Evidence

## Source Plan

Journeys were derived from the reported crop and autodetect defects. No separate plan file was used.

## User Journeys

- As a user, I want the selected perspective quad to map to the same source pixels I selected, so the saved crop does not drift.
- As a user, I want an Instax Mini card with handwritten margins to keep its outer printed border, so autodetect does not crop into the card.
- As a user, I want a Mini card photographed in landscape orientation to be detected, so rotating the physical card does not force manual cropping.
- As a user, I want internal photo lines and background contrast not to become card edges, so the four handles follow the printed border.
- As a user, I want Apply followed by Done to retain the generated preview, so the original photo is not imported accidentally.

## RED/GREEN Evidence

| Behavior | RED evidence | GREEN validation |
|---|---|---|
| Source and output dimensions are distinct in homography calculation | Regression expected output x `2985`, received `3000` | `npm test -- --runInBand src/services/__tests__/perspective.test.ts` |
| Full Mini border wins over handwriting edges | Regression exceeded `0.035` normalized tolerance by receiving `0.036268...` | `npm test -- --runInBand src/services/__tests__/instaxDetect.test.ts` |
| Applied preview is retained by EventForm | Import received the original URI instead of the generated preview URI | `npm test -- --runInBand src/components/forms/__tests__/EventForm.test.tsx -t "keeps an applied perspective preview"` |
| Landscape Mini was accepted by the preset | Detection returned `null` for a `210x132` Mini card | `npm test -- --runInBand src/services/__tests__/instaxDetect.test.ts -t "landscape-oriented mini"` |
| Internal photo line was rejected | A long internal line shifted a corner by `0.0668` normalized pixels | `npm test -- --runInBand src/services/__tests__/instaxDetect.test.ts -t "long high-contrast line"` |

## Guarantees

| # | Guarantee | Test target | Result |
|---|---|---|---|
| 1 | A perspective quad in source pixel space maps to the requested output frame even when dimensions differ | `src/services/__tests__/perspective.test.ts` | PASS |
| 2 | Perspective preview metadata uses the output quad aspect ratio | `src/components/album/__tests__/ImageCropEditor.instax.test.tsx` | PASS |
| 3 | Handwriting in straight and tilted Mini card margins does not replace the full border | `src/services/__tests__/instaxDetect.test.ts` | PASS |
| 4 | Apply then Done imports the committed preview URI | `src/components/forms/__tests__/EventForm.test.tsx` | PASS |
| 5 | White outer boundaries are preferred for portrait and landscape Mini cards, including tilted cards and internal contrast lines | `src/services/__tests__/instaxDetect.test.ts` | PASS |

## Verification

- `npm run typecheck`: PASS
- `npm run lint`: PASS with one pre-existing unused `Icon` warning in `src/app/(tabs)/idols.tsx`
- `npm test -- --runInBand`: 84 suites, 716 tests passed
- `npm run test:coverage`: 84 suites, 716 tests passed; 84.45% statements, 75.47% branches, 84.75% functions, 87.17% lines
- `graphify update .`: PASS

## Implementation Notes

- Homography source and destination dimensions are explicit in `src/services/perspective.ts`.
- Perspective preview dimensions use `perspectiveOutputSize()` in both crop consumers.
- Instax line models are ranked by inlier count and longitudinal edge coverage, not inlier count alone. This prevents short handwriting strokes from winning over a continuous card edge.
- White-card detection adds a validated outer-boundary candidate using the first bright run from the correct outside-in direction on all four sides.
- Mini ratio and border expansion support both portrait and landscape physical orientations.
- No new native or computer-vision dependency was added.
