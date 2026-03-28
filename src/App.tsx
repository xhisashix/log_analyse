import { Component, createSignal, onCleanup, onMount } from 'solid-js'
import FileManager from '@/components/FileManager/FileManager'
import LogViewer from '@/components/LogViewer/LogViewer'
import Dashboard from '@/components/Dashboard/Dashboard'
import CorrelatedView from '@/components/CorrelatedView/CorrelatedView'
import { settings, updateSettings } from '@/stores/settingsStore'
import { initWatcherListener, loadPersistedFiles } from '@/stores/logStore'

type Tab = 'viewer' | 'dashboard' | 'correlated'

const App: Component = () => {
  const [tab, setTab] = createSignal<Tab>('viewer')
  let cleanupWatcher: (() => void) | undefined

  onMount(async () => {
    cleanupWatcher = initWatcherListener()
    await loadPersistedFiles()
  })

  onCleanup(() => {
    cleanupWatcher?.()
    window.electronAPI.stopAllWatchers()
  })

  return (
    <div class="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      {/* サイドバー：ファイル管理 */}
      <FileManager />

      {/* メインエリア */}
      <div class="flex-1 flex flex-col min-w-0">
        {/* タブバー */}
        <div
          class="flex items-center border-b border-gray-700 bg-gray-900 py-0 shrink-0"
          style={{ "-webkit-app-region": "drag" } as any}
        >
          {/* タブボタン群（クリック可能領域） */}
          <div class="flex items-center" style={{ "-webkit-app-region": "no-drag" } as any}>
            <TabButton active={tab() === 'viewer'} onClick={() => setTab('viewer')}>
              📋 ログビューアー
            </TabButton>
            <TabButton active={tab() === 'dashboard'} onClick={() => setTab('dashboard')}>
              📊 ダッシュボード
            </TabButton>
            <TabButton active={tab() === 'correlated'} onClick={() => setTab('correlated')}>
              🔗 相関分析
            </TabButton>
          </div>

          {/* タイムゾーン切り替えトグル */}
          <div
            class="ml-auto flex items-center gap-1.5 pr-2"
            style={{ "-webkit-app-region": "no-drag" } as any}
          >
            <span class="text-[10px] text-gray-500">時刻:</span>
            <button
              onClick={() => updateSettings({ timezone: settings.timezone === 'UTC' ? 'JST' : 'UTC' })}
              class={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${settings.timezone === 'JST'
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              title={settings.timezone === 'UTC' ? 'クリックでJST（日本時間）に切り替え' : 'クリックでUTCに切り替え'}
            >
              {settings.timezone}
            </button>
          </div>
        </div>

        {/* コンテンツ（display で表示切り替え：unmount させず virtualizer を保持） */}
        <div class="flex-1 min-h-0">
          <div style={{ display: tab() === 'viewer' ? 'contents' : 'none' }}>
            <LogViewer />
          </div>
          <div style={{ display: tab() === 'dashboard' ? 'contents' : 'none' }}>
            <Dashboard />
          </div>
          <div style={{ display: tab() === 'correlated' ? 'contents' : 'none' }}>
            <CorrelatedView />
          </div>
        </div>
      </div>
    </div>
  )
}

const TabButton: Component<{ active: boolean; onClick: () => void; children: any }> = (props) => (
  <button
    onClick={props.onClick}
    class={`px-4 py-2.5 text-sm border-b-2 transition-colors ${props.active
      ? 'border-blue-500 text-blue-400'
      : 'border-transparent text-gray-400 hover:text-gray-200'
      }`}
  >
    {props.children}
  </button>
)

export default App
