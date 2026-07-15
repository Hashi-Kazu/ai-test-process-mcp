import { describe, expect, it } from "vitest";
import { testPlanReviewChecklist } from "../src/resources/testPlanReviewChecklist.js";
import { jstqbGlossary } from "../src/resources/jstqbGlossary.js";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";

describe("testPlanReviewChecklist", () => {
  it("has unique item ids", () => {
    const ids = testPlanReviewChecklist.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only allowed severity values and has non-empty title/check", () => {
    const allowed = new Set(["high", "medium", "low"]);
    for (const item of testPlanReviewChecklist.items) {
      expect(allowed.has(item.severity)).toBe(true);
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.check.trim().length).toBeGreaterThan(0);
    }
  });

  it("references only valid JSTQB glossary term ids", () => {
    const glossaryIds = new Set(jstqbGlossary.terms.map((t) => t.id));
    for (const item of testPlanReviewChecklist.items) {
      for (const ref of item.glossaryRefs ?? []) {
        expect(glossaryIds.has(ref)).toBe(true);
      }
    }
  });

  it("references only valid test plan template section numbers", () => {
    const sectionNos = new Set(testPlanTemplate.sections.map((s) => s.no));
    for (const item of testPlanReviewChecklist.items) {
      for (const ref of item.chapterRefs ?? []) {
        expect(sectionNos.has(ref)).toBe(true);
      }
    }
  });
});
