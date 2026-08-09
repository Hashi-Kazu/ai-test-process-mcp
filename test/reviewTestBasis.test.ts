import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderTestBasisReview } from "../src/tools/reviewTestBasis.js";
import { testBasisReviewChecklist } from "../src/resources/testBasisReviewChecklist.js";
import { questionPriorityDefinitions } from "../src/resources/testPlanTemplate.js";
import type { TestBasisDocument } from "../src/types.js";

const flawedDocuments: TestBasisDocument[] = [
  {
    name: "spec-a.md",
    content: [
      "## 見出しA",
      "- E-016 最初の説明",
      "- E-016 別の説明（矛盾あり）",
      "本文では E-999 を参照する。",
      "## 見出しB",
      "- S-001 説明",
      "- S-01 説明（桁数不一致）",
      "相応の対応を必要な範囲で行う。",
      "応答は3秒以内に返すこと。上限は100件。",
    ].join("\n"),
  },
];

const cleanDocuments: TestBasisDocument[] = [
  {
    name: "spec-b.md",
    content: ["## 見出しC", "- E-100 説明", "本文では E-100 を参照する。"].join("\n"),
  },
];

describe("renderTestBasisReview", () => {
  it("reports duplicate ids, unresolved references, prefix issues, ambiguous terms, and quantity expressions", () => {
    const markdown = renderTestBasisReview(flawedDocuments);

    expect(markdown).toContain("E-016(2件)");
    expect(markdown).toContain("E-999 を参照");
    expect(markdown).toContain("digit-width-mismatch");
    expect(markdown).toContain("相応の");
    expect(markdown).toContain("必要な");
    expect(markdown).toContain("境界語なし");
  });

  it("reports no issues for clean input", () => {
    const markdown = renderTestBasisReview(cleanDocuments);
    expect(markdown).toContain("- 重複なし");
    expect(markdown).toContain("- 未解決参照なし");
    expect(markdown).toContain("- 逸脱なし");
  });

  it("includes all checklist item ids in section 2", () => {
    const markdown = renderTestBasisReview(cleanDocuments);
    for (const item of testBasisReviewChecklist.items) {
      expect(markdown).toContain(item.id);
    }
  });

  it("includes all question priority levels and Q-01 in section 3", () => {
    const markdown = renderTestBasisReview(flawedDocuments);
    for (const def of questionPriorityDefinitions) {
      expect(markdown).toContain(def.level);
    }
    expect(markdown).toContain("Q-01");
  });

  it("includes the first improvement action of every checklist item in section 4", () => {
    const markdown = renderTestBasisReview(cleanDocuments);
    for (const item of testBasisReviewChecklist.items) {
      expect(markdown).toContain(item.improvementActions[0]);
    }
  });

  it("matches counts between section 1.8 summary and sections 1.3-1.7", () => {
    const markdown = renderTestBasisReview(flawedDocuments);
    const summaryLine = markdown
      .split("\n")
      .find((line) => line.startsWith("- 対象文書数:"));
    expect(summaryLine).toBeTruthy();

    const dupMatch = /重複ID数: (\d+)/.exec(summaryLine!);
    const unresolvedMatch = /未解決参照数: (\d+)/.exec(summaryLine!);
    const prefixMatch = /プレフィックス逸脱数: (\d+)/.exec(summaryLine!);
    const ambiguousMatch = /曖昧語出現数: (\d+)/.exec(summaryLine!);
    const quantityMatch = /数量表現数\(境界語なし\): (\d+)/.exec(summaryLine!);

    const lines = markdown.split("\n");
    const section = (title: string) => {
      const start = lines.findIndex((l) => l.trim() === title);
      const next = lines.findIndex((l, i) => i > start && l.startsWith("### "));
      return lines.slice(start + 1, next === -1 ? undefined : next);
    };

    const dupLines = section("### 1.3 ID重複").filter((l) => l.startsWith("- [high]"));
    expect(dupLines.length).toBe(Number(dupMatch![1]));

    const unresolvedLines = section("### 1.4 未解決参照").filter((l) => l.startsWith("- [high]"));
    expect(unresolvedLines.length).toBe(Number(unresolvedMatch![1]));

    const prefixLines = section("### 1.5 プレフィックス体系の逸脱").filter((l) => l.startsWith("- [medium]"));
    expect(prefixLines.length).toBe(Number(prefixMatch![1]));

    const ambiguousLines = section("### 1.6 曖昧語・弱い語").filter((l) => l.startsWith("- 「"));
    const ambiguousTotalFromLines = ambiguousLines.reduce((sum, l) => {
      const m = /計(\d+)件/.exec(l);
      return sum + (m ? Number(m[1]) : 0);
    }, 0);
    expect(ambiguousTotalFromLines).toBe(Number(ambiguousMatch![1]));

    const noBoundaryCountLine = section("### 1.7 数量表現").find((l) => l.startsWith("- 境界語あり"));
    const noBoundaryFromHeader = /境界語なし: (\d+)件/.exec(noBoundaryCountLine!);
    expect(Number(noBoundaryFromHeader![1])).toBe(Number(quantityMatch![1]));
  });

  it("is deterministic across repeated calls", () => {
    const first = renderTestBasisReview(flawedDocuments);
    const second = renderTestBasisReview(flawedDocuments);
    expect(first).toBe(second);
  });
});

describe("renderTestBasisReview - 入力ダイジェスト", () => {
  it("renders the input digest table in 1.1 and keeps the document list lines", () => {
    const markdown = renderTestBasisReview(flawedDocuments);
    const section11 = markdown.split("### 1.1 対象文書")[1].split("### 1.2")[0];
    expect(section11).toContain("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照) | 数値トークン |");
    expect(section11).toContain("| spec-a.md |");
    expect(section11).toContain("- spec-a.md(行数: 9)");
    expect(section11).toContain(
      "- ダイジェストは投入されたテキストのみを対象とする。抜粋を投入した場合、以降の集計・検査はすべて抜粋の範囲に限定される。"
    );
    expect(markdown).toContain("ダイジェスト指摘数: 0");
  });

  it("flags a document with no detected ids and no other-prefix reference as [info]", () => {
    const markdown = renderTestBasisReview([
      ...flawedDocuments,
      { name: "memo.md", content: "抜粋メモのみ" },
    ]);
    expect(markdown).toContain(
      "- [info] memo.md: 検出IDが0件で、他文書が持つIDプレフィックスへの参照も無い。この文書はID体系を持たない文書であり、抜粋の指摘ではない。"
    );
    expect(markdown).toContain("ダイジェスト指摘数: 1");
  });
});

describe("renderTestBasisReview - 双方向制御文字の除去（生＝除去済み同値性）", () => {
  function stripIqc05Lines(md: string): string {
    return md
      .split("\n")
      .filter((l) => !l.includes("[IQC-05]"))
      .join("\n");
  }

  const rawDocuments: TestBasisDocument[] = [
    {
      name: "spec-c.md",
      content: ["## 見出しD", "‭E-200 発券機起動‬", "本文では ‭E-200‬ を参照する。"].join("\n"),
    },
  ];
  const cleanDocuments2: TestBasisDocument[] = [
    {
      name: "spec-c.md",
      content: ["## 見出しD", "E-200 発券機起動", "本文では E-200 を参照する。"].join("\n"),
    },
  ];

  it("produces identical output (excluding IQC-05 lines) whether or not the input has embedded bidi controls", () => {
    const rawMd = renderTestBasisReview(rawDocuments);
    const cleanMd = renderTestBasisReview(cleanDocuments2);
    expect(stripIqc05Lines(rawMd)).toBe(stripIqc05Lines(cleanMd));
  });

  it("does not degrade the definition count when a bidi control char sits at the start of the definition line", () => {
    const rawMd = renderTestBasisReview(rawDocuments);
    const cleanMd = renderTestBasisReview(cleanDocuments2);
    const definedCountOf = (md: string): string => {
      const match = /抽出ID数\(定義 (\d+)/.exec(md);
      return match ? match[1] : "";
    };
    expect(definedCountOf(rawMd)).toBe(definedCountOf(cleanMd));
    expect(definedCountOf(rawMd)).not.toBe("0");
  });
});

describe("renderTestBasisReview 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderTestBasisReview(cleanDocuments));
  });
});
