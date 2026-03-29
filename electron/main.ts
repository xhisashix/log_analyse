import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { setupFileHandlers } from './handlers/fileHandler'
import { setupWatcherHandlers, cleanupWatchers } from './handlers/watcherHandler'
import { setupDbHandlers, closeDb } from './handlers/dbHandler'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false
  })

  win.once('ready-to-show', () => win.show())

  // 開発時はViteの dev server に接続、本番はビルドされたHTMLを読み込む
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // 外部リンクはデフォルトブラウザで開く
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

app.whenReady().then(() => {
  setupFileHandlers()
  setupWatcherHandlers()
  setupDbHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  cleanupWatchers()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDb()
})

// 未処理の IPC チャンネルフォールバック
ipcMain.handle('app:get-version', () => app.getVersion())
