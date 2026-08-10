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

  it("has IDP-08 / IDP-09 patterns for Excel-derived split-cell ids and code tables", () => {
    const idp08 = requirementIdPatternCatalog.patterns.find((p) => p.id === "IDP-08");
    const idp09 = requirementIdPatternCatalog.patterns.find((p) => p.id === "IDP-09");
    expect(idp08).toBeDefined();
    expect(idp09).toBeDefined();
    expect(idp08!.examples).toContain("|  | 031 | 1 | 宛名番号 |");
    expect(idp09!.examples).toContain("| 1 |  |  |  | E0001 |  |  |  | 必須エラー |");
  });

  it("extractIdStringsFromText reconstructs 031-1 from IDP-08 and E0001 from IDP-09", () => {
    const idp08 = requirementIdPatternCatalog.patterns.find((p) => p.id === "IDP-08")!;
    const idp09 = requirementIdPatternCatalog.patterns.find((p) => p.id === "IDP-09")!;
    expect(
      extractIdStringsFromText("|  | 031 | 1 | 宛名番号 |", { idPatterns: [idp08.source] })
    ).toContain("031-1");
    expect(
      extractIdStringsFromText("| 1 |  |  |  | E0001 |  |  |  | 必須エラー |", { idPatterns: [idp09.source] })
    ).toContain("E0001");
  });

  // 宣言（catalogのsource）と実体（extractIdStringsFromTextの実際の抽出結果）の照合。
  // IDP-02〜04 の既存不具合（REQ-001-undefined のようなIDが再構成されてしまう）の回帰ガード。
  it("extractIdStringsFromText derives a usable, undefined-free id from each pattern's own examples (excluding IDP-05)", () => {
    for (const pattern of requirementIdPatternCatalog.patterns) {
      if (pattern.id === "IDP-05") continue;
      for (const example of pattern.examples) {
        const ids = extractIdStringsFromText(example, { idPatterns: [pattern.source] });
        expect(ids.length).toBeGreaterThan(0);
        // 2グループのパターンは `${group1}-${group2}` へ再構成されるため、ID全体が原文に現れるとは限らない。
        // その場合はハイフン区切りの各構成要素が原文に現れることで照合する。
        const appearsInExample = (id: string): boolean =>
          example.includes(id) || id === example || id.split("-").every((part) => example.includes(part));
        expect(ids.some(appearsInExample)).toBe(true);
        for (const id of ids) {
          expect(id).not.toContain("undefined");
        }
      }
    }
  });
});
