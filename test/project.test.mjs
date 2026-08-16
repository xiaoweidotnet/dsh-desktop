import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('..', import.meta.url)))

test('desktop wrapper delegates to the unchanged dsh web command', () => {
  const main = readFileSync(join(root, 'desktop/main.js'), 'utf8')
  assert.match(main, /dshArguments = \['--expose-internals', cliPath, 'web'\]/)
  assert.match(main, /dshArguments\.push\('--port', String\(port\)\)/)
  assert.match(main, /process\.platform === 'win32'/)
  assert.match(main, /windowsDirectoryPickerPatchPath/)
  assert.match(main, /DSH_HOME: harnessHome/)
  assert.match(main, /ELECTRON_RUN_AS_NODE: '1'/)
  assert.match(main, /'--expose-internals'/)
  assert.match(main, /requestSingleInstanceLock\(\)/)
})

test('desktop exposes native editing commands for renderer inputs', () => {
  const main = readFileSync(join(root, 'desktop/main.js'), 'utf8')
  assert.match(main, /\{ role: 'editMenu' \}/)
})

test('desktop exposes an in-page Harness refresh control', () => {
  const main = readFileSync(join(root, 'desktop/main.js'), 'utf8')
  const preload = readFileSync(join(root, 'desktop/preload.js'), 'utf8')
  assert.match(main, /function reloadHarnessPage\(\)/)
  assert.match(main, /dsh-desktop-refresh-control/)
  assert.match(main, /刷新 Harness 页面/)
  assert.match(main, /accelerator: 'CmdOrCtrl\+R'/)
  assert.match(main, /webContents\.on\('did-finish-load'/)
  assert.match(main, /ipcMain\.handle\('dsh:reload-page'/)
  assert.match(preload, /reloadPage: \(\) => ipcRenderer\.invoke\('dsh:reload-page'\)/)
})

test('open-source documentation is bilingual and licensed', () => {
  const readmeZh = readFileSync(join(root, 'README.md'), 'utf8')
  const readmeEn = readFileSync(join(root, 'README.en.md'), 'utf8')
  assert.match(readmeZh, /README\.en\.md/)
  assert.match(readmeZh, /无需安装 Node\.js/)
  assert.match(readmeEn, /README\.md/)
  assert.match(readmeEn, /without installing Node\.js/)
  assert.match(readFileSync(join(root, 'LICENSE'), 'utf8'), /MIT License/)
})

test('Harness runtime is sourced exclusively from exact published npm packages', () => {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const harnessVersion = packageJson.dependencies['@deepseek-ai/dsh']
  const runtimeVersions = Object.entries(packageJson.dependencies)
    .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    .map(([, version]) => version)
  assert.ok(runtimeVersions.length > 1)
  assert.ok(runtimeVersions.every((version) => version === harnessVersion))
  assert.equal(existsSync(join(root, 'upstream')), false)
  const updater = readFileSync(join(root, 'scripts/update-harness-runtime.mjs'), 'utf8')
  assert.match(updater, /registry\.npmjs\.org/)
  assert.match(updater, /process\.env\.npm_execpath/)
  assert.doesNotMatch(updater, /npm\.cmd|pnpm\.cmd/)
  assert.doesNotMatch(updater, /deepseek-harness\.git|sourceCommit|manifest\.json/)
  assert.match(readFileSync(join(root, 'RELEASE.md'), 'utf8'), /WINDOWS_CERTIFICATE_BASE64/)
})

test('release configuration only enables publishing with an explicit repository', async () => {
  const config = readFileSync(join(root, 'electron-builder.config.cjs'), 'utf8')
  assert.match(config, /icon: 'assets\/app-icon\.icns'/)
  assert.match(config, /icon: 'assets\/app-icon\.ico'/)
  assert.match(config, /GITHUB_REPOSITORY/)
  assert.match(config, /provider: 'github'/)
  assert.doesNotMatch(config, /upstream/)
  assert.doesNotMatch(config, /'electron-builder\.config\.cjs'/)
  assert.match(config, /forceCodeSigning: process\.env\.RELEASE_SIGNING === 'true'/)
  assert.match(config, /target: \['zip'\]/)
  assert.match(config, /-portable\.\$\{ext\}/)
  assert.doesNotMatch(config, /target: \['nsis'\]/)
  assert.match(readFileSync(join(root, 'scripts/verify-release-env.mjs'), 'utf8'), /APPLE_APP_SPECIFIC_PASSWORD/)
  const updateCheck = readFileSync(join(root, 'desktop/main.js'), 'utf8')
  assert.match(updateCheck, /electron-updater/)
  assert.match(updateCheck, /autoDownload = false/)
  assert.match(updateCheck, /app-update\.yml/)
  assert.match(updateCheck, /process\.platform === 'win32'/)
  assert.match(updateCheck, /便携 ZIP 版本/)
  assert.match(updateCheck, /scheduleDesktopUpdateCheck/)
  const releaseWorkflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')
  assert.match(releaseWorkflow, /--mac --arm64/)
  assert.match(releaseWorkflow, /--mac --x64/)
  assert.match(releaseWorkflow, /--win --x64/)
  assert.match(releaseWorkflow, /--win --arm64/)
  assert.match(releaseWorkflow, /RELEASE_SIGNING/)
  assert.match(releaseWorkflow, /if: vars\.RELEASE_SIGNING == 'true'/)
  assert.match(releaseWorkflow, /CSC_IDENTITY_AUTO_DISCOVERY/)
  assert.match(releaseWorkflow, /Configure signing environment/)
})

test('production bundle verification checks every requested architecture', () => {
  const verifier = readFileSync(join(root, 'scripts/verify-bundle.mjs'), 'utf8')
  assert.match(verifier, /for \(const appRoot of candidates\)/)
  assert.match(verifier, /win-arm64-unpacked/)
  assert.match(verifier, /sharp-darwin-x64/)
  assert.match(verifier, /koffi-win32-arm64/)
  assert.match(verifier, /dsh-tool-pwsh/)
  assert.match(verifier, /dsh-sandbox-windows-acl/)
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
  assert.match(ci, /macos-14/)
  assert.match(ci, /macos-15-intel/)
  assert.match(ci, /Windows x64\/ARM64/)
})

test('packaged smoke uses the bundled Electron runtime', () => {
  const smoke = readFileSync(join(root, 'scripts/packaged-smoke.mjs'), 'utf8')
  assert.match(smoke, /ELECTRON_RUN_AS_NODE: '1'/)
  assert.match(smoke, /DSH_HOME: home/)
  assert.match(smoke, /dsh web: /)
  assert.match(smoke, /DeepSeek Harness\.exe/)
  assert.match(smoke, /-x86_64/)
})

test('Windows uses the upstream in-app directory browser', () => {
  const patch = readFileSync(join(root, 'desktop/windows-browse-picker.patch.yml'), 'utf8')
  assert.match(patch, /directory-picker-browse/)
  assert.match(patch, /ui-directory-picker-browse/)
  assert.match(readFileSync(join(root, 'scripts/verify-bundle.mjs'), 'utf8'), /dsh-client-ui-directory-picker-browse/)
})
