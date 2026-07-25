import { describe, expect, it } from "vitest";
import {
  buildCoverageUniverse,
  computeCoverageRows,
  findHardcodedParameterValues,
  findMissingCaseNumbers,
  findStepGranularityIssues,
  findSubjectiveExpectedResults,
} from "../src/testCaseAnalysis.js";
import type {
  GenerateTestCasesInput,
  TestCaseCoverageTarget,
  TestCaseParameter,
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
