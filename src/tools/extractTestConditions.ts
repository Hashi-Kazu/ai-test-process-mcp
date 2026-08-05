import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  testPerspectiveCatalog,
  testTechniqueToolMapping,
} from "../resources/testPerspectiveCatalog.js";
import { guidewordDictionary } from "../resources/guidewordDictionary.js";
import { riskAnalysisFrame } from "../resources/riskAnalysisFrame.js";
import {
  DEFAULT_CONDITION_ID_PREFIX,
  buildRequirementCoverageMatrix,
  buildRiskCategoryDistribution,
  buildRiskStakeholderImpactMatrix,
  buildSourceDistribution,
  evaluateRisks,
  findConditionsWithoutPriority,
  findConditionsWithoutSourceRefs,
  findDuplicateConditionIds,
  findIncompletePersonaQuadrants,
  findRisksWithoutBasis,
  findUnknownRiskPronenessFactorIds,
  findUnknownRiskStakeholderFrameIds,
  formatPersonaQuadrantCell,
  personaQuadrantColumns,
  findMissingConditionNumbers,
  findPrefixMismatchConditionIds,
  findUncoveredRequirementIds,
  findUnknownRiskCategoryIds,
  findUnresolvedDerivedFromRefs,
  findUnusedPerspectiveCategories,
  findUnusedRiskCategories,
  resolveEffectiveRiskAxes,
  resolveSourceRefs,
  testConditionSourceLabels,
} from "../testConditionAnalysis.js";
import { formatSourceCitation } from "../testBasisAnalysis.js";
import {
  derivedFromSchema,
  formatDerivedFromEntry,
  formatDerivedFromList,
  hasDerivedFromRef,
} from "../derivedFromRefs.js";
import type {
  ExtractTestConditionsInput,
  GuidewordDictionary,
  NextToolCatalogEntry,
  RiskAnalysisFrame,
  TestConditionInput,
  TestPerspectiveCatalog,
} from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

const DEFAULT_COVERAGE_CRITERIA = [
  "対象要件IDのすべてに、紐づくテスト条件が1件以上ある。",
  "観点カタログの全カテゴリを検討済みであり、対象外としたカテゴリには理由がある。",
  "テストベース／ステークホルダー／リスク／ガイドワードの4系統すべてから条件が導出されている。",
  "すべてのテスト条件に優先度が付与されている。",
  "リスク分析フレームの全リスク区分を検討済みであり、対象外とした区分には理由がある。",
];

function knownTechniqueIds(catalog: TestPerspectiveCatalog): Set<string> {
  const ids = new Set<string>();
  for (const category of catalog.categories) {
    for (const perspective of category.perspectives) {
      for (const t of perspective.recommendedTechniques) ids.add(t);
    }
  }
  return ids;
}

function categoryLabel(catalog: TestPerspectiveCatalog, categoryId: string): string {
  const category = catalog.categories.find((c) => c.id === categoryId);
  return category ? `${category.id} ${category.nameJa}` : `${categoryId}(カタログ外)`;
}

function derivationText(condition: TestConditionInput): string {
  const base = `${condition.source} / ${formatDerivedFromList(condition.derivedFrom)}`;
  return condition.rationale ? `${base}（${condition.rationale}）` : base;
}

export function renderTestConditions(
  input: ExtractTestConditionsInput,
  catalog: TestPerspectiveCatalog = testPerspectiveCatalog,
  dictionary: GuidewordDictionary = guidewordDictionary,
  frame: RiskAnalysisFrame = riskAnalysisFrame
): string {
  const {
    requirementIds,
    testConditions,
    personas,
    risks,
    coverageCriteria,
    priorityCriteria,
    perspectiveCategoryIds,
  } = input;
  const idPrefix = input.idPrefix ?? DEFAULT_CONDITION_ID_PREFIX;

  const coverageMatrix = buildRequirementCoverageMatrix(requirementIds, testConditions);
  const uncovered = findUncoveredRequirementIds(requirementIds, testConditions);
  const unusedCategories = findUnusedPerspectiveCategories(testConditions, catalog, perspectiveCategoryIds);
  const duplicates = findDuplicateConditionIds(testConditions);
  const missingNumbers = findMissingConditionNumbers(testConditions, idPrefix);
  const prefixMismatch = findPrefixMismatchConditionIds(testConditions, idPrefix);
  const withoutPriority = findConditionsWithoutPriority(testConditions);
  const unresolvedRefs = findUnresolvedDerivedFromRefs(input);
  const conditionsWithoutSourceRefs = findConditionsWithoutSourceRefs(input);
  const distribution = buildSourceDistribution(testConditions);
  const evaluations = evaluateRisks(testConditions, frame);
  const evaluationById = new Map(evaluations.map((e) => [e.conditionId, e]));
  const riskCategoryDistribution = buildRiskCategoryDistribution(risks ?? [], testConditions, frame);
  const unusedRiskCategories = findUnusedRiskCategories(risks ?? [], testConditions, frame);
  const unknownRiskCategoryRefs = findUnknownRiskCategoryIds(risks ?? [], testConditions, frame);
  const incompletePersonaQuadrants = findIncompletePersonaQuadrants(personas ?? []);
  const stakeholderImpactMatrix = buildRiskStakeholderImpactMatrix(risks ?? [], frame);
  const unknownRiskStakeholderFrameRefs = findUnknownRiskStakeholderFrameIds(risks ?? [], frame);
  const unknownRiskPronenessFactorRefs = findUnknownRiskPronenessFactorIds(risks ?? [], testConditions, frame);
  const risksWithoutBasis = findRisksWithoutBasis(risks ?? []);

  const known = knownTechniqueIds(catalog);
  const unknownTechniques: { conditionId: string; techniqueId: string }[] = [];
  for (const c of testConditions) {
    for (const t of c.recommendedTechniques ?? []) {
      if (!known.has(t)) unknownTechniques.push({ conditionId: c.id, techniqueId: t });
    }
  }

  const lines: string[] = [];
  lines.push("# テスト条件抽出結果");
  lines.push("");

  // --- 1. 前提と宣言 ---
  lines.push("## 1. 前提と宣言");
  lines.push("");
  lines.push("### 1.1 対象要件ID");
  lines.push("");
  lines.push(`- 件数: ${requirementIds.length}`);
  for (const id of requirementIds) {
    lines.push(`- ${id}`);
  }
  lines.push("");
  lines.push("### 1.2 採用した網羅基準");
  lines.push("");
  const criteria =
    coverageCriteria && coverageCriteria.length > 0 ? coverageCriteria : DEFAULT_COVERAGE_CRITERIA;
  if (!coverageCriteria || coverageCriteria.length === 0) {
    lines.push("網羅基準の指定がないため、以下の既定基準を採用する。");
    lines.push("");
  }
  for (const c of criteria) {
    lines.push(`- ${c}`);
  }
  lines.push("");
  lines.push("### 1.3 導出系統(source)の定義");
  lines.push("");
  lines.push("| source | 名称 | 説明 |");
  lines.push("| --- | --- | --- |");
  for (const s of testConditionSourceLabels) {
    lines.push(`| ${s.source} | ${escapeCell(s.nameJa)} | ${escapeCell(s.description)} |`);
  }
  lines.push("");
  lines.push("source と derivedFrom は必須メタデータであり、どちらも空にしてはならない。");
  lines.push("");

  // --- 2. テスト条件表 ---
  lines.push("## 2. テスト条件表");
  lines.push("");
  lines.push("| 条件ID | 対象 | 観点カテゴリ | 条件文 | 優先度 | リスクレベル | 導出根拠 | 推奨技法 | 根拠位置 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of testConditions) {
    const evaluation = evaluationById.get(c.id);
    const riskLevel = evaluation && evaluation.bandId ? evaluation.bandId : "未算出";
    const techniques =
      c.recommendedTechniques && c.recommendedTechniques.length > 0
        ? c.recommendedTechniques.join(", ")
        : "未設定";
    const sourceRefs = resolveSourceRefs(c, input.requirementSources ?? []);
    const sourceCitation =
      sourceRefs.length > 0 ? sourceRefs.map((r) => formatSourceCitation(r)).join("; ") : "未特定";
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.target)} | ${escapeCell(
        categoryLabel(catalog, c.perspectiveCategoryId)
      )} | ${escapeCell(c.statement)} | ${c.priority ?? "未設定"} | ${riskLevel} | ${escapeCell(
        derivationText(c)
      )} | ${escapeCell(techniques)} | ${escapeCell(sourceCitation)} |`
    );
  }
  lines.push("");

  // --- 3. 決定的検査(自動) ---
  lines.push("## 3. 決定的検査(自動)");
  lines.push("");

  lines.push("### 3.1 要件ID × テスト条件 カバレッジマトリクス");
  lines.push("");
  lines.push("| 要件ID | 紐づくテスト条件ID | 件数 |");
  lines.push("| --- | --- | --- |");
  for (const row of coverageMatrix) {
    lines.push(
      `| ${escapeCell(row.requirementId)} | ${escapeCell(
        row.conditionIds.length > 0 ? row.conditionIds.join(", ") : "-"
      )} | ${row.conditionIds.length} |`
    );
  }
  lines.push("");

  lines.push("### 3.2 未カバー要件ID一覧");
  lines.push("");
  if (uncovered.length === 0) {
    lines.push("- 未カバーなし");
  } else {
    for (const id of uncovered) {
      lines.push(`- [high] ${id}: 紐づくテスト条件が0件。テスト条件を追加すること。`);
    }
  }
  lines.push(
    "- 注意: この判定は入力された requirementIds の母集団に対してのみ成立する。テストベース全体に対する母集団の充足性は audit_id_population で検証すること。"
  );
  lines.push("");

  lines.push("### 3.3 観点カテゴリの被覆状況");
  lines.push("");
  lines.push("| カテゴリ | 使用条件数 | 状態 |");
  lines.push("| --- | --- | --- |");
  const targetCategories =
    perspectiveCategoryIds && perspectiveCategoryIds.length > 0
      ? catalog.categories.filter((c) => perspectiveCategoryIds.includes(c.id))
      : catalog.categories;
  for (const category of targetCategories) {
    const count = testConditions.filter((c) => c.perspectiveCategoryId === category.id).length;
    lines.push(
      `| ${escapeCell(`${category.id} ${category.nameJa}`)} | ${count} | ${count > 0 ? "使用" : "未使用"} |`
    );
  }
  lines.push("");
  if (unusedCategories.length === 0) {
    lines.push("- 未使用の観点カテゴリ: なし");
  } else {
    lines.push("未使用の観点カテゴリ(抜け漏れ候補):");
    lines.push("");
    for (const category of unusedCategories) {
      lines.push(
        `- [medium] ${category.id} ${category.nameJa}: 該当するテスト条件が無い。対象外とする理由を明記するか、条件を追加すること。`
      );
    }
  }
  lines.push("");

  lines.push("### 3.4 条件IDの重複・欠番");
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

  lines.push("### 3.5 優先度未設定のテスト条件");
  lines.push("");
  if (withoutPriority.length === 0) {
    lines.push("- なし");
  } else {
    for (const c of withoutPriority) {
      lines.push(`- [high] ${c.id}: ${escapeCell(c.statement)}(優先度が未設定)`);
    }
  }
  lines.push("");

  lines.push("### 3.6 導出系統の分布");
  lines.push("");
  lines.push("| 系統 | 件数 | 条件ID |");
  lines.push("| --- | --- | --- |");
  for (const row of distribution) {
    lines.push(
      `| ${row.source} | ${row.count} | ${escapeCell(
        row.conditionIds.length > 0 ? row.conditionIds.join(", ") : "-"
      )} |`
    );
  }
  lines.push("");
  const emptySources = distribution.filter((row) => row.count === 0);
  if (emptySources.length === 0) {
    lines.push("- 4系統すべてから条件が導出されている。");
  } else {
    for (const row of emptySources) {
      lines.push(
        `- [medium] 単一系統偏り: ${row.source} から導出された条件が0件。この系統からの洗い出しを実施すること。`
      );
    }
  }
  lines.push("");

  lines.push("### 3.7 derivedFrom の未解決参照");
  lines.push("");
  if (unresolvedRefs.length === 0) {
    lines.push("- なし");
  } else {
    lines.push("| 条件ID | 参照 | 照合対象 |");
    lines.push("| --- | --- | --- |");
    for (const ref of unresolvedRefs) {
      const refDisplay = ref.kind ? formatDerivedFromEntry({ kind: ref.kind, id: ref.ref }) : ref.ref;
      lines.push(
        `| ${escapeCell(ref.conditionId)} | ${escapeCell(refDisplay)} | ${escapeCell(ref.expectedKind)} |`
      );
    }
  }
  lines.push("");

  lines.push("### 3.8 未知の推奨技法ID");
  lines.push("");
  if (unknownTechniques.length === 0) {
    lines.push("- なし");
  } else {
    for (const u of unknownTechniques) {
      lines.push(
        `- [medium] ${u.conditionId}: 「${escapeCell(u.techniqueId)}」は観点カタログに存在しない技法IDである。`
      );
    }
  }
  lines.push("");

  lines.push("### 3.9 リスク区分の被覆状況");
  lines.push("");
  lines.push("| リスク区分 | リスク件数 | 条件件数 | 合計 | 状態 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of riskCategoryDistribution) {
    lines.push(
      `| ${escapeCell(`${row.categoryId} ${row.nameJa}`)} | ${row.riskIds.length} | ${
        row.conditionIds.length
      } | ${row.count} | ${row.count > 0 ? "使用" : "未使用"} |`
    );
  }
  lines.push("");
  if (unusedRiskCategories.length === 0) {
    lines.push("- 未使用のリスク区分: なし");
  } else {
    lines.push("未使用のリスク区分(検討漏れ候補):");
    lines.push("");
    for (const category of unusedRiskCategories) {
      lines.push(
        `- [medium] ${category.id} ${category.nameJa}: 該当するリスク・テスト条件が無い。この区分を検討し、対象外とする理由を明記するか条件を追加すること。`
      );
    }
  }
  if (unknownRiskCategoryRefs.length > 0) {
    for (const ref of unknownRiskCategoryRefs) {
      lines.push(
        `- [medium] ${ref.ownerId}: 「${ref.riskCategoryId}」はリスク分析フレームに存在しないリスク区分IDである。`
      );
    }
  }
  lines.push("");

  lines.push("### 3.10 根拠位置が未特定のテスト条件");
  lines.push("");
  if (conditionsWithoutSourceRefs.length === 0) {
    lines.push("- なし");
  } else {
    for (const c of conditionsWithoutSourceRefs) {
      lines.push(
        `- [medium] ${c.conditionId}: 根拠位置(文書名・行番号)が未特定。analyze_requirements の requirementSources を渡すか sourceRefs を指定すること。`
      );
    }
  }
  lines.push("");

  lines.push("### 3.11 ペルソナ4象限の記入状況");
  lines.push("");
  if ((personas ?? []).length === 0) {
    lines.push("- ペルソナの指定なし");
  } else if (incompletePersonaQuadrants.length === 0) {
    lines.push("- 未記入の象限があるペルソナ: なし");
  } else {
    for (const row of incompletePersonaQuadrants) {
      lines.push(
        `- [medium] ${escapeCell(row.personaId)}: 未記入の象限 ${escapeCell(
          row.missingQuadrants.join(", ")
        )}。persona_journey_interview で解像度を上げること。`
      );
    }
  }
  lines.push("");

  lines.push("### 3.12 サマリ");
  lines.push("");
  lines.push(
    `- 対象要件ID数: ${requirementIds.length} / テスト条件数: ${testConditions.length} / 未カバー要件ID数: ${uncovered.length} / 未使用観点カテゴリ数: ${unusedCategories.length} / 重複ID数: ${duplicates.length} / 欠番数: ${missingNumbers.length} / 優先度未設定数: ${withoutPriority.length} / 未解決参照数: ${unresolvedRefs.length} / 未知技法ID数: ${unknownTechniques.length} / リスク未算出数: ${evaluations.filter((e) => e.incomplete).length} / 優先度逸脱数: ${evaluations.filter((e) => e.deviates).length} / 未使用リスク区分数: ${unusedRiskCategories.length} / 未知リスク区分ID数: ${unknownRiskCategoryRefs.length} / 根拠位置未特定数: ${conditionsWithoutSourceRefs.length} / 4象限未記入ペルソナ件数: ${incompletePersonaQuadrants.length}`
  );
  lines.push("");

  // --- 4. 採用した優先度基準 ---
  lines.push("## 4. 採用した優先度基準");
  lines.push("");
  lines.push("### 4.1 リスクレベル算出式");
  lines.push("");
  lines.push(frame.formula);
  lines.push("");
  for (const axis of [frame.impactAxis, frame.likelihoodAxis, frame.changeAxis]) {
    lines.push(`#### ${axis.id} ${axis.nameJa}`);
    lines.push("");
    lines.push(escapeCell(axis.description));
    lines.push("");
    lines.push("| 値 | レベル | 判定基準 |");
    lines.push("| --- | --- | --- |");
    for (const level of axis.levels) {
      lines.push(`| ${level.value} | ${escapeCell(level.label)} | ${escapeCell(level.criteria)} |`);
    }
    lines.push("");
  }
  lines.push("changeCategory が未指定の場合、changeWeight は既定値 2 として計算する。");
  lines.push("");

  lines.push("重篤度サブ軸(任意軸。未記入時は既存の影響度軸を使う):");
  lines.push("");
  for (const axis of frame.severitySubAxes) {
    lines.push(`#### ${axis.id} ${axis.nameJa}`);
    lines.push("");
    lines.push(escapeCell(axis.description));
    lines.push("");
    lines.push("| 値 | レベル | 判定基準 |");
    lines.push("| --- | --- | --- |");
    for (const level of axis.levels) {
      lines.push(`| ${level.value} | ${escapeCell(level.label)} | ${escapeCell(level.criteria)} |`);
    }
    lines.push("");
  }
  lines.push(frame.severityAggregationRule);
  lines.push("");
  lines.push("重篤度区分:");
  lines.push("");
  lines.push("| 区分 | 重篤度範囲 | 名称 | 指針 |");
  lines.push("| --- | --- | --- | --- |");
  for (const g of frame.severityGrades) {
    lines.push(
      `| ${escapeCell(g.id)} | ${g.minSeverity}..${g.maxSeverity} | ${escapeCell(g.label)} | ${escapeCell(g.guidance)} |`
    );
  }
  lines.push("");
  lines.push("発生頻度サブ軸(任意軸。未記入時は既存の発生可能性軸を使う):");
  lines.push("");
  for (const axis of [frame.usageFrequencyAxis, frame.defectPronenessAxis]) {
    lines.push(`#### ${axis.id} ${axis.nameJa}`);
    lines.push("");
    lines.push(escapeCell(axis.description));
    lines.push("");
    lines.push("| 値 | レベル | 判定基準 |");
    lines.push("| --- | --- | --- |");
    for (const level of axis.levels) {
      lines.push(`| ${level.value} | ${escapeCell(level.label)} | ${escapeCell(level.criteria)} |`);
    }
    lines.push("");
  }
  lines.push(frame.likelihoodDerivationRule);
  lines.push("");
  lines.push("発生しやすさ係数調整要因(係数逸脱時の根拠として pronenessFactorIds に指定する):");
  lines.push("");
  lines.push("| 要因ID | 要因 | 方向 | 説明 |");
  lines.push("| --- | --- | --- | --- |");
  for (const f of frame.pronenessFactors) {
    lines.push(
      `| ${escapeCell(f.id)} | ${escapeCell(f.nameJa)} | ${f.direction === "increase" ? "増加" : "減少"} | ${escapeCell(f.description)} |`
    );
  }
  lines.push("");
  lines.push(frame.optionalAxisPolicy);
  lines.push("");

  lines.push("### 4.2 リスクスコア → 優先度の写像");
  lines.push("");
  lines.push("| リスクレベル | スコア範囲 | 優先度 | 指針 |");
  lines.push("| --- | --- | --- | --- |");
  for (const band of frame.bands) {
    lines.push(
      `| ${band.id} | ${band.minScore}..${band.maxScore} | ${band.priority} | ${escapeCell(band.guidance)} |`
    );
  }
  lines.push("");
  lines.push(
    "任意軸を追加してもスコア範囲 1..75 と R1〜R4 の区分は変更しない。追加軸は実効影響度・実効発生可能性の供給元としてのみ働き、内訳と不整合は 4.5 に示す。"
  );
  lines.push("");

  lines.push("### 4.3 宣言された優先度基準");
  lines.push("");
  if (priorityCriteria && priorityCriteria.length > 0) {
    for (const c of priorityCriteria) {
      lines.push(`- ${c}`);
    }
  } else {
    lines.push("優先度基準の指定がないため、4.1 の算出式と 4.2 の写像を既定基準として採用する。");
  }
  lines.push("");

  lines.push("### 4.4 優先度の導出結果と逸脱");
  lines.push("");
  lines.push("| 条件ID | 影響度 | 発生可能性 | 変更区分 | スコア | 導出優先度 | 宣言優先度 | 判定 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of testConditions) {
    const e = evaluationById.get(c.id);
    const verdict = !e || e.incomplete ? "未算出" : e.deviates ? "逸脱" : "一致";
    lines.push(
      `| ${escapeCell(c.id)} | ${c.impact ?? "-"} | ${c.likelihood ?? "-"} | ${c.changeCategory ?? "-"} | ${
        e?.score ?? "-"
      } | ${e?.derivedPriority ?? "-"} | ${c.priority ?? "-"} | ${verdict} |`
    );
  }
  lines.push("");
  const deviating = testConditions.filter((c) => evaluationById.get(c.id)?.deviates);
  if (deviating.length === 0) {
    lines.push("- 優先度の逸脱: なし");
  } else {
    for (const c of deviating) {
      const reason = c.priorityDeviationReason?.trim();
      lines.push(
        `- ${c.id}: ${reason ? `逸脱理由: ${escapeCell(reason)}` : "逸脱理由: 未記入(要記入)"}`
      );
    }
  }
  lines.push("");

  lines.push("### 4.5 任意軸の内訳と宣言・実体の照合");
  lines.push("");
  const anySeverityOrLikelihoodDetail = testConditions.some(
    (c) => c.severity !== undefined || c.likelihoodDetail !== undefined
  );
  if (!anySeverityOrLikelihoodDetail) {
    lines.push("任意軸の記入がないため、既存3軸のスコアのみで評価している。");
  } else {
    lines.push(
      "| 条件ID | 直接影響 | 波及影響 | 短期金銭 | 長期金銭 | 重篤度 | 重篤度区分 | 影響度出所 | 利用頻度 | 発生しやすさ | 発生可能性出所 |"
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const c of testConditions) {
      const effective = resolveEffectiveRiskAxes(c, frame);
      lines.push(
        `| ${escapeCell(c.id)} | ${c.severity?.direct ?? "-"} | ${c.severity?.ripple ?? "-"} | ${
          c.severity?.shortTermFinancial ?? "-"
        } | ${c.severity?.longTermFinancial ?? "-"} | ${effective.severity ?? "-"} | ${
          effective.severityGradeId ?? "-"
        } | ${effective.impactSource ?? "-"} | ${c.likelihoodDetail?.usageFrequency ?? "-"} | ${
          c.likelihoodDetail?.defectProneness ?? "-"
        } | ${effective.likelihoodSource ?? "-"} |`
      );
    }
    lines.push("");

    const conflictConditions = testConditions.filter((c) => resolveEffectiveRiskAxes(c, frame).impactSeverityConflict);
    if (conflictConditions.length === 0) {
      lines.push("- 影響度と重篤度サブ軸の不整合(impactSeverityConflict): なし");
    } else {
      for (const c of conflictConditions) {
        lines.push(`- [high] ${c.id}: 宣言した影響度と重篤度サブ軸の最大値が一致しない(impactSeverityConflict)。`);
      }
    }

    const likelihoodConflictConditions = testConditions.filter(
      (c) => resolveEffectiveRiskAxes(c, frame).likelihoodDetailConflict
    );
    if (likelihoodConflictConditions.length === 0) {
      lines.push("- 発生可能性と発生頻度サブ軸の不整合(likelihoodDetailConflict): なし");
    } else {
      for (const c of likelihoodConflictConditions) {
        lines.push(
          `- [high] ${c.id}: 宣言した発生可能性と利用頻度×発生しやすさ係数からの導出値が一致しない(likelihoodDetailConflict)。`
        );
      }
    }

    const missingRationaleConditions = testConditions.filter(
      (c) => resolveEffectiveRiskAxes(c, frame).missingPronenessRationale
    );
    if (missingRationaleConditions.length === 0) {
      lines.push("- 発生しやすさ係数の逸脱に対する根拠未記入(missingPronenessRationale): なし");
    } else {
      for (const c of missingRationaleConditions) {
        lines.push(
          `- [medium] ${c.id}: 発生しやすさ係数が標準(3)から逸脱しているが、pronenessRationale / pronenessFactorIds のいずれも未記入。`
        );
      }
    }

    const escalationConditions = testConditions.filter((c) => {
      const ev = evaluationById.get(c.id);
      return ev?.severityEscalation;
    });
    if (escalationConditions.length === 0) {
      lines.push("- 重篤度S かつ導出優先度が低のエスカレーション(severityEscalation): なし");
    } else {
      for (const c of escalationConditions) {
        lines.push(
          `- [high] ${c.id}: 重篤度区分がS(最重篤)であるにもかかわらず、導出優先度が低となっている。優先度を見直すこと。`
        );
      }
    }

    if (unknownRiskPronenessFactorRefs.length === 0) {
      lines.push("- 不存在の発生しやすさ係数調整要因ID(RA-PF-xx)参照: なし");
    } else {
      for (const ref of unknownRiskPronenessFactorRefs) {
        lines.push(
          `- [medium] ${ref.ownerId}: 「${escapeCell(ref.factorId)}」はリスク分析フレームに存在しない発生しやすさ係数調整要因IDである。`
        );
      }
    }
  }
  lines.push("");

  // --- 5. 推奨技法 → Phase 3 連携 ---
  lines.push("## 5. 推奨技法 → Phase 3 連携");
  lines.push("");
  const techniqueMap = new Map<string, string[]>();
  const techniqueOrder: string[] = [];
  for (const c of testConditions) {
    for (const t of c.recommendedTechniques ?? []) {
      if (!techniqueMap.has(t)) {
        techniqueMap.set(t, []);
        techniqueOrder.push(t);
      }
      (techniqueMap.get(t) as string[]).push(c.id);
    }
  }
  if (techniqueOrder.length === 0) {
    lines.push("- 推奨技法が指定されたテスト条件はない。観点カタログの推奨技法を参考に付与すること。");
  } else {
    lines.push("| 技法ID | 紐づく条件ID | 対応ツール |");
    lines.push("| --- | --- | --- |");
    for (const t of techniqueOrder) {
      const mapping = testTechniqueToolMapping.find((m) => m.techniqueId === t);
      lines.push(
        `| ${escapeCell(t)} | ${escapeCell((techniqueMap.get(t) as string[]).join(", "))} | ${
          mapping ? mapping.toolName : "-"
        } |`
      );
    }
  }
  lines.push("");
  lines.push("この一覧を generate_test_cases への入力として引き継ぐこと。");
  lines.push("");

  // --- 6. 観点カタログによる追加観点の洗い出し指示 ---
  lines.push("## 6. 観点カタログによる追加観点の洗い出し指示(意味的層)");
  lines.push("");
  lines.push(
    "以下のカテゴリごとに、対象要件に該当するテスト条件が漏れていないか検討し、不足があれば source と derivedFrom を付けて追加すること。3.3 で未使用と判定されたカテゴリを優先的に検討すること。"
  );
  lines.push("");
  for (const category of catalog.categories) {
    const unused = unusedCategories.some((u) => u.id === category.id);
    lines.push(`### ${category.id} ${category.nameJa}${unused ? "(未使用・優先検討)" : ""}`);
    lines.push("");
    lines.push(category.summary);
    lines.push("");
    for (const p of category.perspectives) {
      lines.push(
        `- ${p.id} ${p.nameJa}: ${p.focusExamples.join(" / ")}(推奨技法: ${p.recommendedTechniques.join(", ")})`
      );
    }
    lines.push("");
  }

  // --- 7. ガイドワード法 ---
  lines.push("## 7. ガイドワード法による未記載リスクの洗い出し指示(意味的層)");
  lines.push("");
  lines.push("### 7.1 運用手順");
  lines.push("");
  dictionary.procedure.forEach((step, i) => {
    lines.push(`${i + 1}. ${step}`);
  });
  lines.push("");
  lines.push("### 7.2 着目点 × ガイドワードの適用表");
  lines.push("");
  lines.push("| 着目点ID | 着目点 | 例 |");
  lines.push("| --- | --- | --- |");
  for (const f of dictionary.focusPoints) {
    lines.push(`| ${f.id} | ${escapeCell(f.nameJa)} | ${escapeCell(f.examples.join(" / "))} |`);
  }
  lines.push("");
  lines.push("| ガイドワードID | 語 | 意味 | 質問テンプレート |");
  lines.push("| --- | --- | --- | --- |");
  for (const g of dictionary.guidewords) {
    lines.push(
      `| ${g.id} | ${escapeCell(g.word)} | ${escapeCell(g.meaning)} | ${escapeCell(
        g.questionTemplates.join(" / ")
      )} |`
    );
  }
  lines.push("");
  lines.push(
    "着目点1×着目点2×ガイドワードの組で候補を出し、既出と重複しないものだけを source=guideword としてマージせよ。"
  );
  lines.push("");

  // --- 8. リスク分析フレームの適用指示 ---
  lines.push("## 8. リスク分析フレームの適用指示(意味的層)");
  lines.push("");
  const incomplete = evaluations.filter((e) => e.incomplete);
  if (incomplete.length === 0) {
    lines.push("- すべてのテスト条件でリスクスコアが算出済み。");
  } else {
    lines.push(
      "以下のテスト条件は影響度・発生可能性が未指定でリスクスコアを算出できない。4.1 の各軸レベル表に従って値を割り当て、変更区分も併せて指定すること。"
    );
    lines.push("");
    for (const e of incomplete) {
      lines.push(`- ${e.conditionId}: impact / likelihood が未指定`);
    }
  }
  lines.push("");
  lines.push("ステークホルダー別影響枠の問い:");
  lines.push("");
  for (const sf of frame.stakeholderFrames) {
    lines.push(`- ${sf.id} ${sf.nameJa}: ${sf.impactQuestions.join(" / ")}`);
  }
  lines.push("");

  lines.push("リスク区分ごとの検討の問い:");
  lines.push("");
  lines.push("| 区分ID | 区分 | 説明 | 検討の問い | 関連観点カテゴリ |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const rc of frame.riskCategories) {
    lines.push(
      `| ${escapeCell(rc.id)} | ${escapeCell(rc.nameJa)} | ${escapeCell(rc.description)} | ${escapeCell(
        rc.probeQuestions.join(" / ")
      )} | ${escapeCell(rc.relatedPerspectiveCategoryIds.join(", "))} |`
    );
  }
  lines.push("");

  lines.push(`制御不全の観点(${frame.controlFlawFrame.name}):`);
  lines.push("");
  lines.push(frame.controlFlawFrame.note);
  lines.push("");
  for (const el of frame.controlFlawFrame.loopElements) {
    lines.push(`- ${el.id} ${el.nameJa}: ${el.description}`);
  }
  lines.push("");
  lines.push("| パターンID | パターン | 説明 | 検討の問い |");
  lines.push("| --- | --- | --- | --- |");
  for (const p of frame.controlFlawFrame.patterns) {
    lines.push(
      `| ${escapeCell(p.id)} | ${escapeCell(p.nameJa)} | ${escapeCell(p.description)} | ${escapeCell(
        p.probeQuestions.join(" / ")
      )} |`
    );
  }
  lines.push("");

  if (risks && risks.length > 0) {
    lines.push("| リスクID | 内容 | 区分 | 影響度 | 発生可能性 | 変更区分 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const r of risks) {
      lines.push(
        `| ${escapeCell(r.id)} | ${escapeCell(r.description)} | ${escapeCell(
          r.riskCategoryId ?? "-"
        )} | ${r.impact ?? "-"} | ${r.likelihood ?? "-"} | ${r.changeCategory ?? "-"} |`
      );
    }
    lines.push("");

    lines.push("### 8.1 リスクの重篤度・発生頻度内訳");
    lines.push("");
    lines.push("| リスクID | 直接影響 | 波及影響 | 短期金銭 | 長期金銭 | 重篤度 | 重篤度区分 | 利用頻度 | 発生しやすさ |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const r of risks) {
      const effective = resolveEffectiveRiskAxes(r, frame);
      lines.push(
        `| ${escapeCell(r.id)} | ${r.severity?.direct ?? "-"} | ${r.severity?.ripple ?? "-"} | ${
          r.severity?.shortTermFinancial ?? "-"
        } | ${r.severity?.longTermFinancial ?? "-"} | ${effective.severity ?? "-"} | ${
          effective.severityGradeId ?? "-"
        } | ${r.likelihoodDetail?.usageFrequency ?? "-"} | ${r.likelihoodDetail?.defectProneness ?? "-"} |`
      );
    }
    lines.push("");

    lines.push("### 8.2 リスク×ステークホルダ影響行列");
    lines.push("");
    lines.push(
      `| リスクID | ${stakeholderImpactMatrix.columns.map((c) => escapeCell(c.label)).join(" | ")} |`
    );
    lines.push(`| --- | ${stakeholderImpactMatrix.columns.map(() => "---").join(" | ")} |`);
    for (const row of stakeholderImpactMatrix.rows) {
      lines.push(
        `| ${escapeCell(row.riskId)} | ${row.cells.map((c) => (c.level !== undefined ? String(c.level) : "-")).join(" | ")} |`
      );
    }
    lines.push("");

    lines.push("### 8.3 リスク×ステークホルダ影響行列の指摘");
    lines.push("");
    const rowsWithMissingCells = stakeholderImpactMatrix.rows.filter((r) => r.missingStakeholderKeys.length > 0);
    if (rowsWithMissingCells.length === 0) {
      lines.push("- 未記入セル: なし");
    } else {
      for (const row of rowsWithMissingCells) {
        lines.push(
          `- [medium] ${row.riskId}: 未記入のステークホルダ枠 ${escapeCell(row.missingStakeholderKeys.join(", "))}`
        );
      }
    }
    if (unknownRiskStakeholderFrameRefs.length === 0) {
      lines.push("- 不存在のステークホルダ枠ID(RSF-xx)参照: なし");
    } else {
      for (const ref of unknownRiskStakeholderFrameRefs) {
        lines.push(
          `- [medium] ${ref.riskId}: 「${escapeCell(ref.stakeholderFrameId)}」はリスク分析フレームに存在しないステークホルダ枠IDである。`
        );
      }
    }
    const exceedingRows = stakeholderImpactMatrix.rows.filter((r) => r.exceedsEffectiveImpact);
    if (exceedingRows.length === 0) {
      lines.push("- ステークホルダ影響が実効影響度を超える(exceedsEffectiveImpact): なし");
    } else {
      for (const row of exceedingRows) {
        lines.push(
          `- [high] ${row.riskId}: ステークホルダ影響の最大値(${row.maxLevel})が実効影響度(${row.effectiveImpact})を超えている。影響度の見直しを検討すること。`
        );
      }
    }
    if (risksWithoutBasis.length === 0) {
      lines.push("- 根拠位置・対象IDが未記入のリスク: なし");
    } else {
      for (const riskId of risksWithoutBasis) {
        lines.push(`- [medium] ${riskId}: sourceRefs / targetIds のいずれも未記入で根拠が示されていない。`);
      }
    }
    lines.push("");

    lines.push("### 8.4 リスクの根拠位置・対象ID");
    lines.push("");
    lines.push("| リスクID | 根拠位置(sourceRefs) | 対象ID(targetIds) |");
    lines.push("| --- | --- | --- |");
    for (const r of risks) {
      const sourceRefs = r.sourceRefs ?? [];
      const sourceCitation = sourceRefs.length > 0 ? sourceRefs.map((ref) => formatSourceCitation(ref)).join("; ") : "-";
      const targetIds = r.targetIds && r.targetIds.length > 0 ? r.targetIds.join(", ") : "-";
      lines.push(`| ${escapeCell(r.id)} | ${escapeCell(sourceCitation)} | ${escapeCell(targetIds)} |`);
    }
    lines.push("");
  }

  // --- 9. ステークホルダー／ペルソナ視点 ---
  lines.push("## 9. ステークホルダー／ペルソナ視点の洗い出し指示(意味的層)");
  lines.push("");
  lines.push("| ペルソナID | 役割 | 氏名 | 属性 | 発言・思考 | 目標 | 不満点 | 導出済み条件ID |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const p of personas ?? []) {
    const derived = testConditions
      .filter((c) => hasDerivedFromRef(c.derivedFrom, p.id, "stakeholder"))
      .map((c) => c.id);
    const quadrantCells = personaQuadrantColumns
      .map((column) => escapeCell(formatPersonaQuadrantCell(p, column.key)))
      .join(" | ");
    lines.push(
      `| ${escapeCell(p.id)} | ${escapeCell(p.role)} | ${escapeCell(
        p.name ?? "-"
      )} | ${quadrantCells} | ${escapeCell(derived.length > 0 ? derived.join(", ") : "-")} |`
    );
  }
  lines.push("");
  lines.push(
    "導出済み条件が無いペルソナについては、その関心事から source=stakeholder のテスト条件を追加すること。未指定のステークホルダーがいれば表に追加すること。"
  );
  lines.push(
    "4象限（属性・発言・思考・目標・不満点）が未記入のペルソナは、persona_journey_interview で解像度を上げてから条件を導出すること。"
  );
  lines.push(
    "source=stakeholder のテスト条件の rationale には、対応する quality://characteristics/in-use の利用時品質特性ID(QU-XX、有効性・効率性・満足性・リスク回避性・利用状況網羅性)を1件以上記載することを推奨する。"
  );
  lines.push("");

  // 推奨技法 → 対応ツールの技法由来エントリ。5節で構築した techniqueOrder / techniqueMap を再利用する。
  const techniqueNextToolEntries: { toolName: string; techniqueIds: string[]; conditionIds: string[] }[] = [];
  for (const mapping of testTechniqueToolMapping) {
    if (!techniqueMap.has(mapping.techniqueId)) continue;
    const conditionIds = techniqueMap.get(mapping.techniqueId) as string[];
    const existing = techniqueNextToolEntries.find((e) => e.toolName === mapping.toolName);
    if (existing) {
      existing.techniqueIds.push(mapping.techniqueId);
      for (const id of conditionIds) {
        if (!existing.conditionIds.includes(id)) existing.conditionIds.push(id);
      }
      continue;
    }
    techniqueNextToolEntries.push({
      toolName: mapping.toolName,
      techniqueIds: [mapping.techniqueId],
      conditionIds: [...conditionIds],
    });
  }
  const techniqueEntries: NextToolCatalogEntry[] = techniqueNextToolEntries.map((e) => ({
    toolName: e.toolName,
    when: "always",
    reason: `推奨技法 ${e.techniqueIds.join(", ")} が条件 ${e.conditionIds.join(", ")} に指定されている`,
  }));

  lines.push(
    ...renderNextToolsSection(
      "extract_test_conditions",
      [
        ...(testConditions.length > 0 ? ["has-conditions"] : []),
        ...(testConditions.some((c) => c.priority === "高") ? ["has-high-priority-conditions"] : []),
        ...(uncovered.length > 0 ? ["has-uncovered-requirements"] : []),
      ],
      input.completedTools,
      techniqueEntries
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

const riskSeverityInputSchema = z
  .object({
    direct: z.number().int().min(1).max(5).optional().describe("Direct impact sub-axis (1..5)"),
    ripple: z.number().int().min(1).max(5).optional().describe("Ripple impact to related features sub-axis (1..5)"),
    shortTermFinancial: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Short-term financial impact sub-axis (1..5)"),
    longTermFinancial: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Long-term financial impact sub-axis (1..5)"),
  })
  .optional()
  .describe("Optional severity sub-axes (RA-SEV-01..04); falls back to impact when omitted");

const riskLikelihoodDetailInputSchema = z
  .object({
    usageFrequency: z.number().int().min(1).max(5).optional().describe("Usage frequency sub-axis (1..5)"),
    defectProneness: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Defect proneness factor sub-axis (1..5, 3 is standard)"),
    pronenessRationale: z
      .string()
      .optional()
      .describe("Rationale text when defectProneness deviates from the standard value 3"),
    pronenessFactorIds: z
      .array(z.string())
      .optional()
      .describe("Proneness factor ids (RA-PF-xx) backing a defectProneness deviation"),
  })
  .optional()
  .describe("Optional likelihood sub-axes (RA-USAGE / RA-PRONENESS); falls back to likelihood when omitted");

const riskStakeholderImpactInputSchema = z
  .object({
    stakeholderFrameId: z.string().optional().describe("Stakeholder frame id from the risk analysis frame, e.g. RSF-01"),
    stakeholderLabel: z.string().optional().describe("Stakeholder label outside the risk analysis frame"),
    level: z.number().int().min(1).max(5).describe("Impact level on this stakeholder (1..5)"),
    note: z.string().optional().describe("Free-text note on this impact"),
  })
  .refine((v) => Boolean(v.stakeholderFrameId) || Boolean(v.stakeholderLabel), {
    message: "Either stakeholderFrameId or stakeholderLabel must be provided",
  });

export const extractTestConditionsInputShape = {
  ...completedToolsInputShape,
  requirementIds: z
    .array(z.string())
    .min(1)
    .describe("Requirement/feature IDs that test conditions must cover (coverage matrix rows)"),
  testConditions: z
    .array(
      z.object({
        id: z.string().describe("Test condition ID, e.g. TC-001"),
        target: z.string().describe("Target of the condition (feature ID / screen ID)"),
        perspectiveCategoryId: z
          .string()
          .describe("Perspective category id from the catalog, e.g. TPC-03"),
        perspectiveId: z.string().optional().describe("Perspective id, e.g. TPC-03-01"),
        statement: z.string().describe("The test condition statement"),
        source: z
          .enum(["testbase", "stakeholder", "risk", "guideword"])
          .describe("Derivation line this condition came from (required)"),
        derivedFrom: derivedFromSchema.describe(
          "Requirement IDs / risk IDs / persona IDs this condition was derived from (required). Plain id string, or {kind, id} to disambiguate across requirement/risk/stakeholder/guideword namespaces"
        ),
        priority: z.enum(["高", "中", "低"]).optional().describe("Declared priority of the condition"),
        impact: z.number().int().min(1).max(5).optional().describe("Risk impact level (1..5)"),
        likelihood: z.number().int().min(1).max(5).optional().describe("Risk likelihood level (1..5)"),
        changeCategory: z
          .enum(["new", "modified", "existing-impacted", "existing-unaffected"])
          .optional()
          .describe("Change category of the target, used as the change weight"),
        riskCategoryId: z
          .string()
          .optional()
          .describe("Risk category id from the risk analysis frame, e.g. RC-04"),
        recommendedTechniques: z
          .array(z.string())
          .optional()
          .describe("Recommended technique ids to hand over to generate_test_cases"),
        rationale: z.string().optional().describe("Additional note on how the condition was derived"),
        priorityDeviationReason: z
          .string()
          .optional()
          .describe("Reason if the declared priority deviates from the risk-based derived priority"),
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
        severity: riskSeverityInputSchema,
        likelihoodDetail: riskLikelihoodDetailInputSchema,
      })
    )
    .min(1)
    .describe("Test conditions to inspect; source and derivedFrom are mandatory metadata"),
  personas: z
    .array(
      z.object({
        id: z.string().describe("Persona id referenced by derivedFrom"),
        role: z.string().describe("Persona role"),
        name: z.string().optional().describe("Persona name"),
        concerns: z
          .string()
          .optional()
          .describe("Known concerns of this persona (legacy field; prefer painPoints)"),
        demographics: z
          .array(z.string())
          .optional()
          .describe("Demographics quadrant: age range, occupation, usage environment, IT literacy, etc."),
        saysAndThinks: z
          .array(z.string())
          .optional()
          .describe("Says & Thinks quadrant: what this persona says and thinks in the target context"),
        goals: z.array(z.string()).optional().describe("Goals quadrant: what this persona wants to achieve"),
        painPoints: z
          .array(z.string())
          .optional()
          .describe("Pain Point quadrant: frustrations and obstacles this persona faces"),
      })
    )
    .optional()
    .describe(
      "Stakeholders / personas referenced by derivedFrom when source is stakeholder; described with the Demographics / Says&Thinks / Goals / PainPoint quadrants"
    ),
  risks: z
    .array(
      z.object({
        id: z.string().describe("Risk id referenced by derivedFrom"),
        description: z.string().describe("Risk description"),
        impact: z.number().int().min(1).max(5).optional().describe("Risk impact level (1..5)"),
        likelihood: z.number().int().min(1).max(5).optional().describe("Risk likelihood level (1..5)"),
        changeCategory: z
          .enum(["new", "modified", "existing-impacted", "existing-unaffected"])
          .optional()
          .describe("Change category related to this risk"),
        riskCategoryId: z
          .string()
          .optional()
          .describe("Risk category id from the risk analysis frame, e.g. RC-04"),
        severity: riskSeverityInputSchema,
        likelihoodDetail: riskLikelihoodDetailInputSchema,
        stakeholderImpacts: z
          .array(riskStakeholderImpactInputSchema)
          .optional()
          .describe("Per-stakeholder impact levels for the risk x stakeholder impact matrix"),
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
          .describe("Explicit source locations in the test basis backing this risk"),
        targetIds: z
          .array(z.string())
          .optional()
          .describe("Feature/screen ids this risk applies to"),
      })
    )
    .optional()
    .describe("Risks referenced by derivedFrom when source is risk"),
  coverageCriteria: z
    .array(z.string())
    .optional()
    .describe("Explicitly declared coverage criteria; a default set is emitted when omitted"),
  priorityCriteria: z
    .array(z.string())
    .optional()
    .describe("Explicitly declared priority criteria; the risk frame default is emitted when omitted"),
  perspectiveCategoryIds: z
    .array(z.string())
    .optional()
    .describe("If provided, restrict the perspective coverage check to these category ids"),
  idPrefix: z
    .string()
    .optional()
    .describe("Test condition ID prefix used for gap detection (default TC-)"),
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

export function registerExtractTestConditionsTool(server: McpServer): void {
  server.registerTool(
    "extract_test_conditions",
    {
      title: "Extract Test Conditions",
      description:
        "テスト条件をテストベース／ステークホルダー／リスク／ガイドワードの4系統から導出させ、要件ID×テスト条件の双方向カバレッジ・観点カテゴリの未使用・条件IDの重複/欠番・優先度未設定・derivedFrom の未解決参照を決定的に検査する。観点カタログ・ガイドワード辞書・リスク分析フレームに基づく追加洗い出しは呼び出し側LLMへの指示として返す。既存のテスト条件一覧を testConditions に渡せば、既存成果物のレビューとしても同じ決定的検査を実行できる。",
      inputSchema: extractTestConditionsInputShape,
    },
    async (input) => {
      const markdown = renderTestConditions(input as ExtractTestConditionsInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
