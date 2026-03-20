// Renderer プロセスで window.electronAPI として公開される型定義
export interface OpenDialogResult {
  canceled: boolean
  filePaths: string[]
}

export interface ReadFileResult {
  success: boolean
  content?: string
  error?: string
}

declare global {
  interface Window {
    electronAPI: {
      openFileDialog: () => Promise<OpenDialogResult>
      readFile: (filePath: string) => Promise<ReadFileResult>
      getFileStats: (filePath: string) => Promise<{ size: number; mtime: number } | null>
      startWatcher: (filePath: string) => Promise<void>
      stopWatcher: (filePath: string) => Promise<void>
      stopAllWatchers: () => Promise<void>
      onFileChange: (
        callback: (event: { filePath: string; newLines: string[] }) => void
      ) => () => void
      getVersion: () => Promise<string>
    }
  }
}

export {}
