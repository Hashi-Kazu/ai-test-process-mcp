# ai-test-process-mcp

**JSTQB/ISTQB Generic Test Process を AI で支援する MCP サーバー。**

テスト管理ツールの操作を目的とせず、Generic Test Process の各工程（Test Planning 〜 Test Completion）において、テスト成果物の作成・レビュー・分析を AI で支援することを目的とする。文書構成は ISO/IEC/IEEE 29119-3 に準拠する。

**現在のスコープ（Phase 1: Test Planning）**: テスト計画書（ISO/IEC/IEEE 29119-3準拠15章構成）の日本語ドラフト生成・JSTQB観点でのレビュー・質問形式でのコンテキスト収集ガイド。
**将来構想**: Test Analysis（要件分析・テスト条件抽出）、Test Design（テストケース生成・テスト仕様書レビュー）を経て、Generic Test Process 全7工程へ段階的に拡張する。詳細は [docs/roadmap.md](./docs/roadmap.md) を参照。

## セットアップ

```bash
npm install
npm run build
```

## 提供する機能

### Tool: `create_test_plan`

プロジェクト情報（`projectName`, `scope` は必須。`objectives`, `risks`, `scheduleConstraints`, `team`, `testItems`, `stakeholders`, `glossary` など多数の任意項目）を入力すると、ISO/IEC/IEEE 29119-3準拠の15章構成に沿った**日本語**Markdown形式のテスト計画書ドラフトを生成する。未入力の項目は `_未記入_`（必須項目は `_未記入（必須）_`）として明示される。テストタイプ説明・インシデントランク等の固定リファレンスは常に出力される。

### Tool: `review_test_plan`

テスト計画書のMarkdown本文を入力すると、JSTQB観点でレビューレポートを返す。二層構成: (1) 構造検査（15章の欠落・必須項目の未記入を決定的に検出）、(2) 意味的レビュー用チェックリスト（呼び出し側のLLMが内容の妥当性を判断するための指示形式）。

### Prompt: `test_plan_interview`

質問形式でテスト計画書のコンテキストを収集するためのガイド。テンプレートの必須項目を中心に、ユーザーへ順に質問して回答を集め、`create_test_plan` を呼び出すようアシスタントを誘導する。任意引数 `projectName` を受け取る。

### Resource: `iso29119://test-plan/structure`

ISO/IEC/IEEE 29119-3のテスト計画15章立て（Introduction〜Approvals）を構造化データ（JSON）として公開する。各セクションに日本語見出し（`titleJa`）を併記。

### Resource: `testplan://template/standard`

テスト計画書テンプレート（ISO/IEC/IEEE 29119-3準拠15章構成）の構造データ（JSON）を公開する。各セクションの見出し・必須フラグ・ISO29119対応（`isoRef`）・入力マッピング（`fieldKey`）に加え、固定リファレンス（テストタイプ・カタログ、インシデントランク、判定ステータス、標準メトリクス等）を含む。

### Resource: `jstqb://glossary/core`

JSTQB（ISTQB）用語のパラフレーズ集（テストレベル・テストタイプ・開始基準/終了基準・テスト条件/テスト観点・レビュータイプ等）を構造化データ（JSON）として公開する。各用語にISO 29119-3の章参照を併記。

### Resource: `testplan://review/checklist`

テスト計画書の意味的レビュー用チェックリスト（JSTQB観点、用語集・テンプレート章への相互参照付き）を構造化データ（JSON）として公開する。

## コマンド

```bash
npm run dev       # tsc --watch
npm start         # node dist/server.js（stdio transport）
npm test          # vitest run
npm run inspect   # build後、MCP Inspectorを起動して動作確認
```

## 動作確認（CLI）

```bash
npx @modelcontextprotocol/inspector --cli node dist/server.js --method resources/list
npx @modelcontextprotocol/inspector --cli node dist/server.js --method tools/list
npx @modelcontextprotocol/inspector --cli node dist/server.js --method prompts/list
npx @modelcontextprotocol/inspector --cli node dist/server.js --method tools/call \
  --tool-name create_test_plan \
  --tool-arg projectName="ECサイト" \
  --tool-arg scope="決済とログイン機能"
npx @modelcontextprotocol/inspector --cli node dist/server.js --method prompts/get \
  --prompt-name test_plan_interview --prompt-args projectName="ECサイト"
```

## 実クライアントへの登録例（Claude Desktop / Claude Code）

```json
{
  "mcpServers": {
    "ai-test-process-mcp": {
      "command": "node",
      "args": ["<repo-path>/dist/server.js"]
    }
  }
}
```

npm公開後は、リポジトリをローカルにcloneしなくても `npx` 経由で起動できる（`.vscode/mcp.json` の例）。

```json
{
  "servers": {
    "ai-test-process-mcp": {
      "command": "npx",
      "args": ["-y", "ai-test-process-mcp"]
    }
  }
}
```

## 公開手順（メンテナ向け）

1. `npm login`（npmjs.comのアカウントで認証）
2. `npm run build`（`npm publish` 実行時は `prepublishOnly` フックにより自動実行されるため、手動実行は任意）
3. `npm publish`

公開後の接続方式（stdio）は変わらない。MCPレジストリ（`server.json` / `mcp-publisher`）への登録は本手順の対象外で、将来の別タスクとして扱う。

## 将来機能の追加方法

新しい機能（Test Analysis・Test Design ほか Generic Test Process 各工程の tool）を追加する際は、以下のパターンに従う：

1. `src/resources/<name>.ts` — 必要な参照データ（構造化データ）を定義
2. `src/tools/<name>.ts` — zod入力スキーマ + 純粋なレンダリング関数 + `registerXxxTool()`
3. `src/resources/index.ts` / `src/tools/index.ts` にそれぞれ1行登録を追加
4. `test/<name>.test.ts` でレンダリング関数を単体テスト

`server.ts` 本体は変更不要。プラグインローダーやレジストリのような抽象化は、モジュール数が増えて明示的な登録リストが煩雑になるまで導入しない。

詳細は [AGENTS.md](./AGENTS.md) と [docs/ai/project-overview.md](./docs/ai/project-overview.md) を参照。
