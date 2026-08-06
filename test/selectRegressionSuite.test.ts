import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import {
  DEFAULT_MAX_REGRESSION_ITEMS,
  computeRegressionSuite,
  renderRegressionSuite,
} from "../src/tools/selectRegressionSuite.js";
import type { RegressionSelectionSpec } from "../src/types.js";

function baseSpec(): RegressionSelectionSpec {
  return {
    suiteId: "REG-1",
    title: "決済機能リグレッション",
    testConditions: [
      { id: "TC-01", statement: "決済確定", changeCategory: "modified", impact: 5, likelihood: 5 },
      { id: "TC-02", statement: "領収書発行", changeCategory: "existing-unaffected", impact: 1, likelihood: 1 },
      { id: "TC-03", statement: "クーポン適用", changeCategory: "existing-impacted", impact: 3, likelihood: 3 },
    ],
    testCases: [
      { caseId: "TCS-01", title: "決済確定ケース", testConditionId: "TC-01", externalDependencyIds: [], estimatedDurationSeconds: 10 },
      { caseId: "TCS-02", title: "領収書発行ケース", testConditionId: "TC-02", externalDependencyIds: [], estimatedDurationSeconds: 5 },
      { caseId: "TCS-03", title: "クーポン適用ケース", testConditionId: "TC-03", externalDependencyIds: [], estimatedDurationSeconds: 8 },
    ],
    selectionCriteria: [{ id: "SC-01", statement: "リスクが高い条件を残す", axis: "risk" }],
    selections: [
      { itemKind: "condition", itemId: "TC-01", decision: "include", reason: "高リスクのため残す", criterionIds: ["SC-01"] },
      { itemKind: "condition", itemId: "TC-02", decision: "exclude", reason: "影響なしのため落とす" },
      { itemKind: "condition", itemId: "TC-03", decision: "include", reason: "影響範囲のため残す" },
      { itemKind: "case", itemId: "TCS-01", decision: "include", reason: "高リスクのため残す" },
      { itemKind: "case", itemId: "TCS-02", decision: "exclude", reason: "影響なしのため落とす" },
      { itemKind: "case", itemId: "TCS-03", decision: "include", reason: "影響範囲のため残す" },
    ],
  };
}

describe("computeRegressionSuite", () => {
  it("returns the same result (including array order) for the same input", () => {
    const spec = baseSpec();
    const r1 = computeRegressionSuite(spec);
    const r2 = computeRegressionSuite(spec);
    expect(r1).toEqual(r2);
    expect(r1.items.map((i) => i.itemId)).toEqual(r2.items.map((i) => i.itemId));
  });

  it("reports RSC-01[high] when a selection references an id outside the population", () => {
    const spec: RegressionSelectionSpec = {
      ...baseSpec(),
      selections: [
        ...baseSpec().selections!,
        { itemKind: "condition", itemId: "TC-99", decision: "include", reason: "存在しない条件" },
      ],
    };
    const result = computeRegressionSuite(spec);
    const f = result.findings.filter((x) => x.categoryId === "RSC-01");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("high");
  });

  it("reports RSC-03[high] when reason is missing or blank", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [{ id: "TC-01", statement: "x", changeCategory: "modified" }],
      selections: [
        { itemKind: "condition", itemId: "TC-01", decision: "include", reason: "   " },
      ],
    };
    const result = computeRegressionSuite(spec);
    const f = result.findings.filter((x) => x.categoryId === "RSC-03");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("high");
  });

  it("reports RSC-04[high] for excluded high-risk items and lists them in excludedHighRiskItems", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [
        { id: "TC-01", statement: "高リスク条件", changeCategory: "modified", impact: 5, likelihood: 5 },
      ],
      selections: [{ itemKind: "condition", itemId: "TC-01", decision: "exclude", reason: "落とす" }],
    };
    const result = computeRegressionSuite(spec);
    const f = result.findings.filter((x) => x.categoryId === "RSC-04");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("high");
    expect(result.excludedHighRiskItems.map((i) => i.itemId)).toEqual(["TC-01"]);
  });

  it("reports RSC-05[high] for population items absent from selections", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [{ id: "TC-01", statement: "x", changeCategory: "modified" }],
    };
    const result = computeRegressionSuite(spec);
    const f = result.findings.filter((x) => x.categoryId === "RSC-05");
    expect(f).toHaveLength(1);
    expect(result.undecidedItems.map((i) => i.itemId)).toEqual(["TC-01"]);
  });

  it("reports RSC-06[high] for undeclared changeCategory and makes coverage unavailable", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [
        { id: "TC-01", statement: "未宣言", impact: 3, likelihood: 3 },
        { id: "TC-02", statement: "宣言済み", changeCategory: "modified" },
      ],
      selections: [
        { itemKind: "condition", itemId: "TC-01", decision: "include", reason: "残す" },
        { itemKind: "condition", itemId: "TC-02", decision: "include", reason: "残す" },
      ],
    };
    const result = computeRegressionSuite(spec);
    expect(result.findings.some((f) => f.categoryId === "RSC-06" && f.severity === "high")).toBe(true);
    expect(result.coverage.basis).toBe("unavailable");
    expect(result.coverage.percent).toBeUndefined();
  });

  it("reports RSC-07[medium] when an existing-unaffected item is selected", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [{ id: "TC-01", statement: "無影響", changeCategory: "existing-unaffected" }],
      selections: [{ itemKind: "condition", itemId: "TC-01", decision: "include", reason: "念のため残す" }],
    };
    const result = computeRegressionSuite(spec);
    const f = result.findings.filter((x) => x.categoryId === "RSC-07");
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("medium");
  });

  it("reports RSC-09[high] for previous items dropped without a removal reason, and RSC-10[high] for a removal reason on a kept item", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [
        { id: "TC-01", statement: "残す", changeCategory: "modified" },
        { id: "TC-02", statement: "落とす", changeCategory: "modified" },
      ],
      selections: [
        { itemKind: "condition", itemId: "TC-01", decision: "include", reason: "残す" },
        { itemKind: "condition", itemId: "TC-02", decision: "exclude", reason: "落とす" },
      ],
      previousSuite: { items: [{ itemKind: "condition", itemId: "TC-01" }, { itemKind: "condition", itemId: "TC-02" }] },
      removalReasons: [{ itemKind: "condition", itemId: "TC-01", reason: "実は削除されていない項目への宣言" }],
    };
    const result = computeRegressionSuite(spec);
    expect(result.findings.some((f) => f.categoryId === "RSC-09" && f.severity === "high" && f.target === "TC-02")).toBe(
      true
    );
    expect(result.findings.some((f) => f.categoryId === "RSC-10" && f.severity === "high")).toBe(true);
  });

  it("classifies added/removed/kept in population order when previousSuite is given", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [
        { id: "TC-01", statement: "維持", changeCategory: "modified" },
        { id: "TC-02", statement: "追加", changeCategory: "modified" },
        { id: "TC-03", statement: "削除される", changeCategory: "modified" },
      ],
      selections: [
        { itemKind: "condition", itemId: "TC-01", decision: "include", reason: "維持" },
        { itemKind: "condition", itemId: "TC-02", decision: "include", reason: "新規追加" },
        { itemKind: "condition", itemId: "TC-03", decision: "exclude", reason: "落とす" },
      ],
      previousSuite: {
        items: [{ itemKind: "condition", itemId: "TC-01" }, { itemKind: "condition", itemId: "TC-03" }],
      },
      removalReasons: [{ itemKind: "condition", itemId: "TC-03", reason: "重複のため" }],
    };
    const result = computeRegressionSuite(spec);
    expect(result.diff).toBeDefined();
    expect(result.diff!.map((d) => ({ id: d.itemId, kind: d.kind }))).toEqual([
      { id: "TC-01", kind: "kept" },
      { id: "TC-02", kind: "added" },
      { id: "TC-03", kind: "removed" },
    ]);
  });

  it("reports RSC-12[medium] for large-test overweight and RSC-13[medium] for time budget overrun", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [{ id: "TC-01", statement: "x", changeCategory: "modified" }],
      testCases: [
        {
          caseId: "TCS-01",
          testConditionId: "TC-01",
          externalDependencyIds: ["TSD-01", "TSD-06", "TSD-07"],
          estimatedDurationSeconds: 2000,
        },
      ],
      selections: [
        { itemKind: "condition", itemId: "TC-01", decision: "include", reason: "残す" },
        { itemKind: "case", itemId: "TCS-01", decision: "include", reason: "残す" },
      ],
      executionTimeBudgetSeconds: 100,
    };
    const result = computeRegressionSuite(spec);
    expect(result.findings.some((f) => f.categoryId === "RSC-12" && f.severity === "medium")).toBe(true);
    expect(result.findings.some((f) => f.categoryId === "RSC-13" && f.severity === "medium")).toBe(true);
    expect(result.budgetVerdict).toBe("over");
  });

  it("reports RSC-15[high] for a coverage claim mismatch and for an unavailable claim", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [{ id: "TC-01", statement: "x", changeCategory: "modified" }],
      selections: [{ itemKind: "condition", itemId: "TC-01", decision: "include", reason: "残す" }],
      claimedImpactScopeCoveragePercent: 50,
    };
    const result = computeRegressionSuite(spec);
    expect(result.coverage.basis).toBe("declared-only");
    expect(result.coverage.percent).toBe(100);
    expect(result.findings.some((f) => f.categoryId === "RSC-15" && f.severity === "high")).toBe(true);

    const unavailableSpec: RegressionSelectionSpec = {
      testConditions: [{ id: "TC-01", statement: "x" }],
      selections: [{ itemKind: "condition", itemId: "TC-01", decision: "include", reason: "残す" }],
      claimedImpactScopeCoveragePercent: 50,
    };
    const unavailableResult = computeRegressionSuite(unavailableSpec);
    expect(unavailableResult.coverage.basis).toBe("unavailable");
    expect(unavailableResult.findings.some((f) => f.categoryId === "RSC-15" && f.severity === "high")).toBe(true);
  });

  it("reports RSC-17[high] and excludes the condition from the coverage numerator when no case backs a selected condition", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [
        { id: "TC-01", statement: "ケースあり", changeCategory: "modified" },
        { id: "TC-02", statement: "ケースなし", changeCategory: "modified" },
      ],
      testCases: [{ caseId: "TCS-01", testConditionId: "TC-01" }],
      selections: [
        { itemKind: "condition", itemId: "TC-01", decision: "include", reason: "残す" },
        { itemKind: "condition", itemId: "TC-02", decision: "include", reason: "残す" },
        { itemKind: "case", itemId: "TCS-01", decision: "include", reason: "残す" },
      ],
    };
    const result = computeRegressionSuite(spec);
    expect(result.findings.some((f) => f.categoryId === "RSC-17" && f.severity === "high" && f.target === "TC-02")).toBe(
      true
    );
    expect(result.coverage.basis).toBe("declared-only");
    expect(result.coverage.numerator).toBe(1);
    expect(result.coverage.denominator).toBe(2);
  });

  it("reports RSC-21[high] when a condition computed as impacted is declared existing-unaffected", () => {
    const spec: RegressionSelectionSpec = {
      suiteId: "REG-1",
      testConditions: [
        { id: "TC-01", statement: "決済確定", changeCategory: "modified" },
        { id: "TC-02", statement: "手数料計算", changeCategory: "existing-unaffected" },
      ],
      testCases: [
        { caseId: "TCS-01", testConditionId: "TC-01" },
        { caseId: "TCS-02", testConditionId: "TC-02" },
      ],
      selections: [
        { itemKind: "condition", itemId: "TC-01", decision: "include", reason: "変更対象のため残す" },
        { itemKind: "condition", itemId: "TC-02", decision: "exclude", reason: "影響なしのため落とす" },
        { itemKind: "case", itemId: "TCS-01", decision: "include", reason: "残す" },
        { itemKind: "case", itemId: "TCS-02", decision: "exclude", reason: "落とす" },
      ],
      computedImpactVerdicts: [
        { ownerKind: "testCondition", ownerId: "TC-01", verdict: "要修正" },
        { ownerKind: "testCondition", ownerId: "TC-02", verdict: "要修正" },
        { ownerKind: "testCase", ownerId: "TCS-01", verdict: "要修正" },
        { ownerKind: "testCase", ownerId: "TCS-02", verdict: "要修正" },
      ],
      claimedImpactScopeCoveragePercent: 100,
    };
    const result = computeRegressionSuite(spec);
    const rsc21 = result.findings.filter((f) => f.categoryId === "RSC-21");
    expect(rsc21).toHaveLength(1);
    expect(rsc21[0].severity).toBe("high");
    expect(rsc21[0].target).toBe("TC-02");

    const rsc22 = result.findings.filter((f) => f.categoryId === "RSC-22");
    expect(rsc22).toHaveLength(1);
    expect(rsc22[0].severity).toBe("high");
    expect(rsc22[0].target).toBe("TCS-02");

    expect(result.coverage.basis).toBe("computed");
    expect(result.coverage.denominator).toBe(2);
    expect(result.coverage.declaredOnlyDenominator).toBe(1);
    expect(result.coverage.numerator).toBe(1);
    expect(result.coverage.percent).toBe(50);

    expect(result.findings.some((f) => f.categoryId === "RSC-15" && f.severity === "high")).toBe(true);

    const rendered = renderRegressionSuite(spec);
    expect(rendered).toContain("算出根拠(basis): computed");
    expect(rendered).toContain("実体照合: 実施済み");
  });

  it("reports RSC-23[medium] when a condition computed as unaffected is declared modified", () => {
    const spec: RegressionSelectionSpec = {
      suiteId: "REG-1",
      testConditions: [{ id: "TC-01", statement: "決済確定", changeCategory: "modified" }],
      selections: [{ itemKind: "condition", itemId: "TC-01", decision: "include", reason: "残す" }],
      computedImpactVerdicts: [{ ownerKind: "testCondition", ownerId: "TC-01", verdict: "影響なし" }],
    };
    const result = computeRegressionSuite(spec);
    const rsc23 = result.findings.filter((f) => f.categoryId === "RSC-23");
    expect(rsc23).toHaveLength(1);
    expect(rsc23[0].severity).toBe("medium");
    expect(result.findings.filter((f) => f.categoryId === "RSC-21")).toHaveLength(0);
  });

  it("reports RSC-24[medium] for out-of-population and duplicated impact verdicts and honors the last declaration", () => {
    const spec: RegressionSelectionSpec = {
      suiteId: "REG-1",
      testConditions: [{ id: "TC-01", statement: "決済確定", changeCategory: "existing-unaffected" }],
      selections: [{ itemKind: "condition", itemId: "TC-01", decision: "exclude", reason: "落とす" }],
      computedImpactVerdicts: [
        { ownerKind: "testCondition", ownerId: "TC-99", verdict: "要修正" },
        { ownerKind: "testCondition", ownerId: "TC-01", verdict: "影響なし" },
        { ownerKind: "testCondition", ownerId: "TC-01", verdict: "要修正" },
      ],
    };
    const result = computeRegressionSuite(spec);
    const rsc24 = result.findings.filter((f) => f.categoryId === "RSC-24");
    expect(rsc24).toHaveLength(2);
    // last declaration (要修正) is effective, so TC-01 counts as impacted and is included in the denominator.
    expect(result.coverage.basis).toBe("computed");
    expect(result.coverage.denominator).toBe(1);
    // and since TC-01 is now impacted-but-declared-existing-unaffected, RSC-21 should fire.
    expect(result.findings.some((f) => f.categoryId === "RSC-21" && f.target === "TC-01")).toBe(true);
  });

  it("reports RSC-25[info] and marks coverage as declared-only when computedImpactVerdicts is absent", () => {
    const spec: RegressionSelectionSpec = {
      suiteId: "REG-1",
      testConditions: [{ id: "TC-01", statement: "決済確定", changeCategory: "modified" }],
      selections: [{ itemKind: "condition", itemId: "TC-01", decision: "include", reason: "残す" }],
    };
    const result = computeRegressionSuite(spec);
    const rsc25 = result.findings.filter((f) => f.categoryId === "RSC-25");
    expect(rsc25).toHaveLength(1);
    expect(rsc25[0].severity).toBe("info");
    expect(result.coverage.basis).toBe("declared-only");
    expect(result.coverage.reason).toBeTruthy();

    const rendered = renderRegressionSuite(spec);
    expect(rendered).toContain("算出根拠(basis): declared-only");
    expect(rendered).toContain("実体照合: 未実施");
  });

  it("keeps coverage unavailable and does not emit impact-verdict findings when the population exceeds maxItems", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [
        { id: "TC-01", statement: "a", changeCategory: "modified" },
        { id: "TC-02", statement: "b", changeCategory: "modified" },
      ],
      maxItems: 1,
      computedImpactVerdicts: [{ ownerKind: "testCondition", ownerId: "TC-01", verdict: "要修正" }],
    };
    const result = computeRegressionSuite(spec);
    expect(result.findings.filter((f) => f.categoryId === "RSC-20")).toHaveLength(1);
    expect(result.findings.filter((f) => f.categoryId === "RSC-20")[0].severity).toBe("info");
    for (const id of ["RSC-21", "RSC-22", "RSC-23", "RSC-24", "RSC-25"]) {
      expect(result.findings.filter((f) => f.categoryId === id)).toHaveLength(0);
    }
    expect(result.coverage.basis).toBe("unavailable");
  });

  it("returns the same result (including array order) for the same input with computedImpactVerdicts", () => {
    const spec: RegressionSelectionSpec = {
      suiteId: "REG-1",
      testConditions: [
        { id: "TC-01", statement: "決済確定", changeCategory: "modified" },
        { id: "TC-02", statement: "手数料計算", changeCategory: "existing-unaffected" },
      ],
      testCases: [
        { caseId: "TCS-01", testConditionId: "TC-01" },
        { caseId: "TCS-02", testConditionId: "TC-02" },
      ],
      selections: [
        { itemKind: "condition", itemId: "TC-01", decision: "include", reason: "変更対象のため残す" },
        { itemKind: "condition", itemId: "TC-02", decision: "exclude", reason: "影響なしのため落とす" },
        { itemKind: "case", itemId: "TCS-01", decision: "include", reason: "残す" },
        { itemKind: "case", itemId: "TCS-02", decision: "exclude", reason: "落とす" },
      ],
      computedImpactVerdicts: [
        { ownerKind: "testCondition", ownerId: "TC-01", verdict: "要修正" },
        { ownerKind: "testCondition", ownerId: "TC-02", verdict: "要修正" },
        { ownerKind: "testCase", ownerId: "TCS-01", verdict: "要修正" },
        { ownerKind: "testCase", ownerId: "TCS-02", verdict: "要修正" },
      ],
    };
    const r1 = computeRegressionSuite(spec);
    const r2 = computeRegressionSuite(spec);
    expect(r1).toEqual(r2);
    expect(r1.findings.map((f) => `${f.categoryId}:${f.target}`)).toEqual(
      r2.findings.map((f) => `${f.categoryId}:${f.target}`)
    );
  });

  it("does not generate rows when the population exceeds maxItems", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [
        { id: "TC-01", statement: "a" },
        { id: "TC-02", statement: "b" },
        { id: "TC-03", statement: "c" },
      ],
      maxItems: 2,
    };
    const result = computeRegressionSuite(spec);
    expect(result.generated).toBe(false);
    expect(result.skipReason).toBeDefined();
    expect(result.findings.some((f) => f.categoryId === "RSC-20" && f.severity === "info")).toBe(true);
  });

  it("uses DEFAULT_MAX_REGRESSION_ITEMS as the default cap", () => {
    expect(DEFAULT_MAX_REGRESSION_ITEMS).toBeGreaterThan(0);
  });
});

describe("renderRegressionSuite", () => {
  it("includes all 11 section headings and ends with exactly one trailing newline", () => {
    const text = renderRegressionSuite(baseSpec());
    for (let i = 1; i <= 11; i++) {
      expect(text).toContain(`## ${i}.`);
    }
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("renders an unavailable marker for every section when the population exceeds maxItems", () => {
    const spec: RegressionSelectionSpec = {
      testConditions: [{ id: "TC-01", statement: "a" }, { id: "TC-02", statement: "b" }],
      maxItems: 1,
    };
    const text = renderRegressionSuite(spec);
    expect(text).toContain("- 未算出(理由:");
  });
});

describe("renderRegressionSuite 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderRegressionSuite(baseSpec()));
  });
});
