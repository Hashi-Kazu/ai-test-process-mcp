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
  derivedFrom: string[];             // 必須・1件以上（要件ID / リスクID / ペルソナID）
  priority?: TestConditionPriority;
  impact?: number;                   // 1..5
  likelihood?: number;               // 1..5
  changeCategory?: RequirementsChangeCategory;
  riskCategoryId?: string;           // RC-XX（リスク区分）
  recommendedTechniques?: TestTechniqueId[];
  rationale?: string;                // 導出根拠の補足
  priorityDeviationReason?: string;  // 優先度基準からの逸脱理由
}
export interface TestConditionPersonaInput { id: string; role: string; name?: string; concerns?: string; }
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
}

// 決定的検査の結果型
export interface RequirementCoverageRow { requirementId: string; conditionIds: string[]; }
export interface TestConditionDuplicateId { id: string; count: number; }
export interface TestConditionSourceDistributionRow { source: TestConditionSource; count: number; conditionIds: string[]; }
export interface TestConditionUnresolvedRef { conditionId: string; ref: string; expectedKind: string; }
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
  derivedFrom: string[];            // 要件ID/機能ID/画面ID/シナリオID/リスクID（必須・1件以上）
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
  derivedFrom: string[];            // 1件以上
  priority?: TestConditionPriority;
  perspectiveCategoryId?: string;
  recommendedTechniques?: TestTechniqueId[];
  basisCharacteristics?: string[];  // 決定表の左列に対応する記述（技法推奨に使う）
}
export interface GenerateTestCasesInput {
  testConditions: TestCaseSourceCondition[];       // 1件以上
  requirementIds?: string[];                       // derivedFrom の照合先
  parameters?: TestCaseParameter[];                // 閾値表
  boundaryVariables?: BoundaryVariableSpec[];      // design_boundary_values と同形
  boundaryMode?: BoundaryValueMode;
  equivalenceVariables?: EquivalencePartitioningVariableSpec[];
  stateTransition?: StateTransitionSpec;
  additionalCoverageTargets?: TestCaseCoverageTarget[]; // 決定的エンジンが無い技法の網羅対象を手で宣言
  testCases?: TestCaseSpec[];                      // 未指定・空なら「生成指示のみ」モード
  coverageCriteriaDeclaration?: string[];          // 宣言した網羅基準（未指定なら既定文を出力）
  additionalSubjectiveTerms?: string[];            // 主観語検査への追加語
  idPrefix?: string;                               // 既定 "TCS-"
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
export interface TestCaseUnresolvedRef { caseId: string; ref: string; expectedKind: string; }
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
