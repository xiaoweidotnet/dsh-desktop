import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkHarnessUpdate } from './update-check.js'

const require = createRequire(import.meta.url)
const appRoot = dirname(fileURLToPath(import.meta.url))
const splashPath = join(appRoot, 'renderer', 'splash.html')
const preloadPath = join(appRoot, 'preload.js')
const windowsDirectoryPickerPatchPath = join(appRoot, 'windows-browse-picker.patch.yml')

let windowRef
let harnessProcess
let currentPort
let currentUrl
let isQuitting = false
let isStarting = false
let settings
let desktopUpdater
let desktopUpdaterError

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  if (windowRef === undefined || windowRef.isDestroyed()) return
  if (windowRef.isMinimized()) windowRef.restore()
  windowRef.show()
  windowRef.focus()
})

function paths() {
  const dataRoot = app.getPath('userData')
  return {
    dataRoot,
    settingsFile: join(dataRoot, 'desktop-settings.json'),
    harnessHome: join(dataRoot, 'harness-home'),
    logDir: join(dataRoot, 'logs'),
    logFile: join(dataRoot, 'logs', 'dsh.log'),
  }
}

function loadSettings() {
  const target = paths().settingsFile
  try {
    const parsed = JSON.parse(readFileSync(target, 'utf8'))
    if (typeof parsed.workspaceDir === 'string' && parsed.workspaceDir.length > 0) return parsed
  } catch {
    // A corrupt or absent preference file is recoverable: use the safe default.
  }
  const fallback = join(app.getPath('documents'), 'DeepSeek Harness Workspace')
  return { workspaceDir: fallback }
}

function saveSettings() {
  const target = paths().settingsFile
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(settings, null, 2) + '\n')
}

function sendStatus(payload) {
  if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send('dsh:status', payload)
}

function status(kind, message, extra = {}) {
  sendStatus({ kind, message, workspaceDir: settings?.workspaceDir, ...extra })
}

function isHarnessPage(url) {
  return typeof currentUrl === 'string' && url.startsWith(currentUrl)
}

function reloadHarnessPage() {
  if (windowRef === undefined || windowRef.isDestroyed() || currentUrl === undefined) return false
  const contents = windowRef.webContents
  if (isHarnessPage(contents.getURL())) {
    contents.reload()
  } else {
    void contents.loadURL(currentUrl)
  }
  return true
}

async function installHarnessRefreshControl() {
  if (windowRef === undefined || windowRef.isDestroyed()) return
  const contents = windowRef.webContents
  if (!isHarnessPage(contents.getURL())) return
  await contents.executeJavaScript(`
    (() => {
      const controlId = 'dsh-desktop-refresh-control'
      if (document.getElementById(controlId)) return

      const host = document.createElement('div')
      host.id = controlId
      const shadow = host.attachShadow({ mode: 'closed' })
      const style = document.createElement('style')
      style.textContent = \`
        :host {
          all: initial;
          position: fixed;
          top: 72px;
          right: 18px;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        button {
          display: grid;
          width: 38px;
          height: 38px;
          padding: 0;
          place-items: center;
          color: rgba(244, 247, 255, .9);
          background: rgba(26, 29, 36, .82);
          border: 1px solid rgba(255, 255, 255, .12);
          border-radius: 11px;
          box-shadow: 0 8px 28px rgba(0, 0, 0, .24);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          cursor: pointer;
          transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
        }
        button:hover {
          background: rgba(48, 54, 68, .94);
          border-color: rgba(118, 167, 255, .48);
          transform: translateY(-1px);
        }
        button:active { transform: translateY(0) scale(.96); }
        button:focus-visible { outline: 2px solid #76a7ff; outline-offset: 2px; }
        svg { width: 18px; height: 18px; }
        button[aria-busy="true"] svg { animation: dsh-refresh-spin 650ms linear infinite; }
        @keyframes dsh-refresh-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          button { transition: none; }
          button[aria-busy="true"] svg { animation: none; }
        }
      \`
      const button = document.createElement('button')
      button.type = 'button'
      button.title = '刷新 Harness 页面（Ctrl/Cmd + R）'
      button.setAttribute('aria-label', '刷新 Harness 页面')
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.08 9A7 7 0 0 1 18.2 6.1L20 8M4 16l1.8 1.9A7 7 0 0 0 17.92 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      button.addEventListener('click', async () => {
        if (button.getAttribute('aria-busy') === 'true') return
        button.setAttribute('aria-busy', 'true')
        try {
          await window.dshDesktop.reloadPage()
        } finally {
          button.removeAttribute('aria-busy')
        }
      })
      shadow.append(style, button)
      document.documentElement.append(host)
    })()
  `, true)
}

function dshPackage() {
  const manifestPath = require.resolve('@deepseek-ai/dsh/package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return {
    version: typeof manifest.version === 'string' ? manifest.version : 'unknown',
    cliPath: join(dirname(manifestPath), 'lib', 'bin.js'),
  }
}

function appendLog(stream, chunk) {
  stream.write(chunk)
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = require('node:net').createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : undefined
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function probe(url) {
  return new Promise((resolve) => {
    const request = get(url, (response) => {
      response.resume()
      resolve(response.statusCode !== undefined && response.statusCode < 500)
    })
    request.setTimeout(800, () => {
      request.destroy()
      resolve(false)
    })
    request.on('error', () => resolve(false))
  })
}

async function waitUntilReady(port, child, timeoutMs = 30000) {
  const started = Date.now()
  const url = `http://127.0.0.1:${String(port)}/`
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Harness exited before it became ready (exit code ${String(child.exitCode)})`)
    if (await probe(url)) return url
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Harness did not become ready within ${String(timeoutMs / 1000)} seconds`)
}

function childEnvironment(harnessHome) {
  return {
    ...process.env,
    // Electron's bundled Node runtime is used as a private child runtime. The
    // end user never needs Node.js on PATH.
    ELECTRON_RUN_AS_NODE: '1',
    DSH_HOME: harnessHome,
    // Telemetry remains opt-in for this desktop wrapper.
    DSH_TELEMETRY_DISABLED: '1',
  }
}

async function stopHarness() {
  const child = harnessProcess
  harnessProcess = undefined
  currentPort = undefined
  currentUrl = undefined
  if (!child || child.exitCode !== null) return
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

async function startHarness() {
  if (isStarting) return
  isStarting = true
  try {
    await stopHarness()
    await windowRef.loadFile(splashPath)
    const { harnessHome, logDir, logFile } = paths()
    mkdirSync(harnessHome, { recursive: true })
    mkdirSync(logDir, { recursive: true })
    mkdirSync(settings.workspaceDir, { recursive: true })
    saveSettings()

    status('starting', '正在准备 DeepSeek Harness…')
    const port = await getFreePort()
    const { cliPath, version } = dshPackage()
    const logStream = createWriteStream(logFile, { flags: 'a' })
    appendLog(logStream, `\n--- start ${new Date().toISOString()} dsh ${version} port ${String(port)} ---\n`)
    const dshArguments = ['--expose-internals', cliPath, 'web']
    // The upstream Win32 native picker starts a second COM worker process.
    // Electron's private Node runtime can exit that worker before it reports
    // a result, so use the upstream-supported in-app browse backend on
    // Windows. The dsh web invocation and all other platforms stay unchanged.
    if (process.platform === 'win32') dshArguments.push('--patch', windowsDirectoryPickerPatchPath)
    dshArguments.push('--port', String(port))
    const child = spawn(process.execPath, dshArguments, {
      cwd: settings.workspaceDir,
      env: childEnvironment(harnessHome),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    harnessProcess = child
    child.stdout.on('data', (chunk) => appendLog(logStream, chunk))
    child.stderr.on('data', (chunk) => appendLog(logStream, chunk))
    child.once('error', (error) => appendLog(logStream, `${String(error)}\n`))
    child.once('exit', (code, signal) => {
      appendLog(logStream, `--- exit code=${String(code)} signal=${String(signal)} ---\n`)
      logStream.end()
      if (!isQuitting && harnessProcess === child) {
        harnessProcess = undefined
        status('error', 'Harness 已退出，请查看日志后重试。', { logFile })
      }
    })
    status('starting', '正在启动本地服务…', { harnessVersion: version })
    const url = await waitUntilReady(port, child)
    if (harnessProcess !== child) throw new Error('Harness was stopped during startup')
    currentPort = port
    currentUrl = url
    status('ready', '已就绪，正在打开 Harness…', { harnessVersion: version, url })
    await windowRef.loadURL(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    status('error', `启动失败：${message}`, { logFile: paths().logFile })
    await stopHarness()
  } finally {
    isStarting = false
  }
}

async function chooseWorkspace() {
  const result = await dialog.showOpenDialog(windowRef, {
    title: '选择 Harness 工作区',
    defaultPath: settings.workspaceDir,
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return false
  settings.workspaceDir = result.filePaths[0]
  saveSettings()
  await startHarness()
  return true
}

async function showUpdateResult() {
  const result = await checkHarnessUpdate()
  if (result.error) {
    await dialog.showMessageBox(windowRef, { type: 'warning', title: '检查更新失败', message: result.error })
    return result
  }
  const detail = result.updateAvailable
    ? `发现新版 Harness：${result.latestVersion}\n当前版本：${result.currentVersion}\n\n桌面应用会在打包发布新版时携带它。开发者可运行 pnpm sync:harness 更新依赖。`
    : `当前 Harness 已是最新版本：${result.currentVersion}`
  await dialog.showMessageBox(windowRef, { type: 'info', title: 'Harness 更新', message: detail })
  return result
}

async function getDesktopUpdater() {
  // Windows is distributed as a portable ZIP, while electron-updater's
  // default Windows updater expects an NSIS installer. Keep ZIP updates
  // explicit and manual so a user never starts a broken installer flow.
  if (!app.isPackaged || process.platform === 'win32') return undefined
  // Local unsigned builds made with --publish never intentionally have no
  // update channel. Production builds include this file from electron-builder.
  if (!existsSync(join(process.resourcesPath, 'app-update.yml'))) return undefined
  if (desktopUpdater !== undefined) return desktopUpdater
  const { autoUpdater } = await import('electron-updater')
  desktopUpdater = autoUpdater
  desktopUpdater.autoDownload = false
  desktopUpdater.autoInstallOnAppQuit = true
  desktopUpdater.on('error', (error) => {
    desktopUpdaterError = error instanceof Error ? error.message : String(error)
  })
  desktopUpdater.on('update-available', async (info) => {
    if (windowRef === undefined || windowRef.isDestroyed() || isQuitting) return
    const result = await dialog.showMessageBox(windowRef, {
      type: 'info',
      title: '发现桌面应用更新',
      message: `DeepSeek Harness Desktop ${info.version} 已发布。现在下载吗？`,
      buttons: ['下载并安装', '稍后'],
      defaultId: 0,
      cancelId: 1,
    })
    if (result.response === 0) {
      try {
        await desktopUpdater.downloadUpdate()
      } catch (error) {
        desktopUpdaterError = error instanceof Error ? error.message : String(error)
      }
    }
  })
  desktopUpdater.on('update-downloaded', async (info) => {
    if (windowRef === undefined || windowRef.isDestroyed() || isQuitting) return
    const result = await dialog.showMessageBox(windowRef, {
      type: 'info',
      title: '更新已下载',
      message: `DeepSeek Harness Desktop ${info.version} 已准备好，重启后安装。`,
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
    })
    if (result.response === 0) desktopUpdater.quitAndInstall()
  })
  return desktopUpdater
}

function scheduleDesktopUpdateCheck() {
  if (!app.isPackaged) return
  setTimeout(() => {
    void getDesktopUpdater()
      .then((updater) => updater?.checkForUpdates())
      .catch(() => {
        // A missing or temporarily unavailable release channel must not stop
        // the local Harness service from starting.
      })
  }, 12000)
}

async function showDesktopUpdateResult() {
  if (!app.isPackaged) {
    await dialog.showMessageBox(windowRef, {
      type: 'info',
      title: '桌面应用更新',
      message: '当前是开发模式，未连接桌面发布渠道。正式安装包会通过 GitHub Release 自动检查更新。',
    })
    return { available: false, development: true }
  }
  if (process.platform === 'win32') {
    await dialog.showMessageBox(windowRef, {
      type: 'info',
      title: '桌面应用更新',
      message: 'Windows 版是便携 ZIP 版本，不会自动安装更新。请从项目 Release 下载最新版 ZIP，退出应用后解压到新的文件夹，再双击其中的 DeepSeek Harness.exe；你的工作区和设置会保留在用户数据目录中。',
    })
    return { available: false, manual: true, platform: 'win32' }
  }
  const updater = await getDesktopUpdater()
  if (updater === undefined) {
    await dialog.showMessageBox(windowRef, {
      type: 'info',
      title: '桌面应用更新',
      message: '当前安装包未连接桌面发布渠道。正式 Release 安装包会自动检查 GitHub 更新。',
    })
    return { available: false, channel: false }
  }
  desktopUpdaterError = undefined
  try {
    const result = await updater.checkForUpdates()
    if (desktopUpdaterError !== undefined) throw new Error(desktopUpdaterError)
    const latestVersion = result?.updateInfo.version
    if (latestVersion === undefined || latestVersion === app.getVersion()) {
      await dialog.showMessageBox(windowRef, {
        type: 'info',
        title: '桌面应用更新',
        message: `当前桌面版本已是最新：${app.getVersion()}`,
      })
      return { available: false, currentVersion: app.getVersion() }
    }
    return { available: true, latestVersion }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox(windowRef, {
      type: 'warning',
      title: '桌面更新暂不可用',
      message: `无法连接桌面发布渠道。${message}`,
    })
    return { available: false, error: message }
  }
}

function createMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { label: '检查 Harness 更新', click: () => void showUpdateResult() },
        { label: '检查桌面应用更新', click: () => void showDesktopUpdateResult() },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    // Electron only wires the platform editing accelerators (Cmd/Ctrl+C/X/V,
    // undo, redo and select-all) when the application menu exposes the native
    // edit roles. Without this menu, focused inputs inside the Harness page
    // can type normally but Cmd+V on macOS never reaches the renderer.
    { role: 'editMenu' },
    {
      label: '视图',
      submenu: [
        {
          label: '刷新 Harness 页面',
          accelerator: 'CmdOrCtrl+R',
          click: () => reloadHarnessPage(),
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '工作区',
      submenu: [
        { label: '选择工作区…', click: () => void chooseWorkspace() },
        { label: '打开日志目录', click: () => void shell.openPath(paths().logDir) },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#101217',
    title: 'DeepSeek Harness',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  })
  windowRef.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('http://127.0.0.1:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  windowRef.webContents.on('will-navigate', (event, url) => {
    if (currentUrl && url.startsWith(currentUrl)) return
    if (!url.startsWith('http://127.0.0.1:')) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
  windowRef.webContents.on('did-finish-load', () => {
    void installHarnessRefreshControl().catch(() => {
      // A navigation or window close can race the cosmetic control injection.
      // The Harness page itself remains usable and the next load retries it.
    })
  })
  return windowRef
}

ipcMain.handle('dsh:get-info', () => ({
  appVersion: app.getVersion(),
  harnessVersion: dshPackage().version,
  workspaceDir: settings.workspaceDir,
  harnessHome: paths().harnessHome,
  logFile: paths().logFile,
}))
ipcMain.handle('dsh:retry', () => startHarness())
ipcMain.handle('dsh:choose-workspace', () => chooseWorkspace())
ipcMain.handle('dsh:open-logs', () => shell.openPath(paths().logDir))
ipcMain.handle('dsh:check-updates', () => showUpdateResult())
ipcMain.handle('dsh:check-desktop-updates', () => showDesktopUpdateResult())
ipcMain.handle('dsh:reload-page', () => reloadHarnessPage())

app.whenReady().then(async () => {
  app.setName('DeepSeek Harness')
  settings = loadSettings()
  createWindow()
  createMenu()
  await windowRef.loadFile(splashPath)
  void startHarness()
  scheduleDesktopUpdateCheck()
})

app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  void stopHarness().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
