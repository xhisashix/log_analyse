import { settings } from '@/stores/settingsStore'

// JST オフセット（ミリ秒）: UTC+9
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

// 数値を 2 桁ゼロ埋めする
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// タイムゾーン設定に応じて UTC 基準で日時成分を取得するための Date を返す
function toTzDate(date: Date): Date {
  if (settings.timezone === 'JST') {
    return new Date(date.getTime() + JST_OFFSET_MS)
  }
  return date
}

/**
 * タイムスタンプをタイムゾーン設定に応じてフォーマットする。
 * format 引数には 'MM/DD HH:mm:ss' や 'YYYY/MM/DD HH:mm:ss' のような
 * dayjs 互換トークン文字列を渡す。
 * 正規表現による一括置換でトークンの二重置換を防ぐ。
 */
export function formatTimestamp(date: Date, format: string): string {
  const d = toTzDate(date)
  const tokens: Record<string, string> = {
    YYYY: String(d.getUTCFullYear()),
    MM: pad(d.getUTCMonth() + 1),
    DD: pad(d.getUTCDate()),
    HH: pad(d.getUTCHours()),
    mm: pad(d.getUTCMinutes()),
    ss: pad(d.getUTCSeconds())
  }
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => tokens[token] ?? token)
}
