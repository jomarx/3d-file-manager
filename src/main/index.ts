import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { closeDatabase, openDatabase } from './db'
import { registerIpc } from './ipc'

// Keep all app data in %APPDATA%\3FM regardless of the package name.
app.setName('3FM')
app.setPath('userData', join(app.getPath('appData'), '3FM'))

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: '3FM — 3D Files Manager',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f6f7f9',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  // Never open new Electron windows; send web links to the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    const dbPath = join(app.getPath('userData'), '3fm.db')
    openDatabase(dbPath)
    registerIpc(dbPath)
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => closeDatabase())
}
