// ===== Apache アクセスログ =====
export interface ApacheLogEntry {
  type: 'apache'
  raw: string
  ip: string
  ident: string
  user: string
  timestamp: Date
  method: string
  path: string
  protocol: string
  status: number
  bytes: number
  referer: string
  userAgent: string
}

// ===== PHP エラーログ =====
export type PhpErrorLevel =
  | 'Parse error'
  | 'Fatal error'
  | 'Warning'
  | 'Notice'
  | 'Deprecated'
  | 'Strict Standards'
  | 'Unknown'

export interface PhpErrorEntry {
  type: 'php'
  raw: string
  timestamp: Date
  level: PhpErrorLevel
  message: string
  file: string
  line: number
}

export type LogEntry = ApacheLogEntry | PhpErrorEntry

// ===== ファイル管理 =====
export interface LogFile {
  id: string            // ユニーク ID (ファイルパスベース)
  path: string
  name: string
  logType: 'apache' | 'php' | 'unknown'
  size: number
  lastModified: number
  watching: boolean
  entries: LogEntry[]
  loadedAt: number
}

// ===== 統計 =====
export interface ApacheStats {
  totalRequests: number
  statusCounts: Record<string, number>
  topIPs: Array<{ ip: string; count: number }>
  topPaths: Array<{ path: string; count: number }>
  methodCounts: Record<string, number>
  requestsPerHour: Array<{ hour: string; count: number }>
  totalBytes: number
}

export interface PhpStats {
  totalErrors: number
  levelCounts: Record<string, number>
  topFiles: Array<{ file: string; count: number }>
  errorsPerHour: Array<{ hour: string; count: number }>
  recentErrors: PhpErrorEntry[]
}

// ===== ファイルペア =====
export interface LogPair {
  id: string
  name: string           // 表示名（例: "production-2024-03"）
  apacheFileId: string
  phpFileId: string
}

// ===== フィルタ =====
export interface LogFilter {
  keyword: string
  statusCodes: string[]    // Apache: "200", "4xx", "5xx" など
  levels: PhpErrorLevel[]  // PHP: エラーレベル
  dateFrom: string         // ISO 形式
  dateTo: string
  method: string           // Apache: GET/POST など
}

export const DEFAULT_FILTER: LogFilter = {
  keyword: '',
  statusCodes: [],
  levels: [],
  dateFrom: '',
  dateTo: '',
  method: ''
}
