export interface Iso29119Section {
  id: string;
  title: string;
  titleJa: string;
  standardRef: string;
  description: string;
  requiredFields: string[];
}

export interface Iso29119TestPlanStructure {
  standard: string;
  documentType: string;
  sections: Iso29119Section[];
}

export interface TestPlanTemplateSection {
  id: string;
  no: string;
  titleJa: string;
  level: 1 | 2;
  required: boolean;
  isoRef?: string;
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
