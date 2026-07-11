import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { iso29119TestPlanStructure } from "../resources/iso29119.js";
import type {
  Iso29119TestPlanStructure,
  TestPlanInput,
  TestPlanRisk,
  TestPlanTeamMember,
} from "../types.js";

const TBD = "_TBD — not provided by caller_";

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
} as const;

const generateTestPlanInputSchema = z.object(generateTestPlanInputShape);
export type GenerateTestPlanInput = z.infer<typeof generateTestPlanInputSchema>;

function listOrTbd(items: string[] | undefined): string {
  if (!items || items.length === 0) return TBD;
  return items.map((item) => `- ${item}`).join("\n");
}

function risksOrTbd(risks: TestPlanRisk[] | undefined): string {
  if (!risks || risks.length === 0) return TBD;
  return risks
    .map((risk) => {
      const parts = [`- ${risk.description}`];
      if (risk.impact) parts.push(`(impact: ${risk.impact})`);
      if (risk.mitigation) parts.push(`— mitigation: ${risk.mitigation}`);
      return parts.join(" ");
    })
    .join("\n");
}

function teamOrTbd(team: TestPlanTeamMember[] | undefined): string {
  if (!team || team.length === 0) return TBD;
  return team
    .map((member) => {
      const namePart = member.name ? ` (${member.name})` : "";
      const respPart = member.responsibilities ? `: ${member.responsibilities}` : "";
      return `- ${member.role}${namePart}${respPart}`;
    })
    .join("\n");
}

function scheduleOrTbd(schedule: TestPlanInput["scheduleConstraints"]): string {
  if (!schedule || (!schedule.startDate && !schedule.endDate && !schedule.milestones?.length)) {
    return TBD;
  }
  const lines: string[] = [];
  lines.push(`- Start date: ${schedule.startDate ?? TBD}`);
  lines.push(`- End date: ${schedule.endDate ?? TBD}`);
  if (schedule.milestones && schedule.milestones.length > 0) {
    lines.push("- Milestones:");
    for (const milestone of schedule.milestones) {
      lines.push(`  - ${milestone.name}: ${milestone.date}`);
    }
  }
  return lines.join("\n");
}

function sectionContent(sectionId: string, input: TestPlanInput): string {
  switch (sectionId) {
    case "introduction":
      return `**Purpose:** ${input.scope}\n\n**Objectives:**\n${listOrTbd(input.objectives)}`;
    case "test-items":
      return `**Project:** ${input.projectName}\n\n**Scope:** ${input.scope}`;
    case "features-to-be-tested":
      return listOrTbd(input.featuresToTest);
    case "features-not-to-be-tested":
      return listOrTbd(input.featuresNotToTest);
    case "approach":
      return TBD;
    case "item-pass-fail-criteria":
      return input.passFailCriteria ?? TBD;
    case "suspension-resumption-criteria":
      return input.suspensionCriteria ?? TBD;
    case "test-deliverables":
      return listOrTbd(input.deliverables);
    case "testing-tasks":
      return TBD;
    case "environmental-needs":
      return input.environment ?? TBD;
    case "responsibilities":
      return teamOrTbd(input.team);
    case "staffing-and-training-needs":
      return TBD;
    case "schedule":
      return scheduleOrTbd(input.scheduleConstraints);
    case "risks-and-contingencies":
      return risksOrTbd(input.risks);
    case "approvals":
      return listOrTbd(input.approvers);
    default:
      return TBD;
  }
}

export function renderTestPlan(
  input: TestPlanInput,
  structure: Iso29119TestPlanStructure = iso29119TestPlanStructure
): string {
  const lines: string[] = [];
  lines.push(`# Test Plan: ${input.projectName}`);
  lines.push("");
  lines.push(`*Conforms to the structure of ${structure.standard}*`);
  lines.push("");

  structure.sections.forEach((section, index) => {
    lines.push(`## ${index + 1}. ${section.title}`);
    lines.push("");
    lines.push(sectionContent(section.id, input));
    lines.push("");
  });

  return lines.join("\n").trimEnd() + "\n";
}

export function registerGenerateTestPlanTool(server: McpServer): void {
  server.registerTool(
    "generate_test_plan_draft",
    {
      title: "Generate Test Plan Draft",
      description:
        "Generates an ISO/IEC/IEEE 29119-3 conformant test plan document draft in markdown from project information. Fields not provided are marked as TBD.",
      inputSchema: generateTestPlanInputShape,
    },
    async (input) => {
      const markdown = renderTestPlan(input as TestPlanInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
