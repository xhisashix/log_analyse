import { Component, createMemo, createSignal, For, Show } from 'solid-js'
import { logState, addPair, removePair, setActivePair, activePair, correlatedFiles, findRelatedApacheEntries } from '@/stores/logStore'
import type { PhpErrorEntry, ApacheLogEntry } from '@/types/log'
import { formatTimestamp } from '@/utils/formatTime'

// ===== 時間窓の選択肢 =====
const WINDOW_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '±30秒', value: 30 },
  { label: '±1分', value: 60 },
  { label: '±5分', value: 300 },
  { label: '±15分', value: 900 }
]

// ===== PHPエラーレベルの色 =====
const LEVEL_COLORS: Record<string, string> = {
  'Fatal error':    'text-red-400 bg-red-950',
  'Parse error':    'text-red-400 bg-red-950',
  'Warning':        'text-yellow-400 bg-yellow-950',
  'Notice':         'text-blue-400 bg-blue-950',
  'Deprecated':     'text-gray-400 bg-gray-800',
  'Strict Standards': 'text-gray-400 bg-gray-800',
  'Unknown':        'text-gray-400 bg-gray-800'
}

// ===== HTTPステータスコードの色 =====
function statusColor(status: number): string {
  if (status >= 500) return 'text-red-400'
  if (status >= 400) return 'text-yellow-400'
  if (status >= 300) return 'text-blue-400'
  return 'text-green-400'
}

// ===== ペア作成パネル =====
const PairCreatePanel: Component = () => {
  const [selectedApacheId, setSelectedApacheId] = createSignal('')
  const [selectedPhpId, setSelectedPhpId] = createSignal('')

  const apacheFiles = createMemo(() => logState.files.filter((f) => f.logType === 'apache'))
  const phpFiles    = createMemo(() => logState.files.filter((f) => f.logType === 'php'))

  function handleCreate() {
    const aId = selectedApacheId()
    const pId = selectedPhpId()
    if (!aId || !pId) return
    addPair(aId, pId)
    setSelectedApacheId('')
    setSelectedPhpId('')
  }

  return (
    <div class="p-4 border-b border-gray-700 bg-gray-900">
      <p class="text-xs text-gray-400 mb-3">
        Apache + PHPファイルをペアに設定すると、PHPエラー発生時刻前後のApacheリクエストを相関確認できます。
      </p>
      <div class="flex flex-col gap-2">
        {/* Apacheファイル選択 */}
        <div class="flex items-center gap-2">
          <span class="text-[10px] bg-green-800 text-green-200 px-1.5 py-0.5 rounded shrink-0">Apache</span>
          <select
            value={selectedApacheId()}
            onChange={(e) => setSelectedApacheId(e.currentTarget.value)}
            class="flex-1 min-w-0 text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">Apacheファイルを選択...</option>
            <For each={apacheFiles()}>
              {(f) => <option value={f.id}>{f.name}</option>}
            </For>
          </select>
        </div>
        {/* PHPファイル選択 */}
        <div class="flex items-center gap-2">
          <span class="text-[10px] bg-purple-800 text-purple-200 px-1.5 py-0.5 rounded shrink-0">PHP</span>
          <select
            value={selectedPhpId()}
            onChange={(e) => setSelectedPhpId(e.currentTarget.value)}
            class="flex-1 min-w-0 text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">PHPファイルを選択...</option>
            <For each={phpFiles()}>
              {(f) => <option value={f.id}>{f.name}</option>}
            </For>
          </select>
        </div>
        <button
          onClick={handleCreate}
          disabled={!selectedApacheId() || !selectedPhpId()}
          class="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 px-3 py-1.5 rounded transition-colors text-white"
        >
          + ペアを作成
        </button>
      </div>
    </div>
  )
}

// ===== ペア選択サイドバー =====
const PairSidebar: Component = () => {
  const [sidebarWidth, setSidebarWidth] = createSignal(224)

  function handleResizeStart(e: MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(Math.max(160, Math.min(480, startW + (ev.clientX - startX))))
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
  <div
    class="bg-gray-900 border-r border-gray-700 flex flex-col h-full shrink-0 relative"
    style={{ width: `${sidebarWidth()}px` }}
  >
    <div class="p-3 border-b border-gray-700 flex items-center justify-between">
      <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">ペア一覧</span>
    </div>
    <PairCreatePanel />
    <div class="flex-1 overflow-y-auto">
      <Show
        when={logState.pairs.length > 0}
        fallback={
          <div class="p-4 text-xs text-gray-500 text-center mt-2">
            ペアがありません
          </div>
        }
      >
        <For each={logState.pairs}>
          {(pair) => (
            <div
              onClick={() => setActivePair(pair.id)}
              class={`group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-800 transition-colors ${
                logState.activePairId === pair.id ? 'bg-gray-800 border-l-2 border-blue-500' : ''
              }`}
            >
              <span class="flex-1 text-xs truncate" title={pair.name}>{pair.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); removePair(pair.id) }}
                class="text-[10px] text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                title="削除"
              >
                ✕
              </button>
            </div>
          )}
        </For>
      </Show>
    </div>

    {/* リサイズハンドル */}
    <div
      onMouseDown={handleResizeStart}
      class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors"
    />
  </div>
  )
}

// ===== PHP エラー行 =====
const PhpErrorRow: Component<{
  entry: PhpErrorEntry
  selected: boolean
  onClick: () => void
}> = (props) => {
  const colors = () => LEVEL_COLORS[props.entry.level] ?? 'text-gray-400 bg-gray-800'
  const [levelBg, levelText] = colors().split(' ')

  return (
    <div
      onClick={props.onClick}
      class={`px-3 py-2 cursor-pointer border-b border-gray-800 hover:bg-gray-800 transition-colors ${
        props.selected ? 'bg-gray-700 border-l-2 border-blue-400' : ''
      }`}
    >
      <div class="flex items-center gap-2 mb-1">
        <span class={`text-[10px] px-1.5 py-0.5 rounded ${levelBg} ${levelText}`}>
          {props.entry.level}
        </span>
        <span class="text-[10px] text-gray-500 tabular-nums">
          {formatTimestamp(props.entry.timestamp, 'MM/DD HH:mm:ss')}
        </span>
      </div>
      <div class="text-xs text-gray-200 truncate" title={props.entry.message}>
        {props.entry.message}
      </div>
      <div class="text-[10px] text-gray-500 truncate mt-0.5">
        {props.entry.file} : {props.entry.line}行
      </div>
    </div>
  )
}

// ===== Apache アクセス行 =====
const ApacheRow: Component<{
  entry: ApacheLogEntry
  highlightIps: Set<string>
  phpTimestamp: Date
}> = (props) => {
  const ipHighlighted = () => props.highlightIps.has(props.entry.ip)
  const diffSec = () => {
    const diff = (props.entry.timestamp.getTime() - props.phpTimestamp.getTime()) / 1000
    return diff >= 0 ? `+${diff.toFixed(0)}s` : `${diff.toFixed(0)}s`
  }

  return (
    <div class={`px-3 py-2 border-b border-gray-800 text-xs ${
      ipHighlighted() ? 'bg-blue-950 border-l-2 border-blue-400' : 'hover:bg-gray-800'
    }`}>
      <div class="flex items-center gap-2 flex-wrap">
        {/* IP */}
        <span
          class={`font-mono tabular-nums ${ipHighlighted() ? 'text-blue-300 font-bold' : 'text-gray-300'}`}
          title={ipHighlighted() ? '同一IP（注目）' : ''}
        >
          {props.entry.ip}
          {ipHighlighted() && <span class="ml-1 text-blue-400">★</span>}
        </span>
        {/* 時刻差 */}
        <span class="text-[10px] text-gray-500 tabular-nums">{diffSec()}</span>
        {/* メソッド */}
        <span class="text-[10px] text-gray-400">{props.entry.method}</span>
        {/* ステータス */}
        <span class={`text-[10px] font-mono ${statusColor(props.entry.status)}`}>
          {props.entry.status}
        </span>
      </div>
      {/* パス */}
      <div class="text-gray-300 truncate mt-0.5" title={props.entry.path}>
        {props.entry.path}
      </div>
      {/* 時刻 */}
      <div class="text-[10px] text-gray-500">
        {formatTimestamp(props.entry.timestamp, 'MM/DD HH:mm:ss')}
      </div>
    </div>
  )
}

// ===== メインの相関ビュー =====
const CorrelatedView: Component = () => {
  const [windowSec, setWindowSec] = createSignal(60)
  const [selectedPhpEntry, setSelectedPhpEntry] = createSignal<PhpErrorEntry | null>(null)
  const [phpKeyword, setPhpKeyword] = createSignal('')

  const files = correlatedFiles

  // フィルタされたPHPエントリ
  const filteredPhp = createMemo((): PhpErrorEntry[] => {
    const f = files()
    if (!f) return []
    const kw = phpKeyword().toLowerCase()
    return f.phpEntries.filter((e) => {
      if (!kw) return true
      return e.message.toLowerCase().includes(kw) || e.file.toLowerCase().includes(kw)
    })
  })

  // 選択中PHPエラーに対応するApacheエントリ
  const relatedApache = createMemo((): ApacheLogEntry[] => {
    const entry = selectedPhpEntry()
    if (!entry) return []
    return findRelatedApacheEntries(entry, windowSec())
  })

  // 時間窓内に出現するIPの出現頻度（複数回 = 注目IP）
  const highlightIps = createMemo((): Set<string> => {
    const entries = relatedApache()
    const counts: Record<string, number> = {}
    for (const e of entries) {
      counts[e.ip] = (counts[e.ip] ?? 0) + 1
    }
    // 2件以上のIPをハイライト対象とする
    return new Set(Object.entries(counts).filter(([, c]) => c >= 2).map(([ip]) => ip))
  })

  const pair = activePair

  return (
    <div class="flex h-full overflow-hidden">
      {/* ペア選択サイドバー */}
      <PairSidebar />

      {/* メインコンテンツ */}
      <div class="flex-1 flex flex-col min-w-0">
        <Show
          when={pair()}
          fallback={
            <div class="flex items-center justify-center h-full text-gray-500 text-sm">
              左のサイドバーでペアを作成・選択してください
            </div>
          }
        >
          {/* ヘッダー: 時間窓設定 + 統計 */}
          <div class="flex items-center gap-4 px-4 py-2.5 border-b border-gray-700 bg-gray-900 shrink-0 flex-wrap">
            <span class="text-xs text-gray-400 font-semibold">{pair()!.name}</span>
            <div class="flex items-center gap-1 ml-auto">
              <span class="text-xs text-gray-400">時間窓:</span>
              <For each={WINDOW_OPTIONS}>
                {(opt) => (
                  <button
                    onClick={() => setWindowSec(opt.value)}
                    class={`text-xs px-2 py-0.5 rounded transition-colors ${
                      windowSec() === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                )}
              </For>
            </div>
            <Show when={selectedPhpEntry()}>
              <div class="text-[10px] text-gray-400">
                対応Apacheログ: <span class="text-white font-bold">{relatedApache().length}</span> 件
                <Show when={highlightIps().size > 0}>
                  （注目IP: <span class="text-blue-300">{highlightIps().size}</span> 種類）
                </Show>
              </div>
            </Show>
          </div>

          {/* 2カラム */}
          <div class="flex flex-1 min-h-0">
            {/* 左カラム: PHPエラー一覧 */}
            <div class="w-1/2 flex flex-col border-r border-gray-700 min-w-0">
              {/* PHPカラムヘッダー */}
              <div class="px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0 flex items-center gap-2">
                <span class="text-[10px] bg-purple-800 text-purple-200 px-1.5 rounded">PHP</span>
                <span class="text-xs text-gray-400">エラーログ</span>
                <span class="text-[10px] text-gray-500 ml-auto">{filteredPhp().length.toLocaleString()} 件</span>
              </div>
              {/* キーワードフィルタ */}
              <div class="px-3 py-1.5 border-b border-gray-700 bg-gray-900 shrink-0">
                <input
                  type="text"
                  placeholder="キーワードで絞り込み..."
                  value={phpKeyword()}
                  onInput={(e) => setPhpKeyword(e.currentTarget.value)}
                  class="w-full text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              {/* PHPエラーリスト */}
              <div class="flex-1 overflow-y-auto">
                <Show
                  when={filteredPhp().length > 0}
                  fallback={
                    <div class="p-4 text-xs text-gray-500 text-center mt-4">
                      PHPエラーがありません
                    </div>
                  }
                >
                  <For each={filteredPhp()}>
                    {(entry) => (
                      <PhpErrorRow
                        entry={entry}
                        selected={selectedPhpEntry() === entry}
                        onClick={() => setSelectedPhpEntry(entry)}
                      />
                    )}
                  </For>
                </Show>
              </div>
            </div>

            {/* 右カラム: 対応Apacheログ */}
            <div class="w-1/2 flex flex-col min-w-0">
              {/* Apacheカラムヘッダー */}
              <div class="px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0 flex items-center gap-2">
                <span class="text-[10px] bg-green-800 text-green-200 px-1.5 rounded">Apache</span>
                <span class="text-xs text-gray-400">
                  <Show when={selectedPhpEntry()} fallback="← PHPエラーを選択してください">
                    前後{windowSec()}秒のアクセスログ
                  </Show>
                </span>
              </div>

              {/* 選択中PHPエラーの詳細 */}
              <Show when={selectedPhpEntry()}>
                {(entry) => (
                  <div class="px-3 py-2 bg-gray-900 border-b border-gray-700 text-xs shrink-0">
                    <div class="flex items-center gap-2">
                      <span class={`text-[10px] px-1.5 py-0.5 rounded ${LEVEL_COLORS[entry().level] ?? 'text-gray-400 bg-gray-800'}`}>
                        {entry().level}
                      </span>
                      <span class="text-gray-400 tabular-nums">
                        {formatTimestamp(entry().timestamp, 'YYYY/MM/DD HH:mm:ss')}
                      </span>
                    </div>
                    <div class="text-gray-300 mt-1 truncate" title={entry().message}>
                      {entry().message}
                    </div>
                    <div class="text-gray-500 text-[10px] mt-0.5">
                      {entry().file} : {entry().line}行
                    </div>
                  </div>
                )}
              </Show>

              {/* 注目IP の説明 */}
              <Show when={highlightIps().size > 0}>
                <div class="px-3 py-1.5 bg-blue-950 border-b border-gray-700 text-[10px] text-blue-300 shrink-0">
                  ★ 時間窓内に複数回アクセスしているIP（原因候補）:&nbsp;
                  {Array.from(highlightIps()).join(', ')}
                </div>
              </Show>

              {/* Apacheログリスト */}
              <div class="flex-1 overflow-y-auto">
                <Show
                  when={selectedPhpEntry()}
                  fallback={
                    <div class="p-4 text-xs text-gray-500 text-center mt-4">
                      左のPHPエラーを選択すると、前後のApacheログを表示します
                    </div>
                  }
                >
                  <Show
                    when={relatedApache().length > 0}
                    fallback={
                      <div class="p-4 text-xs text-gray-500 text-center mt-4">
                        前後{windowSec()}秒のApacheログはありません
                      </div>
                    }
                  >
                    <For each={relatedApache()}>
                      {(entry) => (
                        <ApacheRow
                          entry={entry}
                          highlightIps={highlightIps()}
                          phpTimestamp={selectedPhpEntry()!.timestamp}
                        />
                      )}
                    </For>
                  </Show>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default CorrelatedView
