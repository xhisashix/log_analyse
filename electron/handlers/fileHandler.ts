import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'

export function setupFileHandlers(): void {
  // ファイル選択ダイアログを開く
  ipcMain.handle('file:open-dialog', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { canceled: true, filePaths: [] }

    const result = await dialog.showOpenDialog(win, {
      title: 'ログファイルを選択',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Log Files', extensions: ['log', 'txt', 'access', 'error'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    return result
  })

  // ファイルの内容を読み込む
  ipcMain.handle('file:read', async (_, filePath: string) => {
    try {
      const normalizedPath = path.normalize(filePath)
      const content = fs.readFileSync(normalizedPath, 'utf-8')
      return { success: true, content }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  // ファイルの統計情報を取得
  ipcMain.handle('file:stats', async (_, filePath: string) => {
    try {
      const normalizedPath = path.normalize(filePath)
      const stats = fs.statSync(normalizedPath)
      return {
        size: stats.size,
        mtime: stats.mtimeMs
      }
    } catch {
      return null
    }
  })
}
