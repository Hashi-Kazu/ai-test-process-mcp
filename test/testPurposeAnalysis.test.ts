import { describe, expect, it } from "vitest";
import {
  buildPurposeConditionMatrix,
  buildPurposeQualityMatrix,
  buildPurposeTestTypeMatrix,
  computeTestPurposeCoverage,
  findConditionLessPurposes,
  findDuplicateTestPurposeIds,
  findExpectationLessTestRequirements,
  findMissingRequirementLines,
  findMissingTestPurposeNumbers,
  findOrphanExpectations,
  findPrefixMismatchTestPurposeIds,
  findPriorityIssues,
  findPurposeLessConditions,
  findPurposesWithoutSuccessCriterion,
  findQualityCharacteristicIssues,
  findRequirementLessPurposes,
  findTestTypeLessPurposes,
  findTestTypeSelectionIssues,
  findUngroundedExpectations,
  findUnknownTestTypeNames,
  findUnresolvedTestPurposeRefs,
  findUnusedTestRequirements,
} from "../src/testPurposeAnalysis.js";
import { qualityCharacteristicModel } from "../src/resources/qualityCharacteristics.js";
import { qualityInUseCharacteristicModel } from "../src/resources/qualityInUseCharacteristics.js";
import type { DeriveTestPurposesInput } from "../src/types.js";

function baseInput(overrides: Partial<DeriveTestPurposesInput> = {}): DeriveTestPurposesInput {
  return {
    expectations: [{ id: "EXP-01", statement: "依頼者の期待" }],
    testRequirements: [
      { id: "TR-01", line: "management", statement: "要求1", expectationIds: ["EXP-01"] },
      { id: "TR-02", line: "engineering", statement: "要求2", expectationIds: ["EXP-01"] },
    ],
    purposes: [
      {
        id: "TP-01",
        statement: "目的1",
        testRequirementIds: ["TR-01", "TR-02"],
        successCriterion: "達成基準",
        priorityRank: 1,
        priorityRationale: "根拠",
      },
    ],
    ...overrides,
  };
}

describe("findUnresolvedTestPurposeRefs", () => {
  it("returns empty when all references resolve", () => {
    expect(findUnresolvedTestPurposeRefs(baseInput())).toEqual([]);
  });

  it("detects all five reference sources", () => {
    const input = baseInput({
      testRequirements: [
        { id: "TR-01", line: "management", statement: "要求1", expectationIds: ["EXP-99"] },
      ],
      purposes: [
        { id: "TP-01", statement: "目的1", testRequirementIds: ["TR-99"], strategyIds: ["ST-99"] },
      ],
      testConditions: [{ id: "TC-01", purposeIds: ["TP-99"] }],
      testTypeSelections: [{ name: "機能テスト", selected: true, purposeIds: ["TP-98"] }],
    });
    const refs = findUnresolvedTestPurposeRefs(input);
    const expectedKinds = refs.map((r) => r.expectedKind);
    expect(expectedKinds).toEqual(
      expect.arrayContaining([
        "expectations[].id",
        "testRequirements[].id",
        "strategyStatements[].id",
        "purposes[].id",
      ])
    );
    expect(refs.filter((r) => r.expectedKind === "purposes[].id")).toHaveLength(2);
  });
});

describe("findDuplicateTestPurposeIds / findPrefixMismatchTestPurposeIds / findMissingTestPurposeNumbers", () => {
  it("returns empty for well-formed ids", () => {
    expect(findDuplicateTestPurposeIds(baseInput())).toEqual([]);
    expect(findPrefixMismatchTestPurposeIds(baseInput())).toEqual([]);
  });

  it("detects duplicate ids", () => {
    const input = baseInput({
      expectations: [
        { id: "EXP-01", statement: "a" },
        { id: "EXP-01", statement: "b" },
      ],
    });
    expect(findDuplicateTestPurposeIds(input)).toEqual([
      { kind: "expectation", id: "EXP-01", count: 2 },
    ]);
  });

  it("detects prefix mismatches", () => {
    const input = baseInput({ expectations: [{ id: "XX-01", statement: "a" }] });
    expect(findPrefixMismatchTestPurposeIds(input)).toEqual([
      { kind: "expectation", id: "XX-01", expectedPrefix: "EXP-" },
    ]);
  });

  it("builds missing numbers using the majority digit width when widths are mixed", () => {
    const input = baseInput({
      expectations: [
        { id: "EXP-01", statement: "a" },
        { id: "EXP-02", statement: "b" },
        { id: "EXP-04", statement: "c" },
        { id: "EXP-5", statement: "d" },
      ],
    });
    const missing = findMissingTestPurposeNumbers(input);
    expect(missing.map((m) => m.id)).toContain("EXP-03");
  });
});

describe("findOrphanExpectations / findExpectationLessTestRequirements", () => {
  it("flags an expectation referenced by no test requirement", () => {
    const input = baseInput({
      expectations: [
        { id: "EXP-01", statement: "a" },
        { id: "EXP-02", statement: "b" },
      ],
    });
    expect(findOrphanExpectations(input)).toEqual([{ id: "EXP-02", statement: "b" }]);
  });

  it("returns empty when every expectation is referenced", () => {
    expect(findOrphanExpectations(baseInput())).toEqual([]);
  });

  it("flags a test requirement with no expectationIds", () => {
    const input = baseInput({
      testRequirements: [{ id: "TR-01", line: "management", statement: "要求" }],
    });
    expect(findExpectationLessTestRequirements(input)).toEqual(["TR-01"]);
  });

  it("returns empty when every requirement has expectationIds", () => {
    expect(findExpectationLessTestRequirements(baseInput())).toEqual([]);
  });
});

describe("findUnusedTestRequirements / findRequirementLessPurposes", () => {
  it("flags a requirement referenced by no purpose", () => {
    const input = baseInput({
      testRequirements: [
        { id: "TR-01", line: "management", statement: "1", expectationIds: ["EXP-01"] },
        { id: "TR-02", line: "engineering", statement: "2", expectationIds: ["EXP-01"] },
      ],
      purposes: [{ id: "TP-01", statement: "目的1", testRequirementIds: ["TR-01"] }],
    });
    expect(findUnusedTestRequirements(input)).toEqual(["TR-02"]);
  });

  it("returns empty when every requirement is used", () => {
    expect(findUnusedTestRequirements(baseInput())).toEqual([]);
  });

  it("flags a purpose with no testRequirementIds", () => {
    const input = baseInput({ purposes: [{ id: "TP-01", statement: "目的1" }] });
    expect(findRequirementLessPurposes(input)).toEqual(["TP-01"]);
  });

  it("returns empty when every purpose has testRequirementIds", () => {
    expect(findRequirementLessPurposes(baseInput())).toEqual([]);
  });
});

describe("findMissingRequirementLines", () => {
  it("returns the missing line when only one line is present", () => {
    const input = baseInput({
      testRequirements: [
        { id: "TR-01", line: "engineering", statement: "要求", expectationIds: ["EXP-01"] },
      ],
    });
    expect(findMissingRequirementLines(input)).toEqual(["management"]);
  });

  it("returns empty when both lines are present", () => {
    expect(findMissingRequirementLines(baseInput())).toEqual([]);
  });
});

describe("findPurposeLessConditions / findConditionLessPurposes", () => {
  it("flags a condition with no purposeIds", () => {
    const input = baseInput({ testConditions: [{ id: "TC-01" }] });
    expect(findPurposeLessConditions(input)).toEqual(["TC-01"]);
  });

  it("returns empty when testConditions is unspecified", () => {
    expect(findPurposeLessConditions(baseInput())).toEqual([]);
    expect(findConditionLessPurposes(baseInput())).toEqual([]);
  });

  it("flags a purpose referenced by no condition when testConditions is present", () => {
    const input = baseInput({
      purposes: [
        { id: "TP-01", statement: "目的1", testRequirementIds: ["TR-01", "TR-02"] },
        { id: "TP-02", statement: "目的2" },
      ],
      testConditions: [{ id: "TC-01", purposeIds: ["TP-01"] }],
    });
    expect(findConditionLessPurposes(input)).toEqual(["TP-02"]);
  });
});

describe("findTestTypeSelectionIssues / findTestTypeLessPurposes", () => {
  it("detects selected-without-purpose, selected-without-reason, and unselected-with-purpose", () => {
    const input = baseInput({
      testTypeSelections: [
        { name: "機能テスト", selected: true },
        { name: "性能テスト", selected: false, purposeIds: ["TP-01"] },
      ],
    });
    const issues = findTestTypeSelectionIssues(input);
    expect(issues).toEqual(
      expect.arrayContaining([
        { name: "機能テスト", kind: "selected-without-purpose" },
        { name: "機能テスト", kind: "selected-without-reason" },
        { name: "性能テスト", kind: "unselected-with-purpose" },
      ])
    );
  });

  it("returns empty for well-formed selections", () => {
    const input = baseInput({
      testTypeSelections: [{ name: "機能テスト", selected: true, purposeIds: ["TP-01"], reason: "理由" }],
    });
    expect(findTestTypeSelectionIssues(input)).toEqual([]);
  });

  it("returns empty for testTypeLessPurposes when testTypeSelections is unspecified", () => {
    expect(findTestTypeLessPurposes(baseInput())).toEqual([]);
  });
});

describe("findPurposesWithoutSuccessCriterion / findPriorityIssues", () => {
  it("flags a purpose with no successCriterion", () => {
    const input = baseInput({ purposes: [{ id: "TP-01", statement: "目的" }] });
    expect(findPurposesWithoutSuccessCriterion(input)).toEqual(["TP-01"]);
  });

  it("flags missing rank, duplicate rank, and missing rationale", () => {
    const input = baseInput({
      purposes: [
        { id: "TP-01", statement: "a", priorityRank: 1, priorityRationale: "r" },
        { id: "TP-02", statement: "b", priorityRank: 1, priorityRationale: "r" },
        { id: "TP-03", statement: "c" },
      ],
    });
    const issues = findPriorityIssues(input);
    expect(issues).toEqual(
      expect.arrayContaining([
        { purposeId: "TP-01", kind: "duplicate-rank", rank: 1 },
        { purposeId: "TP-02", kind: "duplicate-rank", rank: 1 },
        { purposeId: "TP-03", kind: "missing-rank" },
        { purposeId: "TP-03", kind: "missing-rationale" },
      ])
    );
  });
});

describe("findQualityCharacteristicIssues", () => {
  it("flags a purpose with no quality characteristic ids at all", () => {
    const input = baseInput();
    const issues = findQualityCharacteristicIssues(input);
    expect(issues).toEqual([{ ownerId: "TP-01", kind: "unassigned" }]);
  });

  it("flags an unknown quality characteristic id", () => {
    const input = baseInput({
      purposes: [
        {
          id: "TP-01",
          statement: "目的",
          relatedQualityCharacteristicIds: ["QC-99"],
        },
      ],
    });
    expect(findQualityCharacteristicIssues(input)).toEqual([
      { ownerId: "TP-01", kind: "unknown", characteristicId: "QC-99" },
    ]);
  });

  it("does not flag a purpose whose linked condition carries a known characteristic id", () => {
    const input = baseInput({
      testConditions: [{ id: "TC-01", purposeIds: ["TP-01"], qualityCharacteristicIds: ["QC-01"] }],
    });
    expect(findQualityCharacteristicIssues(input)).toEqual([]);
  });

  it("does not flag a top-level in-use quality characteristic id", () => {
    const input = baseInput({
      purposes: [
        { id: "TP-01", statement: "目的1", relatedQualityCharacteristicIds: ["QU-01"] },
      ],
    });
    expect(findQualityCharacteristicIssues(input)).toEqual([]);
  });

  it("does not flag a sub-characteristic in-use quality characteristic id", () => {
    const input = baseInput({
      purposes: [
        { id: "TP-01", statement: "目的1", relatedQualityCharacteristicIds: ["QU-05-02"] },
      ],
    });
    expect(findQualityCharacteristicIssues(input)).toEqual([]);
  });

  it("does not flag a mix of product and in-use characteristic ids", () => {
    const input = baseInput({
      purposes: [
        {
          id: "TP-01",
          statement: "目的1",
          relatedQualityCharacteristicIds: ["QC-01", "QU-03-02"],
        },
      ],
    });
    expect(findQualityCharacteristicIssues(input)).toEqual([]);
  });

  it("resolves unassigned via a linked condition carrying a known in-use characteristic id", () => {
    const input = baseInput({
      testConditions: [{ id: "TC-01", purposeIds: ["TP-01"], qualityCharacteristicIds: ["QU-02-01"] }],
    });
    expect(findQualityCharacteristicIssues(input)).toEqual([]);
  });

  it("still flags a non-existent in-use-looking id as unknown", () => {
    const input = baseInput({
      purposes: [{ id: "TP-01", statement: "目的1", relatedQualityCharacteristicIds: ["QU-99"] }],
    });
    expect(findQualityCharacteristicIssues(input)).toEqual([
      { ownerId: "TP-01", kind: "unknown", characteristicId: "QU-99" },
    ]);
  });

  it("keeps existing unknown/unassigned behavior for product-only ids", () => {
    const unknownInput = baseInput({
      purposes: [{ id: "TP-01", statement: "目的1", relatedQualityCharacteristicIds: ["QC-99"] }],
    });
    expect(findQualityCharacteristicIssues(unknownInput)).toEqual([
      { ownerId: "TP-01", kind: "unknown", characteristicId: "QC-99" },
    ]);

    const unassignedInput = baseInput();
    expect(findQualityCharacteristicIssues(unassignedInput)).toEqual([
      { ownerId: "TP-01", kind: "unassigned" },
    ]);
  });
});

describe("product/in-use quality characteristic id spaces", () => {
  it("do not overlap between the two models", () => {
    const productIds = new Set<string>();
    for (const c of qualityCharacteristicModel.characteristics) {
      productIds.add(c.id);
      for (const s of c.subCharacteristics) productIds.add(s.id);
    }
    const inUseIds = new Set<string>();
    for (const c of qualityInUseCharacteristicModel.characteristics) {
      inUseIds.add(c.id);
      for (const s of c.subCharacteristics) inUseIds.add(s.id);
    }
    const intersection = [...productIds].filter((id) => inUseIds.has(id));
    expect(intersection).toEqual([]);
  });
});

describe("findUngroundedExpectations", () => {
  it("returns empty when requestDocuments is not specified", () => {
    expect(findUngroundedExpectations(baseInput())).toEqual([]);
  });

  it("flags an expectation not found anywhere in the request documents", () => {
    const input = baseInput({
      requestDocuments: [{ name: "依頼書", content: "1行目\n2行目\n3行目" }],
    });
    expect(findUngroundedExpectations(input)).toEqual([{ id: "EXP-01", kind: "not-in-documents" }]);
  });

  it("flags a sourceRef pointing at an unknown document", () => {
    const input = baseInput({
      requestDocuments: [{ name: "依頼書", content: "行1\n行2" }],
      expectations: [
        {
          id: "EXP-01",
          statement: "期待",
          sourceRef: { document: "存在しない文書", startLine: 1 },
        },
      ],
    });
    expect(findUngroundedExpectations(input)).toEqual([
      { id: "EXP-01", kind: "unknown-document", document: "存在しない文書" },
    ]);
  });

  it("flags a sourceRef whose startLine exceeds the document line count", () => {
    const input = baseInput({
      requestDocuments: [{ name: "依頼書", content: "行1\n行2" }],
      expectations: [
        {
          id: "EXP-01",
          statement: "期待",
          sourceRef: { document: "依頼書", startLine: 10 },
        },
      ],
    });
    expect(findUngroundedExpectations(input)).toEqual([
      { id: "EXP-01", kind: "line-out-of-range", document: "依頼書" },
    ]);
  });

  it("does not flag an expectation whose id appears in the document body", () => {
    const input = baseInput({
      requestDocuments: [{ name: "依頼書", content: "EXP-01 に関する記述" }],
    });
    expect(findUngroundedExpectations(input)).toEqual([]);
  });
});

describe("computeTestPurposeCoverage", () => {
  it("returns conditionBasis unavailable when testConditions is not specified, and only mismatches when claimed", () => {
    const withoutClaim = computeTestPurposeCoverage(baseInput());
    expect(withoutClaim.conditionBasis).toBe("unavailable");
    expect(withoutClaim.purposeCoverageMismatch).toBe(false);

    const withClaim = computeTestPurposeCoverage(
      baseInput({ claimedPurposeCoveragePercent: 100 })
    );
    expect(withClaim.conditionBasis).toBe("unavailable");
    expect(withClaim.purposeCoverageMismatch).toBe(true);
  });

  it("computes the purpose coverage percent and flags a mismatch beyond 0.05", () => {
    const input = baseInput({
      testConditions: [
        { id: "TC-01", purposeIds: ["TP-01"] },
        { id: "TC-02", purposeIds: ["TP-01"] },
        { id: "TC-03" },
      ],
      claimedPurposeCoveragePercent: 100,
    });
    const result = computeTestPurposeCoverage(input);
    expect(result.conditionBasis).toBe("available");
    expect(result.computedPurposeCoveragePercent).toBeCloseTo(66.7, 1);
    expect(result.purposeCoverageMismatch).toBe(true);
  });
});

describe("findUnknownTestTypeNames", () => {
  it("returns empty for known test type names", () => {
    const input = baseInput({ testTypeSelections: [{ name: "機能テスト", selected: true }] });
    expect(findUnknownTestTypeNames(input)).toEqual([]);
  });

  it("flags a test type name not present in the catalog", () => {
    const input = baseInput({ testTypeSelections: [{ name: "存在しないタイプ", selected: true }] });
    expect(findUnknownTestTypeNames(input)).toEqual(["存在しないタイプ"]);
  });
});

describe("matrix builders", () => {
  it("build purpose x condition / test type / quality matrices in purpose order", () => {
    const input = baseInput({
      purposes: [
        {
          id: "TP-01",
          statement: "目的1",
          testRequirementIds: ["TR-01"],
          relatedQualityCharacteristicIds: ["QC-01"],
        },
      ],
      testConditions: [{ id: "TC-01", purposeIds: ["TP-01"], qualityCharacteristicIds: ["QC-02"] }],
      testTypeSelections: [{ name: "機能テスト", selected: true, purposeIds: ["TP-01"] }],
    });
    expect(buildPurposeConditionMatrix(input)).toEqual([
      { purposeId: "TP-01", statement: "目的1", conditionIds: ["TC-01"] },
    ]);
    expect(buildPurposeTestTypeMatrix(input)).toEqual([{ purposeId: "TP-01", typeNames: ["機能テスト"] }]);
    expect(buildPurposeQualityMatrix(input)).toEqual([
      {
        purposeId: "TP-01",
        characteristicIds: ["QC-01", "QC-02"],
        productCharacteristicIds: ["QC-01", "QC-02"],
        inUseCharacteristicIds: [],
        unknownCharacteristicIds: [],
      },
    ]);
  });

  it("classifies product/in-use/unknown characteristic ids into separate matrix columns", () => {
    const input = baseInput({
      purposes: [
        {
          id: "TP-01",
          statement: "目的1",
          relatedQualityCharacteristicIds: ["QC-01", "QU-01", "ZZ-01"],
        },
      ],
    });
    expect(buildPurposeQualityMatrix(input)).toEqual([
      {
        purposeId: "TP-01",
        characteristicIds: ["QC-01", "QU-01", "ZZ-01"],
        productCharacteristicIds: ["QC-01"],
        inUseCharacteristicIds: ["QU-01"],
        unknownCharacteristicIds: ["ZZ-01"],
      },
    ]);
  });
});
