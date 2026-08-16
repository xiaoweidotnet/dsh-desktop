import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('..', import.meta.url)))
const require = createRequire(import.meta.url)
const required = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'RELEASE.md',
  'goal.md',
  'README.md',
  'README.en.md',
  'SECURITY.md',
  'package.json',
  'electron-builder.config.cjs',
  'assets/app-icon.png',
  'assets/app-icon.icns',
  'assets/app-icon.ico',
  'desktop/main.js',
  'desktop/preload.js',
  'desktop/renderer/splash.html',
  'desktop/windows-browse-picker.patch.yml',
  'scripts/update-harness-runtime.mjs',
  'scripts/harness-smoke.mjs',
  'scripts/packaged-smoke.mjs',
  'scripts/verify-bundle.mjs',
  'scripts/verify-release-env.mjs',
  '.github/workflows/ci.yml',
  '.github/workflows/harness-runtime-sync.yml',
  '.github/workflows/release.yml',
]
const missing = required.filter((file) => !existsSync(join(root, file)))
if (missing.length > 0) throw new Error(`Missing project files: ${missing.join(', ')}`)

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const builderConfig = require(join(root, 'electron-builder.config.cjs'))
const harnessVersion = packageJson.dependencies?.['@deepseek-ai/dsh']
if (typeof harnessVersion !== 'string') {
  throw new Error('The desktop launcher must pin @deepseek-ai/dsh.')
}
const harnessRuntimeEntries = Object.entries(packageJson.dependencies ?? {})
  .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
const mismatchedHarnessPins = harnessRuntimeEntries.filter(([, version]) => version !== harnessVersion)
if (mismatchedHarnessPins.length > 0) {
  throw new Error(`Harness runtime packages must share one exact version: ${mismatchedHarnessPins.map(([name]) => name).join(', ')}`)
}
if (existsSync(join(root, 'upstream'))) {
  throw new Error('The desktop project must not retain a Harness source checkout; use the published npm runtime.')
}
if (builderConfig.asar !== false) {
  throw new Error('The packaged app must keep asar disabled so the child Node runtime can execute dsh files.')
}
if (builderConfig.mac?.icon !== 'assets/app-icon.icns' || builderConfig.win?.icon !== 'assets/app-icon.ico') {
  throw new Error('macOS and Windows must use the checked-in application icon assets.')
}
if (builderConfig.files?.includes('electron-builder.config.cjs')) {
  throw new Error('The build-only electron-builder config must not be shipped to end users.')
}

const runtimeUpdater = readFileSync(join(root, 'scripts/update-harness-runtime.mjs'), 'utf8')
for (const forbiddenText of ['deepseek-harness.git', 'sourceCommit', 'manifest.json']) {
  if (runtimeUpdater.includes(forbiddenText)) throw new Error(`Harness runtime updater must not depend on source metadata: ${forbiddenText}`)
}

const main = readFileSync(join(root, 'desktop/main.js'), 'utf8')
for (const requiredText of ['ELECTRON_RUN_AS_NODE', '--expose-internals', 'DSH_HOME', "'web'", "'--port'"]) {
  if (!main.includes(requiredText)) throw new Error(`desktop/main.js is missing ${requiredText}`)
}
const windowsPickerPatch = readFileSync(join(root, 'desktop/windows-browse-picker.patch.yml'), 'utf8')
for (const requiredText of ['directory-picker-browse', 'ui-directory-picker-browse']) {
  if (!windowsPickerPatch.includes(requiredText)) throw new Error(`Windows picker patch is missing ${requiredText}`)
}

console.log('Project structure and launcher invariants are valid.')
