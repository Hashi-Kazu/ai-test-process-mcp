import { describe, expect, it } from "vitest";
import { renderTestPlan } from "../src/tools/generateTestPlan.js";
import {
  TBD_REQUIRED,
  findMarkerOccurrences,
  groupByHeading,
} from "../src/tools/reviewTestPlan.js";
import { renderTestPlanRevision } from "../src/tools/reviseTestPlan.js";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";
import type { TestPlanInput } from "../src/types.js";

const minimalInput: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };

function extractRevisedMarkdown(output: string): string {
  const match = output.match(/```markdown\n([\s\S]*?)\n```/);
  if (!match) throw new Error("revised markdown block not found in output");
  return match[1];
}

describe("renderTestPlanRevision", () => {
  it("reports no additions/normalizations for a complete plan and preserves its section structure", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const result = renderTestPlanRevision(planMarkdown);

    expect(result).toContain("- 追加なし");
    expect(result).toContain("- 正規化なし");

    const section2 = result.split("## 2.")[1]?.split("## 3.")[0] ?? "";
    for (const section of testPlanTemplate.sections) {
      const prefix = section.level === 1 ? "##" : "###";
      expect(section2).toContain(`${prefix} ${section.no} ${section.titleJa}`);
    }
  });

  it("appends a missing required chapter with a required-未記入 marker", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const withoutSuspensionChapter = planMarkdown
      .split("\n")
      .filter((line) => !line.startsWith("## 7 中断・再開基準"))
      .join("\n");

    const result = renderTestPlanRevision(withoutSuspensionChapter);

    const section1_1 = result.split("### 1.1")[1]?.split("### 1.2")[0] ?? "";
    expect(section1_1).toContain("追加した章: 7 中断・再開基準");

    const section2 = result.split("## 2.")[1]?.split("## 3.")[0] ?? "";
    expect(section2).toContain("## 7 中断・再開基準");
    expect(section2).toContain("_未記入（必須）_");
  });

  it("normalizes a bare TBD table cell to _未記入_", () => {
    const planMarkdown = [
      "# サンプル計画書",
      "",
      "## 10 環境",
      "",
      "| 項目 | 内容 |",
      "| --- | --- |",
      "| 環境 | TBD |",
    ].join("\n");

    const result = renderTestPlanRevision(planMarkdown);

    const section1_2 = result.split("### 1.2")[1]?.split("## 2.")[0] ?? "";
    expect(section1_2).toContain('を "_未記入_" に正規化（計1件）');

    const section2 = result.split("## 2.")[1]?.split("## 3.")[0] ?? "";
    expect(section2).toContain("| 環境 | _未記入_ |");
  });

  it("normalizes new exact-match placeholder words to _未記入_", () => {
    const words = ["検討中", "未確定", "要検討", "要確認", "後日", "後日確定"];
    const planMarkdown = [
      "# サンプル計画書",
      "",
      "## 10 環境",
      "",
      "| 項目 | 内容 |",
      "| --- | --- |",
      ...words.map((w) => `| 環境 | ${w} |`),
    ].join("\n");

    const result = renderTestPlanRevision(planMarkdown);

    const section1_2 = result.split("### 1.2")[1]?.split("## 2.")[0] ?? "";
    for (const w of words) {
      expect(section1_2).toContain(`10 環境 の "${w}" を "_未記入_" に正規化（計1件）`);
    }

    const section2 = result.split("## 2.")[1]?.split("## 3.")[0] ?? "";
    for (const w of words) {
      expect(section2).not.toContain(`| 環境 | ${w} |`);
    }
    expect((section2.match(/\| 環境 \| _未記入_ \|/g) ?? []).length).toBe(words.length);
  });

  it("normalizes leading tbd/todo-style prefix placeholders to _未記入_", () => {
    const planMarkdown = [
      "# サンプル計画書",
      "",
      "## 10 環境",
      "",
      "| 項目 | 内容 |",
      "| --- | --- |",
      "| 環境 | TBD: 後日確定 |",
      "| 担当 | (todo) |",
    ].join("\n");

    const result = renderTestPlanRevision(planMarkdown);

    const section1_2 = result.split("### 1.2")[1]?.split("## 2.")[0] ?? "";
    expect(section1_2).toContain('10 環境 の "TBD: 後日確定" を "_未記入_" に正規化（計1件）');
    expect(section1_2).toContain('10 環境 の "(todo)" を "_未記入_" に正規化（計1件）');

    const section2 = result.split("## 2.")[1]?.split("## 3.")[0] ?? "";
    expect(section2).toContain("| 環境 | _未記入_ |");
    expect(section2).toContain("| 担当 | _未記入_ |");
  });

  it("does not false-positive normalize phrases that merely contain placeholder words", () => {
    const planMarkdown = [
      "# サンプル計画書",
      "",
      "## 10 環境",
      "",
      "| 項目 | 内容 |",
      "| --- | --- |",
      "| 環境 | 後日レビュー会議で確認 |",
      "| 担当 | 要検討事項は次回までにまとめる |",
    ].join("\n");

    const result = renderTestPlanRevision(planMarkdown);

    const section1_2 = result.split("### 1.2")[1]?.split("## 2.")[0] ?? "";
    expect(section1_2).toContain("- 正規化なし");

    const section2 = result.split("## 2.")[1]?.split("## 3.")[0] ?? "";
    expect(section2).toContain("| 環境 | 後日レビュー会議で確認 |");
    expect(section2).toContain("| 担当 | 要検討事項は次回までにまとめる |");
  });

  it("includes provided instructions verbatim in 3.1, or states none given when omitted", () => {
    const planMarkdown = renderTestPlan(minimalInput);

    const withInstructions = renderTestPlanRevision(planMarkdown, ["合否判定基準をより具体的に"]);
    const section3_1 = withInstructions.split("### 3.1")[1]?.split("### 3.2")[0] ?? "";
    expect(section3_1).toContain("合否判定基準をより具体的に");

    const withoutInstructions = renderTestPlanRevision(planMarkdown);
    const section3_1NoInstructions = withoutInstructions.split("### 3.1")[1]?.split("### 3.2")[0] ?? "";
    expect(section3_1NoInstructions).toContain("- 指定なし");
  });

  it("lists remaining required-未記入 headings/counts in 3.2 matching review_test_plan's grouping", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const result = renderTestPlanRevision(planMarkdown);

    const section3_2 = result.split("### 3.2")[1] ?? "";

    const remaining = groupByHeading(findMarkerOccurrences(planMarkdown, TBD_REQUIRED));
    expect(remaining.length).toBeGreaterThan(0);
    for (const { heading, count } of remaining) {
      expect(section3_2).toContain(`${heading} に未記入（必須）が残存（${count}件）`);
    }
  });

  it("appends 参考例 template candidates for required-未記入 8 成果物 and 11.1 テスト体制, but not for other required-未記入 sections", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const result = renderTestPlanRevision(planMarkdown);

    const section3_2 = result.split("### 3.2")[1] ?? "";
    const deliverablesBlock = section3_2.split("8 成果物")[1]?.split(/\n- /)[0] ?? "";
    expect(deliverablesBlock).toContain("参考例（プロジェクトに応じて修正してください）");

    const testOrgBlock = section3_2.split("11.1 テスト体制")[1]?.split(/\n- /)[0] ?? "";
    expect(testOrgBlock).toContain("参考例（プロジェクトに応じて修正してください）");

    // A required section without a template example (e.g. 7 中断・再開基準) should not get the note.
    const suspensionBlock = section3_2.split("7 中断・再開基準")[1]?.split(/\n- /)[0] ?? "";
    expect(suspensionBlock).not.toContain("参考例");
  });

  it("does not duplicate an appended section when the revision output is re-revised", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const withoutSuspensionChapter = planMarkdown
      .split("\n")
      .filter((line) => !line.startsWith("## 7 中断・再開基準"))
      .join("\n");

    const firstResult = renderTestPlanRevision(withoutSuspensionChapter);
    const firstRevisedMarkdown = extractRevisedMarkdown(firstResult);

    const secondResult = renderTestPlanRevision(firstRevisedMarkdown);

    expect(secondResult).toContain("- 追加なし");
    const occurrencesOf7 = (secondResult.match(/## 7 中断・再開基準/g) ?? []).length;
    expect(occurrencesOf7).toBe(1);
  });
});
