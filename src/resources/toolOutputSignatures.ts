/**
 * 全ツールの出力先頭 H1 見出し署名テーブル。
 * 実施済み申告(`CompletedToolDeclaration`)の `outputExcerpt` に、申告ツール自身の
 * H1 見出しが実在するかを照合するために使う（`src/nextToolAnalysis.ts`）。
 * 値は各ツールの render 関数が実際に push している H1 と完全一致させること。
 */
export interface ToolOutputSignature {
  /** 当該ツールの出力先頭に必ず現れる H1 見出し行 */
  heading: string;
  /** true のとき heading は前方一致で照合する（見出し末尾が動的なツール用） */
  prefix?: boolean;
}

export const toolOutputSignatures: Record<string, ToolOutputSignature> = {
  create_test_plan: { heading: "# テスト計画書:", prefix: true },
  review_test_plan: { heading: "# テスト計画書レビュー結果" },
  revise_test_plan: { heading: "# テスト計画書修正結果" },
  design_boundary_values: { heading: "# 境界値分析結果" },
  design_equivalence_partitioning: { heading: "# 同値分割結果" },
  review_test_basis: { heading: "# テストベースレビュー結果" },
  analyze_requirements: { heading: "# 要件分析結果" },
  extract_test_conditions: { heading: "# テスト条件抽出結果" },
  generate_test_cases: { heading: "# テストケース生成結果" },
  review_test_specification: { heading: "# テスト仕様書レビュー結果" },
  generate_exploratory_charters: { heading: "# 探索的テストチャーター生成結果" },
  audit_id_population: { heading: "# ID母集団監査結果" },
  generate_user_story_map: { heading: "# 利用状況モデリング結果" },
  reexpand_threshold_changes: { heading: "# 閾値変更の影響再展開結果" },
  analyze_cause_effect: { heading: "# 原因結果グラフ分析結果" },
  design_decision_table: { heading: "# デシジョンテーブル設計結果" },
  design_pairwise: { heading: "# ペアワイズ設計結果" },
  design_config_matrix: { heading: "# 構成・環境マトリクス設計結果" },
  design_scenario_flows: { heading: "# ユースケース／シナリオ設計結果" },
  design_test_architecture: { heading: "# テストアーキテクチャ（テストコンテナ）設計結果" },
  design_test_data: { heading: "# テストデータ設計結果" },
  audit_cross_matrix: { heading: "# 多軸マトリクス監査結果" },
  audit_basis_contradictions: { heading: "# テストベース仕様矛盾監査結果" },
  generate_business_requirement_model: { heading: "# 業務ユースケース・要件モデル結果" },
  select_regression_suite: { heading: "# リグレッションスイート選択結果" },
  analyze_execution_order: { heading: "# テスト実行順序・依存関係分析結果" },
  audit_deliverable_consistency: { heading: "# 成果物間整合性監査結果" },
  analyze_data_flow_timing: { heading: "# データフロー・タイミング分析結果" },
  derive_test_purposes: { heading: "# テスト目的の導出結果" },
  audit_test_design_notations: { heading: "# テスト設計記法監査結果" },
};
