import { describe, expect, it } from "vitest";
import { renderCoverageBalanceAudit } from "../src/tools/auditCoverageBalance.js";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import type { AuditCoverageBalanceInput } from "../src/types.js";

const baseInput: AuditCoverageBalanceInput = {
  testCases: [
    {
      caseId: "TCS-001",
      title: "上限値での入場",
      perspectiveCategoryId: "TPC-01",
      techniqueId: "boundary-value-analysis",
      testLevel: "system-testing",
    },
    {
      caseId: "TCS-002",
      title: "区分ごとの判定",
      perspectiveCategoryId: "TPC-02",
      techniqueId: "equivalence-partitioning",
      testLevel: "component-testing",
    },
    { caseId: "TCS-003", title: "軸未宣言のケース" },
  ],
  deliverables: [
    {
      name: "テスト設計書",
      content: [
        "# 1. 用語集",
        "",
        "| 用語 | 定義 |",
        "| --- | --- |",
        "| ゲート制御 | 改札機の開閉を制御する仕組み |",
        "",
        "# 2. テストケース",
        "",
        "- TCS-001 上限値での入場（ゲート制御の確認）",
        "- TCS-002 区分ごとの判定（ゲート制御の異常系）",
        "- TCS-003 軸未宣言のケース",
      ].join("\n"),
    },
  ],
  declaredDistributions: [{ axis: "perspective", label: "TPC-01", declaredCount: 1 }],
};

describe("renderCoverageBalanceAudit", () => {
  const markdown = renderCoverageBalanceAudit(baseInput);

  it("H1 が署名見出しである", () => {
    expect(markdown.split("\n")[0]).toBe("# 網羅バランス・用語定義監査結果");
  });

  it("1.x / 2.1〜2.9 の見出しが揃う", () => {
    for (const heading of [
      "## 1. 監査対象",
      "### 1.1 投入されたテストケース・成果物",
      "### 1.2 入力ダイジェスト",
      "## 2. 決定的検査(自動)",
      "### 2.1 観点カテゴリ別ケース数分布",
      "### 2.2 技法別ケース数分布",
      "### 2.3 テストレベル別ケース数分布",
      "### 2.4 観点カテゴリ × テストレベル クロス表",
      "### 2.5 分布の宣言と実体の照合",
      "### 2.6 分布の偏りの観測値",
      "### 2.7 独自用語候補と定義の突き合わせ",
      "### 2.8 指摘一覧",
      "### 2.9 サマリ",
      "## 3. 判定区分と対処指針",
      "## 4. 意味的確認の指示(意味的層)",
      "## 5. 決定的層で検出できない型",
    ]) {
      expect(markdown, heading).toContain(`\n${heading}\n`);
    }
  });

  it("分布表の列見出しが仕様どおりである", () => {
    expect(markdown).toContain("| 区分ID | 区分名 | ケース数 | 構成比(%) | 代表ケースID |");
  });

  it("0件区分と未指定行が分布表に出る", () => {
    expect(markdown).toContain("| 未指定 |");
    expect(markdown).toContain("| TPC-01 | 機能 | 1 |");
  });

  it("2.6 に望ましい分布の基準を持たない旨を本文出力する", () => {
    expect(markdown).toContain("望ましい分布の基準を持たない");
    expect(markdown).toContain("構成比(%)は観測値であり達成度ではない");
  });

  it("判定区分表に CBC-01..CBC-13 が並ぶ", () => {
    for (let i = 1; i <= 13; i++) {
      expect(markdown).toContain(`| CBC-${String(i).padStart(2, "0")} |`);
    }
  });

  it("後続ツール節が末尾に1回だけ現れる", () => {
    expectNextToolsSection(markdown);
  });

  it("同一入力に対し常に同一文字列を返す（決定性）", () => {
    expect(renderCoverageBalanceAudit(baseInput)).toBe(markdown);
  });
});

describe("renderCoverageBalanceAudit 検査不能の表示", () => {
  it("deliverables 未指定時は実体照合が検査不能(要確認)になり合格表示にならない", () => {
    const md = renderCoverageBalanceAudit({ testCases: baseInput.testCases });
    expect(md).toContain("deliverables が未指定のため実体照合ができない(要確認)");
    expect(md).toContain("CBC-05");
    expect(md).toContain("CBC-09");
    expect(md).toContain("検査不能(要確認)の区分");
    expect(md).toContain("未指摘は合格を意味しない");
    // 入力ダイジェストは deliverables 投入時のみ
    expect(md).not.toContain("### 1.2 入力ダイジェスト");
  });

  it("declaredDistributions 未指定時は CBC-04 が検査不能(要確認)になる", () => {
    const md = renderCoverageBalanceAudit({
      testCases: baseInput.testCases,
      deliverables: baseInput.deliverables,
    });
    expect(md).toContain("declaredDistributions が未指定のため宣言件数と実集計の照合ができない(要確認)");
  });

  it("宣言件数が実集計と食い違う場合に CBC-04 の指摘が出る", () => {
    const md = renderCoverageBalanceAudit({
      ...baseInput,
      declaredDistributions: [{ axis: "perspective", label: "TPC-01", declaredCount: 9 }],
    });
    expect(md).toContain("CBC-04");
    expect(md).toContain("宣言件数 9 件に対し、実集計は 1 件である");
  });

  it("本文に無い計上ケースIDが CBC-05 として出る", () => {
    const md = renderCoverageBalanceAudit({
      ...baseInput,
      testCases: [...baseInput.testCases, { caseId: "TCS-900" }],
    });
    expect(md).toContain("CBC-05");
    expect(md).toContain("TCS-900");
  });
});
