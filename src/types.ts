export interface Iso29119Section {
  id: string;
  title: string;
  standardRef: string;
  description: string;
  requiredFields: string[];
}

export interface Iso29119TestPlanStructure {
  standard: string;
  documentType: string;
  sections: Iso29119Section[];
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
}
