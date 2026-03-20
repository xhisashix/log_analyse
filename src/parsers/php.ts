import type { PhpErrorEntry, PhpErrorLevel } from '@/types/log'

// PHP エラーログ形式:
// [DD-Mon-YYYY HH:MM:SS UTC] PHP Fatal error:  message in /path/file.php on line N
// [DD-Mon-YYYY HH:MM:SS UTC] PHP Warning:  message in /path/file.php on line N
const PHP_REGEX =
  /^\[(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}:\d{2}\s+\w+)\]\s+PHP\s+([\w\s]+?):\s+(.*?)\s+in\s+(.+)\s+on line\s+(\d+)/

// スタックトレース行 (例: PHP   1. {main}() /path/file.php:0)
const PHP_STACK_REGEX = /^\[.*?\]\s+PHP\s+(\d+)\./

const PHP_MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
}

function parsePhpDate(dateStr: string): Date {
  // 例: 20-Mar-2024 14:05:32 UTC
  const m = dateStr.match(/(\d{2})-(\w{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return new Date(NaN)
  const [, day, mon, year, hh, mm, ss] = m
  return new Date(
    Date.UTC(
      parseInt(year, 10),
      PHP_MONTHS[mon] ?? 0,
      parseInt(day, 10),
      parseInt(hh, 10),
      parseInt(mm, 10),
      parseInt(ss, 10)
    )
  )
}

const KNOWN_LEVELS: PhpErrorLevel[] = [
  'Parse error',
  'Fatal error',
  'Warning',
  'Notice',
  'Deprecated',
  'Strict Standards'
]

function normalizeLevel(raw: string): PhpErrorLevel {
  const trimmed = raw.trim()
  return (KNOWN_LEVELS.find((l) => trimmed.toLowerCase().startsWith(l.toLowerCase())) ??
    'Unknown') as PhpErrorLevel
}

export function parsePhpLine(raw: string): PhpErrorEntry | null {
  if (PHP_STACK_REGEX.test(raw)) return null // スタックトレース行はスキップ

  const m = PHP_REGEX.exec(raw.trim())
  if (!m) return null

  const [, dateStr, levelRaw, message, file, lineStr] = m

  return {
    type: 'php',
    raw,
    timestamp: parsePhpDate(dateStr),
    level: normalizeLevel(levelRaw),
    message: message.trim(),
    file: file.trim(),
    line: parseInt(lineStr, 10)
  }
}

export function parsePhpLog(content: string): PhpErrorEntry[] {
  return content
    .split('\n')
    .map((line) => parsePhpLine(line))
    .filter((e): e is PhpErrorEntry => e !== null)
}

export function detectPhpLog(sample: string): boolean {
  return sample.split('\n').some((line) => /\[.*?\]\s+PHP\s+\w/.test(line))
}
