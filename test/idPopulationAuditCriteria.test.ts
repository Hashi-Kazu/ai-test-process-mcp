import { describe, expect, it } from "vitest";
import { idPopulationAuditCriteria } from "../src/resources/idPopulationAuditCriteria.js";

describe("idPopulationAuditCriteria", () => {
  it("has exactly 6 categories with ids PAC-01..PAC-06 and no duplicates", () => {
    expect(idPopulationAuditCriteria.categories).toHaveLength(6);
    const ids = idPopulationAuditCriteria.categories.map((c) => c.id);
    expect(ids).toEqual(["PAC-01", "PAC-02", "PAC-03", "PAC-04", "PAC-05", "PAC-06"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-empty description and action for every category", () => {
    for (const c of idPopulationAuditCriteria.categories) {
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.action.length).toBeGreaterThan(0);
    }
  });

  it("has a valid severity for every category", () => {
    for (const c of idPopulationAuditCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
  });
});
