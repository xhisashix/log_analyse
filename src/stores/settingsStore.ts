import { createStore } from 'solid-js/store'

interface Settings {
  theme: 'light' | 'dark' | 'system'
  /** 表示件数の上限。0 = 無制限（メモリ注意） */
  maxEntriesDisplay: number
  autoScroll: boolean
  dateFormat: string
  /** タイムスタンプ表示のタイムゾーン: UTC または JST（Asia/Tokyo、UTC+9） */
  timezone: 'UTC' | 'JST'
}

const [settings, setSettings] = createStore<Settings>({
  theme: 'system',
  maxEntriesDisplay: 50000,
  autoScroll: true,
  dateFormat: 'YYYY-MM-DD HH:mm:ss',
  timezone: 'UTC'
})

export function updateSettings(patch: Partial<Settings>): void {
  setSettings((s) => ({ ...s, ...patch }))
}

export { settings }
