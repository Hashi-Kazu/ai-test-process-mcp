import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderCrossMatrixAudit } from "../src/tools/auditCrossMatrix.js";
import type {
  AuditCrossMatrixInput,
  CrossMatrixAuditCriteria,
  CrossMatrixAxisSpec,
} from "../src/types.js";

function baseAxes(): CrossMatrixAxisSpec[] {
  return [
    {
      axisId: "RISK",
      axisName: "プロダクトリスク",
      items: [
        { id: "R-01", label: "決済失敗", links: ["M-01", "P-01"] },
        { id: "R-02", label: "在庫不整合", links: ["M-02"] },
        { id: "R-03", label: "表示崩れ" },
      ],
    },
    {
      axisId: "METHOD",
      axisName: "テスト方法",
      items: [
        { id: "M-01", label: "自動E2E", links: ["R-01"] },
        { id: "M-02", label: "手動探索", links: ["R-02", "P-02"] },
      ],
    },
    {
      axisId: "PERSONA",
      axisName: "ペルソナ",
      items: [
        { id: "P-01", label: "一般利用者", links: ["R-01"] },
        { id: "P-02", label: "運用担当", links: ["M-02"] },
      ],
    },
  ];
}

function baseInput(): AuditCrossMatrixInput {
  return { axes: baseAxes() };
}

const markdown = renderCrossMatrixAudit(baseInput());

describe("renderCrossMatrixAudit", () => {
  it("renders every expected heading exactly once", () => {
    const headings = [
      "# 多軸マトリクス監査結果",
      "## 1. 監査対象",
      "### 1.1 投入された軸",
      "### 1.3 監査対象の軸ペア",
      "## 2. 決定的検査(自動)",
      "### 2.1 軸ペアごとの直積表",
      "### 2.2 空行一覧",
      "### 2.3 空列一覧",
      "### 2.4 片方向のみの紐づけ",
      "### 2.5 除外宣言された空行・空列",
      "### 2.6 軸ペアごとの充填率",
      "### 2.7 宣言充填率との照合",
      "### 2.8 軸母集団とリンク根拠の裏付け",
      "### 2.9 完全孤立要素",
      "### 2.10 検出事項一覧",
      "### 2.11 サマリ",
      "## 3. 判定区分と対処指針",
      "## 4. 意味的確認の指示(意味的層)",
    ];
    for (const heading of headings) {
      expect(markdown.split("\n").filter((l) => l === heading)).toHaveLength(1);
    }
  });

  it("renders a cross product table sub-heading for all three axis pairs of a three-axis input", () => {
    expect(markdown).toContain("#### 2.1.1 プロダクトリスク × テスト方法");
    expect(markdown).toContain("#### 2.1.2 プロダクトリスク × ペルソナ");
    expect(markdown).toContain("#### 2.1.3 テスト方法 × ペルソナ");
  });

  it("lists empty rows and empty columns with [high]", () => {
    const rowSection = markdown.split("### 2.2 空行一覧")[1].split("### 2.3")[0];
    expect(rowSection).toContain("- [high] RISK R-03(表示崩れ) : METHOD");

    const columnSection = markdown.split("### 2.3 空列一覧")[1].split("### 2.4")[0];
    expect(columnSection).toContain("- [high] PERSONA P-02(運用担当) : RISK");
  });

  it("moves excluded lines out of the empty row list into section 2.5 with their reason", () => {
    const md = renderCrossMatrixAudit({
      ...baseInput(),
      exclusions: [
        { axisId: "RISK", itemId: "R-03", pairedAxisId: "METHOD", reason: "目視確認で扱うため対象外" },
      ],
    });
    const rowSection = md.split("### 2.2 空行一覧")[1].split("### 2.3")[0];
    expect(rowSection).not.toContain("RISK R-03(表示崩れ) : METHOD");

    const excludedSection = md.split("### 2.5 除外宣言された空行・空列")[1].split("### 2.6")[0];
    expect(excludedSection).toContain("- [info] RISK R-03(表示崩れ) × METHOD : 目視確認で扱うため対象外");
  });

  it("warns when declaredCoverage is missing and reports CMX-08 when the claimed figures are wrong", () => {
    const section = markdown.split("### 2.7 宣言充填率との照合")[1].split("### 2.8")[0];
    expect(section).toContain("(要確認)");

    const md = renderCrossMatrixAudit({
      ...baseInput(),
      declaredCoverage: [{ axisA: "RISK", axisB: "METHOD", claimedFillRatePercent: 100 }],
    });
    const findingSection = md.split("### 2.10 検出事項一覧")[1].split("### 2.11")[0];
    expect(findingSection).toContain("| CMX-08 | high |");
  });

  it("renders the document digest in 1.2 and flags axis items with no grounding as CMX-10", () => {
    const md = renderCrossMatrixAudit({
      ...baseInput(),
      documents: [
        {
          name: "risk-list.md",
          content: ["# リスク一覧", "R-01 決済失敗", "R-02 在庫不整合"].join("\n"),
        },
      ],
    });
    expect(md).toContain("### 1.2 投入されたテストベース文書");
    expect(md).toContain("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照) | 数値トークン |");
    expect(md).toContain("| risk-list.md |");

    const findingSection = md.split("### 2.10 検出事項一覧")[1].split("### 2.11")[0];
    expect(findingSection).toContain("| CMX-10 | high | RISK / R-03 |");
  });

  it("flags link declarations with no evidence as CMX-16 and marks the ungrounded cells with *", () => {
    const md = renderCrossMatrixAudit({
      axes: [
        {
          axisId: "RISK",
          axisName: "プロダクトリスク",
          items: [
            { id: "R-01", label: "決済失敗", links: ["M-01", "M-02"] },
            { id: "R-02", label: "在庫不整合", links: ["M-01", "M-02"] },
          ],
        },
        {
          axisId: "METHOD",
          axisName: "テスト方法",
          items: [
            { id: "M-01", label: "自動E2E", links: ["R-01", "R-02"] },
            { id: "M-02", label: "手動探索", links: ["R-01", "R-02"] },
          ],
        },
      ],
      documents: [
        {
          name: "basis.md",
          content: [
            "# テストベース",
            "R-01 決済失敗",
            "R-02 在庫不整合",
            "M-01 自動E2E",
            "M-02 手動探索",
          ].join("\n"),
        },
      ],
    });

    const findingSection = md.split("### 2.10 検出事項一覧")[1].split("### 2.11")[0];
    expect(findingSection).toContain("| CMX-16 | high |");

    // 2.6 表: 充填率100 に対し根拠裏付け充填セル数・充填率はいずれも 0
    const rateRow = md
      .split("\n")
      .find((l) => l.startsWith("| プロダクトリスク | テスト方法 |")) as string;
    expect(rateRow).toBe("| プロダクトリスク | テスト方法 | 2 | 2 | 4 | 4 | 100 | 0 | 0 | 2 | 0 | 100 | 2 | 0 | 100 |");

    expect(md).toContain("| 決済失敗 | ○* | ○* |");
    expect(md).toContain("- * は紐づけ宣言の根拠が本文から裏付けられていないセル(CMX-16 / CMX-17)。");

    const groundingSection = md.split("### 2.8 軸母集団とリンク根拠の裏付け")[1].split("### 2.9")[0];
    expect(groundingSection).toContain("CMX-16 RISK / R-01 → METHOD / M-01");
  });

  it("warns in 2.8 when documents is missing so link evidence cannot be checked", () => {
    const groundingSection = markdown
      .split("### 2.8 軸母集団とリンク根拠の裏付け")[1]
      .split("### 2.9")[0];
    expect(groundingSection).toContain(
      "- documents が未指定のためリンク根拠の裏付け照合を行えない(要確認)"
    );
    expect(markdown).not.toContain("○*");
  });

  it("escapes pipe characters in labels and ids without breaking the table column count", () => {
    const md = renderCrossMatrixAudit({
      axes: [
        {
          axisId: "A|X",
          axisName: "軸|A",
          items: [{ id: "A-1", label: "決済|失敗", links: ["B-1"] }],
        },
        {
          axisId: "B",
          axisName: "軸B",
          items: [{ id: "B-1", label: "手動|探索", links: ["A-1"] }],
        },
      ],
    });
    expect(md).toContain("| A\\|X | 軸\\|A | 1 |");
    const matrixHeader = md
      .split("\n")
      .find((l) => l.startsWith("| 軸\\|A \\ 軸B |")) as string;
    expect(matrixHeader).toBe("| 軸\\|A \\ 軸B | 手動\\|探索 |");

    // エスケープ済みの \| を除いた区切り記号だけを数え、列数が崩れていないことを確認する
    const delimiterCount = (line: string): number =>
      (line.replace(/\\\|/g, "").match(/\|/g) ?? []).length;
    const bodyRow = md.split("\n").find((l) => l.startsWith("| 決済\\|失敗 |")) as string;
    expect(delimiterCount(matrixHeader)).toBe(3);
    expect(delimiterCount(bodyRow)).toBe(3);
  });

  it("truncates oversized matrices and finding lists with excerpt notes and 他 N 件", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: `R-${i + 1}` }));
    const columns = Array.from({ length: 40 }, (_, i) => ({ id: `M-${i + 1}` }));
    const md = renderCrossMatrixAudit({
      axes: [
        { axisId: "RISK", axisName: "プロダクトリスク", items: rows },
        { axisId: "METHOD", axisName: "テスト方法", items: columns },
      ],
    });
    expect(md).toContain("- 表示は先頭 50 行 × 30 列の抜粋(全 60 行 × 40 列)");

    const rowSection = md.split("### 2.2 空行一覧")[1].split("### 2.3")[0];
    expect(rowSection).toContain("- 他 10 件");

    const findingSection = md.split("### 2.10 検出事項一覧")[1].split("### 2.11")[0];
    expect(findingSection).toMatch(/- 他 \d+ 件/);
  });

  it("ends with a newline and is byte-identical across repeated calls", () => {
    expect(markdown.endsWith("\n")).toBe(true);
    expect(renderCrossMatrixAudit(baseInput())).toBe(markdown);
  });

  it("uses the injected criteria for section 3", () => {
    const criteria: CrossMatrixAuditCriteria = {
      name: "差し替えカタログ",
      summary: "テスト用",
      categories: [
        {
          id: "ZZZ-99",
          nameJa: "差し替え区分",
          severity: "info",
          definition: "差し替えた定義",
          recommendedAction: "差し替えた対処",
        },
      ],
      notes: ["差し替えた注記"],
    };
    const md = renderCrossMatrixAudit(baseInput(), criteria);
    expect(md).toContain("| ZZZ-99 | 差し替え区分 | info | 差し替えた定義 | 差し替えた対処 |");
    expect(md).toContain("- 差し替えた注記");
    expect(md).not.toContain("| CMX-01 | 未宣言IDへの紐づけ |");
  });
});

describe("renderCrossMatrixAudit 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderCrossMatrixAudit(baseInput()));
  });
});
