import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pairwiseAnalysisCriteria } from "../src/resources/pairwiseCriteria.js";

describe("pairwiseAnalysisCriteria", () => {
  it("has unique PWC-xx category ids in the expected format and ascending order", () => {
    const ids = pairwiseAnalysisCriteria.categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^PWC-\d{2}$/);
    }
    expect(ids).toEqual([...ids].sort());
  });

  it("has 12 categories (PWC-01..PWC-12)", () => {
    expect(pairwiseAnalysisCriteria.categories).toHaveLength(12);
    expect(pairwiseAnalysisCriteria.categories.map((c) => c.id)).toEqual([
      "PWC-01",
      "PWC-02",
      "PWC-03",
      "PWC-04",
      "PWC-05",
      "PWC-06",
      "PWC-07",
      "PWC-08",
      "PWC-09",
      "PWC-10",
      "PWC-11",
      "PWC-12",
    ]);
  });

  it("has a valid severity for every category", () => {
    for (const c of pairwiseAnalysisCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
  });

  it("has a non-empty definition and recommendedAction for every category", () => {
    for (const c of pairwiseAnalysisCriteria.categories) {
      expect(c.nameJa.trim().length).toBeGreaterThan(0);
      expect(c.definition.trim().length).toBeGreaterThan(0);
      expect(c.recommendedAction.trim().length).toBeGreaterThan(0);
    }
  });

  it("has at least four notes stating the limits of the check", () => {
    expect(pairwiseAnalysisCriteria.notes.length).toBeGreaterThanOrEqual(4);
    for (const note of pairwiseAnalysisCriteria.notes) {
      expect(note.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not include verbatim external standard wording", () => {
    expect(pairwiseAnalysisCriteria.summary).not.toContain("JSTQB");
    expect(pairwiseAnalysisCriteria.summary).not.toContain("準拠");
    for (const c of pairwiseAnalysisCriteria.categories) {
      expect(c.definition).not.toContain("JSTQB");
      expect(c.definition).not.toContain("準拠");
    }
  });

  // 宣言（カタログ）と実体（エンジンが実際に push する categoryId）の照合。
  it("covers every categoryId that designPairwise.ts can emit", () => {
    const source = readFileSync(new URL("../src/tools/designPairwise.ts", import.meta.url), "utf8");
    const emitted = new Set([...source.matchAll(/categoryId: "(PWC-\d{2})"/g)].map((m) => m[1]));
    expect(emitted.size).toBeGreaterThan(0);
    const declared = new Set(pairwiseAnalysisCriteria.categories.map((c) => c.id));
    for (const id of [...emitted].sort()) {
      expect(declared).toContain(id);
    }
  });
});
