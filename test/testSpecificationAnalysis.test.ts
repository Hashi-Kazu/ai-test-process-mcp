import { describe, expect, it } from "vitest";
import {
  COVERAGE_CRITERIA_KEYWORDS,
  DEFAULT_STEP_BALANCE_THRESHOLD,
  PRECONDITION_PLACEHOLDER_VALUES,
  PRIORITY_CRITERIA_KEYWORDS,
  buildDerivedFromCoverage,
  buildPriorityDistribution,
  buildRiskCoverage,
  extractAllBasisIds,
  extractRequirementIdsFromDocuments,
  findCasesWithoutPriority,
  findDeclarationKeywords,
  findIdNotationMismatches,
  findPlaceholderPreconditions,
  findStepBalanceIssues,
  findUncoveredIds,
  findUnfoundedCases,
  findUnknownConditionRefs,
  findUnknownRiskRefs,
  normalizeIdRef,
} from "../src/testSpecificationAnalysis.js";
import type {
  TestBasisDocument,
  TestCaseSourceCondition,
  TestCaseSpec,
  TestCaseStep,
} from "../src/types.js";

function makeCase(overrides: Partial<TestCaseSpec> & { caseId: string }): TestCaseSpec {
  return {
    title: `ケース ${overrides.caseId}`,
    testConditionId: "TC-001",
    derivedFrom: ["EH-100"],
    techniqueId: "boundary-value-analysis",
    coverageTargets: ["BV:枚数:0"],
    preconditions: [{ name: "ログイン状態", value: "ログイン済み" }],
    steps: [{ no: 1, action: "購入ボタンを押す", expected: "完了画面が表示される" }],
    ...overrides,
  } as TestCaseSpec;
}

function steps(count: number, expectedFor: (i: number) => string): TestCaseStep[] {
  return Array.from({ length: count }, (_, i) => ({
    no: i + 1,
    action: `操作${i + 1}`,
    expected: expectedFor(i),
  }));
}

const basisDocuments: TestBasisDocument[] = [
  {
    name: "要求仕様書",
    content: [
      "# 機能要求",
      "EH-100 チケットを購入できる",
      "EH-101 チケットをキャンセルできる",
      "備考: EH-100 を参照すること",
      "EH-999 は未定義IDの参照ではなく定義行である",
    ].join("\n"),
  },
];

describe("extractRequirementIdsFromDocuments", () => {
  it("extracts definition-role ids without duplicates", () => {
    expect(extractRequirementIdsFromDocuments(basisDocuments)).toEqual([
      "EH-100",
      "EH-101",
      "EH-999",
    ]);
  });

  it("returns an empty array when no ids match", () => {
    expect(
      extractRequirementIdsFromDocuments([{ name: "memo", content: "IDのない自由記述です" }])
    ).toEqual([]);
  });
});

describe("extractAllBasisIds", () => {
  it("includes reference occurrences as well as definitions", () => {
    const ids = extractAllBasisIds(basisDocuments);
    expect(ids).toContain("EH-100");
    expect(ids).toContain("EH-101");
    // 重複排除されている
    expect(ids.filter((id) => id === "EH-100").length).toBe(1);
  });
});

describe("buildDerivedFromCoverage / findUncoveredIds", () => {
  const cases = [
    makeCase({ caseId: "TCS-001", derivedFrom: ["EH-100"] }),
    makeCase({ caseId: "TCS-002", derivedFrom: ["EH-100", "R-001"] }),
  ];

  it("maps each id to referencing case ids in input order", () => {
    expect(buildDerivedFromCoverage(["EH-100", "EH-101", "R-001"], cases)).toEqual([
      { id: "EH-100", caseIds: ["TCS-001", "TCS-002"] },
      { id: "EH-101", caseIds: [] },
      { id: "R-001", caseIds: ["TCS-002"] },
    ]);
  });

  it("lists ids with zero cases as uncovered", () => {
    const rows = buildDerivedFromCoverage(["EH-100", "EH-101"], cases);
    expect(findUncoveredIds(rows)).toEqual(["EH-101"]);
  });

  it("reports every id as uncovered when there are no cases", () => {
    const rows = buildDerivedFromCoverage(["EH-100", "EH-101"], []);
    expect(findUncoveredIds(rows)).toEqual(["EH-100", "EH-101"]);
  });
});

describe("findUnfoundedCases", () => {
  it("lists cases whose derivedFrom matches no known id", () => {
    const cases = [
      makeCase({ caseId: "TCS-001", derivedFrom: ["EH-100"] }),
      makeCase({ caseId: "TCS-002", derivedFrom: ["XX-900", "YY-901"] }),
      makeCase({ caseId: "TCS-003", derivedFrom: ["XX-900", "EH-101"] }),
    ];
    expect(findUnfoundedCases(["EH-100", "EH-101"], cases)).toEqual([
      { caseId: "TCS-002", refs: ["XX-900", "YY-901"], expectedKind: "requirementIds[]" },
    ]);
  });

  it("returns an empty array when the known id set is empty (cannot judge)", () => {
    expect(findUnfoundedCases([], [makeCase({ caseId: "TCS-001" })])).toEqual([]);
  });

  it("uses the given expectedKind label", () => {
    const result = findUnfoundedCases(["R-001"], [makeCase({ caseId: "TCS-001" })], "risks[].id");
    expect(result[0].expectedKind).toBe("risks[].id");
  });
});

describe("buildDerivedFromCoverage / findUnfoundedCases with explicit-kind derivedFrom", () => {
  it("counts an explicit-kind entry toward coverage by id match alone", () => {
    const cases = [makeCase({ caseId: "TCS-001", derivedFrom: [{ kind: "risk", id: "EH-100" }] })];
    expect(buildDerivedFromCoverage(["EH-100"], cases)).toEqual([
      { id: "EH-100", caseIds: ["TCS-001"] },
    ]);
    expect(findUnfoundedCases(["EH-100"], cases)).toEqual([]);
  });

  it("reports the plain id list in refs when unfounded, even for explicit-kind entries", () => {
    const cases = [makeCase({ caseId: "TCS-001", derivedFrom: [{ kind: "risk", id: "XX-900" }] })];
    expect(findUnfoundedCases(["EH-100"], cases)).toEqual([
      { caseId: "TCS-001", refs: ["XX-900"], expectedKind: "requirementIds[]" },
    ]);
  });
});

describe("findUnknownConditionRefs", () => {
  const conditions: TestCaseSourceCondition[] = [
    { id: "TC-001", target: "購入", statement: "購入できる", derivedFrom: ["EH-100"] },
  ];

  it("lists cases whose testConditionId is not defined", () => {
    const cases = [
      makeCase({ caseId: "TCS-001", testConditionId: "TC-001" }),
      makeCase({ caseId: "TCS-002", testConditionId: "TC-099" }),
    ];
    expect(findUnknownConditionRefs(conditions, cases)).toEqual([
      { caseId: "TCS-002", refs: ["TC-099"], expectedKind: "testConditions[].id" },
    ]);
  });

  it("returns an empty array when all refs resolve", () => {
    expect(
      findUnknownConditionRefs(conditions, [makeCase({ caseId: "TCS-001", testConditionId: "TC-001" })])
    ).toEqual([]);
  });
});

describe("buildRiskCoverage", () => {
  const risks = [
    { id: "R-001", description: "決済失敗" },
    { id: "R-002", description: "二重購入" },
  ];

  it("counts a case whose derivedFrom directly references the risk id", () => {
    const cases = [makeCase({ caseId: "TCS-001", derivedFrom: ["EH-100", "R-001"] })];
    expect(buildRiskCoverage(risks, undefined, cases)).toEqual([
      { id: "R-001", caseIds: ["TCS-001"] },
      { id: "R-002", caseIds: [] },
    ]);
  });

  it("counts a case that only references a test condition derived from the risk (transitive coverage)", () => {
    const conditions: TestCaseSourceCondition[] = [
      { id: "TC-001", target: "決済", statement: "決済できる", derivedFrom: ["EH-100", "R-001"] },
    ];
    const cases = [
      makeCase({ caseId: "TCS-001", testConditionId: "TC-001", derivedFrom: ["EH-100"] }),
    ];
    expect(buildRiskCoverage(risks, conditions, cases)).toEqual([
      { id: "R-001", caseIds: ["TCS-001"] },
      { id: "R-002", caseIds: [] },
    ]);
  });

  it("does not double count a case covering the same risk both directly and transitively", () => {
    const conditions: TestCaseSourceCondition[] = [
      { id: "TC-001", target: "決済", statement: "決済できる", derivedFrom: ["R-001"] },
    ];
    const cases = [
      makeCase({ caseId: "TCS-001", testConditionId: "TC-001", derivedFrom: ["R-001"] }),
    ];
    expect(buildRiskCoverage(risks, conditions, cases)).toEqual([
      { id: "R-001", caseIds: ["TCS-001"] },
      { id: "R-002", caseIds: [] },
    ]);
  });

  it("ignores conditions unrelated to the risk and cases whose testConditionId does not match", () => {
    const conditions: TestCaseSourceCondition[] = [
      { id: "TC-001", target: "決済", statement: "決済できる", derivedFrom: ["R-001"] },
      { id: "TC-002", target: "購入", statement: "購入できる", derivedFrom: ["EH-100"] },
    ];
    const cases = [makeCase({ caseId: "TCS-001", testConditionId: "TC-002", derivedFrom: ["EH-100"] })];
    expect(buildRiskCoverage(risks, conditions, cases)).toEqual([
      { id: "R-001", caseIds: [] },
      { id: "R-002", caseIds: [] },
    ]);
  });

  it("respects explicit-kind derivedFrom entries on test conditions", () => {
    const conditions: TestCaseSourceCondition[] = [
      { id: "TC-001", target: "決済", statement: "決済できる", derivedFrom: [{ kind: "risk", id: "R-001" }] },
    ];
    const cases = [makeCase({ caseId: "TCS-001", testConditionId: "TC-001", derivedFrom: ["EH-100"] })];
    expect(buildRiskCoverage(risks, conditions, cases)).toEqual([
      { id: "R-001", caseIds: ["TCS-001"] },
      { id: "R-002", caseIds: [] },
    ]);
  });
});

describe("findUnknownRiskRefs", () => {
  const risks = [
    { id: "R-001", description: "決済失敗" },
    { id: "R-002", description: "二重購入" },
  ];

  it("lists refs matching the risk prefix but absent from risks[]", () => {
    const cases = [
      makeCase({ caseId: "TCS-001", derivedFrom: ["EH-100", "R-001"] }),
      makeCase({ caseId: "TCS-002", derivedFrom: ["R-009", "EH-101"] }),
    ];
    expect(findUnknownRiskRefs(risks, cases)).toEqual([
      { caseId: "TCS-002", refs: ["R-009"], expectedKind: "risks[].id" },
    ]);
  });

  it("ignores refs with unrelated prefixes", () => {
    const cases = [makeCase({ caseId: "TCS-001", derivedFrom: ["EH-777"] })];
    expect(findUnknownRiskRefs(risks, cases)).toEqual([]);
  });

  it("returns an empty array when no risks are supplied", () => {
    expect(findUnknownRiskRefs([], [makeCase({ caseId: "TCS-001", derivedFrom: ["R-009"] })])).toEqual(
      []
    );
  });
});

describe("findUnknownRiskRefs with explicit-kind derivedFrom", () => {
  const risks = [
    { id: "R-001", description: "決済失敗" },
    { id: "R-002", description: "二重購入" },
  ];

  it("detects an explicit risk-kind entry even without a matching risk id prefix", () => {
    const cases = [makeCase({ caseId: "TCS-001", derivedFrom: [{ kind: "risk", id: "RK-999" }] })];
    expect(findUnknownRiskRefs(risks, cases)).toEqual([
      { caseId: "TCS-001", refs: ["RK-999"], expectedKind: "risks[].id" },
    ]);
  });
});

describe("normalizeIdRef", () => {
  it.each([
    ["EH-100", "EH100"],
    ["eh_100", "EH100"],
    ["EH100", "EH100"],
    ["W-Mail-011-01", "WMAIL01101"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeIdRef(input)).toBe(expected);
  });
});

describe("findIdNotationMismatches", () => {
  it("detects refs that match a basis id only after normalization", () => {
    const cases = [
      makeCase({ caseId: "TCS-001", derivedFrom: ["EH100"], testConditionId: "TC-001" }),
      makeCase({ caseId: "TCS-002", derivedFrom: ["eh_101"], testConditionId: "TC-001" }),
    ];
    expect(findIdNotationMismatches(["EH-100", "EH-101"], cases)).toEqual([
      {
        caseId: "TCS-001",
        field: "derivedFrom",
        ref: "EH100",
        normalized: "EH100",
        matchedId: "EH-100",
      },
      {
        caseId: "TCS-002",
        field: "derivedFrom",
        ref: "eh_101",
        normalized: "EH101",
        matchedId: "EH-101",
      },
    ]);
  });

  it("does not report exact matches nor genuinely unknown refs", () => {
    const cases = [
      makeCase({ caseId: "TCS-001", derivedFrom: ["EH-100", "ZZ-777"] }),
    ];
    expect(findIdNotationMismatches(["EH-100"], cases)).toEqual([]);
  });

  it("checks testConditionId as well", () => {
    const cases = [makeCase({ caseId: "TCS-001", derivedFrom: ["EH-100"], testConditionId: "TC001" })];
    const result = findIdNotationMismatches(["EH-100", "TC-001"], cases);
    expect(result).toEqual([
      {
        caseId: "TCS-001",
        field: "testConditionId",
        ref: "TC001",
        normalized: "TC001",
        matchedId: "TC-001",
      },
    ]);
  });
});

describe("findIdNotationMismatches with explicit-kind derivedFrom", () => {
  it("detects notation mismatches for explicit-kind entries", () => {
    const cases = [
      makeCase({ caseId: "TCS-001", derivedFrom: [{ kind: "risk", id: "EH100" }], testConditionId: "TC-001" }),
    ];
    expect(findIdNotationMismatches(["EH-100"], cases)).toEqual([
      { caseId: "TCS-001", field: "derivedFrom", ref: "EH100", normalized: "EH100", matchedId: "EH-100" },
    ]);
  });
});

describe("findCasesWithoutPriority / buildPriorityDistribution", () => {
  const cases = [
    makeCase({ caseId: "TCS-001", priority: "高" }),
    makeCase({ caseId: "TCS-002", priority: "高" }),
    makeCase({ caseId: "TCS-003", priority: "中" }),
    makeCase({ caseId: "TCS-004" }),
  ];

  it("lists case ids without a priority", () => {
    expect(findCasesWithoutPriority(cases)).toEqual(["TCS-004"]);
  });

  it("counts 高/中/低/未設定", () => {
    expect(buildPriorityDistribution(cases)).toEqual([
      { level: "高", count: 2 },
      { level: "中", count: 1 },
      { level: "低", count: 0 },
      { level: "未設定", count: 1 },
    ]);
  });

  it("handles an empty case list", () => {
    expect(buildPriorityDistribution([])).toEqual([
      { level: "高", count: 0 },
      { level: "中", count: 0 },
      { level: "低", count: 0 },
      { level: "未設定", count: 0 },
    ]);
  });
});

describe("findPlaceholderPreconditions", () => {
  it("flags empty preconditions", () => {
    const result = findPlaceholderPreconditions([makeCase({ caseId: "TCS-001", preconditions: [] })]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("empty");
  });

  it.each(PRECONDITION_PLACEHOLDER_VALUES)("flags placeholder-only value %j", (value) => {
    const result = findPlaceholderPreconditions([
      makeCase({ caseId: "TCS-001", preconditions: [{ name: "状態", value }] }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("placeholder-only");
  });

  it("does not flag cases with at least one concrete value", () => {
    const result = findPlaceholderPreconditions([
      makeCase({
        caseId: "TCS-001",
        preconditions: [
          { name: "状態", value: "なし" },
          { name: "在庫", value: "10枚" },
        ],
      }),
    ]);
    expect(result).toEqual([]);
  });
});

describe("findStepBalanceIssues", () => {
  it("flags long cases whose expected results are all identical", () => {
    const result = findStepBalanceIssues([
      makeCase({ caseId: "TCS-001", steps: steps(DEFAULT_STEP_BALANCE_THRESHOLD, () => "画面が表示される") }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      caseId: "TCS-001",
      stepCount: DEFAULT_STEP_BALANCE_THRESHOLD,
      uniqueExpectedCount: 1,
    });
  });

  it("does not flag cases shorter than the threshold", () => {
    expect(
      findStepBalanceIssues([
        makeCase({
          caseId: "TCS-001",
          steps: steps(DEFAULT_STEP_BALANCE_THRESHOLD - 1, () => "同じ結果"),
        }),
      ])
    ).toEqual([]);
  });

  it("does not flag cases with multiple distinct expected results", () => {
    expect(
      findStepBalanceIssues([
        makeCase({ caseId: "TCS-001", steps: steps(6, (i) => `結果${i}`) }),
      ])
    ).toEqual([]);
  });

  it("honors a custom threshold", () => {
    const cases = [makeCase({ caseId: "TCS-001", steps: steps(3, () => "同じ結果") })];
    expect(findStepBalanceIssues(cases, 3)).toHaveLength(1);
    expect(findStepBalanceIssues(cases, 4)).toHaveLength(0);
  });

  it("treats whitespace-only differences as the same expected result", () => {
    const cases = [makeCase({ caseId: "TCS-001", steps: steps(5, () => "  同じ結果  ") })];
    expect(findStepBalanceIssues(cases)).toHaveLength(1);
  });
});

describe("findDeclarationKeywords", () => {
  it("finds coverage criteria declarations with 1-based line places", () => {
    const text = ["# テスト仕様書", "## 網羅基準", "全テスト条件に1件以上のケースを割り当てる"].join("\n");
    const result = findDeclarationKeywords(text, COVERAGE_CRITERIA_KEYWORDS);
    expect(result.found).toBe(true);
    expect(result.matches[0]).toEqual({
      keyword: "網羅基準",
      place: "testSpecificationText:2",
      lineText: "## 網羅基準",
    });
  });

  it("finds priority criteria declarations", () => {
    const result = findDeclarationKeywords("優先度の基準は影響度と発生確率で決める", PRIORITY_CRITERIA_KEYWORDS);
    expect(result.found).toBe(true);
    expect(result.matches).toHaveLength(1);
  });

  it("reports not found when no keyword appears", () => {
    const result = findDeclarationKeywords("特に基準は書いていない", COVERAGE_CRITERIA_KEYWORDS);
    expect(result).toEqual({ found: false, matches: [] });
  });

  it("uses the given document name for places", () => {
    const result = findDeclarationKeywords("網羅基準あり", COVERAGE_CRITERIA_KEYWORDS, "spec.md");
    expect(result.matches[0].place).toBe("spec.md:1");
  });
});
