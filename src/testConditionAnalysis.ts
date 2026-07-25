import { testPerspectiveCatalog } from "./resources/testPerspectiveCatalog.js";
import { riskAnalysisFrame } from "./resources/riskAnalysisFrame.js";
import type {
  ExtractTestConditionsInput,
  RequirementCoverageRow,
  RequirementsChangeCategory,
  RiskAnalysisFrame,
  RiskLevelBand,
  TestConditionDuplicateId,
  TestConditionInput,
  TestConditionPriority,
  TestConditionRiskEvaluation,
  TestConditionSource,
  TestConditionSourceDistributionRow,
  TestConditionUnresolvedRef,
  TestPerspectiveCatalog,
} from "./types.js";

// extract_test_conditions 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順（または明示したソートキー）で決定的。

export const DEFAULT_CONDITION_ID_PREFIX = "TC-";

export const testConditionSources: TestConditionSource[] = [
  "testbase",
  "stakeholder",
  "risk",
  "guideword",
];

export const testConditionSourceLabels: { source: TestConditionSource; nameJa: string; description: string }[] = [
  {
    source: "testbase",
    nameJa: "テストベース由来",
    description: "要件・仕様の記述そのものから導出した条件。derivedFrom には要件IDを書く。",
  },
  {
    source: "stakeholder",
    nameJa: "ステークホルダー由来",
    description: "利用者・運用者などの関心事から導出した条件。derivedFrom にはペルソナIDを書く。",
  },
  {
    source: "risk",
    nameJa: "リスク由来",
    description: "洗い出したリスクから導出した条件。derivedFrom にはリスクIDを書く。",
  },
  {
    source: "guideword",
    nameJa: "ガイドワード由来",
    description: "着目点×ガイドワードの掛け合わせで見つけた条件。derivedFrom には着想元の要件ID/リスクID/ペルソナIDを書く。",
  },
];

export function buildRequirementCoverageMatrix(
  requirementIds: string[],
  conditions: TestConditionInput[]
): RequirementCoverageRow[] {
  return requirementIds.map((requirementId) => ({
    requirementId,
    conditionIds: conditions.filter((c) => c.derivedFrom.includes(requirementId)).map((c) => c.id),
  }));
}

export function findUncoveredRequirementIds(
  requirementIds: string[],
  conditions: TestConditionInput[]
): string[] {
  return buildRequirementCoverageMatrix(requirementIds, conditions)
    .filter((row) => row.conditionIds.length === 0)
    .map((row) => row.requirementId);
}

export function findUnusedPerspectiveCategories(
  conditions: TestConditionInput[],
  catalog: TestPerspectiveCatalog = testPerspectiveCatalog,
  categoryIds?: string[]
): { id: string; nameJa: string }[] {
  const used = new Set(conditions.map((c) => c.perspectiveCategoryId));
  const targets =
    categoryIds && categoryIds.length > 0
      ? catalog.categories.filter((c) => categoryIds.includes(c.id))
      : catalog.categories;
  return targets
    .filter((c) => !used.has(c.id))
    .map((c) => ({ id: c.id, nameJa: c.nameJa }));
}

export function findDuplicateConditionIds(conditions: TestConditionInput[]): TestConditionDuplicateId[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const c of conditions) {
    if (!counts.has(c.id)) order.push(c.id);
    counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  }
  return order
    .filter((id) => (counts.get(id) ?? 0) > 1)
    .map((id) => ({ id, count: counts.get(id) as number }));
}

function parseNumberPart(id: string, idPrefix: string): { raw: string; value: number } | undefined {
  if (!id.startsWith(idPrefix)) return undefined;
  const rest = id.slice(idPrefix.length);
  if (!/^\d+$/.test(rest)) return undefined;
  return { raw: rest, value: Number(rest) };
}

export function findPrefixMismatchConditionIds(
  conditions: TestConditionInput[],
  idPrefix: string = DEFAULT_CONDITION_ID_PREFIX
): string[] {
  const result: string[] = [];
  for (const c of conditions) {
    if (!parseNumberPart(c.id, idPrefix) && !result.includes(c.id)) result.push(c.id);
  }
  return result;
}

export function findMissingConditionNumbers(
  conditions: TestConditionInput[],
  idPrefix: string = DEFAULT_CONDITION_ID_PREFIX
): string[] {
  const parsed = conditions
    .map((c) => parseNumberPart(c.id, idPrefix))
    .filter((p): p is { raw: string; value: number } => p !== undefined);
  if (parsed.length === 0) return [];

  const widthCounts = new Map<number, number>();
  for (const p of parsed) {
    widthCounts.set(p.raw.length, (widthCounts.get(p.raw.length) ?? 0) + 1);
  }
  let width = 0;
  let bestCount = -1;
  for (const [w, count] of [...widthCounts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > bestCount || (count === bestCount && w > width)) {
      width = w;
      bestCount = count;
    }
  }

  const present = new Set(parsed.map((p) => p.value));
  const min = Math.min(...parsed.map((p) => p.value));
  const max = Math.max(...parsed.map((p) => p.value));
  const missing: string[] = [];
  for (let n = min; n <= max; n++) {
    if (!present.has(n)) missing.push(`${idPrefix}${String(n).padStart(width, "0")}`);
  }
  return missing;
}

export function findConditionsWithoutPriority(conditions: TestConditionInput[]): TestConditionInput[] {
  return conditions.filter((c) => !c.priority);
}

export function findUnresolvedDerivedFromRefs(
  input: ExtractTestConditionsInput
): TestConditionUnresolvedRef[] {
  const requirementIds = input.requirementIds ?? [];
  const personaIds = (input.personas ?? []).map((p) => p.id);
  const riskIds = (input.risks ?? []).map((r) => r.id);

  const result: TestConditionUnresolvedRef[] = [];
  for (const condition of input.testConditions) {
    let pool: string[];
    let expectedKind: string;
    switch (condition.source) {
      case "testbase":
        pool = requirementIds;
        expectedKind = "requirementIds";
        break;
      case "stakeholder":
        pool = personaIds;
        expectedKind = "personas[].id";
        break;
      case "risk":
        pool = riskIds;
        expectedKind = "risks[].id";
        break;
      case "guideword":
      default:
        pool = [...requirementIds, ...riskIds, ...personaIds];
        expectedKind = "requirementIds / risks[].id / personas[].id";
        break;
    }
    // 参照先が未指定（空）の系統は未解決判定をスキップする。
    if (pool.length === 0) continue;
    for (const ref of condition.derivedFrom) {
      if (!pool.includes(ref)) {
        result.push({ conditionId: condition.id, ref, expectedKind });
      }
    }
  }
  return result;
}

export function buildSourceDistribution(
  conditions: TestConditionInput[]
): TestConditionSourceDistributionRow[] {
  return testConditionSources.map((source) => {
    const conditionIds = conditions.filter((c) => c.source === source).map((c) => c.id);
    return { source, count: conditionIds.length, conditionIds };
  });
}

function changeWeight(
  changeCategory: RequirementsChangeCategory | undefined,
  frame: RiskAnalysisFrame
): number {
  if (!changeCategory) return 2;
  const level = frame.changeAxis.levels.find((l) => l.label.startsWith(changeCategory));
  return level ? level.value : 2;
}

export function computeRiskScore(
  impact: number,
  likelihood: number,
  changeCategory?: RequirementsChangeCategory,
  frame: RiskAnalysisFrame = riskAnalysisFrame
): number {
  return impact * likelihood * changeWeight(changeCategory, frame);
}

export function mapRiskScoreToBand(
  score: number,
  frame: RiskAnalysisFrame = riskAnalysisFrame
): RiskLevelBand | undefined {
  return frame.bands.find((b) => score >= b.minScore && score <= b.maxScore);
}

export function evaluateRisks(
  conditions: TestConditionInput[],
  frame: RiskAnalysisFrame = riskAnalysisFrame
): TestConditionRiskEvaluation[] {
  return conditions.map((c) => {
    const hasBoth = typeof c.impact === "number" && typeof c.likelihood === "number";
    if (!hasBoth) {
      return {
        conditionId: c.id,
        declaredPriority: c.priority,
        deviates: false,
        incomplete: true,
      };
    }
    const score = computeRiskScore(c.impact as number, c.likelihood as number, c.changeCategory, frame);
    const band = mapRiskScoreToBand(score, frame);
    const derivedPriority: TestConditionPriority | undefined = band?.priority;
    const declaredPriority = c.priority;
    return {
      conditionId: c.id,
      score,
      bandId: band?.id,
      derivedPriority,
      declaredPriority,
      deviates: Boolean(derivedPriority && declaredPriority && derivedPriority !== declaredPriority),
      incomplete: false,
    };
  });
}
