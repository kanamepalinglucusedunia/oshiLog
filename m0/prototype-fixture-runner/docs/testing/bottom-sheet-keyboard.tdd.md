# Bottom sheet keyboard positioning — TDD evidence

Source plan: none; the journey was derived from the reported dropdown keyboard behavior.

## User journey

- As a user searching inside a dropdown, I want the dropdown to stay in its original position when the focused input is still visible, so that opening the keyboard does not make the list jump.
- As a user focusing an input that is covered by the keyboard, I want only the necessary overlap removed, so that the input remains usable without unnecessarily moving the whole sheet.

## Evidence

| Guarantee | Test | Result |
| --- | --- | --- |
| A focused input above the keyboard produces no sheet offset. | `src/components/ui/__tests__/BottomSheet.test.tsx` | PASS |
| A covered focused input produces only the required negative offset plus the 8px safe gap. | `src/components/ui/__tests__/BottomSheet.test.tsx` | PASS |
| Keyboard frame changes use the currently focused input's measured layout. | `src/components/ui/__tests__/BottomSheet.test.tsx` | PASS |
| The sheet no longer applies a global `KeyboardAvoidingView` height shift. | `src/components/ui/__tests__/BottomSheet.test.tsx` | PASS |

RED: the new tests failed because `calculateKeyboardAvoidanceOffset` did not exist and `BottomSheet` still rendered the global `KeyboardAvoidingView`.

GREEN: the targeted test passed (`4/4`), followed by the final full suite (`93 suites, 802 tests`).

Verification: `npm run typecheck`, `npm run lint`, `npm run doctor`, and `npm run test:coverage` passed. The latest coverage run reported 85.28% statements, 76.64% branches, 86.67% functions, and 88.16% lines.

Known gap: native keyboard geometry still needs a manual device check on iOS and Android because Jest cannot render the real software keyboard or native `measureInWindow` coordinates.
