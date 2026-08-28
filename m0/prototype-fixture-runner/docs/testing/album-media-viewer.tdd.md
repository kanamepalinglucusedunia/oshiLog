# Album media fullscreen viewer — TDD evidence

## Scope

- Open album photos and videos in a fullscreen viewer.
- Show back/date/share controls and a native share-options sheet.
- Save media to the device gallery or share it to other installed apps.
- Preserve the idol and group display names from the media date.
- Persist and backfill direct-media display snapshots, including backup columns.

## RED

Added tests before the production implementation:

- `src/repositories/__tests__/albumMediaSnapshots.test.ts`
- `src/services/__tests__/mediaActions.test.ts`
- `src/components/album/__tests__/MediaViewer.test.tsx`
- `src/db/__tests__/migration.test.ts`

Initial focused run failed because the snapshot columns, migration, media-action service, and viewer did not exist yet. Existing migration tests passed during that run.

## GREEN

Focused run after implementation:

```text
4 suites passed
34 tests passed
```

Repository-wide run:

```text
91 suites passed
787 tests passed
```

Coverage run passed the configured thresholds:

```text
Statements 85.06% · Branches 76.38% · Functions 86.27% · Lines 88%
```

## Verification

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run deps:check` — passed; Expo SDK 57 package versions are aligned.
- `graphify update .` — completed successfully.
- `npm audit --audit-level=high` — reports 18 transitive Expo/Metro vulnerabilities; automatic remediation requires a breaking Expo downgrade, so no forced dependency change was applied.
- `expo-doctor` — 21/21 checks passed.

## Android bundle regression

The Android bundle initially failed when the `expo-sharing` package entrypoint tried to resolve its optional `useIncomingShare` export. The media action wrapper now loads only `expo-sharing/build/Sharing`, which contains the APIs used here (`isAvailableAsync` and `shareAsync`).

```text
npx expo export --platform android --output-dir .tmp-expo-export
Android Bundled ... node_modules/expo-router/entry.js (2464 modules)
Exported: .tmp-expo-export
```
