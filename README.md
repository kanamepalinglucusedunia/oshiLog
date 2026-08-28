# oshiLog Native Android

Fresh Kotlin/Jetpack Compose rebuild of oshiLog. This repository is independent from the React Native prototype and uses a side-by-side debug package: `com.oshilog.app.native.dev`.

## Current runnable scope

- Three-step onboarding: active countries, surface style, and accent color.
- Local persistence of the completed onboarding choices.
- Launchable main shell with Home, Idol, Event, Venue, and Trip tabs.
- Nunito typography and the initial oshiLog color/surface tokens.

This is the first vertical slice, not full feature or pixel-parity completion. Continue from `project-docs/KOTLIN_NATIVE_REBUILD_MASTER_PLAN.md` and record evidence in `project-docs/KOTLIN_NATIVE_PROGRESS.md`.

## Open and run

Open `C:\Users\chimuchimu\App\oshiLog` in Android Studio, select the `app` configuration, and run it on an Android device or emulator.

Command-line build from PowerShell:

```powershell
$env:TEMP = 'C:\jtmp'
$env:TMP = 'C:\jtmp'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

The short TEMP path avoids a Java NIO socket-path limitation in some sandboxed Windows desktop sessions. A normal Android Studio build does not require this workaround.

Debug APK: `app\build\outputs\apk\debug\app-debug.apk`.

