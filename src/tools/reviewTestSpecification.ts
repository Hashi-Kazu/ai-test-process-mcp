import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testSpecificationReviewChecklist } from "../resources/testSpecificationReviewChecklist.js";
import { testCaseSpecShape } from "./generateTestCases.js";
import {
  buildConditionTraceability,
  findDuplicateCaseIds,
  findEmptyExpectedResults,
  findSubjectiveExpectedResults,
  findUncoveredConditionIds,
} from "../testCaseAnalysis.js";
import {
  COVERAGE_CRITERIA_KEYWORDS,
  PRIORITY_CRITERIA_KEYWORDS,
  buildDerivedFromCoverage,
  buildPriorityDistribution,
  extractAllBasisIds,
  extractRequirementIdsFromDocuments,
  findCasesWithoutPriority,
  findDeclarationKeywords,
  findIdNotationMismatches,
  findPlaceholderPreconditions,
  findStepBalanceIssues,
  findUncoveredIds,
  findUnfoundedCases,
  findUnknownConditionRefs,
  findUnknownRiskRefs,
} from "../testSpecificationAnalysis.js";
import type {
  ReviewTestSpecificationInput,
  TestCaseSpec,
  TestSpecificationCoverageRow,
  TestSpecificationReviewChecklist,
} from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function coverageTable(rows: TestSpecificationCoverageRow[], idHeader: string): string[] {
  const lines: string[] = [];
  lines.push(`| ${idHeader} | 紐づくケースID | 件数 |`);
  lines.push("| --- | --- | --- |");
  for (const row of rows) {
    lines.push(
      `| ${escapeCell(row.id)} | ${escapeCell(
        row.caseIds.length > 0 ? row.caseIds.join(", ") : "-"
      )} | ${row.caseIds.length} |`
    );
  }
  return lines;
}

function declarationLines(
  check: { found: boolean; matches: { keyword: string; place: string; lineText: string }[] },
  label: string
): string[] {
  const lines: string[] = [];
  if (!check.found) {
    lines.push(`- [medium] ${label}の記述が見つからない。テスト仕様書に明記すること。`);
    return lines;
  }
  lines.push(`- ${label}の記述あり(${check.matches.length}件)`);
  for (const m of check.matches.slice(0, 20)) {
    lines.push(`  - 「${m.keyword}」(${m.place}): ${escapeCell(m.lineText)}`);
  }
  if (check.matches.length > 20) {
    lines.push(`  - ほか ${check.matches.length - 20}件`);
  }
  return lines;
}

export function renderTestSpecificationReview(
  input: ReviewTestSpecificationInput,
  checklist: TestSpecificationReviewChecklist = testSpecificationReviewChecklist
): string {
  const {
    testBasisDocuments,
    testSpecificationText,
    testConditions,
    risks,
    idPatterns,
    additionalAmbiguousTerms,
    additionalSubjectiveTerms,
  } = input;
  const testCases: TestCaseSpec[] = input.testCases ?? [];
  const hasCases = testCases.length > 0;
  const analysisOptions = { idPatterns, additionalAmbiguousTerms };

  const requirementIds =
    input.requirementIds && input.requirementIds.length > 0
      ? input.requirementIds
      : extractRequirementIdsFromDocuments(testBasisDocuments, analysisOptions);
  const basisIds = extractAllBasisIds(testBasisDocuments, analysisOptions);

  const requirementRows = buildDerivedFromCoverage(requirementIds, testCases);
  const uncoveredRequirementIds = findUncoveredIds(requirementRows);
  const unfoundedCases = findUnfoundedCases(requirementIds, testCases, "requirementIds[]");

  const conditionRows = testConditions ? buildConditionTraceability(testConditions, testCases) : [];
  const uncoveredConditionIds = testConditions
    ? findUncoveredConditionIds(testConditions, testCases)
    : [];
  const unknownConditionRefs = testConditions
    ? findUnknownConditionRefs(testConditions, testCases)
    : [];

  const riskRows = risks ? buildDerivedFromCoverage(risks.map((r) => r.id), testCases) : [];
  const uncoveredRiskIds = findUncoveredIds(riskRows);
  const unknownRiskRefs = risks ? findUnknownRiskRefs(risks, testCases) : [];

  const idMismatches = findIdNotationMismatches(basisIds, testCases);
  const duplicates = findDuplicateCaseIds(testCases);
  const emptyExpected = findEmptyExpectedResults(testCases);
  const noPriority = findCasesWithoutPriority(testCases);
  const priorityDistribution = buildPriorityDistribution(testCases);
  const priorityCriteria = findDeclarationKeywords(testSpecificationText, PRIORITY_CRITERIA_KEYWORDS);
  const preconditionFindings = findPlaceholderPreconditions(testCases);
  const stepBalanceFindings = findStepBalanceIssues(testCases);
  const subjectiveFindings = findSubjectiveExpectedResults(testCases, additionalSubjectiveTerms);
  const coverageCriteria = findDeclarationKeywords(testSpecificationText, COVERAGE_CRITERIA_KEYWORDS);

  const lines: string[] = [];
  lines.push("# テスト仕様書レビュー結果");
  lines.push("");
  lines.push("## 1. 決定的検査(自動)");
  lines.push("");

  // --- 1.1 対象文書 ---
  lines.push("### 1.1 対象文書");
  lines.push("");
  for (const doc of testBasisDocuments) {
    lines.push(`- テストベース: ${doc.name}(行数: ${doc.content.split("\n").length})`);
  }
  lines.push(`- テスト仕様書(行数: ${testSpecificationText.split("\n").length})`);
  lines.push(
    `- 抽出した要件ID数: ${requirementIds.length}(${
      input.requirementIds && input.requirementIds.length > 0 ? "入力指定" : "テストベースの定義行から自動抽出"
    })`
  );
  if (!hasCases) {
    lines.push(
      "- [medium] testCases が未指定のため、ID抽出ベースの簡易チェックのみを実施した。構造検査を通すには testCases を渡すこと。"
    );
  }
  lines.push("");

  // --- 1.2 要件IDカバレッジ ---
  lines.push("### 1.2 要件IDカバレッジ(双方向)");
  lines.push("");
  if (requirementIds.length === 0) {
    lines.push("- 要件IDを抽出できなかった。idPatterns で抽出パターンを指定するか requirementIds を直接渡すこと。");
    lines.push("");
  } else {
    for (const l of coverageTable(requirementRows, "要件ID")) lines.push(l);
    lines.push("");
  }

  lines.push("#### 1.2.1 未カバー要件候補(forward)");
  lines.push("");
  if (!hasCases) {
    lines.push("- testCases 未指定のため判定不可");
  } else if (uncoveredRequirementIds.length === 0) {
    lines.push("- 未カバーなし");
  } else {
    for (const id of uncoveredRequirementIds) {
      lines.push(`- [high] ${escapeCell(id)}: どのケースの由来にも現れない。テストケースを追加するか対象外の理由を明記すること。`);
    }
  }
  lines.push("");

  lines.push("#### 1.2.2 根拠不明テスト・過剰テスト候補(reverse)");
  lines.push("");
  if (!hasCases) {
    lines.push("- testCases 未指定のため判定不可");
  } else if (unfoundedCases.length === 0) {
    lines.push("- 該当なし");
  } else {
    for (const c of unfoundedCases) {
      lines.push(
        `- [high] ${escapeCell(c.caseId)}: 由来「${escapeCell(c.refs.join(", "))}」が ${
          c.expectedKind
        } のいずれにも一致しない。`
      );
    }
  }
  lines.push("");

  // --- 1.3 テスト条件IDカバレッジ ---
  let sectionNo = 3;
  if (testConditions) {
    lines.push(`### 1.${sectionNo} テスト条件IDカバレッジ(双方向)`);
    lines.push("");
    for (const l of coverageTable(
      conditionRows.map((r) => ({ id: r.conditionId, caseIds: r.caseIds })),
      "テスト条件ID"
    )) {
      lines.push(l);
    }
    lines.push("");
    lines.push(`#### 1.${sectionNo}.1 未カバーテスト条件(forward)`);
    lines.push("");
    if (!hasCases) {
      lines.push("- testCases 未指定のため判定不可");
    } else if (uncoveredConditionIds.length === 0) {
      lines.push("- 未カバーなし");
    } else {
      for (const id of uncoveredConditionIds) {
        lines.push(`- [high] ${escapeCell(id)}: 紐づくテストケースが0件。テストケースを追加すること。`);
      }
    }
    lines.push("");
    lines.push(`#### 1.${sectionNo}.2 根拠不明テスト候補(reverse)`);
    lines.push("");
    if (!hasCases) {
      lines.push("- testCases 未指定のため判定不可");
    } else if (unknownConditionRefs.length === 0) {
      lines.push("- 該当なし");
    } else {
      for (const c of unknownConditionRefs) {
        lines.push(
          `- [high] ${escapeCell(c.caseId)}: 由来条件「${escapeCell(c.refs.join(", "))}」が ${
            c.expectedKind
          } に存在しない。`
        );
      }
    }
    lines.push("");
    sectionNo++;
  }

  // --- 1.x リスクIDカバレッジ ---
  if (risks) {
    lines.push(`### 1.${sectionNo} リスクIDカバレッジ(双方向)`);
    lines.push("");
    for (const l of coverageTable(riskRows, "リスクID")) lines.push(l);
    lines.push("");
    lines.push(`#### 1.${sectionNo}.1 未カバーリスク(forward)`);
    lines.push("");
    if (!hasCases) {
      lines.push("- testCases 未指定のため判定不可");
    } else if (uncoveredRiskIds.length === 0) {
      lines.push("- 未カバーなし");
    } else {
      for (const id of uncoveredRiskIds) {
        lines.push(`- [high] ${escapeCell(id)}: どのケースの由来にも現れない。リスクに対応するテストケースを追加すること。`);
      }
    }
    lines.push("");
    lines.push(`#### 1.${sectionNo}.2 未知のリスクID参照(reverse)`);
    lines.push("");
    if (!hasCases) {
      lines.push("- testCases 未指定のため判定不可");
    } else if (unknownRiskRefs.length === 0) {
      lines.push("- 該当なし");
    } else {
      for (const c of unknownRiskRefs) {
        lines.push(
          `- [medium] ${escapeCell(c.caseId)}: 由来「${escapeCell(c.refs.join(", "))}」が ${
            c.expectedKind
          } に存在しない。`
        );
      }
    }
    lines.push("");
    sectionNo++;
  }

  // --- ID表記の同期 ---
  const idSyncNo = sectionNo;
  lines.push(`### 1.${idSyncNo} ID表記の同期`);
  lines.push("");
  if (idMismatches.length === 0) {
    lines.push("- 表記ゆれなし");
  } else {
    for (const m of idMismatches) {
      lines.push(
        `- [medium] ${escapeCell(m.caseId)} の ${m.field}「${escapeCell(m.ref)}」は、テストベース定義の「${escapeCell(
          m.matchedId
        )}」と正規化後は一致する。表記を揃えること。`
      );
    }
  }
  lines.push("");

  // --- ケースIDの重複・期待結果の空欄 ---
  lines.push(`### 1.${idSyncNo + 1} ケースIDの重複・期待結果の空欄`);
  lines.push("");
  if (duplicates.length === 0) {
    lines.push("- 重複ケースID: なし");
  } else {
    for (const dup of duplicates) {
      lines.push(`- [high] 重複ケースID: ${escapeCell(dup.id)}(${dup.count}件)`);
    }
  }
  if (emptyExpected.length === 0) {
    lines.push("- 期待結果の空欄: なし");
  } else {
    for (const f of emptyExpected) {
      lines.push(`- [${f.severity}] ${escapeCell(f.caseId)} 手順${f.stepNo}: ${f.detail}`);
    }
  }
  lines.push("");

  // --- 優先度の付与状況 ---
  lines.push(`### 1.${idSyncNo + 2} 優先度の付与状況`);
  lines.push("");
  lines.push("| 優先度 | 件数 |");
  lines.push("| --- | --- |");
  for (const row of priorityDistribution) {
    lines.push(`| ${row.level} | ${row.count} |`);
  }
  lines.push("");
  if (noPriority.length === 0) {
    lines.push("- 優先度未設定ケース: なし");
  } else {
    lines.push(`- [medium] 優先度未設定ケース(${noPriority.length}件): ${escapeCell(noPriority.join(", "))}`);
  }
  for (const l of declarationLines(priorityCriteria, "優先度の判定基準")) lines.push(l);
  lines.push("");

  // --- 前提条件・状態変数の記述状況 ---
  lines.push(`### 1.${idSyncNo + 3} 前提条件・状態変数の記述状況`);
  lines.push("");
  if (preconditionFindings.length === 0) {
    lines.push("- 該当なし");
  } else {
    for (const f of preconditionFindings) {
      lines.push(`- [high] ${escapeCell(f.caseId)}(${f.kind}): ${f.detail}`);
    }
  }
  lines.push("");

  // --- 手順数と期待結果数のバランス ---
  lines.push(`### 1.${idSyncNo + 4} 手順数と期待結果数のバランス`);
  lines.push("");
  if (stepBalanceFindings.length === 0) {
    lines.push("- 検証点不足なし");
  } else {
    for (const f of stepBalanceFindings) {
      lines.push(`- [medium] ${escapeCell(f.caseId)}: ${f.detail}`);
    }
  }
  lines.push("");

  // --- 主観語・非観測可能語 ---
  lines.push(`### 1.${idSyncNo + 5} 主観語・非観測可能語`);
  lines.push("");
  if (subjectiveFindings.length === 0) {
    lines.push("- 該当なし");
  } else {
    for (const f of subjectiveFindings) {
      lines.push(`- [${f.severity}] ${escapeCell(f.caseId)} 手順${f.stepNo}: ${f.detail}`);
    }
  }
  lines.push("");

  // --- 網羅基準の宣言有無 ---
  lines.push(`### 1.${idSyncNo + 6} 網羅基準の宣言有無`);
  lines.push("");
  for (const l of declarationLines(coverageCriteria, "網羅基準")) lines.push(l);
  lines.push("");

  // --- サマリ ---
  lines.push(`### 1.${idSyncNo + 7} サマリ`);
  lines.push("");
  lines.push(
    `- テストケース数: ${testCases.length} / 要件ID数: ${requirementIds.length} / 未カバー要件数: ${uncoveredRequirementIds.length} / 根拠不明ケース数: ${unfoundedCases.length} / 未カバーテスト条件数: ${uncoveredConditionIds.length} / 未知条件参照数: ${unknownConditionRefs.length} / 未カバーリスク数: ${uncoveredRiskIds.length} / 未知リスク参照数: ${unknownRiskRefs.length} / ID表記ゆれ数: ${idMismatches.length} / 重複ケースID数: ${duplicates.length} / 期待結果空欄数: ${emptyExpected.length} / 優先度未設定数: ${noPriority.length} / 前提条件指摘数: ${preconditionFindings.length} / 検証点不足数: ${stepBalanceFindings.length} / 主観語指摘数: ${subjectiveFindings.length} / 優先度基準宣言: ${
      priorityCriteria.found ? "あり" : "なし"
    } / 網羅基準宣言: ${coverageCriteria.found ? "あり" : "なし"}`
  );
  lines.push("");

  // --- 2. 意味的レビュー用チェックリスト ---
  lines.push("## 2. 意味的レビュー用チェックリスト(呼び出し側 LLM が適用)");
  lines.push("");
  lines.push(
    "以下の各観点について、テストベース本文とテスト仕様書本文を突き合わせて評価し、問題点を該当箇所付きで指摘してください。"
  );
  lines.push("");
  for (const item of checklist.items) {
    lines.push(`### ${item.id} [${item.severity}] ${item.title}`);
    lines.push("");
    lines.push(item.check);
    lines.push("");
    const glossaryPart =
      item.glossaryRefs && item.glossaryRefs.length > 0 ? item.glossaryRefs.join(", ") : "-";
    lines.push(`根拠: 用語 ${glossaryPart}`);
    lines.push("");
  }

  // --- 3. 改善提案 ---
  lines.push("## 3. 改善提案");
  lines.push("");
  for (const item of checklist.items) {
    lines.push(`### ${item.id} ${item.title}`);
    lines.push("");
    for (const action of item.improvementActions) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export const reviewTestSpecificationInputShape = {
  testBasisDocuments: z
    .array(
      z.object({
        name: z.string().describe("Document name or file name of the test basis document"),
        content: z
          .string()
          .describe("Full text of the document (any format; caller converts binaries to text)"),
      })
    )
    .min(1)
    .describe("One or more test basis documents the test specification is evaluated against"),
  testSpecificationText: z
    .string()
    .describe("Full text of the test specification document (any format)"),
  testCases: z
    .array(testCaseSpecShape)
    .optional()
    .describe(
      "Structured test case specs, same shape as generate_test_cases; omitted triggers id-extraction-only simple checks"
    ),
  requirementIds: z
    .array(z.string())
    .optional()
    .describe("Requirement ids; omitted triggers automatic extraction from testBasisDocuments"),
  testConditions: z
    .array(
      z.object({
        id: z.string().describe("Test condition id, e.g. TC-001"),
        target: z.string().describe("Target of the condition"),
        statement: z.string().describe("The test condition statement"),
        derivedFrom: z.array(z.string()).min(1).describe("Requirement/risk/persona ids (required)"),
        priority: z.enum(["高", "中", "低"]).optional(),
      })
    )
    .optional()
    .describe("Test conditions (extract_test_conditions output); omitted skips the condition axis"),
  risks: z
    .array(
      z.object({
        id: z.string().describe("Risk id, e.g. R-001"),
        description: z.string().describe("Risk description"),
      })
    )
    .optional()
    .describe("Risks; omitted skips the risk axis"),
  idPatterns: z
    .array(z.string())
    .optional()
    .describe("Extra regular expression sources for requirement/feature IDs, added to the default pattern"),
  additionalAmbiguousTerms: z.array(z.string()).optional(),
  additionalSubjectiveTerms: z
    .array(z.string())
    .optional()
    .describe("Extra subjective words checked in expected results"),
  idPrefix: z.string().optional().describe("Test case id prefix (default TCS-)"),
} as const;

export function registerReviewTestSpecificationTool(server: McpServer): void {
  server.registerTool(
    "review_test_specification",
    {
      title: "Review Test Specification",
      description:
        "テストベースに対してテスト仕様書が十分かをレビュー。要件ID・テスト条件ID・リスクIDの3系統×双方向カバレッジ、ID表記ゆれ、" +
        "ケースID重複・期待結果空欄・優先度付与・前提条件・手順と期待結果のバランス・主観語・網羅基準宣言を決定的に検査し、" +
        "意味的チェックリストと改善提案を併せて返す。",
      inputSchema: reviewTestSpecificationInputShape,
    },
    async (input) => {
      const markdown = renderTestSpecificationReview(input as ReviewTestSpecificationInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
