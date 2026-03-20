import { ipcMain, BrowserWindow } from 'electron'
import chokidar, { FSWatcher } from 'chokidar'
import fs from 'fs'
import path from 'path'

// filePath → { watcher, lastSize }
const watchers = new Map<string, { watcher: FSWatcher; lastSize: number }>()

function sendToAllWindows(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  })
}

export function setupWatcherHandlers(): void {
  ipcMain.handle('watcher:start', async (_, filePath: string) => {
    const normalizedPath = path.normalize(filePath)
    if (watchers.has(normalizedPath)) return

    let lastSize = 0
    try {
      lastSize = fs.statSync(normalizedPath).size
    } catch {
      // ファイルが存在しない場合は 0 から開始
    }

    const watcher = chokidar.watch(normalizedPath, {
      persistent: true,
      usePolling: false,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
    })

    watcher.on('change', (changedPath) => {
      try {
        const stats = fs.statSync(changedPath)
        const newSize = stats.size

        if (newSize <= lastSize) {
          // ファイルがローテートまたは切り詰められた
          lastSize = 0
        }

        // 差分バイトを読み込む
        const fd = fs.openSync(changedPath, 'r')
        const buffer = Buffer.alloc(newSize - lastSize)
        fs.readSync(fd, buffer, 0, buffer.length, lastSize)
        fs.closeSync(fd)

        const newContent = buffer.toString('utf-8')
        const newLines = newContent.split('\n').filter((l) => l.trim().length > 0)

        lastSize = newSize

        sendToAllWindows('watcher:change', { filePath: normalizedPath, newLines })
      } catch (err) {
        console.error('[watcher] error reading new lines:', err)
      }
    })

    watchers.set(normalizedPath, { watcher, lastSize })
  })

  ipcMain.handle('watcher:stop', async (_, filePath: string) => {
    const normalizedPath = path.normalize(filePath)
    const entry = watchers.get(normalizedPath)
    if (entry) {
      await entry.watcher.close()
      watchers.delete(normalizedPath)
    }
  })

  ipcMain.handle('watcher:stop-all', async () => {
    await Promise.all([...watchers.values()].map((e) => e.watcher.close()))
    watchers.clear()
  })
}

export async function cleanupWatchers(): Promise<void> {
  await Promise.all([...watchers.values()].map((e) => e.watcher.close()))
  watchers.clear()
}
