import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'

// ===== ローカルデータベースディレクトリ =====

const DB_DIR_NAME = 'log_analyse_db'

// プラットフォーム標準のユーザーデータフォルダ配下にDBディレクトリを作成
// Windows: %APPDATA%\log_analyse\log_analyse_db
// macOS:   ~/Library/Application Support/log_analyse/log_analyse_db
// Linux:   ~/.config/log_analyse/log_analyse_db
function getDbDir(): string {
  return path.join(app.getPath('userData'), DB_DIR_NAME)
}

function ensureDbDir(): void {
  const dir = getDbDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// IDをファイル名として安全に使用できる形式に変換（Windows非対応文字を回避）
function idToFileName(id: string): string {
  return id.replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c] ?? c)) + '.json'
}

function getFilePath(id: string): string {
  return path.join(getDbDir(), idToFileName(id))
}

// ===== IPC ハンドラ =====

export function setupDbHandlers(): void {
  // パース済みログファイルデータを JSON として保存
  ipcMain.handle('db:save-log-file', async (_, id: string, data: unknown) => {
    try {
      ensureDbDir()
      fs.writeFileSync(getFilePath(id), JSON.stringify(data), 'utf-8')
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  })

  // 保存済みの全ログファイルデータを読み込む
  ipcMain.handle('db:load-all-log-files', async () => {
    try {
      ensureDbDir()
      const dir = getDbDir()
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
      const results: unknown[] = []

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8')
          results.push(JSON.parse(content))
        } catch {
          // 破損ファイルはスキップ
        }
      }

      return results
    } catch {
      return []
    }
  })

  // 指定IDのログファイルデータを削除
  ipcMain.handle('db:remove-log-file', async (_, id: string) => {
    try {
      const filePath = getFilePath(id)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  })
}
