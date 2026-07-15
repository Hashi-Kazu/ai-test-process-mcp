# 開発ロードマップ

本プロジェクトを「**JSTQB/ISTQB Generic Test Process を AI で支援する MCP**」として育てるための段階的な開発計画。

## ビジョン

JSTQB（ISTQB準拠）の Generic Test Process 全7工程を対象に、各工程のテスト成果物の**作成・レビュー・分析**を MCP の tool / resource / prompt として段階的に提供する。テスト管理ツールの操作を目的とせず、AI による品質向上と効率化の支援に特化する。

```text
1. Test Planning
2. Test Monitoring and Control
3. Test Analysis
4. Test Design
5. Test Implementation
6. Test Execution
7. Test Completion
```

文書構成は ISO/IEC/IEEE 29119-3 に準拠する（JSTQB/ISTQB シラバス自体が文書構成については ISO 29119-3 を参照しており、両者は矛盾しない）。

### 提供価値

- **品質向上**: レビュー支援・観点漏れ防止・リスク分析・ベストプラクティス提示・JSTQB/ISTQB シラバスに基づくアドバイス
- **効率化**: ドキュメント生成・テストケース生成・テストデータ生成・レポート生成・分析の自動化

### 目指す姿

- 初学者でも品質の高い成果物を作成できる
- ベテランのレビュー負荷を削減できる
- テスト資産を標準化できる

## 全フェーズ共通の方針

- **スモールステップ**: 1ステップ = 1 PRサイズ。既存の拡張パターン（`src/resources/<name>.ts` + `src/tools/<name>.ts` を新設し、各 `index.ts` に1行登録。`server.ts` は変更しない）を厳守する。
- **JSTQB準拠の実現方式**: 文書の章構成は ISO/IEC/IEEE 29119-3 を維持し、JSTQB 用語・シラバスの観点を知識リソース（`jstqb://glossary/core` 等）として追加・整合させる。既存機能を壊さずに積み上げる。
- **レビュー系toolの二層構成**: 機械的チェック（章の欠落、必須項目の未記入、ID重複などの構造検査）は純関数で決定的に実施し vitest で単体テストする。意味的レビュー（内容の妥当性判断）は JSTQB 準拠チェックリストを tool 出力 / resource として返し、呼び出し側の LLM が適用する。
- **生成系toolの3点セット構成**: 生成系は resource（テンプレート構造データ）+ tool（zodスキーマ + 純関数レンダリング）+ interview prompt（対話的コンテキスト収集）で構成する（`create_test_plan` / `test_plan_interview` と同型）。
- **著作権**: JSTQB用語集・シラバス・ISO 29119 とも逐語転載せず、パラフレーズのみを構造化データとして保持する（`src/resources/iso29119.ts` と同じルール）。
- **進め方**: 各ステップの着手時は `AGENTS.md` のルール通り、planner による調査・仕様策定・引き渡し票生成を経て実装担当（feature-dev）へ引き継ぐ。

## フェーズ計画

構想上の Tool 一覧（下記「将来構想: Tool 一覧」）のうち、**計画 → 分析 → 設計 → 全工程** の順に実装する。

### Phase 1: Test Planning（進行中）

テスト計画書の作成・レビュー・修正支援。Phase 1 完了 = v1.0 の目安。

| tool | 内容 | 状態 |
| --- | --- | --- |
| `create_test_plan` | ISO/IEC/IEEE 29119-3 準拠15章構成の日本語テスト計画書ドラフト生成（旧名 `gen_test_plan`） | 完了 |
| `review_test_plan` | JSTQB観点でのテスト計画書レビュー（構造検査 + 意味的チェックリストの二層構成） | 完了 |
| `revise_test_plan` | レビュー結果・修正指示を反映したテスト計画書の修正支援 | **未着手（次のステップ）** |

`revise_test_plan` の設計方針（着手時に planner が詳細化）:

- 入力: 既存のテスト計画書 Markdown + 修正指示（`review_test_plan` の指摘やユーザーの変更要望）。
- 二層構成: 機械的に決定できる部分（章構成の補完、未記入マーカーの整理など）は純関数で処理し、内容の書き換えは呼び出し側 LLM への指示形式で返す。

### Phase 2: Test Analysis

要件・仕様（テストベース）の分析支援。

| tool | 内容 |
| --- | --- |
| `analyze_requirements` | 要件分析・品質特性抽出・曖昧さ検出 |
| `extract_test_conditions` | テストベースからのテスト条件導出 |
| `review_test_basis` | テストベース（要件・仕様）のレビュー |

### Phase 3: Test Design

テストケースの生成とテスト仕様書のレビュー。

| tool | 内容 |
| --- | --- |
| `generate_test_cases` | テスト技法の推奨とテストケース生成 |
| `review_test_specification` | テスト設計仕様・テストケース仕様のレビュー（テストベース突き合わせ） |

`review_test_specification` の設計方針（旧ロードマップ Phase 4 から引き継ぎ）:

- テスト仕様書単体の形式チェックではなく、「**テストベースに対して仕様書が十分か**」を評価軸の中心に置く。
- **テストベースのフォーマットは任意**。実務上のテストベースは Excel・Word・Markdown・プレーンテキストなど多様であるため、特定のフォーマットや章立てを仮定しない。バイナリ形式は呼び出し側（MCPクライアント / LLM）がテキスト化して渡す責務とし、tool 側は「フォーマット不問の自由テキスト」として受け取る。
- 入力はテストベースのテキストとテスト仕様書のテキストの2つ（いずれも必須）。二層構成:
  - 構造検査（決定的）: テストケースIDの重複、期待結果の空欄、要件ID（テストベース側にID表記がある場合）とテストケースの対応表を機械的に構築し、どのテストケースからも参照されていない要件IDを未カバー候補として列挙。要件IDの抽出はパターンマッチベースとし、既定パターンで拾えない場合に備え任意入力で要件IDパターンを指定できるようにする。
  - 意味的チェック: 要件IDが明示されていない・表記が揺れているテストベースについても、呼び出し側 LLM がチェックリストに沿って要件と仕様書を突き合わせ、カバレッジ漏れ・期待結果の不整合を指摘できる形式で返す。
- チェックリスト resource: テストベースに対するテスト条件の網羅性、トレーサビリティ、期待結果の明確さと整合、テスト技法の適切さ、事前条件・手順の実行可能性など。

### Phase 4: Generic Test Process 全体への拡張

残る4工程（Monitoring and Control / Implementation / Execution / Completion）へ拡張する。着手時に再計画。

## 将来構想: Tool 一覧

Generic Test Process の各工程で最終的に提供したい tool 群。Phase 1〜3 のスコープ外は着手時に取捨選択・再計画する。

| 工程 | tool |
| --- | --- |
| Test Planning | `create_test_plan` / `review_test_plan` / `revise_test_plan` / `estimate_test_effort` / `analyze_test_risk` |
| Test Monitoring and Control | KPI分析 / 進捗分析 / リスク監視 / テスト完了率 |
| Test Analysis | `analyze_requirements` / `extract_test_conditions` / `detect_requirement_ambiguity` / `review_test_basis` |
| Test Design | `generate_test_cases` / `recommend_test_techniques` / `review_test_specification` / `analyze_coverage` |
| Test Implementation | `generate_test_data` / `generate_test_procedure` / `generate_test_suite` |
| Test Execution | `analyze_test_results` / `analyze_logs` / `classify_defects` |
| Test Completion | `generate_test_summary` / `evaluate_quality` / `generate_retrospective` |

## 将来構想: 連携・基盤

- Jira・GitHub Issues・Azure DevOps との連携
- Playwright/Cypress など自動テストとの連携
- テストメトリクスの可視化
- プロジェクト横断でのナレッジ蓄積
- 組織標準やテンプレートのカスタマイズ対応
- RAG による社内テスト標準・過去資産の参照
- テスト状況報告書・テスト完了報告書の生成（29119-3 のテスト状況報告・完了報告に相当）
- レビュー用 interview prompt（`test_plan_interview` のレビュー版。レビュー対象・観点を対話的に絞り込む）

## 実装履歴

| ステップ | 内容 | 状態 |
| --- | --- | --- |
| 旧Phase 1 | テスト計画書ドラフト生成 `gen_test_plan`（29119-3準拠15章） | 完了（v0.3.0） |
| 旧Phase 2 | JSTQB用語基盤（`jstqb://glossary/core` resource + テンプレート用語整合） | 完了（v0.4.0） |
| 旧Phase 3 | テスト計画書レビュー tool `review_test_plan` | 完了（v0.5.0） |
| 構想再編 | Generic Test Process 構想へのロードマップ再編 + `gen_test_plan` → `create_test_plan` リネーム | 完了（v0.6.0） |
| Phase 1 残 | `revise_test_plan` | 未着手 |
| Phase 2 | Test Analysis（analyze_requirements / extract_test_conditions / review_test_basis） | 未着手 |
| Phase 3 | Test Design（generate_test_cases / review_test_specification） | 未着手 |
| Phase 4 | 全工程への拡張 | 未計画 |
