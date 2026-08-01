import { describe, expect, it } from "vitest";
import { causeEffectAnalysisCriteria } from "../src/resources/causeEffectCriteria.js";

describe("causeEffectAnalysisCriteria", () => {
  it("has exactly 20 categories with ids CEG-01..CEG-20 and no duplicates", () => {
    expect(causeEffectAnalysisCriteria.categories).toHaveLength(20);
    const ids = causeEffectAnalysisCriteria.categories.map((c) => c.id);
    expect(ids).toEqual([
      "CEG-01",
      "CEG-02",
      "CEG-03",
      "CEG-04",
      "CEG-05",
      "CEG-06",
      "CEG-07",
      "CEG-08",
      "CEG-09",
      "CEG-10",
      "CEG-11",
      "CEG-12",
      "CEG-13",
      "CEG-14",
      "CEG-15",
      "CEG-16",
      "CEG-17",
      "CEG-18",
      "CEG-19",
      "CEG-20",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("CEG-20 has high severity", () => {
    const ceg20 = causeEffectAnalysisCriteria.categories.find((c) => c.id === "CEG-20");
    expect(ceg20?.severity).toBe("high");
  });

  it("has a valid severity for every category", () => {
    for (const c of causeEffectAnalysisCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
  });

  it("has non-empty nameJa, description and action for every category", () => {
    for (const c of causeEffectAnalysisCriteria.categories) {
      expect(c.nameJa.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.action.length).toBeGreaterThan(0);
    }
  });

  it("has at least 4 notes", () => {
    expect(causeEffectAnalysisCriteria.notes.length).toBeGreaterThanOrEqual(4);
    for (const note of causeEffectAnalysisCriteria.notes) {
      expect(note.length).toBeGreaterThan(0);
    }
  });
});
