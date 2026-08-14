import type {
  InspectabilityCheckEntry,
  InspectabilityPrecondition,
  InspectabilityToolEntry,
} from "../types.js";
import {
  IQC_MIN_TABLE_CELLS,
  IQC_NO_HEADING_MIN_CHARS,
  IQC_NO_HEADING_MIN_LINES,
  inputQualityCriteria,
} from "./inputQualityCriteria.js";
import { idPopulationAuditCriteria } from "./idPopulationAuditCriteria.js";
import { basisContradictionCriteria } from "./basisContradictionCriteria.js";
import { crossMatrixAuditCriteria } from "./crossMatrixAuditCriteria.js";
import { testDesignNotationCatalog } from "./testDesignNotationCatalog.js";
import { coverageBalanceCriteria } from "./coverageBalanceCriteria.js";
import { deliverableConsistencyCriteria } from "./deliverableConsistencyCriteria.js";
import { thresholdExtractionCriteria } from "./thresholdExtractionCriteria.js";

export type { InspectabilityCheckEntry, InspectabilityPrecondition, InspectabilityToolEntry };

// 「本入力で実際に実行された決定的検査 / 検査不能だった決定的検査」の対照表を描画するための静的カタログ。
// nextToolCatalog と同じ方針で、静的表はこのファイルに閉じ、判定は inspectabilityAnalysis.ts の純関数に閉じる。
// 新規の判定区分ID体系は発明せず、既存判定区分カタログの id / nameJa をそのまま参照する。
// ツール別カタログに属さない共有判定区分（src/testBasisGrounding.ts の TBG-01〜TBG-04 など）を使う検査は
// catalogId を付けず、出力節ラベルをそのまま検査名として使う。

/**
 * 決定的検査が成立するための入力上の前提の一覧。
 * `measurement` は実測可能な数式で書く（判定ロジックはここではなく各ツール側のシグナル算出にある）。
 */
export const inspectabilityPreconditions: readonly InspectabilityPrecondition[] = [
  // --- 共通（入力ダイジェスト / 原文投入から算出する） ---
  {
    id: "documents-supplied",
    nameJa: "原文投入あり",
    measurement: "投入文書件数 >= 1（合計文字数を併記する）",
    source: "documents[].content / testBasisDocuments[].content / deliverables[].content",
    remedy: "抜粋ではなく原文全文を投入する",
  },
  {
    id: "multiple-documents",
    nameJa: "原文2件以上",
    measurement: "投入文書件数 >= 2",
    source: "documents[].content の件数",
    remedy: "文書間の突き合わせが必要な検査には比較対象の文書も併せて投入する",
  },
  {
    id: "defined-id",
    nameJa: "定義IDあり",
    measurement: "DocumentDigestRow.definedIdCount の全文書合計 >= 1",
    source: "投入文書から抽出したID出現のうち role=definition の件数",
    remedy: "idPatterns を投入文書のID書式に合わせる",
  },
  {
    id: "id-occurrence",
    nameJa: "ID出現あり",
    measurement: "DocumentDigestRow.idCount の全文書合計 >= 1",
    source: "投入文書から抽出したID出現（定義・参照・目次）の件数",
    remedy: "idPatterns を投入文書のID書式に合わせる",
  },
  {
    id: "quantity-expression",
    nameJa: "数量表現あり",
    measurement: "DocumentDigestRow.quantityCount の全文書合計 >= 1",
    source: "投入文書から抽出した数量表現（数値＋単位）の件数",
    remedy: "数値・単位を含む本文（性能要件・上限値の記述）を投入する",
  },
  {
    id: "section-anchor",
    nameJa: "章節アンカー解決あり",
    measurement: "sectionAnchor.mode が heading または alternative の文書 >= 1件",
    source: "DocumentDigestRow.sectionAnchor",
    remedy: "見出し構造を保持した変換テキスト、またはパイプ表を保持したテキストを投入する",
  },
  {
    id: "table-cells",
    nameJa: `表セル${IQC_MIN_TABLE_CELLS}件以上`,
    measurement: `inputQuality.tableCellCount >= ${IQC_MIN_TABLE_CELLS} の文書 >= 1件`,
    source: "DocumentDigestRow.inputQuality.tableCellCount（IQC_MIN_TABLE_CELLS）",
    remedy: "表構造を保持した変換テキストを投入する",
  },
  {
    id: "digest-min-size",
    nameJa: "見出し0件判定の規模条件",
    measurement: `charCount >= ${IQC_NO_HEADING_MIN_CHARS} かつ lineCount >= ${IQC_NO_HEADING_MIN_LINES} の文書 >= 1件`,
    source: "DocumentDigestRow.charCount / lineCount（IQC_NO_HEADING_MIN_CHARS / IQC_NO_HEADING_MIN_LINES）",
    remedy: "抜粋ではなく規模のある原文全文を投入する",
  },

  // --- audit_basis_contradictions 固有 ---
  {
    id: "ui-element",
    nameJa: "UI要素あり",
    measurement: "extractUiElements() の抽出件数 >= 1",
    source: "投入文書の画面項目表・操作要素の記述",
    remedy: "画面項目表を含む文書を投入する",
  },
  {
    id: "transition",
    nameJa: "遷移あり",
    measurement: "extractTransitions() の抽出件数 >= 1",
    source: "投入文書の遷移・表示先の記述",
    remedy: "画面遷移・表示先を記述した文書を投入する",
  },
  {
    id: "parameter-value",
    nameJa: "数量パラメータあり",
    measurement: "extractParameterValues() の抽出件数 >= 1",
    source: "投入文書の「名称＝値＋単位」形式の記述",
    remedy: "閾値・上限値を名称付きで記述した文書を投入する",
  },
  {
    id: "revision-claim",
    nameJa: "改訂宣言あり",
    measurement: "extractRevisionClaims() の抽出件数 >= 1",
    source: "投入文書の改訂履歴（旧値→新値）の記述",
    remedy: "改訂履歴・新旧対照の記述を含む文書を投入する",
  },

  // --- audit_id_population 固有 ---
  {
    id: "population-declared",
    nameJa: "母集団宣言あり",
    measurement: "declaredPopulations[].ids の総件数 >= 1",
    source: "declaredPopulations",
    remedy: "各ツール呼び出しへ実際に渡したID母集団を declaredPopulations で申告する",
  },
  {
    id: "exclusions-declared",
    nameJa: "除外宣言あり",
    measurement: "exclusions の件数 >= 1",
    source: "exclusions",
    remedy: "対象外としたIDとその理由を exclusions に明記する",
  },
  {
    id: "expected-documents",
    nameJa: "期待文書名リストあり",
    measurement: "expectedDocumentNames の件数 >= 1",
    source: "expectedDocumentNames",
    remedy: "投入すべきテストベース文書名の全量を expectedDocumentNames で申告する",
  },
  {
    id: "multiple-populations",
    nameJa: "母集団2件以上",
    measurement: "declaredPopulations の件数 >= 2",
    source: "declaredPopulations",
    remedy: "工程間の縮退を見るには2つ以上の工程の母集団を申告する",
  },

  // --- audit_cross_matrix 固有 ---
  {
    id: "axis-population-declared",
    nameJa: "軸母集団宣言あり",
    measurement: "expectedAxisPopulations の件数 >= 1",
    source: "expectedAxisPopulations",
    remedy: "各軸の期待母集団を expectedAxisPopulations で申告する",
  },
  {
    id: "declared-fill-rate",
    nameJa: "充填率宣言あり",
    measurement: "宣言された充填率（declaredCoverage / declaredFillRatePercent）の件数 >= 1",
    source: "declaredCoverage / yumotsuyoMatrix.declaredFillRatePercent",
    remedy: "成果物が主張している充填率の数値を宣言値として渡す",
  },
  {
    id: "link-basis-declared",
    nameJa: "リンク根拠記入あり",
    measurement: "他軸要素へ解決できたリンク宣言のうち evidence 記入済みの件数 >= 1",
    source: "axes[].items[].links[].evidence",
    remedy: "各リンクに本文からの逐語引用を evidence として記入する",
  },

  // --- audit_deliverable_consistency 固有 ---
  {
    id: "referenced-documents-declared",
    nameJa: "参照文書リスト宣言あり",
    measurement: "declaredReferencedDocuments の件数 >= 1",
    source: "declaredReferencedDocuments",
    remedy: "成果物が参照していると主張するテストベース文書名を申告する",
  },
  {
    id: "read-state-declared",
    nameJa: "読了状態宣言あり",
    measurement: "参照文書行のうち状態が read または unread のセル数 >= 1",
    source: "deliverables[].content から抽出した参照文書の読了・未読の記述",
    remedy: "参照文書について読了・未読の状態を成果物本文に明記する",
  },
  {
    id: "section-reference",
    nameJa: "章節参照あり",
    measurement: "抽出できた章節参照の件数 >= 1",
    source: "deliverables[].content の「N章」「N.M節」形式の参照",
    remedy: "他成果物・自成果物の章節を明示的に参照する記述を含める",
  },
  {
    id: "multiple-deliverables",
    nameJa: "成果物2件以上",
    measurement: "deliverables の件数 >= 2",
    source: "deliverables",
    remedy: "成果物間の突き合わせには2件以上の成果物を投入する",
  },
  {
    id: "numeric-claim",
    nameJa: "件数・網羅率宣言あり",
    measurement: "抽出できた件数・網羅率宣言の件数 >= 1",
    source: "deliverables[].content の「N件」「N%」形式の達成度主張",
    remedy: "件数・網羅率の主張を成果物本文に数値付きで書く（または主張しない）",
  },
  {
    id: "referenced-deliverable-supplied",
    nameJa: "他成果物名を伴う章節参照あり",
    measurement: "章節参照のうち成果物名（呼称）を伴うものの件数 >= 1",
    source: "deliverables[].content の「〇〇仕様書 N章」形式の参照",
    remedy: "章節参照に参照先成果物の名称を明記し、その成果物も投入する",
  },

  // --- audit_coverage_balance 固有 ---
  {
    id: "declared-distribution",
    nameJa: "分布件数宣言あり",
    measurement: "declaredDistributions の件数 >= 1",
    source: "declaredDistributions",
    remedy: "成果物が主張している区分別件数を declaredDistributions で渡す",
  },
  {
    id: "tabulated-cases",
    nameJa: "集計対象テストケースあり",
    measurement: "testCases の件数 >= 1",
    source: "testCases",
    remedy: "集計対象のテストケース一覧を投入する",
  },
  {
    id: "glossary-section",
    nameJa: "用語集セクションあり",
    measurement: "用語集見出しを持つ成果物 >= 1件（抽出できた用語定義件数を併記する）",
    source: "deliverables[].content の用語集見出し区間",
    remedy: "成果物に用語集セクションを設け、用語と定義を表形式で書く",
  },
  {
    id: "custom-term-candidate",
    nameJa: "独自用語候補あり",
    measurement: "抽出できた独自用語候補の件数 >= 1",
    source: "deliverables[].content から minTermOccurrences 回以上出現した語",
    remedy: "成果物本文を投入する（候補0件は用語定義が十分であることを意味しない）",
  },

  // --- audit_test_design_notations 固有 ---
  {
    id: "feature-population",
    nameJa: "機能ID母集団宣言あり",
    measurement: "expectedFunctionIds の件数 >= 1",
    source: "expectedFunctionIds",
    remedy: "FV表が覆うべき機能IDの全量を expectedFunctionIds で申告する",
  },
  {
    id: "test-condition-population",
    nameJa: "テスト条件ID母集団あり",
    measurement: "テスト条件ID母集団の件数 >= 1",
    source: "testConditionIds / testConditions",
    remedy: "テスト条件ID母集団を申告する",
  },
  {
    id: "declared-coverage-rate",
    nameJa: "被覆率宣言あり",
    measurement: "宣言された機能被覆率（claimed）が存在する",
    source: "fvTable.declaredFunctionCoveragePercent",
    remedy: "成果物が主張している機能被覆率の数値を宣言値として渡す",
  },

  // --- review_test_specification 固有 ---
  {
    id: "requirement-id-population",
    nameJa: "要件ID母集団あり",
    measurement: "requirementIds（未指定時はテストベースから自動抽出したID）の件数 >= 1",
    source: "requirementIds / testBasisDocuments[].content の定義行",
    remedy: "requirementIds を直接渡すか idPatterns を投入文書のID書式に合わせる",
  },
  {
    id: "risk-population",
    nameJa: "リスク母集団あり",
    measurement: "risks の件数 >= 1",
    source: "risks",
    remedy: "リスク一覧（ID付き）を渡す",
  },
  {
    id: "test-cases-supplied",
    nameJa: "テストケース投入あり",
    measurement: "testCases の件数 >= 1",
    source: "testCases",
    remedy: "テスト仕様書本文ではなく構造化した testCases も渡す",
  },

  // --- generate_test_cases 固有 ---
  {
    id: "coverage-target-declared",
    nameJa: "網羅対象宣言あり",
    measurement: "網羅対象母集団（boundaryVariables 等から構築した universe）の件数 >= 1",
    source: "boundaryVariables / equivalenceClasses / decisionTable / additionalCoverageTargets",
    remedy: "技法ごとの網羅対象を入力として渡す",
  },
  {
    id: "threshold-parameters",
    nameJa: "閾値パラメータ表あり",
    measurement: "parameters の件数 >= 1",
    source: "parameters",
    remedy: "ケース本文に直値を書かず、閾値を parameters へ名前付きで登録する",
  },
  {
    id: "test-size-input",
    nameJa: "テストレベル配分の判定入力あり",
    measurement: "testLevel / externalDependencyIds / estimatedDurationSeconds のいずれかを持つケース >= 1件",
    source: "testCases[].testLevel / externalDependencyIds / estimatedDurationSeconds",
    remedy: "各ケースに宣言テストレベル・外部依存・想定実行時間のいずれかを付与する",
  },

  // --- reexpand_threshold_changes 固有 ---
  {
    id: "before-after-documents",
    nameJa: "変更前後の原文投入あり",
    measurement: "documentsBefore と documentsAfter の合計件数 >= 1（両者の件数を併記する）",
    source: "documentsBefore[].content / documentsAfter[].content",
    remedy: "変更前後のテストベース原文を documentsBefore / documentsAfter へ投入する",
  },
  {
    id: "declared-parameters",
    nameJa: "宣言パラメータ表あり",
    measurement: "parametersBefore と parametersAfter の合計件数 >= 1",
    source: "parametersBefore / parametersAfter",
    remedy: "呼び出し側が把握している閾値パラメータ表を宣言値として渡す",
  },
  {
    id: "approval-declared",
    nameJa: "抽出候補の承認宣言あり",
    measurement: "approvedExtractions の件数 >= 1",
    source: "approvedExtractions",
    remedy: "自前抽出した候補のうち採用するものを approvedExtractions で承認する",
  },
];

/** 前提ID → 前提定義。 */
export const inspectabilityPreconditionById: Record<string, InspectabilityPrecondition> =
  Object.fromEntries(inspectabilityPreconditions.map((p) => [p.id, p]));

/**
 * 既存判定区分カタログの id → nameJa。対照表の「検査」列は自作せずここから引く。
 * 同一IDが複数カタログに現れることはない（接頭辞で区分が分かれている）。
 */
export const inspectabilityCatalogIdNames: Record<string, string> = Object.fromEntries([
  ...inputQualityCriteria.criteria.map((c) => [c.id, c.nameJa] as const),
  ...idPopulationAuditCriteria.categories.map((c) => [c.id, c.nameJa] as const),
  ...basisContradictionCriteria.categories.map((c) => [c.id, c.nameJa] as const),
  ...crossMatrixAuditCriteria.categories.map((c) => [c.id, c.nameJa] as const),
  ...testDesignNotationCatalog.auditCategories.map((c) => [c.id, c.nameJa] as const),
  ...coverageBalanceCriteria.categories.map((c) => [c.id, c.nameJa] as const),
  ...deliverableConsistencyCriteria.categories.map((c) => [c.id, c.nameJa] as const),
  ...thresholdExtractionCriteria.categories.map((c) => [c.id, c.nameJa] as const),
]);

/**
 * 入力ダイジェスト（IQC-01〜IQC-05）に対応する共通検査。
 * `includesDigestChecks: true` のツールの検査列の先頭へ連結する。
 * 節ラベルは各ツールの `digestSectionLabel`（ダイジェストを載せている実際の節見出し）で上書きされる。
 */
export const inspectabilityDigestChecks: readonly InspectabilityCheckEntry[] = [
  {
    checkKey: "isolated-numeric-cells",
    catalogId: "IQC-01",
    sectionLabel: "入力ダイジェスト",
    requires: ["table-cells"],
  },
  {
    checkKey: "furigana-contamination",
    catalogId: "IQC-02",
    sectionLabel: "入力ダイジェスト",
    requires: ["documents-supplied"],
  },
  {
    checkKey: "no-heading",
    catalogId: "IQC-03",
    sectionLabel: "入力ダイジェスト",
    requires: ["digest-min-size"],
  },
  {
    checkKey: "broken-table-cells",
    catalogId: "IQC-04",
    sectionLabel: "入力ダイジェスト",
    requires: ["table-cells"],
  },
  {
    checkKey: "bidi-control-chars",
    catalogId: "IQC-05",
    sectionLabel: "入力ダイジェスト",
    requires: ["documents-supplied"],
  },
];

const OUT_OF_SCOPE_PREFIX =
  "本表は原文入力に依存する決定的検査のみを対象とする。構造引数のみに依存する検査";

function outOfScopeNote(structuralExamples: string): string {
  return (
    `- ${OUT_OF_SCOPE_PREFIX}（${structuralExamples}）は原文の投入状況に左右されないため、` +
    "本表の対象外であり常に実行されている。"
  );
}

/**
 * テストベース実在照合（TBG-01〜TBG-04）の共通検査。
 * 判定区分IDは src/testBasisGrounding.ts の module 定数であり、
 * ツール別 resource カタログの id 体系ではないため catalogId は付けない。
 */
function testBasisGroundingCheck(): InspectabilityCheckEntry {
  return {
    checkKey: "testbasis-grounding",
    sectionLabel: "テストベースとの実在照合",
    requires: ["documents-supplied"],
  };
}

/** ツール名 → 検査実行状況カタログ。原文入力口を持つ19ツールのみを登録する。 */
export const inspectabilityCatalog: Record<string, InspectabilityToolEntry> = {
  review_test_basis: {
    toolName: "review_test_basis",
    includesDigestChecks: true,
    digestSectionLabel: "対象文書",
    checks: [
      { checkKey: "id-duplicate", sectionLabel: "ID重複", requires: ["defined-id"] },
      { checkKey: "unresolved-reference", sectionLabel: "未解決参照", requires: ["id-occurrence"] },
      { checkKey: "prefix-deviation", sectionLabel: "プレフィックス体系の逸脱", requires: ["defined-id"] },
      { checkKey: "ambiguous-term", sectionLabel: "曖昧語・弱い語", requires: ["documents-supplied"] },
      { checkKey: "quantity-expression", sectionLabel: "数量表現", requires: ["documents-supplied"] },
    ],
    outOfScopeNote: outOfScopeNote("checklist / additionalAmbiguousTerms の適用そのもの"),
  },

  analyze_requirements: {
    toolName: "analyze_requirements",
    includesDigestChecks: true,
    digestSectionLabel: "入力ダイジェスト",
    checks: [
      { checkKey: "requirement-id-system", sectionLabel: "要件ID体系", requires: ["defined-id"] },
      {
        checkKey: "quantity-aggregation",
        sectionLabel: "数量表現の全文書横断集約",
        requires: ["documents-supplied"],
      },
      { checkKey: "boundary-candidate", sectionLabel: "境界値候補", requires: ["quantity-expression"] },
      {
        checkKey: "term-definition",
        sectionLabel: "用語定義と本文使用の照合",
        requires: ["documents-supplied"],
      },
      {
        checkKey: "ambiguous-term",
        sectionLabel: "曖昧語・弱い語・未完成注記",
        requires: ["documents-supplied"],
      },
      {
        checkKey: "id-basis-location",
        sectionLabel: "要件ID → テストベース根拠位置",
        requires: ["defined-id", "section-anchor"],
      },
    ],
    outOfScopeNote: outOfScopeNote(
      "background / focusAreas / stakeholders / changeItems の提示と品質特性マッピング指示"
    ),
  },

  review_test_specification: {
    toolName: "review_test_specification",
    includesDigestChecks: true,
    digestSectionLabel: "対象文書",
    checks: [
      {
        checkKey: "requirement-coverage",
        sectionLabel: "要件IDカバレッジ(双方向)",
        requires: ["requirement-id-population"],
      },
      {
        checkKey: "condition-coverage",
        sectionLabel: "テスト条件IDカバレッジ(双方向)",
        requires: ["test-condition-population"],
      },
      {
        checkKey: "risk-coverage",
        sectionLabel: "リスクIDカバレッジ(双方向)",
        requires: ["risk-population"],
      },
      {
        checkKey: "case-id-duplicate",
        sectionLabel: "ケースIDの重複・期待結果の空欄",
        requires: ["test-cases-supplied"],
      },
      {
        checkKey: "basis-fact-check",
        sectionLabel: "テストベースとの事実照合",
        requires: ["documents-supplied", "test-cases-supplied"],
      },
    ],
    outOfScopeNote: outOfScopeNote("優先度の付与状況 / 手順数と期待結果数のバランス / 主観語検査"),
  },

  generate_test_cases: {
    toolName: "generate_test_cases",
    includesDigestChecks: false,
    checks: [
      {
        checkKey: "coverage-target-grounding",
        sectionLabel: "網羅対象の裏付け検査",
        requires: ["coverage-target-declared", "documents-supplied"],
      },
      {
        checkKey: "basis-fact-check",
        sectionLabel: "テストベースとの事実照合",
        requires: ["documents-supplied"],
      },
      {
        checkKey: "threshold-literal",
        sectionLabel: "閾値の直値埋め込み検査",
        requires: ["threshold-parameters"],
      },
      {
        checkKey: "test-level-allocation",
        sectionLabel: "テストレベル配分の妥当性",
        requires: ["test-size-input"],
      },
    ],
    outOfScopeNote: outOfScopeNote(
      "ケースIDの重複・欠番・プレフィックス不一致 / 手順の粒度検査 / トレーサビリティ"
    ),
  },

  audit_id_population: {
    toolName: "audit_id_population",
    includesDigestChecks: true,
    digestSectionLabel: "投入されたテストベース文書",
    checks: [
      {
        checkKey: "PAC-01",
        catalogId: "PAC-01",
        sectionLabel: "未宣言ID一覧",
        requires: ["defined-id", "population-declared"],
      },
      {
        checkKey: "PAC-02",
        catalogId: "PAC-02",
        sectionLabel: "除外宣言されたID",
        requires: ["exclusions-declared"],
      },
      {
        checkKey: "PAC-03",
        catalogId: "PAC-03",
        sectionLabel: "テストベースに定義が無い母集団ID",
        requires: ["population-declared"],
      },
      {
        checkKey: "PAC-04",
        catalogId: "PAC-04",
        sectionLabel: "未投入のテストベース文書",
        requires: ["expected-documents"],
      },
      {
        checkKey: "PAC-05",
        catalogId: "PAC-05",
        sectionLabel: "母集団間の差分(工程間の縮退)",
        requires: ["multiple-populations"],
      },
      {
        checkKey: "PAC-06",
        catalogId: "PAC-06",
        sectionLabel: "文書別の母集団反映率",
        requires: ["defined-id", "population-declared"],
      },
    ],
    outOfScopeNote: outOfScopeNote("declaredPopulations 同士の集合演算そのもの"),
  },

  audit_basis_contradictions: {
    toolName: "audit_basis_contradictions",
    includesDigestChecks: false,
    checks: [
      {
        checkKey: "BC-01",
        catalogId: "BC-01",
        sectionLabel: "同一IDの名称不一致",
        requires: ["id-occurrence"],
      },
      {
        checkKey: "BC-02",
        catalogId: "BC-02",
        sectionLabel: "構成要素ラベルの表記不一致",
        requires: ["ui-element", "multiple-documents"],
      },
      {
        checkKey: "BC-03",
        catalogId: "BC-03",
        sectionLabel: "構成要素の片側欠落",
        requires: ["ui-element", "multiple-documents"],
      },
      {
        checkKey: "BC-04",
        catalogId: "BC-04",
        sectionLabel: "同一トリガの遷移先不一致",
        requires: ["transition"],
      },
      {
        checkKey: "BC-05",
        catalogId: "BC-05",
        sectionLabel: "未定義の遷移先・表示先",
        requires: ["transition"],
      },
      {
        checkKey: "BC-06",
        catalogId: "BC-06",
        sectionLabel: "振る舞い未記述の操作要素",
        requires: ["ui-element"],
      },
      {
        checkKey: "BC-07",
        catalogId: "BC-07",
        sectionLabel: "一覧宣言と本文実体の主題不一致",
        requires: ["id-occurrence"],
      },
      {
        checkKey: "BC-08",
        catalogId: "BC-08",
        sectionLabel: "同一パラメータの値不一致",
        requires: ["parameter-value"],
      },
      {
        checkKey: "BC-09",
        catalogId: "BC-09",
        sectionLabel: "改訂宣言の旧値が本文に残存",
        requires: ["revision-claim"],
      },
      {
        checkKey: "BC-10",
        catalogId: "BC-10",
        sectionLabel: "少数派の遷移先(参考)",
        requires: ["transition"],
      },
    ],
    outOfScopeNote: outOfScopeNote("knownResolved による除外と minConfidence による抑制"),
  },

  audit_cross_matrix: {
    toolName: "audit_cross_matrix",
    includesDigestChecks: true,
    digestSectionLabel: "投入されたテストベース文書",
    checks: [
      {
        checkKey: "CMX-08",
        catalogId: "CMX-08",
        sectionLabel: "宣言充填率との照合",
        requires: ["declared-fill-rate"],
      },
      {
        checkKey: "CMX-09",
        catalogId: "CMX-09",
        sectionLabel: "軸母集団とリンク根拠の裏付け",
        requires: ["axis-population-declared"],
      },
      {
        checkKey: "CMX-10",
        catalogId: "CMX-10",
        sectionLabel: "軸母集団とリンク根拠の裏付け",
        requires: ["documents-supplied"],
      },
      {
        checkKey: "CMX-11",
        catalogId: "CMX-11",
        sectionLabel: "軸母集団とリンク根拠の裏付け",
        requires: ["defined-id"],
      },
      {
        checkKey: "CMX-17",
        catalogId: "CMX-17",
        sectionLabel: "軸母集団とリンク根拠の裏付け",
        requires: ["documents-supplied", "link-basis-declared"],
      },
    ],
    outOfScopeNote: outOfScopeNote(
      "空行・空列・片方向リンク・自軸内リンク・除外理由の未記入（CMX-01〜CMX-07 / CMX-12〜CMX-16）"
    ),
  },

  audit_test_design_notations: {
    toolName: "audit_test_design_notations",
    includesDigestChecks: true,
    digestSectionLabel: "投入されたテストベース文書",
    checks: [
      { checkKey: "TDN-05", catalogId: "TDN-05", sectionLabel: "検査結果", requires: ["feature-population"] },
      { checkKey: "TDN-06", catalogId: "TDN-06", sectionLabel: "検査結果", requires: ["documents-supplied"] },
      {
        checkKey: "TDN-07",
        catalogId: "TDN-07",
        sectionLabel: "検査結果",
        requires: ["feature-population", "declared-coverage-rate"],
      },
      {
        checkKey: "TDN-21",
        catalogId: "TDN-21",
        sectionLabel: "検査結果",
        requires: ["test-condition-population"],
      },
      { checkKey: "TDN-22", catalogId: "TDN-22", sectionLabel: "検査結果", requires: ["declared-fill-rate"] },
    ],
    outOfScopeNote: outOfScopeNote(
      "FV表・NGT・マトリクスの構造検査（ID重複・循環・空セル・記法間対応）"
    ),
  },

  audit_coverage_balance: {
    toolName: "audit_coverage_balance",
    includesDigestChecks: true,
    digestSectionLabel: "入力ダイジェスト",
    checks: [
      {
        checkKey: "CBC-04",
        catalogId: "CBC-04",
        sectionLabel: "分布の宣言と実体の照合",
        requires: ["declared-distribution"],
      },
      {
        checkKey: "CBC-14",
        catalogId: "CBC-14",
        sectionLabel: "分布の宣言と実体の照合",
        requires: ["declared-distribution"],
      },
      {
        checkKey: "CBC-05",
        catalogId: "CBC-05",
        sectionLabel: "分布の宣言と実体の照合",
        requires: ["tabulated-cases", "documents-supplied"],
      },
      {
        checkKey: "CBC-06",
        catalogId: "CBC-06",
        sectionLabel: "分布の宣言と実体の照合",
        requires: ["documents-supplied"],
      },
      {
        checkKey: "CBC-09",
        catalogId: "CBC-09",
        sectionLabel: "独自用語候補と定義の突き合わせ",
        requires: ["custom-term-candidate"],
      },
      {
        checkKey: "CBC-10",
        catalogId: "CBC-10",
        sectionLabel: "独自用語候補と定義の突き合わせ",
        requires: ["custom-term-candidate", "glossary-section"],
      },
      {
        checkKey: "CBC-11",
        catalogId: "CBC-11",
        sectionLabel: "独自用語候補と定義の突き合わせ",
        requires: ["glossary-section"],
      },
      {
        checkKey: "CBC-12",
        catalogId: "CBC-12",
        sectionLabel: "独自用語候補と定義の突き合わせ",
        requires: ["glossary-section"],
      },
      {
        checkKey: "CBC-13",
        catalogId: "CBC-13",
        sectionLabel: "独自用語候補と定義の突き合わせ",
        requires: ["custom-term-candidate"],
      },
    ],
    outOfScopeNote: outOfScopeNote(
      "観点カテゴリ・技法・テストレベル別の件数分布と偏りの観測値（CBC-01〜CBC-03 / CBC-07 / CBC-08）"
    ),
  },

  audit_deliverable_consistency: {
    toolName: "audit_deliverable_consistency",
    includesDigestChecks: true,
    digestSectionLabel: "入力ダイジェスト",
    checks: [
      {
        checkKey: "DCC-01",
        catalogId: "DCC-01",
        sectionLabel: "参照テストベース文書リストの突き合わせ",
        requires: ["read-state-declared", "multiple-deliverables"],
      },
      {
        checkKey: "DCC-04",
        catalogId: "DCC-04",
        sectionLabel: "参照テストベース文書リストの突き合わせ",
        requires: ["referenced-documents-declared"],
      },
      {
        checkKey: "DCC-05",
        catalogId: "DCC-05",
        sectionLabel: "参照テストベース文書リストの突き合わせ",
        requires: ["read-state-declared"],
      },
      {
        checkKey: "DCC-08",
        catalogId: "DCC-08",
        sectionLabel: "IDの成果物間相互参照",
        requires: ["defined-id", "multiple-deliverables"],
      },
      {
        checkKey: "DCC-09",
        catalogId: "DCC-09",
        sectionLabel: "章節参照の実在性",
        requires: ["section-reference"],
      },
      {
        checkKey: "DCC-10",
        catalogId: "DCC-10",
        sectionLabel: "章節参照の実在性",
        requires: ["section-reference", "section-anchor"],
      },
      {
        checkKey: "DCC-11",
        catalogId: "DCC-11",
        sectionLabel: "章節参照の実在性",
        requires: ["referenced-deliverable-supplied"],
      },
      {
        checkKey: "DCC-12",
        catalogId: "DCC-12",
        sectionLabel: "同一項目・同一IDの記述差分",
        requires: ["multiple-deliverables"],
      },
      {
        checkKey: "DCC-13",
        catalogId: "DCC-13",
        sectionLabel: "同一項目・同一IDの記述差分",
        requires: ["multiple-deliverables"],
      },
      {
        checkKey: "DCC-15",
        catalogId: "DCC-15",
        sectionLabel: "件数・網羅率宣言と本文実体の照合",
        requires: ["numeric-claim"],
      },
      {
        checkKey: "DCC-16",
        catalogId: "DCC-16",
        sectionLabel: "件数・網羅率宣言と本文実体の照合",
        requires: ["numeric-claim", "defined-id"],
      },
      {
        checkKey: "DCC-17",
        catalogId: "DCC-17",
        sectionLabel: "件数・網羅率宣言と本文実体の照合",
        requires: ["numeric-claim"],
      },
    ],
    outOfScopeNote: outOfScopeNote(
      "自己矛盾・片側参照・未解決ID参照・共通項目の片側欠落（DCC-02 / DCC-03 / DCC-06 / DCC-07 / DCC-14）"
    ),
  },

  reexpand_threshold_changes: {
    toolName: "reexpand_threshold_changes",
    includesDigestChecks: true,
    digestSectionLabel: "投入文書ダイジェスト",
    checks: [
      {
        checkKey: "TCE-01",
        catalogId: "TCE-01",
        sectionLabel: "宣言パラメータ表との突合結果",
        requires: ["before-after-documents"],
      },
      {
        checkKey: "TCE-02",
        catalogId: "TCE-02",
        sectionLabel: "宣言パラメータ表との突合結果",
        requires: ["before-after-documents", "declared-parameters"],
      },
      {
        checkKey: "TCE-03",
        catalogId: "TCE-03",
        sectionLabel: "宣言パラメータ表との突合結果",
        requires: ["before-after-documents", "declared-parameters"],
      },
      {
        checkKey: "TCE-04",
        catalogId: "TCE-04",
        sectionLabel: "宣言パラメータ表との突合結果",
        requires: ["before-after-documents", "declared-parameters"],
      },
      {
        checkKey: "TCE-05",
        catalogId: "TCE-05",
        sectionLabel: "宣言パラメータ表との突合結果",
        requires: ["before-after-documents"],
      },
      {
        checkKey: "TCE-06",
        catalogId: "TCE-06",
        sectionLabel: "宣言パラメータ表との突合結果",
        requires: ["before-after-documents", "approval-declared"],
      },
      {
        checkKey: "TCE-07",
        catalogId: "TCE-07",
        sectionLabel: "宣言パラメータ表との突合結果",
        requires: ["before-after-documents", "approval-declared"],
      },
    ],
    outOfScopeNote: outOfScopeNote(
      "パラメータ差分・参照インデックス・境界値/同値クラスの再展開（TCI-01〜TCI-08）"
    ),
  },

  design_scenario_flows: {
    toolName: "design_scenario_flows",
    includesDigestChecks: false,
    checks: [testBasisGroundingCheck()],
    outOfScopeNote: outOfScopeNote(
      "actors / useCases / mainFlow / branches の構造検査とシナリオ列挙・機能ID被覆（SFC-01〜）"
    ),
  },

  design_test_data: {
    toolName: "design_test_data",
    includesDigestChecks: false,
    checks: [testBasisGroundingCheck()],
    outOfScopeNote: outOfScopeNote(
      "dataClasses / states / transitions の構造検査とデータ×ケース供給トレーサビリティ（TDC-01〜）"
    ),
  },

  design_config_matrix: {
    toolName: "design_config_matrix",
    includesDigestChecks: false,
    checks: [testBasisGroundingCheck()],
    outOfScopeNote: outOfScopeNote(
      "factors / excludedCombinations / actualRows の構造検査と到達可否・被覆算出（CMC-01〜）"
    ),
  },

  design_decision_table: {
    toolName: "design_decision_table",
    includesDigestChecks: false,
    checks: [testBasisGroundingCheck()],
    outOfScopeNote: outOfScopeNote(
      "conditions / actions / invalidCombinations / rules の構造検査と組合せ列挙・圧縮（DTC-01〜）"
    ),
  },

  design_pairwise: {
    toolName: "design_pairwise",
    includesDigestChecks: false,
    checks: [testBasisGroundingCheck()],
    outOfScopeNote: outOfScopeNote(
      "factors / forbiddenCombinations / seedRows の構造検査とペア到達可否・被覆算出（PWC-01〜）"
    ),
  },

  design_test_architecture: {
    toolName: "design_test_architecture",
    includesDigestChecks: false,
    checks: [testBasisGroundingCheck()],
    outOfScopeNote: outOfScopeNote(
      "scope / containers / testConditions の構造検査と階層・帰属・分布の算出（TAC-01〜）"
    ),
  },

  analyze_data_flow_timing: {
    toolName: "analyze_data_flow_timing",
    includesDigestChecks: false,
    checks: [testBasisGroundingCheck()],
    outOfScopeNote: outOfScopeNote(
      "components / dataItems / communications の構造検査と遅延窓・乖離窓の算出（DFT-01〜DFT-20）"
    ),
  },

  select_regression_suite: {
    toolName: "select_regression_suite",
    includesDigestChecks: false,
    checks: [testBasisGroundingCheck()],
    outOfScopeNote: outOfScopeNote(
      "testConditions / selectionCriteria / selections / previousSuite の構造検査と選択・差分・影響範囲被覆の算出（RSC-01〜RSC-25）"
    ),
  },
};

/** カタログに登録されたツール名（登録順）。 */
export const inspectabilityToolNames: readonly string[] = Object.keys(inspectabilityCatalog);
