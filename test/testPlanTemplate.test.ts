import { describe, expect, it } from "vitest";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";

describe("testPlanTemplate", () => {
  it("defines exactly 15 level-1 chapters", () => {
    const chapters = testPlanTemplate.sections.filter((s) => s.level === 1);
    expect(chapters).toHaveLength(15);
    expect(chapters.map((c) => c.no)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
    ]);

    expect(chapters.map((c) => c.id)).toEqual([
      "introduction",
      "test-items",
      "features-to-be-tested",
      "features-not-to-be-tested",
      "approach",
      "item-pass-fail-criteria",
      "suspension-resumption-criteria",
      "test-deliverables",
      "testing-tasks",
      "environmental-needs",
      "responsibilities",
      "staffing-and-training-needs",
      "schedule",
      "risks-and-contingencies",
      "approvals",
    ]);
  });

  it("includes the newly added optional sections 6.6 / 9.4 / 13.3 without changing required ones", () => {
    const byNo = new Map(testPlanTemplate.sections.map((s) => [s.no, s]));
    expect(byNo.get("6.6")).toMatchObject({ id: "slo-targets", required: false, fieldKey: "sloTargets" });
    expect(byNo.get("9.4")).toMatchObject({ id: "monitoring-plan", required: false, fieldKey: "monitoringPlan" });
    expect(byNo.get("13.3")).toMatchObject({
      id: "execution-order-plan",
      required: false,
      fieldKey: "executionOrderPlan",
    });
  });

  it("has unique section numbers and ids", () => {
    const nos = testPlanTemplate.sections.map((s) => s.no);
    expect(new Set(nos).size).toBe(nos.length);

    const ids = testPlanTemplate.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks the expected required sections", () => {
    const requiredNos = testPlanTemplate.sections
      .filter((s) => s.required)
      .map((s) => s.no);

    expect(requiredNos).toEqual([
      "1.1",
      "2",
      "3",
      "5.1",
      "5.2",
      "6.2",
      "7",
      "8",
      "10.1",
      "10.2",
      "11",
      "11.1",
      "13.1",
      "13.2",
      "14.1",
    ]);
  });
});
