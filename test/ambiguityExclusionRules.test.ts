import { describe, expect, it } from "vitest";
import { ambiguityExclusionRules } from "../src/resources/ambiguityExclusionRules.js";
import { DEFAULT_AMBIGUOUS_TERMS, findAmbiguousTerms } from "../src/testBasisAnalysis.js";

describe("ambiguityExclusionRules", () => {
  it("has unique rule ids matching the AMBX-NN format with non-empty text fields", () => {
    const seen = new Set<string>();
    for (const rule of ambiguityExclusionRules.rules) {
      expect(rule.id).toMatch(/^AMBX-\d{2}$/);
      expect(seen.has(rule.id)).toBe(false);
      seen.add(rule.id);
      expect(rule.term.length).toBeGreaterThan(0);
      expect(rule.rationale.length).toBeGreaterThan(0);
      expect(rule.keptCounterExample.length).toBeGreaterThan(0);
    }
  });

  it("targets only terms that exist in DEFAULT_AMBIGUOUS_TERMS", () => {
    const defaultTerms = new Set(DEFAULT_AMBIGUOUS_TERMS.map((t) => t.term));
    for (const rule of ambiguityExclusionRules.rules) {
      expect(defaultTerms.has(rule.term)).toBe(true);
    }
  });

  it("has valid regular expression patterns for every contextPatternSource", () => {
    for (const rule of ambiguityExclusionRules.rules) {
      expect(() => new RegExp(rule.contextPatternSource, "g")).not.toThrow();
    }
  });

  it("does not exclude the declared keptCounterExample from findAmbiguousTerms", () => {
    for (const rule of ambiguityExclusionRules.rules) {
      const findings = findAmbiguousTerms([{ name: "doc.md", content: rule.keptCounterExample }]);
      const finding = findings.find((f) => f.term === rule.term);
      expect(finding).toBeDefined();
      expect(finding?.total).toBeGreaterThan(0);
      expect(finding?.excludedByRule.some((r) => r.ruleId === rule.id)).toBe(false);
    }
  });

  it("is independent from testplan://review/ambiguity-lexicon (distinct id prefix and module)", () => {
    for (const rule of ambiguityExclusionRules.rules) {
      expect(rule.id.startsWith("AMBX-")).toBe(true);
    }
  });
});
