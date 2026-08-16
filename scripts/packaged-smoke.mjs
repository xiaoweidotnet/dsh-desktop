import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { get } from 'node:http'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

function probe(url) {
  return new Promise((resolveProbe) => {
    const request = get(url, (response) => {
      response.resume()
      resolveProbe(response.statusCode !== undefined && response.statusCode < 500)
    })
    request.setTimeout(1500, () => {
      request.destroy()
      resolveProbe(false)
    })
    request.on('error', () => resolveProbe(false))
  })
}

function pathsFor(target) {
  const resolved = resolve(projectRoot, target)
  if (process.platform === 'darwin') {
    const appDir = basename(resolved) === 'DeepSeek Harness.app'
      ? resolved
      : join(resolved, 'DeepSeek Harness.app')
    return {
      executable: join(appDir, 'Contents', 'MacOS', 'DeepSeek Harness'),
      appRoot: join(appDir, 'Contents', 'Resources', 'app'),
    }
  }
  if (process.platform === 'win32') {
    const appDir = basename(resolved).endsWith('-unpacked') ? resolved : join(resolved, 'win-unpacked')
    return {
      executable: join(appDir, 'DeepSeek Harness.exe'),
      appRoot: join(appDir, 'resources', 'app'),
    }
  }
  throw new Error(`Packaged smoke is supported on macOS and Windows, not ${process.platform}`)
}

async function stop(child) {
  if (child.exitCode !== null) return
  try {
    child.kill('SIGTERM')
  } catch {
    return
  }
  await new Promise((resolveStop) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        try { child.kill('SIGKILL') } catch { /* the process already exited */ }
      }
      resolveStop()
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolveStop()
    })
  })
}

async function main() {
  const argumentsList = process.argv.slice(2).filter((argument) => argument !== '--')
  const target = argumentsList.find((argument) => !argument.startsWith('-'))
  const runX64 = argumentsList.includes('--x64')
  if (target === undefined) {
    throw new Error('Usage: pnpm smoke:packaged -- <unpacked-app-directory-or-mac-app> [--x64]')
  }

  const { executable, appRoot } = pathsFor(target)
  if (!existsSync(executable)) throw new Error(`Packaged Electron executable is missing: ${executable}`)
  const manifestPath = join(appRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`Packaged Harness runtime is missing: ${manifestPath}`)
  const manifest = require(manifestPath)
  const cliPath = join(dirname(manifestPath), 'lib', 'bin.js')
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-packaged-smoke-'))
  const workspace = join(root, 'workspace')
  const home = join(root, 'home')
  await mkdir(workspace, { recursive: true })
  await mkdir(home, { recursive: true })

  const command = process.platform === 'darwin' && runX64 && process.arch === 'arm64' ? 'arch' : executable
  const commandArguments = command === 'arch'
    ? ['-x86_64', executable, '--expose-internals', cliPath, 'web', '--port', '0']
    : ['--expose-internals', cliPath, 'web', '--port', '0']
  const child = spawn(command, commandArguments, {
    cwd: workspace,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DSH_HOME: home,
      DSH_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const collect = (chunk) => { output += chunk.toString() }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  try {
    const started = Date.now()
    let url
    while (Date.now() - started < 30000) {
      const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) {
        url = match[1]
        break
      }
      if (child.exitCode !== null) throw new Error(`Packaged Harness exited with ${String(child.exitCode)}:\n${output}`)
      await new Promise((resolveWait) => setTimeout(resolveWait, 250))
    }
    if (!url) throw new Error(`Packaged Harness did not announce readiness:\n${output}`)
    if (!await probe(`${url}/`)) throw new Error(`Packaged Harness readiness URL was unhealthy: ${url}`)
    console.log(`Packaged Harness smoke passed: ${url} (runtime ${manifest.version})`)
  } finally {
    await stop(child)
    await rm(root, { recursive: true, force: true })
  }
}

await main()
