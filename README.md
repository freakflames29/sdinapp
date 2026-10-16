# sdinapp

One-command setup for `sp-react-native-in-app-updates`: install the package, apply platform setup, copy the `useUpdate` hook into your project, and wire it into your main screen.

```sh
npx sdinapp
```

Run from the **root of your React Native project** (Expo or bare CLI).

## Usage

```sh
npx sdinapp [--dry-run] [--yes] [--screen <path>]
```

| Flag | What it does |
| --- | --- |
| `--dry-run` | Print planned changes, write nothing. |
| `--yes` / `-y` | No prompts (overwrite checks, screen picker). |
| `--screen <path>` | Override the target screen file (relative to project root). |

Before running, drop your hook into `templates/useUpdate.ts` in this package — it is copied as-is (stripped to `.js` only for non-TypeScript projects).

## What the tool changes

1. **Installs** `sp-react-native-in-app-updates` with your lockfile's package manager (`pnpm`/`yarn`/`bun`/`npm`; `npx expo install` for Expo). Also installs `react-native-device-info` (bare CLI) or `expo-constants` (Expo) if missing. Skips anything already present.
2. **Expo setup** (`setup/expo.ts`): creates root `react-native-device-info.js` shim (Expo replacement per library README), adds the `module-resolver` alias to `babel.config.js`, adds `itms-apps` to `ios.infoPlist.LSApplicationQueriesSchemes` in `app.json`.
3. **Bare CLI setup** (`setup/cli.ts`): adds `itms-apps` to `Info.plist` files under `ios/`, reminds you to run `pod install`.
4. **Copies** `templates/useUpdate.ts` to `src/hooks/` (or `hooks/` for Expo Router without `src/`). Asks before overwriting unless `--yes`.
5. **Wires the hook** into the main screen via AST (`ts-morph`, never regex): picks `app/(tabs)/index.tsx` → `app/index.tsx` → Home/Splash/Landing screens → `App.tsx` (`app/_layout.tsx` for Router fallback), or `--screen`. Injects `const { checkForUpdate } = useUpdate()` + `useEffect(() => { checkForUpdate() }, [])`, adds the `useUpdate` import (with `@/` alias when tsconfig defines it) and merges `useEffect` into the existing `react` import. Skips files already using `useUpdate`.

Every edit is idempotent — rerunning changes nothing already set up. `app.json` / `app.config.js/ts` / `eas.json` are optional — the tool never fails when they're missing.

> In-app updates do **not** work in Expo Go. Use a dev build (`npx expo prebuild` / EAS build).

## Summary output

After running you get Installed / Created / Modified / Manual-steps-remaining lists. Typical manual steps: rebuild natives, `pod install`, set `ios.bundleIdentifier` (Expo), test on a real device with a release build.
