import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testPurposeDerivationFrame } from "../resources/testPurposeDerivationFrame.js";
import { formatSourceCitation } from "../testBasisAnalysis.js";
import {
  buildPurposeConditionMatrix,
  buildPurposeQualityMatrix,
  buildPurposeTestTypeMatrix,
  computeTestPurposeCoverage,
  findConditionLessPurposes,
  findDuplicateTestPurposeIds,
  findExpectationLessTestRequirements,
  findMissingRequirementLines,
  findMissingTestPurposeNumbers,
  findOrphanExpectations,
  findPrefixMismatchTestPurposeIds,
  findPriorityIssues,
  findPurposeLessConditions,
  findPurposesWithoutSuccessCriterion,
  findQualityCharacteristicIssues,
  findRequirementLessPurposes,
  findTestTypeLessPurposes,
  findTestTypeSelectionIssues,
  findUngroundedExpectations,
  findUnknownTestTypeNames,
  findUnresolvedTestPurposeRefs,
  findUnusedTestRequirements,
} from "../testPurposeAnalysis.js";
import type { DeriveTestPurposesInput, TestPurposeDerivationFrame } from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function bulletsOrNone(items: string[]): string[] {
  return items.length === 0 ? ["- なし"] : items;
}

const priorityIssueLabel: Record<string, string> = {
  "missing-rank": "優先順位(priorityRank)が未設定",
  "duplicate-rank": "優先順位が他の目的と重複している",
  "missing-rationale": "優先順位の根拠(priorityRationale)が未記入",
};

const typeSelectionIssueLabel: Record<string, string> = {
  "selected-without-purpose": "選定(selected:true)なのに紐づくテスト目的IDが無い",
  "selected-without-reason": "選定(selected:true)なのに選定理由(reason)が未記入",
  "unselected-with-purpose": "非選定(selected:false)なのに紐づくテスト目的IDが指定されている",
};

const groundingIssueLabel: Record<string, string> = {
  "not-in-documents": "依頼書本文のどこにもIDも期待文言も出現しない",
  "unknown-document": "sourceRef.document が依頼書一覧に存在しない",
  "line-out-of-range": "sourceRef の行番号が依頼書の行数を超えている",
};

export function renderTestPurposeDerivation(
  input: DeriveTestPurposesInput,
  frame: TestPurposeDerivationFrame = testPurposeDerivationFrame
): string {
  const expectations = input.expectations;
  const testRequirements = input.testRequirements;
  const strategyStatements = input.strategyStatements ?? [];
  const purposes = input.purposes;
  const testConditions = input.testConditions ?? [];
  const testTypeSelections = input.testTypeSelections ?? [];
  const requestDocuments = input.requestDocuments;

  const unresolvedRefs = findUnresolvedTestPurposeRefs(input);
  const duplicateIds = findDuplicateTestPurposeIds(input);
  const prefixMismatch = findPrefixMismatchTestPurposeIds(input);
  const missingNumbers = findMissingTestPurposeNumbers(input);
  const orphanExpectations = findOrphanExpectations(input);
  const expectationLessRequirements = findExpectationLessTestRequirements(input);
  const unusedRequirements = findUnusedTestRequirements(input);
  const requirementLessPurposes = findRequirementLessPurposes(input);
  const missingRequirementLines = findMissingRequirementLines(input);
  const purposeLessConditions = findPurposeLessConditions(input);
  const conditionLessPurposes = findConditionLessPurposes(input);
  const typeSelectionIssues = findTestTypeSelectionIssues(input);
  const testTypeLessPurposes = findTestTypeLessPurposes(input);
  const purposesWithoutSuccessCriterion = findPurposesWithoutSuccessCriterion(input);
  const priorityIssues = findPriorityIssues(input);
  const qualityIssues = findQualityCharacteristicIssues(input);
  const ungroundedExpectations = findUngroundedExpectations(input);
  const coverage = computeTestPurposeCoverage(input);
  const unknownTestTypeNames = findUnknownTestTypeNames(input);

  const lines: string[] = [];
  lines.push("# テスト目的の導出結果");
  lines.push("");

  // --- 1. 導出チェーンの定義 ---
  lines.push("## 1. 導出チェーンの定義");
  lines.push("");
  lines.push("### 1.1 導出段");
  lines.push("");
  lines.push("| 段ID | 名称 | 定義 | この段で残す成果 |");
  lines.push("| --- | --- | --- | --- |");
  for (const s of frame.stages) {
    lines.push(
      `| ${s.id} | ${escapeCell(s.nameJa)} | ${escapeCell(s.definition)} | ${escapeCell(s.outputConvention)} |`
    );
  }
  lines.push("");

  lines.push("### 1.2 テスト要求の2系統");
  lines.push("");
  lines.push("| 系統ID | 系統 | 定義 | 典型的な対象 |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of frame.requirementLines) {
    lines.push(
      `| ${r.id} | ${escapeCell(r.nameJa)} | ${escapeCell(r.definition)} | ${escapeCell(
        r.typicalSubjects.join(" / ")
      )} |`
    );
  }
  lines.push("");

  lines.push("### 1.3 参照した依頼書");
  lines.push("");
  if (!requestDocuments || requestDocuments.length === 0) {
    lines.push("依頼書未指定のため PDC-15 は不実施。");
  } else {
    lines.push("| 文書名 | 行数 |");
    lines.push("| --- | --- |");
    for (const d of requestDocuments) {
      lines.push(`| ${escapeCell(d.name)} | ${d.content.split("\n").length} |`);
    }
  }
  lines.push("");

  // --- 2. 導出チェーン ---
  lines.push("## 2. 導出チェーン");
  lines.push("");

  lines.push("### 2.1 依頼者の期待");
  lines.push("");
  lines.push("| 期待ID | 依頼者 | 期待 | 根拠位置 |");
  lines.push("| --- | --- | --- | --- |");
  for (const e of expectations) {
    const source = e.sourceRef ? formatSourceCitation(e.sourceRef) : "未特定";
    lines.push(
      `| ${escapeCell(e.id)} | ${escapeCell(e.requesterRole ?? "-")} | ${escapeCell(
        e.statement
      )} | ${escapeCell(source)} |`
    );
  }
  lines.push("");

  lines.push("### 2.2 テスト要求");
  lines.push("");
  lines.push("| 要求ID | 系統 | 要求 | 紐づく期待ID |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of testRequirements) {
    lines.push(
      `| ${escapeCell(r.id)} | ${r.line} | ${escapeCell(r.statement)} | ${escapeCell(
        r.expectationIds && r.expectationIds.length > 0 ? r.expectationIds.join(", ") : "-"
      )} |`
    );
  }
  lines.push("");

  lines.push("### 2.3 テスト戦略");
  lines.push("");
  if (strategyStatements.length === 0) {
    lines.push("戦略の宣言なし。");
  } else {
    for (const s of strategyStatements) {
      lines.push(`- ${escapeCell(s.id)}: ${escapeCell(s.statement)}`);
    }
  }
  lines.push("");

  lines.push("### 2.4 テスト目的");
  lines.push("");
  lines.push(
    "| 目的ID | 目的 | 紐づく要求ID | 紐づく戦略ID | 達成判定基準 | 優先順位 | 優先順位の根拠 | 関連品質特性 |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const p of purposes) {
    lines.push(
      `| ${escapeCell(p.id)} | ${escapeCell(p.statement)} | ${escapeCell(
        p.testRequirementIds && p.testRequirementIds.length > 0 ? p.testRequirementIds.join(", ") : "-"
      )} | ${escapeCell(
        p.strategyIds && p.strategyIds.length > 0 ? p.strategyIds.join(", ") : "-"
      )} | ${escapeCell(p.successCriterion ?? "未記入(必須)")} | ${
        p.priorityRank ?? "-"
      } | ${escapeCell(p.priorityRationale ?? "未記入(必須)")} | ${escapeCell(
        p.relatedQualityCharacteristicIds && p.relatedQualityCharacteristicIds.length > 0
          ? p.relatedQualityCharacteristicIds.join(", ")
          : "-"
      )} |`
    );
  }
  lines.push("");

  // --- 3. 決定的検査(自動) ---
  lines.push("## 3. 決定的検査(自動)");
  lines.push("");

  lines.push("### 3.1 未解決参照(PDC-01)");
  lines.push("");
  lines.push(
    ...bulletsOrNone(
      unresolvedRefs.map(
        (r) => `- [high] ${escapeCell(r.ownerId)}: 参照「${escapeCell(r.ref)}」が ${r.expectedKind} に存在しない`
      )
    )
  );
  lines.push("");

  lines.push("### 3.2 ID重複・プレフィックス不一致・欠番(PDC-02)");
  lines.push("");
  const idIssueBullets: string[] = [
    ...duplicateIds.map((d) => `- [high] ${d.kind} ${escapeCell(d.id)}: ID重複(${d.count}件)`),
    ...prefixMismatch.map(
      (m) => `- [high] ${m.kind} ${escapeCell(m.id)}: プレフィックス不一致(既定/指定 ${m.expectedPrefix})`
    ),
    ...missingNumbers.map((m) => `- [high] ${m.kind} ${escapeCell(m.id)}: 欠番`),
  ];
  lines.push(...bulletsOrNone(idIssueBullets));
  lines.push("");

  lines.push("### 3.3 どのテスト要求からも参照されない依頼者の期待(PDC-03)");
  lines.push("");
  lines.push(
    ...bulletsOrNone(
      orphanExpectations.map((e) => `- [high] ${escapeCell(e.id)}: ${escapeCell(e.statement)}`)
    )
  );
  lines.push("");

  lines.push("### 3.4 依頼者の期待に紐づかないテスト要求(PDC-04)");
  lines.push("");
  lines.push(
    ...bulletsOrNone(expectationLessRequirements.map((id) => `- [high] ${escapeCell(id)}`))
  );
  lines.push("");

  lines.push("### 3.5 どのテスト目的からも参照されないテスト要求(PDC-05)");
  lines.push("");
  lines.push(...bulletsOrNone(unusedRequirements.map((id) => `- [high] ${escapeCell(id)}`)));
  lines.push("");

  lines.push("### 3.6 テスト要求に紐づかないテスト目的(PDC-06)");
  lines.push("");
  lines.push(...bulletsOrNone(requirementLessPurposes.map((id) => `- [high] ${escapeCell(id)}`)));
  lines.push("");

  lines.push("### 3.7 テスト要求の系統欠落(PDC-07)");
  lines.push("");
  lines.push(
    ...bulletsOrNone(
      missingRequirementLines.map((l) => `- [medium] ${l}: この系統のテスト要求が0件`)
    )
  );
  lines.push("");

  lines.push("### 3.8 どのテスト目的にも紐づかないテスト条件(PDC-08)");
  lines.push("");
  lines.push(...bulletsOrNone(purposeLessConditions.map((id) => `- [high] ${escapeCell(id)}`)));
  lines.push("");

  lines.push("### 3.9 どのテスト条件からも参照されないテスト目的(PDC-09)");
  lines.push("");
  lines.push(...bulletsOrNone(conditionLessPurposes.map((id) => `- [high] ${escapeCell(id)}`)));
  lines.push("");

  lines.push("### 3.10 テストタイプ選択と目的の不整合(PDC-10)");
  lines.push("");
  lines.push(
    ...bulletsOrNone(
      typeSelectionIssues.map(
        (i) => `- [high] ${escapeCell(i.name)}: ${typeSelectionIssueLabel[i.kind]}`
      )
    )
  );
  lines.push("");

  lines.push("### 3.11 どのテストタイプにも紐づかないテスト目的(PDC-11)");
  lines.push("");
  lines.push(...bulletsOrNone(testTypeLessPurposes.map((id) => `- [medium] ${escapeCell(id)}`)));
  lines.push("");

  lines.push("### 3.12 達成判定基準の未記入(PDC-12)");
  lines.push("");
  lines.push(
    ...bulletsOrNone(purposesWithoutSuccessCriterion.map((id) => `- [high] ${escapeCell(id)}`))
  );
  lines.push("");

  lines.push("### 3.13 優先順位の未設定・重複・根拠未記入(PDC-13)");
  lines.push("");
  lines.push(
    ...bulletsOrNone(
      priorityIssues.map(
        (i) =>
          `- [high] ${escapeCell(i.purposeId)}: ${priorityIssueLabel[i.kind]}${
            i.rank !== undefined ? `(順位 ${i.rank})` : ""
          }`
      )
    )
  );
  lines.push("");

  lines.push("### 3.14 品質特性の未割当・未知ID(PDC-14)");
  lines.push("");
  lines.push(
    ...bulletsOrNone(
      qualityIssues.map((i) =>
        i.kind === "unassigned"
          ? `- [medium] ${escapeCell(i.ownerId)}: 品質特性IDが1件も割り当てられていない`
          : `- [medium] ${escapeCell(i.ownerId)}: 「${escapeCell(
              i.characteristicId ?? ""
            )}」は品質特性モデルに存在しないID`
      )
    )
  );
  lines.push("");

  lines.push("### 3.15 依頼書本文に裏付けの無い期待(PDC-15)");
  lines.push("");
  if (!requestDocuments || requestDocuments.length === 0) {
    lines.push("- なし(依頼書未指定のため不実施)");
  } else {
    lines.push(
      ...bulletsOrNone(
        ungroundedExpectations.map(
          (e) =>
            `- [high] ${escapeCell(e.id)}: ${groundingIssueLabel[e.kind]}${
              e.document ? `(文書: ${escapeCell(e.document)})` : ""
            }`
        )
      )
    );
  }
  lines.push("");

  lines.push("### 3.16 宣言した被覆率と実測値の不一致(PDC-16)");
  lines.push("");
  const coverageBullets: string[] = [];
  if (coverage.purposeCoverageMismatch) {
    coverageBullets.push(
      `- [high] テスト目的の被覆率: 宣言 ${coverage.claimedPurposeCoveragePercent ?? "-"}% に対し実測 ${
        coverage.computedPurposeCoveragePercent ?? "未算出(条件未指定)"
      }%`
    );
  }
  if (coverage.testTypeJustificationMismatch) {
    coverageBullets.push(
      `- [high] テストタイプ選定根拠率: 宣言 ${coverage.claimedTestTypeJustificationPercent ?? "-"}% に対し実測 ${
        coverage.computedTestTypeJustificationPercent ?? "未算出(選定タイプ未指定)"
      }%`
    );
  }
  lines.push(...bulletsOrNone(coverageBullets));
  lines.push("");

  lines.push("### 3.17 カタログ外のテストタイプ名(PDC-17)");
  lines.push("");
  lines.push(...bulletsOrNone(unknownTestTypeNames.map((n) => `- [medium] ${escapeCell(n)}`)));
  lines.push("");

  lines.push("### 3.18 サマリ");
  lines.push("");
  lines.push(
    `- 未解決参照数: ${unresolvedRefs.length} / ID重複数: ${duplicateIds.length} / プレフィックス不一致数: ${prefixMismatch.length} / 欠番数: ${missingNumbers.length} / 孤立期待数: ${orphanExpectations.length} / 期待未紐づけ要求数: ${expectationLessRequirements.length} / 未使用要求数: ${unusedRequirements.length} / 要求未紐づけ目的数: ${requirementLessPurposes.length} / 系統欠落数: ${missingRequirementLines.length} / 目的未紐づけ条件数: ${purposeLessConditions.length} / 条件未展開目的数: ${conditionLessPurposes.length} / タイプ選択不整合数: ${typeSelectionIssues.length} / タイプ未紐づけ目的数: ${testTypeLessPurposes.length} / 達成基準未記入数: ${purposesWithoutSuccessCriterion.length} / 優先順位問題数: ${priorityIssues.length} / 品質特性問題数: ${qualityIssues.length} / 裏付けなし期待数: ${ungroundedExpectations.length} / 被覆率不一致数: ${
      (coverage.purposeCoverageMismatch ? 1 : 0) + (coverage.testTypeJustificationMismatch ? 1 : 0)
    } / カタログ外タイプ名数: ${unknownTestTypeNames.length}`
  );
  lines.push("");

  // --- 4. 目的IDの貫通マトリクス ---
  lines.push("## 4. 目的IDの貫通マトリクス");
  lines.push("");
  lines.push("### 4.1 テスト目的 × テスト条件");
  lines.push("");
  lines.push("| 目的ID | 目的 | 紐づくテスト条件ID |");
  lines.push("| --- | --- | --- |");
  for (const row of buildPurposeConditionMatrix(input)) {
    lines.push(
      `| ${escapeCell(row.purposeId)} | ${escapeCell(row.statement)} | ${escapeCell(
        row.conditionIds.length > 0 ? row.conditionIds.join(", ") : "-"
      )} |`
    );
  }
  lines.push("");

  lines.push("### 4.2 テスト目的 × テストタイプ");
  lines.push("");
  lines.push("| 目的ID | 紐づくテストタイプ |");
  lines.push("| --- | --- |");
  for (const row of buildPurposeTestTypeMatrix(input)) {
    lines.push(
      `| ${escapeCell(row.purposeId)} | ${escapeCell(
        row.typeNames.length > 0 ? row.typeNames.join(", ") : "-"
      )} |`
    );
  }
  lines.push("");

  lines.push("### 4.3 テスト目的 × 品質特性");
  lines.push("");
  lines.push("| 目的ID | 関連品質特性ID |");
  lines.push("| --- | --- |");
  for (const row of buildPurposeQualityMatrix(input)) {
    lines.push(
      `| ${escapeCell(row.purposeId)} | ${escapeCell(
        row.characteristicIds.length > 0 ? row.characteristicIds.join(", ") : "-"
      )} |`
    );
  }
  lines.push("");

  // --- 5. 意味的層の洗い出し指示 ---
  lines.push("## 5. 意味的層の洗い出し指示(意味的層)");
  lines.push("");
  lines.push(
    "PDC-03/05/09/11 で指摘された要素(どの下流にも紐づかない期待・テスト要求・テスト目的)を優先的に再検討すること。"
  );
  lines.push("");
  lines.push("### 5.1 導出段ごとの問い");
  lines.push("");
  for (const s of frame.stages) {
    lines.push(`#### ${s.id} ${s.nameJa}`);
    lines.push("");
    lines.push("問い:");
    for (const q of s.questionExamples) lines.push(`- ${q}`);
    lines.push("");
    lines.push("避けるべき書き方:");
    for (const b of s.badExamples) lines.push(`- ${b}`);
    lines.push("");
  }

  lines.push("### 5.2 テスト要求の2系統ごとの問い");
  lines.push("");
  for (const r of frame.requirementLines) {
    lines.push(`- ${r.id} ${r.nameJa}: ${r.probeQuestions.join(" / ")}`);
  }
  lines.push("");

  lines.push("### 5.3 テスト目的の質の点検");
  lines.push("");
  for (const q of frame.purposeQualityRules) {
    lines.push(`- ${q.id} ${q.nameJa}: ${q.rule}`);
  }
  lines.push("");

  lines.push("### 5.4 優先順位付けの軸");
  lines.push("");
  for (const a of frame.prioritizationAxes) {
    lines.push(`- ${a.id} ${a.nameJa}: ${a.definition}(${a.probeQuestions.join(" / ")})`);
  }
  lines.push("");

  const signals: string[] = [];
  if (purposes.length > 0) signals.push("has-purposes");
  if (purposeLessConditions.length > 0) signals.push("has-unlinked-conditions");
  if (typeSelectionIssues.length > 0) signals.push("has-unjustified-test-types");

  lines.push(...renderNextToolsSection("derive_test_purposes", signals, input.completedTools).split("\n"));

  return lines.join("\n").trimEnd() + "\n";
}

export const deriveTestPurposesInputShape = {
  ...completedToolsInputShape,
  projectName: z.string().optional().describe("Name of the project or system under test"),
  requestDocuments: z
    .array(z.object({ name: z.string(), content: z.string() }))
    .optional()
    .describe("Request documents (e.g. system test request letter) used to ground expectations (PDC-15)"),
  expectations: z
    .array(
      z.object({
        id: z.string().describe("Expectation id, default prefix EXP-"),
        statement: z.string().describe("The requester's expectation statement"),
        requesterRole: z.string().optional().describe("Role of the requester who holds this expectation"),
        sourceRef: z
          .object({
            document: z.string(),
            startLine: z.number().int().min(1),
            endLine: z.number().int().min(1).optional(),
            heading: z.string().optional(),
            label: z.string().optional(),
          })
          .optional()
          .describe("Source location in requestDocuments backing this expectation"),
      })
    )
    .describe("Requester expectations (stage 1 of the derivation chain)"),
  testRequirements: z
    .array(
      z.object({
        id: z.string().describe("Test requirement id, default prefix TR-"),
        line: z.enum(["management", "engineering"]).describe("Requirement line"),
        statement: z.string().describe("The test requirement statement"),
        expectationIds: z.array(z.string()).optional().describe("Expectation ids this requirement was derived from"),
        rationale: z.string().optional(),
      })
    )
    .describe("Test requirements split into management / engineering lines (stage 2)"),
  strategyStatements: z
    .array(z.object({ id: z.string(), statement: z.string() }))
    .optional()
    .describe("Test strategy statements (stage 3); not required to be referenced downstream"),
  purposes: z
    .array(
      z.object({
        id: z.string().describe("Test purpose id, default prefix TP-"),
        statement: z.string().describe("The test purpose statement"),
        testRequirementIds: z.array(z.string()).optional(),
        strategyIds: z.array(z.string()).optional(),
        successCriterion: z.string().optional().describe("Objective criterion to judge achievement"),
        priorityRank: z.number().int().min(1).optional().describe("1 is highest priority"),
        priorityRationale: z.string().optional(),
        relatedQualityCharacteristicIds: z
          .array(z.string())
          .optional()
          .describe("QC-xx / QC-xx-xx ids from quality://characteristics/product"),
      })
    )
    .describe("Test purposes (stage 4)"),
  testConditions: z
    .array(
      z.object({
        id: z.string(),
        statement: z.string().optional(),
        purposeIds: z.array(z.string()).optional(),
        perspectiveCategoryId: z.string().optional(),
        qualityCharacteristicIds: z.array(z.string()).optional(),
      })
    )
    .optional()
    .describe("Test conditions to cross-check against purposes (typically from extract_test_conditions)"),
  testTypeSelections: z
    .array(
      z.object({
        name: z.string().describe("Test type name matching testTypeCatalog"),
        selected: z.boolean(),
        purposeIds: z.array(z.string()).optional(),
        reason: z.string().optional(),
      })
    )
    .optional()
    .describe("Test type selection/exclusion decisions with the backing purpose ids and reason"),
  claimedPurposeCoveragePercent: z.number().optional(),
  claimedTestTypeJustificationPercent: z.number().optional(),
  idPrefixes: z
    .object({
      expectation: z.string().optional(),
      testRequirement: z.string().optional(),
      strategy: z.string().optional(),
      purpose: z.string().optional(),
    })
    .optional(),
} as const;

export function registerDeriveTestPurposesTool(server: McpServer): void {
  server.registerTool(
    "derive_test_purposes",
    {
      title: "Derive Test Purposes",
      description:
        "テスト目的を「依頼者の期待 → テスト要求（マネジメント的／エンジニアリング的の2系統） → " +
        "テスト戦略 → テスト目的 → 優先順位」という導出チェーンで整理させ、目的ID（既定 TP-）が下流の " +
        "テスト条件（extract_test_conditions）・テストタイプ選択（create_test_plan の5.2）へ貫通しているかを " +
        "双方向に検査する。どのテスト目的にも紐づかないテスト条件と、どのテスト条件からも参照されないテスト " +
        "目的の両方を検出し、依頼書本文との裏付け照合（PDC-15）・宣言被覆率と実測値の突き合わせ（PDC-16）も " +
        "行う。既存のテスト目的一覧を purposes に渡せば、既存成果物のレビューとしても同じ決定的検査を実行できる。",
      inputSchema: deriveTestPurposesInputShape,
    },
    async (input) => {
      const markdown = renderTestPurposeDerivation(input as DeriveTestPurposesInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
