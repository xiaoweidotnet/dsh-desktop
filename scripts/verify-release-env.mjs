const target = process.argv[2]
const required = target === 'mac'
  ? ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
  : target === 'windows'
    ? ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']
    : []

if (required.length === 0) throw new Error(`Usage: node scripts/verify-release-env.mjs <mac|windows>`)
const missing = required.filter((name) => typeof process.env[name] !== 'string' || process.env[name].length === 0)
if (missing.length > 0) throw new Error(`Missing release credentials for ${target}: ${missing.join(', ')}`)
console.log(`Release credentials are present for ${target}.`)
