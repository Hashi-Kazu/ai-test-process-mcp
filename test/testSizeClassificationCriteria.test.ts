import { describe, expect, it } from "vitest";
import { testSizeClassificationCriteria as criteria } from "../src/resources/testSizeClassificationCriteria.js";
import { jstqbGlossary } from "../src/resources/jstqbGlossary.js";

describe("testSizeClassificationCriteria", () => {
  it("has 8 dimensions with ids TSD-01..TSD-08 and no duplicates", () => {
    const ids = criteria.dimensions.map((d) => d.id);
    expect(ids).toEqual([
      "TSD-01",
      "TSD-02",
      "TSD-03",
      "TSD-04",
      "TSD-05",
      "TSD-06",
      "TSD-07",
      "TSD-08",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of criteria.dimensions) {
      expect(d.nameJa.length).toBeGreaterThan(0);
      expect(d.question.length).toBeGreaterThan(0);
    }
  });

  it("has 3 sizes ordered small/medium/large with 60/300/1800 second limits", () => {
    expect(criteria.sizes.map((s) => s.sizeId)).toEqual(["small", "medium", "large"]);
    expect(criteria.sizes.map((s) => s.id)).toEqual(["TSZ-01", "TSZ-02", "TSZ-03"]);
    expect(criteria.sizes.map((s) => s.timeLimitSeconds)).toEqual([60, 300, 1800]);
  });

  it("allows a strictly growing set of dimensions from small to large", () => {
    const [small, medium, large] = criteria.sizes;
    expect(small.allowedDimensionIds).toEqual([]);
    for (const id of medium.allowedDimensionIds) {
      expect(large.allowedDimensionIds).toContain(id);
    }
    expect(medium.allowedDimensionIds.length).toBeGreaterThan(small.allowedDimensionIds.length);
    expect(large.allowedDimensionIds.length).toBeGreaterThan(medium.allowedDimensionIds.length);
    for (const d of criteria.dimensions) {
      expect(large.allowedDimensionIds).toContain(d.id);
    }
    // 許容軸は必ずカタログ上の判定軸ID
    const knownIds = criteria.dimensions.map((d) => d.id);
    for (const size of criteria.sizes) {
      for (const id of size.allowedDimensionIds) expect(knownIds).toContain(id);
    }
  });

  it("references only jstqb glossary test-level term ids", () => {
    const levelIds = jstqbGlossary.terms.filter((t) => t.category === "test-level").map((t) => t.id);
    for (const size of criteria.sizes) {
      expect(size.primaryTestLevelIds.length).toBeGreaterThan(0);
      expect(size.acceptableTestLevelIds.length).toBeGreaterThan(0);
      for (const id of size.primaryTestLevelIds) {
        expect(levelIds).toContain(id);
        expect(size.acceptableTestLevelIds).toContain(id);
      }
      for (const id of size.acceptableTestLevelIds) expect(levelIds).toContain(id);
    }
  });

  it("has non-empty description and recommended share range for every size", () => {
    for (const size of criteria.sizes) {
      expect(size.description.length).toBeGreaterThan(0);
      expect(size.nameJa.length).toBeGreaterThan(0);
      expect(size.recommendedSharePercent.min).toBeLessThan(size.recommendedSharePercent.max);
      expect(size.recommendedSharePercent.min).toBeGreaterThanOrEqual(0);
      expect(size.recommendedSharePercent.max).toBeLessThanOrEqual(100);
    }
    expect(criteria.note.length).toBeGreaterThan(0);
    expect(criteria.notes.length).toBeGreaterThanOrEqual(3);
  });
});
