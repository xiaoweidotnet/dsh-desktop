# DeepSeek Harness Desktop

## Purpose

This project is a cross-platform desktop launcher for the upstream [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The desktop layer removes the Node.js and command-line setup for end users while preserving the upstream invocation: it starts the real `dsh web` entry in a child process and loads its local Web UI in an Electron window.

The published npm package is the sole Harness runtime source. Do not add or download a DeepSeek Harness source checkout in this project. Changes to Harness itself belong in the upstream project and enter Desktop only after DeepSeek publishes a new npm version.

## Architecture

- `desktop/main.js` owns the Electron window, child-process lifecycle, free-port allocation, workspace selection, logs, and update checks.
- On Windows, `desktop/main.js` applies `desktop/windows-browse-picker.patch.yml` to select the upstream in-app directory browser. This avoids the upstream Win32 COM worker path when Harness runs inside Electron's private Node runtime; do not remove the patch without a real Windows regression test.
- `desktop/preload.js` exposes a small, context-isolated bridge to the splash screen.
- `desktop/renderer/splash.html` is only a startup and error surface. The actual product UI is served by upstream `dsh web`.
- `@deepseek-ai/dsh` is pinned as an exact npm dependency. Electron's bundled Node runtime is launched with `ELECTRON_RUN_AS_NODE=1`, so users do not need a separate Node.js installation.
- The additional exact `@deepseek-ai/dsh-*` entries in the desktop `dependencies` are intentional: the published npm graph contains runtime peer packages that pnpm links locally but electron-builder cannot infer from a single npm entry point. Keep this closure in sync when the Harness version changes.
- `DSH_HOME` is redirected to Electron's per-user application data directory. Harness session data, settings, credentials, and attachments stay in that managed root; the selected workspace remains separate.
- The server always binds to loopback and receives an OS-selected free port. Never change the wrapper to expose `0.0.0.0` without a reviewed security design.
- Packaging intentionally uses `asar: false`: the spawned private Node process must be able to execute the packaged Harness files from the filesystem.
- The production file whitelist excludes `scripts/`, tests, and build-only configuration. The npm package files under `node_modules/` are the executable Harness runtime and must remain.
- `electron-builder.config.cjs` enables the GitHub Release publisher only when `GITHUB_REPOSITORY` is present. Production macOS builds use `electron-updater`; Windows is intentionally a portable ZIP and must use the manual ZIP replacement guidance in the app, because `electron-updater`'s default Windows path expects an NSIS installer. Local builds use `--publish never` and do not pretend to have an update channel.

## Published runtime update contract

`package.json` is the single source of truth for the exact published Harness runtime closure. Check or update it without cloning the source repository:

```sh
pnpm check:harness
pnpm sync:harness
pnpm verify
pnpm test
```

`pnpm check:harness` is a CI-friendly comparison between the exact local `@deepseek-ai/dsh` pin and npm's published `latest` version. `pnpm sync:harness` aligns every explicit `@deepseek-ai/dsh-*` runtime peer to that version and bumps the desktop patch version. A GitHub source commit alone is not a releasable Desktop update; DeepSeek must first publish the npm runtime, then this project must build and publish a new desktop release. Signing is enabled only when the release repository variable `RELEASE_SIGNING=true` is configured.

`.github/workflows/harness-runtime-sync.yml` checks npm weekly, updates the pinned runtime closure, bumps the desktop patch version, and opens a pull request without downloading source. `.github/workflows/release.yml` publishes macOS and Windows assets from a version tag. The GitHub Release feed is what the packaged app's `electron-updater` consumes; macOS signing/notarization secrets are required for a production update to install cleanly.

`RELEASE.md` is the operational checklist for configuring repository secrets, publishing all four architecture targets (Windows as ZIP, not an installer), and validating the signed or unsigned update path. Keep it aligned with the release workflow.

Release CI builds unsigned artifacts by default. Set the repository variable `RELEASE_SIGNING=true` to require signing and configure the relevant credentials: macOS expects `MAC_CERTIFICATE_BASE64`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`; Windows expects `WINDOWS_CERTIFICATE_BASE64` and `WINDOWS_CERTIFICATE_PASSWORD`. The workflow scopes the macOS certificate variables to the macOS job and the Windows certificate variables to the Windows job.

`pnpm-workspace.yaml` explicitly allows the native build steps required by Harness (`node-pty`, `koffi`, and the local subprocess helper). It also installs optional native packages for the shipped darwin/win32 x64/arm64 targets so cross-architecture builds do not miss `sharp` or `koffi`. Keep build approvals narrow; do not switch the project to allow every dependency build script.

## Development commands

```sh
pnpm install
pnpm verify
pnpm test
pnpm smoke:packaged -- dist/<platform-unpacked-directory>
pnpm dev
pnpm dist:dir
```

`pnpm dev` is the normal local acceptance path. A valid DeepSeek API key is configured in the Harness Web UI, not committed to this repository. The wrapper sets `DSH_TELEMETRY_DISABLED=1` by default.

## UX and security rules

- Startup must visibly communicate `starting`, `ready`, and `error` states. A startup failure must provide retry and log access.
- Keep the first-run path usable without a terminal. The default workspace is created under the user's Documents directory and can be changed from the app menu.
- Keep Electron security settings strict: context isolation on, Node integration off, and external navigation opened in the system browser.
- Never print API keys, credential files, or session contents to the desktop log. Harness stderr/stdout may contain diagnostics, so treat the log as user-private data.
- Preserve graceful shutdown. Send SIGTERM first and use a bounded forced stop only after the child fails to exit.
- Changes to the upstream Web UI belong upstream. Desktop-specific changes belong under `desktop/` or `scripts/` and must not alter the Harness package.

## Validation expectations

Before handing off a change, run the narrowest relevant checks and report the exact commands. For launcher changes, run `pnpm verify`, `pnpm test`, `pnpm smoke:harness`, and a real `pnpm dev` smoke. For release changes, run the target platform's `pnpm dist:dir` or package build, followed by `pnpm verify:bundle`; this must prove the published dsh runtime is present and development-only files are absent. Do not claim Windows runtime validation from macOS alone; use the Windows CI job or a Windows machine.
