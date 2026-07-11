# ai-test-process-mcp

AIによるテストプロセス支援MCPサーバー。

**Phase 1（実装済み）**: テスト計画書（ISO/IEC/IEEE 29119-3準拠）のドラフト生成のみ。
**将来構想**: テスト設計・レビュー・品質ゲート・テストメトリクス・改善提案を段階的に追加。

## セットアップ

```bash
npm install
npm run build
```

## 提供する機能

### Resource: `iso29119://test-plan/structure`

ISO/IEC/IEEE 29119-3のテスト計画15章立て（Introduction〜Approvals）を構造化データ（JSON）として公開する。

### Tool: `generate_test_plan_draft`

プロジェクト情報（`projectName`, `scope` は必須。`objectives`, `risks`, `scheduleConstraints`, `team` など任意項目）を入力すると、ISO29119の章立てに沿ったMarkdown形式のテスト計画書ドラフトを生成する。未入力の項目は `_TBD — not provided by caller_` として明示される。

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
npx @modelcontextprotocol/inspector --cli node dist/server.js --method tools/call \
  --tool-name generate_test_plan_draft \
  --tool-arg projectName="ECサイト" \
  --tool-arg scope="決済とログイン機能"
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

## 将来機能の追加方法

新しい機能（テスト設計・レビュー・品質ゲート・テストメトリクス・改善提案）を追加する際は、以下のパターンに従う：

1. `src/resources/<name>.ts` — 必要な参照データ（構造化データ）を定義
2. `src/tools/<name>.ts` — zod入力スキーマ + 純粋なレンダリング関数 + `registerXxxTool()`
3. `src/resources/index.ts` / `src/tools/index.ts` にそれぞれ1行登録を追加
4. `test/<name>.test.ts` でレンダリング関数を単体テスト

`server.ts` 本体は変更不要。プラグインローダーやレジストリのような抽象化は、モジュール数が増えて明示的な登録リストが煩雑になるまで導入しない。

詳細は [AGENTS.md](./AGENTS.md) と [docs/ai/project-overview.md](./docs/ai/project-overview.md) を参照。
