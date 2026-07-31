export type JstqbTermCategory =
  | "test-level"
  | "test-type"
  | "criteria"
  | "test-condition"
  | "test-perspective"
  | "review-type";

export interface JstqbTerm {
  id: string;
  category: JstqbTermCategory;
  nameJa: string;
  nameEn: string;
  definition: string;
}

export interface JstqbGlossary {
  source: string;
  terms: JstqbTerm[];
}

export interface TestPlanTemplateSection {
  id: string;
  no: string;
  titleJa: string;
  level: 1 | 2;
  required: boolean;
  fieldKey?: string;
  guidance?: string;
}

export interface TestPlanTemplate {
  templateName: string;
  sections: TestPlanTemplateSection[];
}

export interface TestPlanRisk {
  description: string;
  impact?: "low" | "medium" | "high";
  mitigation?: string;
}

export interface TestPlanRevisionRow {
  version?: string;
  date?: string;
  author?: string;
  approver?: string;
  changeContent?: string;
}

export interface TestPlanStaffingTraining {
  additionalStaffing?: string;
  trainingItems?: string[];
}

export interface TestPlanMilestone {
  name: string;
  date: string;
}

export interface TestPlanScheduleConstraints {
  startDate?: string;
  endDate?: string;
  milestones?: TestPlanMilestone[];
}

export interface TestPlanTeamMember {
  role: string;
  name?: string;
  responsibilities?: string;
}

export interface TestPlanSystemOverview {
  name?: string;
  users?: string;
  purpose?: string;
  detail?: string;
  devType?: string;
}

export interface TestPlanReference {
  name: string;
  author?: string;
  version?: string;
  receivedDate?: string;
  note?: string;
}

export interface TestPlanBackground {
  current?: string;
  concerns?: string;
}

export interface TestPlanTestItem {
  name: string;
  summary?: string;
}

export interface TestPlanTestTechnique {
  testType: string;
  approach?: string;
  technique?: string;
}

export interface TestPlanDataRequirement {
  description: string;
  owner?: string;
  period?: string;
}

export interface TestPlanStakeholder {
  role: string;
  name?: string;
  contact?: string;
}

export interface TestPlanGlossaryEntry {
  term: string;
  definition: string;
}

export interface TestPlanReferenceDoc {
  name: string;
  description?: string;
}

export type ReviewSeverity = "high" | "medium" | "low";

export interface TestPlanReviewCheckItem {
  id: string; // 例: "CL-01"
  severity: ReviewSeverity;
  title: string; // 観点名（日本語）
  check: string; // 何を確認するか（パラフレーズした指示文）
  glossaryRefs?: string[]; // jstqbGlossary の term id（存在するもの）
}

export interface TestPlanReviewChecklist {
  name: string;
  items: TestPlanReviewCheckItem[];
}

export interface TestPlanInput {
  projectName: string;
  scope: string;
  objectives?: string[];
  featuresToTest?: string[];
  featuresNotToTest?: string[];
  risks?: TestPlanRisk[];
  scheduleConstraints?: TestPlanScheduleConstraints;
  team?: TestPlanTeamMember[];
  environment?: string;
  deliverables?: string[];
  passFailCriteria?: string;
  suspensionCriteria?: string;
  approvers?: string[];
  systemOverview?: TestPlanSystemOverview;
  references?: TestPlanReference[];
  background?: TestPlanBackground;
  testLevels?: string[];
  revisionContent?: string[];
  testItems?: TestPlanTestItem[];
  selectedTestTypes?: string[];
  testTechniques?: TestPlanTestTechnique[];
  testPeriod?: string;
  startCriteria?: string;
  endCriteria?: string;
  completionCriteria?: string[];
  metricsNote?: string;
  testDataRequirements?: TestPlanDataRequirement[];
  stakeholders?: TestPlanStakeholder[];
  assumptions?: string[];
  constraints?: string[];
  glossary?: TestPlanGlossaryEntry[];
  referenceDocs?: TestPlanReferenceDoc[];
  notes?: string;
  testingTasksFlow?: string[];
  staffingAndTraining?: TestPlanStaffingTraining;
  projectRisks?: TestPlanRisk[];
  revisions?: TestPlanRevisionRow[];
}

// --- Test Design 技法 ---
export type BoundaryValueMode = "two" | "three";
export type BoundaryVariableType = "int" | "decimal";

export interface BoundaryVariableSpec {
  name: string;
  min: number;
  max: number;
  valueType?: BoundaryVariableType; // 既定 "int"
  step?: number;                    // 既定: int=1 / decimal=0.1
}

export interface BoundaryValueRow {
  variable: string;
  value: number;
  label: string;                 // 例 "下限-刻み" "下限" "上限+刻み"
  validity: "valid" | "invalid";
}

export interface EquivalenceClassSpec {
  label: string;
  representative: string;
  description?: string;
}

export interface EquivalencePartitioningVariableSpec {
  name: string;
  validClasses: EquivalenceClassSpec[];
  invalidClasses?: EquivalenceClassSpec[];
}

// --- テストベースレビュー ---
export interface TestBasisDocument {
  name: string; // 文書名（例: "11_園内チケットシステム要求仕様書"）
  content: string; // 自由テキスト（Markdown / プレーンテキスト、フォーマット不問）
}

export type TestBasisIdRole = "definition" | "reference";

export interface TestBasisIdOccurrence {
  id: string; // 例 "W-Mail-011-01"
  prefix: string; // 例 "W-Mail"
  numberPart: string; // 例 "011-01"
  document: string; // TestBasisDocument.name
  lineIndex: number; // 0-based
  heading: string; // 直近の見出し（無ければ "(見出しなし)"）
  lineText: string; // 行全体（trim済み）
  role: TestBasisIdRole;
}

/** テストベース文書内の根拠位置（行番号・章節） */
export interface TestBasisSourceRef {
  document: string;   // TestBasisDocument.name
  startLine: number;  // 1-based
  endLine?: number;   // 1-based。未指定/startLine と同値なら単一行
  heading?: string;   // 直近の見出し
  label?: string;     // 表示ラベル（例 "EH-100 発券機起動"）
}
/** 要件ID → 根拠位置 */
export interface RequirementSourceRef extends TestBasisSourceRef {
  requirementId: string;
}

export interface TestBasisDuplicateId {
  id: string;
  count: number;
  places: { document: string; lineIndex: number; heading: string; lineText: string }[];
  sameText: boolean; // 定義行のテキストが全て一致するなら true（単純な再掲の可能性）
}

export interface TestBasisUnresolvedReference {
  id: string;
  document: string;
  lineIndex: number;
  heading: string;
  lineText: string;
}

export type TestBasisPrefixIssueKind =
  | "case-variant" // 大文字小文字だけ違うプレフィックスが混在
  | "rare-prefix" // 定義が1件だけで、他に3件以上のプレフィックスが存在
  | "digit-width-mismatch" // 同一プレフィックス内で連番の桁数が不一致（001 と 01 と 1）
  | "segment-count-mismatch"; // 同一プレフィックス内で数値セグメント数が不一致（S-001 と S-001-01）

export interface TestBasisPrefixStat {
  prefix: string;
  definitionCount: number;
  digitWidths: number[]; // 昇順・重複排除
  segmentCounts: number[]; // 昇順・重複排除
  documents: string[]; // 出現文書名（重複排除・出現順）
}

export interface TestBasisPrefixIssue {
  kind: TestBasisPrefixIssueKind;
  prefixes: string[];
  detail: string; // 日本語の説明文
}

export interface TestBasisAmbiguousTermFinding {
  term: string;
  category: "ambiguous" | "weak-requirement" | "incomplete-note";
  total: number;
  byHeading: { document: string; heading: string; count: number }[];
}

export type TestBasisQuantityKind =
  | "comparison" // 以上/以下/未満/超/以内/まで
  | "time" // 時刻（HH:MM、○時○分）
  | "duration" // 秒/分/時間/日
  | "count" // 回/件/人/枚
  | "digits" // 桁
  | "period" // 毎日/毎時/定期/○ごと
  | "quantity"; // その他の数値＋単位

export interface TestBasisQuantityExpression {
  raw: string; // マッチした文字列
  kind: TestBasisQuantityKind;
  document: string;
  lineIndex: number;
  heading: string;
  hasBoundaryWord: boolean; // 同一マッチ内に 以上/以下/未満/超/以内 を含むか
}

// --- 入力ダイジェスト（documents 系ツール共通。抜粋投入の可視化） ---
export interface DocumentDigestRow {
  document: string;
  charCount: number;       // content.length
  lineCount: number;       // content.split("\n").length
  headingCount: number;    // parseHeadings(content).length
  idCount: number;         // 定義+参照の出現数
  definedIdCount: number;  // role === "definition"
  quantityCount: number;   // extractQuantityExpressions の件数
  prefixCounts: { prefix: string; definitionCount: number }[]; // 出現順
}

export interface DocumentDigestFinding {
  document: string;
  kind: "no-id" | "sparse-prefix";
  severity: "medium";
  detail: string;
}

export interface TestBasisReviewCheckItem {
  id: string; // "TB-01" 形式
  severity: ReviewSeverity; // 既存 ReviewSeverity を再利用
  title: string;
  check: string; // 何を確認するか（自作のパラフレーズ文）
  improvementActions: string[]; // 典型的な改善アクション
  glossaryRefs?: string[]; // jstqbGlossary.terms の既存 id のみ
}

export interface TestBasisReviewChecklist {
  name: string;
  items: TestBasisReviewCheckItem[];
}

// --- 品質特性モデル ---
export interface QualitySubCharacteristic {
  id: string;               // "QC-01-02" 形式
  nameJa: string;
  nameEn: string;
  focus: string[];          // 確認の着眼点（自作の日本語文）
  relatedTestTypes: string[]; // jstqbGlossary.terms の既存 id のみ
}
export interface QualityCharacteristic {
  id: string;               // "QC-01" 形式
  nameJa: string;
  nameEn: string;
  summary: string;
  subCharacteristics: QualitySubCharacteristic[];
}
export interface QualityCharacteristicModel {
  name: string;
  note: string;             // 自作整理であること／規格本文の転載でないことの明示
  characteristics: QualityCharacteristic[];
}

// --- 要件ID抽出パターン集 ---
export interface RequirementIdPattern {
  id: string;               // "IDP-01"
  name: string;
  source: string;           // 正規表現 source
  examples: string[];
  nonExamples: string[];
  note?: string;
}
export interface RequirementIdPatternCatalog {
  name: string;
  defaultPatternId: string;
  patterns: RequirementIdPattern[];
}

// --- 要件分析（analyze_requirements） ---
export type RequirementsQuantityUnit = string; // 単位。未検出時は "(単位なし)"

export interface RequirementsQuantityAggregate {
  unit: RequirementsQuantityUnit;
  numbers: number[];                 // 昇順・重複排除
  documents: string[];               // 出現文書（出現順・重複排除）
  boundaryWords: string[];           // 以上/以下/未満/超/以内/まで の出現分（重複排除）
  occurrences: TestBasisQuantityExpression[];
  crossDocumentVariance: boolean;    // documents.length >= 2 && numbers.length >= 2
}

export interface RequirementsBoundaryCandidate {
  unit: RequirementsQuantityUnit;
  variable: BoundaryVariableSpec;    // design_boundary_values の variables[] 要素そのまま
  incomplete: boolean;               // min または max が文書から確定できない
  note?: string;
  basis: string[];                   // 根拠スニペット "doc:行番号 「raw」"
}

export type RequirementsTermStatus =
  | "ok"
  | "unused"                  // 定義したが本文で未使用
  | "variant-suspected"       // 正規化一致はあるが完全一致が不足（表記揺れ疑い）
  | "duplicate-definition";   // 同一用語の定義が2箇所以上

export interface RequirementsTermFinding {
  term: string;
  definitions: { document: string; lineIndex: number; heading: string; definition: string }[];
  exactUsageCount: number;       // 定義行を除く完全一致出現数
  normalizedUsageCount: number;  // 定義行を除く正規化一致出現数（>= exactUsageCount）
  usageDocuments: string[];
  status: RequirementsTermStatus;
}

export type RequirementsFindingKind =
  | "曖昧" | "矛盾" | "欠落" | "未解決参照" | "ID重複" | "表記揺れ";

export interface RequirementsFinding {
  id: string;                 // "F-01" 形式（1始まり・2桁ゼロ埋め）
  kind: RequirementsFindingKind;
  severity: ReviewSeverity;   // 既存型を再利用
  place: string;              // "文書名:行番号 見出し" 形式（行番号は1-based）
  snippet: string;            // 引用スニペット（80文字で打ち切り、末尾 "…"）
  problem: string;
  question: string;           // 確認質問文
  assumption: string;         // 暫定前提
}

export type RequirementsChangeCategory =
  | "new" | "modified" | "existing-impacted" | "existing-unaffected";

export interface RequirementsChangeItem {
  description: string;
  category?: RequirementsChangeCategory;  // 未指定なら LLM が分類する
  note?: string;
}

export interface RequirementsStakeholderInput {
  role: string;
  name?: string;
  concerns?: string;
}

export interface AnalyzeRequirementsInput {
  documents: TestBasisDocument[];
  idPatterns?: string[];
  additionalAmbiguousTerms?: string[];
  background?: string;
  focusAreas?: string[];
  outOfScope?: string[];
  alreadyAssured?: string[];
  stakeholders?: RequirementsStakeholderInput[];
  changeItems?: RequirementsChangeItem[];
  qualityCharacteristicIds?: string[]; // 指定時は該当特性のみをマッピング指示に出す
}

// --- テスト観点カタログ ---
export type TestTechniqueId =
  | "equivalence-partitioning" | "boundary-value-analysis" | "decision-table"
  | "state-transition" | "pairwise" | "scenario-based" | "use-case-based"
  | "error-guessing" | "exploratory" | "checklist-based"
  | "load-test" | "long-run-test" | "fault-injection" | "concurrency-test"
  | "timing-order-test" | "data-lifecycle-test" | "config-matrix" | "regression-selection";

export interface TestPerspective {
  id: string;                            // "TPC-01-01" 形式
  nameJa: string;
  focusExamples: string[];               // 着眼点例（自作の日本語文、1件以上）
  relatedQualityCharacteristicIds: string[]; // qualityCharacteristicModel の QC-XX / QC-XX-YY id のみ
  recommendedTechniques: TestTechniqueId[];  // 1件以上
}
export interface TestPerspectiveCategory {
  id: string;                            // "TPC-01" 形式
  nameJa: string;
  summary: string;
  perspectives: TestPerspective[];       // 1件以上
}
export interface TestPerspectiveCatalog {
  name: string;
  note: string;                          // 自作整理であることの明示
  categories: TestPerspectiveCategory[];
}

// --- ガイドワード辞書 ---
export interface GuidewordFocusPoint {
  id: string;        // "GWF-01" 形式
  nameJa: string;
  examples: string[];
}
export interface Guideword {
  id: string;        // "GW-01" 形式
  word: string;
  meaning: string;
  questionTemplates: string[]; // "{着目点1}の{着目点2}が無い場合どうなるか" 等
}
export interface GuidewordDictionary {
  name: string;
  note: string;
  procedure: string[];              // 運用手順（出力文に必ず含める）
  focusPoints: GuidewordFocusPoint[];
  guidewords: Guideword[];
}

// --- リスク分析フレーム ---
export interface RiskAxisLevel { value: number; label: string; criteria: string; }
export interface RiskAxis { id: string; nameJa: string; description: string; levels: RiskAxisLevel[]; }
export interface RiskStakeholderFrame { id: string; nameJa: string; impactQuestions: string[]; }
export interface RiskLevelBand {
  id: string;                       // "R1".."R4"
  minScore: number; maxScore: number;
  priority: "高" | "中" | "低";
  guidance: string;
}
export interface RiskCategory {
  id: string;                              // "RC-01" 形式
  nameJa: string;
  description: string;
  probeQuestions: string[];                // 自作の日本語文、2件以上
  relatedPerspectiveCategoryIds: string[]; // testPerspectiveCatalog の TPC-XX（カテゴリID）のみ、1件以上
}
export interface ControlLoopElement {
  id: string;                 // "RCL-01" 形式
  nameJa: string;
  description: string;
}
export interface ControlFlawPattern {
  id: string;                 // "RCF-01" 形式
  nameJa: string;
  description: string;
  probeQuestions: string[];   // 自作の日本語文、2件以上
}
export interface ControlFlawFrame {
  name: string;
  note: string;                     // 自作整理である旨の明示
  loopElements: ControlLoopElement[];  // 制御ループ構成要素4件
  patterns: ControlFlawPattern[];      // "RCF-01".."RCF-04"
}
export interface RiskAnalysisFrame {
  name: string; note: string;
  impactAxis: RiskAxis;             // "RA-IMPACT" value 1..5
  likelihoodAxis: RiskAxis;         // "RA-LIKELIHOOD" value 1..5
  changeAxis: RiskAxis;             // "RA-CHANGE" 変更差分軸
  stakeholderFrames: RiskStakeholderFrame[];
  formula: string;                  // 算出式の説明文
  bands: RiskLevelBand[];           // minScore 降順で定義、区間は連続かつ重複なし
  riskCategories: RiskCategory[];   // "RC-01".. 5区分程度、非破壊拡張
  controlFlawFrame: ControlFlawFrame;
}

// --- derivedFrom 参照種別（要件/リスク/ステークホルダー/ガイドワード） ---
export type DerivedFromKind = "requirement" | "risk" | "stakeholder" | "guideword";
export interface DerivedFromRef { kind: DerivedFromKind; id: string; }
/** 文字列は「種別未指定」の従来表記。オブジェクトは種別明示の参照。 */
export type DerivedFromEntry = string | DerivedFromRef;

// --- テスト条件抽出（extract_test_conditions） ---
export type TestConditionSource = "testbase" | "stakeholder" | "risk" | "guideword";
export type TestConditionPriority = "高" | "中" | "低";

export interface TestConditionInput {
  id: string;                        // "TC-001" 形式
  target: string;                    // 対象（機能ID・画面ID）
  perspectiveCategoryId: string;     // TPC-XX（必須）
  perspectiveId?: string;            // TPC-XX-YY
  statement: string;                 // 条件文
  source: TestConditionSource;       // 必須
  derivedFrom: DerivedFromEntry[];   // 必須・1件以上（要件ID / リスクID / ペルソナID。{kind,id} で種別明示可）
  priority?: TestConditionPriority;
  impact?: number;                   // 1..5
  likelihood?: number;               // 1..5
  changeCategory?: RequirementsChangeCategory;
  riskCategoryId?: string;           // RC-XX（リスク区分）
  recommendedTechniques?: TestTechniqueId[];
  rationale?: string;                // 導出根拠の補足
  priorityDeviationReason?: string;  // 優先度基準からの逸脱理由
  sourceRefs?: TestBasisSourceRef[]; // テストベース上の根拠位置（明示指定時はこちらを優先）
}
/**
 * ペルソナ入力。Demographics / Says&Thinks / Goals / PainPoint の4象限で表現する。
 * 既存フィールド（id / role / name / concerns）は後方互換のため維持する。
 */
export interface TestConditionPersonaInput {
  id: string;
  role: string;
  name?: string;
  concerns?: string;          // 旧フィールド。painPoints 未指定時のフォールバックとして残す
  demographics?: string[];    // 属性（年齢層・職業・利用環境・IT習熟度など）
  saysAndThinks?: string[];   // 発言・思考
  goals?: string[];           // 目標
  painPoints?: string[];      // 不満点
}
/** 4象限の記入状況（未記入の象限名を列挙する） */
export interface PersonaQuadrantCompleteness { personaId: string; missingQuadrants: string[]; }
export interface TestConditionRiskInput {
  id: string; description: string;
  impact?: number; likelihood?: number; changeCategory?: RequirementsChangeCategory;
  riskCategoryId?: string;
}
export interface ExtractTestConditionsInput {
  requirementIds: string[];
  testConditions: TestConditionInput[];
  personas?: TestConditionPersonaInput[];
  risks?: TestConditionRiskInput[];
  coverageCriteria?: string[];
  priorityCriteria?: string[];
  perspectiveCategoryIds?: string[];
  idPrefix?: string;                 // 既定 "TC-"
  requirementSources?: RequirementSourceRef[]; // 要件ID → テストベース根拠位置（analyze_requirements の 2.6 から引き継ぐ）
}

// 決定的検査の結果型
export interface RequirementCoverageRow { requirementId: string; conditionIds: string[]; }
export interface TestConditionDuplicateId { id: string; count: number; }
export interface TestConditionSourceDistributionRow { source: TestConditionSource; count: number; conditionIds: string[]; }
export interface TestConditionUnresolvedRef { conditionId: string; ref: string; expectedKind: string; kind?: DerivedFromKind; }
export interface TestConditionRiskEvaluation {
  conditionId: string; score?: number; bandId?: string;
  derivedPriority?: TestConditionPriority;
  declaredPriority?: TestConditionPriority;
  deviates: boolean;               // derivedPriority と declaredPriority が両方あり不一致
  incomplete: boolean;             // impact / likelihood が欠けてスコア算出不可
}
export interface RiskCategoryDistributionRow {
  categoryId: string;      // RC-XX
  nameJa: string;
  riskIds: string[];       // riskCategoryId が一致する risks[].id（入力順）
  conditionIds: string[];  // riskCategoryId が一致する testConditions[].id（入力順）
  count: number;           // riskIds.length + conditionIds.length
}
export interface UnknownRiskCategoryRef {
  ownerKind: "risk" | "condition";
  ownerId: string;
  riskCategoryId: string;
}

// --- 技法カタログ＋技法選定決定表 ---
export interface TestTechniqueCoverageCriterion {
  id: string;                 // "TTC-COV-01"
  nameJa: string;             // 例 "境界被覆"
  definition: string;         // 何を分母・分子として数えるかを述べた自作の説明文
}
export interface TestTechniqueCatalogEntry {
  id: string;                 // "TTK-01"
  techniqueId: TestTechniqueId;
  nameJa: string;
  basisCharacteristics: string[];   // テストベースの特徴（決定表の左列）1件以上
  coverageCriteria: TestTechniqueCoverageCriterion[]; // 1件以上
  requiredInputs: string[];         // 適用に必要な収集項目（因子・水準・範囲・状態遷移など）
  engineToolName?: string;          // 決定的エンジンがある場合のツール名
  deterministic: boolean;           // 本 MCP で網羅率を決定的にカウントできるか
  selectionRationale: string;       // 選定根拠の書き方（自作の日本語文）
  note?: string;
}
export interface TestTechniqueSelectionRow {
  id: string;                       // "TTS-01"
  basisCharacteristic: string;      // 決定表の左列
  recommendedTechniqueIds: TestTechniqueId[]; // 1件以上
  coverageCriterionIds: string[];   // entries[].coverageCriteria[].id のみ、1件以上
}
export interface TestTechniqueCatalog {
  name: string;
  note: string;                     // 自作整理でありパラフレーズのみであることの明示
  entries: TestTechniqueCatalogEntry[];
  selectionTable: TestTechniqueSelectionRow[];
}

// --- テストサイズ分類基準（Test size 相当・自作整理） ---
export type TestSizeId = "small" | "medium" | "large";
export type TestLevelId =
  | "component-testing"
  | "integration-testing"
  | "system-testing"
  | "acceptance-testing";

export interface TestSizeDimension {
  id: string;            // "TSD-01" 形式
  nameJa: string;
  question: string;      // 判定用の問い（自作の日本語文）
  note?: string;
}
export interface TestSizeDefinition {
  id: string;                        // "TSZ-01" 形式
  sizeId: TestSizeId;
  nameJa: string;
  timeLimitSeconds: number;          // 実行時間上限（small=60 / medium=300 / large=1800）
  allowedDimensionIds: string[];     // このサイズで許容する判定軸（small は空配列）
  description: string;
  primaryTestLevelIds: TestLevelId[];    // 1件以上
  acceptableTestLevelIds: TestLevelId[]; // primary を含む、1件以上
  recommendedSharePercent: { min: number; max: number };
}
export interface TestSizeClassificationCriteria {
  name: string;
  note: string;                      // 自作整理・パラフレーズのみであることの明示
  dimensions: TestSizeDimension[];
  sizes: TestSizeDefinition[];       // small → medium → large の昇順で固定
  notes: string[];
}

// --- テストケース仕様（generate_test_cases / 将来の review_test_specification 共有） ---
export type TestCaseVerdict = "合格" | "不合格" | "未実施" | "対象外";
export interface TestCaseStateVariable { name: string; value: string; }   // 前提を文章1本にしない
export interface TestCaseStep { no: number; action: string; expected: string; } // 1手順1操作・期待結果は手順ごと
export interface TestCaseParameter {
  name: string;                     // ケース本文から参照する名前（例 "MAX_TICKETS"）
  value: string;                    // 直値
  unit?: string;
  source?: string;                  // 出典（要件ID・仕様箇所）
  note?: string;
}
export interface TestCaseResultRecord {
  executedDate?: string;
  executedBy?: string;
  verdict?: TestCaseVerdict;
  defectNo?: string;
}
export interface TestCaseSpec {
  caseId: string;                   // "TCS-001" 形式
  title: string;
  testConditionId: string;          // 由来（必須）
  derivedFrom: DerivedFromEntry[];   // 要件ID/機能ID/画面ID/シナリオID/リスクID（必須・1件以上。{kind,id} で種別明示可）
  techniqueId: TestTechniqueId;     // 適用技法（必須）
  coverageTargets: string[];        // 充足する網羅対象ID（必須・1件以上）
  perspectiveCategoryId?: string;
  testType?: string;                // テストタイプ
  priority?: TestConditionPriority; // 高/中/低
  preconditions: TestCaseStateVariable[]; // 必須・1件以上
  steps: TestCaseStep[];            // 必須・1件以上
  postconditions?: TestCaseStateVariable[];
  result?: TestCaseResultRecord;
  note?: string;
  sourceRefs?: TestBasisSourceRef[]; // テストベース上の根拠位置（明示指定時はこちらを優先）
  testLevel?: TestLevelId;              // 宣言したテストレベル
  externalDependencyIds?: string[];     // 該当する TSD-xx（無依存なら空配列を明示可）
  estimatedDurationSeconds?: number;    // 想定実行時間（秒）
  declaredTestSize?: TestSizeId;        // 呼び出し側が宣言したサイズ（判定との突き合わせ用）
}

// --- デシジョンテーブル設計(design_decision_table) ---
export type DecisionTableActionValue = "Y" | "N" | "-";

export interface DecisionTableConditionSpec {
  id: string;                 // 表内で一意(例 "C1")
  statement: string;          // 条件の説明(例 "券種")
  levels: string[];           // 取り得る水準。2件以上・重複不可・宣言順を保持
}
export interface DecisionTableActionSpec {
  id: string;                 // 表内で一意(例 "A1")
  statement: string;
}
/** 条件IDごとに対象水準を指定する部分割当。未指定の条件は全水準に一致する。 */
export type DecisionTableSelector = Record<string, string | string[]>;

export interface DecisionTableInvalidCombination {
  id?: string;
  when: DecisionTableSelector;
  reason: string;             // ありえない理由(必須)
}
export interface DecisionTableRuleSpec {
  id?: string;
  when: DecisionTableSelector;
  actions: Record<string, DecisionTableActionValue>; // 未指定の動作IDは "N" 扱い
  note?: string;
}
export interface DecisionTableSpec {
  tableId?: string;           // 網羅対象IDに使う。既定 "MAIN"
  title?: string;
  conditions: DecisionTableConditionSpec[];  // 1件以上
  actions: DecisionTableActionSpec[];        // 1件以上
  invalidCombinations?: DecisionTableInvalidCombination[];
  rules?: DecisionTableRuleSpec[];
  maxCombinations?: number;   // 全列挙上限。既定 4096
}

export interface DecisionTableCombination {
  index: number;                        // 1始まり、全組合せ列挙順
  values: Record<string, string>;       // conditionId -> level
  status: "valid" | "invalid";
  invalidReason?: string;
  matchedRuleIndexes: number[];         // spec.rules[] の0始まり添字(valid のみ)
  actions?: Record<string, DecisionTableActionValue>; // 一意に決まったときのみ
}
export interface DecisionTableCompressedRule {
  no: number;                                 // 1始まり
  conditionLevels: Record<string, string[]>;  // conditionId -> 採用水準(宣言順)
  dontCareConditionIds: string[];             // 全水準を含む条件ID("-" 表示対象)
  actions: Record<string, DecisionTableActionValue>;
  combinationIndexes: number[];               // 束ねた valid 組合せ index(昇順)
}
export interface DecisionTableFinding {
  categoryId: string;                   // "DTC-01" 等
  severity: "high" | "medium" | "info";
  target: string;                       // 条件ID / 動作ID / ルール表記 / 組合せ表記
  detail: string;
}
export interface DecisionTableResult {
  tableId: string;
  enumerated: boolean;
  skipReason?: string;
  conditionCount: number;
  totalCombinationCount: number;        // ∏ levels(enumerated=false でも算出)
  invalidCombinationCount: number;
  validCombinationCount: number;
  definedCombinationCount: number;      // 動作が一意に決まった valid 組合せ数
  undefinedCombinationIndexes: number[];
  conflictingCombinationIndexes: number[];
  combinations: DecisionTableCombination[]; // enumerated=false のときは空配列
  compressedRules: DecisionTableCompressedRule[];
  compressionRatioPercent: number;      // (1 - compressed/defined)*100、小数第1位。defined=0 なら 0
  findings: DecisionTableFinding[];
}

export interface DecisionTableAnalysisCriteria {
  name: string;
  summary: string;
  categories: {
    id: string;
    nameJa: string;
    severity: "high" | "medium" | "info";
    definition: string;
    recommendedAction: string;
  }[];
  notes: string[];
}

// --- 状態遷移入力（決定的層で 0/1 スイッチ被覆を数えるための最小仕様） ---
export interface StateTransitionState { id: string; nameJa: string; initial?: boolean; }
export interface StateTransitionEdge {
  id: string;                       // "ST-01"（網羅対象IDの素になる）
  from: string; to: string;
  event: string; guard?: string;
}
export interface StateTransitionSpec {
  states: StateTransitionState[];
  transitions: StateTransitionEdge[];
}

// --- generate_test_cases 入力 ---
export interface TestCaseSourceCondition {
  id: string;                       // extract_test_conditions の条件ID
  target: string;
  statement: string;
  derivedFrom: DerivedFromEntry[];   // 1件以上（{kind,id} で種別明示可）
  priority?: TestConditionPriority;
  perspectiveCategoryId?: string;
  recommendedTechniques?: TestTechniqueId[];
  basisCharacteristics?: string[];  // 決定表の左列に対応する記述（技法推奨に使う）
  sourceRefs?: TestBasisSourceRef[]; // テストベース上の根拠位置（明示指定時はこちらを優先）
}
export interface GenerateTestCasesInput {
  testConditions: TestCaseSourceCondition[];       // 1件以上
  requirementIds?: string[];                       // derivedFrom の照合先
  riskIds?: string[];                              // derivedFrom の kind:"risk" 照合先
  personaIds?: string[];                           // derivedFrom の kind:"stakeholder" 照合先
  parameters?: TestCaseParameter[];                // 閾値表
  boundaryVariables?: BoundaryVariableSpec[];      // design_boundary_values と同形
  boundaryMode?: BoundaryValueMode;
  equivalenceVariables?: EquivalencePartitioningVariableSpec[];
  stateTransition?: StateTransitionSpec;
  decisionTable?: DecisionTableSpec;               // design_decision_table と同形
  additionalCoverageTargets?: TestCaseCoverageTarget[]; // 決定的エンジンが無い技法の網羅対象を手で宣言
  testCases?: TestCaseSpec[];                      // 未指定・空なら「生成指示のみ」モード
  coverageCriteriaDeclaration?: string[];          // 宣言した網羅基準（未指定なら既定文を出力）
  additionalSubjectiveTerms?: string[];            // 主観語検査への追加語
  idPrefix?: string;                               // 既定 "TCS-"
  requirementSources?: RequirementSourceRef[];     // 要件ID → テストベース根拠位置（analyze_requirements の 2.6 から引き継ぐ）
  testBasisDocuments?: TestBasisDocument[];        // 引用文言・IDの実在照合に使うテストベース全文（未指定なら照合をスキップ）
  idPatterns?: string[];                           // ID抽出の追加パターン（実在照合で使う）
}

// --- 決定的検査の結果型（generate_test_cases） ---
export interface TestCaseCoverageTarget {
  id: string;                        // "BV:枚数:0" / "EP:年齢:成人" / "ST:ST-01"
  techniqueId: TestTechniqueId;
  description: string;               // 人が読める内容（値・クラス名・遷移内容）
  origin: string;                    // 由来（変数名 / 遷移ID / "宣言"）
}
export interface TestCaseCoverageRow {
  techniqueId: TestTechniqueId;
  criterionLabel: string;            // 網羅基準名（カタログから引く。無ければ "未定義"）
  total: number; covered: number; uncovered: number;
  ratioPercent: number;              // 小数第1位まで（total=0 のときは 0）
  uncoveredTargetIds: string[];
}
export interface TestCaseTraceRow { conditionId: string; caseIds: string[]; }
export interface TestCaseDuplicateId { id: string; count: number; }
export interface TestCaseUnresolvedRef { caseId: string; ref: string; expectedKind: string; kind?: DerivedFromKind; }
export interface TestCaseExpectedFinding {
  caseId: string; stepNo: number;
  severity: ReviewSeverity;
  term?: string;                     // 検出した主観語（空欄検査では undefined）
  detail: string;
}
export interface TestCaseStepFinding {
  caseId: string; stepNo: number;
  kind: "multi-action" | "number-gap" | "empty-action";
  detail: string;
}
export interface TestCaseHardcodedFinding {
  caseId: string; parameterName: string; value: string;
  places: string[];                  // "steps[2].action" / "preconditions[0].value" 等
}
export interface TestCaseUnknownTargetRef { caseId: string; targetId: string; }

/** 宣言した網羅対象がケース本文から裏付けられないもの（generate_test_cases 4.3） */
export interface TestCaseUnsubstantiatedTarget {
  caseId: string;
  targetId: string;
  techniqueId: TestTechniqueId;
  missing: "variable" | "value" | "class" | "transition" | "condition-combination";
  detail: string;
}

/** 期待結果の引用文言・IDがテストベースに実在しないもの（generate_test_cases 4.8） */
export interface TestCaseUngroundedQuotation {
  caseId: string;
  stepNo: number;
  place: string;                     // "steps[2].expected" / "steps[0].action"
  kind: "quotation" | "id";
  text: string;                      // 抽出した原文（正規化前）
  severity: "high";
  detail: string;
}

// --- テストレベル配分の妥当性検査（generate_test_cases 4.9） ---
export type TestSizeDecidingFactor = "dependency" | "duration" | "both" | "none";
export type TestSizeFindingSeverity = "high" | "medium" | "info";
export interface TestSizeClassificationRow {
  caseId: string;
  classifiedSize: TestSizeId;
  declaredSize?: TestSizeId;
  testLevel?: TestLevelId;
  matchedDimensionIds: string[];        // 既知の TSD-xx のみ（入力順）
  durationSeconds?: number;
  decidingFactor: TestSizeDecidingFactor; // "none" は判定入力なし
  classifiable: boolean;                // 依存・時間のいずれかが指定されていれば true
}
export interface TestSizeDistributionRow {
  sizeId: TestSizeId;
  count: number;
  sharePercent: number;                 // 小数第1位まで（分母0なら0）
  recommendedSharePercent: { min: number; max: number };
  verdict: "within" | "below" | "above";
}
export interface TestLevelDistributionRow {
  testLevel: TestLevelId | "未指定";
  count: number;
  sharePercent: number;
}
export interface TestLevelAllocationFinding {
  caseId: string;
  kind:
    | "missing-classification-input"   // 依存・時間の双方が未指定
    | "unknown-dimension"              // TSD-xx に存在しない依存ID
    | "size-declaration-mismatch"      // declaredTestSize ≠ classifiedSize
    | "level-size-mismatch"            // testLevel が acceptableTestLevelIds に無い
    | "missing-test-level"             // testLevel 未指定
    | "cross-level-duplicate";         // 同一網羅対象が複数レベルで重複
  severity: TestSizeFindingSeverity;
  detail: string;
}

// --- テスト仕様書レビュー（review_test_specification） ---
export interface ReviewTestSpecificationInput {
  testBasisDocuments: TestBasisDocument[];        // 1件以上・フォーマット不問の自由テキスト
  testSpecificationText: string;                  // テスト仕様書本文（フォーマット不問）
  testCases?: TestCaseSpec[];                     // 未指定なら ID 抽出ベースの簡易チェックのみ
  requirementIds?: string[];                      // 未指定なら testBasisDocuments から自動抽出
  testConditions?: TestCaseSourceCondition[];     // 未指定ならテスト条件軸のカバレッジ表を出力しない
  risks?: TestSpecificationRisk[];                // 未指定ならリスク軸のカバレッジ表を出力しない
  idPatterns?: string[];                          // 要件ID抽出の追加パターン
  additionalAmbiguousTerms?: string[];
  additionalSubjectiveTerms?: string[];
  idPrefix?: string;                              // 既定 "TCS-"
}

export interface TestSpecificationRisk { id: string; description: string; }

/** 要件ID / テスト条件ID / リスクID の3軸で共通利用するカバレッジ行 */
export interface TestSpecificationCoverageRow { id: string; caseIds: string[]; }

/** 逆方向カバレッジ: 既知IDに1件も一致しない参照を持つケース（根拠不明・過剰テスト候補） */
export interface TestSpecificationUnfoundedCase {
  caseId: string;
  refs: string[];                                 // 照合に失敗した参照値
  expectedKind: string;                           // 照合対象（"requirementIds[]" 等）
}

/** ID表記の同期: 完全一致しないが正規化後に一致する表記ゆれ */
export interface TestSpecificationIdSyncMismatch {
  caseId: string;
  field: "derivedFrom" | "testConditionId";
  ref: string;                                    // ケース側の表記（例 "EH100"）
  normalized: string;                             // 正規化後の値（例 "EH100"）
  matchedId: string;                              // テストベース側の定義済みID（例 "EH-100"）
}

export interface TestSpecificationPreconditionFinding {
  caseId: string;
  kind: "empty" | "placeholder-only";
  detail: string;
}

export interface TestSpecificationStepBalanceFinding {
  caseId: string;
  stepCount: number;
  uniqueExpectedCount: number;
  detail: string;
}

/** 網羅基準・優先度基準などの宣言有無のキーワード検査結果 */
export interface TestSpecificationDeclarationCheck {
  found: boolean;
  matches: { keyword: string; place: string; lineText: string }[]; // place は "document:lineIndex" 形式
}

export interface TestSpecificationPriorityCount { level: string; count: number; }

export interface TestSpecificationReviewCheckItem {
  id: string;                                     // "TS-01" 形式
  severity: ReviewSeverity;
  title: string;
  check: string;                                  // 何を確認するか（自作のパラフレーズ文）
  improvementActions: string[];
  glossaryRefs?: string[];                        // jstqbGlossary.terms の既存 id のみ
}

export interface TestSpecificationReviewChecklist {
  name: string;
  items: TestSpecificationReviewCheckItem[];
}

// --- 探索的テストチャーターカタログ ---
export interface ExploratoryCharterArea {
  id: string;                                // "ECA-01" 形式
  nameJa: string;
  summary: string;
  checkFocusExamples: string[];              // 確認観点（何を確かめるか）1件以上
  operationFocusExamples: string[];          // 操作観点（どう揺さぶるか）1件以上
  relatedPerspectiveCategoryIds: string[];   // testPerspectiveCatalog の TPC-XX（カテゴリID）のみ、1件以上
  recommendedTimeboxMinutes: number;         // 1セッションの推奨タイムボックス（分）
  stopHeuristics: string[];                  // セッション停止の目安、1件以上
}
export interface ExploratoryCharterColumn {
  id: string;                                // "ECC-01" 形式
  nameJa: string;
  description: string;
}
export interface ExploratoryCharterCatalog {
  name: string;
  note: string;                              // 自作パラフレーズであることの明示
  charterAreas: ExploratoryCharterArea[];
  tableColumns: ExploratoryCharterColumn[];  // チャーター表の固定列定義
  allocationProcedure: string[];             // リスク軸・優先度からチャーター数/時間を配分する運用手順
}

// --- 探索的テストチャーター生成（generate_exploratory_charters） ---
export interface ExploratoryCharterTestConditionInput {
  id: string;
  target: string;
  statement: string;
  derivedFrom: DerivedFromEntry[];    // 1件以上（{kind,id} で種別明示可）
  priority?: TestConditionPriority;
  perspectiveCategoryId?: string;
}

export interface ExploratoryCharterDefectRecord {
  no?: string;
  summary?: string;
  severity?: string;
}

export interface ExploratoryCharterInput {
  charterId: string;
  areaId: string;
  mission: string;
  checkFocus: string[];               // 1件以上
  operationFocus: string[];           // 1件以上
  derivedFrom: DerivedFromEntry[];     // 1件以上（{kind,id} で種別明示可）
  timeboxMinutes?: number;
  assignee?: string;
  skillLevel?: "熟練" | "中級" | "初級";
  defectRecords?: ExploratoryCharterDefectRecord[];
  note?: string;
}

export interface GenerateExploratoryChartersInput {
  testConditions: ExploratoryCharterTestConditionInput[]; // 1件以上
  risks?: TestConditionRiskInput[];
  charters?: ExploratoryCharterInput[];      // 未指定・空なら「生成指示のみ」モード
  areaIds?: string[];
  sessionBudgetMinutes?: number;
  recordingMethod?: string;
  stopConditionDeclaration?: string[];
  additionalSubjectiveTerms?: string[];
  // 境界値分析・同値分割等の決定的技法で既にテストケース化済みの条件ID。
  // 4.5 の高優先度未カバー検査から除外される（探索的テストは決定的技法の補完という位置づけ）。
  deterministicallyCoveredConditionIds?: string[];
  idPrefix?: string;                         // 既定 "EXC-"
}

// --- 決定的検査の結果型（generate_exploratory_charters） ---
export interface ExploratoryCharterDuplicateId { id: string; count: number; }
export interface ExploratoryCharterUnknownAreaRef { charterId: string; areaId: string; }
export interface ExploratoryCharterUnresolvedRef { charterId: string; ref: string; expectedKind: string; }
export interface ExploratoryCharterTimeboxSummary {
  totalMinutes: number;
  budgetMinutes?: number;
  overBudget: boolean;
  excessMinutes: number;
}
export interface ExploratoryCharterSubjectiveFinding {
  charterId: string;
  severity: "medium";
  term: string;
  detail: string;
}

// --- 曖昧語レキシコン（テスト計画書レビュー用） ---
export type AmbiguityCategory = "ambiguous" | "weak-requirement" | "non-measurable";

export interface AmbiguityTermEntry {
  id: string;                 // "AMB-01" 形式
  term: string;               // 表示用の語（例 "適切に"）
  /** 検出用の正規表現 source。未指定時は term をエスケープした literal で検出する */
  pattern?: string;
  category: AmbiguityCategory;
  reason: string;             // なぜ問題か（自作の日本語文）
  suggestion: string;         // どう書き換えるか（改善提案文）
}

export interface AmbiguityPrioritySection {
  no: string;                 // testPlanTemplate.sections の no と一致させる（例 "6.1"）
  titleJa: string;            // 見出し照合用（例 "開始・終了基準"）
  severity: ReviewSeverity;   // 既存 ReviewSeverity を再利用
}

export interface AmbiguityLexicon {
  name: string;
  note: string;
  terms: AmbiguityTermEntry[];
  prioritySections: AmbiguityPrioritySection[];
}

// --- 上流の利用状況モデリング（persona-journey-frame / generate_user_story_map） ---
export type PersonaQuadrantKey = "demographics" | "saysAndThinks" | "goals" | "painPoints";
export type StoryMapLevelKey = "persona" | "productGoal" | "activity" | "task" | "userStory";

export interface DomainAnalysisAspect {
  id: string;                  // "DOM-01" 形式
  nameJa: string;
  summary: string;
  questionExamples: string[];  // 自作の日本語文、1件以上
}
export interface PersonaQuadrantDefinition {
  id: string;                  // "PQ-01".."PQ-04"
  key: PersonaQuadrantKey;
  nameJa: string;
  definition: string;
  questionExamples: string[];
  badExamples: string[];       // 書いてはいけない例（曖昧・属性と目標の混同など）
}
export interface StoryMapLevelDefinition {
  id: string;                  // "USM-01".."USM-05"
  key: StoryMapLevelKey;
  nameJa: string;
  definition: string;
  granularityGuidance: string;
}
export interface TestRequirementFrameColumn {
  id: string;                  // "TRF-01".."TRF-03"
  nameJa: string;              // "現状(Before)" / "将来(After)" / "テスト要求"
  definition: string;
}
export interface TestRequirementFrame {
  columns: TestRequirementFrameColumn[];
  handoverConvention: string[]; // extract_test_conditions への引き渡し規約
}
export interface PersonaJourneyFrame {
  name: string;
  note: string;                // 自作整理であり外部文献の逐語転載・特定基準への適合を主張しない旨
  domainAnalysisAspects: DomainAnalysisAspect[];
  personaQuadrants: PersonaQuadrantDefinition[];
  storyMapLevels: StoryMapLevelDefinition[];
  testRequirementFrame: TestRequirementFrame;
}

export interface DomainAnalysisFindingInput { aspectId: string; findings: string[]; }
export interface UserStoryMapActivityInput {
  id: string;
  personaIds: string[];
  productGoal: string;
  activity: string;
}
export interface UserStoryMapTaskInput { id: string; activityId: string; task: string; }
export interface UserStoryMapStoryInput {
  id: string;
  taskId: string;
  story: string;
  personaIds?: string[];
  priority?: TestConditionPriority;
}
export interface TestRequirementInput {
  id: string;
  personaId: string;
  storyIds?: string[];
  before: string;
  after: string;
  testRequirement: string;
}
export interface UserStoryMapIdPrefixes {
  activity?: string;
  task?: string;
  story?: string;
  testRequirement?: string;
}
export interface GenerateUserStoryMapInput {
  subjectName?: string;
  domainAnalysis?: DomainAnalysisFindingInput[];
  personas: TestConditionPersonaInput[];
  activities?: UserStoryMapActivityInput[];
  tasks?: UserStoryMapTaskInput[];
  stories?: UserStoryMapStoryInput[];
  testRequirements?: TestRequirementInput[];
  idPrefixes?: UserStoryMapIdPrefixes;
}

// 決定的検査の結果型（generate_user_story_map）
export type StoryMapEntityKind = "activity" | "task" | "story" | "testRequirement";
export interface StoryMapDuplicateId { kind: StoryMapEntityKind; id: string; count: number; }
export interface StoryMapIdIssue { kind: StoryMapEntityKind; id: string; expectedPrefix: string; }
export interface StoryMapUnresolvedRef { ownerId: string; ref: string; expectedKind: string; }
export interface IncompleteTestRequirementRow { id: string; missingFields: string[]; }

// --- ID母集団監査（audit_id_population） ---
export interface DeclaredIdPopulation {
  toolName: string; // 例: "extract_test_conditions"
  label?: string; // 例: "V04 テスト分析 requirementIds"
  ids: string[];
}
export interface IdPopulationExclusion {
  id: string;
  reason: string;
}

export interface AuditIdPopulationInput {
  documents: TestBasisDocument[];
  declaredPopulations: DeclaredIdPopulation[];
  exclusions?: IdPopulationExclusion[];
  expectedDocumentNames?: string[];
  idPatterns?: string[];
}

export interface DefinedIdEntry {
  id: string;
  document: string;
  lineIndex: number;
  heading: string;
}
export interface IdPopulationRow {
  id: string;
  document: string;
  lineIndex: number;
  heading: string;
  declaredIn: string[]; // 含まれていた母集団のラベル（入力順）
  status: "declared" | "excluded" | "never-declared";
  exclusionReason?: string;
}
export interface UndefinedPopulationId {
  id: string;
  populations: string[];
}
export interface DocumentPopulationStat {
  document: string;
  definedCount: number;
  declaredCount: number;
  declarationRate: number; // 0..100、小数第1位で丸め
  neverDeclaredIds: string[];
}
export interface PopulationDiffRow {
  population: string;
  idCount: number;
  missingIds: string[]; // 最大母集団に対する欠落
}
export interface IdPopulationSummary {
  definedTotal: number;
  declaredTotal: number;
  excludedTotal: number;
  neverDeclaredTotal: number;
  declarationRate: number;
  undefinedPopulationIdTotal: number;
  missingDocumentTotal: number;
}

export interface IdPopulationAuditCategory {
  id: string;
  nameJa: string;
  severity: "high" | "medium" | "info";
  description: string;
  action: string;
}
export interface IdPopulationAuditCriteria {
  name: string;
  summary: string;
  categories: IdPopulationAuditCategory[];
  notes: string[];
}

// --- 閾値変更の影響再展開（reexpand_threshold_changes） ---
export type ThresholdParameterChangeKind =
  | "added"
  | "removed"
  | "value-changed"
  | "unit-changed"
  | "value-unit-changed"
  | "unchanged";

export interface ThresholdParameterDiffRow {
  name: string;
  kind: ThresholdParameterChangeKind;
  beforeValue?: string;
  afterValue?: string;
  beforeUnit?: string;
  afterUnit?: string;
  source?: string;
}

export type ThresholdArtifactKind = "testCondition" | "testCase";
export type ThresholdReferenceForm = "name" | "stale-literal" | "current-literal";

export interface ThresholdReferenceRow {
  parameterName: string;
  ownerKind: ThresholdArtifactKind;
  ownerId: string;
  place: string;
  form: ThresholdReferenceForm;
  matchedText?: string;
}

export type ThresholdReexpansionVerdict = "changed" | "added" | "removed" | "unchanged";

export interface ThresholdBoundaryReexpansionRow {
  variable: string;
  label: string;
  validity: "valid" | "invalid";
  beforeValue?: number;
  afterValue?: number;
  beforeTargetId?: string;
  afterTargetId?: string;
  verdict: ThresholdReexpansionVerdict;
}

export interface ThresholdEquivalenceReexpansionRow {
  variable: string;
  label: string;
  kind: "valid" | "invalid";
  targetId: string;
  beforeRepresentative?: string;
  afterRepresentative?: string;
  verdict: ThresholdReexpansionVerdict;
}

export type ThresholdBindingIssueKind =
  | "parameter-not-found"
  | "non-numeric-parameter"
  | "missing-bound";

export interface ThresholdBindingIssue {
  snapshot: "before" | "after";
  variable: string;
  bound: "min" | "max" | "representative";
  parameterName?: string;
  kind: ThresholdBindingIssueKind;
  detail: string;
}

export interface ThresholdChangeFinding {
  categoryId: string;
  severity: "high" | "medium" | "info";
  parameterName?: string;
  ownerKind?: ThresholdArtifactKind;
  ownerId?: string;
  places: string[];
  detail: string;
  suggestion?: string;
}

export type ThresholdArtifactVerdict = "要修正" | "要再確認" | "影響なし";

export interface ThresholdImpactedArtifactRow {
  ownerKind: ThresholdArtifactKind;
  ownerId: string;
  title: string;
  parameterNames: string[];
  categoryIds: string[];
  verdict: ThresholdArtifactVerdict;
}

export interface ThresholdChangeSummary {
  changedParameterCount: number;
  addedParameterCount: number;
  removedParameterCount: number;
  reexpandedTargetCount: number;
  staleLiteralCount: number;
  danglingTargetRefCount: number;
  mustFixArtifactCount: number;
  recheckArtifactCount: number;
  bindingIssueCount: number;
}

export interface ThresholdBoundaryBinding {
  name: string;
  minParameterName?: string;
  min?: number;
  maxParameterName?: string;
  max?: number;
  valueType?: BoundaryVariableType;
  step?: number;
}

export interface ThresholdEquivalenceClassBinding {
  label: string;
  kind: "valid" | "invalid";
  representativeParameterName?: string;
  representative?: string;
  description?: string;
}

export interface ThresholdEquivalenceBinding {
  name: string;
  classes: ThresholdEquivalenceClassBinding[];
}

export interface ThresholdChangeTestCondition {
  id: string;
  statement: string;
  target?: string;
}

// TestCaseSpec を再利用しない理由: TestCaseSpec は generate_test_cases 用に
// derivedFrom / techniqueId / coverageTargets 等の必須フィールドが多く、
// 「既存成果物の一部だけを渡して差分確認する」という本ツールのユースケースを弾いてしまう。
// そのため、参照検査・網羅対象失効検出に必要な最小限のフィールドだけを持つ緩い専用型とする。
export interface ThresholdChangeTestCase {
  caseId: string;
  title: string;
  testConditionId?: string;
  coverageTargets?: string[];
  preconditions?: { name: string; value: string }[];
  steps?: { no: number; action: string; expected: string }[];
  postconditions?: { name: string; value: string }[];
  note?: string;
}

export interface ReexpandThresholdChangesInput {
  parametersBefore: TestCaseParameter[];
  parametersAfter: TestCaseParameter[];
  testConditions?: ThresholdChangeTestCondition[];
  testCases?: ThresholdChangeTestCase[];
  boundaryBindings?: ThresholdBoundaryBinding[];
  boundaryMode?: BoundaryValueMode;
  equivalenceBindings?: ThresholdEquivalenceBinding[];
}

export interface ThresholdChangeImpactCriteria {
  name: string;
  summary: string;
  categories: {
    id: string;
    nameJa: string;
    severity: "high" | "medium" | "info";
    description: string;
    action: string;
  }[];
  notes: string[];
}

// --- analyze_cause_effect（原因結果グラフ分析） ---

export type CauseEffectNodeKind = "cause" | "intermediate" | "effect";
export type CauseEffectLogic = "and" | "or";
export type CauseEffectEdgeKind = "identity" | "not";
export type CauseEffectConstraintType = "exclusive" | "inclusive" | "onlyOne" | "requires" | "masks";

export interface CauseEffectCauseInput {
  id: string;
  statement: string;
  quote?: string;
  note?: string;
}

export interface CauseEffectIntermediateInput {
  id: string;
  statement: string;
  logic?: CauseEffectLogic;
  note?: string;
}

export interface CauseEffectEffectInput {
  id: string;
  statement: string;
  logic?: CauseEffectLogic;
  quote?: string;
  note?: string;
}

export interface CauseEffectEdgeInput {
  from: string;
  to: string;
  kind?: CauseEffectEdgeKind;
  note?: string;
}

export interface CauseEffectConstraintInput {
  id: string;
  type: CauseEffectConstraintType;
  nodeIds: string[];
  note?: string;
}

export interface AnalyzeCauseEffectInput {
  sectionId: string;
  sectionTitle?: string;
  specText: string;
  causes: CauseEffectCauseInput[];
  effects: CauseEffectEffectInput[];
  intermediateNodes?: CauseEffectIntermediateInput[];
  edges: CauseEffectEdgeInput[];
  constraints?: CauseEffectConstraintInput[];
  expectedRuleCount?: number;
  maxEnumerationCauses?: number;
  causeIdPrefix?: string;
  effectIdPrefix?: string;
  intermediateIdPrefix?: string;
  constraintIdPrefix?: string;
  additionalAmbiguousTerms?: string[];
}

export interface CauseEffectNode {
  id: string;
  kind: CauseEffectNodeKind;
  statement: string;
  logic: CauseEffectLogic;
  quote?: string;
  note?: string;
  incoming: CauseEffectEdgeInput[];
  outgoing: CauseEffectEdgeInput[];
}

export interface CauseEffectGraph {
  nodes: CauseEffectNode[];
  nodeById: Map<string, CauseEffectNode>;
  edges: (CauseEffectEdgeInput & { kind: CauseEffectEdgeKind })[];
  causeIds: string[];
  effectIds: string[];
  intermediateIds: string[];
}

export interface CauseEffectFinding {
  categoryId: string;
  severity: "high" | "medium" | "info";
  targetId?: string;
  place?: string;
  detail: string;
  suggestion?: string;
}

export interface CauseEffectRule {
  no: number;
  causeValues: Record<string, "T" | "F" | "-">;
  effectValues: Record<string, "T" | "F" | "-">;
}

export interface CauseEffectEnumeration {
  enumerated: boolean;
  skipReason?: string;
  causeCount: number;
  theoreticalCombinationCount: number;
  validCombinationCount: number;
  rules: CauseEffectRule[];
  compressedRules: CauseEffectRule[];
}

export interface CauseEffectSentence {
  no: number;
  text: string;
  normalized: string;
  modeled: boolean;
  nodeIds: string[];
}

export interface CauseEffectSummary {
  causeCount: number;
  effectCount: number;
  intermediateCount: number;
  edgeCount: number;
  constraintCount: number;
  theoreticalCombinationCount: number;
  validCombinationCount: number;
  compressedRuleCount: number;
  enumerated: boolean;
  modeledSentenceCount: number;
  totalSentenceCount: number;
  modeledSentenceRatioPercent: number;
  highCount: number;
  mediumCount: number;
  infoCount: number;
}

export interface CauseEffectDecisionTableHandover {
  sectionId: string;
  conditions: { id: string; statement: string; values: ["T", "F"] }[];
  actions: { id: string; statement: string }[];
  rules: { no: number; conditions: Record<string, string>; actions: Record<string, string> }[];
  theoreticalCombinationCount: number;
  validCombinationCount: number;
  compressedRuleCount: number;
}

export interface CauseEffectAnalysisCriteria {
  name: string;
  summary: string;
  categories: {
    id: string;
    nameJa: string;
    severity: "high" | "medium" | "info";
    description: string;
    action: string;
  }[];
  notes: string[];
}
