import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  testPlanTemplate,
  deliverableTemplateExamples,
  testOrgRoleTemplateExamples,
  scopeObjectivesTemplateExamples,
  testItemsTemplateExamples,
  featuresToBeTestedTemplateExamples,
  testLevelsTemplateExamples,
  testTypesTemplateExamples,
  resultJudgmentTemplateExamples,
  suspensionResumptionTemplateExamples,
  envRequirementsTemplateExamples,
  testDataRequirementsTemplateExamples,
  responsibilitiesTemplateExamples,
  testPeriodTemplateExamples,
  schedulePlanTemplateExamples,
  productRiskTemplateExamples,
} from "../resources/testPlanTemplate.js";
import type { TestPlanTemplate, TestPlanTemplateSection } from "../types.js";
import {
  TBD,
  TBD_REQUIRED,
  parseHeadings,
  sectionExists,
  findMarkerOccurrences,
  groupByHeading,
} from "./reviewTestPlan.js";

const PLACEHOLDER_PATTERNS: RegExp[] = [
  // 完全一致（セル/行の中身が丸ごとこれらの語のみの場合）。既存 tbd/todo/未定 の後方互換を含む。
  /^(tbd|todo|未定|検討中|未確定|要検討|要確認|後日|後日確定|後日決定)$/i,
  // 部分一致（行頭のtbd/todo表記）: "TBD: 後日確定" "(todo)" 等を拾う
  /^[(（]?\s*(tbd|todo)\b/i,
];

// 見出し文字列（例: "8 成果物", "### 11.1 テスト体制"）から章番号部分を抽出する。
const HEADING_NUMBER_REGEX = /^#{0,6}\s*(\d+(?:\.\d+)*)[.．\s　]/;

function extractHeadingNumber(heading: string): string | undefined {
  const m = HEADING_NUMBER_REGEX.exec(heading);
  return m ? m[1] : undefined;
}

// 参考候補の追加注記を出す章番号と、対応する例示リスト。
const TEMPLATE_EXAMPLE_SECTIONS: Record<string, { label: string; examples: string[] }> = {
  "1.1": { label: "スコープ・目的", examples: scopeObjectivesTemplateExamples },
  "2": { label: "テスト対象", examples: testItemsTemplateExamples },
  "3": { label: "テスト対象機能", examples: featuresToBeTestedTemplateExamples },
  "5.1": { label: "テストレベル", examples: testLevelsTemplateExamples },
  "5.2": { label: "テストタイプ", examples: testTypesTemplateExamples },
  "6.2": { label: "合否判定基準", examples: resultJudgmentTemplateExamples },
  "7": { label: "中断・再開基準", examples: suspensionResumptionTemplateExamples },
  "8": { label: "成果物", examples: deliverableTemplateExamples },
  "10.1": { label: "テスト環境要件", examples: envRequirementsTemplateExamples },
  "10.2": { label: "テストデータ要件", examples: testDataRequirementsTemplateExamples },
  "11": { label: "責任分担", examples: responsibilitiesTemplateExamples },
  "11.1": { label: "テスト体制", examples: testOrgRoleTemplateExamples },
  "13.1": { label: "テスト期間", examples: testPeriodTemplateExamples },
  "13.2": { label: "スケジュール", examples: schedulePlanTemplateExamples },
  "14.1": { label: "プロダクトリスク", examples: productRiskTemplateExamples },
};

interface AppendMissingSectionsResult {
  markdown: string;
  addedSections: TestPlanTemplateSection[];
}

function appendMissingSections(
  planMarkdown: string,
  template: TestPlanTemplate
): AppendMissingSectionsResult {
  const headings = parseHeadings(planMarkdown);
  const missingSections = template.sections.filter((section) => !sectionExists(section, headings));

  if (missingSections.length === 0) {
    return { markdown: planMarkdown, addedSections: [] };
  }

  const appendLines: string[] = [];
  appendLines.push("");
  appendLines.push("## 補完: 欠落章（自動挿入）");
  appendLines.push("");
  for (const section of missingSections) {
    const headingPrefix = section.level === 1 ? "##" : "###";
    appendLines.push(`${headingPrefix} ${section.no} ${section.titleJa}`);
    appendLines.push("");
    if (section.guidance) {
      appendLines.push(section.guidance);
      appendLines.push("");
    }
    appendLines.push(section.required ? TBD_REQUIRED : TBD);
    appendLines.push("");
  }

  const base = planMarkdown.replace(/\s+$/, "");
  const markdown = `${base}\n${appendLines.join("\n").replace(/\n+$/, "\n")}`;

  return { markdown, addedSections: missingSections };
}

interface NormalizePlaceholderMarkersResult {
  markdown: string;
  replacements: { heading: string; token: string }[];
}

function normalizePlaceholderMarkers(markdown: string): NormalizePlaceholderMarkersResult {
  const lines = markdown.split("\n");
  const headings = parseHeadings(markdown);
  const headingByLine = new Map(headings.map((h) => [h.lineIndex, h.raw.trim()]));

  let currentHeading = "(見出しなし)";
  const replacements: { heading: string; token: string }[] = [];

  const outLines = lines.map((line, i) => {
    if (headingByLine.has(i)) {
      currentHeading = headingByLine.get(i) as string;
    }

    if (line.includes("|")) {
      const cells = line.split("|");
      const newCells = cells.map((cell) => {
        const trimmed = cell.trim();
        if (trimmed && PLACEHOLDER_PATTERNS.some((re) => re.test(trimmed))) {
          replacements.push({ heading: currentHeading, token: trimmed });
          const leading = cell.match(/^\s*/)?.[0] ?? "";
          const trailing = cell.match(/\s*$/)?.[0] ?? "";
          return `${leading}${TBD}${trailing}`;
        }
        return cell;
      });
      return newCells.join("|");
    }

    const trimmedLine = line.trim();
    if (trimmedLine && PLACEHOLDER_PATTERNS.some((re) => re.test(trimmedLine))) {
      replacements.push({ heading: currentHeading, token: trimmedLine });
      const leadingWs = line.match(/^\s*/)?.[0] ?? "";
      return `${leadingWs}${TBD}`;
    }

    return line;
  });

  return { markdown: outLines.join("\n"), replacements };
}

export function renderTestPlanRevision(
  planMarkdown: string,
  instructions: string[] = [],
  template: TestPlanTemplate = testPlanTemplate
): string {
  const { markdown: afterMissing, addedSections } = appendMissingSections(planMarkdown, template);
  const { markdown: revisedMarkdown, replacements } = normalizePlaceholderMarkers(afterMissing);
  const remainingRequired = groupByHeading(findMarkerOccurrences(revisedMarkdown, TBD_REQUIRED));

  const lines: string[] = [];
  lines.push("# テスト計画書修正結果");
  lines.push("");
  lines.push("## 1. 機械的修正（自動適用）");
  lines.push("");

  lines.push("### 1.1 欠落章の補完");
  lines.push("");
  if (addedSections.length === 0) {
    lines.push("- 追加なし");
  } else {
    lines.push(`- 追加した章: ${addedSections.map((s) => `${s.no} ${s.titleJa}`).join(", ")}`);
  }
  lines.push("");

  lines.push("### 1.2 未記入マーカーの正規化");
  lines.push("");
  if (replacements.length === 0) {
    lines.push("- 正規化なし");
  } else {
    const order: string[] = [];
    const grouped = new Map<string, { heading: string; token: string; count: number }>();
    for (const r of replacements) {
      const key = `${r.heading} ${r.token}`;
      if (!grouped.has(key)) {
        order.push(key);
        grouped.set(key, { heading: r.heading, token: r.token, count: 0 });
      }
      const entry = grouped.get(key) as { heading: string; token: string; count: number };
      entry.count += 1;
    }
    for (const key of order) {
      const { heading, token, count } = grouped.get(key) as {
        heading: string;
        token: string;
        count: number;
      };
      lines.push(`- ${heading} の "${token}" を "${TBD}" に正規化（計${count}件）`);
    }
  }
  lines.push("");

  lines.push("## 2. 修正後のテスト計画書（機械的修正適用済み）");
  lines.push("");
  lines.push("```markdown");
  lines.push(revisedMarkdown);
  lines.push("```");
  lines.push("");

  lines.push("## 3. 内容の書き換え指示（呼び出し側 LLM が適用）");
  lines.push("");
  lines.push(
    "以下の指示・未記入項目について、テスト計画書の本文を書き換えてください。書き換え後は review_test_plan で再検証することを推奨します。"
  );
  lines.push("");

  lines.push("### 3.1 修正指示");
  lines.push("");
  if (instructions.length === 0) {
    lines.push("- 指定なし");
  } else {
    for (const instruction of instructions) {
      lines.push(`- ${instruction}`);
    }
  }
  lines.push("");

  lines.push("### 3.2 必須項目の未記入（内容記入が必要）");
  lines.push("");
  if (remainingRequired.length === 0) {
    lines.push("- 必須項目の未記入なし");
  } else {
    for (const { heading, count } of remainingRequired) {
      lines.push(`- ${heading} に未記入（必須）が残存（${count}件）`);
      const no = extractHeadingNumber(heading);
      const templateExample = no ? TEMPLATE_EXAMPLE_SECTIONS[no] : undefined;
      if (templateExample) {
        lines.push(
          `  - 参考例（プロジェクトに応じて修正してください）: ${templateExample.examples.join(" / ")}`
        );
      }
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export const reviseTestPlanInputShape = {
  planMarkdown: z.string().describe("Markdown body of the existing test plan to revise"),
  instructions: z
    .array(z.string())
    .optional()
    .describe("Freeform revision requests (e.g. from review_test_plan findings or user requests)"),
} as const;

export function registerReviseTestPlanTool(server: McpServer): void {
  server.registerTool(
    "revise_test_plan",
    {
      title: "Revise Test Plan",
      description:
        "既存テスト計画書のMarkdownと修正指示を入力に、欠落章の補完・未記入マーカー正規化を決定的に適用した修正後計画書と、内容の書き換えを呼び出し側LLMへ指示するレポートを返す。",
      inputSchema: reviseTestPlanInputShape,
    },
    async ({ planMarkdown, instructions }) => {
      const markdown = renderTestPlanRevision(planMarkdown, instructions ?? []);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
