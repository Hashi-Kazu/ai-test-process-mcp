import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { exploratoryCharterCatalog } from "../resources/exploratoryCharterCatalog.js";
import {
  DEFAULT_EXPLORATORY_CHARTER_ID_PREFIX,
  computeTimeboxSummary,
  findChartersWithoutTimebox,
  findDuplicateCharterIds,
  findMissingCharterNumbers,
  findPrefixMismatchCharterIds,
  findSubjectiveMissionStatements,
  findUncoveredHighPriorityConditionIds,
  findUncoveredRiskIds,
  findUnknownCharterAreaIds,
  findUnresolvedCharterRefs,
  findUnusedCharterAreas,
} from "../exploratoryCharterAnalysis.js";
import type {
  ExploratoryCharterCatalog,
  ExploratoryCharterInput,
  GenerateExploratoryChartersInput,
} from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function formatDefectRecords(
  defectRecords: { no?: string; summary?: string; severity?: string }[] | undefined
): string {
  if (!defectRecords || defectRecords.length === 0) return "-";
  return defectRecords
    .map((d) => `${d.no ?? "-"}:${d.summary ?? "-"}(${d.severity ?? "-"})`)
    .join("; ");
}

function formatAssigneeTimebox(charter: ExploratoryCharterInput): string {
  const assignee = charter.assignee ?? "-";
  const skill = charter.skillLevel ?? "-";
  const timebox =
    typeof charter.timeboxMinutes === "number" ? `${charter.timeboxMinutes}分` : "未設定";
  return `${assignee}/${skill} (${timebox})`;
}

export function renderExploratoryCharters(
  input: GenerateExploratoryChartersInput,
  catalog: ExploratoryCharterCatalog = exploratoryCharterCatalog
): string {
  const {
    testConditions,
    risks = [],
    areaIds,
    sessionBudgetMinutes,
    recordingMethod,
    stopConditionDeclaration,
    additionalSubjectiveTerms,
  } = input;
  const charters: ExploratoryCharterInput[] = input.charters ?? [];
  const idPrefix = input.idPrefix ?? DEFAULT_EXPLORATORY_CHARTER_ID_PREFIX;

  const duplicates = findDuplicateCharterIds(charters);
  const missingNumbers = findMissingCharterNumbers(charters, idPrefix);
  const prefixMismatch = findPrefixMismatchCharterIds(charters, idPrefix);
  const unknownAreaRefs = findUnknownCharterAreaIds(charters, catalog);
  const unresolvedRefs = findUnresolvedCharterRefs(input);
  const unusedAreas = findUnusedCharterAreas(charters, catalog, areaIds);
  const uncoveredConditionIds = findUncoveredHighPriorityConditionIds(testConditions, charters);
  const uncoveredRiskIds = findUncoveredRiskIds(risks, charters);
  const timeboxMissing = findChartersWithoutTimebox(charters);
  const timeboxSummary = computeTimeboxSummary(charters, sessionBudgetMinutes);
  const subjectiveFindings = findSubjectiveMissionStatements(charters, additionalSubjectiveTerms);

  const targetAreas =
    areaIds && areaIds.length > 0
      ? catalog.charterAreas.filter((a) => areaIds.includes(a.id))
      : catalog.charterAreas;

  const lines: string[] = [];
  lines.push("# 探索的テストチャーター生成結果");
  lines.push("");

  // --- 1. 前提と宣言 ---
  lines.push("## 1. 前提と宣言");
  lines.push("");

  lines.push("### 1.1 対象テスト条件");
  lines.push("");
  lines.push("| 条件ID | 対象 | 条件文 | 優先度 | 由来 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const c of testConditions) {
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.target)} | ${escapeCell(c.statement)} | ${
        c.priority ?? "未設定"
      } | ${escapeCell(c.derivedFrom.join(", "))} |`
    );
  }
  lines.push("");

  lines.push("### 1.2 リスク一覧");
  lines.push("");
  if (risks.length === 0) {
    lines.push("- 指定なし");
  } else {
    lines.push("| リスクID | 内容 |");
    lines.push("| --- | --- |");
    for (const r of risks) {
      lines.push(`| ${escapeCell(r.id)} | ${escapeCell(r.description)} |`);
    }
  }
  lines.push("");

  lines.push("### 1.3 セッション時間予算・記録方法・停止条件");
  lines.push("");
  lines.push(
    `- セッション時間予算: ${
      typeof sessionBudgetMinutes === "number" ? `${sessionBudgetMinutes}分` : "未指定"
    }`
  );
  lines.push(`- 記録方法: ${recordingMethod ? escapeCell(recordingMethod) : "未指定"}`);
  if (stopConditionDeclaration && stopConditionDeclaration.length > 0) {
    lines.push("- 停止条件（宣言済み）:");
    for (const s of stopConditionDeclaration) lines.push(`  - ${s}`);
  } else {
    lines.push("- 停止条件（未宣言のため観点区分カタログの停止の目安を既定として採用）:");
    for (const area of targetAreas) {
      for (const s of area.stopHeuristics) lines.push(`  - [${area.id}] ${s}`);
    }
  }
  lines.push("");

  // --- 2. 観点区分カタログ(決定的層) ---
  lines.push("## 2. 観点区分カタログ(決定的層)");
  lines.push("");
  lines.push("| 区分ID | 名称 | 確認観点 | 操作観点 | 関連観点区分 | 推奨タイムボックス |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const area of targetAreas) {
    lines.push(
      `| ${escapeCell(area.id)} | ${escapeCell(area.nameJa)} | ${escapeCell(
        area.checkFocusExamples.join("; ")
      )} | ${escapeCell(area.operationFocusExamples.join("; "))} | ${escapeCell(
        area.relatedPerspectiveCategoryIds.join(", ")
      )} | ${area.recommendedTimeboxMinutes}分 |`
    );
  }
  lines.push("");

  // --- 3. チャーター表 ---
  lines.push("## 3. チャーター表");
  lines.push("");
  lines.push(
    "| チャーターID | 観点区分 | 確認観点 | 操作観点 | 実施内容(ミッション) | 実施者・タイムボックス | 障害記録 |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const c of charters) {
    lines.push(
      `| ${escapeCell(c.charterId)} | ${escapeCell(c.areaId)} | ${escapeCell(
        c.checkFocus.join("; ")
      )} | ${escapeCell(c.operationFocus.join("; "))} | ${escapeCell(c.mission)} | ${escapeCell(
        formatAssigneeTimebox(c)
      )} | ${escapeCell(formatDefectRecords(c.defectRecords))} |`
    );
  }
  lines.push("");

  // --- 4. 決定的検査(自動) ---
  lines.push("## 4. 決定的検査(自動)");
  lines.push("");

  lines.push("### 4.1 チャーターIDの重複・欠番・プレフィックス不一致");
  lines.push("");
  if (duplicates.length === 0) {
    lines.push("- 重複: なし");
  } else {
    for (const dup of duplicates) {
      lines.push(`- 重複: ${dup.id}(${dup.count}件)`);
    }
  }
  if (missingNumbers.length === 0) {
    lines.push("- 欠番: なし");
  } else {
    lines.push(`- 欠番: ${missingNumbers.join(", ")}`);
  }
  if (prefixMismatch.length === 0) {
    lines.push(`- プレフィックス不一致ID(${idPrefix}): なし`);
  } else {
    lines.push(`- プレフィックス不一致ID(${idPrefix}): ${prefixMismatch.join(", ")}`);
  }
  lines.push("");

  lines.push("### 4.2 未知の観点区分ID");
  lines.push("");
  if (unknownAreaRefs.length === 0) {
    lines.push("- なし");
  } else {
    for (const u of unknownAreaRefs) {
      lines.push(`- [high] ${u.charterId}: 「${escapeCell(u.areaId)}」は2節の観点区分カタログに存在しない。`);
    }
  }
  lines.push("");

  lines.push("### 4.3 由来メタデータの未解決参照");
  lines.push("");
  if (unresolvedRefs.length === 0) {
    lines.push("- なし");
  } else {
    for (const ref of unresolvedRefs) {
      lines.push(
        `- [high] ${ref.charterId}: 「${escapeCell(ref.ref)}」が ${ref.expectedKind} のいずれにも一致しない。`
      );
    }
  }
  lines.push("");

  lines.push("### 4.4 観点区分の未使用");
  lines.push("");
  if (unusedAreas.length === 0) {
    lines.push("- なし");
  } else {
    for (const a of unusedAreas) {
      lines.push(`- [medium] ${a.id}(${escapeCell(a.nameJa)}): この観点区分を使うチャーターが無い。`);
    }
  }
  lines.push("");

  lines.push("### 4.5 高優先度テスト条件・リスクの未カバー");
  lines.push("");
  if (uncoveredConditionIds.length === 0 && uncoveredRiskIds.length === 0) {
    lines.push("- なし");
  } else {
    for (const id of uncoveredConditionIds) {
      lines.push(`- [high] ${id}: 高優先度のテスト条件だが、どのチャーターの derivedFrom からも参照されていない。`);
    }
    for (const id of uncoveredRiskIds) {
      lines.push(`- [high] ${id}: リスクだが、どのチャーターの derivedFrom からも参照されていない。`);
    }
  }
  lines.push("");

  lines.push("### 4.6 タイムボックスと時間予算");
  lines.push("");
  if (timeboxMissing.length === 0) {
    lines.push("- タイムボックス未設定: なし");
  } else {
    for (const id of timeboxMissing) {
      lines.push(`- [medium] ${id}: タイムボックスが未設定である。`);
    }
  }
  lines.push(
    `- 合計時間: ${timeboxSummary.totalMinutes}分 / 予算: ${
      typeof timeboxSummary.budgetMinutes === "number" ? `${timeboxSummary.budgetMinutes}分` : "未指定"
    } / ${
      timeboxSummary.overBudget
        ? `[medium] 予算超過(${timeboxSummary.excessMinutes}分超過)`
        : "予算内"
    }`
  );
  lines.push("");

  lines.push("### 4.7 ミッション文の主観語検査");
  lines.push("");
  if (subjectiveFindings.length === 0) {
    lines.push("- なし");
  } else {
    for (const f of subjectiveFindings) {
      lines.push(`- [${f.severity}] ${f.charterId}: ${f.detail}`);
    }
  }
  lines.push("");

  lines.push("### 4.8 サマリ");
  lines.push("");
  lines.push(
    `- チャーター数: ${charters.length} / 対象区分数: ${targetAreas.length} / 未使用区分数: ${unusedAreas.length} / ` +
      `未カバー高優先度条件数: ${uncoveredConditionIds.length} / 未カバーリスク数: ${uncoveredRiskIds.length} / ` +
      `重複ID数: ${duplicates.length} / 欠番数: ${missingNumbers.length} / 未解決参照数: ${unresolvedRefs.length} / ` +
      `主観語指摘数: ${subjectiveFindings.length} / タイムボックス未設定数: ${timeboxMissing.length} / ` +
      `合計時間/予算: ${timeboxSummary.totalMinutes}分/${
        typeof timeboxSummary.budgetMinutes === "number" ? `${timeboxSummary.budgetMinutes}分` : "未指定"
      }`
  );
  lines.push("");

  // --- 5. チャーター設計指示(意味的層) ---
  lines.push("## 5. チャーター設計指示(意味的層)");
  lines.push("");
  if (charters.length === 0) {
    lines.push(
      "2節の観点区分と1節の高優先度テスト条件・リスクを踏まえ、3節と同じ列構成でチャーターを作成し、" +
        "再度本ツールへ渡して決定的検査を通すこと。"
    );
    lines.push("");
  } else {
    const instructions: string[] = [];
    if (duplicates.length > 0 || missingNumbers.length > 0 || prefixMismatch.length > 0) {
      instructions.push("4.1 のチャーターID重複・欠番・プレフィックス不一致を解消すること。");
    }
    if (unknownAreaRefs.length > 0) {
      instructions.push("4.2 の未知の観点区分IDを、カタログに実在する区分IDへ修正すること。");
    }
    if (unresolvedRefs.length > 0) {
      instructions.push("4.3 の未解決参照を、テスト条件IDまたはリスクIDへ修正すること。");
    }
    if (unusedAreas.length > 0) {
      instructions.push("4.4 の未使用の観点区分について、対象範囲として不要かを判断し、必要ならチャーターを追加すること。");
    }
    if (uncoveredConditionIds.length > 0 || uncoveredRiskIds.length > 0) {
      instructions.push("4.5 の未カバーの高優先度テスト条件・リスクを対象とするチャーターを追加すること。");
    }
    if (timeboxMissing.length > 0 || timeboxSummary.overBudget) {
      instructions.push("4.6 のタイムボックス未設定・予算超過を解消すること。");
    }
    if (subjectiveFindings.length > 0) {
      instructions.push("4.7 のミッション文の主観語を、観測可能な具体的な確認・操作内容へ修正すること。");
    }
    if (instructions.length === 0) {
      lines.push("- 追加の修正指示なし。");
    } else {
      for (const i of instructions) lines.push(`- ${i}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

const defectRecordShape = z.object({
  no: z.string().optional(),
  summary: z.string().optional(),
  severity: z.string().optional(),
});

const exploratoryCharterShape = z.object({
  charterId: z.string().describe("Charter id, e.g. EXC-001"),
  areaId: z.string().describe("Charter area id from the catalog, e.g. ECA-01"),
  mission: z.string().describe("Mission statement for the exploratory session"),
  checkFocus: z.array(z.string()).min(1).describe("Check focus points (what should hold true)"),
  operationFocus: z.array(z.string()).min(1).describe("Operation focus points (how to probe it)"),
  derivedFrom: z
    .array(z.string())
    .min(1)
    .describe("Test condition ids / risk ids this charter was derived from (required)"),
  timeboxMinutes: z.number().optional(),
  assignee: z.string().optional(),
  skillLevel: z.enum(["熟練", "中級", "初級"]).optional(),
  defectRecords: z.array(defectRecordShape).optional(),
  note: z.string().optional(),
});

export const generateExploratoryChartersInputShape = {
  testConditions: z
    .array(
      z.object({
        id: z.string().describe("Test condition id, e.g. TC-001"),
        target: z.string().describe("Target of the condition"),
        statement: z.string().describe("The test condition statement"),
        derivedFrom: z.array(z.string()).min(1).describe("Requirement/risk/persona ids (required)"),
        priority: z.enum(["高", "中", "低"]).optional(),
        perspectiveCategoryId: z.string().optional(),
      })
    )
    .min(1)
    .describe("Test conditions to consider when designing exploratory charters"),
  risks: z
    .array(
      z.object({
        id: z.string(),
        description: z.string(),
        impact: z.number().optional(),
        likelihood: z.number().optional(),
        riskCategoryId: z.string().optional(),
      })
    )
    .optional()
    .describe("Risks to consider when designing exploratory charters"),
  charters: z
    .array(exploratoryCharterShape)
    .optional()
    .describe("Charter table entries; omitted or empty triggers generation-instruction-only mode"),
  areaIds: z
    .array(z.string())
    .optional()
    .describe("Charter area ids (ECA-xx) to scope the catalog and unused-area check to"),
  sessionBudgetMinutes: z.number().int().positive().optional(),
  recordingMethod: z.string().optional().describe("Where and how granularly findings are recorded"),
  stopConditionDeclaration: z
    .array(z.string())
    .optional()
    .describe("Declared stop conditions; omitted uses the catalog's stopHeuristics as defaults"),
  additionalSubjectiveTerms: z.array(z.string()).optional(),
  idPrefix: z.string().optional().describe("Charter id prefix used for gap detection (default EXC-)"),
} as const;

export function registerGenerateExploratoryChartersTool(server: McpServer): void {
  server.registerTool(
    "generate_exploratory_charters",
    {
      title: "Generate Exploratory Charters",
      description:
        "探索的テスト（エラー推測・チェックリストベースドテストを含む経験ベース技法）のチャーター表を、決定的層" +
        "(チャーターIDの重複/欠番/プレフィックス不一致・未知の観点区分ID・由来メタデータの未解決参照・観点区分の未使用・" +
        "高優先度テスト条件/リスクの未カバー・タイムボックスと時間予算・ミッション文の主観語検査)と、ミッション文の言語化のみを" +
        "呼び出し側LLMへ委ねる意味的層の二層構成で扱う。charters が未指定・空の場合は観点区分カタログと対象テスト条件・リスクから" +
        "生成指示のみを返す。既存のチャーター表を charters に渡せば、既存成果物のレビュー（観点区分被覆・由来参照・タイムボックス・" +
        "主観語の検査）としても機能する。",
      inputSchema: generateExploratoryChartersInputShape,
    },
    async (input) => {
      const markdown = renderExploratoryCharters(input as GenerateExploratoryChartersInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
