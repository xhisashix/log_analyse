import { Component, For } from 'solid-js'
import { Chart, registerables } from 'chart.js'
import { Line, Pie, Doughnut } from 'solid-chartjs'
import { apacheStats, phpStats, drupalWatchdogStats, activeFile } from '@/stores/logStore'
import { Show } from 'solid-js'
import { formatTimestamp } from '@/utils/formatTime'

Chart.register(...registerables)

// ===== Apache ダッシュボード =====
const ApacheDashboard: Component = () => {
  const stats = apacheStats

  const statusChartData = () => {
    const s = stats()
    if (!s) return null
    const labels = Object.keys(s.statusCounts)
    const data = Object.values(s.statusCounts)
    const colors = labels.map((l) => {
      const code = parseInt(l)
      if (code < 300) return 'rgba(74, 222, 128, 0.8)'
      if (code < 400) return 'rgba(250, 204, 21, 0.8)'
      if (code < 500) return 'rgba(251, 146, 60, 0.8)'
      return 'rgba(248, 113, 113, 0.8)'
    })
    return {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0 }]
    }
  }

  const requestsChartData = () => {
    const s = stats()
    if (!s) return null
    return {
      labels: s.requestsPerHour.map((r) => r.hour.slice(5, 16)),
      datasets: [{
        label: 'リクエスト数',
        data: s.requestsPerHour.map((r) => r.count),
        borderColor: 'rgba(59, 130, 246, 0.8)',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        fill: true,
        tension: 0.3
      }]
    }
  }

  const methodChartData = () => {
    const s = stats()
    if (!s) return null
    return {
      labels: Object.keys(s.methodCounts),
      datasets: [{
        data: Object.values(s.methodCounts),
        backgroundColor: [
          'rgba(59,130,246,0.8)', 'rgba(16,185,129,0.8)', 'rgba(245,158,11,0.8)',
          'rgba(239,68,68,0.8)', 'rgba(139,92,246,0.8)', 'rgba(107,114,128,0.8)'
        ],
        borderWidth: 0
      }]
    }
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9ca3af', font: { size: 11 } } }
    },
    scales: {
      x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(75,85,99,0.3)' } },
      y: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(75,85,99,0.3)' } }
    }
  }

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const, labels: { color: '#9ca3af', font: { size: 11 } } }
    }
  }

  return (
    <Show when={stats()} fallback={<div class="p-8 text-gray-500 text-center">データがありません</div>}>
      {(s) => (
        <div class="grid grid-cols-2 gap-4 p-4 overflow-auto h-full">
          {/* サマリーカード */}
          <div class="col-span-2 grid grid-cols-4 gap-3">
            <StatCard label="総リクエスト数" value={s().totalRequests.toLocaleString()} color="blue" />
            <StatCard label="総転送量" value={formatBytes(s().totalBytes)} color="green" />
            <StatCard
              label="4xx エラー率"
              value={`${calcErrorRate(s().statusCounts, '4')}%`}
              color="orange"
            />
            <StatCard
              label="5xx エラー率"
              value={`${calcErrorRate(s().statusCounts, '5')}%`}
              color="red"
            />
          </div>

          {/* リクエスト推移グラフ */}
          <div class="col-span-2 bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">リクエスト数推移（時間別）</h3>
            <div style={{ height: '200px' }}>
              <Show when={requestsChartData()}>
                {(data) => (
                  <Line data={data()} options={chartOptions} width={undefined} height={undefined} />
                )}
              </Show>
            </div>
          </div>

          {/* ステータスコード分布 */}
          <div class="bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">ステータスコード分布</h3>
            <div style={{ height: '180px' }}>
              <Show when={statusChartData()}>
                {(data) => (
                  <Pie data={data()} options={pieOptions} width={undefined} height={undefined} />
                )}
              </Show>
            </div>
          </div>

          {/* HTTP メソッド分布 */}
          <div class="bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">HTTP メソッド分布</h3>
            <div style={{ height: '180px' }}>
              <Show when={methodChartData()}>
                {(data) => (
                  <Doughnut data={data()} options={pieOptions} width={undefined} height={undefined} />
                )}
              </Show>
            </div>
          </div>

          {/* 上位 IP */}
          <div class="bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">上位 IP アドレス</h3>
            <div class="space-y-1">
              <For each={s().topIPs.slice(0, 8)}>
                {({ ip, count }) => (
                  <div class="flex justify-between text-xs">
                    <span class="text-cyan-400 font-mono">{ip}</span>
                    <span class="text-gray-400">{count.toLocaleString()}</span>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* 上位 URL */}
          <div class="bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">アクセス上位 URL</h3>
            <div class="space-y-1">
              <For each={s().topPaths.slice(0, 8)}>
                {({ path, count }) => (
                  <div class="flex justify-between text-xs gap-2">
                    <span class="text-gray-200 font-mono truncate flex-1" title={path}>{path}</span>
                    <span class="text-gray-400 shrink-0">{count.toLocaleString()}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}

// ===== PHP ダッシュボード =====
const PhpDashboard: Component = () => {
  const stats = phpStats

  const levelChartData = () => {
    const s = stats()
    if (!s) return null
    const colorMap: Record<string, string> = {
      'Fatal error': 'rgba(239,68,68,0.8)',
      'Parse error': 'rgba(220,38,38,0.8)',
      'Warning': 'rgba(245,158,11,0.8)',
      'Notice': 'rgba(59,130,246,0.8)',
      'Deprecated': 'rgba(139,92,246,0.8)',
      'Unknown': 'rgba(107,114,128,0.8)'
    }
    const labels = Object.keys(s.levelCounts)
    return {
      labels,
      datasets: [{
        data: Object.values(s.levelCounts),
        backgroundColor: labels.map((l) => colorMap[l] ?? 'rgba(107,114,128,0.8)'),
        borderWidth: 0
      }]
    }
  }

  const errorsChartData = () => {
    const s = stats()
    if (!s) return null
    return {
      labels: s.errorsPerHour.map((r) => r.hour.slice(5, 16)),
      datasets: [{
        label: 'エラー数',
        data: s.errorsPerHour.map((r) => r.count),
        borderColor: 'rgba(239, 68, 68, 0.8)',
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        fill: true,
        tension: 0.3
      }]
    }
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(75,85,99,0.3)' } },
      y: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(75,85,99,0.3)' } }
    }
  }

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right' as const, labels: { color: '#9ca3af', font: { size: 11 } } } }
  }

  return (
    <Show when={stats()} fallback={<div class="p-8 text-gray-500 text-center">データがありません</div>}>
      {(s) => (
        <div class="grid grid-cols-2 gap-4 p-4 overflow-auto h-full">
          {/* サマリー */}
          <div class="col-span-2 grid grid-cols-4 gap-3">
            <StatCard label="総エラー数" value={s().totalErrors.toLocaleString()} color="red" />
            <StatCard
              label="Fatal / Parse"
              value={((s().levelCounts['Fatal error'] ?? 0) + (s().levelCounts['Parse error'] ?? 0)).toLocaleString()}
              color="red"
            />
            <StatCard
              label="Warning"
              value={(s().levelCounts['Warning'] ?? 0).toLocaleString()}
              color="orange"
            />
            <StatCard
              label="Notice / Deprecated"
              value={((s().levelCounts['Notice'] ?? 0) + (s().levelCounts['Deprecated'] ?? 0)).toLocaleString()}
              color="blue"
            />
          </div>

          {/* エラー推移 */}
          <div class="col-span-2 bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">エラー数推移（時間別）</h3>
            <div style={{ height: '200px' }}>
              <Show when={errorsChartData()}>
                {(data) => <Line data={data()} options={chartOptions} width={undefined} height={undefined} />}
              </Show>
            </div>
          </div>

          {/* レベル分布 */}
          <div class="bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">エラーレベル分布</h3>
            <div style={{ height: '180px' }}>
              <Show when={levelChartData()}>
                {(data) => <Pie data={data()} options={pieOptions} width={undefined} height={undefined} />}
              </Show>
            </div>
          </div>

          {/* 上位エラーファイル */}
          <div class="bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">エラー多発ファイル Top10</h3>
            <div class="space-y-1">
              <For each={s().topFiles.slice(0, 8)}>
                {({ file, count }) => (
                  <div class="flex justify-between text-xs gap-2">
                    <span class="text-purple-300 font-mono truncate flex-1" title={file}>
                      {file.split(/[/\\]/).pop()}
                    </span>
                    <span class="text-gray-400 shrink-0">{count.toLocaleString()}</span>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* 直近エラー */}
          <div class="col-span-2 bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">直近のエラー</h3>
            <div class="space-y-1 max-h-40 overflow-auto">
              <For each={s().recentErrors}>
                {(e) => (
                  <div class="text-xs font-mono flex gap-2">
                    <span class="text-gray-500 shrink-0">{formatTimestamp(e.timestamp, 'HH:mm:ss')}</span>
                    <span class="text-red-400 shrink-0">{e.level}</span>
                    <span class="text-gray-300 truncate">{e.message}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}

// ===== Drupal Watchdog ダッシュボード =====
const DrupalWatchdogDashboard: Component = () => {
  const stats = drupalWatchdogStats

  const severityChartData = () => {
    const s = stats()
    if (!s) return null
    const colorMap: Record<string, string> = {
      'emergency': 'rgba(220,38,38,0.9)',
      'alert': 'rgba(239,68,68,0.8)',
      'critical': 'rgba(248,113,113,0.8)',
      'error': 'rgba(251,146,60,0.8)',
      'warning': 'rgba(245,158,11,0.8)',
      'notice': 'rgba(59,130,246,0.8)',
      'info': 'rgba(74,222,128,0.8)',
      'debug': 'rgba(107,114,128,0.8)',
      'unknown': 'rgba(75,85,99,0.8)'
    }
    const labels = Object.keys(s.severityCounts)
    return {
      labels,
      datasets: [{
        data: Object.values(s.severityCounts),
        backgroundColor: labels.map((l) => colorMap[l] ?? 'rgba(107,114,128,0.8)'),
        borderWidth: 0
      }]
    }
  }

  const entriesChartData = () => {
    const s = stats()
    if (!s) return null
    return {
      labels: s.entriesPerHour.map((r) => r.hour.slice(5, 16)),
      datasets: [{
        label: 'ログ件数',
        data: s.entriesPerHour.map((r) => r.count),
        borderColor: 'rgba(139, 92, 246, 0.8)',
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        fill: true,
        tension: 0.3
      }]
    }
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(75,85,99,0.3)' } },
      y: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(75,85,99,0.3)' } }
    }
  }

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right' as const, labels: { color: '#9ca3af', font: { size: 11 } } } }
  }

  return (
    <Show when={stats()} fallback={<div class="p-8 text-gray-500 text-center">データがありません</div>}>
      {(s) => (
        <div class="grid grid-cols-2 gap-4 p-4 overflow-auto h-full">
          {/* サマリー */}
          <div class="col-span-2 grid grid-cols-4 gap-3">
            <StatCard label="総ログ件数" value={s().totalEntries.toLocaleString()} color="blue" />
            <StatCard
              label="Emergency / Alert"
              value={((s().severityCounts['emergency'] ?? 0) + (s().severityCounts['alert'] ?? 0)).toLocaleString()}
              color="red"
            />
            <StatCard
              label="Error / Critical"
              value={((s().severityCounts['error'] ?? 0) + (s().severityCounts['critical'] ?? 0)).toLocaleString()}
              color="orange"
            />
            <StatCard
              label="Warning"
              value={(s().severityCounts['warning'] ?? 0).toLocaleString()}
              color="orange"
            />
          </div>

          {/* ログ件数推移 */}
          <div class="col-span-2 bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">ログ件数推移（時間別）</h3>
            <div style={{ height: '200px' }}>
              <Show when={entriesChartData()}>
                {(data) => <Line data={data()} options={chartOptions} width={undefined} height={undefined} />}
              </Show>
            </div>
          </div>

          {/* 重要度分布 */}
          <div class="bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">重要度分布</h3>
            <div style={{ height: '180px' }}>
              <Show when={severityChartData()}>
                {(data) => <Pie data={data()} options={pieOptions} width={undefined} height={undefined} />}
              </Show>
            </div>
          </div>

          {/* 上位ログタイプ */}
          <div class="bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">ログタイプ Top10</h3>
            <div class="space-y-1">
              <For each={s().topTypes.slice(0, 10)}>
                {({ watchdogType, count }) => (
                  <div class="flex justify-between text-xs gap-2">
                    <span class="text-purple-300 font-mono truncate flex-1" title={watchdogType}>
                      {watchdogType}
                    </span>
                    <span class="text-gray-400 shrink-0">{count.toLocaleString()}</span>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* 直近のログ */}
          <div class="col-span-2 bg-gray-800 rounded-lg p-3">
            <h3 class="text-xs text-gray-400 mb-2 font-medium">直近のログ</h3>
            <div class="space-y-1 max-h-40 overflow-auto">
              <For each={s().recentEntries}>
                {(e) => (
                  <div class="text-xs font-mono flex gap-2">
                    <span class="text-gray-500 shrink-0">{e.timestamp.toLocaleTimeString()}</span>
                    <span class="text-orange-400 shrink-0">{e.severity}</span>
                    <span class="text-purple-300 shrink-0">{e.watchdogType}</span>
                    <span class="text-gray-300 truncate">{e.message}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}

// ===== 共有コンポーネント =====
const colorMap: Record<string, string> = {
  blue: 'border-blue-500',
  green: 'border-green-500',
  orange: 'border-orange-500',
  red: 'border-red-500'
}

const StatCard: Component<{ label: string; value: string; color: string }> = (props) => (
  <div class={`bg-gray-800 rounded-lg p-3 border-l-4 ${colorMap[props.color] ?? 'border-gray-600'}`}>
    <div class="text-xs text-gray-400 mb-0.5">{props.label}</div>
    <div class="text-lg font-semibold text-gray-100">{props.value}</div>
  </div>
)

function calcErrorRate(statusCounts: Record<string, number>, prefix: string): string {
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0)
  if (total === 0) return '0.0'
  const errorCount = Object.entries(statusCounts)
    .filter(([k]) => k.startsWith(prefix))
    .reduce((a, [, v]) => a + v, 0)
  return ((errorCount / total) * 100).toFixed(1)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

// ===== エクスポート =====
const Dashboard: Component = () => {
  const file = activeFile

  return (
    <div class="h-full overflow-hidden">
      <Show when={file()?.logType === 'apache'}>
        <ApacheDashboard />
      </Show>
      <Show when={file()?.logType === 'php'}>
        <PhpDashboard />
      </Show>
      <Show when={file()?.logType === 'drupal-watchdog'}>
        <DrupalWatchdogDashboard />
      </Show>
      <Show when={!file() || file()?.logType === 'unknown'}>
        <div class="flex items-center justify-center h-full text-gray-600 text-sm">
          ダッシュボードを表示するにはログファイルを選択してください
        </div>
      </Show>
    </div>
  )
}

export default Dashboard
