import { exploratoryCharterCatalog } from "./resources/exploratoryCharterCatalog.js";
import { SUBJECTIVE_EXPECTED_TERMS } from "./testCaseAnalysis.js";
import type {
  ExploratoryCharterCatalog,
  ExploratoryCharterDuplicateId,
  ExploratoryCharterInput,
  ExploratoryCharterSubjectiveFinding,
  ExploratoryCharterTimeboxSummary,
  ExploratoryCharterUnknownAreaRef,
  ExploratoryCharterUnresolvedRef,
  GenerateExploratoryChartersInput,
  TestConditionRiskInput,
} from "./types.js";

// generate_exploratory_charters 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順で決定的。

export const DEFAULT_EXPLORATORY_CHARTER_ID_PREFIX = "EXC-";

export function findDuplicateCharterIds(
  charters: ExploratoryCharterInput[]
): ExploratoryCharterDuplicateId[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const c of charters) {
    if (!counts.has(c.charterId)) order.push(c.charterId);
    counts.set(c.charterId, (counts.get(c.charterId) ?? 0) + 1);
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

export function findPrefixMismatchCharterIds(
  charters: ExploratoryCharterInput[],
  idPrefix: string = DEFAULT_EXPLORATORY_CHARTER_ID_PREFIX
): string[] {
  const result: string[] = [];
  for (const c of charters) {
    if (!parseNumberPart(c.charterId, idPrefix) && !result.includes(c.charterId)) result.push(c.charterId);
  }
  return result;
}

export function findMissingCharterNumbers(
  charters: ExploratoryCharterInput[],
  idPrefix: string = DEFAULT_EXPLORATORY_CHARTER_ID_PREFIX
): string[] {
  const parsed = charters
    .map((c) => parseNumberPart(c.charterId, idPrefix))
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

export function findUnknownCharterAreaIds(
  charters: ExploratoryCharterInput[],
  catalog: ExploratoryCharterCatalog = exploratoryCharterCatalog
): { charterId: string; areaId: string }[] {
  const known = new Set(catalog.charterAreas.map((a) => a.id));
  const result: ExploratoryCharterUnknownAreaRef[] = [];
  for (const c of charters) {
    if (!known.has(c.areaId)) result.push({ charterId: c.charterId, areaId: c.areaId });
  }
  return result;
}

export function findUnresolvedCharterRefs(
  input: GenerateExploratoryChartersInput
): ExploratoryCharterUnresolvedRef[] {
  const charters = input.charters ?? [];
  const conditionIds = new Set(input.testConditions.map((c) => c.id));
  const riskIds = new Set((input.risks ?? []).map((r) => r.id));
  const expectedKind = "testConditions[].id / risks[].id";

  const result: ExploratoryCharterUnresolvedRef[] = [];
  for (const c of charters) {
    for (const ref of c.derivedFrom) {
      if (!conditionIds.has(ref) && !riskIds.has(ref)) {
        result.push({ charterId: c.charterId, ref, expectedKind });
      }
    }
  }
  return result;
}

export function findUnusedCharterAreas(
  charters: ExploratoryCharterInput[],
  catalog: ExploratoryCharterCatalog = exploratoryCharterCatalog,
  areaIds?: string[]
): { id: string; nameJa: string }[] {
  const used = new Set(charters.map((c) => c.areaId));
  const targets =
    areaIds && areaIds.length > 0
      ? catalog.charterAreas.filter((a) => areaIds.includes(a.id))
      : catalog.charterAreas;
  return targets
    .filter((a) => !used.has(a.id))
    .map((a) => ({ id: a.id, nameJa: a.nameJa }));
}

export function findUncoveredHighPriorityConditionIds(
  testConditions: { id: string; priority?: string }[],
  charters: ExploratoryCharterInput[],
  deterministicallyCoveredConditionIds?: string[]
): string[] {
  const referenced = new Set<string>();
  for (const c of charters) {
    for (const ref of c.derivedFrom) referenced.add(ref);
  }
  const covered = new Set(deterministicallyCoveredConditionIds ?? []);
  return testConditions
    .filter((c) => c.priority === "高" && !referenced.has(c.id) && !covered.has(c.id))
    .map((c) => c.id);
}

export function findDeterministicallyCoveredHighPriorityConditionIds(
  testConditions: { id: string; priority?: string }[],
  charters: ExploratoryCharterInput[],
  deterministicallyCoveredConditionIds?: string[]
): string[] {
  const referenced = new Set<string>();
  for (const c of charters) {
    for (const ref of c.derivedFrom) referenced.add(ref);
  }
  const covered = new Set(deterministicallyCoveredConditionIds ?? []);
  return testConditions
    .filter((c) => c.priority === "高" && !referenced.has(c.id) && covered.has(c.id))
    .map((c) => c.id);
}

export function findUnknownDeterministicallyCoveredConditionIds(
  testConditions: { id: string }[],
  deterministicallyCoveredConditionIds?: string[]
): string[] {
  const known = new Set(testConditions.map((c) => c.id));
  const result: string[] = [];
  for (const id of deterministicallyCoveredConditionIds ?? []) {
    if (!known.has(id) && !result.includes(id)) result.push(id);
  }
  return result;
}

export function findUncoveredRiskIds(
  risks: TestConditionRiskInput[],
  charters: ExploratoryCharterInput[]
): string[] {
  const referenced = new Set<string>();
  for (const c of charters) {
    for (const ref of c.derivedFrom) referenced.add(ref);
  }
  return risks.filter((r) => !referenced.has(r.id)).map((r) => r.id);
}

export function findChartersWithoutTimebox(charters: ExploratoryCharterInput[]): string[] {
  return charters.filter((c) => typeof c.timeboxMinutes !== "number").map((c) => c.charterId);
}

export function computeTimeboxSummary(
  charters: ExploratoryCharterInput[],
  sessionBudgetMinutes?: number
): ExploratoryCharterTimeboxSummary {
  const totalMinutes = charters.reduce((sum, c) => sum + (c.timeboxMinutes ?? 0), 0);
  const overBudget =
    typeof sessionBudgetMinutes === "number" && totalMinutes > sessionBudgetMinutes;
  const excessMinutes =
    typeof sessionBudgetMinutes === "number" && totalMinutes > sessionBudgetMinutes
      ? totalMinutes - sessionBudgetMinutes
      : 0;
  return {
    totalMinutes,
    budgetMinutes: sessionBudgetMinutes,
    overBudget,
    excessMinutes,
  };
}

export function findSubjectiveMissionStatements(
  charters: ExploratoryCharterInput[],
  additionalTerms?: string[]
): ExploratoryCharterSubjectiveFinding[] {
  const terms = [...SUBJECTIVE_EXPECTED_TERMS, ...(additionalTerms ?? [])];
  const findings: ExploratoryCharterSubjectiveFinding[] = [];
  for (const c of charters) {
    for (const term of terms) {
      if (c.mission.includes(term)) {
        findings.push({
          charterId: c.charterId,
          severity: "medium",
          term,
          detail: `ミッション文に主観語「${term}」が含まれる。観測可能な具体的な確認内容・操作内容に置き換えること。`,
        });
      }
    }
  }
  return findings;
}
