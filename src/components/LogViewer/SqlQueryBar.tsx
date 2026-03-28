import { Component, For, Show, createSignal, createMemo, onCleanup } from 'solid-js'
import {
  setSqlQuery,
  sqlError,
  logState
} from '@/stores/logStore'
import {
  getSuggestions,
  SAMPLE_QUERIES,
  type Suggestion
} from '@/utils/sqlQuery'

const SqlQueryBar: Component = () => {
  let inputRef!: HTMLTextAreaElement
  const [showSuggestions, setShowSuggestions] = createSignal(false)
  const [selectedIdx, setSelectedIdx] = createSignal(0)

  // デバウンスタイマー
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  function handleInput(value: string) {
    // デバウンス: 300ms 後に実行
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      setSqlQuery(value)
    }, 300)
    // サジェスト表示を更新
    setSelectedIdx(0)
    setShowSuggestions(true)
  }

  onCleanup(() => clearTimeout(debounceTimer))

  const suggestions = createMemo((): Suggestion[] => {
    if (!showSuggestions()) return []
    const pos = inputRef?.selectionStart ?? logState.sqlQuery.length
    return getSuggestions(logState.sqlQuery, pos).slice(0, 12)
  })

  function applySuggestion(s: Suggestion): void {
    const el = inputRef
    if (!el) return
    const val = el.value
    const cursorPos = el.selectionStart ?? val.length
    // 現在入力中のトークン（最後の空白以降）を置換
    const before = val.slice(0, cursorPos)
    const after = val.slice(cursorPos)
    const lastSpace = before.lastIndexOf(' ')
    const prefix = before.slice(0, lastSpace + 1)
    const newVal = prefix + s.insertText + after
    el.value = newVal
    const newCursor = (prefix + s.insertText).length
    el.setSelectionRange(newCursor, newCursor)
    el.focus()
    setShowSuggestions(false)
    // 確定後にデバウンスでクエリ実行
    handleInput(newVal)
  }

  function handleKeyDown(e: KeyboardEvent): void {
    const items = suggestions()
    if (items.length > 0 && showSuggestions()) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => (i + 1) % items.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => (i - 1 + items.length) % items.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        // Tab/Enterでサジェスト確定（Enterはshiftなしで実行も兼ねる）
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && items.length > 0 && showSuggestions())) {
          e.preventDefault()
          applySuggestion(items[selectedIdx()])
          return
        }
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false)
        return
      }
    }
    // Ctrl+Enter / Cmd+Enter で即時実行
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      clearTimeout(debounceTimer)
      setSqlQuery(inputRef.value)
    }
  }

  function handleSampleClick(sql: string): void {
    inputRef.value = sql
    inputRef.focus()
    clearTimeout(debounceTimer)
    setSqlQuery(sql)
    setShowSuggestions(false)
  }

  function suggestionTypeIcon(type: Suggestion['type']): string {
    switch (type) {
      case 'keyword': return 'K'
      case 'table': return 'T'
      case 'field': return 'F'
      case 'value': return 'V'
      case 'operator': return 'O'
    }
  }

  function suggestionTypeColor(type: Suggestion['type']): string {
    switch (type) {
      case 'keyword': return 'bg-purple-700'
      case 'table': return 'bg-blue-700'
      case 'field': return 'bg-green-700'
      case 'value': return 'bg-amber-700'
      case 'operator': return 'bg-gray-600'
    }
  }

  return (
    <div class="px-3 py-2 bg-gray-800 border-b border-gray-700">
      {/* クエリ入力エリア */}
      <div class="relative">
        <textarea
          ref={inputRef!}
          value={logState.sqlQuery}
          onInput={(e) => handleInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // 少し遅延を入れてサジェストのクリックを拾えるようにする
            setTimeout(() => setShowSuggestions(false), 200)
          }}
          placeholder="SELECT * FROM logs WHERE ..."
          rows={2}
          spellcheck={false}
          class="w-full bg-gray-900 text-gray-100 text-xs font-mono px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500 resize-none"
        />

        {/* オートコンプリート候補 */}
        <Show when={showSuggestions() && suggestions().length > 0}>
          <div class="absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg max-h-48 overflow-y-auto">
            <For each={suggestions()}>
              {(s, idx) => (
                <button
                  class={`w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2 hover:bg-gray-700 ${idx() === selectedIdx() ? 'bg-gray-700' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s) }}
                >
                  <span class={`w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center text-white ${suggestionTypeColor(s.type)}`}>
                    {suggestionTypeIcon(s.type)}
                  </span>
                  <span class="text-gray-200">{s.label}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* エラー表示 */}
      <Show when={sqlError()}>
        <div class="mt-1.5 px-2 py-1 bg-red-900/50 border border-red-700 rounded text-xs text-red-300 font-mono">
          ⚠ {sqlError()}
        </div>
      </Show>

      {/* サンプルクエリー & ヒント */}
      <div class="mt-2 flex items-center gap-2 flex-wrap">
        <span class="text-[10px] text-gray-500 uppercase tracking-wide shrink-0">サンプル:</span>
        <For each={SAMPLE_QUERIES}>
          {(sample) => (
            <button
              onClick={() => handleSampleClick(sample.sql)}
              class="text-[10px] px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              title={sample.sql}
            >
              {sample.label}
            </button>
          )}
        </For>
        <span class="text-[10px] text-gray-600 ml-auto shrink-0">
          Ctrl+Enter で実行 / Tab でサジェスト確定
        </span>
      </div>
    </div>
  )
}

export default SqlQueryBar
