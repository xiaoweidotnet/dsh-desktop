const packageJson = require('./package.json')
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/')
const publish = owner && repo
  ? { provider: 'github', owner, repo, releaseType: 'release' }
  : undefined

module.exports = {
  appId: 'ai.deepseek.harness.desktop',
  productName: 'DeepSeek Harness',
  artifactName: 'DeepSeek-Harness-${version}-${os}-${arch}.${ext}',
  // Signing is enabled explicitly by the release workflow when certificates
  // are configured. Unsigned packages remain usable for testing and can be
  // distributed with the platform's normal untrusted-app warning.
  forceCodeSigning: process.env.RELEASE_SIGNING === 'true',
  asar: false,
  files: [
    'desktop/**/*',
    'package.json',
    'node_modules/**/*',
    '!node_modules/electron{,/**}',
    '!node_modules/electron-builder{,/**}',
  ],
  mac: {
    category: 'public.app-category.developer-tools',
    icon: 'assets/app-icon.icns',
    target: ['dmg', 'zip'],
  },
  win: {
    // Windows is distributed as a self-contained ZIP. The archive contains
    // the runnable app directory; users do not need an installer or Node.js.
    icon: 'assets/app-icon.ico',
    target: ['zip'],
    artifactName: 'DeepSeek-Harness-${version}-${os}-${arch}-portable.${ext}',
  },
  ...(publish === undefined ? {} : { publish }),
  extraMetadata: {
    name: packageJson.name,
    version: packageJson.version,
  },
}
