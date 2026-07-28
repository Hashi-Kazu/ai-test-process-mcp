import { testSizeClassificationCriteria } from "./resources/testSizeClassificationCriteria.js";
import { jstqbGlossary } from "./resources/jstqbGlossary.js";
import type {
  TestCaseSpec,
  TestLevelAllocationFinding,
  TestLevelDistributionRow,
  TestLevelId,
  TestSizeClassificationCriteria,
  TestSizeClassificationRow,
  TestSizeDecidingFactor,
  TestSizeDistributionRow,
} from "./types.js";

// テストサイズ（外部依存・実行時間）に基づくテストレベル配分の妥当性検査。
// すべて純関数、入力を破壊せず、出力順は入力順で決定的。

const TEST_LEVEL_ORDER: TestLevelId[] = [
  "component-testing",
  "integration-testing",
  "system-testing",
  "acceptance-testing",
];

export function testLevelLabel(levelId: TestLevelId | "未指定"): string {
  if (levelId === "未指定") return "未指定";
  return jstqbGlossary.terms.find((t) => t.id === levelId)?.nameJa ?? levelId;
}

function sizeLabel(sizeId: string, criteria: TestSizeClassificationCriteria): string {
  return criteria.sizes.find((s) => s.sizeId === sizeId)?.nameJa ?? sizeId;
}

function dimensionLabel(dimensionId: string, criteria: TestSizeClassificationCriteria): string {
  const d = criteria.dimensions.find((x) => x.id === dimensionId);
  return d ? `${d.id}(${d.nameJa})` : dimensionId;
}

function isSubset(ids: string[], allowed: string[]): boolean {
  return ids.every((id) => allowed.includes(id));
}

/** 依存軸・実行時間からテストサイズを決定的に分類する。 */
export function classifyTestSize(
  testCase: TestCaseSpec,
  criteria: TestSizeClassificationCriteria = testSizeClassificationCriteria
): TestSizeClassificationRow {
  const lastIndex = criteria.sizes.length - 1;
  const knownIds = criteria.dimensions.map((d) => d.id);
  const matchedDimensionIds = (testCase.externalDependencyIds ?? []).filter((id) => knownIds.includes(id));

  let dependencyIndex: number | undefined;
  if (testCase.externalDependencyIds !== undefined) {
    const found = criteria.sizes.findIndex((s) => isSubset(matchedDimensionIds, s.allowedDimensionIds));
    dependencyIndex = found === -1 ? lastIndex : found;
  }

  let durationIndex: number | undefined;
  const durationSeconds = testCase.estimatedDurationSeconds;
  if (durationSeconds !== undefined) {
    const found = criteria.sizes.findIndex((s) => s.timeLimitSeconds >= durationSeconds);
    durationIndex = found === -1 ? lastIndex : found;
  }

  let classifiedIndex = 0;
  let classifiable = true;
  let decidingFactor: TestSizeDecidingFactor;
  if (dependencyIndex === undefined && durationIndex === undefined) {
    classifiable = false;
    decidingFactor = "none";
  } else if (durationIndex === undefined) {
    classifiedIndex = dependencyIndex as number;
    decidingFactor = "dependency";
  } else if (dependencyIndex === undefined) {
    classifiedIndex = durationIndex;
    decidingFactor = "duration";
  } else if (dependencyIndex > durationIndex) {
    classifiedIndex = dependencyIndex;
    decidingFactor = "dependency";
  } else if (durationIndex > dependencyIndex) {
    classifiedIndex = durationIndex;
    decidingFactor = "duration";
  } else {
    classifiedIndex = dependencyIndex;
    decidingFactor = "both";
  }

  return {
    caseId: testCase.caseId,
    classifiedSize: criteria.sizes[classifiedIndex].sizeId,
    declaredSize: testCase.declaredTestSize,
    testLevel: testCase.testLevel,
    matchedDimensionIds,
    durationSeconds,
    decidingFactor,
    classifiable,
  };
}

export function classifyTestSizes(
  testCases: TestCaseSpec[],
  criteria: TestSizeClassificationCriteria = testSizeClassificationCriteria
): TestSizeClassificationRow[] {
  return testCases.map((c) => classifyTestSize(c, criteria));
}

/** 判定軸カタログに存在しない依存IDの参照を列挙する。 */
export function findUnknownDimensionRefs(
  testCases: TestCaseSpec[],
  criteria: TestSizeClassificationCriteria = testSizeClassificationCriteria
): { caseId: string; dimensionId: string }[] {
  const knownIds = criteria.dimensions.map((d) => d.id);
  const out: { caseId: string; dimensionId: string }[] = [];
  for (const c of testCases) {
    for (const id of c.externalDependencyIds ?? []) {
      if (!knownIds.includes(id)) out.push({ caseId: c.caseId, dimensionId: id });
    }
  }
  return out;
}

/** サイズ構成比。分母は分類が成立したケース数のみ。 */
export function buildTestSizeDistribution(
  rows: TestSizeClassificationRow[],
  criteria: TestSizeClassificationCriteria = testSizeClassificationCriteria
): TestSizeDistributionRow[] {
  const classifiable = rows.filter((r) => r.classifiable);
  const denominator = classifiable.length;
  return criteria.sizes.map((size) => {
    const count = classifiable.filter((r) => r.classifiedSize === size.sizeId).length;
    const sharePercent = denominator === 0 ? 0 : Math.round((count / denominator) * 1000) / 10;
    const { min, max } = size.recommendedSharePercent;
    const verdict: TestSizeDistributionRow["verdict"] =
      denominator === 0 || sharePercent < min ? "below" : sharePercent > max ? "above" : "within";
    return {
      sizeId: size.sizeId,
      count,
      sharePercent,
      recommendedSharePercent: { min, max },
      verdict,
    };
  });
}

/** テストレベル分布。4レベル + 未指定の5行を固定順で返す。 */
export function buildTestLevelDistribution(testCases: TestCaseSpec[]): TestLevelDistributionRow[] {
  const denominator = testCases.length;
  const keys: (TestLevelId | "未指定")[] = [...TEST_LEVEL_ORDER, "未指定"];
  return keys.map((key) => {
    const count =
      key === "未指定"
        ? testCases.filter((c) => c.testLevel === undefined).length
        : testCases.filter((c) => c.testLevel === key).length;
    return {
      testLevel: key,
      count,
      sharePercent: denominator === 0 ? 0 : Math.round((count / denominator) * 1000) / 10,
    };
  });
}

/** 同一の網羅対象が複数のテストレベルで重複して確認されている箇所を検出する。 */
export function findCrossLevelDuplicates(testCases: TestCaseSpec[]): TestLevelAllocationFinding[] {
  const order: string[] = [];
  const byTarget = new Map<string, { caseIds: string[]; levels: TestLevelId[] }>();
  for (const c of testCases) {
    if (c.testLevel === undefined) continue;
    const seen = new Set<string>();
    for (const target of c.coverageTargets) {
      if (seen.has(target)) continue;
      seen.add(target);
      let entry = byTarget.get(target);
      if (!entry) {
        entry = { caseIds: [], levels: [] };
        byTarget.set(target, entry);
        order.push(target);
      }
      entry.caseIds.push(c.caseId);
      if (!entry.levels.includes(c.testLevel)) entry.levels.push(c.testLevel);
    }
  }
  const out: TestLevelAllocationFinding[] = [];
  for (const target of order) {
    const entry = byTarget.get(target)!;
    if (entry.levels.length < 2) continue;
    out.push({
      caseId: entry.caseIds[0],
      kind: "cross-level-duplicate",
      severity: "medium",
      detail:
        `網羅対象「${target}」が ${entry.levels.map((l) => testLevelLabel(l)).join(" / ")} の複数テストレベルで` +
        `重複して確認されている(該当ケース: ${entry.caseIds.join(", ")})。` +
        `どのレベルで確認するのが妥当かを決め、下位レベルへ寄せるか上位レベル側のケースを削減すること。`,
    });
  }
  return out;
}

/** テストレベル配分に関する指摘を、文書化された kind の順序で決定的に生成する。 */
export function findTestLevelAllocationFindings(
  testCases: TestCaseSpec[],
  rows: TestSizeClassificationRow[],
  criteria: TestSizeClassificationCriteria = testSizeClassificationCriteria
): TestLevelAllocationFinding[] {
  const out: TestLevelAllocationFinding[] = [];

  // 1. unknown-dimension
  for (const ref of findUnknownDimensionRefs(testCases, criteria)) {
    out.push({
      caseId: ref.caseId,
      kind: "unknown-dimension",
      severity: "medium",
      detail:
        `外部依存ID「${ref.dimensionId}」は判定軸カタログ(TSD-01〜TSD-${String(criteria.dimensions.length).padStart(2, "0")})に存在しないため` +
        `サイズ判定に使用していない。testdesign://testsize/classification-criteria の判定軸IDへ修正すること。`,
    });
  }

  // 2. missing-classification-input
  for (const row of rows) {
    if (row.classifiable) continue;
    out.push({
      caseId: row.caseId,
      kind: "missing-classification-input",
      severity: "info",
      detail:
        `externalDependencyIds と estimatedDurationSeconds のいずれも未指定のためテストサイズを判定できない(判定不可)。` +
        `外部依存の該当軸(無依存なら空配列)か想定実行時間(秒)を申告すること。`,
    });
  }

  // 3. missing-test-level
  for (const c of testCases) {
    if (c.testLevel !== undefined) continue;
    out.push({
      caseId: c.caseId,
      kind: "missing-test-level",
      severity: "info",
      detail:
        `testLevel が未指定のため、サイズ判定結果との整合を確認できない。` +
        `コンポーネント/統合/システム/受け入れのいずれのテストレベルで実施するケースかを申告すること。`,
    });
  }

  // 4. size-declaration-mismatch
  for (const row of rows) {
    if (!row.classifiable || row.declaredSize === undefined) continue;
    if (row.declaredSize === row.classifiedSize) continue;
    out.push({
      caseId: row.caseId,
      kind: "size-declaration-mismatch",
      severity: "medium",
      detail:
        `宣言サイズ「${sizeLabel(row.declaredSize, criteria)}」に対し、${describeDecidingBasis(row, criteria)}` +
        `「${sizeLabel(row.classifiedSize, criteria)}」に分類される。宣言サイズを判定結果へ合わせるか、` +
        `依存をスタブ化・実行時間を短縮してサイズを縮小すること。`,
    });
  }

  // 5. level-size-mismatch
  for (const row of rows) {
    if (!row.classifiable || row.testLevel === undefined) continue;
    const size = criteria.sizes.find((s) => s.sizeId === row.classifiedSize);
    if (!size || size.acceptableTestLevelIds.includes(row.testLevel)) continue;
    out.push({
      caseId: row.caseId,
      kind: "level-size-mismatch",
      severity: "medium",
      detail:
        `宣言テストレベル「${testLevelLabel(row.testLevel)}」に対し、${describeDecidingBasis(row, criteria)}` +
        `「${size.nameJa}」に分類される。このサイズで妥当なテストレベルは ` +
        `${size.acceptableTestLevelIds.map((l) => testLevelLabel(l)).join(" / ")} である。` +
        `テストレベルの宣言を見直すか、依存をスタブ化して(または実行時間を短縮して)サイズを縮小すること。`,
    });
  }

  // 6. cross-level-duplicate
  for (const f of findCrossLevelDuplicates(testCases)) out.push(f);

  return out;
}

function describeDecidingBasis(
  row: TestSizeClassificationRow,
  criteria: TestSizeClassificationCriteria
): string {
  const dims =
    row.matchedDimensionIds.length > 0
      ? `判定軸 ${row.matchedDimensionIds.map((id) => dimensionLabel(id, criteria)).join(", ")}`
      : "外部依存なし";
  const duration = row.durationSeconds !== undefined ? `想定実行時間 ${row.durationSeconds}秒` : undefined;
  switch (row.decidingFactor) {
    case "dependency":
      return `${dims} により`;
    case "duration":
      return `${duration ?? "想定実行時間"} により`;
    case "both":
      return `${dims}・${duration ?? "想定実行時間"} により`;
    default:
      return "判定入力なしのため既定で";
  }
}
