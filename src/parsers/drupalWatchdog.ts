import type { DrupalWatchdogEntry, DrupalWatchdogSeverity } from '@/types/log'

// Acquia Cloud drupal-watchdog ログ形式（パイプ区切り）:
// date|sitename|ip|request_uri|referer|uid|link|message|severity|type|request_id
// 例: Mon, 24 Oct 2016 15:27:15 +0000|mysite|123.45.67.89|https://www.example.com/node/1|https://www.example.com/|0||page not found|warning|page_not_found|v-1234abcd-5678efgh

const KNOWN_SEVERITIES: DrupalWatchdogSeverity[] = [
  'emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'
]

// RFC 2822 形式のタイムスタンプをパース
// 例: Mon, 24 Oct 2016 15:27:15 +0000
function parseDrupalDate(dateStr: string): Date {
  const d = new Date(dateStr.trim())
  if (!isNaN(d.getTime())) return d
  return new Date(NaN)
}

function normalizeSeverity(raw: string): DrupalWatchdogSeverity {
  const trimmed = raw.trim().toLowerCase()
  return KNOWN_SEVERITIES.find((s) => s === trimmed) ?? 'unknown'
}

// パイプ区切りで先頭が RFC 2822 日付形式か判定する正規表現
// 曜日,日 月 年 時:分:秒 タイムゾーン の形式を確認
const DRUPAL_DETECT_REGEX = /^\w{3},\s+\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4}\|/

export function parseDrupalWatchdogLine(raw: string): DrupalWatchdogEntry | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // パイプ区切りで分割（最低10フィールド必要）
  const parts = trimmed.split('|')
  if (parts.length < 10) return null

  const [dateStr, siteName, ip, requestUri, referer, uidStr, link, message, severityRaw, watchdogType] = parts
  const requestId = parts.length > 10 ? parts[10] : ''

  // 日付のバリデーション
  const timestamp = parseDrupalDate(dateStr)
  if (isNaN(timestamp.getTime())) return null

  return {
    type: 'drupal-watchdog',
    raw,
    timestamp,
    siteName: siteName?.trim() ?? '',
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

export function parseDrupalWatchdogLog(content: string): DrupalWatchdogEntry[] {
  return content
    .split('\n')
    .map((line) => parseDrupalWatchdogLine(line))
    .filter((e): e is DrupalWatchdogEntry => e !== null)
}

export function detectDrupalWatchdogLog(sample: string): boolean {
  // 先頭数行を確認してパイプ区切りの drupal-watchdog 形式かどうかを判定
  return sample.split('\n').slice(0, 5).some((line) => DRUPAL_DETECT_REGEX.test(line.trim()))
}
