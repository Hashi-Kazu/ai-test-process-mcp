import { describe, expect, it } from "vitest";
import { renderBusinessRequirementModel } from "../src/tools/generateBusinessRequirementModel.js";
import type { GenerateBusinessRequirementModelInput } from "../src/types.js";

const fullInput: GenerateBusinessRequirementModelInput = {
  subjectName: "園内チケットシステム",
  roles: [{ id: "ROLE-01", nameJa: "窓口担当" }],
  purposes: [
    { id: "PUR-01", level: "businessGoal", statement: "待ち時間を減らす" },
    {
      id: "PUR-02",
      level: "systemizationPurpose",
      statement: "QR入場を自動化する",
      achievementMetric: "平均待ち時間",
      measurementMethod: "入場ログの時刻差分",
    },
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
      exceptionOperation: "手動でゲートを開ける",
    },
  ],
  flowSteps: [
    {
      id: "BFL-01",
      useCaseId: "BUC-01",
      no: 1,
      actorRoleId: "ROLE-01",
      action: "QRコードを読み取る",
      handedOverInfo: "入場券情報",
      featureIds: ["F-001"],
      dataAccess: [{ dataId: "BDT-01", access: "read" }],
    },
    {
      id: "BFL-02",
      useCaseId: "BUC-01",
      no: 2,
      actorRoleId: "ROLE-01",
      action: "入場券を使用済にする",
      dataAccess: [{ dataId: "BDT-01", access: "update" }],
    },
  ],
  drivingData: [
    {
      id: "BDT-01",
      name: "入場券",
      suggestedKind: "transaction",
      source: "券売機",
      hasStates: true,
      states: ["未使用", "使用済"],
      sharingScope: "窓口・ゲート間で共有",
    },
  ],
  featureIdPopulation: ["F-001"],
  claimedFeatureCoveragePercent: 100,
};

const SECTION_HEADINGS = [
  "## 1. 前提と対象",
  "## 2. 目的階層表",
  "## 3. 業務ユースケース一覧表",
  "## 4. 業務フロー表",
  "## 5. 駆動データ表",
  "## 6. 決定的整合性検査",
  "## 7. 意味的層の指示",
  "## 8. 下流への引き渡し",
  "## 9. persona フレームとの役割分担",
];

describe("renderBusinessRequirementModel", () => {
  it("renders the four layers, the purpose hierarchy and the business use case table", () => {
    const markdown = renderBusinessRequirementModel(fullInput);
    for (const heading of SECTION_HEADINGS) {
      expect(markdown).toContain(heading);
    }
    expect(markdown).toContain("BRL-01");
    expect(markdown).toContain("BRL-04");
    expect(markdown).toContain("BPL-01");
    expect(markdown).toContain("BPL-03");
    expect(markdown).toContain("PUR-02");
    expect(markdown).toContain("BUC-01");
    expect(markdown).toContain("入場受付");
    expect(markdown).toContain("ROLE-01");
  });

  it("returns generation instructions only when businessUseCases is empty", () => {
    const markdown = renderBusinessRequirementModel({});
    expect(markdown).toContain("生成指示のみ");
    expect(markdown).not.toContain("## 6. 決定的整合性検査");
    expect(markdown).not.toContain("## 9. persona フレームとの役割分担");
  });

  it("reports BRC-03 / BRC-04 for purposes and use cases that are not linked to each other", () => {
    const input: GenerateBusinessRequirementModelInput = {
      purposes: [{ id: "PUR-01", level: "businessGoal", statement: "unused purpose" }],
      businessUseCases: [{ id: "BUC-01", name: "紐づけなしユースケース" }],
    };
    const markdown = renderBusinessRequirementModel(input);
    expect(markdown).toContain("BRC-03[high]");
    expect(markdown).toContain("PUR-01");
    expect(markdown).toContain("BRC-04[high]");
    expect(markdown).toContain("BUC-01");
  });

  it("reports BRC-06 / BRC-07 against the declared feature id population and omits the coverage rate when the population is undeclared", () => {
    const withPopulation: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01", featureIds: ["F-999"] }],
      featureIdPopulation: ["F-001"],
    };
    const markdownWithPopulation = renderBusinessRequirementModel(withPopulation);
    expect(markdownWithPopulation).toContain("BRC-06[medium]");
    expect(markdownWithPopulation).toContain("F-001");
    expect(markdownWithPopulation).toContain("BRC-07[high]");
    expect(markdownWithPopulation).toContain("F-999");

    const withoutPopulation: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01", featureIds: ["F-999"] }],
    };
    const markdownWithoutPopulation = renderBusinessRequirementModel(withoutPopulation);
    expect(markdownWithoutPopulation).toContain("BRC-06[medium] 機能ID母集団未宣言のため未検査");
    expect(markdownWithoutPopulation).toContain("BRC-07[high] 機能ID母集団未宣言のため未検査");
    expect(markdownWithoutPopulation).toContain("unavailable");
    expect(markdownWithoutPopulation).not.toMatch(/算出値 \d/);
  });

  it("reports BRC-11 when hasStates and the declared states disagree", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01", name: "x" }],
      drivingData: [
        { id: "BDT-01", name: "declared but empty", hasStates: true },
        { id: "BDT-02", name: "states but not declared", hasStates: false, states: ["a", "b"] },
      ],
    };
    const markdown = renderBusinessRequirementModel(input);
    expect(markdown).toContain("BRC-11[high]");
    expect(markdown).toContain("BDT-01");
    expect(markdown).toContain("BDT-02");
  });

  it("reports BRC-14 when the claimed feature coverage percent disagrees with the computed value", () => {
    const input: GenerateBusinessRequirementModelInput = {
      businessUseCases: [{ id: "BUC-01", featureIds: ["F-001"] }],
      featureIdPopulation: ["F-001", "F-002"],
      claimedFeatureCoveragePercent: 100,
    };
    const markdown = renderBusinessRequirementModel(input);
    expect(markdown).toContain("BRC-14[high]");
    expect(markdown).toContain("declared-population");
    expect(markdown).toContain("50%");
    expect(markdown).toContain("100%");
  });

  it("emits the design_scenario_flows / design_test_data / audit_cross_matrix handover sections and the role separation table", () => {
    const markdown = renderBusinessRequirementModel(fullInput);
    expect(markdown).toContain("### 8.1 design_scenario_flows への変換");
    expect(markdown).toContain("### 8.2 design_test_data データ区分表");
    expect(markdown).toContain("### 8.3 audit_cross_matrix 軸定義表");
    expect(markdown).toContain("### 8.4 テスト目的導出フレームへの申し送り");
    expect(markdown).toContain("BRH-04");
    expect(markdown).toContain("available: false");
    expect(markdown).toContain("## 9. persona フレームとの役割分担");
    expect(markdown).toContain("業務フロー");
  });
});
