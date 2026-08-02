import { describe, expect, it } from "vitest";
import { thresholdExtractionCriteria } from "../src/resources/thresholdExtractionCriteria.js";

describe("thresholdExtractionCriteria", () => {
  it("17. has exactly 7 categories with ids TCE-01..TCE-07 and no duplicates", () => {
    expect(thresholdExtractionCriteria.categories).toHaveLength(7);
    const ids = thresholdExtractionCriteria.categories.map((c) => c.id);
    expect(ids).toEqual(["TCE-01", "TCE-02", "TCE-03", "TCE-04", "TCE-05", "TCE-06", "TCE-07"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("18. has a valid severity and non-empty description/action for every category", () => {
    for (const c of thresholdExtractionCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.action.length).toBeGreaterThan(0);
    }
  });

  it("19. has at least 3 notes", () => {
    expect(thresholdExtractionCriteria.notes.length).toBeGreaterThanOrEqual(3);
  });
});
