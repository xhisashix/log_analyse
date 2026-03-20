import { contextBridge, ipcRenderer } from 'electron'

export type OpenDialogResult = { canceled: boolean; filePaths: string[] }
export type ReadFileResult = { success: boolean; content?: string; error?: string }
export type WatcherEvent = 'change' | 'add' | 'unlink'

const api = {
  // ファイル操作
  openFileDialog: (): Promise<OpenDialogResult> =>
    ipcRenderer.invoke('file:open-dialog'),

  readFile: (filePath: string): Promise<ReadFileResult> =>
    ipcRenderer.invoke('file:read', filePath),

  getFileStats: (filePath: string): Promise<{ size: number; mtime: number } | null> =>
    ipcRenderer.invoke('file:stats', filePath),

  // ファイル監視
  startWatcher: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('watcher:start', filePath),

  stopWatcher: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('watcher:stop', filePath),

  stopAllWatchers: (): Promise<void> =>
    ipcRenderer.invoke('watcher:stop-all'),

  // イベントリスナー（Main → Renderer）
  onFileChange: (
    callback: (event: { filePath: string; newLines: string[] }) => void
  ) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { filePath: string; newLines: string[] }) =>
      callback(payload)
    ipcRenderer.on('watcher:change', handler)
    return () => ipcRenderer.removeListener('watcher:change', handler)
  },

  // アプリ情報
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version')
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
