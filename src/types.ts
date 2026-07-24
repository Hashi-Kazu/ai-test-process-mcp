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
