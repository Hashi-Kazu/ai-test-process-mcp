import { describe, expect, it } from "vitest";
import { renderTestPlan } from "../src/tools/generateTestPlan.js";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";
import type { TestPlanInput } from "../src/types.js";

describe("renderTestPlan", () => {
  it("includes every QUINTEE template section heading with the correct level", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    for (const section of testPlanTemplate.sections) {
      const prefix = section.level === 1 ? "##" : "###";
      expect(markdown).toContain(`${prefix} ${section.no} ${section.titleJa}`);
    }
  });

  it("renders the document title and revision history", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain("# テスト計画書: Sample");
    expect(markdown).toContain("## 改訂履歴");
    expect(markdown).toContain(testPlanTemplate.templateName);
  });

  it("marks omitted optional fields as 未記入 and required fields as 未記入（必須）", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain("_未記入_");
    expect(markdown).toContain("_未記入（必須）_");
  });

  it("always outputs fixed boilerplate references regardless of input", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain("移植性テスト");
    expect(markdown).toContain("ランクA");
    expect(markdown).toContain("インシデント曲線");
    expect(markdown).toContain("OK");
  });

  it("marks selected test types with 〇 in the test type catalog", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Login and checkout flows",
      selectedTestTypes: ["機能テスト", "性能テスト"],
    };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain("| 〇 | 機能テスト |");
    expect(markdown).toContain("| 〇 | 性能テスト |");
  });

  it("interpolates provided fields instead of 未記入", () => {
    const input: TestPlanInput = {
      projectName: "Full Project",
      scope: "Full scope",
      objectives: ["Verify payment flow"],
      featuresToTest: ["Checkout"],
      featuresNotToTest: ["Admin dashboard"],
      risks: [{ description: "Third-party API instability", impact: "high", mitigation: "Add retries" }],
      scheduleConstraints: {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        milestones: [{ name: "Test design complete", date: "2026-08-10" }],
      },
      team: [{ role: "Test Lead", name: "Alice", responsibilities: "Overall test coordination" }],
      environment: "Staging environment with production-like data",
      deliverables: ["Test summary report"],
      passFailCriteria: "All critical test cases pass",
      suspensionCriteria: "Blocker defect in checkout",
      approvers: ["QA Manager"],
      testLevels: ["System test"],
      testPeriod: "2026-08-01 - 2026-08-31",
      completionCriteria: ["All planned cases executed"],
      stakeholders: [{ role: "Product Owner", name: "Bob" }],
      glossary: [{ term: "SUT", definition: "System Under Test" }],
      notes: "Special handling for payment gateway",
    };

    const markdown = renderTestPlan(input);

    expect(markdown).toContain("Verify payment flow");
    expect(markdown).toContain("Checkout");
    expect(markdown).toContain("Admin dashboard");
    expect(markdown).toContain("Third-party API instability");
    expect(markdown).toContain("2026-08-01");
    expect(markdown).toContain("Test design complete");
    expect(markdown).toContain("Test Lead");
    expect(markdown).toContain("Staging environment with production-like data");
    expect(markdown).toContain("Test summary report");
    expect(markdown).toContain("All critical test cases pass");
    expect(markdown).toContain("Blocker defect in checkout");
    expect(markdown).toContain("QA Manager");
    expect(markdown).toContain("System test");
    expect(markdown).toContain("All planned cases executed");
    expect(markdown).toContain("Product Owner");
    expect(markdown).toContain("SUT");
    expect(markdown).toContain("Special handling for payment gateway");
  });
});
