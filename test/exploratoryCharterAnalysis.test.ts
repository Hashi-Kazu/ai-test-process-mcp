import { describe, expect, it } from "vitest";
import {
  computeTimeboxSummary,
  findChartersWithoutTimebox,
  findDuplicateCharterIds,
  findMissingCharterNumbers,
  findPrefixMismatchCharterIds,
  findDeterministicallyCoveredHighPriorityConditionIds,
  findSubjectiveMissionStatements,
  findUncoveredHighPriorityConditionIds,
  findUncoveredRiskIds,
  findUnknownCharterAreaIds,
  findUnknownDeterministicallyCoveredConditionIds,
  findUnresolvedCharterRefs,
  findUnusedCharterAreas,
} from "../src/exploratoryCharterAnalysis.js";
import { exploratoryCharterCatalog } from "../src/resources/exploratoryCharterCatalog.js";
import type {
  ExploratoryCharterInput,
  ExploratoryCharterTestConditionInput,
  GenerateExploratoryChartersInput,
  TestConditionRiskInput,
} from "../src/types.js";

function charter(overrides: Partial<ExploratoryCharterInput> & { charterId: string }): ExploratoryCharterInput {
  return {
    areaId: "ECA-01",
    mission: "ミッション文",
    checkFocus: ["確認観点"],
    operationFocus: ["操作観点"],
    derivedFrom: ["TC-001"],
    ...overrides,
  };
}

function condition(
  overrides: Partial<ExploratoryCharterTestConditionInput> & { id: string }
): ExploratoryCharterTestConditionInput {
  return {
    target: "F-001",
    statement: "条件文",
    derivedFrom: ["R-001"],
    ...overrides,
  };
}

function risk(overrides: Partial<TestConditionRiskInput> & { id: string }): TestConditionRiskInput {
  return { description: "リスク内容", ...overrides };
}

describe("findDuplicateCharterIds", () => {
  it("detects duplicated ids", () => {
    const charters = [charter({ charterId: "EXC-001" }), charter({ charterId: "EXC-001" })];
    expect(findDuplicateCharterIds(charters)).toEqual([{ id: "EXC-001", count: 2 }]);
  });

  it("returns empty when all ids are unique", () => {
    const charters = [charter({ charterId: "EXC-001" }), charter({ charterId: "EXC-002" })];
    expect(findDuplicateCharterIds(charters)).toEqual([]);
  });
});

describe("findPrefixMismatchCharterIds", () => {
  it("detects ids that do not match the prefix", () => {
    const charters = [charter({ charterId: "EXC-001" }), charter({ charterId: "X-9" })];
    expect(findPrefixMismatchCharterIds(charters)).toEqual(["X-9"]);
  });

  it("returns empty when all ids match the prefix", () => {
    const charters = [charter({ charterId: "EXC-001" }), charter({ charterId: "EXC-002" })];
    expect(findPrefixMismatchCharterIds(charters)).toEqual([]);
  });
});

describe("findMissingCharterNumbers", () => {
  it("fills gaps within the observed range using the most common digit width", () => {
    const charters = [
      charter({ charterId: "EXC-001" }),
      charter({ charterId: "EXC-002" }),
      charter({ charterId: "EXC-005" }),
    ];
    expect(findMissingCharterNumbers(charters)).toEqual(["EXC-003", "EXC-004"]);
  });

  it("fixes the mixed digit-width behavior (EXC-001 and EXC-1)", () => {
    // widths 3 (from 001) and 1 (from 1): width 3 has count 1, width 1 has count 1 too via other ids
    const charters = [
      charter({ charterId: "EXC-001" }),
      charter({ charterId: "EXC-003" }),
      charter({ charterId: "EXC-1" }),
    ];
    // widths: "001"->3 (count1), "003"->3 (count1), "1"->1 (count1)
    // width 3 has count 2, so width=3 wins; values present: 1,3,1 -> present {1,3}; min=1 max=3
    expect(findMissingCharterNumbers(charters)).toEqual(["EXC-002"]);
  });

  it("returns empty when there is nothing parseable", () => {
    expect(findMissingCharterNumbers([charter({ charterId: "X-1" })])).toEqual([]);
  });
});

describe("findUnknownCharterAreaIds", () => {
  it("detects unknown area ids", () => {
    const charters = [charter({ charterId: "EXC-001", areaId: "ECA-99" })];
    expect(findUnknownCharterAreaIds(charters)).toEqual([{ charterId: "EXC-001", areaId: "ECA-99" }]);
  });

  it("returns empty for known area ids", () => {
    const charters = [charter({ charterId: "EXC-001", areaId: "ECA-01" })];
    expect(findUnknownCharterAreaIds(charters)).toEqual([]);
  });
});

describe("findUnresolvedCharterRefs", () => {
  it("detects refs that resolve to neither testConditions nor risks", () => {
    const input: GenerateExploratoryChartersInput = {
      testConditions: [condition({ id: "TC-001" })],
      risks: [risk({ id: "RK-001" })],
      charters: [charter({ charterId: "EXC-001", derivedFrom: ["ZZ-999"] })],
    };
    expect(findUnresolvedCharterRefs(input)).toEqual([
      { charterId: "EXC-001", ref: "ZZ-999", expectedKind: "testConditions[].id / risks[].id" },
    ]);
  });

  it("resolves refs matching either pool", () => {
    const input: GenerateExploratoryChartersInput = {
      testConditions: [condition({ id: "TC-001" })],
      risks: [risk({ id: "RK-001" })],
      charters: [charter({ charterId: "EXC-001", derivedFrom: ["TC-001", "RK-001"] })],
    };
    expect(findUnresolvedCharterRefs(input)).toEqual([]);
  });
});

describe("findUnusedCharterAreas", () => {
  it("returns unused areas, filtered by areaIds", () => {
    const charters = [charter({ charterId: "EXC-001", areaId: "ECA-01" })];
    const filtered = findUnusedCharterAreas(charters, undefined, ["ECA-01", "ECA-02"]);
    expect(filtered.map((a) => a.id)).toEqual(["ECA-02"]);
  });

  it("returns all catalog areas minus used ones when areaIds is omitted", () => {
    const charters = [charter({ charterId: "EXC-001", areaId: "ECA-01" })];
    const all = findUnusedCharterAreas(charters);
    expect(all.length).toBe(exploratoryCharterCatalog.charterAreas.length - 1);
    expect(all.map((a) => a.id)).not.toContain("ECA-01");
  });
});

describe("findUncoveredHighPriorityConditionIds", () => {
  it("detects high priority conditions not referenced by any charter", () => {
    const conditions = [
      condition({ id: "TC-001", priority: "高" }),
      condition({ id: "TC-002", priority: "低" }),
    ];
    const charters = [charter({ charterId: "EXC-001", derivedFrom: ["TC-002"] })];
    expect(findUncoveredHighPriorityConditionIds(conditions, charters)).toEqual(["TC-001"]);
  });

  it("returns empty when the high priority condition is referenced", () => {
    const conditions = [condition({ id: "TC-001", priority: "高" })];
    const charters = [charter({ charterId: "EXC-001", derivedFrom: ["TC-001"] })];
    expect(findUncoveredHighPriorityConditionIds(conditions, charters)).toEqual([]);
  });

  it("excludes ids passed as the third argument (deterministically covered)", () => {
    const conditions = [
      condition({ id: "TC-001", priority: "高" }),
      condition({ id: "TC-002", priority: "高" }),
    ];
    const charters: ExploratoryCharterInput[] = [];
    expect(findUncoveredHighPriorityConditionIds(conditions, charters, ["TC-001"])).toEqual([
      "TC-002",
    ]);
  });

  it("behaves the same as before when the third argument is omitted or an empty array", () => {
    const conditions = [
      condition({ id: "TC-001", priority: "高" }),
      condition({ id: "TC-002", priority: "低" }),
    ];
    const charters = [charter({ charterId: "EXC-001", derivedFrom: ["TC-002"] })];
    expect(findUncoveredHighPriorityConditionIds(conditions, charters)).toEqual(["TC-001"]);
    expect(findUncoveredHighPriorityConditionIds(conditions, charters, [])).toEqual(["TC-001"]);
  });

  it("has no side effect when the exclusion list mixes low/medium priority or unknown ids", () => {
    const conditions = [
      condition({ id: "TC-001", priority: "高" }),
      condition({ id: "TC-002", priority: "低" }),
    ];
    const charters: ExploratoryCharterInput[] = [];
    expect(
      findUncoveredHighPriorityConditionIds(conditions, charters, ["TC-002", "TC-999"])
    ).toEqual(["TC-001"]);
  });

  it("does not list a condition already referenced by derivedFrom even if also excluded", () => {
    const conditions = [condition({ id: "TC-001", priority: "高" })];
    const charters = [charter({ charterId: "EXC-001", derivedFrom: ["TC-001"] })];
    expect(findUncoveredHighPriorityConditionIds(conditions, charters, ["TC-001"])).toEqual([]);
  });

  it("does not mutate its input arguments", () => {
    const conditions = [condition({ id: "TC-001", priority: "高" })];
    const charters = [charter({ charterId: "EXC-001", derivedFrom: ["TC-002"] })];
    const excluded = ["TC-001"];
    const conditionsCopy = JSON.parse(JSON.stringify(conditions));
    const chartersCopy = JSON.parse(JSON.stringify(charters));
    const excludedCopy = [...excluded];
    findUncoveredHighPriorityConditionIds(conditions, charters, excluded);
    expect(conditions).toEqual(conditionsCopy);
    expect(charters).toEqual(chartersCopy);
    expect(excluded).toEqual(excludedCopy);
  });
});

describe("findDeterministicallyCoveredHighPriorityConditionIds", () => {
  it("returns only the high priority condition ids actually excluded, in input order", () => {
    const conditions = [
      condition({ id: "TC-001", priority: "高" }),
      condition({ id: "TC-002", priority: "低" }),
      condition({ id: "TC-003", priority: "高" }),
    ];
    const charters: ExploratoryCharterInput[] = [];
    expect(
      findDeterministicallyCoveredHighPriorityConditionIds(conditions, charters, [
        "TC-003",
        "TC-001",
        "TC-002",
      ])
    ).toEqual(["TC-001", "TC-003"]);
  });

  it("does not return a condition already referenced by derivedFrom", () => {
    const conditions = [condition({ id: "TC-001", priority: "高" })];
    const charters = [charter({ charterId: "EXC-001", derivedFrom: ["TC-001"] })];
    expect(
      findDeterministicallyCoveredHighPriorityConditionIds(conditions, charters, ["TC-001"])
    ).toEqual([]);
  });

  it("returns an empty array when the third argument is omitted", () => {
    const conditions = [condition({ id: "TC-001", priority: "高" })];
    const charters: ExploratoryCharterInput[] = [];
    expect(findDeterministicallyCoveredHighPriorityConditionIds(conditions, charters)).toEqual([]);
  });
});

describe("findUnknownDeterministicallyCoveredConditionIds", () => {
  it("returns only unknown ids, in input order, with duplicates collapsed", () => {
    const conditions = [condition({ id: "TC-001" }), condition({ id: "TC-002" })];
    expect(
      findUnknownDeterministicallyCoveredConditionIds(conditions, [
        "TC-999",
        "TC-001",
        "TC-999",
        "TC-888",
      ])
    ).toEqual(["TC-999", "TC-888"]);
  });

  it("returns an empty array when all ids exist or the second argument is omitted", () => {
    const conditions = [condition({ id: "TC-001" }), condition({ id: "TC-002" })];
    expect(findUnknownDeterministicallyCoveredConditionIds(conditions, ["TC-001"])).toEqual([]);
    expect(findUnknownDeterministicallyCoveredConditionIds(conditions)).toEqual([]);
  });

  it("does not mutate its input arguments", () => {
    const conditions = [condition({ id: "TC-001" })];
    const ids = ["TC-999", "TC-001"];
    const conditionsCopy = JSON.parse(JSON.stringify(conditions));
    const idsCopy = [...ids];
    findUnknownDeterministicallyCoveredConditionIds(conditions, ids);
    expect(conditions).toEqual(conditionsCopy);
    expect(ids).toEqual(idsCopy);
  });
});

describe("findUncoveredRiskIds", () => {
  it("detects risks not referenced by any charter", () => {
    const risks = [risk({ id: "RK-001" }), risk({ id: "RK-002" })];
    const charters = [charter({ charterId: "EXC-001", derivedFrom: ["RK-001"] })];
    expect(findUncoveredRiskIds(risks, charters)).toEqual(["RK-002"]);
  });

  it("returns empty when all risks are referenced", () => {
    const risks = [risk({ id: "RK-001" })];
    const charters = [charter({ charterId: "EXC-001", derivedFrom: ["RK-001"] })];
    expect(findUncoveredRiskIds(risks, charters)).toEqual([]);
  });
});

describe("findUncoveredRiskIds with explicit-kind derivedFrom", () => {
  it("counts an explicit risk-kind reference as covering the matching risk id", () => {
    const risks = [risk({ id: "RK-001" })];
    const charters = [charter({ charterId: "EXC-001", derivedFrom: [{ kind: "risk", id: "RK-001" }] })];
    expect(findUncoveredRiskIds(risks, charters)).toEqual([]);
  });
});

describe("findUnresolvedCharterRefs with explicit-kind derivedFrom", () => {
  it("resolves an explicit risk-kind reference present in risks[]", () => {
    const input: GenerateExploratoryChartersInput = {
      testConditions: [condition({ id: "TC-001" })],
      risks: [risk({ id: "RK-001" })],
      charters: [charter({ charterId: "EXC-001", derivedFrom: [{ kind: "risk", id: "RK-001" }] })],
    };
    expect(findUnresolvedCharterRefs(input)).toEqual([]);
  });
});

describe("findChartersWithoutTimebox", () => {
  it("detects charters missing timeboxMinutes", () => {
    const charters = [
      charter({ charterId: "EXC-001" }),
      charter({ charterId: "EXC-002", timeboxMinutes: 30 }),
    ];
    expect(findChartersWithoutTimebox(charters)).toEqual(["EXC-001"]);
  });

  it("returns empty when all charters have a timebox", () => {
    const charters = [charter({ charterId: "EXC-001", timeboxMinutes: 30 })];
    expect(findChartersWithoutTimebox(charters)).toEqual([]);
  });
});

describe("computeTimeboxSummary", () => {
  it("stays within budget", () => {
    const charters = [
      charter({ charterId: "EXC-001", timeboxMinutes: 30 }),
      charter({ charterId: "EXC-002", timeboxMinutes: 30 }),
    ];
    expect(computeTimeboxSummary(charters, 90)).toEqual({
      totalMinutes: 60,
      budgetMinutes: 90,
      overBudget: false,
      excessMinutes: 0,
    });
  });

  it("reports overage when total exceeds the budget", () => {
    const charters = [
      charter({ charterId: "EXC-001", timeboxMinutes: 60 }),
      charter({ charterId: "EXC-002", timeboxMinutes: 60 }),
    ];
    expect(computeTimeboxSummary(charters, 90)).toEqual({
      totalMinutes: 120,
      budgetMinutes: 90,
      overBudget: true,
      excessMinutes: 30,
    });
  });

  it("treats an unspecified budget as no overage", () => {
    const charters = [charter({ charterId: "EXC-001", timeboxMinutes: 60 })];
    expect(computeTimeboxSummary(charters)).toEqual({
      totalMinutes: 60,
      budgetMinutes: undefined,
      overBudget: false,
      excessMinutes: 0,
    });
  });
});

describe("findSubjectiveMissionStatements", () => {
  it("detects subjective terms in mission statements", () => {
    const charters = [charter({ charterId: "EXC-001", mission: "適切に動作することを確認する" })];
    const findings = findSubjectiveMissionStatements(charters);
    expect(findings).toEqual([
      {
        charterId: "EXC-001",
        severity: "medium",
        term: "適切に",
        detail: "ミッション文に主観語「適切に」が含まれる。観測可能な具体的な確認内容・操作内容に置き換えること。",
      },
    ]);
  });

  it("returns empty when the mission has no subjective terms", () => {
    const charters = [charter({ charterId: "EXC-001", mission: "枚数上限付近の購入操作を試す" })];
    expect(findSubjectiveMissionStatements(charters)).toEqual([]);
  });
});
