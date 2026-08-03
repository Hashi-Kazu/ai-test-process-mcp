import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderIdPopulationAudit } from "../src/tools/auditIdPopulation.js";
import type { AuditIdPopulationInput } from "../src/types.js";

const documents: AuditIdPopulationInput["documents"] = [
  {
    name: "doc-A",
    content: ["# doc-A", "EH-100 発券機起動", "EH-101 発券機停止"].join("\n"),
  },
  {
    name: "doc-B",
    content: ["# doc-B|注記", "W-001 警告表示", "W-002 警告解除"].join("\n"),
  },
];

const input: AuditIdPopulationInput = {
  documents,
  declaredPopulations: [{ toolName: "extract_test_conditions", ids: ["EH-100", "EH-101"] }],
};

const markdown = renderIdPopulationAudit(input);

describe("renderIdPopulationAudit", () => {
  it("renders section 2.2 exactly once and lists never-declared ids as high severity", () => {
    expect(markdown.split("\n").filter((l) => l === "### 2.2 未宣言ID一覧")).toHaveLength(1);
    expect(markdown).toContain("- [high] W-001");
  });

  it("emits 未宣言IDなし and no [high] never-declared line when all ids are declared", () => {
    const fullInput: AuditIdPopulationInput = {
      documents,
      declaredPopulations: [
        { toolName: "extract_test_conditions", ids: ["EH-100", "EH-101", "W-001", "W-002"] },
      ],
    };
    const md = renderIdPopulationAudit(fullInput);
    const section = md.split("### 2.2 未宣言ID一覧")[1].split("### 2.3")[0];
    expect(section).toContain("- 未宣言IDなし");
    expect(section).not.toContain("[high]");
  });

  it("renders the summary line matching the expected format", () => {
    expect(markdown).toContain(
      "- 定義ID総数: 4 / 宣言済み: 2 / 除外宣言: 0 / 未宣言: 2 / 母集団反映率: 50%"
    );
  });

  it("reports missing documents with [high] when expectedDocumentNames is provided, and (要確認) otherwise", () => {
    const withExpected = renderIdPopulationAudit({
      ...input,
      expectedDocumentNames: ["doc-A", "doc-B", "doc-C"],
    });
    const section6 = withExpected.split("### 2.6")[1].split("### 2.7")[0];
    expect(section6).toContain("[high] doc-C");

    const withoutExpected = markdown.split("### 2.6")[1].split("### 2.7")[0];
    expect(withoutExpected).toContain("(要確認)");
  });

  it("escapes pipe characters in table cells such as headings", () => {
    expect(markdown).toContain("doc-B\\|注記");
  });

  it("ends with exactly one trailing newline", () => {
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });
});

describe("renderIdPopulationAudit - 入力ダイジェスト", () => {
  it("renders the input digest table in 1.1 with escaped document names", () => {
    const section11 = markdown.split("### 1.1 投入されたテストベース文書")[1].split("### 1.2")[0];
    expect(section11).toContain("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照) | 数値トークン |");
    expect(section11).toContain("| doc-A |");
    expect(section11).toContain("| doc-B |");
    const escaped = renderIdPopulationAudit({
      ...input,
      documents: [{ name: "doc|X", content: "EH-100 発券機起動" }],
    });
    expect(escaped).toContain("| doc\\|X |");
    expect(section11).toContain("- doc-A");
    expect(section11).toContain(
      "- ダイジェストは投入されたテキストのみを対象とする。抜粋を投入した場合、以降の集計・検査はすべて抜粋の範囲に限定される。"
    );
    expect(markdown).toContain("ダイジェスト指摘数: 0");
  });

  it("flags a document with no detected ids as [medium] and counts it in the 2.8 summary", () => {
    const md = renderIdPopulationAudit({
      ...input,
      documents: [...documents, { name: "doc-C", content: "抜粋メモのみ" }],
    });
    expect(md).toContain(
      "- [medium] doc-C: 検出IDが0件。抜粋のみが投入されている可能性がある。全文を投入して再実行すること。"
    );
    expect(md).toContain("ダイジェスト指摘数: 1");
  });
});

describe("renderIdPopulationAudit 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderIdPopulationAudit(input));
  });
});

describe("renderIdPopulationAudit 次に実行すべきツール節の内容", () => {
  function nextToolsSection(md: string): string {
    return md.split("## 次に実行すべきツール")[1];
  }

  it("未宣言IDがあると extract_test_conditions / generate_test_cases 行が出る", () => {
    const section = nextToolsSection(markdown);
    expect(section).toContain("| 未実施 | extract_test_conditions |");
    expect(section).toContain("| 未実施 | generate_test_cases |");
  });

  it("全ID宣言済みなら未宣言ID由来の行は出ない", () => {
    const section = nextToolsSection(
      renderIdPopulationAudit({
        documents,
        declaredPopulations: [
          { toolName: "extract_test_conditions", ids: ["EH-100", "EH-101", "W-001", "W-002"] },
        ],
      })
    );
    expect(section).not.toContain("| 未実施 | extract_test_conditions |");
    expect(section).not.toContain("| 未実施 | generate_test_cases |");
  });
});
