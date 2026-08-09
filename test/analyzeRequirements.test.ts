import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { z } from "zod";
import { renderRequirementsAnalysis } from "../src/tools/analyzeRequirements.js";
import { designBoundaryValuesInputShape } from "../src/tools/designBoundaryValues.js";
import { qualityCharacteristicModel } from "../src/resources/qualityCharacteristics.js";
import { qualityInUseCharacteristicModel } from "../src/resources/qualityInUseCharacteristics.js";
import { questionPriorityDefinitions } from "../src/resources/testPlanTemplate.js";
import type { AnalyzeRequirementsInput, TestBasisDocument } from "../src/types.js";

const docA: TestBasisDocument = {
  name: "doc-a.md",
  content: [
    "## 3. 購入条件",
    "- W-001 Web購入は利用日の29日後まで可能とする。",
    "- W-002 応答は3秒以内に返すこと。",
    "本項は W-999 を参照する。",
    "## 用語定義",
    "| 用語 | 定義 |",
    "| --- | --- |",
    "| 入場券 | 当日利用可能なチケット |",
    "| サーバ | 予約サービスを提供する機器 |",
  ].join("\n"),
};

const docB: TestBasisDocument = {
  name: "doc-b.md",
  content: [
    "## 2. 購入条件",
    "- W-001 Web購入は利用日の30日後まで可能とする。",
    "- W-003 必要な範囲で適切に通知する。",
    "サーバーの応答は速やかに返す。",
    "入場券の枚数上限は10枚。",
  ].join("\n"),
};

const baseInput: AnalyzeRequirementsInput = {
  documents: [docA, docB],
};

describe("renderRequirementsAnalysis", () => {
  it("includes all fixed section headings", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    expect(markdown).toContain("# 要件分析結果");
    expect(markdown).toContain("## 1. 対象文書");
    expect(markdown).toContain("## 2. 決定的分析(自動)");
    expect(markdown).toContain("### 2.1 要件ID体系");
    expect(markdown).toContain("### 2.2 数量表現の全文書横断集約");
    expect(markdown).toContain("### 2.3 境界値候補(design_boundary_values 連携)");
    expect(markdown).toContain("### 2.4 用語定義と本文使用の照合");
    expect(markdown).toContain("### 2.5 曖昧語・弱い語・未完成注記");
    expect(markdown).toContain("### 2.6 要件ID → テストベース根拠位置");
    expect(markdown).toContain("### 2.7 サマリ");
    expect(markdown).toContain("## 3. 指摘表");
    expect(markdown).toContain("## 4. 品質特性 × 要件のマッピング指示");
    expect(markdown).toContain("## 5. ステークホルダー別影響の抽出指示");
    expect(markdown).toContain("## 6. 変更差分の4区分");
    expect(markdown).toContain("## 7. 意味的分析の観点");
  });

  it("shows the 29/30 day contradiction in both the quantity table and the finding table", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    expect(markdown).toContain("29, 30");
    expect(markdown).toContain("矛盾");
  });

  it("emits a json block under 2.3 that parses and validates against the design_boundary_values schema", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    const match = /```json\n([\s\S]*?)\n```/.exec(markdown);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    const result = z.object(designBoundaryValuesInputShape).safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("emits a json block under 2.6 with a valid requirementSources array", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    const section26 = markdown.split("### 2.6 要件ID → テストベース根拠位置")[1].split("### 2.7")[0];
    const match = /```json\n([\s\S]*?)\n```/.exec(section26);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(Array.isArray(parsed.requirementSources)).toBe(true);
    expect(parsed.requirementSources.length).toBeGreaterThan(0);
    for (const ref of parsed.requirementSources) {
      expect(typeof ref.requirementId).toBe("string");
      expect(typeof ref.document).toBe("string");
      expect(typeof ref.startLine).toBe("number");
    }
  });

  it("lists every quality characteristic id by default and restricts when qualityCharacteristicIds is given", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    for (const c of qualityCharacteristicModel.characteristics) {
      expect(markdown).toContain(c.id);
    }

    const restricted = renderRequirementsAnalysis({ ...baseInput, qualityCharacteristicIds: ["QC-01"] });
    const section4 = restricted.split("## 4. 品質特性")[1].split("## 5.")[0];
    expect(section4).toContain("QC-01");
    for (const c of qualityCharacteristicModel.characteristics) {
      if (c.id === "QC-01") continue;
      expect(section4).not.toContain(c.id);
    }
  });

  it("lists every quality-in-use characteristic id by default", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    for (const c of qualityInUseCharacteristicModel.characteristics) {
      expect(markdown).toContain(c.id);
    }
  });

  it("restricts quality-in-use characteristics when qualityCharacteristicIds is given", () => {
    const restricted = renderRequirementsAnalysis({ ...baseInput, qualityCharacteristicIds: ["QU-04"] });
    const section4 = restricted.split("## 4. 品質特性")[1].split("## 5.")[0];
    expect(section4).toContain("QU-04");
    for (const c of qualityCharacteristicModel.characteristics) {
      expect(section4).not.toContain(c.id);
    }
    for (const c of qualityInUseCharacteristicModel.characteristics) {
      if (c.id === "QU-04") continue;
      expect(section4).not.toContain(c.id);
    }
  });

  it("places changeItems under the matching category heading and unclassified items under 未分類", () => {
    const markdown = renderRequirementsAnalysis({
      ...baseInput,
      changeItems: [
        { description: "新規機能A", category: "new" },
        { description: "既存機能Bの変更", category: "modified" },
        { description: "既存機能Cへの影響", category: "existing-impacted" },
        { description: "既存機能Dは影響なし", category: "existing-unaffected" },
        { description: "分類未定の項目E" },
      ],
    });
    expect(markdown).toContain("### 新規実装");
    expect(markdown).toContain("### 変更");
    expect(markdown).toContain("### 既存・影響あり");
    expect(markdown).toContain("### 既存・影響なし");
    expect(markdown).toContain("### 未分類(LLM が分類する)");
    expect(markdown).toContain("新規機能A");
    expect(markdown).toContain("既存機能Bの変更");
    expect(markdown).toContain("既存機能Cへの影響");
    expect(markdown).toContain("既存機能Dは影響なし");
    expect(markdown).toContain("分類未定の項目E");
  });

  it("does not throw when stakeholders are not provided and still shows the table and instruction", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    expect(markdown).toContain("| ステークホルダー | ニーズ・期待 | 懸念 | 導かれるテスト要求 |");
    expect(markdown).toContain("ステークホルダーごとに");
  });

  it("includes every question priority level in section 3", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    for (const def of questionPriorityDefinitions) {
      expect(markdown).toContain(def.level);
    }
  });

  it("ends with a trailing newline", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });
});

describe("renderRequirementsAnalysis - 入力ダイジェスト", () => {
  it("renders the input digest table in section 1 and keeps the document list lines", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    const section1 = markdown.split("## 1. 対象文書")[1].split("### 開発背景")[0];
    expect(section1).toContain("### 入力ダイジェスト");
    expect(section1).toContain("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照) | 数値トークン |");
    expect(section1).toContain("| doc-a.md |");
    expect(section1).toContain("| doc-b.md |");
    expect(section1).toContain("- doc-a.md(行数: 9)");
    expect(section1).toContain(
      "- ダイジェストは投入されたテキストのみを対象とする。抜粋を投入した場合、以降の集計・検査はすべて抜粋の範囲に限定される。"
    );
  });

  it("flags a document with no detected ids and no other-prefix reference as [info] and counts it in the 2.7 summary", () => {
    const markdown = renderRequirementsAnalysis({
      documents: [...baseInput.documents, { name: "memo.md", content: "抜粋メモのみ" }],
    });
    expect(markdown).toContain(
      "- [info] memo.md: 検出IDが0件で、他文書が持つIDプレフィックスへの参照も無い。この文書はID体系を持たない文書であり、抜粋の指摘ではない。"
    );
    expect(markdown).toContain("ダイジェスト指摘数: 1");
  });
});

describe("renderRequirementsAnalysis 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderRequirementsAnalysis(baseInput));
  });
});
