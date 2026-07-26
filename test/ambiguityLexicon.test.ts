import { describe, expect, it } from "vitest";
import { testPlanAmbiguityLexicon } from "../src/resources/ambiguityLexicon.js";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";

describe("testPlanAmbiguityLexicon", () => {
  it("has unique term ids matching the expected format with non-empty text fields", () => {
    const seen = new Set<string>();
    for (const term of testPlanAmbiguityLexicon.terms) {
      expect(term.id).toMatch(/^AMB-\d{2}$/);
      expect(seen.has(term.id)).toBe(false);
      seen.add(term.id);
      expect(term.term.length).toBeGreaterThan(0);
      expect(term.reason.length).toBeGreaterThan(0);
      expect(term.suggestion.length).toBeGreaterThan(0);
    }
  });

  it("contains the required vocabulary from the issue", () => {
    const words = testPlanAmbiguityLexicon.terms.map((t) => t.term);
    for (const required of ["等", "適切に", "原則として", "必要に応じて", "できる限り"]) {
      expect(words).toContain(required);
    }
  });

  it("uses only the three defined categories", () => {
    for (const term of testPlanAmbiguityLexicon.terms) {
      expect(["ambiguous", "weak-requirement", "non-measurable"]).toContain(term.category);
    }
  });

  it("has valid regular expression patterns where specified", () => {
    for (const term of testPlanAmbiguityLexicon.terms) {
      if (term.pattern !== undefined) {
        expect(() => new RegExp(term.pattern as string)).not.toThrow();
      }
    }
  });

  it("references only existing testPlanTemplate section numbers, uniquely", () => {
    const validNos = new Set(testPlanTemplate.sections.map((s) => s.no));
    const seen = new Set<string>();
    for (const section of testPlanAmbiguityLexicon.prioritySections) {
      expect(validNos.has(section.no)).toBe(true);
      expect(seen.has(section.no)).toBe(false);
      seen.add(section.no);
    }
  });
});
