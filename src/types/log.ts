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

// ===== Drupal Watchdog ログ（Acquia Cloud 形式） =====
export type DrupalWatchdogSeverity =
  | 'emergency'
  | 'alert'
  | 'critical'
  | 'error'
  | 'warning'
  | 'notice'
  | 'info'
  | 'debug'
  | 'unknown'

export interface DrupalWatchdogEntry {
  type: 'drupal-watchdog'
  raw: string
  timestamp: Date
  siteName: string
  ip: string
  requestUri: string
  referer: string
  uid: number
  link: string
  message: string
  severity: DrupalWatchdogSeverity
  watchdogType: string
  requestId: string
}

export type LogEntry = ApacheLogEntry | PhpErrorEntry | DrupalWatchdogEntry

// ===== ファイル管理 =====
export interface LogFile {
  id: string            // ユニーク ID (ファイルパスベース)
  path: string
  name: string
  logType: 'apache' | 'php' | 'drupal-watchdog' | 'unknown'
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

export interface DrupalWatchdogStats {
  totalEntries: number
  severityCounts: Record<string, number>
  typeCounts: Record<string, number>
  topTypes: Array<{ watchdogType: string; count: number }>
  entriesPerHour: Array<{ hour: string; count: number }>
  recentEntries: DrupalWatchdogEntry[]
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
  drupalSeverities: DrupalWatchdogSeverity[]  // Drupal Watchdog: 重要度
  drupalType: string       // Drupal Watchdog: ログタイプ
  dateFrom: string         // ISO 形式
  dateTo: string
  method: string           // Apache: GET/POST など
}

export const DEFAULT_FILTER: LogFilter = {
  keyword: '',
  statusCodes: [],
  levels: [],
  drupalSeverities: [],
  drupalType: '',
  dateFrom: '',
  dateTo: '',
  method: ''
}
