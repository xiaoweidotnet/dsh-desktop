<p align="center">
  <img src="assets/app-icon.png" width="128" height="128" alt="DSH Desktop icon">
</p>

<h1 align="center">DeepSeek Harness Desktop</h1>

<p align="center">Run DeepSeek Harness on macOS and Windows without installing Node.js or using a terminal.</p>

<p align="center">
  <a href="README.md">简体中文</a> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/xiaoweidotnet/dsh-desktop/actions/workflows/ci.yml"><img src="https://github.com/xiaoweidotnet/dsh-desktop/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
</p>

## About

DeepSeek Harness Desktop is an open-source, cross-platform Electron launcher. It does not copy or replace the Harness UI or invocation protocol. Instead, it starts the real `dsh web` command from the official npm package inside Electron's private Node.js runtime and displays the local Harness Web UI in a desktop window.

DeepSeek's official `npx` command and this project use the same published npm package: `@deepseek-ai/dsh`. The desktop build bundles an exact runtime version, so end users do not need Node.js, pnpm, a terminal, or PATH configuration.

> This is an unofficial, community-maintained desktop wrapper. It is not affiliated with or endorsed by DeepSeek. DeepSeek Harness names, code, and related rights belong to their respective owners.

## Features

- Double-click startup with no Node.js or command-line setup.
- macOS ARM64/x64 and Windows x64/ARM64 support.
- The original `dsh web` invocation and native Harness Web UI.
- An automatically selected free port bound only to `127.0.0.1`.
- An in-page desktop refresh button, plus `Ctrl/Cmd + R` to reload the Harness page.
- Persistent sessions, settings, credentials, and attachments in the OS user-data directory.
- Visual workspace selection, with Harness's in-app directory browser on Windows.
- GitHub Release updates for signed macOS builds and portable ZIP distribution on Windows.
- Automatic checks for newly published npm runtime versions without cloning source code.

## Download and use

After the first public release, download the appropriate asset from [GitHub Releases](https://github.com/xiaoweidotnet/dsh-desktop/releases):

- Apple Silicon Mac: `mac-arm64.dmg`
- Intel Mac: `mac-x64.dmg`
- Most Windows PCs: `win-x64-portable.zip`
- Windows on ARM: `win-arm64-portable.zip`

On Windows, extract the ZIP and double-click `DeepSeek Harness.exe`. On first launch, configure your DeepSeek API key and model in the Harness settings screen.

## Development

These tools are required only for desktop development, not for end users.

```sh
pnpm install
pnpm verify
pnpm test
pnpm dev
```

The wrapper maps Harness data to Electron's per-user application-data directory. The default workspace is `DeepSeek Harness Workspace` under Documents.

## Build

```sh
pnpm dist:dir
pnpm smoke:packaged -- dist/mac-arm64
pnpm verify:bundle
pnpm dist:mac
pnpm dist:mac:x64
pnpm dist:win
pnpm dist:win:arm64
```

Windows builds are portable ZIP archives, not installer executables. Production macOS distribution requires Developer ID signing and notarization; production Windows distribution requires a code-signing certificate.

## Harness runtime updates

Only versions published to the npm Registry are treated as packageable runtimes. The project never clones or retains a DeepSeek Harness source checkout.

```sh
pnpm check:harness
pnpm sync:harness
pnpm verify && pnpm test && pnpm dist:dir
```

[harness-runtime-sync.yml](.github/workflows/harness-runtime-sync.yml) checks npm weekly and opens an update pull request. [release.yml](.github/workflows/release.yml) builds and publishes desktop assets from version tags. End-user machines never run Git, pnpm, or source-code updates.

## Security and privacy

- The Harness server listens on loopback only.
- Electron context isolation is enabled and renderer Node integration is disabled.
- API keys, sessions, and workspace contents remain local user data and must never be committed.
- Logs can contain local diagnostics and should be treated as private files.

See [SECURITY.md](SECURITY.md) for security reports and [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance. Architecture rules are documented in [AGENTS.md](AGENTS.md), acceptance criteria in [goal.md](goal.md), and release operations in [RELEASE.md](RELEASE.md).

## License and acknowledgements

This project is licensed under the [MIT License](LICENSE). Thanks to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), whose official MIT-licensed npm runtime is used by the desktop build.
