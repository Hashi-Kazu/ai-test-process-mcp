import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import { buildDigestSignals, renderInspectabilitySection } from "../inspectabilityAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testBasisReviewChecklist } from "../resources/testBasisReviewChecklist.js";
import { questionPriorityDefinitions } from "../resources/testPlanTemplate.js";
import type { CompletedToolDeclaration, TestBasisDocument, TestBasisReviewChecklist } from "../types.js";
import {
  buildDocumentDigests,
  findDocumentDigestFindings,
  findUnmatchedIdPatterns,
  renderDocumentDigestLines,
  sanitizeTestBasisDocuments,
} from "../documentDigest.js";
import {
  analyzePrefixes,
  extractIdOccurrences,
  extractQuantityExpressions,
  findAmbiguousTerms,
  findDuplicateIds,
  findUnresolvedReferences,
  formatAmbiguousExclusionHitsLine,
  formatAmbiguousExclusionSummary,
  type TestBasisAnalysisOptions,
} from "../testBasisAnalysis.js";
import {
  distinctInOrder,
  isSectionResolved,
  renderFindingPrioritySection,
  type FindingPriorityInput,
} from "../findingPriority.js";
import type {
  TestBasisDuplicateId,
  TestBasisPrefixIssue,
  TestBasisPrefixStat,
  TestBasisQuantityExpression,
  TestBasisUnresolvedReference,
} from "../types.js";

/** 既定表示（verbose=false）で1.3 ID重複に表示する行数の上限。 */
export const MAX_DUPLICATE_ID_LINES = 20;
/** 既定表示（verbose=false）で1.4 未解決参照に表示する行数の上限。 */
export const MAX_UNRESOLVED_REFERENCE_LINES = 20;
/** 既定表示（verbose=false）で1.6 曖昧語・弱い語の語数の上限。 */
export const MAX_AMBIGUOUS_TERM_LINES = 20;
/** 既定表示（verbose=false）で1.6の1語あたりに表示する見出し内訳数の上限。 */
export const MAX_AMBIGUOUS_HEADINGS_PER_TERM = 5;
/** 既定表示（verbose=false）で1.6の1語あたりに表示する除外実体(exclusionHits)数の上限。 */
export const MAX_AMBIGUOUS_EXCLUSION_HITS_PER_TERM = 3;
/** 既定表示（verbose=false）で1.7 境界語なし数量表現に表示する行数の上限。 */
export const MAX_QUANTITY_LINES = 30;
/** 既定表示（verbose=false）で3章質問状の生成元区分ごとに表示する行数の上限。 */
export const MAX_QUESTION_ROWS_PER_SOURCE = 10;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function place(document: string, lineIndex: number, heading: string): string {
  return `${document}:${lineIndex + 1} ${heading}`;
}

/**
 * 1.9節（対処優先度順の指摘一覧）の入力を、決定的検査5系列の全件から作る。
 * severity は3章質問状の重要度と同値の宣言値であり、スコアで上書きしない。
 * 3章の MAX_QUESTION_ROWS_PER_SOURCE による打ち切りは本節へ持ち込まない。
 */
export function buildTestBasisPriorityInputs(args: {
  duplicates: readonly TestBasisDuplicateId[];
  unresolved: readonly TestBasisUnresolvedReference[];
  issues: readonly TestBasisPrefixIssue[];
  stats: readonly TestBasisPrefixStat[];
  ambiguousFlat: readonly { term: string; document: string; heading: string; count: number }[];
  noBoundary: readonly TestBasisQuantityExpression[];
}): FindingPriorityInput[] {
  const inputs: FindingPriorityInput[] = [];
  let no = 1;
  const nextId = () => `TB-${String(no++).padStart(2, "0")}`;

  for (const dup of args.duplicates) {
    const first = dup.places[0];
    inputs.push({
      id: nextId(),
      categoryId: "ID重複",
      place: place(first.document, first.lineIndex, first.heading),
      // 1.3節・3章が表示している宣言値そのまま（high / medium）。スコアで上書きしない。
      severity: dup.severity,
      impactedIds: [dup.id],
      documents: distinctInOrder(dup.places.map((p) => p.document)),
      sectionResolved: isSectionResolved(dup.places.map((p) => p.heading)),
    });
  }
  for (const ref of args.unresolved) {
    inputs.push({
      id: nextId(),
      categoryId: "未解決参照",
      place: place(ref.document, ref.lineIndex, ref.heading),
      severity: "high",
      impactedIds: [ref.id],
      documents: [ref.document],
      sectionResolved: isSectionResolved([ref.heading]),
    });
  }
  for (const issue of args.issues) {
    const stat = args.stats.find((s) => s.prefix === issue.prefixes[0]);
    inputs.push({
      id: nextId(),
      categoryId: "プレフィックス逸脱",
      place: `${issue.prefixes.join(", ")} / (複数箇所)`,
      severity: "medium",
      impactedIds: [],
      documents: stat?.documents ?? [],
      // 該当箇所が複数箇所にまたがり章節を特定できないため false。
      sectionResolved: false,
    });
  }
  for (const entry of args.ambiguousFlat) {
    inputs.push({
      id: nextId(),
      categoryId: "曖昧語・弱い語",
      place: `${entry.document} / ${entry.heading}`,
      severity: "medium",
      impactedIds: [],
      documents: [entry.document],
      sectionResolved: isSectionResolved([entry.heading]),
    });
  }
  for (const q of args.noBoundary) {
    inputs.push({
      id: nextId(),
      categoryId: "境界語なし数量表現",
      place: place(q.document, q.lineIndex, q.heading),
      severity: "low",
      impactedIds: [],
      documents: [q.document],
      sectionResolved: isSectionResolved([q.heading]),
    });
  }
  return inputs;
}

export function renderTestBasisReview(
  rawDocuments: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {},
  checklist: TestBasisReviewChecklist = testBasisReviewChecklist,
  completedTools: readonly CompletedToolDeclaration[] = [],
  verbose: boolean = false
): string {
  const documents = sanitizeTestBasisDocuments(rawDocuments);
  const occurrences = extractIdOccurrences(documents, options);
  const duplicates = findDuplicateIds(occurrences);
  const unresolved = findUnresolvedReferences(occurrences);
  const { stats, issues } = analyzePrefixes(occurrences);
  const ambiguousTerms = findAmbiguousTerms(documents, options);
  const quantities = extractQuantityExpressions(documents);

  const definitionCount = occurrences.filter((o) => o.role === "definition").length;
  const referenceCount = occurrences.filter((o) => o.role === "reference").length;
  const tocCount = occurrences.filter((o) => o.role === "toc").length;
  const boundaryCount = quantities.filter((q) => q.hasBoundaryWord).length;
  const noBoundary = quantities.filter((q) => !q.hasBoundaryWord);
  const ambiguousTotal = ambiguousTerms.reduce((sum, t) => sum + t.total, 0);
  const ambiguousExcludedTotal = ambiguousTerms.reduce((sum, t) => sum + t.excludedTotal, 0);
  const ambiguousExcludedByRule = new Map<string, number>();
  for (const t of ambiguousTerms) {
    for (const r of t.excludedByRule) {
      ambiguousExcludedByRule.set(r.ruleId, (ambiguousExcludedByRule.get(r.ruleId) ?? 0) + r.count);
    }
  }
  const ambiguousExcludedByRuleText = Array.from(ambiguousExcludedByRule.entries())
    .map(([ruleId, count]) => `${ruleId}×${count}`)
    .join(", ");

  const digestRows = buildDocumentDigests(documents, options);
  const digestFindings = findDocumentDigestFindings(digestRows);
  const unmatchedIdPatterns = findUnmatchedIdPatterns(documents, options);

  const lines: string[] = [];
  lines.push("# テストベースレビュー結果");
  lines.push("");
  if (!verbose) {
    lines.push(
      "既定(verbose未指定/false)は要約表示。1.3/1.4/1.6/1.7/1.9 と 3章の質問状に件数上限を適用し、打ち切った箇所には全件数と省略件数を併記する。全件は verbose: true で取得できる。"
    );
    lines.push("");
  }
  lines.push("## 1. 決定的検査(自動)");
  lines.push("");

  lines.push("### 1.1 対象文書");
  lines.push("");
  for (const doc of documents) {
    const lineCount = doc.content.split("\n").length;
    lines.push(`- ${doc.name}(行数: ${lineCount})`);
  }
  lines.push("");
  for (const l of renderDocumentDigestLines(digestRows, digestFindings, unmatchedIdPatterns)) lines.push(l);
  lines.push("");

  lines.push("### 1.2 ID体系の集計");
  lines.push("");
  lines.push("| プレフィックス | 定義数 | 連番桁数 | セグメント数 | 出現文書 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const stat of stats) {
    lines.push(
      `| ${escapeCell(stat.prefix)} | ${stat.definitionCount} | ${stat.digitWidths.join(", ")} | ${stat.segmentCounts.join(
        ", "
      )} | ${escapeCell(stat.documents.join(", "))} |`
    );
  }
  lines.push("");

  lines.push("### 1.3 ID重複");
  lines.push("");
  if (duplicates.length === 0) {
    lines.push("- 重複なし");
  } else {
    const duplicatesToShow = verbose ? duplicates : duplicates.slice(0, MAX_DUPLICATE_ID_LINES);
    for (const dup of duplicatesToShow) {
      const placesText = dup.places
        .map((p) => place(p.document, p.lineIndex, p.heading))
        .join(" / ");
      lines.push(`- [${dup.severity}] ${dup.id}(${dup.count}件): ${placesText}`);
    }
    const omitted = duplicates.length - duplicatesToShow.length;
    if (omitted > 0) {
      lines.push(
        `- ID重複: 全${duplicates.length}件中 ${duplicatesToShow.length}件を表示（${omitted}件を省略）。全件は verbose: true で取得できる。`
      );
    }
  }
  lines.push("");

  lines.push("### 1.4 未解決参照");
  lines.push("");
  if (unresolved.length === 0) {
    lines.push("- 未解決参照なし");
  } else {
    const unresolvedToShow = verbose ? unresolved : unresolved.slice(0, MAX_UNRESOLVED_REFERENCE_LINES);
    for (const ref of unresolvedToShow) {
      lines.push(`- [high] ${ref.id} を参照(${place(ref.document, ref.lineIndex, ref.heading)})`);
    }
    const omitted = unresolved.length - unresolvedToShow.length;
    if (omitted > 0) {
      lines.push(
        `- 未解決参照: 全${unresolved.length}件中 ${unresolvedToShow.length}件を表示（${omitted}件を省略）。全件は verbose: true で取得できる。`
      );
    }
  }
  lines.push("");

  lines.push("### 1.5 プレフィックス体系の逸脱");
  lines.push("");
  if (issues.length === 0) {
    lines.push("- 逸脱なし");
  } else {
    for (const issue of issues) {
      lines.push(`- [medium] ${issue.kind}: ${issue.detail}`);
    }
  }
  lines.push("");

  lines.push("### 1.6 曖昧語・弱い語");
  lines.push("");
  if (ambiguousTerms.length === 0) {
    lines.push("- 該当なし");
  } else {
    const ambiguousTermsToShow = verbose ? ambiguousTerms : ambiguousTerms.slice(0, MAX_AMBIGUOUS_TERM_LINES);
    for (const finding of ambiguousTermsToShow) {
      const byHeadingToShow = verbose
        ? finding.byHeading
        : finding.byHeading.slice(0, MAX_AMBIGUOUS_HEADINGS_PER_TERM);
      const byHeadingRest = finding.byHeading.length - byHeadingToShow.length;
      const byHeadingText =
        byHeadingToShow.map((h) => `${h.document} / ${h.heading}(${h.count}件)`).join(", ") +
        (byHeadingRest > 0 ? ` ほか${byHeadingRest}見出し` : "");
      const exclusionSummary = formatAmbiguousExclusionSummary(finding);
      lines.push(`- 「${finding.term}」(${finding.category}) 計${finding.total}件: ${byHeadingText}${exclusionSummary}`);
      const exclusionHitsLine = formatAmbiguousExclusionHitsLine(
        finding,
        MAX_AMBIGUOUS_EXCLUSION_HITS_PER_TERM,
        verbose
      );
      if (exclusionHitsLine) lines.push(exclusionHitsLine);
    }
    const omittedTerms = ambiguousTerms.slice(ambiguousTermsToShow.length);
    if (omittedTerms.length > 0) {
      const omittedTotal = omittedTerms.reduce((sum, t) => sum + t.total, 0);
      lines.push(
        `- 曖昧語・弱い語: 全${ambiguousTerms.length}語中 ${ambiguousTermsToShow.length}語を表示（${omittedTerms.length}語・出現計${omittedTotal}件を省略）。全件は verbose: true で取得できる。`
      );
    }
  }
  lines.push("");

  lines.push("### 1.7 数量表現");
  lines.push("");
  lines.push(`- 境界語あり: ${boundaryCount}件 / 境界語なし: ${noBoundary.length}件`);
  const shown = verbose ? noBoundary : noBoundary.slice(0, MAX_QUANTITY_LINES);
  for (const q of shown) {
    lines.push(`- [medium] 境界語なし: 「${q.raw}」(${q.document} / ${q.heading})`);
  }
  const quantityOmitted = noBoundary.length - shown.length;
  if (quantityOmitted > 0) {
    lines.push(
      `- 数量表現(境界語なし): 全${noBoundary.length}件中 ${shown.length}件を表示（${quantityOmitted}件を省略）。全件は verbose: true で取得できる。`
    );
  }
  lines.push("");

  lines.push("### 1.8 サマリ");
  lines.push("");
  const ambiguousExclusionSummary =
    ambiguousExcludedTotal > 0 ? ` / 曖昧語除外数: ${ambiguousExcludedTotal}(${ambiguousExcludedByRuleText})` : "";
  lines.push(
    `- 対象文書数: ${documents.length} / 抽出ID数(定義 ${definitionCount} / 参照 ${referenceCount} / 目次 ${tocCount}) / 重複ID数: ${duplicates.length} / 未解決参照数: ${unresolved.length} / プレフィックス逸脱数: ${issues.length} / 曖昧語出現数: ${ambiguousTotal} / 数量表現数(境界語なし): ${noBoundary.length} / ダイジェスト指摘数: ${digestFindings.length}${ambiguousExclusionSummary}`
  );
  lines.push("");

  // 曖昧語・弱い語の平坦化（1.9節と3章質問状で共有。出現数降順）
  const ambiguousFlat: { term: string; document: string; heading: string; count: number }[] = [];
  for (const finding of ambiguousTerms) {
    if (finding.category !== "ambiguous" && finding.category !== "weak-requirement") continue;
    for (const h of finding.byHeading) {
      ambiguousFlat.push({ term: finding.term, document: h.document, heading: h.heading, count: h.count });
    }
  }
  ambiguousFlat.sort((a, b) => b.count - a.count);

  lines.push(
    ...renderFindingPrioritySection(
      "1.9 対処優先度順の指摘一覧",
      "対処優先度順の指摘一覧",
      buildTestBasisPriorityInputs({
        duplicates,
        unresolved,
        issues,
        stats,
        ambiguousFlat,
        noBoundary,
      }),
      verbose
    )
  );

  lines.push("## 2. 意味的レビュー用チェックリスト(呼び出し側 LLM が適用)");
  lines.push("");
  lines.push(
    "以下の各観点についてテストベース本文を評価し、問題点を該当箇所付きで指摘してください。"
  );
  lines.push("");
  for (const item of checklist.items) {
    lines.push(`### ${item.id} [${item.severity}] ${item.title}`);
    lines.push("");
    lines.push(item.check);
    lines.push("");
    const glossaryPart = item.glossaryRefs && item.glossaryRefs.length > 0 ? item.glossaryRefs.join(", ") : "-";
    lines.push(`根拠: 用語 ${glossaryPart}`);
    lines.push("");
  }

  lines.push("## 3. 依頼元への質問状(呼び出し側 LLM が起草)");
  lines.push("");
  lines.push("| 重要度 | 説明 |");
  lines.push("| --- | --- |");
  for (const def of questionPriorityDefinitions) {
    lines.push(`| ${escapeCell(def.level)} | ${escapeCell(def.description)} |`);
  }
  lines.push("");
  lines.push("| 質問ID | 重要度 | 該当箇所 | 質問文 | 暫定前提 |");
  lines.push("| --- | --- | --- | --- | --- |");

  let questionNo = 1;
  const nextQid = () => `Q-${String(questionNo++).padStart(2, "0")}`;
  const questionOmissionNotes: string[] = [];

  const duplicatesToShowQ = verbose ? duplicates : duplicates.slice(0, MAX_QUESTION_ROWS_PER_SOURCE);
  for (const dup of duplicatesToShowQ) {
    const first = dup.places[0];
    const importance = dup.severity === "medium" ? "中" : "高";
    const questionText =
      dup.severity === "medium"
        ? `${dup.id} が一覧と本文の両方に出現している（同一IDの再利用か、一覧＋詳細の正常な構造かを確認すること）`
        : `${dup.id} が複数箇所で定義されている。どちらが正か、採番の是正方針を確認したい`;
    const assumptionText =
      dup.severity === "medium" ? "一覧＋詳細の正常な構造とみなす" : "先に定義されたIDを正とみなす";
    lines.push(
      `| ${nextQid()} | ${importance} | ${escapeCell(place(first.document, first.lineIndex, first.heading))} | ${escapeCell(
        questionText
      )} | ${escapeCell(assumptionText)} |`
    );
  }
  if (duplicatesToShowQ.length < duplicates.length) {
    questionOmissionNotes.push(
      `- 質問状(ID重複): 全${duplicates.length}件中 ${duplicatesToShowQ.length}件を表示（${
        duplicates.length - duplicatesToShowQ.length
      }件を省略）。全件は verbose: true で取得できる。`
    );
  }

  const unresolvedToShowQ = verbose ? unresolved : unresolved.slice(0, MAX_QUESTION_ROWS_PER_SOURCE);
  for (const ref of unresolvedToShowQ) {
    lines.push(
      `| ${nextQid()} | 高 | ${escapeCell(place(ref.document, ref.lineIndex, ref.heading))} | ${escapeCell(
        `参照されている ${ref.id} の定義が見つからない。定義文書の提供または参照の訂正を依頼したい`
      )} | ${escapeCell("参照は誤記とみなし、該当箇所を無視する")} |`
    );
  }
  if (unresolvedToShowQ.length < unresolved.length) {
    questionOmissionNotes.push(
      `- 質問状(未解決参照): 全${unresolved.length}件中 ${unresolvedToShowQ.length}件を表示（${
        unresolved.length - unresolvedToShowQ.length
      }件を省略）。全件は verbose: true で取得できる。`
    );
  }

  const issuesToShowQ = verbose ? issues : issues.slice(0, MAX_QUESTION_ROWS_PER_SOURCE);
  for (const issue of issuesToShowQ) {
    lines.push(
      `| ${nextQid()} | 中 | ${escapeCell(issue.prefixes.join(", "))} | ${escapeCell(
        `プレフィックス「${issue.prefixes.join(", ")}」について、ID付与規則の意図を確認したい`
      )} | ${escapeCell("既存の付与規則を意図通りとみなし、指摘のみ記録する")} |`
    );
  }
  if (issuesToShowQ.length < issues.length) {
    questionOmissionNotes.push(
      `- 質問状(プレフィックス逸脱): 全${issues.length}件中 ${issuesToShowQ.length}件を表示（${
        issues.length - issuesToShowQ.length
      }件を省略）。全件は verbose: true で取得できる。`
    );
  }

  const ambiguousFlatToShow = verbose ? ambiguousFlat : ambiguousFlat.slice(0, MAX_QUESTION_ROWS_PER_SOURCE);
  for (const entry of ambiguousFlatToShow) {
    lines.push(
      `| ${nextQid()} | 中 | ${escapeCell(`${entry.document} / ${entry.heading}`)} | ${escapeCell(
        `「${entry.term}」の具体的な判定条件・数値を確認したい`
      )} | ${escapeCell("文書中の一般的な用法どおりの意味とみなす")} |`
    );
  }
  if (ambiguousFlatToShow.length < ambiguousFlat.length) {
    questionOmissionNotes.push(
      `- 質問状(曖昧語): 全${ambiguousFlat.length}件中 ${ambiguousFlatToShow.length}件を表示（${
        ambiguousFlat.length - ambiguousFlatToShow.length
      }件を省略）。全件は verbose: true で取得できる。`
    );
  }

  const noBoundaryToShowQ = verbose ? noBoundary : noBoundary.slice(0, MAX_QUESTION_ROWS_PER_SOURCE);
  for (const q of noBoundaryToShowQ) {
    lines.push(
      `| ${nextQid()} | 低 | ${escapeCell(place(q.document, q.lineIndex, q.heading))} | ${escapeCell(
        `「${q.raw}」について、境界の扱い(以上/以下/未満/超)を確認したい`
      )} | ${escapeCell("以上（境界を含む）として扱う")} |`
    );
  }
  if (noBoundaryToShowQ.length < noBoundary.length) {
    questionOmissionNotes.push(
      `- 質問状(境界語なし数量表現): 全${noBoundary.length}件中 ${noBoundaryToShowQ.length}件を表示（${
        noBoundary.length - noBoundaryToShowQ.length
      }件を省略）。全件は verbose: true で取得できる。`
    );
  }

  lines.push("");
  if (questionOmissionNotes.length > 0) {
    for (const note of questionOmissionNotes) lines.push(note);
    lines.push("");
  }
  lines.push(
    "上記以外に確認したい事項があれば、続くQ-XX行に「質問ID / 重要度 / 該当箇所 / 質問文 / 暫定前提」の形式で追記してください。"
  );
  lines.push("");

  lines.push("## 4. 改善提案");
  lines.push("");
  for (const item of checklist.items) {
    lines.push(`### ${item.id} ${item.title}`);
    lines.push("");
    for (const action of item.improvementActions) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }

  lines.push(
    ...renderInspectabilitySection("review_test_basis", buildDigestSignals(digestRows)).split("\n")
  );
  lines.push("");

  lines.push(
    ...renderNextToolsSection(
      "review_test_basis",
      duplicates.length > 0 || unresolved.length > 0 || issues.length > 0 || ambiguousTotal > 0
        ? ["has-basis-findings"]
        : [],
      completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

export const reviewTestBasisInputShape = {
  ...completedToolsInputShape,
  documents: z
    .array(
      z.object({
        name: z.string().describe("Document name or file name of the test basis document"),
        content: z.string().describe("Full text of the document (any format; caller converts binaries to text)"),
      })
    )
    .min(1)
    .describe("One or more test basis documents (requirements, specifications) to review"),
  idPatterns: z
    .array(z.string())
    .optional()
    .describe(
      "Extra regular expression sources for requirement/feature IDs, added to the default pattern. Capture group count decides how the ID is built: 1 group = group 1 is used as the whole ID as-is (no hyphen joining), 2 groups = reconstructed as `${group1}-${group2}` (default pattern behavior), 0 groups = the whole match is used. Use a 1-group pattern for numeric-only IDs (031), dot-separated IDs (3.1.2) and underscore IDs (REQ_001) so the reported ID matches the notation in the source document. If a given pattern matches nothing, a [high] finding is emitted in the input digest."
    ),
  additionalAmbiguousTerms: z
    .array(z.string())
    .optional()
    .describe("Extra ambiguous/weak words to count in addition to the built-in list"),
  verbose: z
    .boolean()
    .optional()
    .describe(
      "If false/omitted (default), sections 1.3/1.4/1.6/1.7/1.9 and the chapter 3 question table are truncated to a fixed number of rows with total/omitted counts noted. If true, lists every row in full (as in previous versions)."
    ),
} as const;

export function registerReviewTestBasisTool(server: McpServer): void {
  server.registerTool(
    "review_test_basis",
    {
      title: "Review Test Basis",
      description:
        "テストベース(要件・仕様)の欠陥をレビュー。ID重複・未解決参照・プレフィックス逸脱・曖昧語・数量表現を決定的に検査し、意味的チェックリスト・依頼元への質問状雛形・改善提案を併せて返す。",
      inputSchema: reviewTestBasisInputShape,
    },
    async ({ documents, idPatterns, additionalAmbiguousTerms, completedTools, verbose }) => {
      const markdown = renderTestBasisReview(
        documents,
        { idPatterns, additionalAmbiguousTerms },
        undefined,
        completedTools ?? [],
        verbose ?? false
      );
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
