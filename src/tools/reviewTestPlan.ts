import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testPlanTemplate } from "../resources/testPlanTemplate.js";
import { testPlanReviewChecklist } from "../resources/testPlanReviewChecklist.js";
import { testPlanAmbiguityLexicon } from "../resources/ambiguityLexicon.js";
import type {
  AmbiguityCategory,
  AmbiguityLexicon,
  AmbiguityPrioritySection,
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

const MIN_PARTIAL_MATCH_LENGTH = 3; // 短いタイトルでの誤マッチ防止

export function sectionExists(section: TestPlanTemplateSection, headings: ParsedHeading[]): boolean {
  if (headings.some((h) => h.no === section.no)) return true;
  const normSection = normalizeTitle(section.titleJa);
  if (!normSection) return false;
  return headings.some((h) => {
    // 番号を持つ見出しは直前の判定で既に不一致と確定した「別の章」なので、
    // タイトル一致のフォールバック対象は番号なし見出し（表記ゆれ耐性の対象）に限定する。
    if (h.no !== undefined) return false;

    const normHeading = normalizeTitle(h.titleText);
    if (!normHeading) return false;
    if (normHeading === normSection) return true; // 完全一致は常に許可

    if (normSection.length < MIN_PARTIAL_MATCH_LENGTH || normHeading.length < MIN_PARTIAL_MATCH_LENGTH) {
      return false;
    }
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

const SEVERITY_RANK: Record<ReviewSeverity, number> = { high: 3, medium: 2, low: 1 };

export interface AmbiguityHeadingCount {
  heading: string; // 検出された見出しの生テキスト（例 "6.1 開始・終了基準"）
  count: number;
  priority: boolean; // prioritySections に該当するか
}

export interface AmbiguityFinding {
  termId: string;
  term: string;
  category: AmbiguityCategory;
  severity: ReviewSeverity; // 優先章での検出があれば当該章の severity、無ければ "low"
  total: number;
  suggestion: string;
  byHeading: AmbiguityHeadingCount[];
}

function matchPrioritySection(
  heading: string,
  sections: AmbiguityPrioritySection[]
): AmbiguityPrioritySection | undefined {
  const numberMatch = NUMBER_PREFIX_REGEX.exec(heading);
  if (numberMatch) {
    const byNo = sections.find((s) => s.no === numberMatch[1]);
    if (byNo) return byNo;
  }
  const normHeading = normalizeTitle(heading);
  const candidates = sections.filter((s) => {
    const normSection = normalizeTitle(s.titleJa);
    if (!normSection || !normHeading) return false;
    return normHeading.includes(normSection) || normSection.includes(normHeading);
  });
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, cur) =>
    SEVERITY_RANK[cur.severity] > SEVERITY_RANK[best.severity] ? cur : best
  );
}

export function findAmbiguousExpressions(
  planMarkdown: string,
  lexicon: AmbiguityLexicon = testPlanAmbiguityLexicon
): AmbiguityFinding[] {
  const lines = planMarkdown.split("\n");
  let currentHeading = "(見出しなし)";
  let inFence = false;

  // termId -> occurrences (以 heading 集約用)
  const occurrencesByTerm = new Map<string, TbdOccurrence[]>();
  for (const term of lexicon.terms) {
    occurrencesByTerm.set(term.id, []);
  }

  for (const line of lines) {
    const headingMatch = HEADING_REGEX.exec(line);
    if (headingMatch) {
      currentHeading = headingMatch[1].trim();
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (trimmed.startsWith("|")) continue;
    if (trimmed === TBD || trimmed === TBD_REQUIRED) continue;

    for (const term of lexicon.terms) {
      const regex = new RegExp(term.pattern ?? escapeRegExp(term.term), "g");
      const matches = line.match(regex);
      if (!matches) continue;
      const list = occurrencesByTerm.get(term.id)!;
      for (let i = 0; i < matches.length; i++) {
        list.push({ heading: currentHeading });
      }
    }
  }

  const findings: AmbiguityFinding[] = [];
  for (const term of lexicon.terms) {
    const occurrences = occurrencesByTerm.get(term.id) ?? [];
    if (occurrences.length === 0) continue;
    const grouped = groupByHeading(occurrences);
    let maxSeverity: ReviewSeverity = "low";
    const byHeading: AmbiguityHeadingCount[] = grouped.map(({ heading, count }) => {
      const matched = matchPrioritySection(heading, lexicon.prioritySections);
      const priority = matched !== undefined;
      if (matched && SEVERITY_RANK[matched.severity] > SEVERITY_RANK[maxSeverity]) {
        maxSeverity = matched.severity;
      }
      return { heading, count, priority };
    });
    findings.push({
      termId: term.id,
      term: term.term,
      category: term.category,
      severity: maxSeverity,
      total: occurrences.length,
      suggestion: term.suggestion,
      byHeading,
    });
  }

  const termOrder = new Map(lexicon.terms.map((t, i) => [t.id, i]));
  findings.sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDiff !== 0) return severityDiff;
    const totalDiff = b.total - a.total;
    if (totalDiff !== 0) return totalDiff;
    return (termOrder.get(a.termId) ?? 0) - (termOrder.get(b.termId) ?? 0);
  });

  return findings;
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

  const ambiguityFindings = findAmbiguousExpressions(planMarkdown);
  const ambiguityTotal = ambiguityFindings.reduce((sum, f) => sum + f.total, 0);
  const ambiguityPriorityTotal = ambiguityFindings.reduce(
    (sum, f) => sum + f.byHeading.filter((h) => h.priority).reduce((s, h) => s + h.count, 0),
    0
  );

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

  lines.push("### 1.4 曖昧語・非測定表現");
  lines.push("");
  if (ambiguityFindings.length === 0) {
    lines.push("- 該当なし");
  } else {
    for (const finding of ambiguityFindings) {
      const byHeadingText = finding.byHeading
        .map((h) => `${h.heading}(${h.count}件${h.priority ? "・優先章" : ""})`)
        .join(", ");
      lines.push(
        `- [${finding.severity}] 「${finding.term}」(${finding.category}) 計${finding.total}件: ${byHeadingText}`
      );
      lines.push(`  - 改善: ${finding.suggestion}`);
    }
  }
  lines.push("");

  lines.push("### 1.5 サマリ");
  lines.push("");
  lines.push(`- 欠落章数: ${missingSections.length}`);
  lines.push(`- 必須未記入数: ${requiredTbdOccurrences.length}`);
  lines.push(`- 任意未記入数: ${optionalTbdCount}`);
  lines.push(`- 曖昧語出現数: ${ambiguityTotal}`);
  lines.push(`- 優先章での曖昧語出現数: ${ambiguityPriorityTotal}`);
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
    lines.push("");
    lines.push(`根拠: 用語 ${glossaryPart}`);
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
        "テスト計画書の Markdown を JSTQB 観点でレビュー。15章の欠落・必須未記入・曖昧語を決定的に検査し、意味的レビュー用チェックリストを併せて返す。",
      inputSchema: reviewTestPlanInputShape,
    },
    async ({ planMarkdown }) => {
      const markdown = renderTestPlanReview(planMarkdown);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
