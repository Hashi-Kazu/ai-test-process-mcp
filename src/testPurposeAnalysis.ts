import { qualityCharacteristicModel } from "./resources/qualityCharacteristics.js";
import { testTypeCatalog } from "./resources/testPlanTemplate.js";
import type {
  DeriveTestPurposesInput,
  QualityCharacteristicModel,
  TestPurposeConditionMatrixRow,
  TestPurposeCoverageResult,
  TestPurposeDerivationSummary,
  TestPurposeDuplicateId,
  TestPurposeIdIssue,
  TestPurposeIdPrefixes,
  TestPurposeOrphanExpectation,
  TestPurposePriorityIssue,
  TestPurposeQualityCharacteristicIssue,
  TestPurposeQualityMatrixRow,
  TestPurposeTestTypeMatrixRow,
  TestPurposeTypeSelectionIssue,
  TestPurposeUngroundedExpectation,
  TestPurposeUnresolvedRef,
  TestRequirementLine,
} from "./types.js";

// derive_test_purposes 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順で決定的。
// 判定区分IDは PDC-01..PDC-17。

export const DEFAULT_TEST_PURPOSE_ID_PREFIXES = {
  expectation: "EXP-",
  testRequirement: "TR-",
  strategy: "ST-",
  purpose: "TP-",
} as const;

type TestPurposeEntityKind = "expectation" | "testRequirement" | "strategy" | "purpose";

const testPurposeEntityKinds: TestPurposeEntityKind[] = [
  "expectation",
  "testRequirement",
  "strategy",
  "purpose",
];

export function resolveTestPurposeIdPrefixes(
  idPrefixes?: TestPurposeIdPrefixes
): Record<TestPurposeEntityKind, string> {
  return {
    expectation: idPrefixes?.expectation ?? DEFAULT_TEST_PURPOSE_ID_PREFIXES.expectation,
    testRequirement: idPrefixes?.testRequirement ?? DEFAULT_TEST_PURPOSE_ID_PREFIXES.testRequirement,
    strategy: idPrefixes?.strategy ?? DEFAULT_TEST_PURPOSE_ID_PREFIXES.strategy,
    purpose: idPrefixes?.purpose ?? DEFAULT_TEST_PURPOSE_ID_PREFIXES.purpose,
  };
}

function idsByKind(input: DeriveTestPurposesInput): Record<TestPurposeEntityKind, string[]> {
  return {
    expectation: input.expectations.map((e) => e.id),
    testRequirement: input.testRequirements.map((r) => r.id),
    strategy: (input.strategyStatements ?? []).map((s) => s.id),
    purpose: input.purposes.map((p) => p.id),
  };
}

// --- PDC-01: 未解決参照 ---
export function findUnresolvedTestPurposeRefs(
  input: DeriveTestPurposesInput
): TestPurposeUnresolvedRef[] {
  const expectationIds = new Set(input.expectations.map((e) => e.id));
  const requirementIds = new Set(input.testRequirements.map((r) => r.id));
  const strategyIds = new Set((input.strategyStatements ?? []).map((s) => s.id));
  const purposeIds = new Set(input.purposes.map((p) => p.id));

  const result: TestPurposeUnresolvedRef[] = [];
  for (const r of input.testRequirements) {
    for (const ref of r.expectationIds ?? []) {
      if (!expectationIds.has(ref)) result.push({ ownerId: r.id, ref, expectedKind: "expectations[].id" });
    }
  }
  for (const p of input.purposes) {
    for (const ref of p.testRequirementIds ?? []) {
      if (!requirementIds.has(ref)) result.push({ ownerId: p.id, ref, expectedKind: "testRequirements[].id" });
    }
    for (const ref of p.strategyIds ?? []) {
      if (!strategyIds.has(ref)) result.push({ ownerId: p.id, ref, expectedKind: "strategyStatements[].id" });
    }
  }
  for (const c of input.testConditions ?? []) {
    for (const ref of c.purposeIds ?? []) {
      if (!purposeIds.has(ref)) result.push({ ownerId: c.id, ref, expectedKind: "purposes[].id" });
    }
  }
  for (const s of input.testTypeSelections ?? []) {
    for (const ref of s.purposeIds ?? []) {
      if (!purposeIds.has(ref)) result.push({ ownerId: s.name, ref, expectedKind: "purposes[].id" });
    }
  }
  return result;
}

// --- PDC-02: ID重複・プレフィックス不一致・欠番 ---
export function findDuplicateTestPurposeIds(input: DeriveTestPurposesInput): TestPurposeDuplicateId[] {
  const all = idsByKind(input);
  const result: TestPurposeDuplicateId[] = [];
  for (const kind of testPurposeEntityKinds) {
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const id of all[kind]) {
      if (!counts.has(id)) order.push(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const id of order) {
      const count = counts.get(id) as number;
      if (count > 1) result.push({ kind, id, count });
    }
  }
  return result;
}

function parseNumberPart(id: string, idPrefix: string): { raw: string; value: number } | undefined {
  if (!id.startsWith(idPrefix)) return undefined;
  const rest = id.slice(idPrefix.length);
  if (!/^\d+$/.test(rest)) return undefined;
  return { raw: rest, value: Number(rest) };
}

export function findPrefixMismatchTestPurposeIds(input: DeriveTestPurposesInput): TestPurposeIdIssue[] {
  const all = idsByKind(input);
  const prefixes = resolveTestPurposeIdPrefixes(input.idPrefixes);
  const result: TestPurposeIdIssue[] = [];
  for (const kind of testPurposeEntityKinds) {
    const expectedPrefix = prefixes[kind];
    for (const id of all[kind]) {
      if (parseNumberPart(id, expectedPrefix)) continue;
      if (result.some((r) => r.kind === kind && r.id === id)) continue;
      result.push({ kind, id, expectedPrefix });
    }
  }
  return result;
}

export function findMissingTestPurposeNumbers(input: DeriveTestPurposesInput): TestPurposeIdIssue[] {
  const all = idsByKind(input);
  const prefixes = resolveTestPurposeIdPrefixes(input.idPrefixes);
  const result: TestPurposeIdIssue[] = [];
  for (const kind of testPurposeEntityKinds) {
    const expectedPrefix = prefixes[kind];
    const parsed = all[kind]
      .map((id) => parseNumberPart(id, expectedPrefix))
      .filter((p): p is { raw: string; value: number } => p !== undefined);
    if (parsed.length === 0) continue;

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
    for (let n = min; n <= max; n++) {
      if (!present.has(n)) {
        result.push({ kind, id: `${expectedPrefix}${String(n).padStart(width, "0")}`, expectedPrefix });
      }
    }
  }
  return result;
}

// --- PDC-03 / PDC-04: 期待 <-> テスト要求の相互紐づけ ---
export function findOrphanExpectations(input: DeriveTestPurposesInput): TestPurposeOrphanExpectation[] {
  const referenced = new Set(input.testRequirements.flatMap((r) => r.expectationIds ?? []));
  return input.expectations
    .filter((e) => !referenced.has(e.id))
    .map((e) => ({ id: e.id, statement: e.statement }));
}

export function findExpectationLessTestRequirements(input: DeriveTestPurposesInput): string[] {
  return input.testRequirements
    .filter((r) => !r.expectationIds || r.expectationIds.length === 0)
    .map((r) => r.id);
}

// --- PDC-05 / PDC-06: テスト要求 <-> テスト目的の相互紐づけ ---
export function findUnusedTestRequirements(input: DeriveTestPurposesInput): string[] {
  const referenced = new Set(input.purposes.flatMap((p) => p.testRequirementIds ?? []));
  return input.testRequirements.filter((r) => !referenced.has(r.id)).map((r) => r.id);
}

export function findRequirementLessPurposes(input: DeriveTestPurposesInput): string[] {
  return input.purposes
    .filter((p) => !p.testRequirementIds || p.testRequirementIds.length === 0)
    .map((p) => p.id);
}

// --- PDC-07: テスト要求の系統欠落 ---
export function findMissingRequirementLines(input: DeriveTestPurposesInput): TestRequirementLine[] {
  const lines = new Set(input.testRequirements.map((r) => r.line));
  const all: TestRequirementLine[] = ["management", "engineering"];
  return all.filter((l) => !lines.has(l));
}

// --- PDC-08 / PDC-09: テスト目的 <-> テスト条件の相互紐づけ ---
export function findPurposeLessConditions(input: DeriveTestPurposesInput): string[] {
  return (input.testConditions ?? [])
    .filter((c) => !c.purposeIds || c.purposeIds.length === 0)
    .map((c) => c.id);
}

export function findConditionLessPurposes(input: DeriveTestPurposesInput): string[] {
  const conditions = input.testConditions ?? [];
  if (conditions.length === 0) return [];
  const referenced = new Set(conditions.flatMap((c) => c.purposeIds ?? []));
  return input.purposes.filter((p) => !referenced.has(p.id)).map((p) => p.id);
}

// --- PDC-10 / PDC-11: テストタイプ選択とテスト目的の相互紐づけ ---
export function findTestTypeSelectionIssues(
  input: DeriveTestPurposesInput
): TestPurposeTypeSelectionIssue[] {
  const result: TestPurposeTypeSelectionIssue[] = [];
  for (const s of input.testTypeSelections ?? []) {
    const hasPurposes = (s.purposeIds ?? []).length > 0;
    const hasReason = (s.reason ?? "").trim() !== "";
    if (s.selected && !hasPurposes) result.push({ name: s.name, kind: "selected-without-purpose" });
    if (s.selected && !hasReason) result.push({ name: s.name, kind: "selected-without-reason" });
    if (!s.selected && hasPurposes) result.push({ name: s.name, kind: "unselected-with-purpose" });
  }
  return result;
}

export function findTestTypeLessPurposes(input: DeriveTestPurposesInput): string[] {
  const selections = input.testTypeSelections ?? [];
  if (selections.length === 0) return [];
  const referenced = new Set(selections.flatMap((s) => s.purposeIds ?? []));
  return input.purposes.filter((p) => !referenced.has(p.id)).map((p) => p.id);
}

// --- PDC-12: 達成判定基準の未記入 ---
export function findPurposesWithoutSuccessCriterion(input: DeriveTestPurposesInput): string[] {
  return input.purposes
    .filter((p) => !p.successCriterion || p.successCriterion.trim() === "")
    .map((p) => p.id);
}

// --- PDC-13: 優先順位の未設定・重複・根拠未記入 ---
export function findPriorityIssues(input: DeriveTestPurposesInput): TestPurposePriorityIssue[] {
  const result: TestPurposePriorityIssue[] = [];
  const rankCounts = new Map<number, number>();
  for (const p of input.purposes) {
    if (typeof p.priorityRank === "number") {
      rankCounts.set(p.priorityRank, (rankCounts.get(p.priorityRank) ?? 0) + 1);
    }
  }
  for (const p of input.purposes) {
    if (typeof p.priorityRank !== "number") {
      result.push({ purposeId: p.id, kind: "missing-rank" });
    } else if ((rankCounts.get(p.priorityRank) ?? 0) > 1) {
      result.push({ purposeId: p.id, kind: "duplicate-rank", rank: p.priorityRank });
    }
    if (!p.priorityRationale || p.priorityRationale.trim() === "") {
      result.push({ purposeId: p.id, kind: "missing-rationale" });
    }
  }
  return result;
}

// --- PDC-14: 品質特性の未割当・未知ID ---
export function findQualityCharacteristicIssues(
  input: DeriveTestPurposesInput,
  model: QualityCharacteristicModel = qualityCharacteristicModel
): TestPurposeQualityCharacteristicIssue[] {
  const knownIds = new Set<string>();
  for (const c of model.characteristics) {
    knownIds.add(c.id);
    for (const s of c.subCharacteristics) knownIds.add(s.id);
  }
  const result: TestPurposeQualityCharacteristicIssue[] = [];
  const conditions = input.testConditions ?? [];
  for (const p of input.purposes) {
    const ownIds = p.relatedQualityCharacteristicIds ?? [];
    const linkedConditionIds = conditions
      .filter((c) => (c.purposeIds ?? []).includes(p.id))
      .flatMap((c) => c.qualityCharacteristicIds ?? []);
    if (ownIds.length === 0 && linkedConditionIds.length === 0) {
      result.push({ ownerId: p.id, kind: "unassigned" });
    }
    for (const id of ownIds) {
      if (!knownIds.has(id)) result.push({ ownerId: p.id, kind: "unknown", characteristicId: id });
    }
  }
  for (const c of conditions) {
    for (const id of c.qualityCharacteristicIds ?? []) {
      if (!knownIds.has(id)) result.push({ ownerId: c.id, kind: "unknown", characteristicId: id });
    }
  }
  return result;
}

// --- PDC-15: 依頼書本文に裏付けの無い期待 ---
export function findUngroundedExpectations(
  input: DeriveTestPurposesInput
): TestPurposeUngroundedExpectation[] {
  const docs = input.requestDocuments;
  if (!docs || docs.length === 0) return [];
  const docsByName = new Map(docs.map((d) => [d.name, d]));
  const result: TestPurposeUngroundedExpectation[] = [];
  for (const e of input.expectations) {
    if (e.sourceRef) {
      const doc = docsByName.get(e.sourceRef.document);
      if (!doc) {
        result.push({ id: e.id, kind: "unknown-document", document: e.sourceRef.document });
        continue;
      }
      const lineCount = doc.content.split("\n").length;
      const endLine = e.sourceRef.endLine ?? e.sourceRef.startLine;
      if (e.sourceRef.startLine > lineCount || endLine > lineCount) {
        result.push({ id: e.id, kind: "line-out-of-range", document: e.sourceRef.document });
      }
      continue;
    }
    const found = docs.some(
      (d) => d.content.includes(e.id) || (e.statement.trim() !== "" && d.content.includes(e.statement))
    );
    if (!found) {
      result.push({ id: e.id, kind: "not-in-documents" });
    }
  }
  return result;
}

// --- PDC-16: 宣言した被覆率と実測値の不一致 ---
export function computeTestPurposeCoverage(input: DeriveTestPurposesInput): TestPurposeCoverageResult {
  const conditions = input.testConditions ?? [];
  const conditionBasis: "available" | "unavailable" = conditions.length > 0 ? "available" : "unavailable";
  let computedPurposeCoveragePercent: number | undefined;
  let purposeCoverageMismatch = false;
  if (conditionBasis === "available") {
    const withPurpose = conditions.filter((c) => (c.purposeIds ?? []).length > 0).length;
    computedPurposeCoveragePercent = Math.round((withPurpose / conditions.length) * 1000) / 10;
    if (input.claimedPurposeCoveragePercent !== undefined) {
      purposeCoverageMismatch =
        Math.abs(input.claimedPurposeCoveragePercent - computedPurposeCoveragePercent) > 0.05;
    }
  } else if (input.claimedPurposeCoveragePercent !== undefined) {
    purposeCoverageMismatch = true;
  }

  const selections = input.testTypeSelections ?? [];
  const selected = selections.filter((s) => s.selected);
  const typeBasis: "available" | "unavailable" = selected.length > 0 ? "available" : "unavailable";
  let computedTestTypeJustificationPercent: number | undefined;
  let testTypeJustificationMismatch = false;
  if (typeBasis === "available") {
    const justified = selected.filter(
      (s) => (s.purposeIds ?? []).length > 0 && (s.reason ?? "").trim() !== ""
    ).length;
    computedTestTypeJustificationPercent = Math.round((justified / selected.length) * 1000) / 10;
    if (input.claimedTestTypeJustificationPercent !== undefined) {
      testTypeJustificationMismatch =
        Math.abs(input.claimedTestTypeJustificationPercent - computedTestTypeJustificationPercent) > 0.05;
    }
  } else if (input.claimedTestTypeJustificationPercent !== undefined) {
    testTypeJustificationMismatch = true;
  }

  return {
    conditionBasis,
    computedPurposeCoveragePercent,
    claimedPurposeCoveragePercent: input.claimedPurposeCoveragePercent,
    purposeCoverageMismatch,
    typeBasis,
    computedTestTypeJustificationPercent,
    claimedTestTypeJustificationPercent: input.claimedTestTypeJustificationPercent,
    testTypeJustificationMismatch,
  };
}

// --- PDC-17: カタログ外のテストタイプ名 ---
export function findUnknownTestTypeNames(
  input: DeriveTestPurposesInput,
  catalog: { name: string; description: string }[] = testTypeCatalog
): string[] {
  const known = new Set(catalog.map((t) => t.name));
  const result: string[] = [];
  for (const s of input.testTypeSelections ?? []) {
    if (!known.has(s.name) && !result.includes(s.name)) result.push(s.name);
  }
  return result;
}

// --- 目的IDの貫通マトリクス ---
export function buildPurposeConditionMatrix(input: DeriveTestPurposesInput): TestPurposeConditionMatrixRow[] {
  const conditions = input.testConditions ?? [];
  return input.purposes.map((p) => ({
    purposeId: p.id,
    statement: p.statement,
    conditionIds: conditions.filter((c) => (c.purposeIds ?? []).includes(p.id)).map((c) => c.id),
  }));
}

export function buildPurposeTestTypeMatrix(input: DeriveTestPurposesInput): TestPurposeTestTypeMatrixRow[] {
  const selections = input.testTypeSelections ?? [];
  return input.purposes.map((p) => ({
    purposeId: p.id,
    typeNames: selections.filter((s) => (s.purposeIds ?? []).includes(p.id)).map((s) => s.name),
  }));
}

export function buildPurposeQualityMatrix(input: DeriveTestPurposesInput): TestPurposeQualityMatrixRow[] {
  const conditions = input.testConditions ?? [];
  return input.purposes.map((p) => {
    const ids: string[] = [];
    for (const id of p.relatedQualityCharacteristicIds ?? []) {
      if (!ids.includes(id)) ids.push(id);
    }
    for (const c of conditions) {
      if (!(c.purposeIds ?? []).includes(p.id)) continue;
      for (const id of c.qualityCharacteristicIds ?? []) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
    return { purposeId: p.id, characteristicIds: ids };
  });
}

export function summarizeTestPurposeDerivation(input: DeriveTestPurposesInput): TestPurposeDerivationSummary {
  const coverage = computeTestPurposeCoverage(input);
  return {
    unresolvedRefCount: findUnresolvedTestPurposeRefs(input).length,
    duplicateIdCount: findDuplicateTestPurposeIds(input).length,
    prefixMismatchCount: findPrefixMismatchTestPurposeIds(input).length,
    missingNumberCount: findMissingTestPurposeNumbers(input).length,
    orphanExpectationCount: findOrphanExpectations(input).length,
    expectationLessRequirementCount: findExpectationLessTestRequirements(input).length,
    unusedRequirementCount: findUnusedTestRequirements(input).length,
    requirementLessPurposeCount: findRequirementLessPurposes(input).length,
    missingRequirementLineCount: findMissingRequirementLines(input).length,
    purposeLessConditionCount: findPurposeLessConditions(input).length,
    conditionLessPurposeCount: findConditionLessPurposes(input).length,
    testTypeSelectionIssueCount: findTestTypeSelectionIssues(input).length,
    testTypeLessPurposeCount: findTestTypeLessPurposes(input).length,
    missingSuccessCriterionCount: findPurposesWithoutSuccessCriterion(input).length,
    priorityIssueCount: findPriorityIssues(input).length,
    qualityCharacteristicIssueCount: findQualityCharacteristicIssues(input).length,
    ungroundedExpectationCount: findUngroundedExpectations(input).length,
    coverageMismatchCount:
      (coverage.purposeCoverageMismatch ? 1 : 0) + (coverage.testTypeJustificationMismatch ? 1 : 0),
    unknownTestTypeNameCount: findUnknownTestTypeNames(input).length,
  };
}
