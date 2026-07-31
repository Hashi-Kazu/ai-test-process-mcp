import { describe, expect, it } from "vitest";
import {
  buildCoverageUniverse,
  computeCoverageRows,
  extractQuotedStrings,
  findHardcodedParameterValues,
  findMissingCaseNumbers,
  findStepGranularityIssues,
  findSubjectiveExpectedResults,
  findUngroundedQuotations,
  findUnresolvedCaseRefs,
  findUnsubstantiatedCoverageTargets,
  normalizeForGrounding,
  resolveCaseSourceRefs,
  stripUnsubstantiatedCoverageTargets,
} from "../src/testCaseAnalysis.js";
import type {
  GenerateTestCasesInput,
  RequirementSourceRef,
  TestBasisDocument,
  TestCaseCoverageTarget,
  TestCaseParameter,
  TestCaseSourceCondition,
  TestCaseSpec,
} from "../src/types.js";

function baseCase(overrides: Partial<TestCaseSpec> & { caseId: string }): TestCaseSpec {
  return {
    title: "タイトル",
    testConditionId: "TC-001",
    derivedFrom: ["R-001"],
    techniqueId: "boundary-value-analysis",
    coverageTargets: [],
    preconditions: [{ name: "state", value: "初期状態" }],
    steps: [{ no: 1, action: "操作する", expected: "結果が表示される" }],
    ...overrides,
  };
}

describe("buildCoverageUniverse", () => {
  it("generates BV: ids from boundaryVariables", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      boundaryVariables: [{ name: "枚数", min: 1, max: 10 }],
      boundaryMode: "two",
    };
    const universe = buildCoverageUniverse(input);
    const ids = universe.map((t) => t.id);
    expect(ids).toContain("BV:枚数:0");
    expect(ids).toContain("BV:枚数:1");
    expect(ids).toContain("BV:枚数:10");
    expect(ids).toContain("BV:枚数:11");
  });

  it("generates EP: ids from equivalenceVariables", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      equivalenceVariables: [
        {
          name: "年齢",
          validClasses: [{ label: "成人", representative: "20" }],
          invalidClasses: [{ label: "未成年", representative: "10" }],
        },
      ],
    };
    const universe = buildCoverageUniverse(input);
    const ids = universe.map((t) => t.id);
    expect(ids).toContain("EP:年齢:成人");
    expect(ids).toContain("EP:年齢:未成年");
  });

  it("generates ST: ids from stateTransition", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      stateTransition: {
        states: [
          { id: "S1", nameJa: "未処理" },
          { id: "S2", nameJa: "処理済" },
        ],
        transitions: [{ id: "ST-01", from: "S1", to: "S2", event: "確定" }],
      },
    };
    const universe = buildCoverageUniverse(input);
    expect(universe.map((t) => t.id)).toContain("ST:ST-01");
    expect(universe.find((t) => t.id === "ST:ST-01")?.description).toBe("S1 --確定--> S2");
  });

  it("generates DT: ids from decisionTable, appended after BV/EP/ST", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      boundaryVariables: [{ name: "枚数", min: 1, max: 10 }],
      boundaryMode: "two",
      equivalenceVariables: [
        { name: "年齢", validClasses: [{ label: "成人", representative: "20" }] },
      ],
      stateTransition: {
        states: [
          { id: "S1", nameJa: "未処理" },
          { id: "S2", nameJa: "処理済" },
        ],
        transitions: [{ id: "ST-01", from: "S1", to: "S2", event: "確定" }],
      },
      decisionTable: {
        conditions: [{ id: "C1", statement: "券種", levels: ["おとな", "こども"] }],
        actions: [{ id: "A1", statement: "入場可否" }],
        rules: [{ when: {}, actions: { A1: "Y" } }],
      },
    };
    const universe = buildCoverageUniverse(input);
    const ids = universe.map((t) => t.id);
    expect(ids.slice(0, 4)).toEqual(["BV:枚数:0", "BV:枚数:1", "BV:枚数:10", "BV:枚数:11"]);
    expect(ids).toContain("EP:年齢:成人");
    expect(ids).toContain("ST:ST-01");
    expect(ids).toContain("DT:MAIN:R1");
    // BV/EP/ST の順序・IDは decisionTable 追加後も変わらない。
    expect(ids.indexOf("ST:ST-01")).toBeLessThan(ids.indexOf("DT:MAIN:R1"));
  });

  it("merges additionalCoverageTargets, keeping the first on id collision", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      additionalCoverageTargets: [
        { id: "X:1", techniqueId: "pairwise", description: "first", origin: "宣言" },
        { id: "X:1", techniqueId: "pairwise", description: "second", origin: "宣言" },
      ],
    };
    const universe = buildCoverageUniverse(input);
    expect(universe).toHaveLength(1);
    expect(universe[0].description).toBe("first");
  });
});

describe("computeCoverageRows", () => {
  it("computes total/covered/uncovered/ratioPercent per technique", () => {
    const universe: TestCaseCoverageTarget[] = [
      { id: "BV:x:1", techniqueId: "boundary-value-analysis", description: "d1", origin: "x" },
      { id: "BV:x:2", techniqueId: "boundary-value-analysis", description: "d2", origin: "x" },
      { id: "BV:x:3", techniqueId: "boundary-value-analysis", description: "d3", origin: "x" },
      { id: "BV:x:4", techniqueId: "boundary-value-analysis", description: "d4", origin: "x" },
    ];
    const testCases: TestCaseSpec[] = [
      baseCase({ caseId: "TCS-001", coverageTargets: ["BV:x:1"] }),
      baseCase({ caseId: "TCS-002", coverageTargets: ["BV:x:2"] }),
      baseCase({ caseId: "TCS-003", coverageTargets: ["BV:x:3"] }),
    ];
    const rows = computeCoverageRows(universe, testCases);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(4);
    expect(rows[0].covered).toBe(3);
    expect(rows[0].uncovered).toBe(1);
    expect(rows[0].ratioPercent).toBe(75);
    expect(rows[0].uncoveredTargetIds).toEqual(["BV:x:4"]);
  });

  it("resolves criterionLabel for decision-table as 条件組合せ被覆", () => {
    const universe: TestCaseCoverageTarget[] = [
      { id: "DT:MAIN:R1", techniqueId: "decision-table", description: "d1", origin: "MAIN" },
    ];
    const rows = computeCoverageRows(universe, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].criterionLabel).toBe("条件組合せ被覆");
  });

  it.each([
    ["fault-injection", "注入障害パターン被覆"],
    ["long-run-test", "劣化観点被覆"],
    ["config-matrix", "構成組合せ被覆"],
    ["regression-selection", "影響範囲被覆"],
  ] as const)("resolves criterionLabel for %s instead of 未定義", (techniqueId, expectedLabel) => {
    const universe: TestCaseCoverageTarget[] = [
      { id: `X:${techniqueId}:1`, techniqueId, description: "d1", origin: "宣言" },
    ];
    const rows = computeCoverageRows(universe, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].criterionLabel).toBe(expectedLabel);
    expect(rows[0].criterionLabel).not.toBe("未定義");
  });
});

describe("findSubjectiveExpectedResults", () => {
  it("detects subjective wording but not concrete observable text", () => {
    const testCases: TestCaseSpec[] = [
      baseCase({
        caseId: "TCS-001",
        steps: [{ no: 1, action: "購入する", expected: "適切に表示される" }],
      }),
      baseCase({
        caseId: "TCS-002",
        steps: [{ no: 1, action: "上限を超えて購入する", expected: "エラーメッセージ『枚数を超えています』が表示される" }],
      }),
    ];
    const findings = findSubjectiveExpectedResults(testCases);
    expect(findings.some((f) => f.caseId === "TCS-001" && f.term === "適切に")).toBe(true);
    expect(findings.some((f) => f.caseId === "TCS-002")).toBe(false);
  });
});

describe("findHardcodedParameterValues", () => {
  it("detects literal values without an accompanying parameter name reference", () => {
    const parameters: TestCaseParameter[] = [{ name: "MAX_TICKETS", value: "10" }];
    const testCases: TestCaseSpec[] = [
      baseCase({
        caseId: "TCS-001",
        steps: [{ no: 1, action: "10枚購入する", expected: "購入できる" }],
      }),
      baseCase({
        caseId: "TCS-002",
        steps: [{ no: 1, action: "MAX_TICKETS(10)枚購入する", expected: "購入できる" }],
      }),
    ];
    const findings = findHardcodedParameterValues(testCases, parameters);
    expect(findings.some((f) => f.caseId === "TCS-001" && f.parameterName === "MAX_TICKETS")).toBe(true);
    expect(findings.some((f) => f.caseId === "TCS-002")).toBe(false);
  });

  it("does not conflate two different parameters that share the same literal value", () => {
    const parameters: TestCaseParameter[] = [
      { name: "GATE_NOPASS_TIMEOUT", value: "10" },
      { name: "GROUP_MIN_PERSONS", value: "10" },
    ];
    const testCases: TestCaseSpec[] = [
      baseCase({
        caseId: "TCS-001",
        steps: [{ no: 1, action: "10秒経過するとゲートが閉まる", expected: "通過できない" }],
      }),
    ];
    const findings = findHardcodedParameterValues(testCases, parameters);
    expect(findings.some((f) => f.parameterName === "GATE_NOPASS_TIMEOUT")).toBe(true);
    expect(findings.some((f) => f.parameterName === "GROUP_MIN_PERSONS")).toBe(true);
    expect(findings.filter((f) => f.caseId === "TCS-001").length).toBe(2);
  });

  it("does not detect '1000' as a hardcoded occurrence of the value '10'", () => {
    const parameters: TestCaseParameter[] = [{ name: "MAX_TICKETS", value: "10" }];
    const testCases: TestCaseSpec[] = [
      baseCase({
        caseId: "TCS-001",
        steps: [{ no: 1, action: "1000円を支払う", expected: "支払える" }],
      }),
    ];
    const findings = findHardcodedParameterValues(testCases, parameters);
    expect(findings.some((f) => f.caseId === "TCS-001")).toBe(false);
  });

  it("still detects '10' within a time-like notation such as '10:00' as a regression guard", () => {
    const parameters: TestCaseParameter[] = [{ name: "OPEN_HOUR", value: "10" }];
    const testCases: TestCaseSpec[] = [
      baseCase({
        caseId: "TCS-001",
        steps: [{ no: 1, action: "10:00に開場する", expected: "入場できる" }],
      }),
    ];
    const findings = findHardcodedParameterValues(testCases, parameters);
    expect(findings.some((f) => f.caseId === "TCS-001" && f.parameterName === "OPEN_HOUR")).toBe(true);
  });
});

describe("findStepGranularityIssues", () => {
  it("detects step number gaps and multi-action steps", () => {
    const testCases: TestCaseSpec[] = [
      baseCase({
        caseId: "TCS-001",
        steps: [
          { no: 1, action: "ログインする", expected: "ログインできる" },
          { no: 3, action: "チケットを選択し、その後購入する", expected: "購入できる" },
        ],
      }),
    ];
    const findings = findStepGranularityIssues(testCases);
    expect(findings.some((f) => f.kind === "number-gap" && f.stepNo === 3)).toBe(true);
    expect(findings.some((f) => f.kind === "multi-action" && f.stepNo === 3)).toBe(true);
  });
});

describe("findMissingCaseNumbers", () => {
  it("reports the missing TCS-002", () => {
    const testCases: TestCaseSpec[] = [
      baseCase({ caseId: "TCS-001" }),
      baseCase({ caseId: "TCS-003" }),
    ];
    expect(findMissingCaseNumbers(testCases)).toEqual(["TCS-002"]);
  });
});

describe("findUnresolvedCaseRefs with explicit-kind derivedFrom", () => {
  function sourceCondition(
    overrides: Partial<TestCaseSourceCondition> & { id: string }
  ): TestCaseSourceCondition {
    return {
      target: "F-001",
      statement: "条件文",
      derivedFrom: ["R-001"],
      ...overrides,
    };
  }

  it("does not require riskIds to resolve an explicit risk-kind reference", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [sourceCondition({ id: "TC-001" })],
      testCases: [baseCase({ caseId: "TCS-001", testConditionId: "TC-001", derivedFrom: [{ kind: "risk", id: "RK-001" }] })],
    };
    expect(findUnresolvedCaseRefs(input)).toEqual([]);
  });

  it("detects an explicit risk-kind reference missing from riskIds", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [sourceCondition({ id: "TC-001" })],
      riskIds: ["RK-001"],
      testCases: [baseCase({ caseId: "TCS-001", testConditionId: "TC-001", derivedFrom: [{ kind: "risk", id: "RK-999" }] })],
    };
    expect(findUnresolvedCaseRefs(input)).toEqual([
      { caseId: "TCS-001", ref: "RK-999", expectedKind: "riskIds[]", kind: "risk" },
    ]);
  });

  it("keeps the existing string + requirementIds behavior unchanged", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [sourceCondition({ id: "TC-001" })],
      requirementIds: ["R-001"],
      testCases: [baseCase({ caseId: "TCS-001", testConditionId: "TC-001", derivedFrom: ["R-999"] })],
    };
    expect(findUnresolvedCaseRefs(input)).toEqual([
      { caseId: "TCS-001", ref: "R-999", expectedKind: "requirementIds[]" },
    ]);
  });
});

describe("resolveCaseSourceRefs", () => {
  const requirementSources: RequirementSourceRef[] = [
    { requirementId: "EH-100", document: "doc.md", startLine: 652, endLine: 677, label: "EH-100 発券機起動" },
  ];

  function sourceCondition(
    overrides: Partial<TestCaseSourceCondition> & { id: string }
  ): TestCaseSourceCondition {
    return {
      target: "F-001",
      statement: "条件文",
      derivedFrom: ["EH-100"],
      ...overrides,
    };
  }

  it("prefers testCase.sourceRefs over everything else", () => {
    const testCase = baseCase({
      caseId: "TCS-001",
      testConditionId: "TC-001",
      derivedFrom: ["EH-100"],
      sourceRefs: [{ document: "case-explicit.md", startLine: 1 }],
    });
    const conditions = [sourceCondition({ id: "TC-001" })];
    const refs = resolveCaseSourceRefs(testCase, conditions, requirementSources);
    expect(refs).toEqual([{ document: "case-explicit.md", startLine: 1 }]);
  });

  it("falls back to the matching test condition's resolved source refs", () => {
    const testCase = baseCase({ caseId: "TCS-001", testConditionId: "TC-001", derivedFrom: ["UNKNOWN"] });
    const conditions = [sourceCondition({ id: "TC-001", derivedFrom: ["EH-100"] })];
    const refs = resolveCaseSourceRefs(testCase, conditions, requirementSources);
    expect(refs).toEqual([{ document: "doc.md", startLine: 652, endLine: 677, label: "EH-100 発券機起動" }]);
  });

  it("falls back to the test case's own derivedFrom when no condition matches", () => {
    const testCase = baseCase({ caseId: "TCS-001", testConditionId: "TC-999", derivedFrom: ["EH-100"] });
    const conditions = [sourceCondition({ id: "TC-001", derivedFrom: ["OTHER"] })];
    const refs = resolveCaseSourceRefs(testCase, conditions, requirementSources);
    expect(refs).toEqual([{ document: "doc.md", startLine: 652, endLine: 677, label: "EH-100 発券機起動" }]);
  });

  it("returns an empty array when nothing resolves", () => {
    const testCase = baseCase({ caseId: "TCS-001", testConditionId: "TC-999", derivedFrom: ["UNKNOWN"] });
    const conditions = [sourceCondition({ id: "TC-001", derivedFrom: ["OTHER"] })];
    expect(resolveCaseSourceRefs(testCase, conditions, requirementSources)).toEqual([]);
  });
});

describe("findUnsubstantiatedCoverageTargets", () => {
  const equivalenceVariables = [
    {
      name: "残数表示状態",
      validClasses: [
        { label: "残数あり(〇)", representative: "〇" },
        { label: "残数僅か(△)", representative: "△" },
      ],
      invalidClasses: [{ label: "残数なし(×)", representative: "×" }],
    },
  ];
  const stateTransition = {
    states: [
      { id: "S1", nameJa: "未使用", initial: true },
      { id: "S2", nameJa: "無効" },
      { id: "S3", nameJa: "使用済" },
    ],
    transitions: [
      { id: "ST-01", from: "S1", to: "S3", event: "入場" },
      { id: "ST-02", from: "S1", to: "S2", event: "失効" },
    ],
  };

  it("reports nothing when the variable name and the value both appear in the case body", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      boundaryVariables: [{ name: "枚数", min: 1, max: 10 }],
      boundaryMode: "two",
      testCases: [
        baseCase({
          caseId: "TCS-001",
          coverageTargets: ["BV:枚数:10"],
          steps: [{ no: 1, action: "枚数の上限として10枚を指定して購入する", expected: "購入できる" }],
        }),
      ],
    };
    expect(findUnsubstantiatedCoverageTargets(input)).toEqual([]);
  });

  it("flags a missing variable name when only another variable appears in the body", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      boundaryVariables: [{ name: "入場制限人数", min: 1, max: 999 }],
      boundaryMode: "three",
      testCases: [
        baseCase({
          caseId: "TCS-004",
          coverageTargets: ["BV:入場制限人数:1"],
          steps: [{ no: 1, action: "対象時間枠残数 1枚の状態で購入する", expected: "購入できる" }],
        }),
      ],
    };
    const findings = findUnsubstantiatedCoverageTargets(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].caseId).toBe("TCS-004");
    expect(findings[0].targetId).toBe("BV:入場制限人数:1");
    expect(findings[0].missing).toBe("variable");
    expect(findings[0].detail).toContain("入場制限人数");
  });

  it("flags a missing value when the variable name appears but the boundary value does not", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      boundaryVariables: [{ name: "入場制限人数", min: 1, max: 999 }],
      boundaryMode: "three",
      testCases: [
        baseCase({
          caseId: "TCS-010",
          coverageTargets: ["BV:入場制限人数:998"],
          steps: [{ no: 1, action: "入場制限人数パラメータ(60人)で購入する", expected: "購入できる" }],
        }),
      ],
    };
    const findings = findUnsubstantiatedCoverageTargets(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].missing).toBe("value");
    expect(findings[0].detail).toContain("998");
  });

  it("accepts a parameter-name reference without the literal value (alias rule)", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      parameters: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      boundaryVariables: [{ name: "枚数", min: 1, max: 10 }],
      boundaryMode: "two",
      testCases: [
        baseCase({
          caseId: "TCS-002",
          coverageTargets: ["BV:枚数:10"],
          steps: [{ no: 1, action: "MAX_TICKETS の上限で購入する", expected: "購入できる" }],
        }),
      ],
    };
    expect(findUnsubstantiatedCoverageTargets(input)).toEqual([]);
  });

  it("accepts an EP class whose label core (without the trailing parenthetical) appears in the body", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      equivalenceVariables,
      testCases: [
        baseCase({
          caseId: "TCS-006",
          techniqueId: "equivalence-partitioning",
          coverageTargets: ["EP:残数表示状態:残数僅か(△)"],
          steps: [{ no: 1, action: "△(残数僅か)の時間枠を選択する", expected: "選択できる" }],
        }),
      ],
    };
    expect(findUnsubstantiatedCoverageTargets(input)).toEqual([]);
  });

  it("flags an EP class when neither the class name nor the representative value appears", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      equivalenceVariables,
      testCases: [
        baseCase({
          caseId: "TCS-007",
          techniqueId: "equivalence-partitioning",
          coverageTargets: ["EP:残数表示状態:残数僅か(△)"],
          steps: [{ no: 1, action: "障害注入で発券機を停止させる", expected: "エラーになる" }],
        }),
      ],
    };
    const findings = findUnsubstantiatedCoverageTargets(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].missing).toBe("class");
    expect(findings[0].detail).toContain("残数僅か(△)");
  });

  it("accepts a state transition whose from/to state labels both appear in the body", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      stateTransition,
      testCases: [
        baseCase({
          caseId: "TCS-003",
          techniqueId: "state-transition",
          coverageTargets: ["ST:ST-02"],
          preconditions: [{ name: "券面状態", value: "未使用" }],
          steps: [{ no: 1, action: "有効期限を過ぎさせる", expected: "券が無効になる" }],
        }),
      ],
    };
    expect(findUnsubstantiatedCoverageTargets(input)).toEqual([]);
  });

  it("flags a state transition when only the from state appears in the body", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      stateTransition,
      testCases: [
        baseCase({
          caseId: "TCS-060",
          techniqueId: "state-transition",
          coverageTargets: ["ST:ST-02"],
          preconditions: [{ name: "券面状態", value: "未使用" }],
          steps: [{ no: 1, action: "何もしない", expected: "表示が変わらない" }],
        }),
      ],
    };
    const findings = findUnsubstantiatedCoverageTargets(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].missing).toBe("transition");
    expect(findings[0].detail).toContain("遷移先");
  });

  const decisionTable = {
    conditions: [
      { id: "C1", statement: "券種", levels: ["おとな", "こども"] },
      { id: "C2", statement: "支払い方法", levels: ["現金", "IC", "クレカ"] },
    ],
    actions: [{ id: "A1", statement: "入場可否" }],
    rules: [{ id: "R1", when: { C2: "IC" }, actions: { A1: "Y" } }],
  };

  it("flags a decision table rule whose fixed level does not appear in the case body", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      decisionTable,
      testCases: [
        baseCase({
          caseId: "TCS-080",
          techniqueId: "decision-table",
          coverageTargets: ["DT:MAIN:R1"],
          steps: [{ no: 1, action: "現金で入場する", expected: "入場できる" }],
        }),
      ],
    };
    const findings = findUnsubstantiatedCoverageTargets(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].targetId).toBe("DT:MAIN:R1");
    expect(findings[0].missing).toBe("condition-combination");
    expect(findings[0].detail).toContain("支払い方法");
  });

  it("accepts a decision table rule whose fixed level appears in the case body", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      decisionTable,
      testCases: [
        baseCase({
          caseId: "TCS-081",
          techniqueId: "decision-table",
          coverageTargets: ["DT:MAIN:R1"],
          steps: [{ no: 1, action: "ICカードで入場する", expected: "入場できる" }],
        }),
      ],
    };
    expect(findUnsubstantiatedCoverageTargets(input)).toEqual([]);
  });

  it("skips manually declared coverage targets that are not BV/EP/ST", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      additionalCoverageTargets: [
        { id: "FI:起動失敗", techniqueId: "fault-injection", description: "起動失敗を注入", origin: "宣言" },
      ],
      testCases: [
        baseCase({
          caseId: "TCS-020",
          techniqueId: "fault-injection",
          coverageTargets: ["FI:起動失敗"],
          steps: [{ no: 1, action: "何も関係しない操作をする", expected: "何も起きない" }],
        }),
      ],
    };
    expect(findUnsubstantiatedCoverageTargets(input)).toEqual([]);
  });

  it("lowers the coverage ratio when combined with stripUnsubstantiatedCoverageTargets", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      boundaryVariables: [{ name: "枚数", min: 1, max: 10 }],
      boundaryMode: "two",
      testCases: [
        baseCase({
          caseId: "TCS-001",
          coverageTargets: ["BV:枚数:1"],
          steps: [{ no: 1, action: "枚数1で購入する", expected: "購入できる" }],
        }),
        baseCase({
          caseId: "TCS-002",
          coverageTargets: ["BV:枚数:10"],
          steps: [{ no: 1, action: "対象時間枠残数10で購入する", expected: "購入できる" }],
        }),
      ],
    };
    const universe = buildCoverageUniverse(input);
    const findings = findUnsubstantiatedCoverageTargets(input, universe);
    expect(findings.map((f) => f.caseId)).toEqual(["TCS-002"]);

    const declaredRows = computeCoverageRows(universe, input.testCases as TestCaseSpec[]);
    expect(declaredRows[0].total).toBe(4);
    expect(declaredRows[0].covered).toBe(2);

    const substantiatedRows = computeCoverageRows(
      universe,
      stripUnsubstantiatedCoverageTargets(input.testCases as TestCaseSpec[], findings)
    );
    expect(substantiatedRows[0].covered).toBe(1);
    expect(substantiatedRows[0].ratioPercent).toBe(25);
  });

  it("is deterministic and does not mutate the input", () => {
    const input: GenerateTestCasesInput = {
      testConditions: [],
      boundaryVariables: [{ name: "枚数", min: 1, max: 10 }],
      boundaryMode: "two",
      testCases: [
        baseCase({
          caseId: "TCS-001",
          coverageTargets: ["BV:枚数:10"],
          steps: [{ no: 1, action: "残数10で購入する", expected: "購入できる" }],
        }),
      ],
    };
    const snapshot = JSON.stringify(input);
    const first = findUnsubstantiatedCoverageTargets(input);
    const second = findUnsubstantiatedCoverageTargets(input);
    expect(second).toEqual(first);
    stripUnsubstantiatedCoverageTargets(input.testCases as TestCaseSpec[], first);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("normalizeForGrounding / extractQuotedStrings", () => {
  it("absorbs full-width, case and punctuation differences", () => {
    expect(normalizeForGrounding("Ｅ-０２０")).toBe("e020");
    expect(normalizeForGrounding("購入できる入場券残数がありません。")).toBe(
      normalizeForGrounding("購入できる 入場券残数が ありません")
    );
  });

  it("extracts quoted strings of every supported bracket kind in appearance order", () => {
    expect(extractQuotedStrings('「一つ目」と『二つ目』と"三つ目"')).toEqual([
      "一つ目",
      "二つ目",
      "三つ目",
    ]);
  });
});

describe("findUngroundedQuotations", () => {
  const basis: TestBasisDocument[] = [
    {
      name: "11_要求仕様書",
      content: [
        "E-020 購入できる入場券残数がありません。",
        "S-008-01 発券機はエラー画面を表示する。",
      ].join("\n"),
    },
  ];

  it("accepts a quotation that matches the test basis wording apart from punctuation", () => {
    const testCases = [
      baseCase({
        caseId: "TCS-001",
        steps: [
          { no: 1, action: "残数0の時間枠を選択する", expected: "「購入できる入場券残数がありません」と表示される" },
        ],
      }),
    ];
    expect(findUngroundedQuotations(testCases, basis)).toEqual([]);
  });

  it("flags a quotation that does not exist in the test basis", () => {
    const testCases = [
      baseCase({
        caseId: "TCS-061",
        steps: [
          { no: 1, action: "残数0の時間枠を選択する", expected: "「ご希望の枚数が確保できませんでした」と表示される" },
        ],
      }),
    ];
    const findings = findUngroundedQuotations(testCases, basis);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("quotation");
    expect(findings[0].severity).toBe("high");
    expect(findings[0].caseId).toBe("TCS-061");
    expect(findings[0].place).toBe("steps[0].expected");
    expect(findings[0].detail).toContain("テストベースの実文言へ修正すること");
  });

  it("accepts an id that exists in the test basis", () => {
    const testCases = [
      baseCase({
        caseId: "TCS-002",
        steps: [{ no: 1, action: "エラーを発生させる", expected: "S-008-01 の画面が表示される" }],
      }),
    ];
    expect(findUngroundedQuotations(testCases, basis)).toEqual([]);
  });

  it("flags an id that does not exist in the test basis", () => {
    const testCases = [
      baseCase({
        caseId: "TCS-003",
        steps: [{ no: 1, action: "エラーを発生させる", expected: "S-999-01 の画面が表示される" }],
      }),
    ];
    const findings = findUngroundedQuotations(testCases, basis);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("id");
    expect(findings[0].text).toBe("S-999-01");
  });

  it("does not flag case ids or declared internal ids", () => {
    const testCases = [
      baseCase({
        caseId: "TCS-001",
        steps: [
          { no: 1, action: "TC-004 と R-01 に基づき TCS-001 を実行する", expected: "結果が表示される" },
        ],
      }),
    ];
    expect(
      findUngroundedQuotations(testCases, basis, { internalIds: ["TC-004", "R-01", "TCS-001"] })
    ).toEqual([]);
  });

  it("ignores single-character quotations such as 「×」", () => {
    const testCases = [
      baseCase({
        caseId: "TCS-005",
        steps: [{ no: 1, action: "残数を確認する", expected: "残数表示が「×」になる" }],
      }),
    ];
    expect(findUngroundedQuotations(testCases, basis)).toEqual([]);
  });

  it("matches a full-width quotation against a half-width test basis id", () => {
    const testCases = [
      baseCase({
        caseId: "TCS-006",
        steps: [{ no: 1, action: "エラーを発生させる", expected: "「Ｅ-０２０」が表示される" }],
      }),
    ];
    expect(findUngroundedQuotations(testCases, basis)).toEqual([]);
  });

  it("collapses the same invented wording in two steps into one finding and stays deterministic", () => {
    const testCases = [
      baseCase({
        caseId: "TCS-061",
        steps: [
          { no: 1, action: "残数0を選択する", expected: "「ご希望の枚数が確保できませんでした」と表示される" },
          { no: 2, action: "再試行する", expected: "「ご希望の枚数が確保できませんでした」と再表示される" },
        ],
      }),
    ];
    const snapshot = JSON.stringify(testCases);
    const first = findUngroundedQuotations(testCases, basis);
    const second = findUngroundedQuotations(testCases, basis);
    expect(first).toHaveLength(1);
    expect(first[0].stepNo).toBe(1);
    expect(second).toEqual(first);
    expect(JSON.stringify(testCases)).toBe(snapshot);
  });
});
