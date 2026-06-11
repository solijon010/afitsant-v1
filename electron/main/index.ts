import { app, BrowserWindow, shell, globalShortcut, screen } from 'electron'
import { join } from 'node:path'
import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { registerIpc } from './ipc'
import { getDb, closeDb } from './db/connection'
import { seedIfEmpty } from './db/seed'
import { startSync, stopSync } from './services/syncEngine'
import { setUnauthorizedHandler } from './services/apiClient'
import { migrateSensitiveSettings } from './services/settings'
import { IPC } from '@shared/ipc'

// Electron terminal pipe yopiq bo'lganda EPIPE xatosi chiqmasligi uchun
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err })
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err })

/* ─── File logger ─────────────────────────────────────── */
function setupFileLogger(): void {
  const logDir = app.getPath('logs')
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
  const logFile = join(logDir, 'main.log')

  const write = (level: string, args: unknown[]) => {
    const line = `[${new Date().toISOString()}] [${level}] ${args.map(a =>
      typeof a === 'object' ? JSON.stringify(a) : String(a)
    ).join(' ')}\n`
    appendFileSync(logFile, line)
  }

  const orig = { log: console.log, error: console.error, warn: console.warn }
  console.log   = (...a) => { orig.log(...a);   write('INFO',  a) }
  console.error = (...a) => { orig.error(...a); write('ERROR', a) }
  console.warn  = (...a) => { orig.warn(...a);  write('WARN',  a) }

  console.log(`=== App started v${app.getVersion()} ===`)
  console.log(`Log file: ${logFile}`)
}

let mainWindow: BrowserWindow | null = null

function getWindowBounds(): {
  width: number
  height: number
  minWidth: number
  minHeight: number
} {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  const width = Math.min(1440, Math.max(1024, screenWidth))
  const height = Math.min(900, Math.max(700, screenHeight))

  return {
    width,
    height,
    minWidth: Math.min(1100, screenWidth),
    minHeight: Math.min(700, screenHeight)
  }
}

function createWindow(): void {
  const isDev = !app.isPackaged
  const bounds = getWindowBounds()
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    backgroundColor: '#F5F5F4',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    frame: true,
    icon: app.isPackaged
      ? join(process.resourcesPath, 'hisobchim-logo.ico')
      : join(__dirname, '../../src/assets/hisobchim-logo.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!isDev) {
      mainWindow?.maximize()
    }
    mainWindow?.show()
    mainWindow?.setTitle('Hisobchim POS')
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      // Malformed URLs are denied below.
    }
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

app.whenReady().then(() => {
  setupFileLogger()

  const db = getDb()
  seedIfEmpty(db)
  migrateSensitiveSettings()

  registerIpc()
  createWindow()
  startSync(getMainWindow)

  // 401 bo'lganda renderer ga session tugaganligi haqida xabar yuboramiz
  setUnauthorizedHandler(() => {
    const win = getMainWindow()
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(IPC.onSessionExpired)
    }
  })

  if (!app.isPackaged) {
    globalShortcut.register('F12', () => {
      const win = getMainWindow()
      if (win) win.webContents.toggleDevTools()
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  stopSync()
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopSync()
  closeDb()
})
