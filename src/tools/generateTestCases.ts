import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testTechniqueCatalog } from "../resources/testTechniqueCatalog.js";
import {
  DEFAULT_TEST_CASE_ID_PREFIX,
  buildConditionTraceability,
  buildCoverageUniverse,
  computeCoverageRows,
  findDuplicateCaseIds,
  findEmptyExpectedResults,
  findHardcodedParameterValues,
  findInvalidTransitions,
  findMissingCaseNumbers,
  findPrefixMismatchCaseIds,
  findStepGranularityIssues,
  findSubjectiveExpectedResults,
  findUncoveredConditionIds,
  findUnknownCoverageTargetRefs,
  findUnresolvedCaseRefs,
  recommendTechniques,
  resolveCaseSourceRefs,
} from "../testCaseAnalysis.js";
import {
  buildTestLevelDistribution,
  buildTestSizeDistribution,
  classifyTestSizes,
  findTestLevelAllocationFindings,
  testLevelLabel,
} from "../testSizeAnalysis.js";
import { testSizeClassificationCriteria } from "../resources/testSizeClassificationCriteria.js";
import { resolveSourceRefs } from "../testConditionAnalysis.js";
import { formatSourceCitation } from "../testBasisAnalysis.js";
import { derivedFromSchema, formatDerivedFromEntry, formatDerivedFromList } from "../derivedFromRefs.js";
import type { GenerateTestCasesInput, TestCaseSpec, TestTechniqueCatalog } from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

const DEFAULT_COVERAGE_CRITERIA = [
  "対象テスト条件すべてに1件以上のケースがある。",
  "2節の網羅対象すべてがいずれかのケースで充足されている。",
  "期待結果に主観語を含まない。",
  "閾値は1.4のパラメータ名で参照されている。",
];

const DECIDING_FACTOR_LABELS: Record<string, string> = {
  dependency: "外部依存",
  duration: "実行時間",
  both: "外部依存/実行時間",
  none: "-",
};

const SIZE_VERDICT_LABELS: Record<string, string> = {
  within: "範囲内",
  below: "下回る",
  above: "上回る",
};

function sizeNameJa(sizeId: string): string {
  return testSizeClassificationCriteria.sizes.find((s) => s.sizeId === sizeId)?.nameJa ?? sizeId;
}

function stateVariableRows(vars: { name: string; value: string }[]): string[] {
  if (vars.length === 0) return ["| - | - |"];
  return vars.map((v) => `| ${escapeCell(v.name)} | ${escapeCell(v.value)} |`);
}

export function renderTestCases(
  input: GenerateTestCasesInput,
  catalog: TestTechniqueCatalog = testTechniqueCatalog
): string {
  const {
    testConditions,
    requirementIds,
    parameters = [],
    coverageCriteriaDeclaration,
    additionalSubjectiveTerms,
  } = input;
  const testCases: TestCaseSpec[] = input.testCases ?? [];
  const idPrefix = input.idPrefix ?? DEFAULT_TEST_CASE_ID_PREFIX;

  const universe = buildCoverageUniverse(input);
  const coverageRows = computeCoverageRows(universe, testCases, catalog);
  const unknownTargetRefs = findUnknownCoverageTargetRefs(universe, testCases);
  const traceRows = buildConditionTraceability(testConditions, testCases);
  const uncoveredConditionIds = findUncoveredConditionIds(testConditions, testCases);
  const duplicates = findDuplicateCaseIds(testCases);
  const missingNumbers = findMissingCaseNumbers(testCases, idPrefix);
  const prefixMismatch = findPrefixMismatchCaseIds(testCases, idPrefix);
  const unresolvedRefs = findUnresolvedCaseRefs(input);
  const subjectiveFindings = findSubjectiveExpectedResults(testCases, additionalSubjectiveTerms);
  const emptyFindings = findEmptyExpectedResults(testCases);
  const stepFindings = findStepGranularityIssues(testCases);
  const hardcodedFindings = findHardcodedParameterValues(testCases, parameters);
  const invalidTransitions = input.stateTransition ? findInvalidTransitions(input.stateTransition) : [];
  const sizeRows = classifyTestSizes(testCases);
  const sizeDistribution = buildTestSizeDistribution(sizeRows);
  const levelDistribution = buildTestLevelDistribution(testCases);
  const allocationFindings = findTestLevelAllocationFindings(testCases, sizeRows);
  const hasAllocationInput = testCases.some(
    (c) =>
      c.testLevel !== undefined ||
      c.externalDependencyIds !== undefined ||
      c.estimatedDurationSeconds !== undefined
  );
  const levelSizeMismatches = allocationFindings.filter((f) => f.kind === "level-size-mismatch");
  const crossLevelDuplicates = allocationFindings.filter((f) => f.kind === "cross-level-duplicate");

  const lines: string[] = [];
  lines.push("# テストケース生成結果");
  lines.push("");

  // --- 1. 前提と宣言 ---
  lines.push("## 1. 前提と宣言");
  lines.push("");

  lines.push("### 1.1 対象テスト条件");
  lines.push("");
  lines.push("| 条件ID | 対象 | 条件文 | 優先度 | 由来 | 根拠位置 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const c of testConditions) {
    const sourceRefs = resolveSourceRefs(c, input.requirementSources ?? []);
    const sourceCitation =
      sourceRefs.length > 0 ? sourceRefs.map((r) => formatSourceCitation(r)).join("; ") : "未特定";
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.target)} | ${escapeCell(c.statement)} | ${
        c.priority ?? "未設定"
      } | ${escapeCell(formatDerivedFromList(c.derivedFrom))} | ${escapeCell(sourceCitation)} |`
    );
  }
  lines.push("");

  lines.push("### 1.2 適用技法と選定根拠");
  lines.push("");
  lines.push("| 条件ID | 推奨技法 | 引き当てた決定表行 | 対応ツール |");
  lines.push("| --- | --- | --- | --- |");
  const noTechniqueConditions: string[] = [];
  for (const c of testConditions) {
    const { techniqueIds, matchedRowIds } = recommendTechniques(c, catalog);
    if (techniqueIds.length === 0) {
      noTechniqueConditions.push(c.id);
      lines.push(`| ${escapeCell(c.id)} | - | - | - |`);
      continue;
    }
    const tools = techniqueIds
      .map((t) => catalog.entries.find((e) => e.techniqueId === t)?.engineToolName ?? "generate_test_cases")
      .join(", ");
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(techniqueIds.join(", "))} | ${escapeCell(
        matchedRowIds.join(", ")
      )} | ${escapeCell(tools)} |`
    );
  }
  lines.push("");
  for (const id of noTechniqueConditions) {
    lines.push(
      `- [medium] ${id}: テストベースの特徴が未記入のため技法を決定的に推奨できない。basisCharacteristics を指定するか5節の決定表から選定根拠を明記すること`
    );
  }
  if (noTechniqueConditions.length > 0) lines.push("");

  lines.push("### 1.3 採用した網羅基準");
  lines.push("");
  const criteria =
    coverageCriteriaDeclaration && coverageCriteriaDeclaration.length > 0
      ? coverageCriteriaDeclaration
      : DEFAULT_COVERAGE_CRITERIA;
  if (!coverageCriteriaDeclaration || coverageCriteriaDeclaration.length === 0) {
    lines.push("網羅基準の指定がないため、以下の既定基準を採用する。");
    lines.push("");
  }
  for (const c of criteria) lines.push(`- ${c}`);
  lines.push("");

  lines.push("### 1.4 閾値パラメータ表");
  lines.push("");
  if (parameters.length === 0) {
    lines.push(
      "閾値パラメータが未指定である。ケース本文へ直値を埋め込まず、閾値はここに名前付きで登録すること。"
    );
  } else {
    lines.push("| パラメータ名 | 値 | 単位 | 出典 |");
    lines.push("| --- | --- | --- | --- |");
    for (const p of parameters) {
      lines.push(
        `| ${escapeCell(p.name)} | ${escapeCell(p.value)} | ${escapeCell(p.unit ?? "-")} | ${escapeCell(
          p.source ?? "-"
        )} |`
      );
    }
  }
  lines.push("");

  // --- 2. 網羅対象一覧(決定的層) ---
  lines.push("## 2. 網羅対象一覧(決定的層)");
  lines.push("");
  if (universe.length === 0) {
    lines.push(
      "決定的エンジンへ渡す入力(boundaryVariables / equivalenceVariables / stateTransition / additionalCoverageTargets)が指定されていない。"
    );
  } else {
    lines.push("| 網羅対象ID | 技法 | 内容 | 由来 |");
    lines.push("| --- | --- | --- | --- |");
    for (const t of universe) {
      lines.push(
        `| ${escapeCell(t.id)} | ${t.techniqueId} | ${escapeCell(t.description)} | ${escapeCell(t.origin)} |`
      );
    }
  }
  lines.push("");

  // --- 3. テストケース仕様 ---
  lines.push("## 3. テストケース仕様");
  lines.push("");

  lines.push("### 3.1 ケース一覧");
  lines.push("");
  lines.push("| ケースID | タイトル | 由来条件ID | 技法 | 優先度 | テストタイプ | 網羅対象 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const c of testCases) {
    lines.push(
      `| ${escapeCell(c.caseId)} | ${escapeCell(c.title)} | ${escapeCell(c.testConditionId)} | ${
        c.techniqueId
      } | ${c.priority ?? "未設定"} | ${escapeCell(c.testType ?? "-")} | ${escapeCell(
        c.coverageTargets.join(", ")
      )} |`
    );
  }
  lines.push("");

  lines.push("### 3.2 ケース詳細");
  lines.push("");
  if (testCases.length === 0) {
    lines.push("- ケースが未指定である。");
  } else {
    for (const c of testCases) {
      lines.push(`#### ${c.caseId} ${c.title}`);
      lines.push("");
      const caseSourceRefs = resolveCaseSourceRefs(c, testConditions, input.requirementSources ?? []);
      const caseSourceCitation =
        caseSourceRefs.length > 0
          ? caseSourceRefs.map((r) => formatSourceCitation(r)).join("; ")
          : "未特定(要記入)";
      lines.push(`根拠: ${caseSourceCitation}`);
      lines.push("");
      lines.push("前提条件:");
      lines.push("");
      lines.push("| 変数 | 値 |");
      lines.push("| --- | --- |");
      for (const row of stateVariableRows(c.preconditions)) lines.push(row);
      lines.push("");
      lines.push("手順:");
      lines.push("");
      lines.push("| # | 操作 | 期待結果 |");
      lines.push("| --- | --- | --- |");
      for (const s of c.steps) {
        lines.push(`| ${s.no} | ${escapeCell(s.action)} | ${escapeCell(s.expected)} |`);
      }
      lines.push("");
      lines.push("事後条件:");
      lines.push("");
      lines.push("| 変数 | 値 |");
      lines.push("| --- | --- |");
      for (const row of stateVariableRows(c.postconditions ?? [])) lines.push(row);
      lines.push("");
      lines.push("結果記録欄:");
      lines.push("");
      lines.push("| 実施日 | 実施者 | 判定 | 不具合No. |");
      lines.push("| --- | --- | --- | --- |");
      lines.push(
        `| ${c.result?.executedDate ?? "-"} | ${escapeCell(c.result?.executedBy ?? "-")} | ${
          c.result?.verdict ?? "-"
        } | ${escapeCell(c.result?.defectNo ?? "-")} |`
      );
      lines.push("");
    }
  }

  // --- 4. 決定的検査(自動) ---
  lines.push("## 4. 決定的検査(自動)");
  lines.push("");

  lines.push("### 4.1 網羅率");
  lines.push("");
  if (coverageRows.length === 0) {
    lines.push("- 対象なし");
  } else {
    lines.push("| 技法 | 網羅基準 | 総数 | 充足 | 未充足 | 充足率 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const row of coverageRows) {
      lines.push(
        `| ${row.techniqueId} | ${escapeCell(row.criterionLabel)} | ${row.total} | ${row.covered} | ${
          row.uncovered
        } | ${row.ratioPercent.toFixed(1)}% |`
      );
    }
  }
  lines.push("");

  lines.push("### 4.2 未充足の網羅対象");
  lines.push("");
  const anyUncovered = coverageRows.some((r) => r.uncoveredTargetIds.length > 0);
  if (!anyUncovered) {
    lines.push("- 未充足なし");
  } else {
    for (const row of coverageRows) {
      for (const id of row.uncoveredTargetIds) {
        lines.push(`- [high] ${id}: 充足するケースが無い。テストケースを追加すること。`);
      }
    }
  }
  if (unknownTargetRefs.length > 0) {
    lines.push("");
    lines.push("未知の網羅対象IDを参照しているケース:");
    lines.push("");
    for (const u of unknownTargetRefs) {
      lines.push(`- [medium] ${u.caseId}: 「${escapeCell(u.targetId)}」は2節の網羅対象一覧に存在しない。`);
    }
  }
  lines.push("");

  lines.push("### 4.3 テスト条件 × テストケース トレーサビリティ");
  lines.push("");
  lines.push("| 条件ID | 紐づくケースID | 件数 | 根拠位置 |");
  lines.push("| --- | --- | --- | --- |");
  for (const row of traceRows) {
    const condition = testConditions.find((c) => c.id === row.conditionId);
    const sourceRefs = condition ? resolveSourceRefs(condition, input.requirementSources ?? []) : [];
    const sourceCitation =
      sourceRefs.length > 0 ? sourceRefs.map((r) => formatSourceCitation(r)).join("; ") : "未特定";
    lines.push(
      `| ${escapeCell(row.conditionId)} | ${escapeCell(
        row.caseIds.length > 0 ? row.caseIds.join(", ") : "-"
      )} | ${row.caseIds.length} | ${escapeCell(sourceCitation)} |`
    );
  }
  lines.push("");
  if (uncoveredConditionIds.length === 0) {
    lines.push("- 未充足なし");
  } else {
    for (const id of uncoveredConditionIds) {
      lines.push(`- [high] ${id}: 紐づくテストケースが0件。テストケースを追加すること。`);
    }
  }
  lines.push("");

  lines.push("### 4.4 ケースIDの重複・欠番・プレフィックス不一致");
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

  lines.push("### 4.5 由来メタデータの未解決参照");
  lines.push("");
  if (unresolvedRefs.length === 0 && invalidTransitions.length === 0) {
    lines.push("- なし");
  } else {
    if (unresolvedRefs.length > 0) {
      lines.push("| ケースID | 参照 | 照合対象 |");
      lines.push("| --- | --- | --- |");
      for (const ref of unresolvedRefs) {
        const refDisplay = ref.kind ? formatDerivedFromEntry({ kind: ref.kind, id: ref.ref }) : ref.ref;
        lines.push(
          `| ${escapeCell(ref.caseId)} | ${escapeCell(refDisplay)} | ${escapeCell(ref.expectedKind)} |`
        );
      }
    }
    if (invalidTransitions.length > 0) {
      lines.push("");
      lines.push(
        `- [high] 状態遷移の未解決参照: ${invalidTransitions.join(", ")} が states[].id に存在しない遷移元/遷移先を参照している。`
      );
    }
  }
  lines.push("");

  lines.push("### 4.6 期待結果の主観語・空欄検査");
  lines.push("");
  if (subjectiveFindings.length === 0 && emptyFindings.length === 0) {
    lines.push("- なし");
  } else {
    for (const f of emptyFindings) {
      lines.push(`- [${f.severity}] ${f.caseId} 手順${f.stepNo}: ${f.detail}`);
    }
    for (const f of subjectiveFindings) {
      lines.push(`- [${f.severity}] ${f.caseId} 手順${f.stepNo}: ${f.detail}`);
    }
  }
  lines.push("");

  lines.push("### 4.7 手順の粒度検査");
  lines.push("");
  if (stepFindings.length === 0) {
    lines.push("- なし");
  } else {
    for (const f of stepFindings) {
      const severity = f.kind === "empty-action" ? "high" : "medium";
      lines.push(`- [${severity}] ${f.caseId} 手順${f.stepNo}(${f.kind}): ${f.detail}`);
    }
  }
  lines.push("");

  lines.push("### 4.8 閾値の直値埋め込み検査");
  lines.push("");
  if (hardcodedFindings.length === 0) {
    lines.push("- なし");
  } else {
    for (const f of hardcodedFindings) {
      lines.push(
        `- [medium] ${f.caseId}: パラメータ「${escapeCell(f.parameterName)}」の値「${escapeCell(
          f.value
        )}」が参照名なしで直接埋め込まれている(${f.places.join(", ")})。1.4 のパラメータ名で参照すること。`
      );
    }
  }
  lines.push("");

  lines.push("### 4.9 テストレベル配分の妥当性");
  lines.push("");
  if (!hasAllocationInput) {
    lines.push(
      "- 判定入力(testLevel / externalDependencyIds / estimatedDurationSeconds)が未指定のため判定不可"
    );
  } else {
    lines.push(
      "| ケースID | 宣言レベル | 該当判定軸 | 想定実行時間(秒) | 判定サイズ | 決定要因 | 宣言サイズ | 判定 |"
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of sizeRows) {
      const declaredJudgement =
        row.declaredSize === undefined
          ? "-"
          : !row.classifiable
            ? "-"
            : row.declaredSize === row.classifiedSize
              ? "一致"
              : "不一致";
      lines.push(
        `| ${escapeCell(row.caseId)} | ${
          row.testLevel === undefined ? "-" : escapeCell(testLevelLabel(row.testLevel))
        } | ${
          row.matchedDimensionIds.length > 0 ? escapeCell(row.matchedDimensionIds.join(", ")) : "-"
        } | ${row.durationSeconds === undefined ? "-" : row.durationSeconds} | ${
          row.classifiable ? escapeCell(sizeNameJa(row.classifiedSize)) : "判定不可"
        } | ${DECIDING_FACTOR_LABELS[row.decidingFactor]} | ${
          row.declaredSize === undefined ? "-" : escapeCell(sizeNameJa(row.declaredSize))
        } | ${declaredJudgement} |`
      );
    }
    lines.push("");
    lines.push("| サイズ | 件数 | 構成比 | 推奨範囲 | 判定 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of sizeDistribution) {
      lines.push(
        `| ${escapeCell(sizeNameJa(row.sizeId))} | ${row.count} | ${row.sharePercent.toFixed(1)}% | ${
          row.recommendedSharePercent.min
        }〜${row.recommendedSharePercent.max}% | ${SIZE_VERDICT_LABELS[row.verdict]} |`
      );
    }
    lines.push("");
    lines.push("| テストレベル | 件数 | 構成比 |");
    lines.push("| --- | --- | --- |");
    for (const row of levelDistribution) {
      lines.push(
        `| ${escapeCell(testLevelLabel(row.testLevel))} | ${row.count} | ${row.sharePercent.toFixed(1)}% |`
      );
    }
    lines.push("");
    if (allocationFindings.length === 0) {
      lines.push("- 指摘なし");
    } else {
      for (const f of allocationFindings) {
        lines.push(`- [${f.severity}] ${escapeCell(f.caseId)}: ${f.detail}`);
      }
    }
  }
  lines.push("");

  lines.push("### 4.10 サマリ");
  lines.push("");
  lines.push(
    `- 対象テスト条件数: ${testConditions.length} / テストケース数: ${testCases.length} / 網羅対象数: ${universe.length} / 未充足網羅対象数: ${coverageRows.reduce(
      (sum, r) => sum + r.uncoveredTargetIds.length,
      0
    )} / 未充足条件数: ${uncoveredConditionIds.length} / 重複ID数: ${duplicates.length} / 欠番数: ${missingNumbers.length} / 未解決参照数: ${unresolvedRefs.length} / 主観語指摘数: ${subjectiveFindings.length} / 空欄指摘数: ${emptyFindings.length} / 手順粒度指摘数: ${stepFindings.length} / 直値埋め込み指摘数: ${hardcodedFindings.length} / テストレベル配分指摘数: ${allocationFindings.length}`
  );
  lines.push("");

  // --- 5. 技法選定決定表(カタログ) ---
  lines.push("## 5. 技法選定決定表(カタログ)");
  lines.push("");
  lines.push("| ID | テストベースの特徴 | 推奨技法 | 網羅基準 | 決定的カウント可否 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of catalog.selectionTable) {
    const criteriaLabels = row.coverageCriterionIds
      .map((id) => {
        for (const entry of catalog.entries) {
          const found = entry.coverageCriteria.find((c) => c.id === id);
          if (found) return found.nameJa;
        }
        return id;
      })
      .join(", ");
    const deterministic = row.recommendedTechniqueIds.every(
      (t) => catalog.entries.find((e) => e.techniqueId === t)?.deterministic
    )
      ? "可"
      : "不可(手動宣言)";
    lines.push(
      `| ${row.id} | ${escapeCell(row.basisCharacteristic)} | ${escapeCell(
        row.recommendedTechniqueIds.join(", ")
      )} | ${escapeCell(criteriaLabels)} | ${deterministic} |`
    );
  }
  lines.push("");

  // --- 6. テストケース組み立て指示(意味的層) ---
  lines.push("## 6. テストケース組み立て指示(意味的層)");
  lines.push("");
  if (testCases.length === 0) {
    lines.push(
      "2節の網羅対象を充足するテストケースを、3.2 と同じ構造（前提条件は状態変数の配列、手順は1手順1操作、期待結果は手順ごとに観測可能な文言、由来と網羅対象IDは必須）で作成し、再度本ツールへ渡して決定的検査を通すこと。"
    );
    lines.push("");
  }
  if (anyUncovered) {
    lines.push("以下の未充足の網羅対象を充足するテストケースを追加すること:");
    lines.push("");
    for (const row of coverageRows) {
      for (const id of row.uncoveredTargetIds) {
        lines.push(`- ${id}`);
      }
    }
    lines.push("");
  }
  if (subjectiveFindings.length > 0 || emptyFindings.length > 0) {
    lines.push("以下の期待結果を観測可能な具体的文言へ修正すること:");
    lines.push("");
    for (const f of [...emptyFindings, ...subjectiveFindings]) {
      lines.push(`- ${f.caseId} 手順${f.stepNo}: ${f.detail}`);
    }
    lines.push("");
  }
  if (hardcodedFindings.length > 0) {
    lines.push("以下の直値埋め込みを1.4のパラメータ名参照へ修正すること:");
    lines.push("");
    for (const f of hardcodedFindings) {
      lines.push(`- ${f.caseId}: 「${escapeCell(f.value)}」(${f.places.join(", ")}) → ${escapeCell(f.parameterName)}`);
    }
    lines.push("");
  }
  if (levelSizeMismatches.length > 0 || crossLevelDuplicates.length > 0) {
    lines.push("以下のテストレベル配分を見直すこと:");
    lines.push("");
    for (const f of [...levelSizeMismatches, ...crossLevelDuplicates]) {
      lines.push(`- ${f.caseId}: ${f.detail}`);
    }
    lines.push("");
  }
  if (noTechniqueConditions.length === 0 && !anyUncovered && subjectiveFindings.length === 0 && emptyFindings.length === 0 && hardcodedFindings.length === 0 && levelSizeMismatches.length === 0 && crossLevelDuplicates.length === 0 && testCases.length > 0) {
    lines.push("- 追加の修正指示なし。");
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

const stateVariableShape = z.object({
  name: z.string().describe("State variable name"),
  value: z.string().describe("State variable value"),
});

const testCaseStepShape = z.object({
  no: z.number().int().describe("1-based sequential step number"),
  action: z.string().describe("A single operation for this step"),
  expected: z.string().describe("Observable expected result for this step"),
});

const testCaseResultShape = z.object({
  executedDate: z.string().optional().describe("Execution date"),
  executedBy: z.string().optional().describe("Executor name"),
  verdict: z.enum(["合格", "不合格", "未実施", "対象外"]).optional().describe("Execution verdict"),
  defectNo: z.string().optional().describe("Linked defect number"),
});

export const testCaseSpecShape = z.object({
  caseId: z.string().describe("Test case id, e.g. TCS-001"),
  title: z.string().describe("Test case title"),
  testConditionId: z.string().describe("Origin test condition id (required)"),
  derivedFrom: derivedFromSchema.describe(
    "Requirement/feature/screen/scenario/risk ids this case was derived from (required). Plain id string, or {kind, id} to disambiguate across requirement/risk/stakeholder/guideword namespaces"
  ),
  techniqueId: z.string().describe("Applied technique id (required)"),
  coverageTargets: z
    .array(z.string())
    .min(1)
    .describe("Coverage target ids from section 2 that this case satisfies (required)"),
  perspectiveCategoryId: z.string().optional(),
  testType: z.string().optional().describe("Test type label"),
  priority: z.enum(["高", "中", "低"]).optional(),
  preconditions: z.array(stateVariableShape).min(1).describe("Precondition state variables (required)"),
  steps: z.array(testCaseStepShape).min(1).describe("Ordered steps, one operation per step (required)"),
  postconditions: z.array(stateVariableShape).optional(),
  result: testCaseResultShape.optional(),
  note: z.string().optional(),
  sourceRefs: z
    .array(
      z.object({
        document: z.string().describe("Test basis document name"),
        startLine: z.number().int().min(1).describe("1-based start line in the document"),
        endLine: z.number().int().min(1).optional().describe("1-based end line in the document"),
        heading: z.string().optional().describe("Nearest heading in the document"),
        label: z.string().optional().describe("Display label, e.g. 'EH-100 Ticket gate startup'"),
      })
    )
    .optional()
    .describe("Explicit source locations in the test basis; takes precedence over other resolution"),
  testLevel: z
    .enum(["component-testing", "integration-testing", "system-testing", "acceptance-testing"])
    .optional()
    .describe("Declared test level for this case; used to check test level allocation against the test size"),
  externalDependencyIds: z
    .array(z.string())
    .optional()
    .describe(
      "External dependency axis ids (TSD-01..TSD-08 from testdesign://testsize/classification-criteria); pass an empty array to declare no external dependency"
    ),
  estimatedDurationSeconds: z
    .number()
    .nonnegative()
    .optional()
    .describe("Estimated execution time in seconds at design time, used for test size classification"),
  declaredTestSize: z
    .enum(["small", "medium", "large"])
    .optional()
    .describe("Test size declared by the caller; compared against the classified size"),
});

export const generateTestCasesInputShape = {
  testConditions: z
    .array(
      z.object({
        id: z.string().describe("Test condition id, e.g. TC-001"),
        target: z.string().describe("Target of the condition"),
        statement: z.string().describe("The test condition statement"),
        derivedFrom: derivedFromSchema.describe(
          "Requirement/risk/persona ids (required). Plain id string, or {kind, id} to disambiguate across requirement/risk/stakeholder/guideword namespaces"
        ),
        priority: z.enum(["高", "中", "低"]).optional(),
        perspectiveCategoryId: z.string().optional(),
        recommendedTechniques: z.array(z.string()).optional(),
        basisCharacteristics: z
          .array(z.string())
          .optional()
          .describe("Test basis characteristics used to recommend techniques from the selection table"),
        sourceRefs: z
          .array(
            z.object({
              document: z.string().describe("Test basis document name"),
              startLine: z.number().int().min(1).describe("1-based start line in the document"),
              endLine: z.number().int().min(1).optional().describe("1-based end line in the document"),
              heading: z.string().optional().describe("Nearest heading in the document"),
              label: z.string().optional().describe("Display label, e.g. 'EH-100 Ticket gate startup'"),
            })
          )
          .optional()
          .describe("Explicit source locations in the test basis; takes precedence over requirementSources lookup"),
      })
    )
    .min(1)
    .describe("Test conditions to turn into test cases"),
  requirementIds: z.array(z.string()).optional().describe("Requirement ids used to validate derivedFrom"),
  riskIds: z
    .array(z.string())
    .optional()
    .describe("Risk ids used to validate derivedFrom entries with kind:\"risk\""),
  personaIds: z
    .array(z.string())
    .optional()
    .describe("Persona ids used to validate derivedFrom entries with kind:\"stakeholder\""),
  parameters: z
    .array(
      z.object({
        name: z.string().describe("Parameter name referenced from case bodies"),
        value: z.string().describe("Literal value"),
        unit: z.string().optional(),
        source: z.string().optional().describe("Origin (requirement id / spec location)"),
        note: z.string().optional(),
      })
    )
    .optional()
    .describe("Named threshold parameters; case bodies should reference these by name, not literal values"),
  boundaryVariables: z
    .array(
      z.object({
        name: z.string(),
        min: z.number(),
        max: z.number(),
        valueType: z.enum(["int", "decimal"]).optional(),
        step: z.number().positive().optional(),
      })
    )
    .optional()
    .describe("Boundary value variables, same shape as design_boundary_values"),
  boundaryMode: z.enum(["two", "three"]).optional(),
  equivalenceVariables: z
    .array(
      z.object({
        name: z.string(),
        validClasses: z
          .array(
            z.object({
              label: z.string(),
              representative: z.string(),
              description: z.string().optional(),
            })
          )
          .min(1),
        invalidClasses: z
          .array(
            z.object({
              label: z.string(),
              representative: z.string(),
              description: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .optional()
    .describe("Equivalence partitioning variables, same shape as design_equivalence_partitioning"),
  stateTransition: z
    .object({
      states: z.array(z.object({ id: z.string(), nameJa: z.string(), initial: z.boolean().optional() })),
      transitions: z.array(
        z.object({
          id: z.string(),
          from: z.string(),
          to: z.string(),
          event: z.string(),
          guard: z.string().optional(),
        })
      ),
    })
    .optional()
    .describe("Minimal state transition spec used to count 0/1 switch coverage"),
  additionalCoverageTargets: z
    .array(
      z.object({
        id: z.string(),
        techniqueId: z.string(),
        description: z.string(),
        origin: z.string(),
      })
    )
    .optional()
    .describe("Manually declared coverage targets for techniques without a deterministic engine"),
  testCases: z
    .array(testCaseSpecShape)
    .optional()
    .describe("Test case specs; omitted or empty triggers generation-instruction-only mode"),
  coverageCriteriaDeclaration: z.array(z.string()).optional(),
  additionalSubjectiveTerms: z.array(z.string()).optional(),
  idPrefix: z.string().optional().describe("Test case id prefix used for gap detection (default TCS-)"),
  requirementSources: z
    .array(
      z.object({
        requirementId: z.string().describe("Requirement id this source location belongs to"),
        document: z.string().describe("Test basis document name"),
        startLine: z.number().int().min(1).describe("1-based start line in the document"),
        endLine: z.number().int().min(1).optional().describe("1-based end line in the document"),
        heading: z.string().optional().describe("Nearest heading in the document"),
        label: z.string().optional().describe("Display label, e.g. 'EH-100 Ticket gate startup'"),
      })
    )
    .optional()
    .describe(
      "Requirement id -> test basis source location map, typically taken from analyze_requirements section 2.6"
    ),
} as const;

export function registerGenerateTestCasesTool(server: McpServer): void {
  server.registerTool(
    "generate_test_cases",
    {
      title: "Generate Test Cases",
      description:
        "テストケース仕様を、決定的層(網羅率カウント・未通過網羅対象の列挙・期待結果の主観語/空欄検査・閾値の直値埋め込み検査・" +
        "テストサイズ(外部依存・実行時間)に基づくテストレベル配分の妥当性検査)と、" +
        "手順列の組み立てのみを呼び出し側LLMへ委ねる意味的層の二層構成で扱う。testCases が未指定・空の場合は決定的エンジンへの入力から" +
        "網羅対象一覧のみを算出し、生成指示を返す。既存のテストケース一式を testCases に渡せば、既存成果物のレビュー（網羅率・未通過網羅対象・" +
        "主観語/空欄・直値埋め込みの検査）としても機能する。",
      inputSchema: generateTestCasesInputShape,
    },
    async (input) => {
      const markdown = renderTestCases(input as GenerateTestCasesInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
