import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testPlanTemplate } from "../resources/testPlanTemplate.js";
import { testPlanReviewChecklist } from "../resources/testPlanReviewChecklist.js";
import type {
  ReviewSeverity,
  TestPlanReviewChecklist,
  TestPlanTemplate,
  TestPlanTemplateSection,
} from "../types.js";

export const TBD = "_未記入_";
export const TBD_REQUIRED = "_未記入（必須）_";

const HEADING_REGEX = /^#{1,6}\s+(.+?)\s*$/;
const NUMBER_PREFIX_REGEX = /^(\d+(?:\.\d+)*)[.．\s　]/;

export interface ParsedHeading {
  lineIndex: number;
  raw: string;
  no?: string;
  titleText: string;
}

export function parseHeadings(markdown: string): ParsedHeading[] {
  const lines = markdown.split("\n");
  const headings: ParsedHeading[] = [];
  lines.forEach((line, i) => {
    const m = HEADING_REGEX.exec(line);
    if (!m) return;
    const text = m[1];
    const numberMatch = NUMBER_PREFIX_REGEX.exec(text);
    if (numberMatch) {
      const no = numberMatch[1];
      const titleText = text.slice(numberMatch[0].length).trim();
      headings.push({ lineIndex: i, raw: text, no, titleText });
    } else {
      headings.push({ lineIndex: i, raw: text, titleText: text.trim() });
    }
  });
  return headings;
}

function normalizeTitle(value: string): string {
  return value.replace(/[\s　]/g, "");
}

export function sectionExists(section: TestPlanTemplateSection, headings: ParsedHeading[]): boolean {
  if (headings.some((h) => h.no === section.no)) return true;
  const normSection = normalizeTitle(section.titleJa);
  if (!normSection) return false;
  return headings.some((h) => {
    const normHeading = normalizeTitle(h.titleText);
    if (!normHeading) return false;
    return normHeading.includes(normSection) || normSection.includes(normHeading);
  });
}

function missingSeverity(section: TestPlanTemplateSection): ReviewSeverity {
  if (section.level === 1) return "high";
  if (section.level === 2 && section.required) return "medium";
  return "low";
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface TbdOccurrence {
  heading: string;
}

export function findMarkerOccurrences(markdown: string, marker: string): TbdOccurrence[] {
  const lines = markdown.split("\n");
  const markerRegex = new RegExp(escapeRegExp(marker), "g");
  let currentHeading = "(見出しなし)";
  const occurrences: TbdOccurrence[] = [];
  for (const line of lines) {
    const headingMatch = HEADING_REGEX.exec(line);
    if (headingMatch) {
      currentHeading = headingMatch[1].trim();
    }
    const matches = line.match(markerRegex);
    if (matches) {
      for (let i = 0; i < matches.length; i++) {
        occurrences.push({ heading: currentHeading });
      }
    }
  }
  return occurrences;
}

export function groupByHeading(occurrences: TbdOccurrence[]): { heading: string; count: number }[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const occ of occurrences) {
    if (!counts.has(occ.heading)) {
      order.push(occ.heading);
      counts.set(occ.heading, 0);
    }
    counts.set(occ.heading, (counts.get(occ.heading) ?? 0) + 1);
  }
  return order.map((heading) => ({ heading, count: counts.get(heading) ?? 0 }));
}

export function renderTestPlanReview(
  planMarkdown: string,
  template: TestPlanTemplate = testPlanTemplate,
  checklist: TestPlanReviewChecklist = testPlanReviewChecklist
): string {
  const headings = parseHeadings(planMarkdown);

  const missingSections = template.sections.filter((section) => !sectionExists(section, headings));

  const requiredTbdOccurrences = findMarkerOccurrences(planMarkdown, TBD_REQUIRED);
  const requiredTbdByHeading = groupByHeading(requiredTbdOccurrences);

  const optionalTbdOccurrences = findMarkerOccurrences(planMarkdown, TBD);
  const optionalTbdCount = optionalTbdOccurrences.length;

  const lines: string[] = [];
  lines.push("# テスト計画書レビュー結果");
  lines.push("");
  lines.push("## 1. 構造検査（自動・決定的）");
  lines.push("");
  lines.push("### 1.1 章構成の網羅性");
  lines.push("");
  if (missingSections.length === 0) {
    lines.push(`- 欠落なし（全 ${template.sections.length} 章検出）`);
  } else {
    for (const section of missingSections) {
      lines.push(`- [${missingSeverity(section)}] ${section.no} ${section.titleJa}（欠落）`);
    }
  }
  lines.push("");

  lines.push("### 1.2 必須項目の記入状況");
  lines.push("");
  if (requiredTbdByHeading.length === 0) {
    lines.push("- 必須項目の未記入なし");
  } else {
    for (const { heading, count } of requiredTbdByHeading) {
      lines.push(`- ${heading} に未記入（必須）が残存（${count}件）`);
    }
  }
  lines.push("");

  lines.push("### 1.3 任意項目の未記入");
  lines.push("");
  lines.push(`- 未記入（任意）の残存: ${optionalTbdCount}件`);
  lines.push("");

  lines.push("### 1.4 サマリ");
  lines.push("");
  lines.push(`- 欠落章数: ${missingSections.length}`);
  lines.push(`- 必須未記入数: ${requiredTbdOccurrences.length}`);
  lines.push(`- 任意未記入数: ${optionalTbdCount}`);
  lines.push("");

  lines.push("## 2. 意味的レビュー用チェックリスト（呼び出し側 LLM が適用）");
  lines.push("");
  lines.push(
    "以下の各観点について、テスト計画書本文を評価し、問題点があれば具体的に指摘し、改善提案を述べてください。"
  );
  lines.push("");
  for (const item of checklist.items) {
    lines.push(`### ${item.id} [${item.severity}] ${item.title}`);
    lines.push("");
    lines.push(item.check);
    const glossaryPart = item.glossaryRefs && item.glossaryRefs.length > 0 ? item.glossaryRefs.join(", ") : "-";
    const chapterPart = item.chapterRefs && item.chapterRefs.length > 0 ? item.chapterRefs.join(", ") : "-";
    lines.push("");
    lines.push(`根拠: 用語 ${glossaryPart}, 章 ${chapterPart}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export const reviewTestPlanInputShape = {
  planMarkdown: z
    .string()
    .describe("Markdown body of the test plan to review (e.g. create_test_plan output)"),
} as const;

export function registerReviewTestPlanTool(server: McpServer): void {
  server.registerTool(
    "review_test_plan",
    {
      title: "Review Test Plan",
      description:
        "テスト計画書の Markdown を JSTQB 観点でレビュー。15章の欠落・必須未記入を決定的に検査し、意味的レビュー用チェックリストを併せて返す。",
      inputSchema: reviewTestPlanInputShape,
    },
    async ({ planMarkdown }) => {
      const markdown = renderTestPlanReview(planMarkdown);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
