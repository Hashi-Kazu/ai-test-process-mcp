import { describe, expect, it } from "vitest";
import {
  computeTestDataDesign,
  buildTestDataCoverageTargets,
  dataStateTargetId,
  dataTransitionTargetId,
  renderTestData,
  DEFAULT_MAX_DATA_CLASSES,
  DEFAULT_MAX_STATES_PER_CLASS,
} from "../src/tools/designTestData.js";
import type { DataClassSpec, TestDataSpec } from "../src/types.js";

// 予約データのライフサイクル: 未確定(初期) -> 確定済 -> キャンセル済(終端)。
function reservationClass(overrides: Partial<DataClassSpec> = {}): DataClassSpec {
  return {
    id: "DC-RSV",
    nameJa: "予約データ",
    kind: "transaction",
    owner: "QA担当",
    preparation: "APIで作成する",
    sharingPolicy: "per-case",
    states: [
      { id: "S-DRAFT", nameJa: "未確定", isInitial: true },
      { id: "S-CONFIRMED", nameJa: "確定済" },
      { id: "S-CANCELLED", nameJa: "キャンセル済", isTerminal: true },
    ],
    transitions: [
      { id: "T-CONFIRM", from: "S-DRAFT", to: "S-CONFIRMED", event: "予約を確定する" },
      { id: "T-CANCEL", from: "S-CONFIRMED", to: "S-CANCELLED", event: "予約を取り消す" },
    ],
    ...overrides,
  };
}

function baseSpec(): TestDataSpec {
  return {
    title: "予約データ設計",
    dataClasses: [reservationClass()],
    dataItems: [{ id: "DI-01", dataClassId: "DC-RSV", label: "予約A", initialStateId: "S-DRAFT" }],
    testCases: [
      {
        caseId: "TC-01",
        preconditionText: "予約データDI-01が未確定である",
        requiredData: [{ dataClassId: "DC-RSV", stateId: "S-DRAFT", dataItemId: "DI-01", access: "read" }],
      },
      {
        caseId: "TC-02",
        preconditionText: "予約データDI-01が未確定である",
        stepsText: ["予約を確定する操作を行う"],
        requiredData: [
          {
            dataClassId: "DC-RSV",
            stateId: "S-DRAFT",
            dataItemId: "DI-01",
            access: "update",
            resultStateId: "S-CONFIRMED",
          },
        ],
      },
    ],
  };
}

describe("buildTestDataCoverageTargets", () => {
  it("generates DL:S: / DL:T: ids in declaration order", () => {
    const spec = baseSpec();
    const targets = buildTestDataCoverageTargets(spec);
    expect(targets.map((t) => t.id)).toEqual([
      dataStateTargetId("DC-RSV", "S-DRAFT"),
      dataStateTargetId("DC-RSV", "S-CONFIRMED"),
      dataStateTargetId("DC-RSV", "S-CANCELLED"),
      dataTransitionTargetId("DC-RSV", "T-CONFIRM"),
      dataTransitionTargetId("DC-RSV", "T-CANCEL"),
    ]);
    for (const t of targets) expect(t.techniqueId).toBe("data-lifecycle-test");
    expect(targets[0].description).toBe("予約データ / 未確定");
    expect(targets[3].description).toBe("予約データ: 未確定 --予約を確定する--> 確定済");
  });

  it("returns an empty array when structural checks report a blocking finding", () => {
    const spec = baseSpec();
    spec.dataClasses[0].transitions[0].event = "  ";
    expect(buildTestDataCoverageTargets(spec)).toEqual([]);
  });
});

describe("renderTestData determinism", () => {
  it("returns byte-identical output for the same input across two calls", () => {
    const spec = baseSpec();
    expect(renderTestData(spec)).toBe(renderTestData(spec));
  });

  it("does not mutate the input spec", () => {
    const spec = baseSpec();
    const before = JSON.stringify(spec);
    renderTestData(spec);
    expect(JSON.stringify(spec)).toBe(before);
  });
});

describe("computeTestDataDesign - matrix / transition usage", () => {
  it("flags a state that no case requests via TDC-07", () => {
    const result = computeTestDataDesign(baseSpec());
    expect(result.generated).toBe(true);
    const finding = result.findings.find((f) => f.categoryId === "TDC-07" && f.target === "DC-RSV:S-CANCELLED");
    expect(finding).toBeDefined();
    const cell = result.matrix.find((m) => m.dataClassId === "DC-RSV" && m.stateId === "S-CANCELLED");
    expect(cell?.unused).toBe(true);
  });

  it("flags a transition that no update request passes via TDC-08", () => {
    const result = computeTestDataDesign(baseSpec());
    const finding = result.findings.find((f) => f.categoryId === "TDC-08" && f.target === "DC-RSV:T-CANCEL");
    expect(finding).toBeDefined();
    const usage = result.transitionUsages.find((u) => u.transitionId === "T-CANCEL");
    expect(usage?.unused).toBe(true);
    const confirmUsage = result.transitionUsages.find((u) => u.transitionId === "T-CONFIRM");
    expect(confirmUsage?.passingCaseIds).toEqual(["TC-02"]);
  });

  it("does not evaluate TDC-07/08/09 when no test cases are given", () => {
    const spec = baseSpec();
    spec.testCases = [];
    const result = computeTestDataDesign(spec);
    expect(result.matrixEvaluated).toBe(false);
    expect(result.findings.some((f) => ["TDC-07", "TDC-08", "TDC-09"].includes(f.categoryId))).toBe(false);
    const text = renderTestData(spec);
    expect(text).toContain("テストケース未指定のため未使用判定を行わなかった");
  });
});

describe("computeTestDataDesign - supply traceability (TDC-10)", () => {
  it("detects a case requesting a state unreachable from the item's initial state", () => {
    const spec = baseSpec();
    // 実体の初期状態を確定済に変更する。未確定へは遷移がないため到達不能になる。
    spec.dataItems = [{ id: "DI-01", dataClassId: "DC-RSV", label: "予約A", initialStateId: "S-CONFIRMED" }];
    const result = computeTestDataDesign(spec);
    expect(result.generated).toBe(true);
    const row = result.supplyRows.find((r) => r.caseId === "TC-01");
    expect(row?.supplyStatus).toBe("no-supplier");
    const finding = result.findings.find((f) => f.categoryId === "TDC-10" && f.target === "TC-01");
    expect(finding).toBeDefined();
  });
});

describe("computeTestDataDesign - case body substantiation (TDC-11)", () => {
  it("detects a request whose data class/state name never appears in the case body, and excludes it from state coverage numerator", () => {
    const spec = baseSpec();
    spec.testCases = [
      {
        caseId: "TC-01",
        preconditionText: "何も準備しない",
        requiredData: [{ dataClassId: "DC-RSV", stateId: "S-DRAFT", dataItemId: "DI-01", access: "read" }],
      },
    ];
    const result = computeTestDataDesign(spec);
    const row = result.supplyRows[0];
    expect(row.substantiation).toBe("no");
    const finding = result.findings.find((f) => f.categoryId === "TDC-11" && f.target === "TC-01");
    expect(finding).toBeDefined();
    expect(result.stateCoverage.basis).toBe("case-body");
    expect(result.stateCoverage.uncoveredIds).toContain(dataStateTargetId("DC-RSV", "S-DRAFT"));
  });
});

describe("computeTestDataDesign - exclusivity (TDC-13/14/15/16/18)", () => {
  it("detects two cases updating the same data item via TDC-13 and lists both in the exclusive group", () => {
    const spec = baseSpec();
    spec.testCases = [
      {
        caseId: "TC-01",
        preconditionText: "予約データDI-01が未確定である",
        stepsText: ["予約を確定する操作を行う"],
        requiredData: [
          { dataClassId: "DC-RSV", stateId: "S-DRAFT", dataItemId: "DI-01", access: "update", resultStateId: "S-CONFIRMED" },
        ],
      },
      {
        caseId: "TC-02",
        preconditionText: "予約データDI-01が未確定である",
        stepsText: ["予約を確定する操作を行う"],
        requiredData: [
          { dataClassId: "DC-RSV", stateId: "S-DRAFT", dataItemId: "DI-01", access: "update", resultStateId: "S-CONFIRMED" },
        ],
      },
    ];
    const result = computeTestDataDesign(spec);
    const finding = result.findings.find((f) => f.categoryId === "TDC-13");
    expect(finding).toBeDefined();
    const group = result.exclusiveGroups.find((g) => g.identityKey === "item:DI-01");
    expect(group?.updatingCaseIds.sort()).toEqual(["TC-01", "TC-02"]);
    const text = renderTestData(spec);
    expect(text).toContain("TC-01");
    expect(text).toContain("TC-02");
  });

  it("detects an update request on a sharingPolicy: shared data class via TDC-14", () => {
    const spec = baseSpec();
    spec.dataClasses[0].sharingPolicy = "shared";
    const result = computeTestDataDesign(spec);
    const finding = result.findings.find((f) => f.categoryId === "TDC-14" && f.target === "DC-RSV");
    expect(finding).toBeDefined();
  });

  it("detects two cases sharing the same data item on a sharingPolicy: exclusive data class via TDC-15", () => {
    const spec = baseSpec();
    spec.dataClasses[0].sharingPolicy = "exclusive";
    spec.testCases = [
      {
        caseId: "TC-01",
        preconditionText: "予約データDI-01が未確定である",
        requiredData: [{ dataClassId: "DC-RSV", stateId: "S-DRAFT", dataItemId: "DI-01", access: "read" }],
      },
      {
        caseId: "TC-02",
        preconditionText: "予約データDI-01が未確定である",
        requiredData: [{ dataClassId: "DC-RSV", stateId: "S-DRAFT", dataItemId: "DI-01", access: "read" }],
      },
    ];
    const result = computeTestDataDesign(spec);
    const finding = result.findings.find((f) => f.categoryId === "TDC-15");
    expect(finding).toBeDefined();
  });

  it("detects an update request whose resultStateId does not match any transition from the request state via TDC-16", () => {
    const spec = baseSpec();
    spec.testCases = [
      {
        caseId: "TC-01",
        preconditionText: "予約データDI-01が未確定である",
        stepsText: ["ありえない状態へ更新する"],
        requiredData: [
          { dataClassId: "DC-RSV", stateId: "S-DRAFT", dataItemId: "DI-01", access: "update", resultStateId: "S-CANCELLED" },
        ],
      },
    ];
    const result = computeTestDataDesign(spec);
    const finding = result.findings.find((f) => f.categoryId === "TDC-16" && f.target === "TC-01");
    expect(finding).toBeDefined();
  });

  it("detects a counter data class with no update request via TDC-18", () => {
    const spec: TestDataSpec = {
      dataClasses: [
        {
          id: "DC-SEAT",
          nameJa: "残席数",
          kind: "counter",
          states: [
            { id: "S-AVAILABLE", nameJa: "残席あり", isInitial: true },
            { id: "S-SOLDOUT", nameJa: "完売", isTerminal: true },
          ],
          transitions: [{ id: "T-SELLOUT", from: "S-AVAILABLE", to: "S-SOLDOUT", event: "残席が0になる" }],
        },
      ],
      testCases: [
        {
          caseId: "TC-01",
          preconditionText: "残席数が残席ありである",
          requiredData: [{ dataClassId: "DC-SEAT", stateId: "S-AVAILABLE", access: "read" }],
        },
      ],
    };
    const result = computeTestDataDesign(spec);
    const finding = result.findings.find((f) => f.categoryId === "TDC-18" && f.target === "DC-SEAT");
    expect(finding).toBeDefined();
  });
});

describe("computeTestDataDesign - structural gate and upper bound", () => {
  it("skips matrix/coverage computation and returns an empty universe when an undeclared id is referenced (TDC-02)", () => {
    const spec = baseSpec();
    spec.dataClasses[0].transitions.push({
      id: "T-BOGUS",
      from: "S-DRAFT",
      to: "S-UNKNOWN",
      event: "存在しない状態への遷移",
    });
    const result = computeTestDataDesign(spec);
    expect(result.generated).toBe(false);
    expect(result.findings.some((f) => f.categoryId === "TDC-02")).toBe(true);
    expect(buildTestDataCoverageTargets(spec)).toEqual([]);
  });

  it("reports TDC-17 and stops computation when maxDataClasses is exceeded", () => {
    const spec: TestDataSpec = {
      dataClasses: [reservationClass()],
      maxDataClasses: 0,
    };
    const result = computeTestDataDesign(spec);
    expect(result.generated).toBe(false);
    expect(result.findings.some((f) => f.categoryId === "TDC-17")).toBe(true);
    expect(result.matrix).toEqual([]);
  });

  it("exposes the default caps", () => {
    expect(DEFAULT_MAX_DATA_CLASSES).toBe(100);
    expect(DEFAULT_MAX_STATES_PER_CLASS).toBe(50);
  });
});

describe("computeTestDataDesign - coverage 'unavailable' reporting", () => {
  it("reports transition coverage as unavailable (not 0.0%) when no transitions are declared", () => {
    const spec: TestDataSpec = {
      dataClasses: [
        {
          id: "DC-SOLO",
          nameJa: "単一状態データ",
          states: [{ id: "S-ONLY", nameJa: "唯一の状態", isInitial: true, isTerminal: true }],
          transitions: [],
        },
      ],
      testCases: [
        {
          caseId: "TC-01",
          preconditionText: "単一状態データが唯一の状態である",
          requiredData: [{ dataClassId: "DC-SOLO", stateId: "S-ONLY", access: "read" }],
        },
      ],
    };
    const result = computeTestDataDesign(spec);
    expect(result.transitionCoverage.basis).toBe("unavailable");
    expect(result.transitionCoverage.reason).toContain("遷移が1件も宣言されていない");
    const text = renderTestData(spec);
    const transitionLine = text.split("\n").find((l) => l.includes("遷移被覆率")) ?? "";
    expect(transitionLine).toContain("未算出");
    expect(transitionLine).not.toContain("0.0%");
  });

  it("reports state coverage as unavailable when no test case has a body", () => {
    const spec = baseSpec();
    spec.testCases = spec.testCases?.map((tc) => ({ caseId: tc.caseId, requiredData: tc.requiredData })) ?? [];
    const result = computeTestDataDesign(spec);
    expect(result.stateCoverage.basis).toBe("unavailable");
    const text = renderTestData(spec);
    expect(text).toContain("状態被覆率: 未算出");
  });
});
