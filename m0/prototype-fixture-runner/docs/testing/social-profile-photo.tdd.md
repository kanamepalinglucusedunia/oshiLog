# Social Profile Photo TDD Evidence

## Source plan

- `SOCIAL_PROFILE_PHOTO_IMPLEMENTATION_PLAN.md`
- Gate evaluated on 2026-08-13 from the implementation workspace network.

## Scope status

The anonymous gate initially blocked X and Instagram with `403 EPRO`. The
product owner explicitly approved the paid Unavatar option and supplied a
publishable `pk_` token through the ignored `.env.local` file. The implementation
therefore proceeded under the approved amendment recorded in the source plan.

## Baseline evidence

Command:

```powershell
npm.cmd test -- --runInBand src/db/__tests__/migration.test.ts src/repositories/__tests__/repositories.test.ts src/services/__tests__/media.test.ts src/services/__tests__/backup.test.ts src/services/__tests__/idolSave.test.ts src/components/forms/__tests__/IdolForm.test.tsx
```

Result:

```text
Test Suites: 6 passed, 6 total
Tests:       85 passed, 85 total
Snapshots:   0 total
```

Command:

```powershell
npm.cmd run typecheck
```

Result: PASS with zero TypeScript errors.

## Anonymous provider feasibility evidence

Each request was a direct anonymous GET with `fallback=false`, no API key, no
`token`, and no custom `ttl`. Successful content was inspected only for response
metadata and non-empty image bytes.

| Platform | Probe | HTTP | Content type | Pricing tier | Cache | Anonymous limit | Error code | Result |
| --- | --- | ---: | --- | --- | --- | ---: | --- | --- |
| X | known public `openai` profile | 403 | `application/json; charset=utf-8` | `free` | none | 25 | `EPRO` | BLOCKED: provider requires PRO |
| Instagram | known public `instagram` profile | 403 | `application/json; charset=utf-8` | `free` | none | 25 | `EPRO` | BLOCKED: provider requires PRO |
| TikTok | known public `tiktok` profile | 200 | `image/jpeg` | `free` | `MISS` | 25 | none | PASS: 41,017 image bytes |
| X | invalid username | 404 | empty | `free` | `MISS` | 25 | none | Expected not-found behavior |
| Instagram | invalid username | 403 | `application/json; charset=utf-8` | `free` | none | 25 | `EPRO` | Provider blocked before lookup |
| TikTok | invalid username | 403 | `application/json; charset=utf-8` | `free` | none | 25 | `EPRO` | Invalid lookup cannot provide stable free-tier not-found behavior |

Unavatar's current general documentation advertises an anonymous free tier of
25 requests per day per IP and defines `403 EPRO` as a provider restricted to
the PRO plan. Its provider pages and general documentation contain conflicting
free-tier language, so the live no-key responses are the decisive gate evidence.

## Authenticated provider feasibility evidence

Requests used `fallback=false` and the configured publishable token. No token,
username, or full request URL is recorded in this document.

| Platform | HTTP | Content type | Pricing tier | Cache | Proxy tier | Result |
| --- | ---: | --- | --- | --- | --- | --- |
| X | 200 | `image/jpeg` | `pro` | `MISS` | origin | PASS |
| Instagram | 200 | `image/jpeg` | `pro` | `MISS` | datacenter | PASS |
| TikTok | 200 | `image/jpeg` | `pro` | `MISS` | origin | PASS |

Instagram's datacenter-tier lookup reinforces the product constraint that
lookups are explicit only: there is no typing request, retry loop, polling, or
background refresh.

## Test specification status

| # | What is guaranteed | Evidence | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | Existing migration, repository, media, backup, Idol save, and Idol form behavior is green before feature work | Focused Jest command above | Regression baseline | PASS |
| 2 | The existing project typechecks before feature work | `npm.cmd run typecheck` | Static verification | PASS |
| 3 | X cannot satisfy the approved anonymous no-key photo-import architecture | Direct Unavatar X probe | Feasibility gate | BLOCKED (`403 EPRO`) |
| 4 | Instagram cannot satisfy the approved anonymous no-key photo-import architecture | Direct Unavatar Instagram probe | Feasibility gate | BLOCKED (`403 EPRO`) |
| 5 | TikTok can currently return a real image anonymously for a known public profile | Direct Unavatar TikTok probe | Feasibility gate | PASS |

## RED/GREEN evidence

Each milestone began with a focused failing test: missing normalization and
network modules; absent migration columns and repository mappings; rejected
backup columns; missing shared components; direct photo-picker behavior; absent
form fields; absent detail links/refresh; and the missing Credits route. Each
focused suite was then made green before moving to the next milestone.

Implemented coverage includes normalization, migration v9→v10, Idol/Group CRUD,
v10 and legacy-v9 backup restore, authenticated request construction, timeout
and cancellation, MIME/size/error mapping, staging disposal, shared picker UI,
both form flows, canonical safe links, manual refresh, and Credits attribution.

### Popup-modal regression (2026-08-14)

User journey: as a user creating or editing an Idol/Group, pressing the photo
control must show a centered popup immediately, without using a photo bottom
sheet, so the source choices remain visible over the current form.

RED command:

```powershell
npm test -- --runInBand src/components/forms/__tests__/ProfilePhotoSourceSheet.test.tsx src/components/forms/__tests__/SocialAvatarPicker.test.tsx
```

RED result: 2 suites failed because neither photo flow exposed the expected
`popup-modal`; both were still rendered through the slide-up `BottomSheet`.

GREEN commands and results:

```powershell
npm test -- --runInBand src/components/forms/__tests__/ProfilePhotoSourceSheet.test.tsx src/components/forms/__tests__/SocialAvatarPicker.test.tsx
# 2 suites passed; 6 tests passed

npm test -- --runInBand src/components/forms/__tests__/IdolForm.test.tsx src/components/forms/__tests__/GroupForm.test.tsx src/components/forms/__tests__/ProfilePhotoSourceSheet.test.tsx src/components/forms/__tests__/SocialAvatarPicker.test.tsx
# 4 suites passed; 13 tests passed
```

The passing tests guarantee that both source selection and social-photo import
use the shared centered popup modal, and that the Idol/Group photo buttons open
that popup before invoking the device image picker.

## Final verification

`npm run verify` passed after implementation:

- Expo dependency compatibility: PASS
- Expo Doctor: 20/20 checks PASS
- ESLint: PASS
- TypeScript: PASS
- Jest with coverage: 40 suites, 347 tests, 0 snapshots, all PASS
- Global coverage: 80.64% statements, 70.64% branches, 77.25% functions, 83.28% lines
- New service coverage: `socialAvatar.ts` 94.89% statements / 97.40% lines; `socialProfile.ts` 95.23% statements / 97.36% lines

`npm audit --omit=dev` continues to report the already-documented Expo SDK 57
toolchain findings (15 high and 8 moderate through Metro `image-size` and Expo
config `uuid`). The available forced fix downgrades Expo outside the supported
dependency matrix, so no destructive or incompatible audit fix was applied.
