import { describe, expect, it } from "vitest";
import { requirementIdPatternCatalog } from "../src/resources/requirementIdPatterns.js";
import {
  COVERAGE_TARGET_ID_PATTERN_SOURCE,
  DEFAULT_ID_PATTERN_SOURCE,
  extractIdStringsFromText,
} from "../src/testBasisAnalysis.js";

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

  it("has IDP-06 and IDP-07 numeric/dot-hierarchy patterns", () => {
    const idp06 = requirementIdPatternCatalog.patterns.find((p) => p.id === "IDP-06");
    const idp07 = requirementIdPatternCatalog.patterns.find((p) => p.id === "IDP-07");
    expect(idp06).toBeDefined();
    expect(idp07).toBeDefined();
    expect(idp06!.examples).toContain("031");
    expect(idp07!.examples).toContain("3.1.2");
  });

  // 宣言（catalogのsource）と実体（extractIdStringsFromTextの実際の抽出結果）の照合。
  // IDP-02〜04 の既存不具合（REQ-001-undefined のようなIDが再構成されてしまう）の回帰ガード。
  it("extractIdStringsFromText derives a usable, undefined-free id from each pattern's own examples (excluding IDP-05)", () => {
    for (const pattern of requirementIdPatternCatalog.patterns) {
      if (pattern.id === "IDP-05") continue;
      for (const example of pattern.examples) {
        const ids = extractIdStringsFromText(example, { idPatterns: [pattern.source] });
        expect(ids.length).toBeGreaterThan(0);
        expect(ids.some((id) => example.includes(id) || id === example)).toBe(true);
        for (const id of ids) {
          expect(id).not.toContain("undefined");
        }
      }
    }
  });
});
