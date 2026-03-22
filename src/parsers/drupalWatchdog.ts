import type { DrupalWatchdogEntry, DrupalWatchdogSeverity } from '@/types/log'

// ===== 対応フォーマット =====
//
// 【フォーマット1】Acquia Cloud syslog 形式（主流）:
// <syslog_prefix>: <site_url>|<unix_timestamp>|<type>|<ip>|<uri>|<referer>|<uid>|<link>|<message> request_id="<id>"
// 例: Aug 18 21:22:01 10.0.0.1 alphabeta: https://www.example.com|1503091321|custom_module|...
// ※ メッセージが長い場合、エントリが複数行に分割されることがある
//
// 【フォーマット2】RFC 2822 日付形式（旧フォーマット）:
// <date>|<sitename>|<ip>|<uri>|<referer>|<uid>|<link>|<message>|<severity>|<type>|<request_id>
// 例: Mon, 24 Oct 2016 15:27:15 +0000|mysite|123.45.67.89|https://www.example.com/node/1|...

const KNOWN_SEVERITIES: DrupalWatchdogSeverity[] = [
  'emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'
]

// syslog プレフィックスのパターン
// 例: "Aug 18 21:22:01 10.0.0.1 alphabeta: "
// キャプチャグループ 1: サイト名（alphabeta 等）
const SYSLOG_PREFIX_REGEX = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+(\S+):\s*/

// syslog 行の先頭かどうかを判定（エントリ境界の検出用）
// データ部分まで含めて確認することで誤検出を防ぐ
const SYSLOG_LINE_REGEX = /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+\S+:\s+\S/

// RFC 2822 形式の先頭判定パターン
// 例: "Mon, 24 Oct 2016 15:27:15 +0000|..."
const RFC2822_LINE_REGEX = /^\w{3},\s+\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4}\|/

// ===== ユーティリティ関数 =====

// RFC 2822 形式のタイムスタンプをパース
// 例: Mon, 24 Oct 2016 15:27:15 +0000
function parseRfc2822Date(dateStr: string): Date {
  const d = new Date(dateStr.trim())
  if (!isNaN(d.getTime())) return d
  return new Date(NaN)
}

// Unix タイムスタンプ（秒）をパース
function parseUnixTimestamp(unixStr: string): Date {
  const unix = parseInt(unixStr.trim(), 10)
  if (isNaN(unix)) return new Date(NaN)
  return new Date(unix * 1000)
}

function normalizeSeverity(raw: string): DrupalWatchdogSeverity {
  const trimmed = raw.trim().toLowerCase()
  return KNOWN_SEVERITIES.find((s) => s === trimmed) ?? 'unknown'
}

// ===== syslog フォーマットのパース =====
// フィールド順: domain|unix_timestamp|type|ip|uri|referer|uid|link|message
// message 末尾に request_id="..." が付くことがある
// syslog プレフィックスに含まれるサイト名（alphabeta 等）を siteName として使用
function parseSyslogEntry(raw: string): DrupalWatchdogEntry | null {
  // syslog プレフィックスからサイト名を抽出し、プレフィックスを除去する
  const prefixMatch = SYSLOG_PREFIX_REGEX.exec(raw)
  const siteName = prefixMatch?.[1] ?? ''
  const withoutPrefix = prefixMatch ? raw.slice(prefixMatch[0].length) : raw.replace(/^[^:]+:\s*/, '')
  if (!withoutPrefix.trim()) return null

  // 複数行を空白でつなぐ
  const normalized = withoutPrefix.replace(/\n/g, ' ')
  const parts = normalized.split('|')
  if (parts.length < 3) return null

  const [domain, timestampStr, watchdogType, ip, requestUri, referer, uidStr, link, ...messageParts] = parts

  const timestamp = parseUnixTimestamp(timestampStr)
  if (isNaN(timestamp.getTime())) return null

  // 残りのフィールドをすべてメッセージとして結合
  let message = messageParts.join('|').trim()

  // 末尾の request_id="..." を抽出
  let requestId = ''
  const requestIdMatch = message.match(/\s*request_id="([^"]*)"$/)
  if (requestIdMatch) {
    requestId = requestIdMatch[1]
    message = message.slice(0, requestIdMatch.index).trim()
  }

  return {
    type: 'drupal-watchdog',
    raw,
    timestamp,
    siteName,
    domain: domain?.trim() ?? '',
    ip: ip?.trim() ?? '',
    requestUri: requestUri?.trim() ?? '',
    referer: referer?.trim() ?? '',
    uid: parseInt(uidStr?.trim() ?? '0', 10) || 0,
    link: link?.trim() ?? '',
    message,
    severity: 'unknown' as DrupalWatchdogSeverity,
    watchdogType: watchdogType?.trim() ?? '',
    requestId
  }
}

// ===== RFC 2822 フォーマットのパース =====
// フィールド順: date|sitename|ip|uri|referer|uid|link|message|severity|type|request_id
function parseRfc2822Entry(raw: string): DrupalWatchdogEntry | null {
  const parts = raw.trim().split('|')
  if (parts.length < 10) return null

  const [dateStr, siteName, ip, requestUri, referer, uidStr, link, message, severityRaw, watchdogType] = parts
  const requestId = parts.length > 10 ? parts[10] : ''

  const timestamp = parseRfc2822Date(dateStr)
  if (isNaN(timestamp.getTime())) return null

  return {
    type: 'drupal-watchdog',
    raw,
    timestamp,
    siteName: siteName?.trim() ?? '',
    domain: '',
    ip: ip?.trim() ?? '',
    requestUri: requestUri?.trim() ?? '',
    referer: referer?.trim() ?? '',
    uid: parseInt(uidStr?.trim() ?? '0', 10) || 0,
    link: link?.trim() ?? '',
    message: message?.trim() ?? '',
    severity: normalizeSeverity(severityRaw ?? ''),
    watchdogType: watchdogType?.trim() ?? '',
    requestId: requestId?.trim() ?? ''
  }
}

export function parseDrupalWatchdogLine(raw: string): DrupalWatchdogEntry | null {
  if (!raw.trim()) return null

  if (SYSLOG_PREFIX_REGEX.test(raw)) {
    return parseSyslogEntry(raw)
  }
  return parseRfc2822Entry(raw)
}

export function parseDrupalWatchdogLog(content: string): DrupalWatchdogEntry[] {
  const lines = content.split('\n')
  const entries: string[] = []
  let current: string | null = null

  for (const line of lines) {
    if (!line.trim()) continue

    // syslog 形式または RFC 2822 形式の先頭行 → 新しいエントリの開始
    if (SYSLOG_LINE_REGEX.test(line) || RFC2822_LINE_REGEX.test(line.trim())) {
      if (current !== null) entries.push(current)
      current = line
    } else {
      // 継続行: 前のエントリに結合
      if (current !== null) {
        current += '\n' + line
      } else {
        // プレフィックスなしの単独行（旧フォーマット等）
        entries.push(line)
      }
    }
  }

  if (current !== null) entries.push(current)

  return entries
    .map((entry) => parseDrupalWatchdogLine(entry))
    .filter((e): e is DrupalWatchdogEntry => e !== null)
}

export function detectDrupalWatchdogLog(sample: string): boolean {
  // 先頭数行でいずれかのフォーマットに一致するか確認
  return sample.split('\n').slice(0, 5).some((line) => {
    const trimmed = line.trim()
    return SYSLOG_LINE_REGEX.test(trimmed) || RFC2822_LINE_REGEX.test(trimmed)
  })
}
