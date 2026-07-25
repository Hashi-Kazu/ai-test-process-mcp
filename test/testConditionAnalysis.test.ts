import { describe, expect, it } from "vitest";
import {
  buildRequirementCoverageMatrix,
  buildSourceDistribution,
  computeRiskScore,
  evaluateRisks,
  findConditionsWithoutPriority,
  findDuplicateConditionIds,
  findMissingConditionNumbers,
  findPrefixMismatchConditionIds,
  findUncoveredRequirementIds,
  findUnresolvedDerivedFromRefs,
  findUnusedPerspectiveCategories,
  mapRiskScoreToBand,
} from "../src/testConditionAnalysis.js";
import type { ExtractTestConditionsInput, TestConditionInput } from "../src/types.js";

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
});
