import { describe, expect, it } from "vitest";
import {
  buildBoundaryReexpansion,
  buildImpactedArtifacts,
  buildParameterReferenceIndex,
  diffThresholdParameters,
  findDanglingCoverageTargetRefs,
  resolveBoundaryVariables,
  summarizeThresholdChange,
} from "../src/thresholdChangeAnalysis.js";
import type {
  ReexpandThresholdChangesInput,
  ThresholdBoundaryBinding,
  ThresholdChangeFinding,
  ThresholdChangeTestCase,
  TestCaseParameter,
} from "../src/types.js";

describe("diffThresholdParameters", () => {
  it("classifies all 6 change kinds", () => {
    const before: TestCaseParameter[] = [
      { name: "MAX_TICKETS", value: "10", unit: "枚" },
      { name: "MIN_AGE", value: "18", unit: "歳" },
      { name: "TIMEOUT", value: "30", unit: "秒" },
      { name: "REMOVED_PARAM", value: "5" },
      { name: "UNCHANGED_PARAM", value: "1", unit: "件" },
    ];
    const after: TestCaseParameter[] = [
      { name: "MAX_TICKETS", value: "20", unit: "枚" }, // value-changed
      { name: "MIN_AGE", value: "18", unit: "才" }, // unit-changed
      { name: "TIMEOUT", value: "60", unit: "分" }, // value-unit-changed
      { name: "UNCHANGED_PARAM", value: "1", unit: "件" }, // unchanged
      { name: "NEW_PARAM", value: "100" }, // added
    ];

    const rows = diffThresholdParameters(before, after);
    const byName = new Map(rows.map((r) => [r.name, r]));

    expect(byName.get("MAX_TICKETS")?.kind).toBe("value-changed");
    expect(byName.get("MIN_AGE")?.kind).toBe("unit-changed");
    expect(byName.get("TIMEOUT")?.kind).toBe("value-unit-changed");
    expect(byName.get("UNCHANGED_PARAM")?.kind).toBe("unchanged");
    expect(byName.get("NEW_PARAM")?.kind).toBe("added");
    expect(byName.get("REMOVED_PARAM")?.kind).toBe("removed");
  });
});

describe("resolveBoundaryVariables", () => {
  const parameters: TestCaseParameter[] = [{ name: "MAX_TICKETS", value: "10" }];

  it("reports parameter-not-found when minParameterName is undefined in the parameter table", () => {
    const bindings: ThresholdBoundaryBinding[] = [
      { name: "枚数", minParameterName: "DOES_NOT_EXIST", max: 10 },
    ];
    const { issues, variables } = resolveBoundaryVariables(bindings, parameters, "before");
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("parameter-not-found");
    expect(variables).toHaveLength(0);
  });

  it("reports non-numeric-parameter when the bound parameter value is not numeric", () => {
    const nonNumericParams: TestCaseParameter[] = [{ name: "MAX_TICKETS", value: "abc" }];
    const bindings: ThresholdBoundaryBinding[] = [
      { name: "枚数", minParameterName: "MAX_TICKETS", max: 10 },
    ];
    const { issues, variables } = resolveBoundaryVariables(bindings, nonNumericParams, "after");
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("non-numeric-parameter");
    expect(variables).toHaveLength(0);
  });

  it("reports missing-bound when neither the parameter name nor the literal is given", () => {
    const bindings: ThresholdBoundaryBinding[] = [{ name: "枚数", max: 10 }];
    const { issues, variables } = resolveBoundaryVariables(bindings, parameters, "before");
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("missing-bound");
    expect(variables).toHaveLength(0);
  });
});

describe("buildBoundaryReexpansion", () => {
  const bindings: ThresholdBoundaryBinding[] = [
    { name: "枚数", minParameterName: "MIN_TICKETS", maxParameterName: "MAX_TICKETS" },
  ];

  it("marks a row as changed/added/removed/unchanged depending on the before/after boundary rows", () => {
    const before: TestCaseParameter[] = [
      { name: "MIN_TICKETS", value: "1" },
      { name: "MAX_TICKETS", value: "10" },
    ];
    const after: TestCaseParameter[] = [
      { name: "MIN_TICKETS", value: "1" },
      { name: "MAX_TICKETS", value: "20" },
    ];

    const { rows } = buildBoundaryReexpansion(bindings, before, after, "three");
    const upper = rows.find((r) => r.label === "上限");
    const lower = rows.find((r) => r.label === "下限");
    expect(upper?.verdict).toBe("changed");
    expect(upper?.beforeTargetId).toBe("BV:枚数:10");
    expect(upper?.afterTargetId).toBe("BV:枚数:20");
    expect(lower?.verdict).toBe("unchanged");
  });
});

describe("buildParameterReferenceIndex", () => {
  const diffRows = diffThresholdParameters(
    [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
    [{ name: "MAX_TICKETS", value: "20", unit: "枚" }]
  );

  it("prioritizes name match over stale-literal and current-literal, and uses the expected place notation", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [],
      parametersAfter: [],
      testCases: [
        {
          caseId: "TCS-001",
          title: "MAX_TICKETS を超えるチケット枚数のテスト",
          steps: [{ no: 1, action: "10枚を入力する", expected: "20枚まで受理される" }],
        },
      ],
    };
    const refs = buildParameterReferenceIndex(input, diffRows);
    const titleRef = refs.find((r) => r.place === "title");
    expect(titleRef?.form).toBe("name");

    const staleRef = refs.find((r) => r.place === "steps[0].action");
    expect(staleRef?.form).toBe("stale-literal");
    expect(staleRef?.matchedText).toBe("10");

    const currentRef = refs.find((r) => r.place === "steps[0].expected");
    expect(currentRef?.form).toBe("current-literal");
    expect(currentRef?.matchedText).toBe("20");
  });
});

describe("findDanglingCoverageTargetRefs", () => {
  it("flags cases that reference a stale coverage target id", () => {
    const testCases: ThresholdChangeTestCase[] = [
      { caseId: "TCS-001", title: "上限テスト", coverageTargets: ["BV:枚数:10"] },
    ];
    const boundaryRows = [
      {
        variable: "枚数",
        label: "上限",
        validity: "valid" as const,
        beforeValue: 10,
        afterValue: 20,
        beforeTargetId: "BV:枚数:10",
        afterTargetId: "BV:枚数:20",
        verdict: "changed" as const,
      },
    ];
    const findings = findDanglingCoverageTargetRefs(testCases, boundaryRows);
    expect(findings).toHaveLength(1);
    expect(findings[0].categoryId).toBe("TCI-02");
    expect(findings[0].severity).toBe("high");
    expect(findings[0].suggestion).toBe("BV:枚数:10 → BV:枚数:20");
  });
});

describe("buildImpactedArtifacts", () => {
  it("marks unaffected artifacts as 影響なし", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [],
      parametersAfter: [],
      testConditions: [{ id: "TC-001", statement: "無関係な条件" }],
      testCases: [{ caseId: "TCS-001", title: "無関係なケース" }],
    };
    const rows = buildImpactedArtifacts(input, []);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.verdict === "影響なし")).toBe(true);
  });

  it("marks artifacts with a high-severity finding as 要修正 and medium-only as 要再確認", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [],
      parametersAfter: [],
      testConditions: [
        { id: "TC-001", statement: "高重大度の条件" },
        { id: "TC-002", statement: "中重大度の条件" },
      ],
    };
    const findings: ThresholdChangeFinding[] = [
      {
        categoryId: "TCI-01",
        severity: "high",
        ownerKind: "testCondition",
        ownerId: "TC-001",
        parameterName: "MAX_TICKETS",
        places: ["statement"],
        detail: "旧値の直値が残存",
      },
      {
        categoryId: "TCI-03",
        severity: "medium",
        ownerKind: "testCondition",
        ownerId: "TC-002",
        parameterName: "MAX_TICKETS",
        places: ["statement"],
        detail: "要再確認",
      },
    ];
    const rows = buildImpactedArtifacts(input, findings);
    expect(rows.find((r) => r.ownerId === "TC-001")?.verdict).toBe("要修正");
    expect(rows.find((r) => r.ownerId === "TC-002")?.verdict).toBe("要再確認");
  });
});

describe("summarizeThresholdChange", () => {
  it("aggregates counts from diff rows, reexpansion rows, findings, and impacted artifacts", () => {
    const diffRows = diffThresholdParameters(
      [{ name: "A", value: "1" }, { name: "REMOVED", value: "9" }],
      [{ name: "A", value: "2" }, { name: "NEW", value: "3" }]
    );
    const boundaryRows = [
      {
        variable: "A",
        label: "上限",
        validity: "valid" as const,
        beforeValue: 1,
        afterValue: 2,
        beforeTargetId: "BV:A:1",
        afterTargetId: "BV:A:2",
        verdict: "changed" as const,
      },
    ];
    const findings: ThresholdChangeFinding[] = [
      { categoryId: "TCI-01", severity: "high", places: [], detail: "d" },
      { categoryId: "TCI-02", severity: "high", places: [], detail: "d" },
      { categoryId: "TCI-08", severity: "high", places: [], detail: "d" },
    ];
    const impacted = [
      {
        ownerKind: "testCondition" as const,
        ownerId: "TC-001",
        title: "t",
        parameterNames: [],
        categoryIds: [],
        verdict: "要修正" as const,
      },
      {
        ownerKind: "testCondition" as const,
        ownerId: "TC-002",
        title: "t",
        parameterNames: [],
        categoryIds: [],
        verdict: "要再確認" as const,
      },
    ];

    const summary = summarizeThresholdChange(diffRows, boundaryRows, [], findings, impacted);
    expect(summary.changedParameterCount).toBe(1);
    expect(summary.addedParameterCount).toBe(1);
    expect(summary.removedParameterCount).toBe(1);
    expect(summary.reexpandedTargetCount).toBe(1);
    expect(summary.staleLiteralCount).toBe(1);
    expect(summary.danglingTargetRefCount).toBe(1);
    expect(summary.mustFixArtifactCount).toBe(1);
    expect(summary.recheckArtifactCount).toBe(1);
    expect(summary.bindingIssueCount).toBe(1);
  });
});
