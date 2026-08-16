import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const packagePath = join(root, 'package.json')
const apply = process.argv.includes('--apply')
const checkOnly = process.argv.includes('--check')
const harnessPackageName = '@deepseek-ai/dsh'

async function getPublishedVersion(packageName) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`npm registry returned HTTP ${response.status} for ${packageName}`)
  }
  const manifest = await response.json()
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`npm registry did not return a valid version for ${packageName}`)
  }
  return manifest.version
}

function incrementPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (match === null) throw new Error(`desktop version must be a stable semver, got ${version}`)
  return `${match[1]}.${match[2]}.${String(Number(match[3]) + 1)}`
}

const projectPackage = JSON.parse(readFileSync(packagePath, 'utf8'))
const dependencies = projectPackage.dependencies ?? {}
const currentVersion = dependencies[harnessPackageName]
if (typeof currentVersion !== 'string' || currentVersion.length === 0) {
  throw new Error(`${harnessPackageName} must be an exact desktop dependency`)
}

// The published npm packages are the only Harness runtime source. Keep every
// explicitly bundled peer on the same version so electron-builder receives a
// coherent runtime closure without a source checkout.
const runtimeNames = Object.keys(dependencies)
  .filter((name) => name === harnessPackageName || name.startsWith('@deepseek-ai/dsh-'))
  .sort()
const inconsistentPins = runtimeNames.filter((name) => dependencies[name] !== currentVersion)
const latestVersion = await getPublishedVersion(harnessPackageName)
const updateAvailable = latestVersion !== currentVersion || inconsistentPins.length > 0

if (!updateAvailable) {
  console.log(`Published Harness runtime is current at ${currentVersion}.`)
  process.exit(0)
}

if (latestVersion !== currentVersion) {
  console.log(`Published Harness runtime moved from ${currentVersion} to ${latestVersion}.`)
}
if (inconsistentPins.length > 0) {
  console.log(`Harness runtime peers are not aligned: ${inconsistentPins.join(', ')}.`)
}
if (checkOnly) {
  process.exitCode = 1
  process.exit()
}
if (!apply) {
  console.log('Run pnpm sync:harness to update the exact published runtime closure.')
  process.exit(0)
}

const runtimePins = runtimeNames.map((name) => `${name}@${latestVersion}`)
const pnpmCliPath = process.env.npm_execpath
if (typeof pnpmCliPath !== 'string' || pnpmCliPath.length === 0) {
  throw new Error('pnpm CLI path is unavailable; run this script through pnpm sync:harness')
}
execFileSync(process.execPath, [pnpmCliPath, 'add', '--save-exact', ...runtimePins], {
  cwd: root,
  stdio: 'inherit',
})

const updatedPackage = JSON.parse(readFileSync(packagePath, 'utf8'))
updatedPackage.version = incrementPatch(updatedPackage.version)
writeFileSync(packagePath, JSON.stringify(updatedPackage, null, 2) + '\n')
console.log(`Updated the exact published Harness runtime closure to ${latestVersion} and bumped desktop version to ${updatedPackage.version}. Run pnpm verify and pnpm test.`)
