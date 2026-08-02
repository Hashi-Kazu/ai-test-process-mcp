import { describe, expect, it } from "vitest";
import { basisContradictionCriteria } from "../src/resources/basisContradictionCriteria.js";

describe("basisContradictionCriteria", () => {
  it("BC-01〜BC-10 の10区分が重複なく定義され、severity が high|medium|info のいずれかである", () => {
    const ids = basisContradictionCriteria.categories.map((c) => c.id);
    const expected = Array.from({ length: 10 }, (_, i) => `BC-${String(i + 1).padStart(2, "0")}`);
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of basisContradictionCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
      expect(c.nameJa.length).toBeGreaterThan(0);
      expect(c.definition.length).toBeGreaterThan(0);
      expect(c.recommendedAction.length).toBeGreaterThan(0);
    }
  });

  it("notes に『候補0件は矛盾が無いことを意味しない』旨の記載がある", () => {
    expect(basisContradictionCriteria.notes.some((n) => n.includes("候補0件は矛盾が無いことを意味しない"))).toBe(true);
  });

  it("is JSON serializable so it can be exposed as a resource", () => {
    const json = JSON.stringify(basisContradictionCriteria, null, 2);
    expect(JSON.parse(json)).toEqual(basisContradictionCriteria);
  });
});
