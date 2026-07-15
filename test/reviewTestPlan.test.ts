import { describe, expect, it } from "vitest";
import { renderTestPlan } from "../src/tools/generateTestPlan.js";
import { renderTestPlanReview } from "../src/tools/reviewTestPlan.js";
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

  it("accepts gen_test_plan output directly without error and finds no missing chapters", () => {
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

  it("includes all checklist item ids in section 2", () => {
    const planMarkdown = renderTestPlan(minimalInput);
    const review = renderTestPlanReview(planMarkdown);
    const section2 = review.split("## 2.")[1] ?? "";

    for (const item of testPlanReviewChecklist.items) {
      expect(section2).toContain(item.id);
    }
  });
});
