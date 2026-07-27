import { describe, expect, it } from "vitest";
import { renderTestConditions } from "../src/tools/extractTestConditions.js";
import { guidewordDictionary } from "../src/resources/guidewordDictionary.js";
import { riskAnalysisFrame } from "../src/resources/riskAnalysisFrame.js";
import type { ExtractTestConditionsInput } from "../src/types.js";

const input: ExtractTestConditionsInput = {
  requirementIds: ["R-001", "R-002", "R-003"],
  personas: [
    { id: "P-001", role: "来園者", concerns: "並ばずに入場したい" },
    { id: "P-002", role: "運用担当" },
  ],
  risks: [{ id: "RK-001", description: "入場時に二重課金が起きる", impact: 5, likelihood: 2 }],
  testConditions: [
    {
      id: "TC-001",
      target: "F-001",
      perspectiveCategoryId: "TPC-01",
      statement: "チケット購入が完了する",
      source: "testbase",
      derivedFrom: ["R-001"],
      priority: "高",
      impact: 5,
      likelihood: 5,
      changeCategory: "new",
      recommendedTechniques: ["equivalence-partitioning", "not-a-technique"] as never,
    },
    {
      id: "TC-002",
      target: "F-002",
      perspectiveCategoryId: "TPC-03",
      statement: "購入枚数が上限|下限で切り替わる",
      source: "risk",
      derivedFrom: ["RK-001"],
      impact: 1,
      likelihood: 1,
      changeCategory: "existing-unaffected",
      priority: "高",
    },
    {
      id: "TC-004",
      target: "F-003",
      perspectiveCategoryId: "TPC-15",
      statement: "他人のチケットを参照できない",
      source: "stakeholder",
      derivedFrom: ["P-999"],
      priority: "中",
    },
    {
      id: "TC-005",
      target: "F-004",
      perspectiveCategoryId: "TPC-07",
      statement: "同時購入で在庫が破綻しない",
      source: "guideword",
      derivedFrom: ["R-001"],
    },
  ],
};

const markdown = renderTestConditions(input);

describe("renderTestConditions", () => {
  it("renders the top-level heading exactly once", () => {
    expect(markdown).toContain("# テスト条件抽出結果");
    expect(markdown.split("\n").filter((l) => l === "# テスト条件抽出結果")).toHaveLength(1);
  });

  it("renders all sections from 1 to 9", () => {
    for (const heading of [
      "## 1. 前提と宣言",
      "## 2. テスト条件表",
      "## 3. 決定的検査(自動)",
      "## 4. 採用した優先度基準",
      "## 5. 推奨技法 → Phase 3 連携",
      "## 6. 観点カタログによる追加観点の洗い出し指示(意味的層)",
      "## 7. ガイドワード法による未記載リスクの洗い出し指示(意味的層)",
      "## 8. リスク分析フレームの適用指示(意味的層)",
      "## 9. ステークホルダー／ペルソナ視点の洗い出し指示(意味的層)",
    ]) {
      expect(markdown).toContain(heading);
    }
  });

  it("renders the 9-column test condition table header", () => {
    expect(markdown).toContain(
      "| 条件ID | 対象 | 観点カテゴリ | 条件文 | 優先度 | リスクレベル | 導出根拠 | 推奨技法 | 根拠位置 |"
    );
  });

  it("lists uncovered requirement ids under section 3.2", () => {
    const section = markdown.split("### 3.2 未カバー要件ID一覧")[1].split("### 3.3")[0];
    expect(section).toContain("R-002");
    expect(section).toContain("R-003");
    expect(section).not.toContain("R-001");
  });

  it("lists unused perspective categories under section 3.3", () => {
    const section = markdown.split("### 3.3 観点カテゴリの被覆状況")[1].split("### 3.4")[0];
    expect(section).toContain("未使用の観点カテゴリ(抜け漏れ候補):");
    expect(section).toContain("[medium] TPC-02");
    expect(section).not.toContain("[medium] TPC-01 ");
  });

  it("reports id gaps under section 3.4", () => {
    const section = markdown.split("### 3.4 条件IDの重複・欠番")[1].split("### 3.5")[0];
    expect(section).toContain("- 欠番: TC-003");
  });

  it("lists conditions without priority under section 3.5", () => {
    const section = markdown.split("### 3.5 優先度未設定のテスト条件")[1].split("### 3.6")[0];
    expect(section).toContain("TC-005");
    expect(section).not.toContain("TC-001");
  });

  it("lists unresolved derivedFrom references under section 3.7", () => {
    const section = markdown.split("### 3.7 derivedFrom の未解決参照")[1].split("### 3.8")[0];
    expect(section).toContain("P-999");
    expect(section).toContain("personas[].id");
  });

  it("lists unknown technique ids under section 3.8", () => {
    const section = markdown.split("### 3.8 未知の推奨技法ID")[1].split("### 3.9")[0];
    expect(section).toContain("not-a-technique");
  });

  it("emits '逸脱理由: 未記入(要記入)' when a deviating condition has no reason", () => {
    expect(markdown).toContain("逸脱理由: 未記入(要記入)");
  });

  it("includes every guideword procedure step", () => {
    for (const step of guidewordDictionary.procedure) {
      expect(markdown).toContain(step);
    }
  });

  it("maps equivalence-partitioning to design_equivalence_partitioning in section 5", () => {
    const section = markdown.split("## 5. 推奨技法 → Phase 3 連携")[1].split("## 6.")[0];
    expect(section).toContain("equivalence-partitioning");
    expect(section).toContain("design_equivalence_partitioning");
    expect(section).toContain("この一覧を generate_test_cases への入力として引き継ぐこと。");
  });

  it("escapes pipe characters inside cells", () => {
    expect(markdown).toContain("購入枚数が上限\\|下限で切り替わる");
  });

  it("renders the risk score formula and the band mapping", () => {
    expect(markdown).toContain("### 4.1 リスクレベル算出式");
    expect(markdown).toContain("### 4.2 リスクスコア → 優先度の写像");
    expect(markdown).toContain("| リスクレベル | スコア範囲 | 優先度 | 指針 |");
    expect(markdown).toContain("changeCategory が未指定の場合、changeWeight は既定値 2 として計算する。");
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(input);
    expect(renderTestConditions(input)).toBe(markdown);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("renders section 3.9, 3.10 and 3.11 exactly once each", () => {
    expect(markdown.split("\n").filter((l) => l === "### 3.9 リスク区分の被覆状況")).toHaveLength(1);
    expect(
      markdown.split("\n").filter((l) => l === "### 3.10 根拠位置が未特定のテスト条件")
    ).toHaveLength(1);
    expect(markdown.split("\n").filter((l) => l === "### 3.11 サマリ")).toHaveLength(1);
  });

  it("marks source location as 未特定 and skips detection when requirementSources is not provided", () => {
    const section = markdown.split("### 3.10 根拠位置が未特定のテスト条件")[1].split("### 3.11")[0];
    expect(section).toContain("- なし");

    const conditionRow = markdown
      .split("\n")
      .find((l) => l.startsWith("| TC-001 |"));
    expect(conditionRow).toContain("未特定");
  });
});

describe("renderTestConditions with requirementSources", () => {
  const inputWithSources: ExtractTestConditionsInput = {
    requirementIds: ["EH-100"],
    testConditions: [
      {
        id: "TC-001",
        target: "F-001",
        perspectiveCategoryId: "TPC-01",
        statement: "発券機が起動する",
        source: "testbase",
        derivedFrom: ["EH-100"],
        priority: "高",
      },
    ],
    requirementSources: [
      {
        requirementId: "EH-100",
        document: "spec.md",
        startLine: 652,
        endLine: 677,
        label: "EH-100 発券機起動",
      },
    ],
  };
  const markdownWithSources = renderTestConditions(inputWithSources);

  it("shows the resolved source citation in the condition table", () => {
    const conditionRow = markdownWithSources
      .split("\n")
      .find((l) => l.startsWith("| TC-001 |"));
    expect(conditionRow).toContain("(EH-100 発券機起動, line 652-677)");
  });

  it("does not flag TC-001 as missing a source ref when requirementSources resolves it", () => {
    const section = markdownWithSources
      .split("### 3.10 根拠位置が未特定のテスト条件")[1]
      .split("### 3.11")[0];
    expect(section).toContain("- なし");
  });
});

describe("renderTestConditions with riskCategoryId", () => {
  const input2: ExtractTestConditionsInput = {
    requirementIds: ["R-001"],
    risks: [
      { id: "RK-001", description: "既知区分のリスク", impact: 5, likelihood: 2, riskCategoryId: "RC-04" },
      { id: "RK-002", description: "未知区分のリスク", riskCategoryId: "RC-99" },
    ],
    testConditions: [
      {
        id: "TC-001",
        target: "F-001",
        perspectiveCategoryId: "TPC-01",
        statement: "条件文",
        source: "testbase",
        derivedFrom: ["R-001"],
        priority: "高",
        riskCategoryId: "RC-99",
      },
    ],
  };
  const markdown2 = renderTestConditions(input2);

  it("renders all risk categories with 0-count categories flagged as [medium]", () => {
    const section = markdown2.split("### 3.9 リスク区分の被覆状況")[1].split("### 3.10")[0];
    for (const rc of riskAnalysisFrame.riskCategories) {
      expect(section).toContain(rc.id);
    }
    const unusedIds = riskAnalysisFrame.riskCategories
      .filter((rc) => rc.id !== "RC-04")
      .map((rc) => rc.id);
    for (const id of unusedIds) {
      expect(section).toContain(`[medium] ${id}`);
    }
  });

  it("flags the unknown risk category id", () => {
    expect(markdown2).toContain("「RC-99」はリスク分析フレームに存在しないリスク区分IDである。");
  });

  it("includes the unused/unknown risk category counters in the 3.11 summary", () => {
    const summaryLine = markdown2
      .split("\n")
      .find((l) => l.startsWith("- 対象要件ID数:"));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain("未使用リスク区分数:");
    expect(summaryLine).toContain("未知リスク区分ID数:");
  });

  it("renders all risk categories and control flaw patterns in section 8", () => {
    const section = markdown2.split("## 8. リスク分析フレームの適用指示(意味的層)")[1].split("## 9.")[0];
    for (const rc of riskAnalysisFrame.riskCategories) {
      expect(section).toContain(rc.id);
      expect(section).toContain(rc.nameJa);
    }
    for (const p of riskAnalysisFrame.controlFlawFrame.patterns) {
      expect(section).toContain(p.id);
      expect(section).toContain(p.nameJa);
      for (const q of p.probeQuestions) {
        expect(section).toContain(q);
      }
    }
  });

  it("renders the 6-column risk list table header with a category column", () => {
    expect(markdown2).toContain("| リスクID | 内容 | 区分 | 影響度 | 発生可能性 | 変更区分 |");
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(input2);
    expect(renderTestConditions(input2)).toBe(markdown2);
    expect(JSON.stringify(input2)).toBe(snapshot);
  });
});

describe("renderTestConditions with explicit-kind derivedFrom entries", () => {
  const input3: ExtractTestConditionsInput = {
    requirementIds: ["R-001"],
    risks: [{ id: "RK-001", description: "入場時に二重課金が起きる" }],
    personas: [{ id: "P-001", role: "来園者" }],
    testConditions: [
      {
        id: "TC-001",
        target: "F-001",
        perspectiveCategoryId: "TPC-01",
        statement: "多系統から導出された条件",
        source: "risk",
        derivedFrom: [
          { kind: "risk", id: "RK-001" },
          { kind: "requirement", id: "R-001" },
        ],
        priority: "高",
      },
      {
        id: "TC-002",
        target: "F-002",
        perspectiveCategoryId: "TPC-02",
        statement: "存在しないリスクIDを種別明示で参照",
        source: "risk",
        derivedFrom: [{ kind: "risk", id: "RK-999" }],
        priority: "中",
      },
    ],
  };
  const markdown3 = renderTestConditions(input3);

  it("renders the explicit-kind reference with a 'リスク:' label in the derivation cell", () => {
    const row = markdown3.split("\n").find((l) => l.startsWith("| TC-001 |"));
    expect(row).toContain("リスク:RK-001");
  });

  it("does not report the requirement-kind entry as an unresolved reference (main objective)", () => {
    const section = markdown3.split("### 3.7 derivedFrom の未解決参照")[1].split("### 3.8")[0];
    expect(section).not.toContain("R-001");
  });

  it("shows the kind-labeled reference for a genuinely unresolved explicit-kind entry", () => {
    const section = markdown3.split("### 3.7 derivedFrom の未解決参照")[1].split("### 3.8")[0];
    expect(section).toContain("リスク:RK-999");
    expect(section).toContain("risks[].id");
  });
});
