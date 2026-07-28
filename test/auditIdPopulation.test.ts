import { describe, expect, it } from "vitest";
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
