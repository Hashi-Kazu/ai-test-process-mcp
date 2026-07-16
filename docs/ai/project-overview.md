# Project Overview

## 概要

JSTQB/ISTQB Generic Test Process を AI で支援する MCP サーバー。全7工程（Test Planning 〜 Test Completion）のテスト成果物の作成・レビュー・分析を段階的に実装していく構想のうち、現在は Phase 1（Test Planning）として「テスト計画書のドラフト生成（`create_test_plan`）」「テスト計画書レビュー（`review_test_plan`）」を実装済み。文書構成は ISO/IEC/IEEE 29119-3 に準拠し、ISO29119・JSTQBの知識はパラフレーズした構造化データとして resource に保持する（独立した汎用知識ベースにはしない）。段階的な開発計画は [`docs/roadmap.md`](../roadmap.md) を参照。

## 技術スタック

- TypeScript（ESM、`NodeNext` module/moduleResolution）
- `@modelcontextprotocol/sdk`（`McpServer` + `StdioServerTransport`）
- `zod`（tool入力スキーマ）
- `vitest`（単体テスト）

## コマンド

```bash
npm install       # 依存関係インストール
npm run build     # tsc でコンパイル -> dist/
npm run dev       # tsc --watch
npm start         # node dist/server.js を起動（stdio transport）
npm test          # vitest run
npm run inspect   # build後、MCP Inspectorで動作確認
```

## ディレクトリ構成

```text
src/
  server.ts            # McpServer作成・resource/tool/prompt登録・stdio接続
  types.ts             # 共有型（TestPlanInput, TestPlanTemplate, Iso29119Section, JstqbGlossary 等）
  resources/
    index.ts                    # 全resourceを登録
    iso29119.ts                 # ISO/IEC/IEEE 29119-3 テスト計画構造の参照データ（日本語見出しtitleJa付き）
    testPlanTemplate.ts         # テスト計画テンプレート（29119-3準拠15章構造＋固定ボイラープレート）
    jstqbGlossary.ts            # JSTQB用語のパラフレーズ集（jstqb://glossary/core）
    testPlanReviewChecklist.ts  # テスト計画書レビューチェックリスト（testplan://review/checklist）
  tools/
    index.ts             # 全toolを登録
    generateTestPlan.ts   # create_test_plan ツール（zodスキーマ + renderTestPlan純関数、日本語15章構成で出力）
    reviewTestPlan.ts     # review_test_plan ツール（構造検査 + 意味的チェックリストの二層構成、renderTestPlanReview純関数）
    reviseTestPlan.ts     # revise_test_plan ツール（欠落章補完・マーカー正規化の機械的修正 + LLM向け書き換え指示、renderTestPlanRevision純関数）
  prompts/
    index.ts             # 全promptを登録
    testPlanInterview.ts  # test_plan_interview プロンプト（質問形式の収集ガイド + buildInterviewPrompt純関数）
test/
  generateTestPlan.test.ts        # renderTestPlan()の単体テスト
  reviewTestPlan.test.ts          # renderTestPlanReview()の単体テスト
  reviseTestPlan.test.ts          # renderTestPlanRevision()の単体テスト
  testPlanTemplate.test.ts        # テンプレート構造データの単体テスト
  jstqbGlossary.test.ts           # 用語集構造データの単体テスト
  testPlanReviewChecklist.test.ts # チェックリスト構造データの単体テスト
  testPlanInterview.test.ts       # buildInterviewPrompt()の単体テスト
```

## 拡張パターン（Test Analysis・Test Design ほか各工程の tool 追加）

新しい機能を追加する際は、`src/resources/<name>.ts` + `src/tools/<name>.ts` を新設し、`resources/index.ts` / `tools/index.ts` にそれぞれ1行の登録を追加するだけでよい。resource/tool追加時は `server.ts` 本体には手を入れない。プロンプトのような新カテゴリを足す場合のみ、`registerResources`/`registerTools` と同型の登録関数（`src/prompts/index.ts` の `registerPrompts`）を新設し、`server.ts` に1行だけ追加する。プラグインローダーやレジストリのような抽象化は、モジュール数が増えて明示的な登録リストが煩雑になるまで導入しない。

## 動作確認

- `npm test` でレンダリングロジックの単体テスト
- `npx @modelcontextprotocol/inspector --cli node dist/server.js --method resources/list` / `--method tools/list` / `--method prompts/list` / `--method tools/call --tool-name create_test_plan --tool-arg projectName=... --tool-arg scope=...` / `--method prompts/get --prompt-name test_plan_interview` でMCPプロトコル経由の動作確認
- 実クライアント（Claude Desktop / Claude Code）のMCP設定に `command: "node"`, `args: ["<path>/dist/server.js"]` を追加して確認
