---
description: "log_analyseプロジェクトのコーディング規約。SolidJS、Electron、TypeScriptを使った実装時に適用。コンポーネント作成・ストア操作・IPC通信・パーサー追加・型定義など全般に使用。"
applyTo: "**/*.{ts,tsx}"
---

# log_analyse プロジェクト コーディング規約

## 技術スタック

- **フロントエンド**: SolidJS（ReactではなくSolidJS。`useState`ではなく`createSignal`/`createStore`を使う）
- **デスクトップ**: Electron（contextIsolation有効、nodeIntegration無効）
- **スタイリング**: Tailwind CSS
- **言語**: TypeScript（strict mode）
- **ビルド**: electron-vite / Vite
- **チャート**: Chart.js + solid-chartjs
- **仮想スクロール**: @tanstack/solid-virtual

## SolidJSのパターン

### コンポーネント定義
```tsx
import { Component } from 'solid-js';

const MyComponent: Component = () => {
  return <div>...</div>;
};

export default MyComponent;
```

### 条件分岐・リストレンダリング
- 条件: ReactのJSX三項演算子ではなく `<Show when={...}>` を使う
- リスト: `<For each={...}>` を使う（`.map()` は使わない）

### 状態管理
- コンポーネントローカル: `createSignal`
- 複雑なネスト状態: `createStore`（`solid-js/store`から import）
- 派生状態: `createMemo`

### ストア構造（`src/stores/`）
- `createStore<型>` でストア定義
- `createMemo` でセレクター（派生状態）を定義し named export
- 状態操作関数も named export してコンポーネントから直接インポート

```ts
// パターン例
const [state, setState] = createStore<MyState>({ ... });
export const activeItem = createMemo(() => state.items.find(...));
export function updateItem(id: string, data: Partial<Item>): void {
  setState('items', i => i.id === id, data);
}
```

## 型定義パターン（`src/types/`）

- ログエントリは discriminated union: `type LogEntry = ApacheLogEntry | PhpErrorEntry`
- `type` フィールドでエントリ種別を識別
- 型述語フィルタ: `.filter((e): e is ApacheLogEntry => e.type === 'apache')`
- 新しいログタイプを追加する場合は `src/types/log.ts` に型を定義し union に追加

## パーサーの構造（`src/parsers/`）

パーサーは必ず以下の3関数で構成する（副作用なしの純粋関数）：

```ts
export function parseLine(raw: string): MyLogEntry | null { ... }
export function parseLog(content: string): MyLogEntry[] { ... }
export function detectLog(sample: string): boolean { ... }
```

- `parseLine`: 1行パース → 型付きエントリ or `null`
- `parseLog`: 全行分割 → `parseLine` マップ → `null` 除去
- `detectLog`: 先頭行の正規表現テストでフォーマット判定

## Electron IPC規約

### チャンネル命名
```
namespace:action
```
例: `file:open-dialog`, `file:read`, `watcher:start`, `watcher:stop`

### IPCハンドラ（`electron/handlers/`）
- すべての ipcMain ハンドラは `try/catch` でエラーハンドリング
- エラーはレンダラーへ伝播（throw する）

### Preload（`electron/preload.ts`）
- `contextBridge.exposeInMainWorld('electronAPI', api)` パターンを維持
- イベントリスナー登録関数は **クリーンアップ関数を返す**:
  ```ts
  onFileChange: (cb) => {
    const unsub = ipcRenderer.on('watcher:change', (_, data) => cb(data));
    return () => unsub();
  }
  ```
- `export type ElectronAPI = typeof api` で型を生成（`src/types/electron.d.ts` に declare）

## TypeScript規約

- `strict: true` 完全遵守（未使用変数・引数・全パスのreturnすべて必須）
- エラーハンドリングパターン: `err instanceof Error ? err.message : String(err)`
- null合体: `??` を優先（`|| 0` より `?? 0`）
- Pathエイリアス: `@/` → `src/`、`@electron/` → `electron/`

## ファイル命名・ディレクトリ構成

| 種別 | 規則 | 例 |
|------|------|-----|
| ソースファイル | camelCase | `logStore.ts`, `fileHandler.ts` |
| コンポーネントディレクトリ | PascalCase | `FileManager/` |
| コンポーネントファイル | ディレクトリ名と同じ | `FileManager/FileManager.tsx` |
| 型インターフェース | PascalCase | `LogFile`, `ApacheStats` |
| 定数 | UPPER_SNAKE_CASE | `DEFAULT_FILTER`, `APACHE_REGEX` |
| ストアファイル | `*Store.ts` | `logStore.ts` |
| ハンドラファイル | `*Handler.ts` | `fileHandler.ts` |

## コメント・コーディングスタイル

- **コメントはすべて日本語で記述**
- セクション区切り: `// ===== セクション名 =====`
- 正規表現の隣に実際のログ例をコメントで記載
- JSDocは使わない（インラインコメントで説明）
- アロー関数を基本とする（コンポーネント定義含む）
- 非同期処理: `async/await` で統一（コールバックや `.then()` チェーンは使わない）

## インポート順序

```ts
// 1. solid-js（フレームワーク本体）
import { createSignal, createMemo } from 'solid-js';

// 2. 内部モジュール（@/ エイリアス）
import { logStore } from '@/stores/logStore';
import MyComponent from '@/components/MyComponent/MyComponent';

// 3. サードパーティ
import dayjs from 'dayjs';
```

## Gitコミット規約

### コミットメッセージ形式

```
<type>: <概要（日本語）>

<本文（任意）>

<トレーラー>
```

### typeの種類

| type | 用途 |
|------|------|
| `feat` | 新機能追加 |
| `fix` | バグ修正 |
| `refactor` | 機能変更を伴わないリファクタリング |
| `style` | コードスタイル・フォーマット変更（ロジック変更なし） |
| `docs` | ドキュメント・コメントの変更 |
| `test` | テストの追加・修正 |
| `chore` | ビルド設定・依存パッケージなど雑務 |

### ルール

- **概要は日本語で記述**（50文字以内を目安）
- 概要は体言止めまたは動詞の連用形で記述（例: `ログフィルター機能を追加`）
- 本文が必要な場合は「なぜ」を中心に記述
- GitHub Copilot が作成したコミットには必ず以下のトレーラーを付与:

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

### コミットメッセージ例

```
feat: Apacheログのステータスコード別集計を追加

集計結果をチャートで可視化するため、
ステータスコードごとのリクエスト数を集計する機能を実装。

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```
