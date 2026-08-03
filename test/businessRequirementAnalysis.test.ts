import { describe, expect, it } from "vitest";
import {
  computeFeatureCoverage,
  findDataTouchGaps,
  findDuplicateBusinessRequirementIds,
  findFeatureLessBusinessUseCases,
  findFlowLessBusinessUseCases,
  findIncompletePurposes,
  findMissingBusinessRequirementNumbers,
  findMissingExceptionOperations,
  findMissingRequiredUseCaseAspects,
  findMissingStepActors,
  findOrphanBusinessUseCases,
  findOrphanPurposes,
  findPrefixMismatchBusinessRequirementIds,
  findStateDeclarationMismatches,
  findUndeclaredFeatureIdRefs,
  findUnreferencedFeatureIds,
  findUnresolvedBusinessRequirementRefs,
  resolveBusinessRequirementIdPrefixes,
} from "../src/businessRequirementAnalysis.js";
import type { GenerateBusinessRequirementModelInput } from "../src/types.js";

const baseInput: GenerateBusinessRequirementModelInput = {
  roles: [{ id: "ROLE-01", nameJa: "窓口担当" }],
  purposes: [
    { id: "PUR-01", level: "businessGoal", statement: "待ち時間を減らす" },
    { id: "PUR-02", level: "achievementMetric", statement: "測定", achievementMetric: "待ち時間", measurementMethod: "計測" },
  ],
  businessUseCases: [
    {
      id: "BUC-01",
      purposeIds: ["PUR-01", "PUR-02"],
      name: "入場受付",
      actorRoleId: "ROLE-01",
      trigger: "来園者が到着する",
      completionState: "入場が完了する",
      featureIds: ["F-001"],
      exceptionOperation: "手動で通す",
    },
  ],
  flowSteps: [
    { id: "BFL-01", useCaseId: "BUC-01", no: 1, actorRoleId: "ROLE-01", action: "QRを読む", dataAccess: [{ dataId: "BDT-01", access: "read" }] },
  ],
  drivingData: [
    { id: "BDT-01", name: "入場券", hasStates: true, states: ["未使用", "使用済"] },
  ],
  featureIdPopulation: ["F-001"],
  claimedFeatureCoveragePercent: 100,
};

describe("resolveBusinessRequirementIdPrefixes", () => {
  it("uses defaults when idPrefixes is omitted", () => {
    expect(resolveBusinessRequirementIdPrefixes(undefined)).toEqual({
      purpose: "PUR-",
      businessUseCase: "BUC-",
      flowStep: "BFL-",
      drivingData: "BDT-",
    });
  });

  it("overrides individual prefixes", () => {
    expect(resolveBusinessRequirementIdPrefixes({ purpose: "P-" })).toEqual({
      purpose: "P-",
      businessUseCase: "BUC-",
      flowStep: "BFL-",
      drivingData: "BDT-",
    });
  });
});

describe("findUnresolvedBusinessRequirementRefs (BRC-01)", () => {
  it("reports no unresolved refs for a consistent input", () => {
    expect(findUnresolvedBusinessRequirementRefs(baseInput)).toEqual([]);
  });

  it("reports unresolved purposeIds / actorRoleId / useCaseId / dataId refs", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01", purposeIds: ["PUR-99"], actorRoleId: "ROLE-99" }],
      flowSteps: [{ id: "BFL-01", useCaseId: "BUC-99", no: 1, actorRoleId: "ROLE-99", dataAccess: [{ dataId: "BDT-99", access: "read" }] }],
      drivingData: [{ id: "BDT-01", name: "d", usedByUseCaseIds: ["BUC-99"] }],
    };
    const refs = findUnresolvedBusinessRequirementRefs(input);
    expect(refs).toContainEqual({ ownerId: "BUC-01", ref: "PUR-99", expectedKind: "purposes[].id" });
    expect(refs).toContainEqual({ ownerId: "BUC-01", ref: "ROLE-99", expectedKind: "roles[].id" });
    expect(refs).toContainEqual({ ownerId: "BFL-01", ref: "BUC-99", expectedKind: "businessUseCases[].id" });
    expect(refs).toContainEqual({ ownerId: "BFL-01", ref: "ROLE-99", expectedKind: "roles[].id" });
    expect(refs).toContainEqual({ ownerId: "BFL-01", ref: "BDT-99", expectedKind: "drivingData[].id" });
    expect(refs).toContainEqual({ ownerId: "BDT-01", ref: "BUC-99", expectedKind: "businessUseCases[].id" });
  });
});

describe("id duplicate / gap / prefix checks (BRC-02)", () => {
  it("detects duplicate ids per kind", () => {
    const input: GenerateBusinessRequirementModelInput = {
      purposes: [
        { id: "PUR-01", level: "businessGoal", statement: "a" },
        { id: "PUR-01", level: "businessGoal", statement: "b" },
      ],
    };
    expect(findDuplicateBusinessRequirementIds(input)).toEqual([
      { kind: "purpose", id: "PUR-01", count: 2 },
    ]);
  });

  it("detects missing numbers within a contiguous range", () => {
    const input: GenerateBusinessRequirementModelInput = {
      purposes: [
        { id: "PUR-01", level: "businessGoal", statement: "a" },
        { id: "PUR-03", level: "businessGoal", statement: "b" },
      ],
    };
    expect(findMissingBusinessRequirementNumbers(input)).toEqual([
      { kind: "purpose", id: "PUR-02", expectedPrefix: "PUR-" },
    ]);
  });

  it("detects prefix mismatches", () => {
    const input: GenerateBusinessRequirementModelInput = {
      purposes: [{ id: "X-01", level: "businessGoal", statement: "a" }],
    };
    expect(findPrefixMismatchBusinessRequirementIds(input)).toEqual([
      { kind: "purpose", id: "X-01", expectedPrefix: "PUR-" },
    ]);
  });
});

describe("purpose <-> business use case linkage (BRC-03 / BRC-04)", () => {
  it("finds orphan purposes and orphan use cases", () => {
    const input: GenerateBusinessRequirementModelInput = {
      purposes: [{ id: "PUR-01", level: "businessGoal", statement: "unused" }],
      businessUseCases: [{ id: "BUC-01" }],
    };
    expect(findOrphanPurposes(input)).toEqual([{ id: "PUR-01", statement: "unused" }]);
    expect(findOrphanBusinessUseCases(input)).toEqual(["BUC-01"]);
  });

  it("reports nothing when linked", () => {
    expect(findOrphanPurposes(baseInput)).toEqual([]);
    expect(findOrphanBusinessUseCases(baseInput)).toEqual([]);
  });
});

describe("feature id checks (BRC-05 / BRC-06 / BRC-07)", () => {
  it("finds feature-less use cases", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01" }],
    };
    expect(findFeatureLessBusinessUseCases(input)).toEqual(["BUC-01"]);
  });

  it("skips population checks when population is undeclared", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01", featureIds: ["F-999"] }],
    };
    expect(findUnreferencedFeatureIds(input)).toEqual([]);
    expect(findUndeclaredFeatureIdRefs(input)).toEqual([]);
  });

  it("finds unreferenced population feature ids and undeclared references", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01", featureIds: ["F-999"] }],
      featureIdPopulation: ["F-001"],
    };
    expect(findUnreferencedFeatureIds(input)).toEqual(["F-001"]);
    expect(findUndeclaredFeatureIdRefs(input)).toEqual([
      { ownerId: "BUC-01", featureId: "F-999" },
    ]);
  });
});

describe("flow and data checks (BRC-08 / BRC-09 / BRC-10 / BRC-11)", () => {
  it("finds flow-less use cases and missing step actors", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01" }],
      flowSteps: [{ id: "BFL-01", useCaseId: "BUC-02", no: 1 }],
    };
    expect(findFlowLessBusinessUseCases(input)).toEqual(["BUC-01"]);
    expect(findMissingStepActors(input)).toEqual([{ stepId: "BFL-01", useCaseId: "BUC-02", no: 1 }]);
  });

  it("finds untouched driving data and data-less use cases", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01" }],
      flowSteps: [{ id: "BFL-01", useCaseId: "BUC-01", no: 1 }],
      drivingData: [{ id: "BDT-01", name: "d" }],
    };
    expect(findDataTouchGaps(input)).toEqual({
      untouchedDataIds: ["BDT-01"],
      dataLessUseCaseIds: ["BUC-01"],
    });
  });

  it("reports BRC-11 style mismatches between hasStates and states", () => {
    const input: GenerateBusinessRequirementModelInput = {
      drivingData: [
        { id: "BDT-01", name: "declared but empty", hasStates: true },
        { id: "BDT-02", name: "states but not declared", hasStates: false, states: ["a"] },
        { id: "BDT-03", name: "consistent", hasStates: true, states: ["a"] },
      ],
    };
    expect(findStateDeclarationMismatches(input)).toEqual([
      { dataId: "BDT-01", kind: "declared-but-no-states" },
      { dataId: "BDT-02", kind: "states-but-not-declared" },
    ]);
  });
});

describe("purpose metric and exception operation checks (BRC-12 / BRC-13)", () => {
  it("finds incomplete purposes missing metric / measurement method", () => {
    const input: GenerateBusinessRequirementModelInput = {
      purposes: [{ id: "PUR-01", level: "achievementMetric", statement: "s" }],
    };
    expect(findIncompletePurposes(input)).toEqual([
      { id: "PUR-01", missing: ["achievementMetric", "measurementMethod"] },
    ]);
  });

  it("finds use cases missing the exception operation", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01" }],
    };
    expect(findMissingExceptionOperations(input)).toEqual(["BUC-01"]);
  });
});

describe("computeFeatureCoverage (BRC-14)", () => {
  it("marks the coverage unavailable when the population is undeclared", () => {
    const result = computeFeatureCoverage({ claimedFeatureCoveragePercent: 90 });
    expect(result.basis).toBe("unavailable");
    expect(result.mismatch).toBe(true);
  });

  it("computes the coverage and flags a mismatch against the claimed percent", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01", featureIds: ["F-001"] }],
      featureIdPopulation: ["F-001", "F-002"],
      claimedFeatureCoveragePercent: 100,
    };
    const result = computeFeatureCoverage(input);
    expect(result.basis).toBe("declared-population");
    expect(result.computedPercent).toBe(50);
    expect(result.mismatch).toBe(true);
  });

  it("does not flag a mismatch when the claimed percent matches", () => {
    expect(computeFeatureCoverage(baseInput).mismatch).toBe(false);
  });
});

describe("findMissingRequiredUseCaseAspects (BRC-15)", () => {
  it("finds missing required aspects", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01" }],
    };
    const result = findMissingRequiredUseCaseAspects(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("BUC-01");
    expect(result[0].missingAspectIds).toEqual(["BUC-01", "BUC-02", "BUC-03", "BUC-04"]);
  });

  it("reports nothing when required aspects are filled", () => {
    expect(findMissingRequiredUseCaseAspects(baseInput)).toEqual([]);
  });
});
