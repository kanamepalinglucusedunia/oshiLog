# Security Policy and Dependency Exceptions

## Dependency audit exception (2026-08-12)

`npm audit` currently reports 15 high and 8 moderate findings through the Expo SDK 57 / React Native 0.86 toolchain. The actionable roots are Metro's transitive `image-size` parser and Expo config's transitive `uuid`/`xcode` chain. npm's proposed automatic fixes downgrade Expo to SDK 53, React Native to 0.72, Reanimated to 4.2.2, or Testing Library to 13, all outside the SDK 57 compatibility matrix.

These findings are temporarily accepted for the following bounded reasons:

- the affected Metro image parser processes repository-controlled build assets, not Cheki photos imported at runtime;
- runtime photos are re-encoded by `expo-image-manipulator`, and backup manifests are size-limited, checksummed, strictly allow-listed, and validated before restore;
- the lockfile is committed and CI runs Expo compatibility checks, lint, typecheck, tests, and coverage;
- `npm audit fix --force` is prohibited because its suggested downgrades create a larger compatibility and correctness risk.

Review this exception on every Expo SDK 57 patch, before upgrading to SDK 58, or by **2026-09-30**, whichever comes first. Remove it as soon as Expo's supported dependency graph contains patched `image-size` and `uuid` versions.

## Direct dependency ownership

- `expo-system-ui`, `react-dom`, and `react-native-web` support Expo configuration and web builds.
- `expo-linking` and `expo-web-browser` support Expo Router/deep-link platform integration.
- navigation/native packages (`react-native-screens`, safe-area, gesture handler, pager view, Reanimated, Worklets, SVG) are runtime peers used by the router and UI.
- unused direct dependencies `expo-device`, `expo-secure-store`, and `expo-status-bar` were removed. SecureStore must be reintroduced if remote authentication/token storage is implemented.

## Geoapify venue search key (zero-backend build)

Venue autocomplete calls Geoapify directly from the device; oshiLog owns no server, proxy, or edge function for it. `EXPO_PUBLIC_GEOAPIFY_API_KEY` is embedded in the application bundle, so the key **cannot be treated as a secret** — a motivated person can extract it from an APK or from application traffic.

Required mitigations:

- Use a dedicated Geoapify project and key used only by oshiLog; never reuse a credential from another product.
- Enable only the Geoapify APIs required for autocomplete when the provider supports that restriction.
- Configure the lowest practical provider quota and rate limit.
- Configure allowed web origins for a published web build, if applicable. Android and iOS clients provide no reliable origin restriction for a direct web-service key.
- Monitor usage in the provider dashboard during testing and after each release; rotate the key and rebuild the application if abuse is detected.
- Never log the key, the full request URL, the response payload, or the user query.
- Never place the real key in source, `app.json`, tests, snapshots, documentation, commits, or issue text. `.env.local` (git-ignored) is the only allowed location; `.env.example` holds an empty placeholder.

Client-side debounce and request cancellation reduce accidental usage but do not secure the key against abuse. Review the current Geoapify plan, storage, and attribution terms (including the OpenStreetMap attribution requirement) before every public or commercial release.

## Unavatar social profile photos

Social-avatar lookup calls Unavatar directly from the device after an explicit preview or refresh action. `EXPO_PUBLIC_UNAVATAR_KEY` is embedded in the client application and must contain only a provider-issued publishable `pk_` token. The app rejects missing tokens and any `sk_` server-secret token. Never place an Unavatar secret token in `.env.local`, an `EXPO_PUBLIC_*` variable, source, tests, documentation, build configuration, logs, or issue text.

Security and privacy boundaries:

- Only internally constructed `https://unavatar.io/{x|instagram|tiktok}/{username}` URLs are fetched; arbitrary avatar hosts and user-supplied download URLs are not accepted.
- The selected public username and the device IP address are disclosed to Unavatar on each explicit request. No lookup occurs while typing, in the background, or on automatic refresh.
- Requests send the publishable token only as Unavatar's `token` query parameter. They send no cookies, authorization header, custom TTL, device identifier, or analytics metadata.
- Requests time out after 15 seconds and are never automatically retried.
- Responses must be JPEG, PNG, or WebP, must be non-empty, and must not exceed 5 MiB by declared or actual size.
- Temporary files are deleted on close, replacement, success, and failure. Confirmed photos are decoded and re-encoded by the existing local media pipeline, stripping source metadata before durable storage.
- Saved external links open only when they match the exact canonical HTTPS form produced by the normalizer.
- Monitor paid-provider usage and limits. Rotate the publishable token and rebuild the app if abuse is detected. Provider-side restrictions cannot make a key secret inside a distributed APK.

Do not log usernames, full Unavatar request URLs, tokens, provider response bodies, or temporary file paths in production.

Do not commit secrets, service credentials, backup files, generated coverage, native build output, or Graphify output.
