import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import {
  DEFAULT_MAX_SCENARIOS_PER_USE_CASE,
  MAIN_FLOW_ID,
  buildScenarioFlowCoverageTargets,
  computeScenarioFlows,
  renderScenarioFlows,
  scenarioTargetId,
  useCaseFlowTargetId,
} from "../src/tools/designScenarioFlows.js";
import type { ScenarioFlowSpec } from "../src/types.js";

// 動物園入場ドメイン: 購入 → 発券 → 入場。
// 主フロー5ステップ、代替フロー1件（電子マネー払い・目的達成）、例外フロー1件（決済失敗・目的未達）。
function baseSpec(): ScenarioFlowSpec {
  return {
    title: "入場券の購入から入場まで",
    actors: [
      { id: "A-USER", nameJa: "来園者", kind: "human" },
      { id: "A-SYS", nameJa: "発券システム", kind: "system" },
    ],
    featureIds: ["F-PURCHASE", "F-ISSUE", "F-ENTRY"],
    useCases: [
      {
        id: "UC-01",
        nameJa: "入場券を購入して入場する",
        primaryActor: "A-USER",
        supportingActors: ["A-SYS"],
        preconditions: ["券売機が稼働している"],
        postconditions: ["入場者数が1件加算される"],
        mainFlow: [
          { no: 1, actor: "A-USER", action: "券売機で入場券を購入する", featureIds: ["F-PURCHASE"] },
          { no: 2, actor: "A-SYS", action: "決済を確定する", featureIds: ["F-PURCHASE"] },
          { no: 3, actor: "A-SYS", action: "入場券を発券する", featureIds: ["F-ISSUE"] },
          { no: 4, actor: "A-USER", action: "入場ゲートに入場券をかざす", featureIds: ["F-ENTRY"] },
          { no: 5, actor: "A-SYS", action: "入場を許可しゲートを開く", featureIds: ["F-ENTRY"] },
        ],
        branches: [
          {
            id: "AF-01",
            kind: "alternate",
            nameJa: "電子マネーで支払う",
            fromStepNo: 1,
            trigger: "来園者が電子マネー払いを選ぶ",
            steps: [
              { no: 1, actor: "A-SYS", action: "電子マネー残高から引き落とす", featureIds: ["F-PURCHASE"] },
            ],
            rejoinStepNo: 3,
            outcome: "goal-achieved",
          },
          {
            id: "EF-01",
            kind: "exception",
            nameJa: "決済失敗で購入を中止する",
            fromStepNo: 2,
            trigger: "決済が承認されない",
            steps: [
              { no: 1, actor: "A-SYS", action: "決済失敗を表示し購入を取り消す", featureIds: ["F-PURCHASE"] },
            ],
            outcome: "aborted",
          },
        ],
      },
    ],
  };
}

function categoryIds(spec: ScenarioFlowSpec): string[] {
  return [...new Set(computeScenarioFlows(spec).findings.map((f) => f.categoryId))].sort();
}

describe("computeScenarioFlows", () => {
  it("has a scenario cap default of 200", () => {
    expect(DEFAULT_MAX_SCENARIOS_PER_USE_CASE).toBe(200);
  });

  it("generates the main-flow-only scenario first as a normal-class scenario", () => {
    const result = computeScenarioFlows(baseSpec());
    expect(result.generated).toBe(true);
    const uc = result.useCases[0];
    const main = uc.scenarios[0];
    expect(main.index).toBe(1);
    expect(main.id).toBe(scenarioTargetId("UC-01", 1));
    expect(main.outcomeClass).toBe("normal");
    expect(main.passedFlowIds).toEqual([MAIN_FLOW_ID]);
    expect(main.branchId).toBeUndefined();
    expect(main.steps.map((s) => s.stepNo)).toEqual([1, 2, 3, 4, 5]);
    expect(main.featureIds).toEqual(["F-PURCHASE", "F-ISSUE", "F-ENTRY"]);
  });

  it("generates one scenario per branch in declaration order", () => {
    const uc = computeScenarioFlows(baseSpec()).useCases[0];
    expect(uc.scenarios).toHaveLength(3);
    expect(uc.scenarios.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(uc.scenarios.map((s) => s.branchId)).toEqual([undefined, "AF-01", "EF-01"]);
    expect(uc.scenarios[1].id).toBe(scenarioTargetId("UC-01", 2));
    expect(uc.scenarios[1].trigger).toBe("来園者が電子マネー払いを選ぶ");
    expect(uc.scenarios[1].passedFlowIds).toEqual([MAIN_FLOW_ID, "AF-01"]);
    expect(uc.flowIds).toEqual([MAIN_FLOW_ID, "AF-01", "EF-01"]);
    expect(uc.expandedFlowIds).toEqual([MAIN_FLOW_ID, "AF-01", "EF-01"]);
  });

  it("derives passedFlowIds from the actual step sequence, not from the declaration", () => {
    const uc = computeScenarioFlows(baseSpec()).useCases[0];
    expect(uc.scenarios[1].passedFlowIds).toEqual([MAIN_FLOW_ID, "AF-01"]);

    const spec = baseSpec();
    (spec.useCases[0].branches ?? [])[0].steps = [];
    const emptied = computeScenarioFlows(spec).useCases[0];
    expect(emptied.scenarios[1].branchId).toBe("AF-01");
    expect(emptied.scenarios[1].passedFlowIds).toEqual([MAIN_FLOW_ID]);
  });

  it("orders branch scenario steps as main<=fromStepNo, branch steps, main>=rejoinStepNo", () => {
    const uc = computeScenarioFlows(baseSpec()).useCases[0];
    expect(uc.scenarios[1].steps.map((s) => `${s.flowId}#${s.stepNo}`)).toEqual([
      "MAIN#1",
      "AF-01#1",
      "MAIN#3",
      "MAIN#4",
      "MAIN#5",
    ]);
  });

  it("omits the rejoin part when rejoinStepNo is not declared", () => {
    const uc = computeScenarioFlows(baseSpec()).useCases[0];
    expect(uc.scenarios[2].steps.map((s) => `${s.flowId}#${s.stepNo}`)).toEqual([
      "MAIN#1",
      "MAIN#2",
      "EF-01#1",
    ]);
  });

  it("classifies goal-achieved as semi-normal and aborted as abnormal", () => {
    const uc = computeScenarioFlows(baseSpec()).useCases[0];
    expect(uc.scenarios.map((s) => s.outcomeClass)).toEqual(["normal", "semi-normal", "abnormal"]);
    expect(uc.normalCount).toBe(1);
    expect(uc.semiNormalCount).toBe(1);
    expect(uc.abnormalCount).toBe(1);
  });

  it("does not let kind change the classification (only outcome does)", () => {
    const spec = baseSpec();
    // 種別だけを入れ替える（代替 ⇔ 例外）。終了状態は変えない。
    const branches = spec.useCases[0].branches ?? [];
    branches[0].kind = "exception";
    branches[1].kind = "alternate";
    const uc = computeScenarioFlows(spec).useCases[0];
    expect(uc.scenarios.map((s) => s.outcomeClass)).toEqual(["normal", "semi-normal", "abnormal"]);
  });

  it("is deterministic for the same input", () => {
    const first = JSON.stringify(computeScenarioFlows(baseSpec()));
    const second = JSON.stringify(computeScenarioFlows(baseSpec()));
    expect(first).toBe(second);
  });

  it("reports no findings for the base spec and expands every declared flow", () => {
    const result = computeScenarioFlows(baseSpec());
    expect(result.findings).toEqual([]);
    expect(result.flowCount).toBe(3);
    expect(result.expandedFlowCount).toBe(3);
    expect(result.flowExpansionRatioPercent).toBe(100);
    expect(result.scenarioCount).toBe(3);
  });

  it("computes feature coverage against the declared population", () => {
    const result = computeScenarioFlows(baseSpec());
    expect(result.featureCoverageBasis).toBe("declared-population");
    expect(result.featureCoverageRatioPercent).toBe(100);
    expect(result.passedFeatureIds).toEqual(["F-PURCHASE", "F-ISSUE", "F-ENTRY"]);
    expect(result.uncoveredFeatureIds).toEqual([]);
  });

  it("leaves feature coverage unavailable when the population is not declared", () => {
    const spec = baseSpec();
    delete spec.featureIds;
    const result = computeScenarioFlows(spec);
    expect(result.featureCoverageBasis).toBe("unavailable");
    expect(result.featureCoverageRatioPercent).toBeUndefined();

    const md = renderScenarioFlows(spec);
    expect(md).toContain("未算出(理由: 機能ID母集団が未宣言)");
    expect(md).toContain("機能ID被覆率: 未算出");
    expect(md).not.toMatch(/機能ID被覆率: \d/);
  });

  // --- SFC-01..SFC-06（high: 生成をスキップする） ---

  const expectBlocked = (spec: ScenarioFlowSpec, categoryId: string) => {
    const result = computeScenarioFlows(spec);
    expect(result.generated).toBe(false);
    expect(result.skipReason).toBeTruthy();
    expect(result.skipReason).toContain(categoryId);
    expect(result.useCases).toEqual([]);
    const finding = result.findings.find((f) => f.categoryId === categoryId);
    expect(finding?.severity).toBe("high");
  };

  it("SFC-01: detects references to undeclared actors", () => {
    const spec = baseSpec();
    spec.useCases[0].mainFlow[0].actor = "A-GHOST";
    expectBlocked(spec, "SFC-01");
  });

  it("SFC-02: detects duplicate use case ids and duplicate branch ids", () => {
    const duplicateUseCase = baseSpec();
    duplicateUseCase.useCases.push({ ...duplicateUseCase.useCases[0] });
    expectBlocked(duplicateUseCase, "SFC-02");

    const duplicateBranch = baseSpec();
    const branches = duplicateBranch.useCases[0].branches ?? [];
    branches[1].id = "AF-01";
    expectBlocked(duplicateBranch, "SFC-02");
  });

  it("SFC-03: detects step numbers that are not a 1-based sequence", () => {
    const spec = baseSpec();
    spec.useCases[0].mainFlow[1].no = 4;
    expectBlocked(spec, "SFC-03");
  });

  it("SFC-04: detects branch/rejoin positions that do not exist or go backwards", () => {
    const missingFrom = baseSpec();
    (missingFrom.useCases[0].branches ?? [])[0].fromStepNo = 99;
    expectBlocked(missingFrom, "SFC-04");

    const backwardsRejoin = baseSpec();
    const branch = (backwardsRejoin.useCases[0].branches ?? [])[0];
    branch.fromStepNo = 4;
    branch.rejoinStepNo = 2;
    expectBlocked(backwardsRejoin, "SFC-04");
  });

  it("SFC-05: detects branches without a trigger", () => {
    const spec = baseSpec();
    (spec.useCases[0].branches ?? [])[0].trigger = "   ";
    expectBlocked(spec, "SFC-05");
  });

  it("SFC-06: detects feature ids outside the declared population", () => {
    const spec = baseSpec();
    spec.useCases[0].mainFlow[0].featureIds = ["F-UNKNOWN"];
    expectBlocked(spec, "SFC-06");
  });

  // --- SFC-07..SFC-14 ---

  it("SFC-07: flags use cases without an exception flow", () => {
    const spec = baseSpec();
    spec.useCases[0].branches = (spec.useCases[0].branches ?? []).filter((b) => b.id !== "EF-01");
    const finding = computeScenarioFlows(spec).findings.find((f) => f.categoryId === "SFC-07");
    expect(finding?.severity).toBe("medium");
    expect(finding?.target).toBe("UC-01");
  });

  it("SFC-08: flags a scenario set with no abnormal (or no semi-normal) scenario", () => {
    const spec = baseSpec();
    spec.useCases[0].branches = (spec.useCases[0].branches ?? []).filter((b) => b.id !== "EF-01");
    const result = computeScenarioFlows(spec);
    expect(result.abnormalCount).toBe(0);
    const finding = result.findings.find((f) => f.categoryId === "SFC-08");
    expect(finding?.severity).toBe("medium");
    expect(finding?.detail).toContain("異常系");
  });

  it("SFC-09: flags declared feature ids that no scenario step passes through", () => {
    const spec = baseSpec();
    spec.featureIds = [...(spec.featureIds ?? []), "F-REFUND"];
    const result = computeScenarioFlows(spec);
    expect(result.uncoveredFeatureIds).toEqual(["F-REFUND"]);
    expect(result.featureCoverageRatioPercent).toBe(75);
    const finding = result.findings.find((f) => f.categoryId === "SFC-09");
    expect(finding?.severity).toBe("medium");
    expect(finding?.target).toBe("F-REFUND");
  });

  it("SFC-10: flags flows whose steps carry no feature id at all", () => {
    const spec = baseSpec();
    for (const step of (spec.useCases[0].branches ?? [])[1].steps) delete step.featureIds;
    const finding = computeScenarioFlows(spec).findings.find((f) => f.categoryId === "SFC-10");
    expect(finding?.severity).toBe("medium");
    expect(finding?.target).toBe(useCaseFlowTargetId("UC-01", "EF-01"));
  });

  it("SFC-11 / SFC-12: reconciles test conditions with the feature ids scenarios pass through", () => {
    const spec = baseSpec();
    spec.testConditions = [
      { id: "TC-001", statement: "購入できること", featureIds: ["F-PURCHASE"] },
      { id: "TC-002", statement: "払戻しできること", featureIds: ["F-REFUND"] },
    ];
    const findings = computeScenarioFlows(spec).findings;

    const sfc11 = findings.filter((f) => f.categoryId === "SFC-11");
    expect(sfc11).toHaveLength(1);
    expect(sfc11[0].target).toBe("F-REFUND");
    expect(sfc11[0].severity).toBe("medium");

    const sfc12 = findings.filter((f) => f.categoryId === "SFC-12");
    expect(sfc12.map((f) => f.target)).toEqual(["F-ISSUE", "F-ENTRY"]);
    expect(sfc12[0].severity).toBe("medium");
  });

  it("does not run SFC-11 / SFC-12 when no test condition is declared", () => {
    expect(categoryIds(baseSpec())).toEqual([]);
  });

  it("SFC-13: flags scenarios whose passed step sequence is identical", () => {
    const spec = baseSpec();
    const branches = spec.useCases[0].branches ?? [];
    branches.push({
      ...branches[0],
      id: "AF-02",
      nameJa: "電子マネーで支払う(重複宣言)",
      steps: branches[0].steps.map((s) => ({ ...s })),
    });
    const finding = computeScenarioFlows(spec).findings.find((f) => f.categoryId === "SFC-13");
    expect(finding?.severity).toBe("medium");
    expect(finding?.target).toBe(scenarioTargetId("UC-01", 4));
    expect(finding?.detail).toContain(scenarioTargetId("UC-01", 2));
  });

  it("SFC-13: does not flag branches whose steps match but whose trigger differs", () => {
    const spec = baseSpec();
    const branches = spec.useCases[0].branches ?? [];
    branches.push({
      ...branches[0],
      id: "AF-02",
      nameJa: "QRコードで支払う",
      trigger: "来園者がQRコード払いを選ぶ",
      steps: branches[0].steps.map((s) => ({ ...s })),
    });
    const findings = computeScenarioFlows(spec).findings.filter((f) => f.categoryId === "SFC-13");
    expect(findings).toEqual([]);
  });

  it("SFC-13: does not flag branches whose steps and trigger match but whose outcome differs", () => {
    const spec = baseSpec();
    const branches = spec.useCases[0].branches ?? [];
    branches.push({
      ...branches[0],
      id: "AF-03",
      nameJa: "電子マネーの引き落としに失敗する",
      outcome: "aborted",
      steps: branches[0].steps.map((s) => ({ ...s })),
    });
    const findings = computeScenarioFlows(spec).findings.filter((f) => f.categoryId === "SFC-13");
    expect(findings).toEqual([]);
  });

  it("SFC-14: skips generation when the scenario cap is exceeded", () => {
    const spec = { ...baseSpec(), maxScenariosPerUseCase: 1 };
    const result = computeScenarioFlows(spec);
    expect(result.generated).toBe(false);
    expect(result.useCases).toEqual([]);
    const finding = result.findings.find((f) => f.categoryId === "SFC-14");
    expect(finding?.severity).toBe("info");
    expect(result.skipReason).toContain("上限 1 件");
  });

  it("SFC-15: flags declared flows whose steps never appear in any scenario", () => {
    const spec = baseSpec();
    (spec.useCases[0].branches ?? [])[0].steps = [];
    const result = computeScenarioFlows(spec);
    expect(result.flowCount).toBe(3);
    expect(result.expandedFlowCount).toBe(2);
    expect(result.flowExpansionRatioPercent).toBe(66.7);
    const finding = result.findings.find((f) => f.categoryId === "SFC-15");
    expect(finding?.severity).toBe("medium");
    expect(finding?.target).toBe(useCaseFlowTargetId("UC-01", "AF-01"));
    expect(result.useCases[0].expandedFlowIds).toEqual([MAIN_FLOW_ID, "EF-01"]);
  });
});

describe("buildScenarioFlowCoverageTargets", () => {
  it("emits UC: targets for every flow and SC: targets for every scenario in order", () => {
    const targets = buildScenarioFlowCoverageTargets(baseSpec());
    expect(targets.map((t) => t.id)).toEqual([
      useCaseFlowTargetId("UC-01", MAIN_FLOW_ID),
      useCaseFlowTargetId("UC-01", "AF-01"),
      useCaseFlowTargetId("UC-01", "EF-01"),
      scenarioTargetId("UC-01", 1),
      scenarioTargetId("UC-01", 2),
      scenarioTargetId("UC-01", 3),
    ]);
    expect(targets.slice(0, 3).every((t) => t.techniqueId === "use-case-based")).toBe(true);
    expect(targets.slice(3).every((t) => t.techniqueId === "scenario-based")).toBe(true);
    expect(targets.every((t) => t.origin === "UC-01")).toBe(true);
    expect(targets[0].description).toContain("主フロー");
    expect(targets[3].description).toContain("正常系");
    expect(targets[4].description).toContain("準正常系");
    expect(targets[5].description).toContain("異常系");
  });

  it("returns an empty array when generation was skipped", () => {
    const spec = baseSpec();
    spec.useCases[0].mainFlow[0].actor = "A-GHOST";
    expect(buildScenarioFlowCoverageTargets(spec)).toEqual([]);
  });
});

describe("renderScenarioFlows", () => {
  it("renders all nine sections", () => {
    const md = renderScenarioFlows(baseSpec());
    for (const heading of [
      "# ユースケース／シナリオ設計結果",
      "## 1. アクター一覧",
      "## 2. ユースケース・フロー一覧",
      "## 3. シナリオ一覧",
      "## 4. 分類サマリ",
      "## 5. 機能ID被覆",
      "## 6. テスト条件との突合",
      "## 7. 決定的検査",
      "## 8. 網羅対象一覧(generate_test_cases 引き渡し)",
      "## 9. サマリ",
    ]) {
      expect(md).toContain(heading);
    }
  });

  it("lists scenario ids with their classification labels", () => {
    const md = renderScenarioFlows(baseSpec());
    expect(md).toContain(scenarioTargetId("UC-01", 1));
    expect(md).toContain(scenarioTargetId("UC-01", 3));
    expect(md).toContain("正常系");
    expect(md).toContain("準正常系");
    expect(md).toContain("異常系");
  });

  it("renders both the UC: and SC: coverage target tables", () => {
    const md = renderScenarioFlows(baseSpec());
    expect(md).toContain("### 8.1 フロー(UC:)");
    expect(md).toContain("### 8.2 シナリオ(SC:)");
    expect(md).toContain(useCaseFlowTargetId("UC-01", "EF-01"));
    expect(md).toContain(scenarioTargetId("UC-01", 2));
  });

  it("says 指摘なし when there is no finding, and 宣言なし without test conditions", () => {
    const md = renderScenarioFlows(baseSpec());
    expect(md).toContain("- 指摘なし");
    expect(md).toContain("- 宣言なし");
  });

  it("renders 未算出 for the skipped sections when generation is skipped", () => {
    const spec = baseSpec();
    spec.useCases[0].mainFlow[0].actor = "A-GHOST";
    const md = renderScenarioFlows(spec);
    expect(md).toContain("未算出(理由:");
    expect(md).toContain("[high] SFC-01");
  });

  it("renders the flow expansion ratio with its denominator and numerator", () => {
    const md = renderScenarioFlows(baseSpec());
    expect(md).toContain(
      "フロー展開率: 100.0%（分母: 宣言フロー 3 件、分子: 生成シナリオのステップ列に実際に現れたフロー 3 件）"
    );
    expect(md).not.toContain("フロー被覆率");
  });

  it("no longer renders the unreachable out-of-population feature id line", () => {
    expect(renderScenarioFlows(baseSpec())).not.toContain("母集団外の参照");
  });

  it("is deterministic for the same input", () => {
    expect(renderScenarioFlows(baseSpec())).toBe(renderScenarioFlows(baseSpec()));
  });
});

describe("renderScenarioFlows 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderScenarioFlows(baseSpec()));
  });

  it("機能ID母集団が宣言済みで指摘も無ければ、締めの注意書きは生成物依存なし文言になる", () => {
    const spec = baseSpec();
    const md = renderScenarioFlows(spec);
    expect(md).toContain(
      "この節は本ツールが静的に保持する後続表のみから生成しており、生成物の内容に依存する後続提示はない。"
    );
  });

  it("機能ID母集団が未宣言だと has-unmeasured-feature-coverage シグナルが含まれる", () => {
    const spec = baseSpec();
    delete spec.featureIds;
    const md = renderScenarioFlows(spec);
    expect(md).toContain("has-unmeasured-feature-coverage");
  });

  it("high指摘(ステップ番号不正)があると has-high-findings シグナルが含まれる", () => {
    const spec = baseSpec();
    spec.useCases[0].mainFlow[0].no = 9;
    const md = renderScenarioFlows(spec);
    expect(md).toContain("has-high-findings");
  });
});
