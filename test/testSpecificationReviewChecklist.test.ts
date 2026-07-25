import { describe, expect, it } from "vitest";
import { testSpecificationReviewChecklist } from "../src/resources/testSpecificationReviewChecklist.js";
import { jstqbGlossary } from "../src/resources/jstqbGlossary.js";

describe("testSpecificationReviewChecklist", () => {
  it("has unique item ids", () => {
    const ids = testSpecificationReviewChecklist.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only allowed severity values and has non-empty title/check", () => {
    const allowed = new Set(["high", "medium", "low"]);
    for (const item of testSpecificationReviewChecklist.items) {
      expect(allowed.has(item.severity)).toBe(true);
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.check.trim().length).toBeGreaterThan(0);
    }
  });

  it("has at least one non-empty improvement action per item", () => {
    for (const item of testSpecificationReviewChecklist.items) {
      expect(item.improvementActions.length).toBeGreaterThan(0);
      for (const action of item.improvementActions) {
        expect(action.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("references only valid JSTQB glossary term ids", () => {
    const glossaryIds = new Set(jstqbGlossary.terms.map((t) => t.id));
    for (const item of testSpecificationReviewChecklist.items) {
      for (const ref of item.glossaryRefs ?? []) {
        expect(glossaryIds.has(ref)).toBe(true);
      }
    }
  });

  it("has exactly 14 items", () => {
    expect(testSpecificationReviewChecklist.items.length).toBe(14);
  });

  it("uses TS-01 .. TS-14 sequential ids", () => {
    const ids = testSpecificationReviewChecklist.items.map((item) => item.id);
    const expected = Array.from({ length: 14 }, (_, i) => `TS-${String(i + 1).padStart(2, "0")}`);
    expect(ids).toEqual(expected);
  });
});
