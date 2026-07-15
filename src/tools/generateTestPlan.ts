import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  testPlanTemplate,
  testTypeCatalog,
  judgmentStatusDefinitions,
  incidentRankDefinitions,
  questionPriorityDefinitions,
  executionRecordNotes,
  standardMetrics,
} from "../resources/testPlanTemplate.js";
import type {
  TestPlanTemplate,
  TestPlanTemplateSection,
  TestPlanInput,
  TestPlanRisk,
  TestPlanTeamMember,
} from "../types.js";

const TBD = "_未記入_";
const TBD_REQUIRED = "_未記入（必須）_";

export const generateTestPlanInputShape = {
  projectName: z.string().describe("Name of the project or system under test"),
  scope: z.string().describe("What is in scope for testing (features, systems, boundaries)"),
  objectives: z.array(z.string()).optional().describe("Test objectives / goals"),
  featuresToTest: z.array(z.string()).optional(),
  featuresNotToTest: z.array(z.string()).optional(),
  risks: z
    .array(
      z.object({
        description: z.string(),
        impact: z.enum(["low", "medium", "high"]).optional(),
        mitigation: z.string().optional(),
      })
    )
    .optional(),
  scheduleConstraints: z
    .object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      milestones: z.array(z.object({ name: z.string(), date: z.string() })).optional(),
    })
    .optional(),
  team: z
    .array(
      z.object({
        role: z.string(),
        name: z.string().optional(),
        responsibilities: z.string().optional(),
      })
    )
    .optional(),
  environment: z.string().optional().describe("Test environment needs (hardware, software, data, tools)"),
  deliverables: z.array(z.string()).optional(),
  passFailCriteria: z.string().optional(),
  suspensionCriteria: z.string().optional(),
  approvers: z.array(z.string()).optional(),
  systemOverview: z
    .object({
      name: z.string().optional(),
      users: z.string().optional(),
      purpose: z.string().optional(),
      detail: z.string().optional(),
      devType: z.string().optional(),
    })
    .optional(),
  references: z
    .array(
      z.object({
        name: z.string(),
        author: z.string().optional(),
        version: z.string().optional(),
        receivedDate: z.string().optional(),
        note: z.string().optional(),
      })
    )
    .optional(),
  background: z
    .object({
      current: z.string().optional(),
      concerns: z.string().optional(),
    })
    .optional(),
  testLevels: z.array(z.string()).optional(),
  revisionContent: z.array(z.string()).optional(),
  testItems: z
    .array(z.object({ name: z.string(), summary: z.string().optional() }))
    .optional(),
  selectedTestTypes: z.array(z.string()).optional(),
  testTechniques: z
    .array(
      z.object({
        testType: z.string(),
        approach: z.string().optional(),
        technique: z.string().optional(),
      })
    )
    .optional(),
  testPeriod: z.string().optional(),
  startCriteria: z.string().optional(),
  endCriteria: z.string().optional(),
  completionCriteria: z.array(z.string()).optional(),
  metricsNote: z.string().optional(),
  testDataRequirements: z
    .array(
      z.object({
        description: z.string(),
        owner: z.string().optional(),
        period: z.string().optional(),
      })
    )
    .optional(),
  stakeholders: z
    .array(
      z.object({
        role: z.string(),
        name: z.string().optional(),
        contact: z.string().optional(),
      })
    )
    .optional(),
  assumptions: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  glossary: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
  referenceDocs: z
    .array(z.object({ name: z.string(), description: z.string().optional() }))
    .optional(),
  notes: z.string().optional(),
} as const;

const generateTestPlanInputSchema = z.object(generateTestPlanInputShape);
export type GenerateTestPlanInput = z.infer<typeof generateTestPlanInputSchema>;

function requiredTbd(required: boolean): string {
  return required ? TBD_REQUIRED : TBD;
}

function listOrTbd(items: string[] | undefined, required = false): string {
  if (!items || items.length === 0) return requiredTbd(required);
  return items.map((item) => `- ${item}`).join("\n");
}

function textOrTbd(value: string | undefined, required = false): string {
  return value && value.trim() ? value : requiredTbd(required);
}

function risksOrTbd(risks: TestPlanRisk[] | undefined, required = false): string {
  if (!risks || risks.length === 0) return requiredTbd(required);
  return risks
    .map((risk) => {
      const parts = [`- ${risk.description}`];
      if (risk.impact) parts.push(`(影響: ${risk.impact})`);
      if (risk.mitigation) parts.push(`— 対策: ${risk.mitigation}`);
      return parts.join(" ");
    })
    .join("\n");
}

function teamOrTbd(team: TestPlanTeamMember[] | undefined, required = false): string {
  if (!team || team.length === 0) return requiredTbd(required);
  return team
    .map((member) => {
      const namePart = member.name ? ` (${member.name})` : "";
      const respPart = member.responsibilities ? `: ${member.responsibilities}` : "";
      return `- ${member.role}${namePart}${respPart}`;
    })
    .join("\n");
}

function scheduleOrTbd(schedule: TestPlanInput["scheduleConstraints"], required = false): string {
  if (!schedule || (!schedule.startDate && !schedule.endDate && !schedule.milestones?.length)) {
    return requiredTbd(required);
  }
  const lines: string[] = [];
  lines.push(`- 開始: ${schedule.startDate ?? TBD}`);
  lines.push(`- 終了: ${schedule.endDate ?? TBD}`);
  if (schedule.milestones && schedule.milestones.length > 0) {
    lines.push("- マイルストーン:");
    for (const milestone of schedule.milestones) {
      lines.push(`  - ${milestone.name}: ${milestone.date}`);
    }
  }
  return lines.join("\n");
}

function backgroundContent(input: TestPlanInput, required: boolean): string {
  const bg = input.background;
  if (!bg || (!bg.current && !bg.concerns)) return requiredTbd(required);
  const lines: string[] = [];
  if (bg.current) lines.push(`**現状:** ${bg.current}`);
  if (bg.concerns) lines.push(`**懸念:** ${bg.concerns}`);
  return lines.join("\n\n");
}

function referencesContent(input: TestPlanInput, required: boolean): string {
  const refs = input.references;
  if (!refs || refs.length === 0) return requiredTbd(required);
  const lines: string[] = [];
  lines.push("| 名称 | 作成者 | バージョン | 受領日 | 備考 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const ref of refs) {
    lines.push(
      `| ${ref.name} | ${ref.author ?? "-"} | ${ref.version ?? "-"} | ${ref.receivedDate ?? "-"} | ${ref.note ?? "-"} |`
    );
  }
  return lines.join("\n");
}

function referencesTestbaseContent(input: TestPlanInput, required: boolean): string {
  const hasRefs = !!(input.references && input.references.length > 0);
  const hasDocs = !!(input.referenceDocs && input.referenceDocs.length > 0);
  if (!hasRefs && !hasDocs) return requiredTbd(required);
  const lines: string[] = [];
  if (hasRefs) lines.push(referencesContent(input, false));
  if (hasDocs) {
    if (hasRefs) lines.push("");
    lines.push("**参考文献:**");
    lines.push(referenceDocsContent(input, false));
  }
  return lines.join("\n");
}

function scopeObjectivesContent(input: TestPlanInput, required: boolean): string {
  const lines: string[] = [];
  lines.push(`**スコープ:** ${textOrTbd(input.scope, required)}`);
  if (input.objectives && input.objectives.length > 0) {
    lines.push("");
    lines.push("**目的・目標:**");
    lines.push(listOrTbd(input.objectives));
  }
  return lines.join("\n");
}

function testItemsContent(input: TestPlanInput, required: boolean): string {
  const items = input.testItems;
  const overview = input.systemOverview;
  const overviewLines: string[] = [];
  if (overview) {
    if (overview.name) overviewLines.push(`- 名称: ${overview.name}`);
    if (overview.purpose) overviewLines.push(`- 目的: ${overview.purpose}`);
    if (overview.users) overviewLines.push(`- 利用者: ${overview.users}`);
    if (overview.devType) overviewLines.push(`- 開発形態: ${overview.devType}`);
    if (overview.detail) overviewLines.push(`- 詳細: ${overview.detail}`);
  }
  const itemsBody =
    items && items.length > 0
      ? items.map((item) => `- ${item.name}${item.summary ? `: ${item.summary}` : ""}`).join("\n")
      : null;
  if (!itemsBody && overviewLines.length === 0) return requiredTbd(required);
  const lines: string[] = [];
  if (overviewLines.length > 0) {
    lines.push("**システム概要:**");
    lines.push(...overviewLines);
    if (itemsBody) lines.push("");
  }
  lines.push(itemsBody ?? requiredTbd(required));
  return lines.join("\n");
}

function testTypesContent(input: TestPlanInput): string {
  const selected = new Set(input.selectedTestTypes ?? []);
  const lines: string[] = [];
  lines.push("| 対象 | テストタイプ | 説明 |");
  lines.push("| --- | --- | --- |");
  for (const t of testTypeCatalog) {
    const mark = selected.has(t.name) ? "〇" : "";
    lines.push(`| ${mark} | ${t.name} | ${t.description} |`);
  }
  return lines.join("\n");
}

function testTechniquesContent(input: TestPlanInput, required: boolean): string {
  const techs = input.testTechniques;
  if (!techs || techs.length === 0) return requiredTbd(required);
  const lines: string[] = [];
  lines.push("| テストタイプ | アプローチ | 技法 |");
  lines.push("| --- | --- | --- |");
  for (const t of techs) {
    lines.push(`| ${t.testType} | ${t.approach ?? "-"} | ${t.technique ?? "-"} |`);
  }
  return lines.join("\n");
}

function startEndCriteriaContent(input: TestPlanInput, required: boolean): string {
  if (!input.startCriteria && !input.endCriteria) return requiredTbd(required);
  const lines: string[] = [];
  lines.push(`**開始基準:** ${input.startCriteria ?? TBD}`);
  lines.push(`**終了基準:** ${input.endCriteria ?? TBD}`);
  return lines.join("\n\n");
}

function resultJudgmentContent(input: TestPlanInput): string {
  const lines: string[] = [];
  lines.push(input.passFailCriteria ?? TBD_REQUIRED);
  lines.push("");
  lines.push("**判定ステータス定義:**");
  lines.push("");
  lines.push("| ステータス | 説明 |");
  lines.push("| --- | --- |");
  for (const s of judgmentStatusDefinitions) {
    lines.push(`| ${s.status} | ${s.description} |`);
  }
  return lines.join("\n");
}

function incidentCriteriaContent(): string {
  const lines: string[] = [];
  lines.push("| ランク | 説明 |");
  lines.push("| --- | --- |");
  for (const r of incidentRankDefinitions) {
    lines.push(`| ${r.rank} | ${r.description} |`);
  }
  return lines.join("\n");
}

function questionPriorityContent(): string {
  const lines: string[] = [];
  lines.push("| 重要度 | 説明 |");
  lines.push("| --- | --- |");
  for (const q of questionPriorityDefinitions) {
    lines.push(`| ${q.level} | ${q.description} |`);
  }
  return lines.join("\n");
}

function executionRecordContent(): string {
  return executionRecordNotes.map((note, i) => `${i + 1}. ${note}`).join("\n");
}

function metricsContent(input: TestPlanInput): string {
  const lines: string[] = [];
  lines.push("| メトリクス | 収集項目 |");
  lines.push("| --- | --- |");
  for (const m of standardMetrics) {
    lines.push(`| ${m.name} | ${m.items} |`);
  }
  if (input.metricsNote && input.metricsNote.trim()) {
    lines.push("");
    lines.push(input.metricsNote);
  }
  return lines.join("\n");
}

function testDataRequirementsContent(input: TestPlanInput, required: boolean): string {
  const reqs = input.testDataRequirements;
  if (!reqs || reqs.length === 0) return requiredTbd(required);
  const lines: string[] = [];
  lines.push("| 内容 | 準備担当 | 期間 |");
  lines.push("| --- | --- | --- |");
  for (const r of reqs) {
    lines.push(`| ${r.description} | ${r.owner ?? "-"} | ${r.period ?? "-"} |`);
  }
  return lines.join("\n");
}

function stakeholdersContent(input: TestPlanInput, required: boolean): string {
  const sh = input.stakeholders;
  if (!sh || sh.length === 0) return requiredTbd(required);
  return sh
    .map((s) => {
      const namePart = s.name ? ` (${s.name})` : "";
      const contactPart = s.contact ? ` — ${s.contact}` : "";
      return `- ${s.role}${namePart}${contactPart}`;
    })
    .join("\n");
}

function assumptionsConstraintsContent(input: TestPlanInput, required: boolean): string {
  const hasAny =
    (input.assumptions && input.assumptions.length > 0) ||
    (input.constraints && input.constraints.length > 0);
  if (!hasAny) return requiredTbd(required);
  const lines: string[] = [];
  lines.push("**前提条件:**");
  lines.push(listOrTbd(input.assumptions));
  lines.push("");
  lines.push("**制限事項:**");
  lines.push(listOrTbd(input.constraints));
  return lines.join("\n");
}

function glossaryContent(input: TestPlanInput, required: boolean): string {
  const g = input.glossary;
  if (!g || g.length === 0) return requiredTbd(required);
  return g.map((entry) => `- **${entry.term}**: ${entry.definition}`).join("\n");
}

function referenceDocsContent(input: TestPlanInput, required: boolean): string {
  const docs = input.referenceDocs;
  if (!docs || docs.length === 0) return requiredTbd(required);
  return docs
    .map((doc) => `- ${doc.name}${doc.description ? `: ${doc.description}` : ""}`)
    .join("\n");
}

function sectionContent(section: TestPlanTemplateSection, input: TestPlanInput): string {
  const req = section.required;
  switch (section.id) {
    case "scope-objectives":
      return scopeObjectivesContent(input, req);
    case "background":
      return backgroundContent(input, req);
    case "references-testbase":
      return referencesTestbaseContent(input, req);
    case "assumptions-constraints":
      return assumptionsConstraintsContent(input, req);
    case "glossary":
      return glossaryContent(input, req);
    case "test-items":
      return testItemsContent(input, req);
    case "features-to-be-tested":
      return listOrTbd(input.featuresToTest, req);
    case "features-not-to-be-tested":
      return listOrTbd(input.featuresNotToTest, req);
    case "test-levels":
      return listOrTbd(input.testLevels, req);
    case "test-types":
      return testTypesContent(input);
    case "test-techniques":
      return testTechniquesContent(input, req);
    case "start-end-criteria":
      return startEndCriteriaContent(input, req);
    case "result-judgment":
      return resultJudgmentContent(input);
    case "completion-criteria":
      return listOrTbd(input.completionCriteria, req);
    case "incident-criteria":
      return incidentCriteriaContent();
    case "question-priority":
      return questionPriorityContent();
    case "suspension-resumption-criteria":
      return textOrTbd(input.suspensionCriteria, req);
    case "test-deliverables":
      return listOrTbd(input.deliverables, req);
    case "execution-record":
      return executionRecordContent();
    case "collected-metrics":
      return metricsContent(input);
    case "env-requirements":
      return textOrTbd(input.environment, req);
    case "testdata-requirements":
      return testDataRequirementsContent(input, req);
    case "test-org":
      return teamOrTbd(input.team, req);
    case "stakeholders":
      return stakeholdersContent(input, req);
    case "test-period":
      return textOrTbd(input.testPeriod, req);
    case "schedule-plan":
      return scheduleOrTbd(input.scheduleConstraints, req);
    case "product-risk":
      return risksOrTbd(input.risks, req);
    case "approvers":
      return listOrTbd(input.approvers, req);
    case "notes":
      return textOrTbd(input.notes, req);
    default:
      return requiredTbd(req);
  }
}

function revisionHistory(input: TestPlanInput): string[] {
  const approver = input.approvers && input.approvers.length > 0 ? input.approvers.join("、") : TBD;
  const changeContent =
    input.revisionContent && input.revisionContent.length > 0
      ? input.revisionContent.join("；")
      : "初版作成";
  return [
    "## 改訂履歴",
    "",
    "| 改訂日 | バージョン | 作成・改訂者 | 承認者 | 改訂内容 |",
    "| --- | --- | --- | --- | --- |",
    `| ${TBD} | ${TBD} | ${TBD} | ${approver} | ${changeContent} |`,
  ];
}

export function renderTestPlan(
  input: TestPlanInput,
  template: TestPlanTemplate = testPlanTemplate
): string {
  const lines: string[] = [];
  lines.push(`# テスト計画書: ${input.projectName}`);
  lines.push("");
  lines.push(`*${template.templateName}*`);
  lines.push("");
  lines.push(...revisionHistory(input));
  lines.push("");

  const sections = template.sections;
  sections.forEach((section, index) => {
    const heading = section.level === 1 ? "##" : "###";
    lines.push(`${heading} ${section.no} ${section.titleJa}`);
    lines.push("");

    // level 1 の章に子(level 2)がある場合は見出しのみ。
    // それ以外（level 2、または子を持たない level 1）は本文を出力する。
    const next = sections[index + 1];
    const hasChildren = section.level === 1 && next?.level === 2;
    if (!hasChildren) {
      lines.push(sectionContent(section, input));
      lines.push("");
    }
  });

  return lines.join("\n").trimEnd() + "\n";
}

export function registerGenerateTestPlanTool(server: McpServer): void {
  server.registerTool(
    "create_test_plan",
    {
      title: "Generate Test Plan Draft",
      description:
        "ISO/IEC/IEEE 29119-3 準拠・15章構成の日本語テスト計画書ドラフトを生成。未入力項目は 未記入 と明示。",
      inputSchema: generateTestPlanInputShape,
    },
    async (input) => {
      const markdown = renderTestPlan(input as TestPlanInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
