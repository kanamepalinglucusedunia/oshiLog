# Google Drive authorization spike (T0)

Decision: **GO — preferred Nitro adapter passed the complete physical-device matrix**  
Last updated: **2026-08-16 (Asia/Jakarta)**  
Source plan: [`GOOGLE_DRIVE_BACKUP_RESTORE_IMPLEMENTATION_PLAN.md`](../../GOOGLE_DRIVE_BACKUP_RESTORE_IMPLEMENTATION_PLAN.md)

This is the completed T0 GO result. The preferred Nitro adapter passed every required physical-
device row, so the fallback `AuthorizationClient` wrapper was intentionally not started. That GO
unblocked T1 and the later production milestones.

## Locked scope

- Android only, client only.
- OAuth authorization scope is exactly `https://www.googleapis.com/auth/drive.appdata`.
- The probe performs only `GET /drive/v3/files?spaces=appDataFolder&pageSize=1`.
- No refresh token, client secret, access token, account identifier, or email is written to evidence.
- Existing local backup/restore code and schema are unchanged.
- A foreground-only result is not accepted as evidence for scheduled backup.

## Environment and configuration evidence

| Item | Result |
|---|---|
| Android package | `com.oshilog.app` |
| Debug signing SHA-1 | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
| Debug signing SHA-256 | `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C` |
| Expo / React Native | Expo `57.0.13`; React Native `0.86.2` |
| Preferred adapter | `react-native-nitro-google-signin@1.3.0` |
| Nitro runtime | `react-native-nitro-modules@0.36.5` |
| Background worker | `expo-background-task@57.0.10`; `expo-task-manager@57.0.10` |
| ADB result | Physical device connected and authorized (`ydl7yxdirs6tlz55`) |
| Physical device / Android version | Xiaomi 22120RN86G; Android 14 / API 34; Google Play services 26.29.32 |
| Local Web OAuth client ID | Configured only in ignored `.env.local`; its value is not recorded here |
| Debug APK build | **PASS**, arm64 development build; SHA-256 `EE2580803D42BE2E96525D2DAA3609B2DDE16BC8CE298C2A15921B45AEAC18C8` |

The current debug keystore is also used by the repository's current release build type. That is a
development baseline only; upload-key and Play App Signing fingerprints still need explicit release
configuration before T12.

## Important adapter finding

Inspection of the pinned Nitro Android source found that `GoogleSignInController.getTokens()` calls
`requireActivity()` before invoking `AuthorizationClient.authorize()`. The adapter does persist the
last signed-in account and scopes in encrypted Android storage, and `getTokens()` is documented as a
refresh path, but the Activity requirement makes a genuinely headless WorkManager execution
uncertain. This is a risk observation, not a failed physical test, and is why T0 cannot be approved
from unit tests or a foreground debug trigger.

Static inspection of the resolved Google Play services `21.6.0` bytecode also confirmed that
`Identity.getAuthorizationClient(android.content.Context)` is available. Therefore the fallback can
be implemented with an application context if Nitro fails the physical matrix. It has not been
implemented preemptively because T0 requires testing the preferred adapter first.

The Nitro Expo config plugin was also tested. With no Firebase files it requires an iOS URL scheme,
even for this Android-only build, and caused `:expo-constants:createExpoConfig` to fail. The plugin
entry was removed; standard React Native/Expo Gradle autolinking still linked both Nitro modules and
the Android debug APK then built successfully. The spike passes an explicit public Web OAuth client
ID at runtime and does not need `google-services.json`.

Expo Doctor delegates library compatibility metadata to React Native Directory, which currently
marks `react-native-nitro-google-signin` as "untested on New Architecture." The exact package is
excluded from that metadata check because it is the plan-mandated feasibility adapter, is built on
Nitro Modules, and compiled successfully in this app's New Architecture Android build. The exclusion
does not convert the missing physical-device matrix into a pass.

## TDD evidence

User journeys:

1. As the T0 operator, I can grant only `drive.appdata`, retrieve account metadata, and list the
   hidden application-data space without exposing the token.
2. As the background worker, I can attempt token reacquisition without invoking any sign-in method
   or UI fallback and record a redacted result.
3. As a reviewer, I can distinguish interaction-required, token-required, malformed Drive, and
   request failures using stable safe codes.

| Task / guarantee | RED evidence | GREEN evidence |
|---|---|---|
| Adapter contract, scope isolation, token and interaction mapping | `npm.cmd test -- --runInBand src/spikes/googleDriveAuth/__tests__/authContract.test.ts` → `Cannot find module '../authContract'` | Same command → 4/4 tests PASS |
| Nitro interactive/headless behavior | `npm.cmd test -- --runInBand src/spikes/googleDriveAuth/__tests__/nitroAdapter.test.ts` → `Cannot find module '../nitroAdapter'` | Same command → 5/5 tests PASS |
| Validated/redacted Drive probe | `npm.cmd test -- --runInBand src/spikes/googleDriveAuth/__tests__/driveProbe.test.ts` → `Cannot find module '../driveProbe'` | Same command → 3/3 tests PASS |
| Redacted background result and bounded headless timeout | `npm.cmd test -- --runInBand src/spikes/googleDriveAuth/__tests__/backgroundProbe.test.ts` → new unresolved headless authorization test timed out | Same command → 3/3 tests PASS; a non-settling native call records only `headless_authorization_timeout` after 30 seconds |
| Evidence persistence excludes tokens | `npm.cmd test -- --runInBand src/spikes/googleDriveAuth/__tests__/evidenceStore.test.ts` → `Cannot find module '../evidenceStore'` | Same command → 2/2 tests PASS |
| Ordered operator flow | `npm.cmd test -- --runInBand src/spikes/googleDriveAuth/__tests__/spikeController.test.ts` → `Cannot find module '../spikeController'` | Same command → 3/3 tests PASS |
| OAuth public-client configuration | `npm.cmd test -- --runInBand src/spikes/googleDriveAuth/__tests__/config.test.ts` → `Cannot find module '../config'` | Same command → 5/5 tests PASS |
| Module-scope Expo worker wiring | `npm.cmd test -- --runInBand src/spikes/googleDriveAuth/__tests__/backgroundTask.test.ts` → missing spike module | Same command → 2/2 tests PASS |
| Physical operator screen | `npm.cmd test -- --runInBand src/spikes/googleDriveAuth/__tests__/GoogleDriveAuthSpikeScreen.test.tsx` → missing screen | Same command → 1/1 test PASS |
| Android native integration | `android\\gradlew.bat app:assembleDebug --no-daemon` → config plugin rejected Android-only configuration | With the unnecessary plugin entry removed and `NODE_ENV=development` → `BUILD SUCCESSFUL` |

Combined targeted verification:

```text
npm.cmd run typecheck                                      PASS
npm.cmd run lint                                           PASS (0 warnings/errors)
npm.cmd test -- --runInBand src/spikes/googleDriveAuth     PASS (9 suites, 28 tests)
android\\gradlew.bat app:assembleDebug --no-daemon         PASS
```

Coverage for the T0 domain/adapters/controller/worker logic passed at **92.98% statements, 82.81%
branches, 93.93% functions, and 92.79% lines**:

```text
npm.cmd test -- --runInBand src/spikes/googleDriveAuth --coverage --collectCoverageFrom="src/spikes/googleDriveAuth/{authContract,backgroundProbe,backgroundTask,config,driveProbe,evidenceStore,nitroAdapter,spikeController}.ts"
```

The disposable operator UI and installed-native composition are covered by interaction tests plus
the native APK build and must ultimately be validated by the physical matrix. The screen and stored
evidence expose only booleans, counts, timestamps, and safe error codes; account identifiers and
tokens are not shown or persisted.

## Full local verification and security review

```text
npm.cmd run verify                                           PASS
  Expo dependency compatibility                             PASS
  Expo Doctor                                               PASS (21/21)
  lint / typecheck                                          PASS
  Jest project suite                                        PASS (50 suites, 381 tests)
android/app:assembleDebug (arm64 development build)         PASS (551 tasks)
graphify update .                                           PASS (4,647 nodes, 7,062 edges)
```

The scoped secret scan found no client-secret, refresh-token, access-token, bearer-token, or concrete
OAuth client-ID literals in the spike, its configuration example, or this report. The implementation
requests only `drive.appdata`, never enables offline access, validates the Drive response, and writes
only the strict redacted evidence schema.

`npm audit --omit=dev` remains an **open dependency finding**, not a clean security pass: 24 findings (9
moderate, 15 high, 0 critical) are reported for the current Expo/React Native dependency graph. The
direct Nitro spike package contributes one unpatched moderate path through `@expo/config-plugins` to
the `xcode` package; that tool is not used by this Android-only spike. The audit's available high
severity remediations propose incompatible major downgrades of Expo/React Native, so no automatic
`npm audit fix --force` was applied. These findings remain tracked for the T11 production-hardening
gate; T0 itself is closed as GO by the physical evidence below.

## Physical GO matrix

| Required observation | Nitro | Minimal native wrapper | Evidence |
|---|---:|---:|---|
| Interactive consent on a physical Android device | PASS | Not needed | Five redacted interactive successes; Drive list returned 0 files |
| Account metadata returned | PASS | Not needed | Each interactive and background evidence record has `accountMetadataPresent: true` |
| Initial access token lists `appDataFolder` | PASS | Not needed | Five interactive records have `driveListSucceeded: true` |
| Cached token cleared, worker gets a fresh token without UI | PASS | Not needed | Cached token was cleared before worker test; first background record at `2026-08-16T09:33:26.696Z` succeeded |
| Same result after app process restart | PASS | Not needed | Forced worker from launcher after process restart succeeded at `2026-08-16T09:35:08.782Z` |
| Same result after device reboot | PASS | Not needed | After `BOOT_COMPLETED`, forced worker from launcher succeeded at `2026-08-16T09:38:32.768Z` |
| Genuine headless execution with no Activity/consent UI | PASS | Not needed | Android log records `Started headless task` and `Finished task`; launcher held focus and no consent/account UI appeared |

All Nitro rows passed, so T0 is **GO**. The minimal application-context `AuthorizationClient` wrapper
was intentionally not implemented: the fallback is only warranted by a preferred-adapter physical
failure, and adding it now would widen the trusted native surface without improving the result.

The first test attempt used a non-development APK, for which Expo's testing trigger is intentionally
disabled. A later development build initially had an invalid dev-client deep link and its worker could
not load JavaScript. Neither condition exercised the adapter. The final valid development-client launch
used `oshilog://expo-development-client/?url=<encoded Metro manifest URL>`; the three passing worker
runs above are the only authorization feasibility evidence used for this decision.

## Physical runbook

Prerequisites:

1. In one Google Cloud project, enable the Drive API and configure the OAuth consent screen.
2. Create an Android OAuth client for package `com.oshilog.app` and the debug SHA-1 above.
3. Create a Web OAuth client in the same project. Do not create or ship a client secret.
4. Copy `.env.example` to ignored `.env.local` and set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the
   public Web client ID.
5. Connect a physical Android device with USB debugging and verify `adb devices -l` reports it.

Build and open the unlinked debug route:

```powershell
npm.cmd start -- --dev-client
adb reverse tcp:8081 tcp:8081
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -a android.intent.action.VIEW -d "oshilog://dev/google-drive-auth-spike" com.oshilog.app
```

On the screen:

1. Tap **Grant access and list appDataFolder** and complete consent.
2. Confirm the interactive result passes, then tap **Clear cached access token**.
3. Tap **Register and trigger background worker** and confirm a background success record appears
   without an account picker or consent UI.
4. Move the app to the background, force the registered Android WorkManager job from ADB, and verify
   another success record is written while no Activity is visible. Capture `adb shell dumpsys
   jobscheduler com.oshilog.app` first and use the reported job ID with `adb shell cmd jobscheduler
   run -f com.oshilog.app <JOB_ID>`.
5. Force-stop and restart the app, repeat the forced worker test without interactive sign-in.
6. Reboot the device, wait for unlock/network, then repeat the forced worker test without interactive
   sign-in.

Evidence may be viewed on screen or pulled in redacted form:

```powershell
adb shell run-as com.oshilog.app cat files/google-drive-auth-spike-evidence.json
```

Record the device model, Android version, Google Play services version, timestamps, safe error codes,
whether any UI appeared, and the redacted evidence JSON. Never record log lines or screenshots that
contain access tokens, authorization headers, client secrets, real account identifiers, or emails.

## References checked

- Expo BackgroundTask: <https://docs.expo.dev/versions/latest/sdk/background-task/>
- Expo TaskManager: <https://docs.expo.dev/versions/latest/sdk/task-manager/>
- Nitro Google Sign-In: <https://github.com/react-native-nitro-google-sign-in/google-signin>
- Android authorization: <https://developer.android.com/identity/authorization>
- `AuthorizationClient`: <https://developers.google.com/android/reference/com/google/android/gms/auth/api/identity/AuthorizationClient>
- Drive application data folder: <https://developers.google.com/workspace/drive/api/guides/appdata>
