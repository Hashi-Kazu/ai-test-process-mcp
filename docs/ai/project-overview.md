# Project Overview

## 概要

AIによるテストプロセス支援MCPサーバー。ISO29119の知識・テスト計画・テスト設計・レビュー・品質ゲート・テストメトリクス・改善提案を段階的に実装していく構想のうち、Phase 1として「テスト計画書（ISO/IEC/IEEE 29119-3準拠）のドラフト生成」のみを実装する。ISO29119はテスト計画の中でのみ参照する（独立した汎用知識ベースにはしない）。

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
  server.ts            # McpServer作成・resource/tool登録・stdio接続
  types.ts             # 共有型（TestPlanInput, Iso29119Section 等）
  resources/
    index.ts             # 全resourceを登録
    iso29119.ts           # ISO/IEC/IEEE 29119-3 テスト計画構造の参照データ
  tools/
    index.ts             # 全toolを登録
    generateTestPlan.ts   # generate_test_plan_draft ツール（zodスキーマ + renderTestPlan純関数）
test/
  generateTestPlan.test.ts  # renderTestPlan()の単体テスト
```

## 拡張パターン（将来のテスト設計・レビュー・品質ゲート・メトリクス・改善提案）

新しい機能を追加する際は、`src/resources/<name>.ts` + `src/tools/<name>.ts` を新設し、`resources/index.ts` / `tools/index.ts` にそれぞれ1行の登録を追加するだけでよい。`server.ts` 本体には手を入れない。プラグインローダーやレジストリのような抽象化は、モジュール数が6を超えるあたりまで導入しない。

## 動作確認

- `npm test` でレンダリングロジックの単体テスト
- `npx @modelcontextprotocol/inspector --cli node dist/server.js --method resources/list` / `--method tools/list` / `--method tools/call --tool-name generate_test_plan_draft --tool-arg projectName=... --tool-arg scope=...` でMCPプロトコル経由の動作確認
- 実クライアント（Claude Desktop / Claude Code）のMCP設定に `command: "node"`, `args: ["<path>/dist/server.js"]` を追加して確認
