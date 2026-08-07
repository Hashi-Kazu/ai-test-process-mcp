import type { NextToolCatalogEntry } from "../types.js";

export type { NextToolCatalogEntry };

/**
 * 本MCPが登録する全ツール名。`src/tools/*.ts` の `server.registerTool("<name>", ...)` と1対1で対応する。
 * 実在しないツール名の実施済み申告を検出するための照合母集団。
 */
export const registeredToolNames: readonly string[] = [
  "create_test_plan",
  "review_test_plan",
  "revise_test_plan",
  "design_boundary_values",
  "design_equivalence_partitioning",
  "review_test_basis",
  "analyze_requirements",
  "extract_test_conditions",
  "generate_test_cases",
  "review_test_specification",
  "generate_exploratory_charters",
  "audit_id_population",
  "generate_user_story_map",
  "reexpand_threshold_changes",
  "analyze_cause_effect",
  "design_decision_table",
  "design_pairwise",
  "design_config_matrix",
  "design_scenario_flows",
  "design_test_architecture",
  "design_test_data",
  "audit_cross_matrix",
  "audit_basis_contradictions",
  "generate_business_requirement_model",
  "select_regression_suite",
  "analyze_execution_order",
  "audit_deliverable_consistency",
  "analyze_data_flow_timing",
  "derive_test_purposes",
  "audit_test_design_notations",
  "audit_coverage_balance",
];

const DESIGN_FOLLOWUPS: NextToolCatalogEntry[] = [
  {
    toolName: "generate_test_cases",
    when: "always",
    reason: "設計結果のテストケース化が未実施である",
  },
  {
    toolName: "review_test_specification",
    when: "always",
    reason: "設計結果の第三者レビューが未実施である",
  },
];

/**
 * 実行元ツール名 → 後続ツール候補（静的カタログ）。
 * `when` は `nextToolAnalysis.resolveNextTools` に渡されるシグナルキー。`"always"` は常に真。
 */
export const nextToolCatalog: Record<string, NextToolCatalogEntry[]> = {
  create_test_plan: [
    {
      toolName: "review_test_plan",
      when: "always",
      reason: "生成した計画書ドラフトは第三者レビュー未実施である",
    },
    {
      toolName: "revise_test_plan",
      when: "has-unfilled-fields",
      reason: "未記入項目が残っているため修正が必要",
    },
    {
      toolName: "derive_test_purposes",
      when: "always",
      reason: "テスト目的の導出チェーンが未整理である",
    },
  ],
  review_test_plan: [
    {
      toolName: "revise_test_plan",
      when: "has-findings",
      reason: "構造検査で指摘があるため修正が必要",
    },
    {
      toolName: "analyze_requirements",
      when: "always",
      reason: "計画確定後のテスト分析が未実施である",
    },
  ],
  revise_test_plan: [
    {
      toolName: "review_test_plan",
      when: "always",
      reason: "修正後の計画書は再レビュー未実施である",
    },
  ],
  review_test_basis: [
    {
      toolName: "audit_basis_contradictions",
      when: "has-basis-findings",
      reason: "ID重複・未解決参照・曖昧語があり文書間矛盾の疑いがある",
    },
    {
      toolName: "audit_id_population",
      when: "always",
      reason: "文書内ID母集団の宣言漏れ監査が未実施である",
    },
    {
      toolName: "analyze_requirements",
      when: "always",
      reason: "レビュー済みテストベースの要件分析が未実施である",
    },
  ],
  analyze_requirements: [
    {
      toolName: "audit_id_population",
      when: "always",
      reason: "抽出したID母集団の宣言漏れ監査が未実施である",
    },
    {
      toolName: "extract_test_conditions",
      when: "always",
      reason: "要件からのテスト条件抽出が未実施である",
    },
    {
      toolName: "review_test_basis",
      when: "has-id-findings",
      reason: "ID重複・未解決参照があり、テストベース自体のレビューが必要",
    },
  ],
  extract_test_conditions: [
    {
      toolName: "generate_test_cases",
      when: "has-conditions",
      reason: "抽出したテスト条件に対するテストケース生成が未実施である",
    },
    {
      toolName: "generate_exploratory_charters",
      when: "has-high-priority-conditions",
      reason: "優先度「高」の条件があり探索的テストチャーターが必要",
    },
    {
      toolName: "audit_id_population",
      when: "has-uncovered-requirements",
      reason: "未カバー要件IDがあり母集団の突き合わせが必要",
    },
    {
      toolName: "review_test_specification",
      when: "always",
      reason: "テスト条件一覧の第三者レビューが未実施である",
    },
    {
      toolName: "audit_test_design_notations",
      when: "always",
      reason: "テスト条件をFV表・NGT・ゆもつよマトリクスの記法へ落とした際の記法監査が未実施である",
    },
  ],
  generate_test_cases: [
    {
      toolName: "review_test_specification",
      when: "always",
      reason: "生成したテスト仕様の第三者レビューが未実施である",
    },
    {
      toolName: "audit_coverage_balance",
      when: "always",
      reason: "観点カテゴリ・技法・テストレベル別のケース数分布の集計が未実施である",
    },
    {
      toolName: "audit_cross_matrix",
      when: "has-cases",
      reason: "テストケースの交差被覆監査が未実施である",
    },
    {
      toolName: "analyze_execution_order",
      when: "has-preconditions",
      reason: "事前条件を持つケースがあり実行順序の検討が必要",
    },
    {
      toolName: "select_regression_suite",
      when: "has-cases",
      reason: "回帰テスト選択の母集団になり得る",
    },
    {
      toolName: "audit_id_population",
      when: "has-unknown-coverage-refs",
      reason: "未知・裏付けなしの網羅対象IDがあり母集団監査が必要",
    },
  ],
  generate_exploratory_charters: [
    {
      toolName: "review_test_specification",
      when: "always",
      reason: "チャーター一覧の第三者レビューが未実施である",
    },
    {
      toolName: "generate_test_cases",
      when: "has-uncovered-high-priority-conditions",
      reason: "チャーターで拾えていない高優先度条件があり決定的ケース化が必要",
    },
    {
      toolName: "audit_cross_matrix",
      when: "has-charters",
      reason: "チャーターを含めた交差被覆監査が未実施である",
    },
  ],
  audit_id_population: [
    {
      toolName: "extract_test_conditions",
      when: "has-never-declared-ids",
      reason: "一度も宣言されていないIDがありテスト条件の追加抽出が必要",
    },
    {
      toolName: "generate_test_cases",
      when: "has-never-declared-ids",
      reason: "未宣言IDに対応するテストケースが不足している",
    },
    {
      toolName: "review_test_basis",
      when: "has-undefined-population-ids",
      reason: "文書に実在しない宣言IDまたは欠落文書があり、テストベースの確認が必要",
    },
  ],
  review_test_specification: [
    {
      toolName: "generate_test_cases",
      when: "has-spec-findings",
      reason: "決定的検査の指摘に対するテストケース修正が未実施である",
    },
    {
      toolName: "audit_cross_matrix",
      when: "always",
      reason: "交差被覆監査が未実施である",
    },
    {
      toolName: "audit_id_population",
      when: "always",
      reason: "ID母集団監査が未実施である",
    },
  ],
  audit_cross_matrix: [
    {
      toolName: "generate_test_cases",
      when: "has-empty-cells",
      reason: "空セル・未カバー交差があり追加ケースが必要",
    },
    {
      toolName: "review_test_specification",
      when: "always",
      reason: "監査結果を踏まえた仕様レビューが未実施である",
    },
    {
      toolName: "audit_test_design_notations",
      when: "always",
      reason: "FV表・NGT・ゆもつよマトリクスの記法単位での宣言と実体の照合が未実施である",
    },
  ],
  audit_test_design_notations: [
    {
      toolName: "generate_test_cases",
      when: "always",
      reason: "記法へ整理した観点・検証内容のテストケース化が未実施である",
    },
    {
      toolName: "audit_cross_matrix",
      when: "always",
      reason: "記法をまたいだ多軸での交差被覆監査が未実施である",
    },
  ],
  audit_deliverable_consistency: [
    {
      toolName: "revise_test_plan",
      when: "has-referenced-document-conflicts",
      reason: "参照テストベース文書リストの記述が成果物間で食い違っており計画書の修正が必要",
    },
    {
      toolName: "review_test_specification",
      when: "has-consistency-findings",
      reason: "成果物間の不整合が残っており仕様レビューによる確認が必要",
    },
  ],
  audit_coverage_balance: [
    {
      toolName: "generate_test_cases",
      when: "has-zero-count-buckets",
      reason: "割り当て0件の観点カテゴリ・技法・テストレベルがある",
    },
    {
      toolName: "review_test_specification",
      when: "always",
      reason: "分布と用語定義の監査結果を踏まえた仕様レビューが未実施である",
    },
    {
      toolName: "audit_deliverable_consistency",
      when: "has-ungrounded-case-ids",
      reason: "集計と成果物本文でケースIDが食い違っており成果物間整合性の確認が必要",
    },
  ],
  audit_basis_contradictions: [
    {
      toolName: "review_test_basis",
      when: "has-contradictions",
      reason: "矛盾候補があり、テストベースレビューによる確認が必要",
    },
    {
      toolName: "analyze_requirements",
      when: "always",
      reason: "矛盾解消後の要件分析が未実施である",
    },
  ],
  analyze_cause_effect: [
    {
      toolName: "design_decision_table",
      when: "always",
      reason: "構造化した原因・結果のデシジョンテーブル化が未実施である",
    },
    {
      toolName: "generate_test_cases",
      when: "always",
      reason: "導出した論理関係のテストケース化が未実施である",
    },
    {
      toolName: "design_decision_table",
      when: "has-high-findings",
      reason: "high指摘が未解消のまま論理関係を確定できない",
    },
    {
      toolName: "review_test_basis",
      when: "has-ungrounded-nodes",
      reason: "仕様本文から裏付けられない原因・結果があり、テストベース自体の確認が必要",
    },
  ],
  design_boundary_values: [
    ...DESIGN_FOLLOWUPS,
    {
      toolName: "generate_test_cases",
      when: "has-invalid-variables",
      reason: "境界値を算出できない変数があり、そのままではケース化できない",
    },
    {
      toolName: "review_test_basis",
      when: "has-invalid-variables",
      reason: "範囲・刻みの宣言が不正であり、テストベースの確認が必要",
    },
  ],
  design_equivalence_partitioning: [
    ...DESIGN_FOLLOWUPS,
    {
      toolName: "generate_test_cases",
      when: "has-uncovered-classes",
      reason: "生成ケースが踏んでいない同値クラスがある",
    },
    {
      toolName: "audit_cross_matrix",
      when: "has-uncovered-classes",
      reason: "未被覆の同値クラスがあり交差被覆監査が必要",
    },
  ],
  design_decision_table: [
    ...DESIGN_FOLLOWUPS,
    {
      toolName: "generate_test_cases",
      when: "has-high-findings",
      reason: "high指摘が未解消のままではケース化できない",
    },
    {
      toolName: "review_test_basis",
      when: "has-skipped-generation",
      reason: "入力の致命的な指摘により表を生成できておらず、テストベースの確認が必要",
    },
  ],
  design_pairwise: [
    ...DESIGN_FOLLOWUPS,
    {
      toolName: "generate_test_cases",
      when: "has-high-findings",
      reason: "high指摘が未解消のままではケース化できない",
    },
    {
      toolName: "review_test_basis",
      when: "has-skipped-generation",
      reason: "入力の致命的な指摘により表を生成できておらず、テストベースの確認が必要",
    },
  ],
  design_test_data: [
    ...DESIGN_FOLLOWUPS,
    {
      toolName: "generate_test_cases",
      when: "has-high-findings",
      reason: "high指摘が未解消のままではケース化できない",
    },
    {
      toolName: "generate_test_cases",
      when: "has-uncovered-states",
      reason: "未被覆の状態・遷移が残っている",
    },
    {
      toolName: "audit_cross_matrix",
      when: "has-unmeasured-coverage",
      reason: "状態・遷移被覆率が算出できておらず、交差被覆監査で実被覆を数える必要がある",
    },
  ],
  design_config_matrix: [
    ...DESIGN_FOLLOWUPS,
    {
      toolName: "select_regression_suite",
      when: "always",
      reason: "構成軸を踏まえた回帰選択が未実施である",
    },
    {
      toolName: "generate_test_cases",
      when: "has-high-findings",
      reason: "high指摘が未解消のままではケース化できない",
    },
    {
      toolName: "generate_test_cases",
      when: "has-uncovered-combinations",
      reason: "実構成表が踏んでいない水準・ペアが残っている",
    },
    {
      toolName: "audit_cross_matrix",
      when: "has-unmeasured-coverage",
      reason: "実構成表(actualRows)未指定で被覆率が算出できておらず、交差被覆監査で実被覆を数える必要がある",
    },
  ],
  design_scenario_flows: [
    ...DESIGN_FOLLOWUPS,
    {
      toolName: "analyze_execution_order",
      when: "always",
      reason: "シナリオ間の実行順序検討が未実施である",
    },
    {
      toolName: "generate_test_cases",
      when: "has-high-findings",
      reason: "high指摘が未解消のままではケース化できない",
    },
    {
      toolName: "audit_id_population",
      when: "has-unmeasured-feature-coverage",
      reason: "機能ID母集団が未宣言で機能ID被覆率が算出できておらず、母集団監査が必要",
    },
  ],
  design_test_architecture: [
    {
      toolName: "analyze_execution_order",
      when: "always",
      reason: "定義したコンテナの実行順序分析が未実施である",
    },
    {
      toolName: "generate_test_cases",
      when: "always",
      reason: "コンテナに配置するテストケースの生成が未実施である",
    },
    {
      toolName: "generate_test_cases",
      when: "has-high-findings",
      reason: "high指摘が未解消のままではケース配置を確定できない",
    },
    {
      toolName: "review_test_specification",
      when: "has-unassigned-conditions",
      reason: "どのコンテナにも帰属していないテスト条件が残っている",
    },
    {
      toolName: "audit_test_design_notations",
      when: "always",
      reason: "観点階層(NGT)とテストタイプ割り付け(ゆもつよマトリクス)の記法監査が未実施である",
    },
  ],
  select_regression_suite: [
    {
      toolName: "analyze_execution_order",
      when: "always",
      reason: "選択したスイートの実行順序分析が未実施である",
    },
    {
      toolName: "review_test_specification",
      when: "always",
      reason: "選択結果の第三者レビューが未実施である",
    },
  ],
  analyze_data_flow_timing: [
    {
      toolName: "extract_test_conditions",
      when: "has-delay-windows",
      reason: "算出した遅延窓・乖離窓のテスト条件化が未実施である",
    },
    {
      toolName: "generate_test_cases",
      when: "has-uncovered-delay-windows",
      reason: "テスト条件が対応していない遅延窓・乖離窓が残っている",
    },
    {
      toolName: "review_test_basis",
      when: "has-undefined-timing",
      reason: "タイミングが未定義の通信があり、テストベース自体の確認が必要",
    },
  ],
  analyze_execution_order: [
    {
      toolName: "review_test_specification",
      when: "always",
      reason: "実行計画を含む仕様の第三者レビューが未実施である",
    },
    {
      toolName: "audit_cross_matrix",
      when: "always",
      reason: "交差被覆監査が未実施である",
    },
    {
      toolName: "review_test_specification",
      when: "has-high-findings",
      reason: "high指摘が未解消のまま実行計画を確定できない",
    },
    {
      toolName: "review_test_specification",
      when: "has-cycles",
      reason: "循環依存があり実行順序が一意に決まらない",
    },
    {
      toolName: "design_test_architecture",
      when: "has-resource-conflicts",
      reason: "リソース競合区間があり、テストコンテナの分割・実行単位の見直しが必要",
    },
  ],
  generate_user_story_map: [
    {
      toolName: "analyze_requirements",
      when: "always",
      reason: "ストーリーマップに基づく要件分析が未実施である",
    },
    {
      toolName: "extract_test_conditions",
      when: "always",
      reason: "ストーリーからのテスト条件抽出が未実施である",
    },
  ],
  generate_business_requirement_model: [
    {
      toolName: "generate_user_story_map",
      when: "always",
      reason: "業務モデルからのユーザーストーリー整理が未実施である",
    },
    {
      toolName: "extract_test_conditions",
      when: "always",
      reason: "業務モデルからのテスト条件抽出が未実施である",
    },
    {
      toolName: "design_scenario_flows",
      when: "always",
      reason: "業務フローのシナリオ設計が未実施である",
    },
    {
      toolName: "derive_test_purposes",
      when: "always",
      reason: "業務目的からのテスト目的導出が未実施である",
    },
    {
      toolName: "audit_id_population",
      when: "has-id-findings",
      reason: "ID重複・欠番・接頭辞不一致・未解決参照があり母集団監査が必要",
    },
    {
      toolName: "derive_test_purposes",
      when: "has-orphan-elements",
      reason: "目的または業務ユースケースが相互に紐づいておらず、目的の導出チェーンが切れている",
    },
  ],
  reexpand_threshold_changes: [
    {
      toolName: "extract_test_conditions",
      when: "always",
      reason: "再展開した閾値差分のテスト条件化が未実施である",
    },
    {
      toolName: "generate_test_cases",
      when: "always",
      reason: "閾値差分のテストケース化が未実施である",
    },
    {
      toolName: "design_boundary_values",
      when: "always",
      reason: "閾値の境界値設計が未実施である",
    },
  ],
  derive_test_purposes: [
    {
      toolName: "extract_test_conditions",
      when: "has-purposes",
      reason: "決定したテスト目的からのテスト条件抽出が未実施である",
    },
    {
      toolName: "create_test_plan",
      when: "has-purposes",
      reason: "決定したテスト目的の計画書1.1・5.2への反映が未実施である",
    },
    {
      toolName: "audit_cross_matrix",
      when: "has-unlinked-conditions",
      reason: "目的に紐づかないテスト条件があり多軸での交差被覆監査が必要",
    },
  ],
};
