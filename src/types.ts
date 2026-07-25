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
