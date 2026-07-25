import { describe, expect, it } from "vitest";
import { renderTestConditions } from "../src/tools/extractTestConditions.js";
import { guidewordDictionary } from "../src/resources/guidewordDictionary.js";
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

  it("renders the 8-column test condition table header", () => {
    expect(markdown).toContain(
      "| 条件ID | 対象 | 観点カテゴリ | 条件文 | 優先度 | リスクレベル | 導出根拠 | 推奨技法 |"
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
});
