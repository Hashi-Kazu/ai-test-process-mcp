import { describe, expect, it } from "vitest";
import {
  buildTestLevelDistribution,
  buildTestSizeDistribution,
  classifyTestSize,
  classifyTestSizes,
  findCrossLevelDuplicates,
  findTestLevelAllocationFindings,
  findUnknownDimensionRefs,
} from "../src/testSizeAnalysis.js";
import type { TestCaseSpec } from "../src/types.js";

function makeCase(overrides: Partial<TestCaseSpec> & { caseId: string }): TestCaseSpec {
  return {
    title: "ケース",
    testConditionId: "TC-001",
    derivedFrom: ["R-001"],
    techniqueId: "boundary-value-analysis",
    coverageTargets: ["BV:枚数:1"],
    preconditions: [{ name: "状態", value: "初期" }],
    steps: [{ no: 1, action: "操作する", expected: "結果が表示される" }],
    ...overrides,
  } as TestCaseSpec;
}

describe("classifyTestSize", () => {
  it("classifies a dependency-free short case as small", () => {
    const row = classifyTestSize(
      makeCase({ caseId: "TCS-001", externalDependencyIds: [], estimatedDurationSeconds: 5 })
    );
    expect(row.classifiedSize).toBe("small");
    expect(row.classifiable).toBe(true);
    expect(row.decidingFactor).toBe("both");
    expect(row.matchedDimensionIds).toEqual([]);
  });

  it("classifies a case with database access as medium", () => {
    const row = classifyTestSize(
      makeCase({ caseId: "TCS-002", externalDependencyIds: ["TSD-02"], estimatedDurationSeconds: 30 })
    );
    expect(row.classifiedSize).toBe("medium");
    expect(row.decidingFactor).toBe("dependency");
    expect(row.matchedDimensionIds).toEqual(["TSD-02"]);
  });

  it("classifies a case with network access as large", () => {
    const row = classifyTestSize(
      makeCase({ caseId: "TCS-003", externalDependencyIds: ["TSD-01", "TSD-03"] })
    );
    expect(row.classifiedSize).toBe("large");
    expect(row.decidingFactor).toBe("dependency");
    expect(row.durationSeconds).toBeUndefined();
  });

  it("escalates size by estimated duration alone", () => {
    const row = classifyTestSize(makeCase({ caseId: "TCS-004", estimatedDurationSeconds: 600 }));
    expect(row.classifiedSize).toBe("large");
    expect(row.decidingFactor).toBe("duration");
    expect(row.classifiable).toBe(true);
  });

  it("takes the larger of dependency-based and duration-based size", () => {
    const depLarger = classifyTestSize(
      makeCase({ caseId: "TCS-005", externalDependencyIds: ["TSD-07"], estimatedDurationSeconds: 10 })
    );
    expect(depLarger.classifiedSize).toBe("large");
    expect(depLarger.decidingFactor).toBe("dependency");

    const durLarger = classifyTestSize(
      makeCase({ caseId: "TCS-006", externalDependencyIds: [], estimatedDurationSeconds: 120 })
    );
    expect(durLarger.classifiedSize).toBe("medium");
    expect(durLarger.decidingFactor).toBe("duration");
  });

  it("marks a case without dependency and duration inputs as unclassifiable", () => {
    const testCases = [makeCase({ caseId: "TCS-007", testLevel: "component-testing" })];
    const rows = classifyTestSizes(testCases);
    expect(rows[0].classifiable).toBe(false);
    expect(rows[0].decidingFactor).toBe("none");
    const findings = findTestLevelAllocationFindings(testCases, rows).filter(
      (f) => f.kind === "missing-classification-input"
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].caseId).toBe("TCS-007");
  });

  it("reports unknown dimension ids without using them for classification", () => {
    const testCases = [
      makeCase({ caseId: "TCS-008", externalDependencyIds: ["TSD-99", "TSD-02"], estimatedDurationSeconds: 10 }),
    ];
    const rows = classifyTestSizes(testCases);
    expect(rows[0].matchedDimensionIds).toEqual(["TSD-02"]);
    expect(rows[0].classifiedSize).toBe("medium");
    expect(findUnknownDimensionRefs(testCases)).toEqual([{ caseId: "TCS-008", dimensionId: "TSD-99" }]);
    const findings = findTestLevelAllocationFindings(testCases, rows).filter(
      (f) => f.kind === "unknown-dimension"
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].detail).toContain("TSD-99");
  });

  it("reports size-declaration-mismatch when declaredTestSize differs from the classified size", () => {
    const testCases = [
      makeCase({
        caseId: "TCS-009",
        externalDependencyIds: ["TSD-01"],
        estimatedDurationSeconds: 30,
        declaredTestSize: "small",
      }),
    ];
    const rows = classifyTestSizes(testCases);
    const findings = findTestLevelAllocationFindings(testCases, rows).filter(
      (f) => f.kind === "size-declaration-mismatch"
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].detail).toContain("ラージ");

    const matched = classifyTestSizes([
      makeCase({ caseId: "TCS-010", externalDependencyIds: [], estimatedDurationSeconds: 5, declaredTestSize: "small" }),
    ]);
    expect(
      findTestLevelAllocationFindings(
        [makeCase({ caseId: "TCS-010", externalDependencyIds: [], estimatedDurationSeconds: 5, declaredTestSize: "small" })],
        matched
      ).filter((f) => f.kind === "size-declaration-mismatch")
    ).toHaveLength(0);
  });

  it("reports level-size-mismatch for a component-testing case classified as large", () => {
    const testCases = [
      makeCase({
        caseId: "TCS-011",
        testLevel: "component-testing",
        externalDependencyIds: ["TSD-01"],
        estimatedDurationSeconds: 20,
      }),
    ];
    const rows = classifyTestSizes(testCases);
    const findings = findTestLevelAllocationFindings(testCases, rows).filter(
      (f) => f.kind === "level-size-mismatch"
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].detail).toContain("TSD-01");
    expect(findings[0].detail).toContain("システムテスト");
  });

  it("does not report level-size-mismatch for an integration-testing case classified as small", () => {
    const testCases = [
      makeCase({
        caseId: "TCS-012",
        testLevel: "integration-testing",
        externalDependencyIds: [],
        estimatedDurationSeconds: 10,
      }),
    ];
    const rows = classifyTestSizes(testCases);
    expect(rows[0].classifiedSize).toBe("small");
    expect(
      findTestLevelAllocationFindings(testCases, rows).filter((f) => f.kind === "level-size-mismatch")
    ).toHaveLength(0);
  });

  it("reports cross-level-duplicate when one coverage target is covered at two test levels", () => {
    const testCases = [
      makeCase({ caseId: "TCS-013", testLevel: "component-testing", coverageTargets: ["BV:枚数:1"] }),
      makeCase({ caseId: "TCS-014", testLevel: "system-testing", coverageTargets: ["BV:枚数:1"] }),
      makeCase({ caseId: "TCS-015", testLevel: "component-testing", coverageTargets: ["BV:枚数:2"] }),
    ];
    const findings = findCrossLevelDuplicates(testCases);
    expect(findings).toHaveLength(1);
    expect(findings[0].caseId).toBe("TCS-013");
    expect(findings[0].kind).toBe("cross-level-duplicate");
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].detail).toContain("BV:枚数:1");
    expect(findings[0].detail).toContain("TCS-014");
  });

  it("computes size distribution shares over classifiable cases only with within/below/above verdicts", () => {
    const testCases = [
      makeCase({ caseId: "TCS-016", externalDependencyIds: [], estimatedDurationSeconds: 5 }),
      makeCase({ caseId: "TCS-017", externalDependencyIds: ["TSD-02"] }),
      makeCase({ caseId: "TCS-018", externalDependencyIds: ["TSD-01"] }),
      makeCase({ caseId: "TCS-019", externalDependencyIds: ["TSD-07"] }),
      makeCase({ caseId: "TCS-020" }), // 判定不可 → 分母から除外
    ];
    const rows = classifyTestSizes(testCases);
    const dist = buildTestSizeDistribution(rows);
    expect(dist.map((d) => d.sizeId)).toEqual(["small", "medium", "large"]);
    expect(dist.map((d) => d.count)).toEqual([1, 1, 2]);
    expect(dist.map((d) => d.sharePercent)).toEqual([25, 25, 50]);
    // small 25% は推奨50〜80%を下回り、medium 25% は15〜35%の範囲内、large 50% は5〜20%を上回る
    expect(dist.map((d) => d.verdict)).toEqual(["below", "within", "above"]);

    const empty = buildTestSizeDistribution([]);
    expect(empty.map((d) => d.count)).toEqual([0, 0, 0]);
    expect(empty.map((d) => d.sharePercent)).toEqual([0, 0, 0]);
    expect(empty.map((d) => d.verdict)).toEqual(["below", "below", "below"]);

    const levelDist = buildTestLevelDistribution(testCases);
    expect(levelDist.map((r) => r.testLevel)).toEqual([
      "component-testing",
      "integration-testing",
      "system-testing",
      "acceptance-testing",
      "未指定",
    ]);
    expect(levelDist[4].count).toBe(5);
    expect(levelDist[4].sharePercent).toBe(100);
  });

  it("returns findings deterministically in the documented kind order", () => {
    const testCases = [
      makeCase({
        caseId: "TCS-021",
        testLevel: "component-testing",
        externalDependencyIds: ["TSD-01", "TSD-XX"],
        estimatedDurationSeconds: 20,
        declaredTestSize: "small",
        coverageTargets: ["BV:枚数:1"],
      }),
      makeCase({ caseId: "TCS-022" }),
      makeCase({ caseId: "TCS-023", testLevel: "system-testing", coverageTargets: ["BV:枚数:1"] }),
    ];
    const rows = classifyTestSizes(testCases);
    const findings = findTestLevelAllocationFindings(testCases, rows);
    expect(findings.map((f) => f.kind)).toEqual([
      "unknown-dimension",
      "missing-classification-input",
      "missing-classification-input",
      "missing-test-level",
      "size-declaration-mismatch",
      "level-size-mismatch",
      "cross-level-duplicate",
    ]);
    expect(findings.map((f) => f.severity)).toEqual([
      "medium",
      "info",
      "info",
      "info",
      "medium",
      "medium",
      "medium",
    ]);
    // 同じ入力で同じ結果（決定的）
    expect(findTestLevelAllocationFindings(testCases, classifyTestSizes(testCases))).toEqual(findings);
  });
});
