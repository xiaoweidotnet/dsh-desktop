import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

function appRootFrom(target) {
  const resolved = resolve(root, target)
  if (basename(resolved) === 'DeepSeek Harness.app') return join(resolved, 'Contents', 'Resources', 'app')
  if (basename(resolved).endsWith('-unpacked')) return join(resolved, 'resources', 'app')
  return resolved
}

const cliTargets = process.argv.slice(2).filter((argument) => argument !== '--')
const requestedCandidates = cliTargets.length > 0
  ? cliTargets.map(appRootFrom)
  : [
      join(root, 'dist', 'mac-arm64', 'DeepSeek Harness.app', 'Contents', 'Resources', 'app'),
      join(root, 'dist', 'mac', 'DeepSeek Harness.app', 'Contents', 'Resources', 'app'),
      join(root, 'dist', 'win-unpacked', 'resources', 'app'),
      join(root, 'dist', 'win-arm64-unpacked', 'resources', 'app'),
    ]
const candidates = cliTargets.length > 0
  ? requestedCandidates
  : requestedCandidates.filter((candidate) => existsSync(join(candidate, 'package.json')))
if (candidates.length === 0) {
  throw new Error(`Cannot find an unpacked app bundle. Pass its path to verify-bundle.mjs. Tried: ${requestedCandidates.join(', ')}`)
}

const required = [
  'desktop/main.js',
  'desktop/preload.js',
  'desktop/renderer/splash.html',
  'desktop/windows-browse-picker.patch.yml',
  'package.json',
  'node_modules/@deepseek-ai/dsh/package.json',
  'node_modules/@deepseek-ai/dsh-host-directory-picker-browse/package.json',
  'node_modules/@deepseek-ai/dsh-client-ui-directory-picker-browse/package.json',
  'node_modules/@deepseek-ai/dsh-tool-pwsh/package.json',
  'node_modules/@deepseek-ai/dsh-pwsh-local/package.json',
  'node_modules/@deepseek-ai/dsh-pwsh-sandbox/package.json',
  'node_modules/@deepseek-ai/dsh-sandbox-windows-acl/package.json',
  'node_modules/electron-updater/package.json',
  'node_modules/sharp/package.json',
  'node_modules/koffi/package.json',
  'node_modules/@img/sharp-darwin-arm64/package.json',
  'node_modules/@img/sharp-darwin-x64/package.json',
  'node_modules/@img/sharp-win32-arm64/package.json',
  'node_modules/@img/sharp-win32-x64/package.json',
  'node_modules/@koromix/koffi-darwin-arm64/package.json',
  'node_modules/@koromix/koffi-darwin-x64/package.json',
  'node_modules/@koromix/koffi-win32-arm64/package.json',
  'node_modules/@koromix/koffi-win32-x64/package.json',
]
const forbidden = [
  'upstream',
  'AGENTS.md',
  'goal.md',
  'scripts',
  'test',
  'electron-builder.config.cjs',
]

for (const appRoot of candidates) {
  if (!existsSync(join(appRoot, 'package.json'))) {
    throw new Error(`Cannot find an unpacked app bundle: ${appRoot}`)
  }

  const missing = required.filter((file) => !existsSync(join(appRoot, file)))
  if (missing.length > 0) throw new Error(`Production bundle is missing runtime files in ${appRoot}: ${missing.join(', ')}`)

  const leaked = forbidden.filter((file) => existsSync(join(appRoot, file)))
  if (leaked.length > 0) throw new Error(`Developer-only files leaked into ${appRoot}: ${leaked.join(', ')}`)

  const packageJson = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'))
  const harnessPackage = JSON.parse(readFileSync(join(appRoot, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'))
  console.log(`Production bundle is clean: ${appRoot}`)
  console.log(`Harness runtime: ${packageJson.dependencies?.['@deepseek-ai/dsh'] ?? harnessPackage.version}`)
}
