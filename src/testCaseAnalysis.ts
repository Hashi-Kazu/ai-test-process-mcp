import { computeBoundaryRows } from "./tools/designBoundaryValues.js";
import { listEquivalenceClasses } from "./tools/designEquivalencePartitioning.js";
import { testTechniqueCatalog } from "./resources/testTechniqueCatalog.js";
import { resolveSourceRefs } from "./testConditionAnalysis.js";
import type {
  GenerateTestCasesInput,
  RequirementSourceRef,
  StateTransitionSpec,
  TestBasisSourceRef,
  TestCaseCoverageRow,
  TestCaseCoverageTarget,
  TestCaseDuplicateId,
  TestCaseExpectedFinding,
  TestCaseHardcodedFinding,
  TestCaseParameter,
  TestCaseSourceCondition,
  TestCaseSpec,
  TestCaseStepFinding,
  TestCaseTraceRow,
  TestCaseUnknownTargetRef,
  TestCaseUnresolvedRef,
  TestTechniqueCatalog,
  TestTechniqueId,
} from "./types.js";

// generate_test_cases 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順（または明示したソートキー）で決定的。

export const DEFAULT_TEST_CASE_ID_PREFIX = "TCS-";

export const SUBJECTIVE_EXPECTED_TERMS: string[] = [
  "適切に",
  "正しく",
  "問題なく",
  "きちんと",
  "スムーズに",
  "正常に",
  "うまく",
  "望ましい",
  "十分に",
  "自然に",
];

export const MULTI_ACTION_MARKERS: string[] = [
  "、その後",
  "した後に",
  "してから",
  "および",
  "かつ",
  "＆",
  "and then",
];

// --- 網羅対象ユニバースの構築 ---

export function buildCoverageUniverse(input: GenerateTestCasesInput): TestCaseCoverageTarget[] {
  const targets: TestCaseCoverageTarget[] = [];
  const seen = new Set<string>();

  const push = (target: TestCaseCoverageTarget) => {
    if (seen.has(target.id)) return;
    seen.add(target.id);
    targets.push(target);
  };

  if (input.boundaryVariables && input.boundaryVariables.length > 0) {
    const results = computeBoundaryRows(input.boundaryVariables, input.boundaryMode ?? "three");
    for (const result of results) {
      for (const row of result.rows) {
        const validityText = row.validity === "valid" ? "有効" : "無効";
        push({
          id: `BV:${row.variable}:${row.value}`,
          techniqueId: "boundary-value-analysis",
          description: `${row.label}（${validityText}）`,
          origin: row.variable,
        });
      }
    }
  }

  if (input.equivalenceVariables && input.equivalenceVariables.length > 0) {
    const classes = listEquivalenceClasses(input.equivalenceVariables);
    for (const cls of classes) {
      push({
        id: `EP:${cls.variable}:${cls.label}`,
        techniqueId: "equivalence-partitioning",
        description: `${cls.kind === "valid" ? "有効" : "無効"}クラス「${cls.label}」（代表値: ${cls.representative}）`,
        origin: cls.variable,
      });
    }
  }

  if (input.stateTransition) {
    for (const t of input.stateTransition.transitions) {
      push({
        id: `ST:${t.id}`,
        techniqueId: "state-transition",
        description: `${t.from} --${t.event}${t.guard ? `[${t.guard}]` : ""}--> ${t.to}`,
        origin: t.id,
      });
    }
  }

  for (const t of input.additionalCoverageTargets ?? []) {
    push(t);
  }

  return targets;
}

// --- 網羅率カウント ---

function criterionLabelFor(techniqueId: TestTechniqueId, catalog: TestTechniqueCatalog): string {
  const entry = catalog.entries.find((e) => e.techniqueId === techniqueId);
  return entry && entry.coverageCriteria.length > 0 ? entry.coverageCriteria[0].nameJa : "未定義";
}

export function computeCoverageRows(
  universe: TestCaseCoverageTarget[],
  testCases: TestCaseSpec[],
  catalog: TestTechniqueCatalog = testTechniqueCatalog
): TestCaseCoverageRow[] {
  const coveredIds = new Set<string>();
  for (const c of testCases) {
    for (const id of c.coverageTargets) coveredIds.add(id);
  }

  const order: TestTechniqueId[] = [];
  const byTechnique = new Map<TestTechniqueId, TestCaseCoverageTarget[]>();
  for (const t of universe) {
    if (!byTechnique.has(t.techniqueId)) {
      byTechnique.set(t.techniqueId, []);
      order.push(t.techniqueId);
    }
    (byTechnique.get(t.techniqueId) as TestCaseCoverageTarget[]).push(t);
  }

  return order.map((techniqueId) => {
    const targets = byTechnique.get(techniqueId) as TestCaseCoverageTarget[];
    const total = targets.length;
    const covered = targets.filter((t) => coveredIds.has(t.id)).length;
    const uncovered = total - covered;
    const ratioPercent = total === 0 ? 0 : Math.round((covered / total) * 1000) / 10;
    const uncoveredTargetIds = targets.filter((t) => !coveredIds.has(t.id)).map((t) => t.id);
    return {
      techniqueId,
      criterionLabel: criterionLabelFor(techniqueId, catalog),
      total,
      covered,
      uncovered,
      ratioPercent,
      uncoveredTargetIds,
    };
  });
}

export function findUnknownCoverageTargetRefs(
  universe: TestCaseCoverageTarget[],
  testCases: TestCaseSpec[]
): TestCaseUnknownTargetRef[] {
  const known = new Set(universe.map((t) => t.id));
  const result: TestCaseUnknownTargetRef[] = [];
  for (const c of testCases) {
    for (const targetId of c.coverageTargets) {
      if (!known.has(targetId)) result.push({ caseId: c.caseId, targetId });
    }
  }
  return result;
}

export function findInvalidTransitions(spec: StateTransitionSpec): string[] {
  const stateIds = new Set(spec.states.map((s) => s.id));
  const invalid: string[] = [];
  for (const t of spec.transitions) {
    if (!stateIds.has(t.from) || !stateIds.has(t.to)) {
      invalid.push(t.id);
    }
  }
  return invalid;
}

// --- テスト条件トレーサビリティ ---

export function buildConditionTraceability(
  conditions: TestCaseSourceCondition[],
  testCases: TestCaseSpec[]
): TestCaseTraceRow[] {
  return conditions.map((c) => ({
    conditionId: c.id,
    caseIds: testCases.filter((tc) => tc.testConditionId === c.id).map((tc) => tc.caseId),
  }));
}

export function findUncoveredConditionIds(
  conditions: TestCaseSourceCondition[],
  testCases: TestCaseSpec[]
): string[] {
  return buildConditionTraceability(conditions, testCases)
    .filter((row) => row.caseIds.length === 0)
    .map((row) => row.conditionId);
}

// --- ケースID の重複・欠番・プレフィックス不一致 ---

export function findDuplicateCaseIds(testCases: TestCaseSpec[]): TestCaseDuplicateId[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const c of testCases) {
    if (!counts.has(c.caseId)) order.push(c.caseId);
    counts.set(c.caseId, (counts.get(c.caseId) ?? 0) + 1);
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

export function findPrefixMismatchCaseIds(
  testCases: TestCaseSpec[],
  prefix: string = DEFAULT_TEST_CASE_ID_PREFIX
): string[] {
  const result: string[] = [];
  for (const c of testCases) {
    if (!parseNumberPart(c.caseId, prefix) && !result.includes(c.caseId)) result.push(c.caseId);
  }
  return result;
}

export function findMissingCaseNumbers(
  testCases: TestCaseSpec[],
  prefix: string = DEFAULT_TEST_CASE_ID_PREFIX
): string[] {
  const parsed = testCases
    .map((c) => parseNumberPart(c.caseId, prefix))
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
    if (!present.has(n)) missing.push(`${prefix}${String(n).padStart(width, "0")}`);
  }
  return missing;
}

// --- derivedFrom / testConditionId の未解決参照 ---

export function findUnresolvedCaseRefs(input: GenerateTestCasesInput): TestCaseUnresolvedRef[] {
  const testCases = input.testCases ?? [];
  const conditionIds = new Set(input.testConditions.map((c) => c.id));
  const requirementIds = input.requirementIds;

  const result: TestCaseUnresolvedRef[] = [];
  for (const c of testCases) {
    if (!conditionIds.has(c.testConditionId)) {
      result.push({ caseId: c.caseId, ref: c.testConditionId, expectedKind: "testConditions[].id" });
    }
    if (requirementIds && requirementIds.length > 0) {
      for (const ref of c.derivedFrom) {
        if (!requirementIds.includes(ref)) {
          result.push({ caseId: c.caseId, ref, expectedKind: "requirementIds[]" });
        }
      }
    }
  }
  return result;
}

// --- 期待結果の主観語・空欄検査 ---

export function findSubjectiveExpectedResults(
  testCases: TestCaseSpec[],
  additionalTerms?: string[]
): TestCaseExpectedFinding[] {
  const terms = [...SUBJECTIVE_EXPECTED_TERMS, ...(additionalTerms ?? [])];
  const findings: TestCaseExpectedFinding[] = [];
  for (const c of testCases) {
    for (const step of c.steps) {
      for (const term of terms) {
        if (step.expected.includes(term)) {
          findings.push({
            caseId: c.caseId,
            stepNo: step.no,
            severity: "medium",
            term,
            detail: `期待結果に主観語「${term}」が含まれる。観測可能な具体的な文言・値・画面状態に置き換えること。`,
          });
        }
      }
    }
  }
  return findings;
}

export function findEmptyExpectedResults(testCases: TestCaseSpec[]): TestCaseExpectedFinding[] {
  const findings: TestCaseExpectedFinding[] = [];
  for (const c of testCases) {
    for (const step of c.steps) {
      if (step.expected.trim().length === 0) {
        findings.push({
          caseId: c.caseId,
          stepNo: step.no,
          severity: "high",
          detail: "期待結果が空欄である。手順ごとに観測可能な期待結果を記入すること。",
        });
      }
    }
  }
  return findings;
}

// --- 根拠位置の解決 ---

/**
 * テストケースの根拠位置を優先順で解決する純関数。
 * 1. testCase.sourceRefs
 * 2. testConditionId が一致する条件の resolveSourceRefs(condition, requirementSources)
 * 3. resolveSourceRefs(testCase, requirementSources)（testCase.derivedFrom 経由）
 * 最初に非空になったものを返す。
 */
export function resolveCaseSourceRefs(
  testCase: TestCaseSpec,
  conditions: TestCaseSourceCondition[],
  requirementSources: RequirementSourceRef[] = []
): TestBasisSourceRef[] {
  if (testCase.sourceRefs && testCase.sourceRefs.length > 0) {
    return testCase.sourceRefs.map((r) => ({ ...r }));
  }

  const condition = conditions.find((c) => c.id === testCase.testConditionId);
  if (condition) {
    const fromCondition = resolveSourceRefs(condition, requirementSources);
    if (fromCondition.length > 0) return fromCondition;
  }

  return resolveSourceRefs(testCase, requirementSources);
}

// --- 手順の粒度検査 ---

export function findStepGranularityIssues(testCases: TestCaseSpec[]): TestCaseStepFinding[] {
  const findings: TestCaseStepFinding[] = [];
  for (const c of testCases) {
    let expectedNo = 1;
    for (const step of c.steps) {
      if (step.no !== expectedNo) {
        findings.push({
          caseId: c.caseId,
          stepNo: step.no,
          kind: "number-gap",
          detail: `手順番号が連番でない（期待: ${expectedNo}、実際: ${step.no}）。`,
        });
      }
      expectedNo = step.no + 1;

      if (step.action.trim().length === 0) {
        findings.push({
          caseId: c.caseId,
          stepNo: step.no,
          kind: "empty-action",
          detail: "操作が空欄である。",
        });
      } else {
        for (const marker of MULTI_ACTION_MARKERS) {
          if (step.action.includes(marker)) {
            findings.push({
              caseId: c.caseId,
              stepNo: step.no,
              kind: "multi-action",
              detail: `1手順に複数操作が含まれている疑いがある（「${marker}」を検出）。手順を分割すること。`,
            });
            break;
          }
        }
      }
    }
  }
  return findings;
}

// --- 閾値の直値埋め込み検査 ---

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DIGITS_ONLY = /^\d+$/;

// 数値のみからなるパラメータ値については、前後が数字文字でない位置での完全一致のみを
// 直値埋め込みとみなす（"10" が "1000" の一部として誤検出されないようにするため）。
// p.unit が設定されている場合は、値の直後に unit が続く表記（例 "10人"）または
// 値の直後にコロンが続く時刻風表記（例 "10:00"）に限定してマッチさせる。
function hasHardcodedMatch(text: string, p: TestCaseParameter): boolean {
  if (!DIGITS_ONLY.test(p.value)) {
    return text.includes(p.value);
  }
  const escaped = escapeRegExp(p.value);
  if (p.unit) {
    const withUnit = new RegExp(`(?<!\\d)${escaped}(?:${escapeRegExp(p.unit)}|:)`);
    return withUnit.test(text);
  }
  const boundary = new RegExp(`(?<!\\d)${escaped}(?!\\d)`);
  return boundary.test(text);
}

function collectHardcodedPlaces(
  caseId: string,
  text: string | undefined,
  place: string,
  parameters: TestCaseParameter[],
  findings: TestCaseHardcodedFinding[]
): void {
  if (!text) return;
  for (const p of parameters) {
    if (p.value.trim().length <= 1) continue; // 誤検出が多いため検査対象外
    if (!hasHardcodedMatch(text, p)) continue;
    if (text.includes(p.name)) continue; // 参照名付きの補足表記は許容
    findings.push({ caseId, parameterName: p.name, value: p.value, places: [place] });
  }
}

export function findHardcodedParameterValues(
  testCases: TestCaseSpec[],
  parameters: TestCaseParameter[]
): TestCaseHardcodedFinding[] {
  const findings: TestCaseHardcodedFinding[] = [];
  for (const c of testCases) {
    collectHardcodedPlaces(c.caseId, c.title, "title", parameters, findings);
    c.preconditions.forEach((v, i) => {
      collectHardcodedPlaces(c.caseId, v.value, `preconditions[${i}].value`, parameters, findings);
    });
    (c.postconditions ?? []).forEach((v, i) => {
      collectHardcodedPlaces(c.caseId, v.value, `postconditions[${i}].value`, parameters, findings);
    });
    c.steps.forEach((s, i) => {
      collectHardcodedPlaces(c.caseId, s.action, `steps[${i}].action`, parameters, findings);
      collectHardcodedPlaces(c.caseId, s.expected, `steps[${i}].expected`, parameters, findings);
    });
  }

  // 同一ケース・同一パラメータの検出箇所を1件へ集約する。
  const merged = new Map<string, TestCaseHardcodedFinding>();
  for (const f of findings) {
    const key = `${f.caseId} ${f.parameterName} ${f.value}`;
    const existing = merged.get(key);
    if (existing) {
      existing.places.push(...f.places);
    } else {
      merged.set(key, { ...f, places: [...f.places] });
    }
  }
  return [...merged.values()];
}

// --- 技法推奨 ---

export function recommendTechniques(
  condition: TestCaseSourceCondition,
  catalog: TestTechniqueCatalog = testTechniqueCatalog
): { techniqueIds: TestTechniqueId[]; matchedRowIds: string[] } {
  const basisCharacteristics = condition.basisCharacteristics ?? [];
  const matchedRowIds: string[] = [];
  const techniqueIds: TestTechniqueId[] = [];

  for (const row of catalog.selectionTable) {
    const matches = basisCharacteristics.some(
      (bc) =>
        bc.includes(row.basisCharacteristic) || row.basisCharacteristic.includes(bc)
    );
    if (!matches) continue;
    matchedRowIds.push(row.id);
    for (const t of row.recommendedTechniqueIds) {
      if (!techniqueIds.includes(t)) techniqueIds.push(t);
    }
  }

  return { techniqueIds, matchedRowIds };
}
