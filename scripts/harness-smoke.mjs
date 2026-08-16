import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { get } from 'node:http'

const require = createRequire(import.meta.url)
const manifestPath = require.resolve('@deepseek-ai/dsh/package.json')
const manifest = require(manifestPath)
const cliPath = join(dirname(manifestPath), 'lib', 'bin.js')

function probe(url) {
  return new Promise((resolve) => {
    const request = get(url, (response) => {
      response.resume()
      resolve(response.statusCode !== undefined && response.statusCode < 500)
    })
    request.setTimeout(1000, () => {
      request.destroy()
      resolve(false)
    })
    request.on('error', () => resolve(false))
  })
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-smoke-'))
  const workspace = join(root, 'workspace')
  const home = join(root, 'home')
  await mkdir(workspace, { recursive: true })
  await mkdir(home, { recursive: true })
  const child = spawn(process.execPath, ['--expose-internals', cliPath, 'web', '--port', '0'], {
    cwd: workspace,
    env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' },
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
      if (child.exitCode !== null) throw new Error(`dsh exited with ${String(child.exitCode)}:\n${output}`)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!url) throw new Error(`dsh did not announce readiness:\n${output}`)
    if (!await probe(`${url}/`)) throw new Error(`dsh readiness URL did not return a healthy response: ${url}`)
    console.log(`Harness smoke passed: ${url}`)
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL')
          resolve()
        }, 5000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    await rm(root, { recursive: true, force: true })
  }
}

await main()
