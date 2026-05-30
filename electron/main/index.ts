import { app, BrowserWindow, shell, globalShortcut } from 'electron'
import { join } from 'node:path'
import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { registerIpc } from './ipc'
import { getDb, closeDb } from './db/connection'
import { seedIfEmpty } from './db/seed'
import { startSync, stopSync } from './services/syncEngine'
import { setUnauthorizedHandler } from './services/apiClient'
import { IPC } from '@shared/ipc'

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

function createWindow(): void {
  const isDev = !app.isPackaged
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#F5F5F4',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    frame: true,
    icon: join(__dirname, '../../src/assets/hisobchim-logo.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.setTitle('Hisobchim POS')
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
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

  // F12 → DevTools (debug uchun, production da ham)
  globalShortcut.register('F12', () => {
    const win = getMainWindow()
    if (win) win.webContents.toggleDevTools()
  })

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
