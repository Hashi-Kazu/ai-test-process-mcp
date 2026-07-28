import { describe, expect, it } from "vitest";
import {
  buildRequirementCoverageMatrix,
  buildRiskCategoryDistribution,
  buildSourceDistribution,
  computeRiskScore,
  evaluateRisks,
  findConditionsWithoutPriority,
  findConditionsWithoutSourceRefs,
  findDuplicateConditionIds,
  findIncompletePersonaQuadrants,
  findMissingConditionNumbers,
  findPrefixMismatchConditionIds,
  findUncoveredRequirementIds,
  findUnknownRiskCategoryIds,
  findUnresolvedDerivedFromRefs,
  findUnusedPerspectiveCategories,
  findUnusedRiskCategories,
  formatPersonaQuadrantCell,
  mapRiskScoreToBand,
  resolveSourceRefs,
} from "../src/testConditionAnalysis.js";
import { riskAnalysisFrame } from "../src/resources/riskAnalysisFrame.js";
import type {
  ExtractTestConditionsInput,
  RequirementSourceRef,
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

describe("findUnresolvedDerivedFromRefs with explicit-kind derivedFrom entries", () => {
  it("resolves a risk-sourced condition whose derivedFrom also references a requirement id via explicit kind", () => {
    const input: ExtractTestConditionsInput = {
      requirementIds: ["R-001"],
      risks: [risk({ id: "RK-001" })],
      testConditions: [
        condition({
          id: "TC-001",
          source: "risk",
          derivedFrom: [
            { kind: "risk", id: "RK-001" },
            { kind: "requirement", id: "R-001" },
          ],
        }),
      ],
    };
    expect(findUnresolvedDerivedFromRefs(input)).toEqual([]);
  });

  it("detects an explicit requirement-kind reference missing from requirementIds", () => {
    const input: ExtractTestConditionsInput = {
      requirementIds: ["R-001"],
      testConditions: [
        condition({
          id: "TC-001",
          source: "testbase",
          derivedFrom: [{ kind: "requirement", id: "R-999" }],
        }),
      ],
    };
    expect(findUnresolvedDerivedFromRefs(input)).toEqual([
      { conditionId: "TC-001", ref: "R-999", expectedKind: "requirementIds", kind: "requirement" },
    ]);
  });

  it("skips explicit risk-kind references when risks is unspecified", () => {
    const input: ExtractTestConditionsInput = {
      requirementIds: ["R-001"],
      testConditions: [
        condition({
          id: "TC-001",
          source: "risk",
          derivedFrom: [{ kind: "risk", id: "RK-001" }],
        }),
      ],
    };
    expect(findUnresolvedDerivedFromRefs(input)).toEqual([]);
  });

  it("always checks explicit guideword-kind references even without risks/personas", () => {
    const input: ExtractTestConditionsInput = {
      requirementIds: ["R-001"],
      testConditions: [
        condition({
          id: "TC-001",
          source: "guideword",
          derivedFrom: [
            { kind: "guideword", id: "GWF-01" },
            { kind: "guideword", id: "GW-01" },
            { kind: "guideword", id: "GW-999" },
          ],
        }),
      ],
    };
    const result = findUnresolvedDerivedFromRefs(input);
    expect(result).toEqual([
      {
        conditionId: "TC-001",
        ref: "GW-999",
        expectedKind: "guidewordDictionary focusPoints[].id / guidewords[].id",
        kind: "guideword",
      },
    ]);
  });
});

describe("resolveSourceRefs with explicit-kind derivedFrom", () => {
  const requirementSources: RequirementSourceRef[] = [
    { requirementId: "R-001", document: "doc.md", startLine: 10, endLine: 12 },
  ];

  it("does not resolve an explicit risk-kind entry against requirementSources", () => {
    expect(resolveSourceRefs({ derivedFrom: [{ kind: "risk", id: "R-001" }] }, requirementSources)).toEqual([]);
  });

  it("resolves an explicit requirement-kind entry and a plain string entry", () => {
    expect(
      resolveSourceRefs({ derivedFrom: [{ kind: "requirement", id: "R-001" }] }, requirementSources)
    ).toEqual([{ document: "doc.md", startLine: 10, endLine: 12 }]);
    expect(resolveSourceRefs({ derivedFrom: ["R-001"] }, requirementSources)).toEqual([
      { document: "doc.md", startLine: 10, endLine: 12 },
    ]);
  });
});

describe("buildRequirementCoverageMatrix with explicit-kind derivedFrom", () => {
  it("does not count an explicit risk-kind reference toward requirement coverage", () => {
    const conditions = [
      condition({ id: "TC-001", derivedFrom: [{ kind: "risk", id: "R-001" }] }),
    ];
    const matrix = buildRequirementCoverageMatrix(["R-001"], conditions);
    expect(matrix).toEqual([{ requirementId: "R-001", conditionIds: [] }]);
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

describe("resolveSourceRefs", () => {
  const requirementSources: RequirementSourceRef[] = [
    { requirementId: "EH-100", document: "doc.md", startLine: 652, endLine: 677, label: "EH-100 発券機起動" },
    { requirementId: "EH-200", document: "doc.md", startLine: 700, endLine: 710, label: "EH-200 発券機停止" },
  ];

  it("prefers explicit sourceRefs over derivedFrom lookup", () => {
    const owner = {
      derivedFrom: ["EH-100"],
      sourceRefs: [{ document: "other.md", startLine: 1 }],
    };
    const refs = resolveSourceRefs(owner, requirementSources);
    expect(refs).toEqual([{ document: "other.md", startLine: 1 }]);
  });

  it("resolves via derivedFrom against requirementSources, preserving requirementSources order", () => {
    const owner = { derivedFrom: ["EH-200", "EH-100"] };
    const refs = resolveSourceRefs(owner, requirementSources);
    expect(refs.map((r) => r.document + ":" + r.startLine)).toEqual(["doc.md:652", "doc.md:700"]);
  });

  it("deduplicates identical document/startLine/endLine refs", () => {
    const owner = { derivedFrom: ["EH-100", "EH-100"] };
    const refs = resolveSourceRefs(owner, requirementSources);
    expect(refs.length).toBe(1);
  });

  it("does not mutate the input owner or requirementSources", () => {
    const owner = { derivedFrom: ["EH-100"] };
    const ownerSnapshot = JSON.stringify(owner);
    const sourcesSnapshot = JSON.stringify(requirementSources);
    resolveSourceRefs(owner, requirementSources);
    expect(JSON.stringify(owner)).toBe(ownerSnapshot);
    expect(JSON.stringify(requirementSources)).toBe(sourcesSnapshot);
  });

  it("returns an empty array when there is no match", () => {
    const owner = { derivedFrom: ["UNKNOWN"] };
    expect(resolveSourceRefs(owner, requirementSources)).toEqual([]);
    expect(resolveSourceRefs(owner)).toEqual([]);
  });
});

describe("findConditionsWithoutSourceRefs", () => {
  it("returns an empty array when requirementSources is not provided", () => {
    const input: ExtractTestConditionsInput = {
      requirementIds: ["EH-100"],
      testConditions: [condition({ id: "TC-001", derivedFrom: ["EH-100"] })],
    };
    expect(findConditionsWithoutSourceRefs(input)).toEqual([]);
  });

  it("returns an empty array when requirementSources is an empty array", () => {
    const input: ExtractTestConditionsInput = {
      requirementIds: ["EH-100"],
      testConditions: [condition({ id: "TC-001", derivedFrom: ["EH-100"] })],
      requirementSources: [],
    };
    expect(findConditionsWithoutSourceRefs(input)).toEqual([]);
  });

  it("lists conditions whose source refs cannot be resolved", () => {
    const input: ExtractTestConditionsInput = {
      requirementIds: ["EH-100", "EH-999"],
      testConditions: [
        condition({ id: "TC-001", derivedFrom: ["EH-100"] }),
        condition({ id: "TC-002", derivedFrom: ["EH-999"] }),
      ],
      requirementSources: [
        { requirementId: "EH-100", document: "doc.md", startLine: 652, endLine: 677 },
      ],
    };
    const result = findConditionsWithoutSourceRefs(input);
    expect(result).toEqual([{ conditionId: "TC-002", source: "testbase" }]);
  });
});

describe("findIncompletePersonaQuadrants", () => {
  it("returns an empty array when no personas are given", () => {
    expect(findIncompletePersonaQuadrants()).toEqual([]);
    expect(findIncompletePersonaQuadrants([])).toEqual([]);
  });

  it("omits personas whose four quadrants are all filled", () => {
    expect(
      findIncompletePersonaQuadrants([
        {
          id: "P-001",
          role: "来園者",
          demographics: ["30代"],
          saysAndThinks: ["待ちたくない"],
          goals: ["すぐ入場したい"],
          painPoints: ["列が長い"],
        },
      ])
    ).toEqual([]);
  });

  it("treats the legacy concerns field as a filled pain point quadrant", () => {
    expect(
      findIncompletePersonaQuadrants([{ id: "P-002", role: "運用担当", concerns: "障害対応が煩雑" }])
    ).toEqual([{ personaId: "P-002", missingQuadrants: ["属性", "発言・思考", "目標"] }]);
  });

  it("lists all four quadrants for a minimal legacy persona and keeps the input order", () => {
    expect(
      findIncompletePersonaQuadrants([
        { id: "P-003", role: "経理担当" },
        { id: "P-004", role: "受付", demographics: [], goals: ["受付を早く終えたい"] },
      ])
    ).toEqual([
      { personaId: "P-003", missingQuadrants: ["属性", "発言・思考", "目標", "不満点"] },
      { personaId: "P-004", missingQuadrants: ["属性", "発言・思考", "不満点"] },
    ]);
  });

  it("does not mutate the input", () => {
    const personas = [{ id: "P-001", role: "来園者", goals: ["入場したい"] }];
    const snapshot = JSON.stringify(personas);
    findIncompletePersonaQuadrants(personas);
    expect(JSON.stringify(personas)).toBe(snapshot);
  });
});

describe("formatPersonaQuadrantCell", () => {
  it("joins array values with '; '", () => {
    expect(
      formatPersonaQuadrantCell({ id: "P-001", role: "来園者", demographics: ["30代", "会社員"] }, "demographics")
    ).toBe("30代; 会社員");
  });

  it("falls back to concerns for painPoints and marks other quadrants as unfilled", () => {
    const persona = { id: "P-002", role: "運用担当", concerns: "障害対応が煩雑" };
    expect(formatPersonaQuadrantCell(persona, "painPoints")).toBe("障害対応が煩雑");
    expect(formatPersonaQuadrantCell(persona, "goals")).toBe("未記入(要確認)");
  });
});
