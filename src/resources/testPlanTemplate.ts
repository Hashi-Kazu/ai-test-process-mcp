import type { TestPlanTemplate } from "../types.js";

// テスト計画書テンプレートの構造データ。
// 章(level 1)は JSTQB/実務で広く使われるテスト計画書の15章構成に対応し、
// その配下に節(level 2)を持つ。
// required は必須記入とする節（および子を持たない章）を表す。
// fieldKey は generateTestPlan の入力オブジェクトの対応キー（対応する入力があれば）。
export const testPlanTemplate: TestPlanTemplate = {
  templateName: "テスト計画書テンプレート（JSTQB準拠15章構成）",
  sections: [
    { id: "introduction", no: "1", titleJa: "はじめに", level: 1, required: false },
    {
      id: "scope-objectives",
      no: "1.1",
      titleJa: "スコープ・目的",
      level: 2,
      required: true,
      fieldKey: "scope",
      guidance: "本書がカバーするテストのスコープ（対象範囲）と、達成したい目的・目標を記述する。",
    },
    {
      id: "background",
      no: "1.2",
      titleJa: "背景",
      level: 2,
      required: false,
      fieldKey: "background",
      guidance: "テストに至った経緯や現状、懸念事項を記述する。",
    },
    {
      id: "references-testbase",
      no: "1.3",
      titleJa: "参考資料・テストベース",
      level: 2,
      required: false,
      fieldKey: "references",
      guidance: "テスト設計の根拠となる資料（仕様書・要件定義書等）および参考文献を列挙する。",
    },
    {
      id: "assumptions-constraints",
      no: "1.4",
      titleJa: "前提条件・制約",
      level: 2,
      required: false,
      fieldKey: "assumptions",
      guidance: "テスト実施の前提条件と制限事項を記述する。",
    },
    {
      id: "glossary",
      no: "1.5",
      titleJa: "用語集",
      level: 2,
      required: false,
      fieldKey: "glossary",
      guidance: "本書で用いる用語とその定義を記述する。",
    },

    {
      id: "test-items",
      no: "2",
      titleJa: "テスト対象",
      level: 1,
      required: true,
      fieldKey: "testItems",
      guidance: "テスト対象となるアイテム（機能・モジュール・システム等）を列挙する。",
    },

    {
      id: "features-to-be-tested",
      no: "3",
      titleJa: "テスト対象機能",
      level: 1,
      required: true,
      fieldKey: "featuresToTest",
      guidance: "テスト対象とする機能を列挙する。",
    },

    {
      id: "features-not-to-be-tested",
      no: "4",
      titleJa: "テスト対象外機能",
      level: 1,
      required: false,
      fieldKey: "featuresNotToTest",
      guidance: "テスト対象外とする機能を列挙する。",
    },

    { id: "approach", no: "5", titleJa: "テスト方針", level: 1, required: false },
    {
      id: "test-levels",
      no: "5.1",
      titleJa: "テストレベル",
      level: 2,
      required: true,
      fieldKey: "testLevels",
      guidance: "対象とするテストレベル（コンポーネントテスト・統合テスト・システムテスト・受け入れテスト等）を記述する。",
    },
    {
      id: "test-types",
      no: "5.2",
      titleJa: "テストタイプ",
      level: 2,
      required: true,
      fieldKey: "selectedTestTypes",
      guidance: "実施するテストタイプ（機能テスト・非機能テストなど）をカタログから選定する。",
    },
    {
      id: "test-techniques",
      no: "5.3",
      titleJa: "テスト技法",
      level: 2,
      required: false,
      fieldKey: "testTechniques",
      guidance: "テストタイプごとに用いるアプローチ・技法（テスト条件・テスト観点の識別方針を含む）を記述する。",
    },

    { id: "item-pass-fail-criteria", no: "6", titleJa: "合否基準", level: 1, required: false },
    {
      id: "start-end-criteria",
      no: "6.1",
      titleJa: "開始・終了基準",
      level: 2,
      required: false,
      fieldKey: "startCriteria",
      guidance: "テストの開始基準（エントリー基準）と終了基準（イグジット基準）を記述する。",
    },
    {
      id: "result-judgment",
      no: "6.2",
      titleJa: "合否判定基準",
      level: 2,
      required: true,
      fieldKey: "passFailCriteria",
      guidance: "テスト実施結果の合否判定基準を記述する。",
    },
    {
      id: "completion-criteria",
      no: "6.3",
      titleJa: "完了基準",
      level: 2,
      required: false,
      fieldKey: "completionCriteria",
      guidance: "テストが完了したとみなす基準を記述する。",
    },
    {
      id: "incident-criteria",
      no: "6.4",
      titleJa: "インシデント判定基準",
      level: 2,
      required: false,
      guidance: "検出したインシデントのランク判定基準を記述する。",
    },
    {
      id: "question-priority",
      no: "6.5",
      titleJa: "質問事項重要度基準",
      level: 2,
      required: false,
      guidance: "質問事項の重要度の判定基準を記述する。",
    },
    {
      id: "slo-targets",
      no: "6.6",
      titleJa: "品質目標(SLO)・実施前合格基準",
      level: 2,
      required: false,
      fieldKey: "sloTargets",
      guidance: "テスト実施前に合意する品質目標(SLO)と、測定可能な合格基準(指標・比較演算・閾値・単位)を記述する。",
    },

    {
      id: "suspension-resumption-criteria",
      no: "7",
      titleJa: "中断・再開基準",
      level: 1,
      required: true,
      fieldKey: "suspensionCriteria",
      guidance: "テストを中断する基準（中断基準）と、再開する基準（再開基準）を記述する。",
    },

    {
      id: "test-deliverables",
      no: "8",
      titleJa: "成果物",
      level: 1,
      required: true,
      fieldKey: "deliverables",
      guidance: "テストで作成する成果物を列挙する。",
    },

    { id: "testing-tasks", no: "9", titleJa: "テスト作業", level: 1, required: false },
    {
      id: "testing-tasks-flow",
      no: "9.1",
      titleJa: "テスト作業の流れ",
      level: 2,
      required: false,
      guidance: "テスト作業全体の流れ（準備〜実施〜完了）を記述する。",
    },
    {
      id: "execution-record",
      no: "9.2",
      titleJa: "テスト実行時の記録",
      level: 2,
      required: false,
      guidance: "テスト実行時に記録すべき情報を記述する。",
    },
    {
      id: "collected-metrics",
      no: "9.3",
      titleJa: "収集メトリクス",
      level: 2,
      required: false,
      fieldKey: "metricsNote",
      guidance: "テスト中に収集・分析するメトリクスを記述する。",
    },
    {
      id: "monitoring-plan",
      no: "9.4",
      titleJa: "モニタリング計画",
      level: 2,
      required: false,
      fieldKey: "monitoringPlan",
      guidance: "テスト実施期間中のレビュー・進捗確認のタイミングと、その時点で確認する指標・参加者を記述する。",
    },

    { id: "environmental-needs", no: "10", titleJa: "環境", level: 1, required: false },
    {
      id: "env-requirements",
      no: "10.1",
      titleJa: "テスト環境要件",
      level: 2,
      required: true,
      fieldKey: "environment",
      guidance: "テストに必要な環境（ハード・ソフト・ツール等）を記述する。",
    },
    {
      id: "testdata-requirements",
      no: "10.2",
      titleJa: "テストデータ要件",
      level: 2,
      required: true,
      fieldKey: "testDataRequirements",
      guidance: "テストに必要なデータの要件・準備方針を記述する。",
    },

    { id: "responsibilities", no: "11", titleJa: "責任分担", level: 1, required: true },
    {
      id: "test-org",
      no: "11.1",
      titleJa: "テスト体制",
      level: 2,
      required: true,
      fieldKey: "team",
      guidance: "テスト実施体制（役割・担当）を記述する。",
    },
    {
      id: "stakeholders",
      no: "11.2",
      titleJa: "ステークホルダー",
      level: 2,
      required: false,
      fieldKey: "stakeholders",
      guidance:
        "関係するステークホルダーと連絡先を記述する。あわせて testcondition://persona/journey-frame の" +
        "ステークホルダー2軸評価（影響力 SW-INFLUENCE ／ 関心度 SW-INTEREST）に基づく評価値・スコア・" +
        "扱いクラス（重点／通常／参考）を列として持たせ、重視対象とその根拠が読み取れる表にする。",
    },

    {
      id: "staffing-and-training-needs",
      no: "12",
      titleJa: "要員・教育",
      level: 1,
      required: false,
      guidance: "追加で必要な要員や、実施に必要なトレーニングを記述する。",
    },

    { id: "schedule", no: "13", titleJa: "スケジュール", level: 1, required: false },
    {
      id: "test-period",
      no: "13.1",
      titleJa: "テスト期間",
      level: 2,
      required: true,
      fieldKey: "testPeriod",
      guidance: "テスト全体の実施期間を記述する。",
    },
    {
      id: "schedule-plan",
      no: "13.2",
      titleJa: "スケジュール",
      level: 2,
      required: true,
      fieldKey: "scheduleConstraints",
      guidance: "主要な日程・マイルストーンを記述する。",
    },
    {
      id: "execution-order-plan",
      no: "13.3",
      titleJa: "実行順序・依存関係",
      level: 2,
      required: false,
      fieldKey: "executionOrderPlan",
      guidance:
        "テストコンテナ／スイート間の依存関係・実行順序・クリティカルパス・必要リソースを記述する。" +
        "analyze_execution_order の出力を転記してよい。",
    },

    { id: "risks-and-contingencies", no: "14", titleJa: "リスク・対策", level: 1, required: false },
    {
      id: "product-risk",
      no: "14.1",
      titleJa: "プロダクトリスク",
      level: 2,
      required: true,
      fieldKey: "risks",
      guidance: "プロダクト品質に関わるリスクと、その影響・対策を記述する。",
    },
    {
      id: "project-risk",
      no: "14.2",
      titleJa: "プロジェクトリスク",
      level: 2,
      required: false,
      guidance: "プロジェクト遂行上のリスクと対策を記述する。",
    },

    { id: "approvals", no: "15", titleJa: "承認", level: 1, required: false },
    {
      id: "approvers",
      no: "15.1",
      titleJa: "承認者",
      level: 2,
      required: false,
      fieldKey: "approvers",
      guidance: "本計画書の承認者を列挙する。",
    },
    {
      id: "notes",
      no: "15.2",
      titleJa: "特記事項",
      level: 2,
      required: false,
      fieldKey: "notes",
      guidance: "その他、特記すべき事項を記述する。",
    },
  ],
};

// --- 固定ボイラープレート（入力に依存せず常に出力する共通リファレンス） ---

// 5.2 テストタイプ・カタログ
export const testTypeCatalog: { name: string; description: string }[] = [
  { name: "機能テスト", description: "機能が期待どおりの結果を返すか確かめる" },
  { name: "シナリオテスト", description: "実際の利用手順に沿って操作し利用できるか確かめる" },
  { name: "性能テスト", description: "処理時間などパフォーマンスを測定" },
  { name: "ロードテスト", description: "様々な状況で動作させ期待どおりか確かめる" },
  { name: "ストレステスト", description: "限界もしくはそれ以上の負荷を与え動作を確かめる" },
  { name: "ユーザビリティテスト", description: "理解されやすく使いやすく魅力的か確かめる" },
  { name: "ローカライゼーションテスト", description: "異なる言語に変換されても機能するか確認" },
  { name: "保守性テスト", description: "欠陥修正や機能追加のしやすさを確かめる" },
  { name: "信頼性テスト", description: "要件で決めた回数・期間・条件で稼働できるか確かめる" },
  { name: "移植性テスト", description: "別ハード・環境への移植のしやすさを確かめる" },
];

// 6.2 判定ステータス定義
export const judgmentStatusDefinitions: { status: string; description: string }[] = [
  { status: "OK", description: "問題なくテストが完了した項目" },
  { status: "NG", description: "インシデントが検出された項目" },
  { status: "QA", description: "QA表で質問中の項目" },
  { status: "NT", description: "テストを実施しない項目（同義：テスト対象外）" },
  {
    status: "N/A",
    description: "テスト実施ができない項目（同義：不可・機能削除・Drop等）",
  },
  {
    status: "保留",
    description: "最終的には実施可能だが現状は何らかの事情で実施できない項目",
  },
];

// 6.4 インシデントランク
export const incidentRankDefinitions: { rank: string; description: string }[] = [
  {
    rank: "ランクA",
    description:
      "基本操作で機能が正常に動作しない／仕様・マニュアルと異なる動作／ユーザーが回避操作不能（フリーズ・リセット等）",
  },
  {
    rank: "ランクB",
    description:
      "ある条件で正常に動作しない／通常想定される性能を大きく下回る／ユーザーが回避操作可能",
  },
  {
    rank: "ランクC",
    description: "特殊条件で機能が正常に動作しない／性能をやや下回る／仕様と区別がつかない",
  },
  { rank: "ランクD", description: "機能・性能・表示系への要望や改良提案" },
];

// 6.5 質問事項重要度
export const questionPriorityDefinitions: { level: string; description: string }[] = [
  { level: "高", description: "テスト続行に支障があり、早急な回答が必要（未回答が●件以上）" },
  { level: "中", description: "テストは続行できるが回答が必要（未回答が○件以上）" },
  { level: "低", description: "確認事項レベルで、続行に支障がない" },
];

// 9.2 テスト実行時の記録
export const executionRecordNotes: string[] = [
  "実行ログとして、実施日・実施者・実行環境・判定結果を記録する。",
  "NG時はインシデントを発行し、管理IDを記録する。",
  "再テストOK時は該当インシデントを更新する。",
];

// 9.3 標準メトリクス
export const standardMetrics: { name: string; items: string }[] = [
  { name: "インシデント曲線", items: "テスト実施日／不具合件数／未解決件数" },
  { name: "インシデント機能別・パレート図", items: "機能別不具合件数／累積割合" },
  { name: "インシデント発生率", items: "テスト項目ごとの実施件数／不具合件数" },
  { name: "不具合検出率", items: "検出済不具合総数／テストケース総数" },
  { name: "不具合収束状況", items: "期間内検出済不具合数／期間内テスト実施時間" },
];

// 8 成果物・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const deliverableTemplateExamples: string[] = [
  "テスト計画書",
  "テスト仕様書・テストケース一覧",
  "テスト実行結果報告書",
  "インシデント（不具合）管理表",
  "テスト完了報告書",
];

// 11.1 テスト体制・ロール参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const testOrgRoleTemplateExamples: string[] = [
  "テストマネージャー: テスト全体の計画・進捗管理・報告",
  "テストリーダー: テスト設計・実行の指揮、レビュー",
  "テスト担当者: テストケース作成・実行・結果記録",
  "品質保証（QA）担当: 品質基準の策定・レビュー",
];

// 1.1 スコープ・目的・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const scopeObjectivesTemplateExamples: string[] = [
  "スコープ: 本リリースで変更・追加された機能一式（対象外は4章に明記）",
  "目的: リリース判定に必要な品質情報を収集し、合否判定基準に基づき出荷可否を判断する",
  "目的: 主要ユースケースにおいて重大な不具合が残存しないことを確認する",
];

// 2 テスト対象・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const testItemsTemplateExamples: string[] = [
  "対象システム・バージョン: 例）会員管理システム v2.3",
  "対象コンポーネント: 例）会員登録API、決済連携バッチ",
  "対象環境: 例）本番相当のステージング環境",
];

// 3 テスト対象機能・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const featuresToBeTestedTemplateExamples: string[] = [
  "会員登録・退会機能",
  "ログイン・認証機能（多要素認証含む）",
  "決済処理機能（クレジットカード・コンビニ決済）",
];

// 5.1 テストレベル・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const testLevelsTemplateExamples: string[] = [
  "コンポーネントテスト: 開発者が単体モジュール単位で実施",
  "統合テスト: モジュール間のインタフェースを確認",
  "システムテスト: エンドツーエンドでシステム全体の振る舞いを確認",
  "受け入れテスト: 発注者・利用者視点で受け入れ可否を判断",
];

// 5.2 テストタイプ・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const testTypesTemplateExamples: string[] = [
  "機能テスト: 主要業務フローの正常系・異常系を確認",
  "性能テスト: ピーク時アクセスにおける応答時間を確認",
  "セキュリティテスト: 認証・認可・入力値検証の脆弱性を確認",
];

// 6.2 合否判定基準・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const resultJudgmentTemplateExamples: string[] = [
  "OK: 期待結果と実結果が一致し、問題なくテストが完了した項目",
  "NG: 期待結果と異なる結果が発生し、インシデントを起票した項目",
  "保留: 環境や外部要因により現時点で判定できない項目",
];

// 7 中断・再開基準・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const suspensionResumptionTemplateExamples: string[] = [
  "中断基準: ランクAのインシデントが未解決のまま次工程に影響する場合",
  "中断基準: テスト環境の重大な障害によりテスト続行が困難な場合",
  "再開基準: 中断理由となった問題が解消され、再テストで正常動作を確認した場合",
];

// 10.1 テスト環境要件・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const envRequirementsTemplateExamples: string[] = [
  "ハードウェア: 本番相当のスペックを持つ検証用サーバー",
  "ソフトウェア: OS・ミドルウェア・ブラウザの対応バージョン一覧",
  "ツール: テスト管理ツール、負荷試験ツール、モニタリングツール",
];

// 10.2 テストデータ要件・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const testDataRequirementsTemplateExamples: string[] = [
  "正常系データ: 標準的な入力値を満たすテストデータ一式",
  "異常系データ: 境界値・不正値・欠損値を含むテストデータ",
  "個人情報を含む場合はマスキング・匿名化したデータを使用する",
];

// 11 責任分担・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const responsibilitiesTemplateExamples: string[] = [
  "テスト計画・進捗管理: テストマネージャーが担当",
  "テスト設計・実行: テストリーダー・テスト担当者が担当",
  "品質基準の策定・レビュー: QA担当が担当",
];

// 13.1 テスト期間・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const testPeriodTemplateExamples: string[] = [
  "テスト準備期間: 20XX/XX/XX〜20XX/XX/XX",
  "テスト実施期間: 20XX/XX/XX〜20XX/XX/XX",
  "回帰テスト期間: 20XX/XX/XX〜20XX/XX/XX",
];

// 13.2 スケジュール・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const schedulePlanTemplateExamples: string[] = [
  "テスト計画書レビュー完了: 20XX/XX/XX",
  "テストケースレビュー完了: 20XX/XX/XX",
  "テスト実施完了（1次）: 20XX/XX/XX",
  "リリース判定会議: 20XX/XX/XX",
];

// 14.1 プロダクトリスク・参考候補（一般的な例示。プロジェクトに応じて修正が必要）
export const productRiskTemplateExamples: string[] = [
  "決済連携部分の仕様変更が多く、リグレッションリスクが高い",
  "外部API依存機能は、連携先の仕様変更・障害により影響を受けるリスクがある",
  "新規実装領域はテスト経験が浅く、見落としリスクがある",
];
