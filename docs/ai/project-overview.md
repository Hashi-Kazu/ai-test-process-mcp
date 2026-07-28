# Project Overview

## 概要

JSTQB/ISTQB Generic Test Process を AI で支援する MCP サーバー。全7工程（Test Planning 〜 Test Completion）のテスト成果物の作成・レビュー・分析を段階的に実装していく構想のうち、現在は Phase 1（Test Planning）として「テスト計画書のドラフト生成（`create_test_plan`）」「テスト計画書レビュー（`review_test_plan`）」、および Test Design 技法エンジン（`design_boundary_values` / `design_equivalence_partitioning`）を実装済み。Phase 2（Test Analysis）として、テストベース（要件・仕様）のレビュー支援 `review_test_basis`、要件分析 `analyze_requirements`、テスト条件抽出 `extract_test_conditions` を実装済み。Phase 3（Test Design）として、テストケース生成 `generate_test_cases`（技法カタログ＋技法選定決定表 resource、決定的な網羅率カウント・未通過網羅対象列挙・主観語/直値埋め込み検査 + 手順組み立ての意味的層の二層構成）、テスト仕様書レビュー `review_test_specification`（テストベースに対する要件ID/テスト条件ID/リスクIDの3系統×双方向カバレッジ・ID表記ゆれ・優先度・前提条件・手順粒度・主観語・網羅基準宣言の決定的検査 + 意味的チェックリスト14項目/改善提案の二層構成）を実装済み。文書構成は JSTQB準拠の15章テンプレートに基づき、JSTQBの知識はパラフレーズした構造化データとして resource に保持する（独立した汎用知識ベースにはしない）。段階的な開発計画は [`docs/roadmap.md`](../roadmap.md) を参照。

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
  types.ts             # 共有型（TestPlanInput, TestPlanTemplate, JstqbGlossary 等）
  resources/
    index.ts                    # 全resourceを登録
    testPlanTemplate.ts         # テスト計画テンプレート（JSTQB準拠15章構造＋固定ボイラープレート）
    jstqbGlossary.ts            # JSTQB用語のパラフレーズ集（jstqb://glossary/core）
    testPlanReviewChecklist.ts  # テスト計画書レビューチェックリスト（testplan://review/checklist）
    ambiguityLexicon.ts         # テスト計画書レビュー用曖昧語レキシコン（testplan://review/ambiguity-lexicon）
    testBasisReviewChecklist.ts # テストベースレビューチェックリスト（testbasis://review/checklist）
    testPerspectiveCatalog.ts   # テスト観点カタログ18カテゴリ（testcondition://perspectives/catalog）＋技法ID→ツール名の対応表
    guidewordDictionary.ts      # ガイドワード辞書（testcondition://guidewords/dictionary）
    riskAnalysisFrame.ts        # リスク分析フレーム（testcondition://risk/frame）
    testTechniqueCatalog.ts     # テスト技法カタログ＋技法選定決定表（testdesign://techniques/catalog）
    testSpecificationReviewChecklist.ts # テスト仕様書レビューチェックリスト14項目（testspec://review/checklist）
    idPopulationAuditCriteria.ts # ID母集団監査の判定区分カタログ6区分（testbasis://population/audit-criteria）
  tools/
    index.ts             # 全toolを登録
    generateTestPlan.ts   # create_test_plan ツール（zodスキーマ + renderTestPlan純関数、日本語15章構成で出力）
    reviewTestPlan.ts     # review_test_plan ツール（構造検査 + 意味的チェックリストの二層構成、renderTestPlanReview純関数）
    reviseTestPlan.ts     # revise_test_plan ツール（欠落章補完・マーカー正規化の機械的修正 + LLM向け書き換え指示、renderTestPlanRevision純関数）
    designBoundaryValues.ts          # design_boundary_values ツール（境界値分析、renderBoundaryValues純関数 + 再利用用 computeBoundaryRows export）
    designEquivalencePartitioning.ts # design_equivalence_partitioning ツール（同値分割、renderEquivalencePartitioning純関数 + 再利用用 listEquivalenceClasses export）
    reviewTestBasis.ts    # review_test_basis ツール（決定的検査 + 意味的チェックリスト/質問状/改善提案、renderTestBasisReview純関数）
    extractTestConditions.ts # extract_test_conditions ツール（4系統からのテスト条件導出・双方向カバレッジ検査、renderTestConditions純関数）
    generateTestCases.ts  # generate_test_cases ツール（決定的層 + 意味的層の二層構成、renderTestCases純関数 + 再利用用 testCaseSpecShape export）
    reviewTestSpecification.ts # review_test_specification ツール（3系統×双方向カバレッジの決定的検査 + 意味的チェックリスト/改善提案、renderTestSpecificationReview純関数）
    auditIdPopulation.ts  # audit_id_population ツール（テストベース定義済みID全量×宣言母集団の突き合わせで未宣言IDを検出、renderIdPopulationAudit純関数）
  prompts/
    index.ts             # 全promptを登録
    testPlanInterview.ts  # test_plan_interview プロンプト（質問形式の収集ガイド + buildInterviewPrompt純関数）
    requirementsAnalysisInterview.ts # requirements_analysis_interview プロンプト（buildRequirementsInterviewPrompt純関数）
    testDesignInterview.ts # test_design_interview プロンプト（buildTestDesignInterviewPrompt純関数）
  testBasisAnalysis.ts   # テストベース決定的検査の共有純関数群（ID重複・未解決参照・プレフィックス逸脱・曖昧語・数量表現）。analyze_requirements からも再利用予定
  testConditionAnalysis.ts # テスト条件の決定的検査の共有純関数群（カバレッジマトリクス・観点未使用・ID重複/欠番・derivedFrom未解決参照・リスクスコア算出）
  testCaseAnalysis.ts    # テストケースの決定的検査の共有純関数群（網羅対象ユニバース構築・網羅率カウント・トレーサビリティ・ID重複/欠番・未解決参照・主観語/空欄/手順粒度/直値埋め込み検査・技法推奨）
  testSpecificationAnalysis.ts # テスト仕様書の決定的検査の共有純関数群（要件ID母集合抽出・derivedFrom双方向カバレッジ・未知リスク/条件参照・ID表記ゆれ・優先度分布・前提条件プレースホルダー・手順と期待結果のバランス・宣言キーワード検査）
  derivedFromRefs.ts     # derivedFrom（要件/リスク/ステークホルダー/ガイドワードの参照種別付き構造化参照）の正規化・照合・表示整形の共有純関数群とzodスキーマ
  idPopulationAnalysis.ts # ID母集団監査の決定的検査の共有純関数群（定義済みID抽出・母集団突き合わせ・未宣言/除外/母集団未定義ID・文書別反映率・母集団間差分）
test/
  generateTestPlan.test.ts        # renderTestPlan()の単体テスト
  reviewTestPlan.test.ts          # renderTestPlanReview()の単体テスト
  ambiguityLexicon.test.ts        # 曖昧語レキシコン構造データの単体テスト
  reviseTestPlan.test.ts          # renderTestPlanRevision()の単体テスト
  testPlanTemplate.test.ts        # テンプレート構造データの単体テスト
  jstqbGlossary.test.ts           # 用語集構造データの単体テスト
  testPlanReviewChecklist.test.ts # チェックリスト構造データの単体テスト
  testPlanInterview.test.ts       # buildInterviewPrompt()の単体テスト
  designBoundaryValues.test.ts          # renderBoundaryValues()の単体テスト
  designEquivalencePartitioning.test.ts # renderEquivalencePartitioning()の単体テスト
  reviewTestBasis.test.ts         # renderTestBasisReview()の単体テスト
  testBasisAnalysis.test.ts       # テストベース決定的検査の共有純関数群の単体テスト
  testBasisReviewChecklist.test.ts # テストベースレビューチェックリスト構造データの単体テスト
  extractTestConditions.test.ts   # renderTestConditions()の単体テスト
  testConditionAnalysis.test.ts   # テスト条件決定的検査の共有純関数群の単体テスト
  testPerspectiveCatalog.test.ts  # テスト観点カタログ構造データの単体テスト
  guidewordDictionary.test.ts     # ガイドワード辞書構造データの単体テスト
  riskAnalysisFrame.test.ts       # リスク分析フレーム構造データの単体テスト
  generateTestCases.test.ts       # renderTestCases()の単体テスト
  testCaseAnalysis.test.ts        # テストケース決定的検査の共有純関数群の単体テスト
  testTechniqueCatalog.test.ts    # テスト技法カタログ構造データの単体テスト
  testDesignInterview.test.ts     # buildTestDesignInterviewPrompt()の単体テスト
  reviewTestSpecification.test.ts # renderTestSpecificationReview()の単体テスト
  testSpecificationAnalysis.test.ts # テスト仕様書決定的検査の共有純関数群の単体テスト
  testSpecificationReviewChecklist.test.ts # テスト仕様書レビューチェックリスト構造データの単体テスト
  idPopulationAnalysis.test.ts    # ID母集団監査決定的検査の共有純関数群の単体テスト
  auditIdPopulation.test.ts       # renderIdPopulationAudit()の単体テスト
  idPopulationAuditCriteria.test.ts # ID母集団監査判定区分カタログ構造データの単体テスト
```

## 拡張パターン（Test Analysis・Test Design ほか各工程の tool 追加）

新しい機能を追加する際は、`src/resources/<name>.ts` + `src/tools/<name>.ts` を新設し、`resources/index.ts` / `tools/index.ts` にそれぞれ1行の登録を追加するだけでよい。resource/tool追加時は `server.ts` 本体には手を入れない。プロンプトのような新カテゴリを足す場合のみ、`registerResources`/`registerTools` と同型の登録関数（`src/prompts/index.ts` の `registerPrompts`）を新設し、`server.ts` に1行だけ追加する。プラグインローダーやレジストリのような抽象化は、モジュール数が増えて明示的な登録リストが煩雑になるまで導入しない。

## 動作確認

- `npm test` でレンダリングロジックの単体テスト
- `npx @modelcontextprotocol/inspector --cli node dist/server.js --method resources/list` / `--method tools/list` / `--method prompts/list` / `--method tools/call --tool-name create_test_plan --tool-arg projectName=... --tool-arg scope=...` / `--method prompts/get --prompt-name test_plan_interview` でMCPプロトコル経由の動作確認
- 実クライアント（Claude Desktop / Claude Code）のMCP設定に `command: "node"`, `args: ["<path>/dist/server.js"]` を追加して確認
