import { describe, expect, it } from "vitest";
import { renderTestPlan } from "../src/tools/generateTestPlan.js";
import { iso29119TestPlanStructure } from "../src/resources/iso29119.js";
import type { TestPlanInput } from "../src/types.js";

describe("renderTestPlan", () => {
  it("includes all 15 ISO 29119 section headings", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    expect(iso29119TestPlanStructure.sections).toHaveLength(15);
    iso29119TestPlanStructure.sections.forEach((section, index) => {
      expect(markdown).toContain(`## ${index + 1}. ${section.title}`);
    });
  });

  it("marks omitted optional fields as TBD when only required fields are provided", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain("_TBD — not provided by caller_");
    expect(markdown).toContain("# Test Plan: Sample");
    expect(markdown).toContain(iso29119TestPlanStructure.standard);
  });

  it("interpolates provided fields instead of TBD", () => {
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
  });
});
