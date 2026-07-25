import type { TestTechniqueCatalog } from "../types.js";

// テストベースの特徴からテスト技法を選ぶ際の考え方を、決定的に扱えるよう
// 独自に整理したカタログ＋選定決定表。名称・定義文・選定根拠はすべて自作の
// パラフレーズであり、JSTQBシラバスや書籍・コンテスト成果物の逐語転載ではない。
export const testTechniqueCatalog: TestTechniqueCatalog = {
  name: "テスト技法カタログ＋技法選定決定表（自作整理）",
  note:
    "広く知られたテスト技法の考え方を参考に、テストベースの特徴から技法を選ぶ判断を独自に整理したものであり、" +
    "外部文献の逐語転載や特定の外部基準への適合を主張するものではない。",
  entries: [
    {
      id: "TTK-01",
      techniqueId: "boundary-value-analysis",
      nameJa: "境界値分析",
      basisCharacteristics: ["入力が範囲を持つ"],
      coverageCriteria: [
        {
          id: "TTC-COV-01",
          nameJa: "境界被覆",
          definition: "各変数の下限・上限それぞれについて、境界の内側・境界・外側の値がケースとして列挙されている割合。",
        },
      ],
      requiredInputs: ["変数名", "下限・上限", "型(int/decimal)", "刻み幅"],
      engineToolName: "design_boundary_values",
      deterministic: true,
      selectionRationale: "対象の入力が数値・日付など範囲を持ち、範囲の内外で判定が切り替わる場合に選ぶ。",
    },
    {
      id: "TTK-02",
      techniqueId: "equivalence-partitioning",
      nameJa: "同値分割",
      basisCharacteristics: ["入力が分類を持つ"],
      coverageCriteria: [
        {
          id: "TTC-COV-02",
          nameJa: "全クラス被覆",
          definition: "宣言した有効/無効の同値クラスのうち、代表値でケース化されたクラスの割合。",
        },
      ],
      requiredInputs: ["変数名", "有効同値クラス(ラベル・代表値)", "無効同値クラス(ラベル・代表値)"],
      engineToolName: "design_equivalence_partitioning",
      deterministic: true,
      selectionRationale: "対象の入力が区分・分類で扱われ、区分内であれば結果が変わらないとみなせる場合に選ぶ。",
    },
    {
      id: "TTK-03",
      techniqueId: "decision-table",
      nameJa: "デシジョンテーブル(原因結果グラフを含む)",
      basisCharacteristics: ["複数条件の論理積で振る舞いが変わる"],
      coverageCriteria: [
        {
          id: "TTC-COV-03",
          nameJa: "条件組合せ被覆",
          definition: "宣言した条件項目の組み合わせ(ルール)のうち、いずれかのケースで通過した組み合わせの割合。",
        },
      ],
      requiredInputs: ["条件項目とその取り得る値", "各組み合わせに対応するアクション/期待結果"],
      deterministic: false,
      selectionRationale: "複数条件の論理積・論理和で振る舞いが変わり、条件の組み合わせ漏れが起きやすい場合に選ぶ。",
      note:
        "本 MCP では条件組合せの自動生成エンジンは未実装。additionalCoverageTargets で組み合わせ(ルール)ごとの" +
        "網羅対象を宣言し、決定的層ではその充足状況のみをカウントする運用とする。",
    },
    {
      id: "TTK-04",
      techniqueId: "state-transition",
      nameJa: "状態遷移テスト",
      basisCharacteristics: ["状態が多い・順序依存"],
      coverageCriteria: [
        {
          id: "TTC-COV-04",
          nameJa: "0/1スイッチ被覆",
          definition: "宣言した状態遷移(イベント・ガード)のうち、いずれかのケースで一度は通過した遷移の割合。",
        },
      ],
      requiredInputs: ["状態一覧(初期状態を含む)", "遷移一覧(遷移元・遷移先・イベント・ガード)"],
      engineToolName: "generate_test_cases",
      deterministic: true,
      selectionRationale: "業務上の状態が複数あり、操作の順序によって許される/許されない遷移がある場合に選ぶ。",
    },
    {
      id: "TTK-05",
      techniqueId: "pairwise",
      nameJa: "ペアワイズ",
      basisCharacteristics: ["因子が多く組合せ爆発"],
      coverageCriteria: [
        {
          id: "TTC-COV-05",
          nameJa: "ペア被覆",
          definition: "宣言した因子間のすべての水準ペアのうち、いずれかのケースに現れたペアの割合。",
        },
      ],
      requiredInputs: ["因子一覧", "各因子の水準一覧"],
      deterministic: false,
      selectionRationale: "因子数が多く全組み合わせのテストが現実的でないが、因子間の相互作用を確認したい場合に選ぶ。",
      note: "ペア表の自動生成エンジンは未実装。additionalCoverageTargets でペア単位の網羅対象を宣言する運用とする。",
    },
    {
      id: "TTK-06",
      techniqueId: "use-case-based",
      nameJa: "ユースケーステスト",
      basisCharacteristics: ["業務フローが長い"],
      coverageCriteria: [
        {
          id: "TTC-COV-06",
          nameJa: "主要・代替フロー被覆",
          definition: "宣言したユースケースの基本フロー・代替フロー・例外フローのうち、ケース化された割合。",
        },
      ],
      requiredInputs: ["アクター", "基本フロー", "代替フロー・例外フロー"],
      deterministic: false,
      selectionRationale: "アクターの目的達成までの一連の操作単位で確認したい業務フローがある場合に選ぶ。",
      note: "フロー自動生成エンジンは未実装。additionalCoverageTargets でフロー単位の網羅対象を宣言する運用とする。",
    },
    {
      id: "TTK-07",
      techniqueId: "scenario-based",
      nameJa: "シナリオテスト",
      basisCharacteristics: ["業務フローが長い"],
      coverageCriteria: [
        {
          id: "TTC-COV-07",
          nameJa: "主要・代替フロー被覆",
          definition: "宣言した利用シナリオ(複数機能をまたぐ一連の操作)のうち、ケース化された割合。",
        },
      ],
      requiredInputs: ["登場人物・前提", "一連の操作手順", "途中で起こり得る分岐"],
      deterministic: false,
      selectionRationale: "複数機能・複数画面をまたぐ現実的な利用シナリオ全体の整合を確認したい場合に選ぶ。",
      note: "シナリオ自動生成エンジンは未実装。additionalCoverageTargets でシナリオ単位の網羅対象を宣言する運用とする。",
    },
    {
      id: "TTK-08",
      techniqueId: "data-lifecycle-test",
      nameJa: "CRUD／データライフサイクルテスト",
      basisCharacteristics: ["データの生成〜消滅"],
      coverageCriteria: [
        {
          id: "TTC-COV-08",
          nameJa: "状態遷移被覆",
          definition: "宣言したデータの生成・更新・削除・アーカイブ等の各段階のうち、ケース化された段階の割合。",
        },
      ],
      requiredInputs: ["データの生成〜消滅までの各段階", "各段階で連動する関連データ"],
      deterministic: false,
      selectionRationale: "データが生成から更新・削除・アーカイブまでの過程を持ち、各段階の整合を確認したい場合に選ぶ。",
      note: "段階自動生成エンジンは未実装。additionalCoverageTargets で段階単位の網羅対象を宣言する運用とする。",
    },
    {
      id: "TTK-09",
      techniqueId: "concurrency-test",
      nameJa: "競合テスト",
      basisCharacteristics: ["並行・競合"],
      coverageCriteria: [
        {
          id: "TTC-COV-09",
          nameJa: "競合パターン被覆",
          definition: "宣言した同時実行の組み合わせ(競合パターン)のうち、ケース化されたパターンの割合。",
        },
      ],
      requiredInputs: ["同時に実行され得る操作の組み合わせ", "想定する排他制御方針"],
      deterministic: false,
      selectionRationale: "同一データへの同時更新や多重実行が起こり得る場合に選ぶ。",
      note: "競合パターン自動生成エンジンは未実装。additionalCoverageTargets でパターン単位の網羅対象を宣言する運用とする。",
    },
    {
      id: "TTK-10",
      techniqueId: "timing-order-test",
      nameJa: "タイミング・順序テスト",
      basisCharacteristics: ["並行・競合"],
      coverageCriteria: [
        {
          id: "TTC-COV-10",
          nameJa: "競合パターン被覆",
          definition: "宣言した処理順序・タイミングの組み合わせのうち、ケース化された組み合わせの割合。",
        },
      ],
      requiredInputs: ["処理の想定順序", "タイムアウト・締め時刻等の時刻境界"],
      deterministic: false,
      selectionRationale: "処理順序の入れ替わりや時刻・タイムアウトの境界で振る舞いが変わり得る場合に選ぶ。",
      note: "順序パターン自動生成エンジンは未実装。additionalCoverageTargets でパターン単位の網羅対象を宣言する運用とする。",
    },
  ],
  selectionTable: [
    {
      id: "TTS-01",
      basisCharacteristic: "入力が範囲を持つ",
      recommendedTechniqueIds: ["boundary-value-analysis"],
      coverageCriterionIds: ["TTC-COV-01"],
    },
    {
      id: "TTS-02",
      basisCharacteristic: "入力が分類を持つ",
      recommendedTechniqueIds: ["equivalence-partitioning"],
      coverageCriterionIds: ["TTC-COV-02"],
    },
    {
      id: "TTS-03",
      basisCharacteristic: "複数条件の論理積で振る舞いが変わる",
      recommendedTechniqueIds: ["decision-table"],
      coverageCriterionIds: ["TTC-COV-03"],
    },
    {
      id: "TTS-04",
      basisCharacteristic: "状態が多い・順序依存",
      recommendedTechniqueIds: ["state-transition"],
      coverageCriterionIds: ["TTC-COV-04"],
    },
    {
      id: "TTS-05",
      basisCharacteristic: "因子が多く組合せ爆発",
      recommendedTechniqueIds: ["pairwise"],
      coverageCriterionIds: ["TTC-COV-05"],
    },
    {
      id: "TTS-06",
      basisCharacteristic: "業務フローが長い",
      recommendedTechniqueIds: ["use-case-based", "scenario-based"],
      coverageCriterionIds: ["TTC-COV-06", "TTC-COV-07"],
    },
    {
      id: "TTS-07",
      basisCharacteristic: "データの生成〜消滅",
      recommendedTechniqueIds: ["data-lifecycle-test"],
      coverageCriterionIds: ["TTC-COV-08"],
    },
    {
      id: "TTS-08",
      basisCharacteristic: "並行・競合",
      recommendedTechniqueIds: ["concurrency-test", "timing-order-test"],
      coverageCriterionIds: ["TTC-COV-09", "TTC-COV-10"],
    },
  ],
};
