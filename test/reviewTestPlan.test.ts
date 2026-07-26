import { describe, expect, it } from "vitest";
import { renderTestPlan } from "../src/tools/generateTestPlan.js";
import { renderTestPlanReview, findAmbiguousExpressions } from "../src/tools/reviewTestPlan.js";
import { testPlanReviewChecklist } from "../src/resources/testPlanReviewChecklist.js";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";
import type { TestPlanInput } from "../src/types.js";

const minimalInput: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };

describe("renderTestPlanReview", () => {
  it("detects a missing chapter when its heading line is removed", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const withoutSuspensionChapter = planMarkdown
      .split("\n")
      .filter((line) => !line.startsWith("## 7 中断・再開基準"))
      .join("\n");

    const review = renderTestPlanReview(withoutSuspensionChapter);

    const section1_1 = review.split("### 1.2")[0];
    expect(section1_1).toContain("7 中断・再開基準（欠落）");
  });

  it("detects required-未記入 markers and reports them in the summary", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const review = renderTestPlanReview(planMarkdown);

    expect(review).toContain("未記入（必須）が残存");

    const summaryMatch = review.match(/必須未記入数: (\d+)/);
    expect(summaryMatch).not.toBeNull();
    expect(Number(summaryMatch?.[1])).toBeGreaterThanOrEqual(1);
  });

  it("accepts create_test_plan output directly without error and finds no missing chapters", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const review = renderTestPlanReview(planMarkdown);

    expect(review).toContain(`欠落なし（全 ${testPlanTemplate.sections.length} 章検出）`);
    expect(review).toContain("欠落章数: 0");
  });

  it("tolerates hand-written heading variants (trailing period, no number)", () => {
    const planMarkdown = renderTestPlan(minimalInput);

    const withPeriod = planMarkdown.replace("## 5 テスト方針", "## 5. テスト方針");
    const reviewWithPeriod = renderTestPlanReview(withPeriod);
    expect(reviewWithPeriod.split("### 1.2")[0]).not.toContain("5 テスト方針（欠落）");

    const withoutNumber = planMarkdown.replace("## 5 テスト方針", "## テスト方針");
    const reviewWithoutNumber = renderTestPlanReview(withoutNumber);
    expect(reviewWithoutNumber.split("### 1.2")[0]).not.toContain("5 テスト方針（欠落）");
  });

  it("does not treat a subsection heading as satisfying its parent chapter (10 環境 / 10.1 テスト環境要件)", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const withoutParentChapter = planMarkdown
      .split("\n")
      .filter((line) => !line.startsWith("## 10 環境"))
      .join("\n");
    expect(withoutParentChapter).toContain("## 10.1 テスト環境要件");

    const review = renderTestPlanReview(withoutParentChapter);
    expect(review.split("### 1.2")[0]).toContain("10 環境（欠落）");
  });

  it("does not treat a subsection heading as satisfying its parent chapter (15 承認 / 15.1 承認者)", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const withoutParentChapter = planMarkdown
      .split("\n")
      .filter((line) => !line.startsWith("## 15 承認"))
      .join("\n");
    expect(withoutParentChapter).toContain("## 15.1 承認者");

    const review = renderTestPlanReview(withoutParentChapter);
    expect(review.split("### 1.2")[0]).toContain("15 承認（欠落）");
  });

  it("recognizes an unnumbered heading with an exact title match as the chapter (10 環境)", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const withUnnumberedHeading = planMarkdown.replace("## 10 環境", "## 環境");

    const review = renderTestPlanReview(withUnnumberedHeading);
    expect(review.split("### 1.2")[0]).not.toContain("10 環境（欠落）");
  });

  it("does not let an unrelated long heading falsely satisfy a short chapter title (10 環境)", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const withoutParentChapter = planMarkdown
      .split("\n")
      .filter((line) => !line.startsWith("## 10 環境"))
      .join("\n");
    const withUnrelatedHeading = `${withoutParentChapter}\n## 環境について\n`;

    const review = renderTestPlanReview(withUnrelatedHeading);
    expect(review.split("### 1.2")[0]).toContain("10 環境（欠落）");
  });

  it("reports 5.2 テストタイプ as a required-未記入 section when no test type is selected", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const review = renderTestPlanReview(planMarkdown);

    const section1_2 = review.split("### 1.2")[1]?.split("### 1.3")[0] ?? "";
    expect(section1_2).toContain("5.2 テストタイプ");
    expect(section1_2).toContain("未記入（必須）が残存");
  });

  it("does not report 5.2 テストタイプ as required-未記入 when a test type is selected", () => {
    const planMarkdown = renderTestPlan({ ...minimalInput, selectedTestTypes: ["機能テスト"] });
    const review = renderTestPlanReview(planMarkdown);

    const section1_2 = review.split("### 1.2")[1]?.split("### 1.3")[0] ?? "";
    expect(section1_2).not.toContain("5.2 テストタイプ");
  });

  it("includes all checklist item ids in section 2", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const review = renderTestPlanReview(planMarkdown);
    const section2 = review.split("## 2.")[1] ?? "";

    for (const item of testPlanReviewChecklist.items) {
      expect(section2).toContain(item.id);
    }
  });

  it("flags ambiguous wording in 開始・終了基準 as high with 優先章 mark", () => {
    const planMarkdown = renderTestPlan({
      ...minimalInput,
      startCriteria: "適切に準備が整ったら開始する",
    });
    const review = renderTestPlanReview(planMarkdown);
    const section1_4 = review.split("### 1.4")[1]?.split("### 1.5")[0] ?? "";

    expect(section1_4).toContain("[high]");
    expect(section1_4).toContain("「適切に」");
    expect(section1_4).toContain("優先章");
  });

  it("reports 該当なし for objectively written criteria", () => {
    const planMarkdown = renderTestPlan({
      ...minimalInput,
      startCriteria: "テスト対象環境の構築が完了し、テストデータが投入されていること",
      endCriteria: "計画したテストケースの実行率が100%であること",
      passFailCriteria: "重大度Aの未解決不具合が0件であること",
    });
    const review = renderTestPlanReview(planMarkdown);
    const section1_4 = review.split("### 1.4 曖昧語・非測定表現")[1]?.split("### 1.5")[0] ?? "";

    expect(section1_4.trim()).toBe("- 該当なし");
  });

  it("does not flag boilerplate table rows of create_test_plan output", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const review = renderTestPlanReview(planMarkdown);
    const section1_4 = review.split("### 1.4 曖昧語・非測定表現")[1]?.split("### 1.5")[0] ?? "";

    expect(section1_4.trim()).toBe("- 該当なし");
    expect(review).toContain("曖昧語出現数: 0");
  });

  it("does not match 等 inside 同等 / 均等 / 等しい", () => {
    const planMarkdown = [
      "# テスト計画書: Sample",
      "",
      "## 6.1 開始・終了基準",
      "",
      "同等の条件を保ち、均等に配分し、値が等しいことを確認する。",
      "",
    ].join("\n");
    const findings = findAmbiguousExpressions(planMarkdown);
    const etcFinding = findings.find((f) => f.term === "等");

    expect(etcFinding).toBeUndefined();
  });

  it("counts multiple occurrences on the same line and groups them by heading", () => {
    const planMarkdown = [
      "# テスト計画書: Sample",
      "",
      "## 6.2 合否判定基準",
      "",
      "適切に判定し、適切に記録する。",
      "",
      "## 5.1 テストレベル",
      "",
      "適切に選定する。",
      "",
    ].join("\n");
    const findings = findAmbiguousExpressions(planMarkdown);
    const finding = findings.find((f) => f.term === "適切に");

    expect(finding).toBeDefined();
    expect(finding?.total).toBe(3);
    const byHeadingMap = new Map(finding?.byHeading.map((h) => [h.heading, h]));
    expect(byHeadingMap.get("6.2 合否判定基準")?.count).toBe(2);
    expect(byHeadingMap.get("6.2 合否判定基準")?.priority).toBe(true);
    expect(byHeadingMap.get("5.1 テストレベル")?.count).toBe(1);
    expect(byHeadingMap.get("5.1 テストレベル")?.priority).toBe(false);
    expect(finding?.severity).toBe("high");
  });

  it("marks occurrences outside priority chapters as low", () => {
    const planMarkdown = [
      "# テスト計画書: Sample",
      "",
      "## 5.1 テストレベル",
      "",
      "適切にテストレベルを選定する。",
      "",
    ].join("\n");
    const findings = findAmbiguousExpressions(planMarkdown);
    const finding = findings.find((f) => f.term === "適切に");

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("low");
    expect(finding?.byHeading.every((h) => !h.priority)).toBe(true);
  });

  it("renumbers サマリ to 1.5 and keeps existing deterministic sections", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const review = renderTestPlanReview(planMarkdown);

    expect(review).toContain("### 1.5 サマリ");
    expect(review).not.toContain("### 1.4 サマリ");
    expect(review).toContain("- 曖昧語出現数:");
    expect(review).toContain("- 優先章での曖昧語出現数:");
    expect(review).toContain("## 1. 構造検査（自動・決定的）");
    expect(review).toContain("### 1.1");
    expect(review).toContain("### 1.2");
    expect(review).toContain("### 1.3");
    expect(review).toContain("## 2. 意味的レビュー用チェックリスト");
  });

  it("ignores fenced code blocks", () => {
    const planMarkdown = [
      "# テスト計画書: Sample",
      "",
      "## 6.1 開始・終了基準",
      "",
      "```",
      "適切に処理する等のサンプルコード",
      "```",
      "",
    ].join("\n");
    const findings = findAmbiguousExpressions(planMarkdown);

    expect(findings.length).toBe(0);
  });
});
