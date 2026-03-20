import type { ApacheLogEntry } from '@/types/log'

// Combined Log Format:
// %h %l %u %t "%r" %>s %b "%{Referer}i" "%{User-Agent}i"
// 例: 127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/" "Mozilla/5.0..."
const APACHE_REGEX =
  /^(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([A-Z]+)\s+(\S+)\s+(\S+)"\s+(\d{3})\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/

const APACHE_MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
}

function parseApacheDate(dateStr: string): Date {
  // 例: 10/Oct/2000:13:55:36 -0700
  const m = dateStr.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})/)
  if (!m) return new Date(NaN)
  const [, day, mon, year, hh, mm, ss, tz] = m
  const tzSign = tz[0] === '+' ? 1 : -1
  const tzH = parseInt(tz.slice(1, 3), 10)
  const tzM = parseInt(tz.slice(3), 10)
  const utcMs =
    Date.UTC(
      parseInt(year, 10),
      APACHE_MONTHS[mon] ?? 0,
      parseInt(day, 10),
      parseInt(hh, 10),
      parseInt(mm, 10),
      parseInt(ss, 10)
    ) -
    tzSign * (tzH * 60 + tzM) * 60 * 1000
  return new Date(utcMs)
}

export function parseApacheLine(raw: string): ApacheLogEntry | null {
  const m = APACHE_REGEX.exec(raw.trim())
  if (!m) return null

  const [, ip, ident, user, dateStr, method, path, protocol, statusStr, bytesStr, referer, userAgent] = m

  return {
    type: 'apache',
    raw,
    ip,
    ident,
    user,
    timestamp: parseApacheDate(dateStr),
    method,
    path,
    protocol,
    status: parseInt(statusStr, 10),
    bytes: bytesStr === '-' ? 0 : parseInt(bytesStr, 10),
    referer,
    userAgent
  }
}

export function parseApacheLog(content: string): ApacheLogEntry[] {
  return content
    .split('\n')
    .map((line) => parseApacheLine(line))
    .filter((e): e is ApacheLogEntry => e !== null)
}

export function detectApacheLog(sample: string): boolean {
  return APACHE_REGEX.test(sample.split('\n')[0]?.trim() ?? '')
}
