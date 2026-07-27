import { describe, expect, it } from "vitest";
import {
  buildRequirementCoverageMatrix,
  buildRiskCategoryDistribution,
  buildSourceDistribution,
  computeRiskScore,
  evaluateRisks,
  findConditionsWithoutPriority,
  findDuplicateConditionIds,
  findMissingConditionNumbers,
  findPrefixMismatchConditionIds,
  findUncoveredRequirementIds,
  findUnknownRiskCategoryIds,
  findUnresolvedDerivedFromRefs,
  findUnusedPerspectiveCategories,
  findUnusedRiskCategories,
  mapRiskScoreToBand,
} from "../src/testConditionAnalysis.js";
import { riskAnalysisFrame } from "../src/resources/riskAnalysisFrame.js";
import type {
  ExtractTestConditionsInput,
  TestConditionInput,
  TestConditionRiskInput,
} from "../src/types.js";

function risk(overrides: Partial<TestConditionRiskInput> & { id: string }): TestConditionRiskInput {
  return {
    description: "リスク内容",
    ...overrides,
  };
}

function condition(overrides: Partial<TestConditionInput> & { id: string }): TestConditionInput {
  return {
    target: "F-001",
    perspectiveCategoryId: "TPC-01",
    statement: "条件文",
    source: "testbase",
    derivedFrom: ["R-001"],
    ...overrides,
  };
}

describe("computeRiskScore / mapRiskScoreToBand", () => {
  it("maps boundary scores to the expected bands", () => {
    expect(computeRiskScore(5, 5, "new")).toBe(75);
    expect(mapRiskScoreToBand(75)?.id).toBe("R1");

    expect(computeRiskScore(5, 3, "existing-unaffected")).toBe(15);
    expect(mapRiskScoreToBand(15)?.id).toBe("R2");

    expect(computeRiskScore(2, 3, "existing-unaffected")).toBe(6);
    expect(mapRiskScoreToBand(6)?.id).toBe("R3");

    expect(computeRiskScore(1, 5, "existing-unaffected")).toBe(5);
    expect(mapRiskScoreToBand(5)?.id).toBe("R4");
  });

  it("uses changeWeight 2 when changeCategory is omitted", () => {
    expect(computeRiskScore(3, 2)).toBe(12);
  });

  it("treats modified and new with the same weight", () => {
    expect(computeRiskScore(2, 2, "modified")).toBe(computeRiskScore(2, 2, "new"));
  });
});

describe("buildRequirementCoverageMatrix / findUncoveredRequirementIds", () => {
  it("matches derivedFrom by exact equality only", () => {
    const conditions = [
      condition({ id: "TC-001", derivedFrom: ["R-0011"] }),
      condition({ id: "TC-002", derivedFrom: ["R-002"] }),
    ];
    const matrix = buildRequirementCoverageMatrix(["R-001", "R-002"], conditions);
    expect(matrix).toEqual([
      { requirementId: "R-001", conditionIds: [] },
      { requirementId: "R-002", conditionIds: ["TC-002"] },
    ]);
    expect(findUncoveredRequirementIds(["R-001", "R-002"], conditions)).toEqual(["R-001"]);
  });
});

describe("findMissingConditionNumbers / findPrefixMismatchConditionIds", () => {
  it("returns zero-padded missing numbers within the observed range", () => {
    const conditions = [condition({ id: "TC-001" }), condition({ id: "TC-002" }), condition({ id: "TC-005" })];
    expect(findMissingConditionNumbers(conditions)).toEqual(["TC-003", "TC-004"]);
  });

  it("ignores ids that do not match the prefix", () => {
    const conditions = [condition({ id: "TC-001" }), condition({ id: "X-9" }), condition({ id: "TC-003" })];
    expect(findMissingConditionNumbers(conditions)).toEqual(["TC-002"]);
    expect(findPrefixMismatchConditionIds(conditions)).toEqual(["X-9"]);
  });

  it("honors a custom prefix", () => {
    const conditions = [condition({ id: "COND-01" }), condition({ id: "COND-03" })];
    expect(findMissingConditionNumbers(conditions, "COND-")).toEqual(["COND-02"]);
  });
});

describe("findDuplicateConditionIds", () => {
  it("reports duplicated ids with counts in first-appearance order", () => {
    const conditions = [
      condition({ id: "TC-001" }),
      condition({ id: "TC-002" }),
      condition({ id: "TC-001" }),
    ];
    expect(findDuplicateConditionIds(conditions)).toEqual([{ id: "TC-001", count: 2 }]);
  });
});

describe("findUnusedPerspectiveCategories", () => {
  it("respects the perspectiveCategoryIds filter", () => {
    const conditions = [condition({ id: "TC-001", perspectiveCategoryId: "TPC-01" })];
    const filtered = findUnusedPerspectiveCategories(conditions, undefined, ["TPC-01", "TPC-03"]);
    expect(filtered.map((c) => c.id)).toEqual(["TPC-03"]);

    const all = findUnusedPerspectiveCategories(conditions);
    expect(all.length).toBe(17);
    expect(all.map((c) => c.id)).not.toContain("TPC-01");
  });
});

describe("findConditionsWithoutPriority", () => {
  it("returns conditions without a declared priority", () => {
    const conditions = [condition({ id: "TC-001", priority: "高" }), condition({ id: "TC-002" })];
    expect(findConditionsWithoutPriority(conditions).map((c) => c.id)).toEqual(["TC-002"]);
  });
});

describe("findUnresolvedDerivedFromRefs", () => {
  it("switches the reference pool by source and skips unspecified pools", () => {
    const input: ExtractTestConditionsInput = {
      requirementIds: ["R-001"],
      personas: [{ id: "P-001", role: "利用者" }],
      testConditions: [
        condition({ id: "TC-001", source: "testbase", derivedFrom: ["R-999"] }),
        condition({ id: "TC-002", source: "stakeholder", derivedFrom: ["P-001"] }),
        condition({ id: "TC-003", source: "stakeholder", derivedFrom: ["P-999"] }),
        // risks 未指定なのでスキップされる
        condition({ id: "TC-004", source: "risk", derivedFrom: ["RK-001"] }),
        condition({ id: "TC-005", source: "guideword", derivedFrom: ["P-001"] }),
        condition({ id: "TC-006", source: "guideword", derivedFrom: ["ZZ-001"] }),
      ],
    };
    expect(findUnresolvedDerivedFromRefs(input)).toEqual([
      { conditionId: "TC-001", ref: "R-999", expectedKind: "requirementIds" },
      { conditionId: "TC-003", ref: "P-999", expectedKind: "personas[].id" },
      {
        conditionId: "TC-006",
        ref: "ZZ-001",
        expectedKind: "requirementIds / risks[].id / personas[].id",
      },
    ]);
  });
});

describe("buildSourceDistribution", () => {
  it("returns all four sources including empty ones", () => {
    const rows = buildSourceDistribution([condition({ id: "TC-001", source: "testbase" })]);
    expect(rows.map((r) => r.source)).toEqual(["testbase", "stakeholder", "risk", "guideword"]);
    expect(rows[0]).toEqual({ source: "testbase", count: 1, conditionIds: ["TC-001"] });
    expect(rows[1].count).toBe(0);
    expect(rows[1].conditionIds).toEqual([]);
  });
});

describe("evaluateRisks", () => {
  it("flags incomplete inputs and priority deviations", () => {
    const conditions = [
      condition({ id: "TC-001", impact: 5, likelihood: 5, changeCategory: "new", priority: "高" }),
      condition({ id: "TC-002", impact: 1, likelihood: 1, changeCategory: "existing-unaffected", priority: "高" }),
      condition({ id: "TC-003", impact: 3, priority: "中" }),
    ];
    const result = evaluateRisks(conditions);
    expect(result[0]).toMatchObject({ score: 75, bandId: "R1", derivedPriority: "高", deviates: false, incomplete: false });
    expect(result[1]).toMatchObject({ score: 1, bandId: "R4", derivedPriority: "低", deviates: true, incomplete: false });
    expect(result[2]).toMatchObject({ deviates: false, incomplete: true });
    expect(result[2].score).toBeUndefined();
  });

  it("does not mutate the input array", () => {
    const conditions = [condition({ id: "TC-001", impact: 2, likelihood: 2 })];
    const snapshot = JSON.stringify(conditions);
    evaluateRisks(conditions);
    expect(JSON.stringify(conditions)).toBe(snapshot);
  });

  it("produces identical output before and after riskCategoryId was introduced", () => {
    const conditions = [
      condition({ id: "TC-001", impact: 5, likelihood: 5, changeCategory: "new", priority: "高" }),
      condition({ id: "TC-002", impact: 1, likelihood: 1, changeCategory: "existing-unaffected", priority: "高" }),
      condition({ id: "TC-003", impact: 3, priority: "中" }),
    ];
    const withoutRiskCategory = evaluateRisks(conditions);
    const withRiskCategory = evaluateRisks(
      conditions.map((c) => ({ ...c, riskCategoryId: "RC-01" }))
    );
    expect(withRiskCategory).toEqual(withoutRiskCategory);
  });
});

describe("buildRiskCategoryDistribution / findUnusedRiskCategories / findUnknownRiskCategoryIds", () => {
  it("returns a row for every risk category in definition order, tallying matches by riskCategoryId", () => {
    const risks = [
      risk({ id: "RK-001", riskCategoryId: "RC-04" }),
      risk({ id: "RK-002" }),
    ];
    const conditions = [
      condition({ id: "TC-001", riskCategoryId: "RC-04" }),
      condition({ id: "TC-002", riskCategoryId: "RC-01" }),
      condition({ id: "TC-003" }),
    ];
    const rows = buildRiskCategoryDistribution(risks, conditions);
    expect(rows.map((r) => r.categoryId)).toEqual(
      riskAnalysisFrame.riskCategories.map((rc) => rc.id)
    );
    const rc01 = rows.find((r) => r.categoryId === "RC-01");
    const rc04 = rows.find((r) => r.categoryId === "RC-04");
    expect(rc01).toMatchObject({ riskIds: [], conditionIds: ["TC-002"], count: 1 });
    expect(rc04).toMatchObject({ riskIds: ["RK-001"], conditionIds: ["TC-001"], count: 2 });
  });

  it("returns all-zero counts when no one specifies riskCategoryId", () => {
    const risks = [risk({ id: "RK-001" })];
    const conditions = [condition({ id: "TC-001" })];
    const rows = buildRiskCategoryDistribution(risks, conditions);
    expect(rows.every((r) => r.count === 0)).toBe(true);
  });

  it("returns only unused categories in definition order", () => {
    const risks = [risk({ id: "RK-001", riskCategoryId: "RC-04" })];
    const conditions = [condition({ id: "TC-001", riskCategoryId: "RC-01" })];
    const unused = findUnusedRiskCategories(risks, conditions);
    const expectedIds = riskAnalysisFrame.riskCategories
      .filter((rc) => rc.id !== "RC-01" && rc.id !== "RC-04")
      .map((rc) => rc.id);
    expect(unused.map((u) => u.id)).toEqual(expectedIds);
  });

  it("finds unknown risk category ids, risks before conditions, in input order", () => {
    const risks = [risk({ id: "RK-001", riskCategoryId: "RC-99" })];
    const conditions = [condition({ id: "TC-001", riskCategoryId: "RC-99" })];
    const unknown = findUnknownRiskCategoryIds(risks, conditions);
    expect(unknown).toEqual([
      { ownerKind: "risk", ownerId: "RK-001", riskCategoryId: "RC-99" },
      { ownerKind: "condition", ownerId: "TC-001", riskCategoryId: "RC-99" },
    ]);
  });

  it("does not mutate inputs and is deterministic across repeated calls", () => {
    const risks = [risk({ id: "RK-001", riskCategoryId: "RC-04" })];
    const conditions = [condition({ id: "TC-001", riskCategoryId: "RC-01" })];
    const risksSnapshot = JSON.stringify(risks);
    const conditionsSnapshot = JSON.stringify(conditions);

    const dist1 = buildRiskCategoryDistribution(risks, conditions);
    const unused1 = findUnusedRiskCategories(risks, conditions);
    const unknown1 = findUnknownRiskCategoryIds(risks, conditions);

    expect(JSON.stringify(risks)).toBe(risksSnapshot);
    expect(JSON.stringify(conditions)).toBe(conditionsSnapshot);

    const dist2 = buildRiskCategoryDistribution(risks, conditions);
    const unused2 = findUnusedRiskCategories(risks, conditions);
    const unknown2 = findUnknownRiskCategoryIds(risks, conditions);

    expect(dist2).toEqual(dist1);
    expect(unused2).toEqual(unused1);
    expect(unknown2).toEqual(unknown1);
  });
});
