# Idol Detail TDD Evidence

## Scope

Implemented the four-tab Idol Detail flow from Figma: fixed hero, Summary,
Album, Cheki, Event, scroll pickers, tap-only animated tab navigation, Cheki
Type popup management, legacy Album redirect, and Edit-only deletion.

## RED evidence

The service suite first failed because `@/services/idolDetail` did not exist.
The screen suite then failed because the former detail page had no Summary,
Album, Cheki, or Event tab controls. The Edit suite failed because Delete Idol
was not available in Edit.

## GREEN evidence

Focused command:

```powershell
npm test -- --runInBand src/app/idol/__tests__/detail.test.tsx src/app/idol/__tests__/edit.test.tsx src/services/__tests__/idolDetail.test.ts
```

Result: 3 suites passed; 9 tests passed.

Coverage includes idol-scoped event/currency/type aggregation, deterministic
six-month buckets, album source/date filtering, all four tab controls, the
Album dropdown, photo-only import affordance, popup Cheki Type management,
Event navigation, and confirmed Edit deletion.

## Final verification

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm test -- --runInBand`: 41 suites, 353 tests, all PASS
- `graphify update .`: PASS; graph rebuilt with 4,457 nodes and 6,775 edges

Browser visual QA is inconclusive because the existing Expo web bundle cannot
resolve `expo-sqlite`'s `wa-sqlite.wasm` with the current Metro configuration.
No Android emulator was connected. Figma metadata, targeted component tests,
full lint/typecheck, and the complete native-oriented Jest suite remain green.
