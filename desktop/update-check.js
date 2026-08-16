const registryUrl = 'https://registry.npmjs.org/@deepseek-ai/dsh/latest'

export async function checkHarnessUpdate() {
  try {
    const currentVersion = (await import('@deepseek-ai/dsh/package.json', { with: { type: 'json' } })).default.version
    const response = await fetch(registryUrl, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`npm registry returned HTTP ${String(response.status)}`)
    const payload = await response.json()
    const latestVersion = typeof payload.version === 'string' ? payload.version : undefined
    if (!latestVersion) throw new Error('npm registry response did not include a version')
    return { currentVersion, latestVersion, updateAvailable: latestVersion !== currentVersion }
  } catch (error) {
    return { error: `无法连接 npm registry：${error instanceof Error ? error.message : String(error)}` }
  }
}
