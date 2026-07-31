import { describe, expect, it } from "vitest";
import { testTechniqueCatalog } from "../src/resources/testTechniqueCatalog.js";

describe("testTechniqueCatalog", () => {
  it("has 10 selection table rows", () => {
    expect(testTechniqueCatalog.selectionTable).toHaveLength(10);
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

  it("only marks boundary-value-analysis, equivalence-partitioning, decision-table, and state-transition as deterministic", () => {
    const deterministicIds = testTechniqueCatalog.entries.filter((e) => e.deterministic).map((e) => e.techniqueId);
    expect(new Set(deterministicIds)).toEqual(
      new Set(["boundary-value-analysis", "equivalence-partitioning", "decision-table", "state-transition"])
    );
  });

  it("routes decision-table (TTK-03) to design_decision_table deterministically", () => {
    const entry = testTechniqueCatalog.entries.find((e) => e.id === "TTK-03");
    expect(entry?.engineToolName).toBe("design_decision_table");
    expect(entry?.deterministic).toBe(true);
  });

  it("does not include verbatim external standard wording", () => {
    expect(testTechniqueCatalog.note).not.toContain("JSTQB");
    expect(testTechniqueCatalog.note).not.toContain("準拠");
  });

  it("has 17 entries", () => {
    expect(testTechniqueCatalog.entries).toHaveLength(17);
  });

  it("routes the experience-based techniques (TTK-11..13) to generate_exploratory_charters", () => {
    const experienceBased = testTechniqueCatalog.entries.filter((e) =>
      ["TTK-11", "TTK-12", "TTK-13"].includes(e.id)
    );
    expect(experienceBased).toHaveLength(3);
    for (const entry of experienceBased) {
      expect(entry.engineToolName).toBe("generate_exploratory_charters");
      expect(entry.deterministic).toBe(false);
    }
  });

  it("has unique TTC-COV-11..14 coverage criterion ids", () => {
    const ids: string[] = [];
    for (const entry of testTechniqueCatalog.entries) {
      for (const c of entry.coverageCriteria) ids.push(c.id);
    }
    for (const id of ["TTC-COV-11", "TTC-COV-12", "TTC-COV-13", "TTC-COV-14"]) {
      expect(ids.filter((i) => i === id)).toHaveLength(1);
    }
  });
});
