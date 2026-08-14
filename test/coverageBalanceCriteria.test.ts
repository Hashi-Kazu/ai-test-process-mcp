import { describe, expect, it } from "vitest";
import { coverageBalanceCriteria } from "../src/resources/coverageBalanceCriteria.js";

describe("coverageBalanceCriteria", () => {
  it("CBC-01..CBC-14 が重複なく全件存在する", () => {
    const ids = coverageBalanceCriteria.categories.map((c) => c.id);
    const expected = Array.from({ length: 14 }, (_, i) => `CBC-${String(i + 1).padStart(2, "0")}`);
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("severity が high|medium|info のいずれかである", () => {
    for (const c of coverageBalanceCriteria.categories) {
      expect(["high", "medium", "info"], c.id).toContain(c.severity);
    }
  });

  it("分布そのものへの指摘は info に限る（CBC-07 / CBC-08）", () => {
    for (const id of ["CBC-07", "CBC-08"]) {
      const c = coverageBalanceCriteria.categories.find((x) => x.id === id);
      expect(c?.severity, id).toBe("info");
    }
  });

  it("全区分に定義と対処が書かれている", () => {
    for (const c of coverageBalanceCriteria.categories) {
      expect(c.nameJa.length, c.id).toBeGreaterThan(0);
      expect(c.definition.length, c.id).toBeGreaterThan(10);
      expect(c.recommendedAction.length, c.id).toBeGreaterThan(10);
    }
  });

  it("notes が空でなく、望ましい分布の基準を持たないことを明示する", () => {
    expect(coverageBalanceCriteria.notes.length).toBeGreaterThan(0);
    expect(coverageBalanceCriteria.notes.some((n) => n.includes("望ましい分布"))).toBe(true);
    expect(coverageBalanceCriteria.notes.some((n) => n.includes("検査不能"))).toBe(true);
  });

  it("commonTermStopWords が20語以上で重複が無い", () => {
    const words = coverageBalanceCriteria.commonTermStopWords;
    expect(words.length).toBeGreaterThanOrEqual(20);
    expect(new Set(words).size).toBe(words.length);
  });

  it("glossaryHeadingKeywords と termCandidateKinds が定義されている", () => {
    expect(coverageBalanceCriteria.glossaryHeadingKeywords).toContain("用語");
    const kindIds = coverageBalanceCriteria.termCandidateKinds.map((k) => k.id);
    expect(kindIds).toEqual(["CBT-01", "CBT-02", "CBT-03", "CBT-04"]);
    for (const k of coverageBalanceCriteria.termCandidateKinds) {
      expect(k.label.length, k.id).toBeGreaterThan(0);
      expect(k.description.length, k.id).toBeGreaterThan(0);
    }
  });
});
