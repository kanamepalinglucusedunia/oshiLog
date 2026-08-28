# Group picker dropdown — TDD evidence

Source plan: none; the journeys below were derived from the Figma node `56:4036` and the existing idol edit flow.

## User journeys

- As a user editing an idol, I want the group picker to open as a dropdown so that I can see the available groups in the Figma-style list.
- As a user with many groups, I want to search the open picker so that I can find a group quickly.
- As a user selecting a group, I want the picker to close and show the selected group so that the membership edit is unambiguous.

## Evidence

| Guarantee | Test | Result |
| --- | --- | --- |
| The group picker opens with Search, Solo, group cards, and New Group. Selecting a group closes it and updates the field. | `src/components/forms/__tests__/IdolForm.test.tsx` | PASS |
| The picker filters groups from its search input. | `src/components/forms/__tests__/IdolForm.test.tsx` | PASS |
| The idol edit flow persists a group change through the dropdown. | `src/app/idol/__tests__/edit.test.tsx` | PASS |

RED: the new tests initially failed because the existing picker had no `Group` dropdown control.

GREEN: targeted form/UI tests passed (`16/16`), followed by the full suite (`87 suites, 755 tests`).

Verification: `npm run typecheck`, `npm run lint`, and `npm run test:coverage` passed. Coverage was 84.37% statements, 75.55% branches, 84.60% functions, and 87.15% lines.

Known gap: the `New Group` row is rendered as the Figma entry point and currently closes the picker; the existing app has no create-group route from the idol form to attach here.

## Nested-scroll regression — 2026-08-21

User journey: As a user scrolling a long Group dropdown inside the Idol bottom sheet, I want the dropdown list—not the form behind it—to own the drag gesture.

| Guarantee | Test | Result |
| --- | --- | --- |
| Opening the Group dropdown disables the parent Idol form scroll; selecting an option closes the dropdown and restores parent scrolling. | `src/components/forms/__tests__/IdolForm.test.tsx` — `renders the group picker as a searchable dropdown and closes after selecting a group` | PASS |

RED: the parent `ScrollView` remained enabled while the Group dropdown was open (`Expected: false`, `Received: true`), allowing Android to scroll the form instead of the option list.

GREEN: the targeted regression passed, followed by the full suite (`93 suites, 808 tests`). Typecheck passed; lint completed with 0 errors and 5 existing warnings.

Coverage: 85.10% statements, 76.27% branches, 86.57% functions, and 88.01% lines. The repository-wide branch metric remains below the ECC 80% target in pre-existing areas; the new open/close scroll-ownership path is covered by the regression test.

## Native overlay rebuild — 2026-08-21

The nested-scroll fix above stopped the bottom sheet, but device testing showed that the inline dropdown `ScrollView` still did not receive the drag. The Group picker is now isolated from the form hierarchy entirely.

| Guarantee | Test | Result |
| --- | --- | --- |
| The open Group picker renders in a native modal overlay, outside the Idol form scroll hierarchy. | `src/components/forms/__tests__/IdolForm.test.tsx` — `renders the group picker as a searchable dropdown and closes after selecting a group` | PASS |
| The option viewport is a bounded `FlatList` with scrolling enabled and no nested-scroll dependency. | Same regression test (`group-picker-list`) | PASS |
| Search, Solo, group selection, and New Group remain available; selection closes the overlay and restores parent scrolling. | Group picker open/select and filter tests | PASS |

RED: the regression could not find `group-picker-overlay`; the old options were still an inline `ScrollView` under the form.

GREEN: `GroupPickerDropdown` now renders its options in a transparent native `Modal` with a bounded, virtualized `FlatList`. The shared dropdown renders only the trigger for this picker. Targeted tests passed, followed by all 93 suites / 808 tests. Typecheck passed; lint completed with 0 errors and 5 pre-existing warnings.

Coverage: 85.05% statements, 76.29% branches, 86.54% functions, and 87.98% lines.

## Border continuity polish — 2026-08-21

The native overlay introduced two adjacent horizontal borders where the open Group trigger meets its panel. The panel now removes only the border facing the trigger: its top border is omitted when opening downward, and its bottom border is omitted when opening upward. The trigger retains the visible line, so the scrollable overlay remains unchanged while the join renders as one border.

| Guarantee | Test | Result |
| --- | --- | --- |
| The Group panel does not add a second top border when opened below the trigger. | `src/components/forms/__tests__/IdolForm.test.tsx` — `renders the group picker as a searchable dropdown and closes after selecting a group` | PASS |

RED: the test could not find the panel before the panel test hook and border rule were added.

GREEN: targeted Group picker tests passed after the border-facing rule was added.

## Upward placement mirror — 2026-08-21

When the available space is above the trigger, the picker now mirrors the downward presentation: the panel has rounded top corners and square lower corners against the trigger; `New Group` moves to the top; the list keeps its original item order; and Search moves to the bottom. The trigger corners are reversed at the same time.

| Guarantee | Test | Result |
| --- | --- | --- |
| Upward panel chrome uses rounded far-side corners and removes the border facing the trigger. | `src/components/forms/__tests__/IdolForm.test.tsx` — `mirrors Group picker chrome and utility-row order when opening upward` | PASS |
| Upward placement puts New Group first, preserves list order, and places Search last. | Same Group picker presentation test | PASS |
| The Group trigger reverses its corners when opened upward. | `src/components/ui/__tests__/formFields.test.tsx` — `reverses the trigger corners when a dropdown opens upward` | PASS |
