import { describe, expect, it } from "vitest";
import {
  evaluateStakeholderWeighting,
  findFocusConditionPriorityIssues,
  findFocusPersonasWithoutConditions,
  findFocusPersonasWithoutTestRequirements,
  hasAnyStakeholderWeighting,
  isKnownStakeholderAxisValue,
  resolveStakeholderHandlingClass,
  stakeholderWeightingAxisLabels,
} from "../src/stakeholderWeightingAnalysis.js";
import { personaJourneyFrame } from "../src/resources/personaJourneyFrame.js";
import type {
  ExtractTestConditionsInput,
  GenerateUserStoryMapInput,
  TestConditionPersonaInput,
} from "../src/types.js";

const swf = personaJourneyFrame.stakeholderWeightingFrame;

function persona(
  id: string,
  weighting?: TestConditionPersonaInput["stakeholderWeighting"]
): TestConditionPersonaInput {
  return { id, role: `役割 ${id}`, stakeholderWeighting: weighting };
}

function evaluateOne(weighting?: TestConditionPersonaInput["stakeholderWeighting"]) {
  return evaluateStakeholderWeighting([persona("P-001", weighting)])[0];
}

describe("stakeholderWeightingAxisLabels", () => {
  it("takes the axis names from the frame in influence -> interest order", () => {
    expect(stakeholderWeightingAxisLabels).toEqual([
      { axis: "influence", nameJa: swf.influenceAxis.nameJa },
      { axis: "interest", nameJa: swf.interestAxis.nameJa },
    ]);
  });
});

describe("isKnownStakeholderAxisValue", () => {
  it("accepts only the values declared in the frame levels", () => {
    for (const level of swf.influenceAxis.levels) {
      expect(isKnownStakeholderAxisValue(level.value, "influence")).toBe(true);
    }
    expect(isKnownStakeholderAxisValue(0, "influence")).toBe(false);
    expect(isKnownStakeholderAxisValue(5, "interest")).toBe(false);
  });
});

describe("resolveStakeholderHandlingClass", () => {
  it("resolves the handling class from the matrix cell", () => {
    expect(resolveStakeholderHandlingClass(3, 3)).toEqual({ id: "SWC-01", key: "focus" });
    expect(resolveStakeholderHandlingClass(4, 1)).toEqual({ id: "SWC-02", key: "standard" });
    expect(resolveStakeholderHandlingClass(2, 2)).toEqual({ id: "SWC-03", key: "reference" });
  });

  it("returns undefined for values outside the matrix or for unevaluated axes", () => {
    expect(resolveStakeholderHandlingClass(5, 1)).toBeUndefined();
    expect(resolveStakeholderHandlingClass(undefined, 3)).toBeUndefined();
    expect(resolveStakeholderHandlingClass(3, undefined)).toBeUndefined();
  });

  it("covers every matrix cell with a consistent score and a resolvable class", () => {
    expect(swf.matrix).toHaveLength(swf.influenceAxis.levels.length * swf.interestAxis.levels.length);
    for (const cell of swf.matrix) {
      expect(cell.score).toBe(cell.influence * cell.interest);
      expect(resolveStakeholderHandlingClass(cell.influence, cell.interest)).toBeDefined();
    }
  });
});

describe("evaluateStakeholderWeighting", () => {
  it("reports both axes as missing when stakeholderWeighting is omitted", () => {
    const result = evaluateOne(undefined);
    expect(result.missingAxes).toEqual([swf.influenceAxis.nameJa, swf.interestAxis.nameJa]);
    expect(result.derivedScore).toBeUndefined();
    expect(result.derivedClassId).toBeUndefined();
  });

  it("reports only the unevaluated axis when one axis is given", () => {
    const result = evaluateOne({ influence: 4, rationale: ["最終承認者"] });
    expect(result.missingAxes).toEqual([swf.interestAxis.nameJa]);
    expect(result.derivedClassId).toBeUndefined();
    expect(result.derivedScore).toBeUndefined();
  });

  it("reports out-of-range axis values without deriving a score", () => {
    const result = evaluateOne({ influence: 5, interest: 4, rationale: ["根拠"] });
    expect(result.outOfRangeAxes).toEqual([{ axis: swf.influenceAxis.nameJa, value: 5 }]);
    expect(result.derivedScore).toBeUndefined();
    expect(result.derivedClassId).toBeUndefined();
  });

  it("flags a declared handling class that disagrees with the matrix", () => {
    const result = evaluateOne({
      influence: 1,
      interest: 1,
      handlingClassId: "SWC-01",
      rationale: ["根拠"],
    });
    expect(result.classMismatch).toBe(true);
    expect(result.derivedClassId).toBe("SWC-03");
  });

  it("flags a declared score that disagrees with influence x interest", () => {
    expect(evaluateOne({ influence: 3, interest: 3, score: 12, rationale: ["根拠"] }).scoreMismatch).toBe(
      true
    );
    expect(evaluateOne({ influence: 3, interest: 3, score: 9, rationale: ["根拠"] }).scoreMismatch).toBe(
      false
    );
  });

  it("flags missing rationale for empty, blank-only and omitted lists", () => {
    expect(evaluateOne({ influence: 3, interest: 3, rationale: [] }).missingRationale).toBe(true);
    expect(evaluateOne({ influence: 3, interest: 3, rationale: ["  "] }).missingRationale).toBe(true);
    expect(evaluateOne({ influence: 3, interest: 3 }).missingRationale).toBe(true);
    expect(
      evaluateOne({ influence: 3, interest: 3, rationale: ["現場ヒアリング"] }).missingRationale
    ).toBe(false);
  });

  it("flags screening records without a reason", () => {
    const result = evaluateOne({
      influence: 1,
      interest: 1,
      rationale: ["根拠"],
      excludedByScreening: true,
    });
    expect(result.missingExclusionReason).toBe(true);
    expect(
      evaluateOne({
        influence: 1,
        interest: 1,
        rationale: ["根拠"],
        excludedByScreening: true,
        exclusionReason: "工数不足のため影響確認のみ",
      }).missingExclusionReason
    ).toBe(false);
  });

  it("flags a focus-class persona excluded by screening", () => {
    const result = evaluateOne({
      influence: 4,
      interest: 4,
      rationale: ["根拠"],
      excludedByScreening: true,
      exclusionReason: "工数不足",
    });
    expect(result.focusExcluded).toBe(true);
    expect(result.unevaluatedButExcluded).toBe(false);
  });

  it("flags an unevaluated persona treated as screened out", () => {
    const result = evaluateOne({ excludedByScreening: true, exclusionReason: "対象外" });
    expect(result.unevaluatedButExcluded).toBe(true);
    expect(result.focusExcluded).toBe(false);
  });

  it("keeps the persona input order and does not mutate the input", () => {
    const personas = [
      persona("P-003", { influence: 4, interest: 4, rationale: ["根拠"] }),
      persona("P-001"),
      persona("P-002", { influence: 2, interest: 2, rationale: ["根拠"] }),
    ];
    const snapshot = JSON.stringify(personas);
    expect(evaluateStakeholderWeighting(personas).map((e) => e.personaId)).toEqual([
      "P-003",
      "P-001",
      "P-002",
    ]);
    expect(JSON.stringify(personas)).toBe(snapshot);
  });
});

describe("hasAnyStakeholderWeighting", () => {
  it("is true only when at least one persona declares a weighting", () => {
    expect(hasAnyStakeholderWeighting(undefined)).toBe(false);
    expect(hasAnyStakeholderWeighting([persona("P-001")])).toBe(false);
    expect(hasAnyStakeholderWeighting([persona("P-001"), persona("P-002", { influence: 1 })])).toBe(true);
  });
});

describe("findFocusPersonasWithoutTestRequirements", () => {
  const input: GenerateUserStoryMapInput = {
    personas: [
      persona("P-001", { influence: 4, interest: 4, rationale: ["根拠"] }),
      persona("P-002", { influence: 4, interest: 1, rationale: ["根拠"] }),
      persona("P-003", { influence: 3, interest: 3, rationale: ["根拠"] }),
    ],
    testRequirements: [
      {
        id: "TR-01",
        personaId: "P-003",
        before: "現状",
        after: "将来",
        testRequirement: "確認内容",
      },
    ],
  };

  it("only reports focus-class personas without any test requirement, in input order", () => {
    expect(findFocusPersonasWithoutTestRequirements(input)).toEqual(["P-001"]);
  });

  it("does not mutate the input", () => {
    const snapshot = JSON.stringify(input);
    findFocusPersonasWithoutTestRequirements(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("findFocusPersonasWithoutConditions", () => {
  function inputWith(source: "stakeholder" | "risk"): ExtractTestConditionsInput {
    return {
      requirementIds: ["R-001"],
      personas: [persona("P-001", { influence: 4, interest: 4, rationale: ["根拠"] })],
      testConditions: [
        {
          id: "TC-001",
          target: "改札機",
          perspectiveCategoryId: "TPC-03",
          statement: "条件文",
          source,
          derivedFrom: ["P-001"],
          priority: "高",
        },
      ],
    };
  }

  it("accepts a source=stakeholder condition referencing the persona", () => {
    expect(findFocusPersonasWithoutConditions(inputWith("stakeholder"))).toEqual([]);
  });

  it("does not accept a non-stakeholder condition that merely references the persona id", () => {
    expect(findFocusPersonasWithoutConditions(inputWith("risk"))).toEqual(["P-001"]);
  });
});

describe("findFocusConditionPriorityIssues", () => {
  function inputWithCondition(
    condition: Partial<ExtractTestConditionsInput["testConditions"][number]>
  ): ExtractTestConditionsInput {
    return {
      requirementIds: ["R-001"],
      personas: [persona("P-001", { influence: 4, interest: 4, rationale: ["根拠"] })],
      testConditions: [
        {
          id: "TC-001",
          target: "改札機",
          perspectiveCategoryId: "TPC-03",
          statement: "条件文",
          source: "stakeholder",
          derivedFrom: ["P-001"],
          ...condition,
        },
      ],
    };
  }

  it("flags a lowered priority without any reason", () => {
    expect(findFocusConditionPriorityIssues(inputWithCondition({ priority: "低" }))).toEqual([
      { conditionId: "TC-001", personaId: "P-001", declaredPriority: "低", defaultPriority: "高" },
    ]);
  });

  it("accepts a lowered priority backed by rationale or priorityDeviationReason", () => {
    expect(
      findFocusConditionPriorityIssues(inputWithCondition({ priority: "低", rationale: "代替手段あり" }))
    ).toEqual([]);
    expect(
      findFocusConditionPriorityIssues(
        inputWithCondition({ priority: "低", priorityDeviationReason: "リスク側を優先" })
      )
    ).toEqual([]);
  });

  it("does not flag the default priority or an unset priority", () => {
    expect(findFocusConditionPriorityIssues(inputWithCondition({ priority: "高" }))).toEqual([]);
    expect(findFocusConditionPriorityIssues(inputWithCondition({}))).toEqual([]);
  });

  it("reports one issue per condition in testConditions order without mutating the input", () => {
    const input: ExtractTestConditionsInput = {
      requirementIds: ["R-001"],
      personas: [
        persona("P-001", { influence: 4, interest: 4, rationale: ["根拠"] }),
        persona("P-002", { influence: 3, interest: 4, rationale: ["根拠"] }),
      ],
      testConditions: [
        {
          id: "TC-002",
          target: "改札機",
          perspectiveCategoryId: "TPC-03",
          statement: "条件文",
          source: "stakeholder",
          derivedFrom: ["P-002", "P-001"],
          priority: "中",
        },
        {
          id: "TC-001",
          target: "改札機",
          perspectiveCategoryId: "TPC-03",
          statement: "条件文",
          source: "stakeholder",
          derivedFrom: ["P-001"],
          priority: "低",
        },
      ],
    };
    const snapshot = JSON.stringify(input);
    expect(findFocusConditionPriorityIssues(input)).toEqual([
      { conditionId: "TC-002", personaId: "P-002", declaredPriority: "中", defaultPriority: "高" },
      { conditionId: "TC-001", personaId: "P-001", declaredPriority: "低", defaultPriority: "高" },
    ]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
