import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { regressionSelectionAnalysisCriteria } from "../src/resources/regressionSelectionCriteria.js";

describe("regressionSelectionAnalysisCriteria", () => {
  it("has unique RSC-xx category ids in the expected format and ascending order", () => {
    const ids = regressionSelectionAnalysisCriteria.categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^RSC-\d{2}$/);
    }
    expect(ids).toEqual([...ids].sort());
  });

  it("has 20 categories (RSC-01..RSC-20)", () => {
    expect(regressionSelectionAnalysisCriteria.categories).toHaveLength(20);
    expect(regressionSelectionAnalysisCriteria.categories.map((c) => c.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => `RSC-${String(i + 1).padStart(2, "0")}`)
    );
  });

  it("has a valid severity for every category", () => {
    for (const c of regressionSelectionAnalysisCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
  });

  it("has a non-empty definition and recommendedAction for every category", () => {
    for (const c of regressionSelectionAnalysisCriteria.categories) {
      expect(c.nameJa.trim().length).toBeGreaterThan(0);
      expect(c.definition.trim().length).toBeGreaterThan(0);
      expect(c.recommendedAction.trim().length).toBeGreaterThan(0);
    }
  });

  it("has at least four notes stating the limits of the check", () => {
    expect(regressionSelectionAnalysisCriteria.notes.length).toBeGreaterThanOrEqual(4);
    for (const note of regressionSelectionAnalysisCriteria.notes) {
      expect(note.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not include verbatim external standard wording", () => {
    expect(regressionSelectionAnalysisCriteria.summary).not.toContain("JSTQB");
    expect(regressionSelectionAnalysisCriteria.summary).not.toContain("準拠");
    for (const c of regressionSelectionAnalysisCriteria.categories) {
      expect(c.definition).not.toContain("JSTQB");
      expect(c.definition).not.toContain("準拠");
    }
  });

  // 宣言（カタログ）と実体（エンジンが実際に push する categoryId）の照合。
  it("covers every categoryId that selectRegressionSuite.ts can emit", () => {
    const source = readFileSync(new URL("../src/tools/selectRegressionSuite.ts", import.meta.url), "utf8");
    const emitted = new Set([...source.matchAll(/categoryId: "(RSC-\d{2})"/g)].map((m) => m[1]));
    expect(emitted.size).toBeGreaterThan(0);
    const declared = new Set(regressionSelectionAnalysisCriteria.categories.map((c) => c.id));
    for (const id of [...emitted].sort()) {
      expect(declared).toContain(id);
    }
  });
});
