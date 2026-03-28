import {
  Component, For, Show, createSignal
} from 'solid-js'
import { createVirtualizer } from '@tanstack/solid-virtual'
import {
  displayEntries,
  displayCap,
  filteredEntries,
  setFilter,
  resetFilter,
  activeFile,
  logState
} from '@/stores/logStore'
import { settings, updateSettings } from '@/stores/settingsStore'
import type { ApacheLogEntry, PhpErrorEntry, PhpErrorLevel, DrupalWatchdogEntry, DrupalWatchdogSeverity, LogEntry } from '@/types/log'
import { formatTimestamp } from '@/utils/formatTime'
import dayjs from 'dayjs'

/** ISO 文字列 → datetime-local input 用のローカル時刻文字列 (YYYY-MM-DDTHH:mm) */
function isoToLocal(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ===== フィルタバー =====
const FilterBar: Component = () => {
  function handleReset() {
    resetFilter()
  }

  return (
    <div class="flex flex-wrap items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
      {/* キーワード検索（ストアと同期） */}
      <input
        type="text"
        placeholder="キーワード検索..."
        value={logState.filter.keyword}
        onInput={(e) => setFilter({ keyword: e.currentTarget.value })}
        class="bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500 w-48"
      />

      <Show when={activeFile()?.logType === 'apache'}>
        {/* HTTP メソッドフィルタ */}
        <select
          value={logState.filter.method}
          onChange={(e) => setFilter({ method: e.currentTarget.value })}
          class="bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
        >
          <option value="">メソッド: 全て</option>
          {['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => (
            <option value={m}>{m}</option>
          ))}
        </select>

        {/* ステータスコードフィルタ */}
        <select
          value={logState.filter.statusCodes[0] ?? ''}
          onChange={(e) => setFilter({ statusCodes: e.currentTarget.value ? [e.currentTarget.value] : [] })}
          class="bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
        >
          <option value="">ステータス: 全て</option>
          {['2xx', '3xx', '4xx', '5xx', '200', '301', '302', '404', '500'].map((s) => (
            <option value={s}>{s}</option>
          ))}
        </select>
      </Show>

      <Show when={activeFile()?.logType === 'php'}>
        {/* PHP エラーレベルフィルタ */}
        <select
          value={logState.filter.levels[0] ?? ''}
          onChange={(e) => setFilter({ levels: e.currentTarget.value ? [e.currentTarget.value as PhpErrorLevel] : [] })}
          class="bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
        >
          <option value="">レベル: 全て</option>
          {['Fatal error', 'Parse error', 'Warning', 'Notice', 'Deprecated'].map((l) => (
            <option value={l}>{l}</option>
          ))}
        </select>
      </Show>

      <Show when={activeFile()?.logType === 'drupal-watchdog'}>
        {/* Drupal Watchdog 重要度フィルタ */}
        <select
          value={logState.filter.drupalSeverities[0] ?? ''}
          onChange={(e) => setFilter({ drupalSeverities: e.currentTarget.value ? [e.currentTarget.value as DrupalWatchdogSeverity] : [] })}
          class="bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
        >
          <option value="">重要度: 全て</option>
          {['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug'].map((s) => (
            <option value={s}>{s}</option>
          ))}
        </select>

        {/* Drupal Watchdog ログタイプフィルタ */}
        <input
          type="text"
          placeholder="タイプで絞り込み..."
          value={logState.filter.drupalType}
          onInput={(e) => setFilter({ drupalType: e.currentTarget.value })}
          class="bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500 w-36"
        />
      </Show>

      {/* 日付範囲フィルタ
          value が空文字 = フィルタなし = 全期間表示。
          ストア値を value に直接バインドし、リセット時も確実にクリアされる。 */}
      <div class="flex items-center gap-1">
        <input
          type="datetime-local"
          value={isoToLocal(logState.filter.dateFrom)}
          onChange={(e) =>
            setFilter({ dateFrom: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : '' })
          }
          class="bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          title="開始日時（空欄 = 全期間）"
        />
        <span class="text-gray-500 text-xs">〜</span>
        <input
          type="datetime-local"
          value={isoToLocal(logState.filter.dateTo)}
          onChange={(e) =>
            setFilter({ dateTo: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : '' })
          }
          class="bg-gray-700 text-gray-100 text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          title="終了日時（空欄 = 全期間）"
        />
      </div>

      <button
        onClick={handleReset}
        class="text-xs text-gray-400 hover:text-gray-200 transition-colors ml-auto"
      >
        リセット
      </button>
    </div>
  )
}

// ===== 行コンポーネント =====
function statusColor(status: number): string {
  if (status < 300) return 'text-green-400'
  if (status < 400) return 'text-yellow-400'
  if (status < 500) return 'text-orange-400'
  return 'text-red-400'
}

function phpLevelColor(level: string): string {
  if (level === 'Fatal error' || level === 'Parse error') return 'text-red-400'
  if (level === 'Warning') return 'text-yellow-400'
  if (level === 'Notice' || level === 'Deprecated') return 'text-blue-400'
  return 'text-gray-400'
}

const ApacheRow: Component<{ entry: ApacheLogEntry }> = (props) => (
  <div class="flex items-baseline gap-2 px-3 py-0.5 hover:bg-gray-800 font-mono text-xs border-b border-gray-800">
    <span class="text-gray-500 w-36 shrink-0">
      {formatTimestamp(props.entry.timestamp, 'MM/DD HH:mm:ss')}
    </span>
    <span class="text-cyan-400 w-28 shrink-0">{props.entry.ip}</span>
    <span class={`w-10 shrink-0 ${statusColor(props.entry.status)}`}>{props.entry.status}</span>
    <span class="text-yellow-300 w-10 shrink-0">{props.entry.method}</span>
    <span class="text-gray-200 flex-1 truncate" title={props.entry.path}>{props.entry.path}</span>
    <span class="text-gray-500 w-16 text-right shrink-0">
      {props.entry.bytes > 0 ? `${(props.entry.bytes / 1024).toFixed(1)}K` : '-'}
    </span>
  </div>
)

const PhpRow: Component<{ entry: PhpErrorEntry }> = (props) => (
  <div class="flex items-start gap-2 px-3 py-1 hover:bg-gray-800 font-mono text-xs border-b border-gray-800">
    <span class="text-gray-500 w-36 shrink-0">
      {formatTimestamp(props.entry.timestamp, 'MM/DD HH:mm:ss')}
    </span>
    <span class={`w-24 shrink-0 font-semibold ${phpLevelColor(props.entry.level)}`}>
      {props.entry.level}
    </span>
    <div class="flex-1 min-w-0">
      <div class="text-gray-200 truncate" title={props.entry.message}>{props.entry.message}</div>
      <div class="text-gray-500 text-[10px] truncate">
        {props.entry.file}:{props.entry.line}
      </div>
    </div>
  </div>
)

function drupalSeverityColor(severity: string): string {
  if (severity === 'emergency' || severity === 'alert') return 'text-red-500'
  if (severity === 'critical' || severity === 'error') return 'text-red-400'
  if (severity === 'warning') return 'text-yellow-400'
  if (severity === 'notice') return 'text-blue-400'
  if (severity === 'info') return 'text-green-400'
  if (severity === 'debug') return 'text-gray-400'
  return 'text-gray-400'
}

const DrupalWatchdogRow: Component<{ entry: DrupalWatchdogEntry }> = (props) => (
  <div class="flex items-start gap-2 px-3 py-1 hover:bg-gray-800 font-mono text-xs border-b border-gray-800">
    <span class="text-gray-500 w-36 shrink-0">
      {dayjs(props.entry.timestamp).format('MM/DD HH:mm:ss')}
    </span>
    <span class={`w-20 shrink-0 font-semibold ${drupalSeverityColor(props.entry.severity)}`}>
      {props.entry.severity}
    </span>
    <span class="text-purple-300 w-28 shrink-0 truncate" title={props.entry.watchdogType}>
      {props.entry.watchdogType}
    </span>
    <div class="flex-1 min-w-0">
      <div class="text-gray-200 truncate" title={props.entry.message}>{props.entry.message}</div>
      <div class="text-gray-500 text-[10px] truncate">
        {props.entry.ip ? `${props.entry.ip} ` : ''}{props.entry.requestUri}
      </div>
    </div>
  </div>
)

// ===== メインビュー（仮想スクロール）=====
const LogViewer: Component = () => {
  /*
   * スクロールコンテナは Show の外側に常に DOM へ存在させる。
   * createVirtualizer の onMount 時に scrollRef が確定している必要があるため、
   * Show で囲んで後から DOM に追加すると observeElementRect が設定されず
   * virtualizer が機能しない（何も表示されない）。
   */
  let scrollRef!: HTMLDivElement
  const entries = displayEntries
  const cap = displayCap
  const allFiltered = filteredEntries

  const virtualizer = createVirtualizer({
    get count() { return entries().length },
    getScrollElement: () => scrollRef,
    estimateSize: () => 28,
    overscan: 20
  })

  return (
    <div class="flex flex-col h-full bg-gray-900 text-gray-100">
      <FilterBar />

      {/* ヘッダー */}
      <Show when={activeFile()?.logType === 'apache'}>
        <div class="flex gap-2 px-3 py-1 bg-gray-850 border-b border-gray-700 text-[10px] text-gray-500 font-mono uppercase tracking-wide">
          <span class="w-36">Time</span>
          <span class="w-28">IP</span>
          <span class="w-10">Status</span>
          <span class="w-10">Method</span>
          <span class="flex-1">Path</span>
          <span class="w-16 text-right">Bytes</span>
        </div>
      </Show>

      <Show when={activeFile()?.logType === 'php'}>
        <div class="flex gap-2 px-3 py-1 border-b border-gray-700 text-[10px] text-gray-500 font-mono uppercase tracking-wide">
          <span class="w-36">Time</span>
          <span class="w-24">Level</span>
          <span class="flex-1">Message / File</span>
        </div>
      </Show>

      <Show when={activeFile()?.logType === 'drupal-watchdog'}>
        <div class="flex gap-2 px-3 py-1 border-b border-gray-700 text-[10px] text-gray-500 font-mono uppercase tracking-wide">
          <span class="w-36">Time</span>
          <span class="w-20">Severity</span>
          <span class="w-28">Type</span>
          <span class="flex-1">Message / URI</span>
        </div>
      </Show>

      {/* 件数バー */}
      <Show when={activeFile()}>
        <div class="px-3 py-0.5 text-[10px] text-gray-500 bg-gray-850 border-b border-gray-700 flex items-center gap-2">
          <span>
            {entries().length.toLocaleString()} 件
            <Show when={allFiltered().length !== activeFile()?.entries.length}>
              {' '}/ {activeFile()?.entries.length.toLocaleString()} 件中
            </Show>
          </span>
        </div>
      </Show>

      {/* 上限超過警告バナー */}
      <Show when={cap().capped}>
        <div class="flex items-center justify-between px-3 py-1.5 bg-amber-900/60 border-b border-amber-700 text-[11px] text-amber-200">
          <span>
            ⚠ 表示件数が上限（{cap().limit.toLocaleString()} 件）を超えています。
            古いログ {cap().hidden.toLocaleString()} 件を非表示中。最新 {cap().limit.toLocaleString()} 件を表示しています。
          </span>
          <div class="flex items-center gap-3 shrink-0 ml-3">
            <span class="text-amber-400">上限:</span>
            <input
              type="number"
              value={settings.maxEntriesDisplay}
              min={1000}
              step={10000}
              onBlur={(e) => {
                const v = parseInt(e.currentTarget.value, 10)
                if (!isNaN(v) && v > 0) updateSettings({ maxEntriesDisplay: v })
              }}
              class="w-24 bg-amber-950 border border-amber-700 rounded px-1.5 py-0.5 text-amber-100 text-[11px] focus:outline-none"
            />
            <button
              onClick={() => updateSettings({ maxEntriesDisplay: 0 })}
              class="text-amber-300 hover:text-white underline text-[11px]"
              title="メモリ使用量が増大する可能性があります"
            >
              全件表示
            </button>
            <Show when={settings.maxEntriesDisplay === 0}>
              <button
                onClick={() => updateSettings({ maxEntriesDisplay: 50000 })}
                class="text-gray-300 hover:text-white underline text-[11px]"
              >
                上限に戻す
              </button>
            </Show>
          </div>
        </div>
      </Show>

      {/* スクロールコンテナ：Show の外側に常時 DOM へ配置 */}
      <div ref={scrollRef!} class="flex-1 overflow-auto">
        <Show
          when={activeFile()}
          fallback={
            <div class="flex h-full items-center justify-center text-gray-600 text-sm">
              左のファイルリストからログを選択してください
            </div>
          }
        >
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            <For each={virtualizer.getVirtualItems()}>
              {(virtualRow) => {
                const entry = (): LogEntry => entries()[virtualRow.index]
                return (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`
                    }}
                  >
                    <Show when={entry()?.type === 'apache'}>
                      <ApacheRow entry={entry() as ApacheLogEntry} />
                    </Show>
                    <Show when={entry()?.type === 'php'}>
                      <PhpRow entry={entry() as PhpErrorEntry} />
                    </Show>
                    <Show when={entry()?.type === 'drupal-watchdog'}>
                      <DrupalWatchdogRow entry={entry() as DrupalWatchdogEntry} />
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default LogViewer
