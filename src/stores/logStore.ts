import { createStore } from 'solid-js/store'
import { createMemo } from 'solid-js'
import type { LogFile, LogEntry, LogFilter, ApacheStats, PhpStats, ApacheLogEntry, PhpErrorEntry, LogPair } from '@/types/log'
import { DEFAULT_FILTER } from '@/types/log'
import { parseApacheLog, detectApacheLog, parseApacheLine } from '@/parsers/apache'
import { parsePhpLog, detectPhpLog, parsePhpLine } from '@/parsers/php'
import { settings } from '@/stores/settingsStore'
import dayjs from 'dayjs'

interface LogState {
  files: LogFile[]
  activeFileId: string | null
  pairs: LogPair[]
  activePairId: string | null
  filter: LogFilter
  loading: boolean
  error: string | null
}

const [state, setState] = createStore<LogState>({
  files: [],
  activeFileId: null,
  pairs: [],
  activePairId: null,
  filter: { ...DEFAULT_FILTER },
  loading: false,
  error: null
})

// ===== ファイル管理 =====

function detectLogType(content: string): LogFile['logType'] {
  if (detectApacheLog(content)) return 'apache'
  if (detectPhpLog(content)) return 'php'
  return 'unknown'
}

function makeFileId(filePath: string): string {
  return btoa(encodeURIComponent(filePath))
}

export async function addLogFile(filePath: string): Promise<void> {
  const id = makeFileId(filePath)
  if (state.files.find((f) => f.id === id)) return

  setState('loading', true)
  setState('error', null)

  try {
    const result = await window.electronAPI.readFile(filePath)
    if (!result.success || !result.content) throw new Error(result.error ?? 'Read failed')

    const logType = detectLogType(result.content)
    let entries: LogEntry[] = []

    if (logType === 'apache') {
      entries = parseApacheLog(result.content)
    } else if (logType === 'php') {
      entries = parsePhpLog(result.content)
    }

    const stats = await window.electronAPI.getFileStats(filePath)
    const name = filePath.split(/[/\\]/).pop() ?? filePath

    setState('files', (files) => [
      ...files,
      {
        id,
        path: filePath,
        name,
        logType,
        size: stats?.size ?? 0,
        lastModified: stats?.mtime ?? Date.now(),
        watching: false,
        entries,
        loadedAt: Date.now()
      }
    ])

    if (!state.activeFileId) setState('activeFileId', id)
  } catch (err) {
    setState('error', err instanceof Error ? err.message : String(err))
  } finally {
    setState('loading', false)
  }
}

export function removeLogFile(id: string): void {
  const file = state.files.find((f) => f.id === id)
  if (file?.watching) {
    window.electronAPI.stopWatcher(file.path)
  }
  setState('files', (files) => files.filter((f) => f.id !== id))
  if (state.activeFileId === id) {
    setState('activeFileId', state.files[0]?.id ?? null)
  }
}

export function setActiveFile(id: string): void {
  setState('activeFileId', id)
}

// ===== リアルタイム監視 =====

export async function toggleWatcher(id: string): Promise<void> {
  const file = state.files.find((f) => f.id === id)
  if (!file) return

  if (file.watching) {
    await window.electronAPI.stopWatcher(file.path)
    setState('files', (f) => f.id === id, 'watching', false)
  } else {
    await window.electronAPI.startWatcher(file.path)
    setState('files', (f) => f.id === id, 'watching', true)
  }
}

// Preload 側のイベントを購読（アプリ起動時に一度だけ呼ぶ）
export function initWatcherListener(): () => void {
  return window.electronAPI.onFileChange(({ filePath, newLines }: { filePath: string; newLines: string[] }) => {
    const id = makeFileId(filePath)
    const file = state.files.find((f) => f.id === id)
    if (!file) return

    const newEntries: LogEntry[] = newLines.flatMap((line: string): LogEntry[] => {
      if (file.logType === 'apache') {
        const e = parseApacheLine(line)
        return e ? [e] : []
      } else if (file.logType === 'php') {
        const e = parsePhpLine(line)
        return e ? [e] : []
      }
      return []
    })

    if (newEntries.length > 0) {
      setState('files', (f) => f.id === id, 'entries', (entries) => [...entries, ...newEntries])
    }
  })
}

// ===== フィルタ =====

export function setFilter(patch: Partial<LogFilter>): void {
  setState('filter', (f) => ({ ...f, ...patch }))
}

export function resetFilter(): void {
  setState('filter', { ...DEFAULT_FILTER })
}

// ===== セレクター =====

export const activeFile = createMemo(() =>
  state.files.find((f) => f.id === state.activeFileId) ?? null
)

export const filteredEntries = createMemo((): LogEntry[] => {
  const file = activeFile()
  if (!file) return []

  const { keyword, statusCodes, levels, dateFrom, dateTo, method } = state.filter

  return file.entries.filter((entry) => {
    // キーワードフィルタ
    if (keyword) {
      const kw = keyword.toLowerCase()
      if (entry.type === 'apache') {
        if (
          !entry.ip.includes(kw) &&
          !entry.path.toLowerCase().includes(kw) &&
          !entry.userAgent.toLowerCase().includes(kw)
        )
          return false
      } else {
        if (
          !entry.message.toLowerCase().includes(kw) &&
          !entry.file.toLowerCase().includes(kw)
        )
          return false
      }
    }

    // 日付フィルタ: dateFrom/dateTo が空文字のときはこのブロックをスキップし全件対象
    if (dateFrom || dateTo) {
      const ts = entry.timestamp.getTime()
      if (dateFrom && !isNaN(ts) && ts < new Date(dateFrom).getTime()) return false
      if (dateTo && !isNaN(ts) && ts > new Date(dateTo).getTime()) return false
    }

    if (entry.type === 'apache') {
      if (statusCodes.length > 0) {
        const s = String(entry.status)
        const matched = statusCodes.some((code) => {
          if (code.endsWith('xx')) return s[0] === code[0]
          return s === code
        })
        if (!matched) return false
      }
      if (method && entry.method !== method) return false
    }

    if (entry.type === 'php' && levels.length > 0) {
      if (!levels.includes(entry.level)) return false
    }

    return true
  })
})

/**
 * 表示用エントリ。maxEntriesDisplay が 0 の場合は全件、
 * それ以外は末尾（最新）N 件に絞る。
 * 統計計算は filteredEntries（全件）を使うため影響なし。
 */
export const displayEntries = createMemo((): LogEntry[] => {
  const entries = filteredEntries()
  const limit = settings.maxEntriesDisplay
  if (limit <= 0 || entries.length <= limit) return entries
  // 末尾（最新ログ）を優先して表示
  return entries.slice(entries.length - limit)
})

/** 上限カット中かどうか、およびカットされた件数 */
export const displayCap = createMemo(() => {
  const total = filteredEntries().length
  const limit = settings.maxEntriesDisplay
  if (limit <= 0 || total <= limit) return { capped: false, total, limit, hidden: 0 }
  return { capped: true, total, limit, hidden: total - limit }
})

// ===== 統計 =====

export const apacheStats = createMemo((): ApacheStats | null => {
  const file = activeFile()
  if (!file || file.logType !== 'apache') return null

  const entries = file.entries.filter((e): e is ApacheLogEntry => e.type === 'apache')

  const statusCounts: Record<string, number> = {}
  const ipCounts: Record<string, number> = {}
  const pathCounts: Record<string, number> = {}
  const methodCounts: Record<string, number> = {}
  const hourCounts: Record<string, number> = {}
  let totalBytes = 0

  for (const e of entries) {
    const s = String(e.status)
    statusCounts[s] = (statusCounts[s] ?? 0) + 1
    ipCounts[e.ip] = (ipCounts[e.ip] ?? 0) + 1
    pathCounts[e.path] = (pathCounts[e.path] ?? 0) + 1
    methodCounts[e.method] = (methodCounts[e.method] ?? 0) + 1
    totalBytes += e.bytes

    if (!isNaN(e.timestamp.getTime())) {
      const hour = dayjs(e.timestamp).format('YYYY-MM-DD HH:00')
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1
    }
  }

  const topN = <T extends string>(map: Record<T, number>, n = 10): [string, number][] =>
    (Object.entries(map) as [string, number][])
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, n)

  const sortedHours = Object.entries(hourCounts).sort(([a], [b]) => a.localeCompare(b))

  return {
    totalRequests: entries.length,
    statusCounts,
    topIPs: topN(ipCounts).map(([ip, count]) => ({ ip, count })),
    topPaths: topN(pathCounts).map(([path, count]) => ({ path, count })),
    methodCounts,
    requestsPerHour: sortedHours.map(([hour, count]) => ({ hour, count })),
    totalBytes
  }
})

export const phpStats = createMemo((): PhpStats | null => {
  const file = activeFile()
  if (!file || file.logType !== 'php') return null

  const entries = file.entries.filter((e): e is PhpErrorEntry => e.type === 'php')

  const levelCounts: Record<string, number> = {}
  const fileCounts: Record<string, number> = {}
  const hourCounts: Record<string, number> = {}

  for (const e of entries) {
    levelCounts[e.level] = (levelCounts[e.level] ?? 0) + 1
    fileCounts[e.file] = (fileCounts[e.file] ?? 0) + 1

    if (!isNaN(e.timestamp.getTime())) {
      const hour = dayjs(e.timestamp).format('YYYY-MM-DD HH:00')
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1
    }
  }

  const topN = (map: Record<string, number>, n = 10): [string, number][] =>
    (Object.entries(map) as [string, number][])
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, n)

  const sortedHours = Object.entries(hourCounts).sort(([a], [b]) => a.localeCompare(b))

  return {
    totalErrors: entries.length,
    levelCounts,
    topFiles: topN(fileCounts).map(([file, count]) => ({ file, count })),
    errorsPerHour: sortedHours.map(([hour, count]) => ({ hour, count })),
    recentErrors: entries.slice(-20).reverse()
  }
})

// ===== ペア管理 =====

let pairCounter = 0

export function addPair(apacheFileId: string, phpFileId: string): void {
  pairCounter += 1
  const apacheFile = state.files.find((f) => f.id === apacheFileId)
  const phpFile = state.files.find((f) => f.id === phpFileId)
  const name = `${apacheFile?.name ?? 'apache'} + ${phpFile?.name ?? 'php'}`
  const id = `pair-${pairCounter}`
  setState('pairs', (pairs) => [...pairs, { id, name, apacheFileId, phpFileId }])
  if (!state.activePairId) setState('activePairId', id)
}

export function removePair(id: string): void {
  setState('pairs', (pairs) => pairs.filter((p) => p.id !== id))
  if (state.activePairId === id) {
    setState('activePairId', state.pairs[0]?.id ?? null)
  }
}

export function setActivePair(id: string): void {
  setState('activePairId', id)
}

// ===== 相関セレクター =====

export const activePair = createMemo(() =>
  state.pairs.find((p) => p.id === state.activePairId) ?? null
)

/** activePair に対応する Apache と PHP のエントリを取得 */
export const correlatedFiles = createMemo(() => {
  const pair = activePair()
  if (!pair) return null
  const apacheFile = state.files.find((f) => f.id === pair.apacheFileId)
  const phpFile = state.files.find((f) => f.id === pair.phpFileId)
  if (!apacheFile || !phpFile) return null
  return {
    apacheEntries: apacheFile.entries.filter((e): e is ApacheLogEntry => e.type === 'apache'),
    phpEntries: phpFile.entries.filter((e): e is PhpErrorEntry => e.type === 'php')
  }
})

/**
 * PHPエラーに対して、前後 windowSec 秒のApacheログを返す。
 * 時刻の近い順に並べる（IPハイライトはUIコンポーネント側で行う）。
 */
export function findRelatedApacheEntries(
  phpEntry: PhpErrorEntry,
  windowSec: number
): ApacheLogEntry[] {
  const files = correlatedFiles()
  if (!files) return []

  const ts = phpEntry.timestamp.getTime()
  const windowMs = windowSec * 1000

  return files.apacheEntries
    .filter((a) => Math.abs(a.timestamp.getTime() - ts) <= windowMs)
    .sort((a, b) => Math.abs(a.timestamp.getTime() - ts) - Math.abs(b.timestamp.getTime() - ts))
}

export { state as logState }
