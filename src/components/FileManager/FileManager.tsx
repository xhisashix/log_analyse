import { Component, createSignal, For, Show } from 'solid-js'
import {
  logState,
  addLogFile,
  removeLogFile,
  setActiveFile,
  toggleWatcher
} from '@/stores/logStore'

const FileManager: Component = () => {
  const [sidebarWidth, setSidebarWidth] = createSignal(256)

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

  async function handleOpenDialog() {
    const result = await window.electronAPI.openFileDialog()
    if (result.canceled) return
    for (const fp of result.filePaths) {
      await addLogFile(fp)
    }
  }

  return (
    <aside
      class="bg-gray-900 text-gray-100 flex flex-col h-full border-r border-gray-700 relative shrink-0"
      style={{ width: `${sidebarWidth()}px` }}
    >
      <div class="px-3 pt-8 pb-3 border-b border-gray-700 flex items-center justify-between">
        <span class="text-sm font-semibold tracking-wide uppercase text-gray-400">Files</span>
        <button
          onClick={handleOpenDialog}
          class="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded transition-colors"
          title="ログファイルを追加"
        >
          + 追加
        </button>
      </div>

      <div class="flex-1 overflow-y-auto">
        <Show when={logState.loading}>
          <div class="p-3 text-xs text-gray-400 animate-pulse">読み込み中...</div>
        </Show>

        <Show when={logState.error}>
          <div class="p-3 text-xs text-red-400 break-words">{logState.error}</div>
        </Show>

        <Show
          when={logState.files.length > 0}
          fallback={
            <div class="p-4 text-xs text-gray-500 text-center mt-4">
              ログファイルを追加してください
            </div>
          }
        >
          <For each={logState.files}>
            {(file) => (
              <div
                onClick={() => setActiveFile(file.id)}
                class={`group flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-800 transition-colors ${logState.activeFileId === file.id ? 'bg-gray-800 border-l-2 border-blue-500' : ''
                  }`}
              >
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium truncate" title={file.path}>
                    {file.name}
                  </div>
                  <div class="flex items-center gap-1 mt-0.5">
                    <span
                      class={`text-[10px] px-1 rounded ${file.logType === 'apache'
                          ? 'bg-green-800 text-green-200'
                          : file.logType === 'php'
                            ? 'bg-purple-800 text-purple-200'
                            : file.logType === 'drupal-watchdog'
                              ? 'bg-amber-800 text-amber-200'
                              : 'bg-gray-700 text-gray-300'
                        }`}
                    >
                      {file.logType}
                    </span>
                    <span class="text-[10px] text-gray-500">
                      {file.entries.length.toLocaleString()} 件
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleWatcher(file.id) }}
                    class={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${file.watching
                        ? 'bg-orange-600 hover:bg-orange-500 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    title={file.watching ? '監視停止' : '監視開始'}
                  >
                    {file.watching ? '●' : '○'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeLogFile(file.id) }}
                    class="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
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
    </aside>
  )
}

export default FileManager
