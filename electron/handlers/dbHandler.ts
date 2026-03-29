import { ipcMain, app } from 'electron'
import Database from 'better-sqlite3'
import path from 'path'

// ===== SQLite データベース初期化 =====

// プラットフォーム標準のユーザーデータフォルダ配下に DB ファイルを作成
// Windows: %APPDATA%\log_analyse\log_analyse.db
// macOS:   ~/Library/Application Support/log_analyse/log_analyse.db
// Linux:   ~/.config/log_analyse/log_analyse.db
function getDbPath(): string {
  return path.join(app.getPath('userData'), 'log_analyse.db')
}

// DB インスタンスをモジュールスコープで保持
let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath())
    // WAL モードで並行読み取りのパフォーマンスを向上
    db.pragma('journal_mode = WAL')
    // log_files テーブルの初期化
    // id: ログファイルの一意識別子（btoa(encodeURIComponent(filePath))）
    // data: PersistedLogFile を JSON シリアライズした文字列
    db.exec(`
      CREATE TABLE IF NOT EXISTS log_files (
        id   TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `)
  }
  return db
}

// ===== DB クローズ =====

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

// ===== IPC ハンドラ =====

export function setupDbHandlers(): void {
  // パース済みログファイルデータを SQLite に保存（同一 ID が存在する場合は上書き）
  ipcMain.handle('db:save-log-file', (_, id: string, data: unknown) => {
    try {
      const database = getDb()
      const stmt = database.prepare('INSERT OR REPLACE INTO log_files (id, data) VALUES (?, ?)')
      stmt.run(id, JSON.stringify(data))
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  })

  // 保存済みの全ログファイルデータを読み込む
  ipcMain.handle('db:load-all-log-files', () => {
    try {
      const database = getDb()
      const rows = database.prepare('SELECT data FROM log_files').all() as { data: string }[]
      const results: unknown[] = []

      for (const row of rows) {
        try {
          results.push(JSON.parse(row.data))
        } catch {
          // 破損レコードはスキップ
        }
      }

      return results
    } catch {
      return []
    }
  })

  // 指定 ID のログファイルデータを削除
  ipcMain.handle('db:remove-log-file', (_, id: string) => {
    try {
      const database = getDb()
      database.prepare('DELETE FROM log_files WHERE id = ?').run(id)
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  })
}
