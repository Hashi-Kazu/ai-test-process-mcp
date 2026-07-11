# ai-test-process-mcp

AIによるテストプロセス支援MCPサーバー。Phase 1はテスト計画書（ISO/IEC/IEEE 29119-3準拠）のドラフト生成のみ。TypeScript + `@modelcontextprotocol/sdk`。

## 必須ルール

- 自明な修正（typo・1〜2行・設定値変更）はmainが直接対応する。不具合修正は原因が自明な場合（例：直前のコミットで壊したことが明らか）のみ自明扱い。原因調査が必要な場合は非自明として即 `planner` を起動する。
- 非自明なタスク（新しいresource/toolの追加、既存ロジックの変更など）はmainが調査せず、`planner` に調査・仕様策定・引き渡し票生成を依頼する。
- mainはplanner票を編集・要約せず実装担当へ渡す。デフォルトは `feature-dev`、ユーザーが明示した場合だけcodex `exec --sandbox workspace-write` を使う。
- `planner`・`feature-dev`はエージェント定義上`model: inherit`のため、Agent起動時に`model`パラメータを明示しない限りmain自身のモデルをそのまま継承する。mainはタスクの複雑さ・調査範囲の広さに応じて、単純な調査や小規模な実装にはSonnet、複雑な設計判断や広い調査が必要なタスクにはOpusというように、起動のたびに`model`を明示指定し、トークン効率が良くなるよう調整する。`acceptance-test`は機械的なテスト実行のみのため`model: haiku`固定のまま変更しない。
- codexを使う場合、planner→実装担当（feature-dev相当）の引き継ぎはcodex内部の自動委譲に任せず、mainが必ず仲介する。plannerの`codex exec`実行が完了したら一度プロセスを終了させ、その出力（票）を使ってmainが改めてトップレベルの`codex exec`を起動する。理由: サンドボックス内部からの自己再帰呼び出し（自分自身をサブプロセスとして再起動）はPATHが制限されnpmのグローバルbinを含まないため、内部委譲に任せるとcodexコマンド未検出で失敗することがある。
- codexを使う場合、`codex exec`が失敗したら原因により対応を分ける。
  - タイムアウトによる失敗: リトライ前に`git status -sb`と`git diff --stat`で変更が既に反映されていないか確認する。反映済みなら再実行しない。未反映なら、より長いタイムアウトで再実行してよい。
  - タイムアウト以外の失敗（コマンド未検出・権限エラー等）: 停止してユーザーに報告する。自動でfeature-dev実装へ切り替えない。
- Codexは並列起動しない。
- 受け入れテストは明示指示時のみ `acceptance-test` を使い、planner票をそのまま渡す。
- テストFAILが実装バグなら報告を添えて実装担当（feature-dev、または明示指定時はCodex）へ戻し、設計・仕様の問題だけplannerへ戻す。
- 新しいresource/toolを追加する際は、`src/resources/<name>.ts` + `src/tools/<name>.ts` を新設し、それぞれの `index.ts` に1行登録を足すパターンに従う（`server.ts` 本体は変更しない）。プラグインローダーやレジストリのような抽象化は追加しない。
- ISO29119関連の知識は `src/resources/iso29119.ts` に構造化データとして保持し、規格本文の逐語転載はしない（著作権上、パラフレーズのみ）。
- ツールのレンダリングロジック（例: `renderTestPlan()`）はMCP登録から独立した純関数として実装し、`test/` でvitestにより単体テストする。
- サブエージェント定義（`.claude/agents/*.md`, `.codex/agents/*.toml`）は同期成果物。直接編集せず、正本 `C:\Claude Code\_agent-templates\*.md` を編集して `sync-agents.ps1` を実行する。

## 必要時に読む文書

- 技術スタック・構成・コマンド: `docs/ai/project-overview.md`
