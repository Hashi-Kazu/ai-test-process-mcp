import { describe, expect, it } from "vitest";
import { thresholdChangeImpactCriteria } from "../src/resources/thresholdChangeImpactCriteria.js";

describe("thresholdChangeImpactCriteria", () => {
  it("has exactly 8 categories with ids TCI-01..TCI-08 and no duplicates", () => {
    expect(thresholdChangeImpactCriteria.categories).toHaveLength(8);
    const ids = thresholdChangeImpactCriteria.categories.map((c) => c.id);
    expect(ids).toEqual([
      "TCI-01",
      "TCI-02",
      "TCI-03",
      "TCI-04",
      "TCI-05",
      "TCI-06",
      "TCI-07",
      "TCI-08",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a valid severity for every category", () => {
    for (const c of thresholdChangeImpactCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
  });

  it("has non-empty description and action for every category", () => {
    for (const c of thresholdChangeImpactCriteria.categories) {
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.action.length).toBeGreaterThan(0);
    }
  });

  it("has at least 3 notes", () => {
    expect(thresholdChangeImpactCriteria.notes.length).toBeGreaterThanOrEqual(3);
  });
});
