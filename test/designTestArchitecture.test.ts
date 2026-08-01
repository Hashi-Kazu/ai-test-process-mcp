import { describe, expect, it } from "vitest";
import {
  computeTestArchitecture,
  renderTestArchitecture,
} from "../src/tools/designTestArchitecture.js";
import type { TestArchitectureSpec, TestCaseSpec } from "../src/types.js";

// 3階層・コンテナ5件・テスト条件8件の正常系フィクスチャ。
// この基準入力では決定的検査の指摘が1件も出ないようにしてある。
function baseSpec(): TestArchitectureSpec {
  return {
    title: "予約システム 回帰テスト",
    scope: {
      inScope: [
        { item: "予約", reason: "今回の変更範囲" },
        { item: "決済", reason: "予約と連動して変更された" },
      ],
      outOfScope: [{ item: "帳票出力", reason: "今回変更が無く、前回リリースで確認済み" }],
    },
    containers: [
      {
        id: "TCN-01",
        nameJa: "予約システム全体",
        responsibility: "予約から決済までの業務が最後まで通ることを保証する",
        objective: "リリース可否判断の材料にする",
        testLevel: "system-testing",
        testTypes: ["機能テスト"],
        priorityClass: "must",
        perspectiveCategoryIds: ["TPC-01"],
        targets: ["予約システム"],
        environment: "検証環境",
      },
      {
        id: "TCN-02",
        nameJa: "予約",
        parentId: "TCN-01",
        responsibility: "予約の登録・変更が仕様どおり行えることを保証する",
        objective: "予約機能の受け入れ判断に使う",
        testLevel: "system-testing",
        testTypes: ["機能テスト"],
        priorityClass: "must",
        perspectiveCategoryIds: ["TPC-01"],
        targets: ["予約"],
        environment: "検証環境",
      },
      {
        id: "TCN-03",
        nameJa: "予約入力",
        parentId: "TCN-02",
        responsibility: "予約入力画面の入力値検証が仕様どおり行われることを保証する",
        objective: "入力検証の不具合を早期に見つける",
        testLevel: "system-testing",
        testTypes: ["機能テスト"],
        priorityClass: "must",
        perspectiveCategoryIds: ["TPC-01"],
        targets: ["予約入力画面"],
        environment: "検証環境",
      },
      {
        id: "TCN-04",
        nameJa: "予約確定",
        parentId: "TCN-02",
        responsibility: "予約確定時の在庫引き当てが仕様どおり行われることを保証する",
        objective: "在庫の二重引き当てを防ぐ",
        testLevel: "system-testing",
        testTypes: ["機能テスト"],
        priorityClass: "must",
        perspectiveCategoryIds: ["TPC-01"],
        targets: ["予約確定処理"],
        environment: "検証環境",
      },
      {
        id: "TCN-05",
        nameJa: "決済",
        parentId: "TCN-01",
        responsibility: "決済の成功・失敗が予約状態へ正しく反映されることを保証する",
        objective: "決済連携の不整合を検知する",
        testLevel: "system-testing",
        testTypes: ["機能テスト"],
        priorityClass: "must",
        perspectiveCategoryIds: ["TPC-01"],
        targets: ["決済連携"],
        environment: "検証環境",
      },
    ],
    testConditions: [
      { id: "TC-01", statement: "予約人数が下限のとき登録できる", perspectiveCategoryId: "TPC-01", priority: "高", containerIds: ["TCN-03"] },
      { id: "TC-02", statement: "予約人数が上限のとき登録できる", perspectiveCategoryId: "TPC-01", priority: "高", containerIds: ["TCN-03"] },
      { id: "TC-03", statement: "予約人数が上限超過のとき拒否される", perspectiveCategoryId: "TPC-01", priority: "中", containerIds: ["TCN-03"] },
      { id: "TC-04", statement: "在庫がある場合に予約が確定する", perspectiveCategoryId: "TPC-01", priority: "高", containerIds: ["TCN-04"] },
      { id: "TC-05", statement: "在庫が無い場合に予約が確定しない", perspectiveCategoryId: "TPC-01", priority: "高", containerIds: ["TCN-04"] },
      { id: "TC-06", statement: "決済成功で予約が確定状態になる", perspectiveCategoryId: "TPC-01", priority: "高", containerIds: ["TCN-05"] },
      { id: "TC-07", statement: "決済失敗で予約が保留状態になる", perspectiveCategoryId: "TPC-01", priority: "中", containerIds: ["TCN-05"] },
      { id: "TC-08", statement: "決済タイムアウトで予約が取り消される", perspectiveCategoryId: "TPC-01", priority: "低", containerIds: ["TCN-05"] },
    ],
  };
}

function testCase(caseId: string, testConditionId: string, overrides: Partial<TestCaseSpec> = {}): TestCaseSpec {
  return {
    caseId,
    title: `${testConditionId} の確認`,
    testConditionId,
    derivedFrom: ["REQ-01"],
    techniqueId: "checklist-based",
    coverageTargets: [`X:${testConditionId}`],
    preconditions: [{ name: "利用者", value: "ログイン済み" }],
    steps: [{ no: 1, action: "予約を登録する", expected: "予約一覧に1件追加される" }],
    testLevel: "system-testing",
    externalDependencyIds: [],
    estimatedDurationSeconds: 10,
    ...overrides,
  };
}

function findingIds(spec: TestArchitectureSpec): string[] {
  return computeTestArchitecture(spec).findings.map((f) => f.categoryId);
}

describe("computeTestArchitecture", () => {
  it("builds depth / path / isLeaf / rolledUpConditionIds for the base fixture", () => {
    const result = computeTestArchitecture(baseSpec());
    expect(result.generated).toBe(true);
    expect(result.findings).toEqual([]);

    const rows = new Map(result.containers.map((r) => [r.containerId, r]));
    expect(rows.get("TCN-01")).toMatchObject({ depth: 0, path: ["TCN-01"], isLeaf: false });
    expect(rows.get("TCN-02")).toMatchObject({ depth: 1, path: ["TCN-01", "TCN-02"], isLeaf: false });
    expect(rows.get("TCN-03")).toMatchObject({
      depth: 2,
      path: ["TCN-01", "TCN-02", "TCN-03"],
      isLeaf: true,
    });
    expect(rows.get("TCN-05")).toMatchObject({ depth: 1, path: ["TCN-01", "TCN-05"], isLeaf: true });

    expect(rows.get("TCN-03")?.conditionIds).toEqual(["TC-01", "TC-02", "TC-03"]);
    expect(rows.get("TCN-02")?.conditionIds).toEqual([]);
    expect(rows.get("TCN-02")?.rolledUpConditionIds).toEqual([
      "TC-01",
      "TC-02",
      "TC-03",
      "TC-04",
      "TC-05",
    ]);
    expect(rows.get("TCN-01")?.rolledUpConditionIds).toEqual([
      "TC-01",
      "TC-02",
      "TC-03",
      "TC-04",
      "TC-05",
      "TC-06",
      "TC-07",
      "TC-08",
    ]);
  });

  it("computes the assignment ratio with an explicit denominator and numerator", () => {
    const result = computeTestArchitecture(baseSpec());
    expect(result.totalConditionCount).toBe(8);
    expect(result.assignedConditionCount).toBe(8);
    expect(result.assignmentRatioPercent).toBe(100);
    expect(result.unassignedConditionIds).toEqual([]);
  });

  it("uses the assigned condition count as the share denominator", () => {
    const spec = baseSpec();
    spec.containers[4].testLevel = "integration-testing";
    const result = computeTestArchitecture(spec);
    const level = result.levelDistribution.find((r) => r.key === "integration-testing");
    expect(level?.containerIds).toEqual(["TCN-05"]);
    expect(level?.conditionCount).toBe(3);
    expect(level?.conditionSharePercent).toBe(37.5); // 3 / 8
  });

  it("returns identical output for the same input (deterministic)", () => {
    const a = computeTestArchitecture(baseSpec());
    const b = computeTestArchitecture(baseSpec());
    expect(a).toEqual(b);
    expect(renderTestArchitecture(baseSpec())).toBe(renderTestArchitecture(baseSpec()));
  });

  it("does not mutate the input spec", () => {
    const spec = baseSpec();
    spec.testCases = [testCase("TCS-001", "TC-01")];
    const snapshot = structuredClone(spec);
    computeTestArchitecture(spec);
    renderTestArchitecture(spec);
    expect(spec).toEqual(snapshot);
  });

  // --- 判定区分ごとの発火 ---

  it("TAC-01: reports test conditions that belong to no container", () => {
    const spec = baseSpec();
    spec.testConditions[7].containerIds = [];
    const result = computeTestArchitecture(spec);
    expect(result.findings.map((f) => f.categoryId)).toContain("TAC-01");
    expect(result.unassignedConditionIds).toEqual(["TC-08"]);
    expect(result.assignedConditionCount).toBe(7);
    expect(result.assignmentRatioPercent).toBe(87.5);
    expect(result.generated).toBe(false);
  });

  it("TAC-02: reports references to unknown container ids", () => {
    const spec = baseSpec();
    spec.testConditions[0].containerIds = ["TCN-99"];
    const ids = findingIds(spec);
    expect(ids).toContain("TAC-02");
    expect(ids).toContain("TAC-01"); // 既知コンテナが0件になるので未帰属でもある
  });

  it("TAC-03: reports duplicate container ids", () => {
    const spec = baseSpec();
    spec.containers.push({ ...spec.containers[4], nameJa: "決済(重複)" });
    expect(findingIds(spec)).toContain("TAC-03");
  });

  it("TAC-04: reports unknown / self / cyclic parent references", () => {
    const unknownParent = baseSpec();
    unknownParent.containers[4].parentId = "TCN-99";
    expect(findingIds(unknownParent)).toContain("TAC-04");

    const selfParent = baseSpec();
    selfParent.containers[4].parentId = "TCN-05";
    expect(findingIds(selfParent)).toContain("TAC-04");

    const cyclic = baseSpec();
    cyclic.containers[0].parentId = "TCN-03";
    expect(findingIds(cyclic)).toContain("TAC-04");
  });

  it("TAC-05: reports containers with a blank responsibility", () => {
    const spec = baseSpec();
    spec.containers[2].responsibility = "   ";
    const result = computeTestArchitecture(spec);
    expect(result.findings.some((f) => f.categoryId === "TAC-05" && f.target === "TCN-03")).toBe(true);
    expect(result.generated).toBe(false);
  });

  it("TAC-06: reports containers with no objective", () => {
    const spec = baseSpec();
    delete spec.containers[3].objective;
    expect(findingIds(spec)).toContain("TAC-06");
  });

  it("TAC-07: reports conditions assigned to more than one container", () => {
    const spec = baseSpec();
    spec.testConditions[0].containerIds = ["TCN-03", "TCN-04"];
    const result = computeTestArchitecture(spec);
    expect(result.findings.map((f) => f.categoryId)).toContain("TAC-07");
    expect(result.multiAssignedConditions).toEqual([
      { conditionId: "TC-01", containerIds: ["TCN-03", "TCN-04"] },
    ]);
  });

  it("TAC-08: reports leaf containers with no test conditions", () => {
    const spec = baseSpec();
    spec.containers.push({
      id: "TCN-06",
      nameJa: "通知",
      parentId: "TCN-01",
      responsibility: "通知の送信が仕様どおり行われることを保証する",
      objective: "通知漏れを検知する",
      testLevel: "system-testing",
      testTypes: ["機能テスト"],
      priorityClass: "must",
      targets: ["通知"],
    });
    const result = computeTestArchitecture(spec);
    expect(result.findings.some((f) => f.categoryId === "TAC-08" && f.target === "TCN-06")).toBe(true);
  });

  it("TAC-09: reports containers with no test types", () => {
    const spec = baseSpec();
    spec.containers[4].testTypes = [];
    expect(findingIds(spec)).toContain("TAC-09");
  });

  it("TAC-10: reports condition priorities the container priority class does not allow", () => {
    const spec = baseSpec();
    spec.containers[4].priorityClass = "optional";
    const result = computeTestArchitecture(spec);
    const hits = result.findings.filter((f) => f.categoryId === "TAC-10");
    expect(hits.length).toBe(2); // TC-06(高) / TC-07(中)。TC-08(低) は許容される
    expect(hits.every((f) => f.target === "TCN-05")).toBe(true);
  });

  it("TAC-11: reconciles declared perspective categories against the actual conditions in both directions", () => {
    const declaredOnly = baseSpec();
    declaredOnly.containers[4].perspectiveCategoryIds = ["TPC-01", "TPC-02"];
    expect(
      computeTestArchitecture(declaredOnly).findings.some(
        (f) => f.categoryId === "TAC-11" && f.detail.includes("TPC-02")
      )
    ).toBe(true);

    const actualOnly = baseSpec();
    actualOnly.testConditions[5].perspectiveCategoryId = "TPC-03";
    expect(
      computeTestArchitecture(actualOnly).findings.some(
        (f) => f.categoryId === "TAC-11" && f.detail.includes("TPC-03")
      )
    ).toBe(true);

    const notDeclared = baseSpec();
    for (const c of notDeclared.containers) delete c.perspectiveCategoryIds;
    expect(findingIds(notDeclared)).not.toContain("TAC-11");
  });

  it("TAC-12: reports perspective category ids missing from the catalog", () => {
    const fromContainer = baseSpec();
    fromContainer.containers[4].perspectiveCategoryIds = ["TPC-99"];
    expect(findingIds(fromContainer)).toContain("TAC-12");

    const fromCondition = baseSpec();
    fromCondition.testConditions[0].perspectiveCategoryId = "TPC-98";
    expect(findingIds(fromCondition)).toContain("TAC-12");
  });

  it("TAC-13: reports cases whose declared test level differs from the container", () => {
    const spec = baseSpec();
    spec.testCases = [
      testCase("TCS-001", "TC-01"),
      testCase("TCS-002", "TC-02", { testLevel: "component-testing" }),
      ...["TC-03", "TC-04", "TC-05", "TC-06", "TC-07", "TC-08"].map((id, i) =>
        testCase(`TCS-10${i}`, id)
      ),
    ];
    const result = computeTestArchitecture(spec);
    const hit = result.findings.find((f) => f.categoryId === "TAC-13");
    expect(hit?.target).toBe("TCN-03");
    expect(hit?.detail).toContain("TCS-002");
  });

  it("TAC-14: reports missing scope, missing out-of-scope reasons, and in-scope items no container owns", () => {
    const noScope = baseSpec();
    delete noScope.scope;
    expect(findingIds(noScope)).toContain("TAC-14");

    const noReason = baseSpec();
    (noReason.scope as NonNullable<TestArchitectureSpec["scope"]>).outOfScope = [{ item: "帳票出力" }];
    expect(
      computeTestArchitecture(noReason).findings.some(
        (f) => f.categoryId === "TAC-14" && f.detail.includes("根拠が記入されていない")
      )
    ).toBe(true);

    const unownedItem = baseSpec();
    (unownedItem.scope as NonNullable<TestArchitectureSpec["scope"]>).inScope.push({
      item: "ポイント付与",
    });
    expect(
      computeTestArchitecture(unownedItem).findings.some(
        (f) => f.categoryId === "TAC-14" && f.detail.includes("ポイント付与")
      )
    ).toBe(true);
  });

  it("TAC-15: reports assigned conditions that reach no test case", () => {
    const spec = baseSpec();
    spec.testCases = [testCase("TCS-001", "TC-01"), testCase("TCS-002", "TC-04")];
    const result = computeTestArchitecture(spec);
    expect(result.uncoveredConditionIds).toEqual([
      "TC-02",
      "TC-03",
      "TC-05",
      "TC-06",
      "TC-07",
      "TC-08",
    ]);
    const hits = result.findings.filter((f) => f.categoryId === "TAC-15");
    expect(hits.map((f) => f.target)).toEqual(["TCN-03", "TCN-04", "TCN-05"]);
    expect(hits[0].detail).toContain("TC-02");
    expect(hits[0].detail).toContain("TC-03");
  });

  it("TAC-16: skips generation when the container count or depth cap is exceeded", () => {
    const tooMany = baseSpec();
    tooMany.maxContainers = 2;
    const manyResult = computeTestArchitecture(tooMany);
    expect(manyResult.findings.some((f) => f.categoryId === "TAC-16")).toBe(true);
    expect(manyResult.generated).toBe(false);

    const tooDeep = baseSpec();
    tooDeep.maxDepth = 1;
    const deepResult = computeTestArchitecture(tooDeep);
    expect(deepResult.findings.some((f) => f.categoryId === "TAC-16")).toBe(true);
    expect(deepResult.generated).toBe(false);
  });

  it("TAC-17: reconciles declared decomposition axes against the actual containers", () => {
    const singleLevel = baseSpec();
    singleLevel.decompositionAxisIds = ["TAX-01"];
    expect(
      computeTestArchitecture(singleLevel).findings.some(
        (f) => f.categoryId === "TAC-17" && f.target === "TAX-01"
      )
    ).toBe(true);

    const singleType = baseSpec();
    singleType.decompositionAxisIds = ["TAX-03"];
    expect(
      computeTestArchitecture(singleType).findings.some(
        (f) => f.categoryId === "TAC-17" && f.target === "TAX-03"
      )
    ).toBe(true);

    const singlePriority = baseSpec();
    singlePriority.decompositionAxisIds = ["TAX-05"];
    expect(
      computeTestArchitecture(singlePriority).findings.some(
        (f) => f.categoryId === "TAC-17" && f.target === "TAX-05"
      )
    ).toBe(true);

    const unknownAxis = baseSpec();
    unknownAxis.decompositionAxisIds = ["TAX-99"];
    expect(
      computeTestArchitecture(unknownAxis).findings.some(
        (f) => f.categoryId === "TAC-17" && f.target === "TAX-99"
      )
    ).toBe(true);

    const notDeclared = baseSpec();
    expect(findingIds(notDeclared)).not.toContain("TAC-17");
  });
});

describe("renderTestArchitecture", () => {
  it("emits all nine sections", () => {
    const markdown = renderTestArchitecture(baseSpec());
    for (const heading of [
      "## 1. テストスコープ",
      "## 2. テストコンテナ一覧",
      "## 3. コンテナ階層図",
      "## 4. テスト条件のコンテナ帰属",
      "## 5. 分布",
      "## 6. コンテナ別テストサイズ・テストレベル分布",
      "## 7. 条件→ケースのトレーサビリティ",
      "## 8. 決定的検査",
      "## 9. サマリ",
    ]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain("### 5.1 コンテナ×テストレベル");
    expect(markdown).toContain("### 5.2 コンテナ×テストタイプ");
    expect(markdown).toContain("### 5.3 優先度クラス");
    expect(markdown).toContain("```mermaid");
    expect(markdown).toContain("flowchart TD");
  });

  it("states the denominator and numerator of the assignment ratio and lists every unassigned condition", () => {
    const spec = baseSpec();
    spec.testConditions[6].containerIds = [];
    spec.testConditions[7].containerIds = [];
    const markdown = renderTestArchitecture(spec);
    expect(markdown).toContain("分母: 入力テスト条件 8 件、分子: 既知コンテナへ1件以上帰属した条件 6 件");
    expect(markdown).toContain("- 未帰属(2件): TC-07, TC-08");
  });

  it("states the share denominator under each distribution table", () => {
    const markdown = renderTestArchitecture(baseSpec());
    expect(markdown).toContain("構成比の分母は帰属済み条件数 8 件");
  });

  it("does not emit test size numbers when no test cases are given", () => {
    const markdown = renderTestArchitecture(baseSpec());
    const section = markdown.split("## 6. コンテナ別テストサイズ・テストレベル分布")[1].split("## 7.")[0];
    expect(section).toContain("未算出(理由: テストケースが渡されていない)");
    expect(section).not.toContain("| small |");
  });

  it("emits per-container size distribution when test cases are given", () => {
    const spec = baseSpec();
    spec.testCases = [testCase("TCS-001", "TC-01"), testCase("TCS-002", "TC-04")];
    const markdown = renderTestArchitecture(spec);
    const section = markdown.split("## 6. コンテナ別テストサイズ・テストレベル分布")[1].split("## 7.")[0];
    expect(section).toContain("| コンテナID | ケース数 | small | medium | large | テストレベル分布 |");
    expect(section).toContain("| TCN-03 | 1 |");
    expect(markdown).toContain("なし（ケース未作成）");
    expect(markdown).toContain("TAC-15");
  });

  it("skips the tables and states the skip reason when generation is blocked", () => {
    const spec = baseSpec();
    spec.testConditions[0].containerIds = [];
    const markdown = renderTestArchitecture(spec);
    expect(markdown).toContain("入力に致命的な指摘があるため生成をスキップした");
    expect(markdown).toContain("未算出(理由:");
    expect(markdown).not.toContain("| コンテナID | 階層 | 名称 |");
    expect(markdown).toContain("TAC-01");
    expect(markdown).toContain("TC-01");
  });

  it("points to the design principles resource in the summary", () => {
    expect(renderTestArchitecture(baseSpec())).toContain("testarch://container/design-principles");
  });
});
