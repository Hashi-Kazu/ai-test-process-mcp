import { describe, expect, it } from "vitest";
import { testTechniqueCatalog } from "../src/resources/testTechniqueCatalog.js";

describe("testTechniqueCatalog", () => {
  it("has 8 selection table rows", () => {
    expect(testTechniqueCatalog.selectionTable).toHaveLength(8);
  });

  it("has recommendedTechniqueIds that all exist in entries[].techniqueId", () => {
    const techniqueIds = new Set(testTechniqueCatalog.entries.map((e) => e.techniqueId));
    for (const row of testTechniqueCatalog.selectionTable) {
      expect(row.recommendedTechniqueIds.length).toBeGreaterThan(0);
      for (const t of row.recommendedTechniqueIds) {
        expect(techniqueIds.has(t)).toBe(true);
      }
    }
  });

  it("resolves coverageCriterionIds to entries[].coverageCriteria[].id", () => {
    const criterionIds = new Set<string>();
    for (const entry of testTechniqueCatalog.entries) {
      for (const c of entry.coverageCriteria) criterionIds.add(c.id);
    }
    for (const row of testTechniqueCatalog.selectionTable) {
      expect(row.coverageCriterionIds.length).toBeGreaterThan(0);
      for (const id of row.coverageCriterionIds) {
        expect(criterionIds.has(id)).toBe(true);
      }
    }
  });

  it("has no duplicate entry ids or selection table row ids", () => {
    const entryIds = testTechniqueCatalog.entries.map((e) => e.id);
    expect(new Set(entryIds).size).toBe(entryIds.length);
    const rowIds = testTechniqueCatalog.selectionTable.map((r) => r.id);
    expect(new Set(rowIds).size).toBe(rowIds.length);
  });

  it("requires engineToolName for every deterministic entry", () => {
    for (const entry of testTechniqueCatalog.entries) {
      if (entry.deterministic) {
        expect(entry.engineToolName).toBeTruthy();
      }
    }
  });

  it("only marks boundary-value-analysis, equivalence-partitioning, and state-transition as deterministic", () => {
    const deterministicIds = testTechniqueCatalog.entries.filter((e) => e.deterministic).map((e) => e.techniqueId);
    expect(new Set(deterministicIds)).toEqual(
      new Set(["boundary-value-analysis", "equivalence-partitioning", "state-transition"])
    );
  });

  it("does not include verbatim external standard wording", () => {
    expect(testTechniqueCatalog.note).not.toContain("JSTQB");
    expect(testTechniqueCatalog.note).not.toContain("準拠");
  });
});
