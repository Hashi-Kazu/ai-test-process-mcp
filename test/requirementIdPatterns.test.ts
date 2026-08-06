import { describe, expect, it } from "vitest";
import { requirementIdPatternCatalog } from "../src/resources/requirementIdPatterns.js";
import { COVERAGE_TARGET_ID_PATTERN_SOURCE, DEFAULT_ID_PATTERN_SOURCE } from "../src/testBasisAnalysis.js";

describe("requirementIdPatternCatalog", () => {
  it("has a defaultPatternId that resolves to the shared default pattern source", () => {
    const defaultPattern = requirementIdPatternCatalog.patterns.find(
      (p) => p.id === requirementIdPatternCatalog.defaultPatternId
    );
    expect(defaultPattern).toBeDefined();
    expect(defaultPattern!.source).toBe(DEFAULT_ID_PATTERN_SOURCE);
  });

  it("has an IDP-05 entry that matches COVERAGE_TARGET_ID_PATTERN_SOURCE", () => {
    const idp05 = requirementIdPatternCatalog.patterns.find((p) => p.id === "IDP-05");
    expect(idp05).toBeDefined();
    expect(idp05!.source).toBe(COVERAGE_TARGET_ID_PATTERN_SOURCE);
  });

  it("has unique pattern ids", () => {
    const ids = requirementIdPatternCatalog.patterns.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("compiles every pattern and matches examples while rejecting non-examples", () => {
    for (const pattern of requirementIdPatternCatalog.patterns) {
      expect(() => new RegExp(pattern.source, "gi")).not.toThrow();
      const regex = new RegExp(pattern.source, "gi");
      for (const example of pattern.examples) {
        regex.lastIndex = 0;
        expect(regex.test(example)).toBe(true);
      }
      for (const nonExample of pattern.nonExamples) {
        regex.lastIndex = 0;
        expect(regex.test(nonExample)).toBe(false);
      }
    }
  });
});
