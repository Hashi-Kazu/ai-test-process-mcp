import { describe, expect, it } from "vitest";
import { buildInterviewPrompt } from "../src/prompts/testPlanInterview.js";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";

describe("buildInterviewPrompt", () => {
  it("uses the given project name in the intro", () => {
    const text = buildInterviewPrompt(testPlanTemplate, "サンプルEC");
    expect(text).toContain("「サンプルEC」");
    expect(text).toContain("gen_test_plan");
  });

  it("falls back to a generic target when no project name is given", () => {
    const text = buildInterviewPrompt(testPlanTemplate);
    expect(text).toContain("対象システム");
  });

  it("emits a question line for every template section that maps to an input field", () => {
    const text = buildInterviewPrompt(testPlanTemplate);
    const mapped = testPlanTemplate.sections.filter(
      (s) => s.level === 2 && s.fieldKey
    );
    expect(mapped.length).toBeGreaterThan(0);
    for (const section of mapped) {
      expect(text).toContain(`${section.no} ${section.titleJa}`);
    }
  });

  it("marks required sections with the ★ priority marker", () => {
    const text = buildInterviewPrompt(testPlanTemplate);
    // 1.1 スコープ・目的 is a required, field-mapped section.
    expect(text).toContain("★ [1 はじめに / 1.1 スコープ・目的]");
  });
});
