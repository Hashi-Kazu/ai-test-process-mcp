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

  it("only marks boundary-value-analysis, equivalence-partitioning, decision-table, state-transition, pairwise, use-case-based, and scenario-based as deterministic", () => {
    const deterministicIds = testTechniqueCatalog.entries.filter((e) => e.deterministic).map((e) => e.techniqueId);
    expect(new Set(deterministicIds)).toEqual(
      new Set([
        "boundary-value-analysis",
        "equivalence-partitioning",
        "decision-table",
        "state-transition",
        "pairwise",
        "use-case-based",
        "scenario-based",
      ])
    );
  });

  it("routes decision-table (TTK-03) to design_decision_table deterministically", () => {
    const entry = testTechniqueCatalog.entries.find((e) => e.id === "TTK-03");
    expect(entry?.engineToolName).toBe("design_decision_table");
    expect(entry?.deterministic).toBe(true);
  });

  it("routes pairwise (TTK-05) to design_pairwise deterministically", () => {
    const entry = testTechniqueCatalog.entries.find((e) => e.id === "TTK-05");
    expect(entry?.techniqueId).toBe("pairwise");
    expect(entry?.engineToolName).toBe("design_pairwise");
    expect(entry?.deterministic).toBe(true);
    expect(entry?.requiredInputs).toEqual(["因子一覧", "各因子の水準一覧", "禁則(ありえない組合せ)"]);
    expect(entry?.note).toContain("design_pairwise");
    expect(entry?.note).toContain("PW:");
    expect(entry?.note).not.toContain("未実装");
  });

  it("routes use-case-based (TTK-06) to design_scenario_flows deterministically", () => {
    const entry = testTechniqueCatalog.entries.find((e) => e.id === "TTK-06");
    expect(entry?.techniqueId).toBe("use-case-based");
    expect(entry?.engineToolName).toBe("design_scenario_flows");
    expect(entry?.deterministic).toBe(true);
    expect(entry?.requiredInputs).toContain("機能ID（ステップ単位）");
    expect(entry?.note).toContain("design_scenario_flows");
    expect(entry?.note).toContain("UC:");
    expect(entry?.note).not.toContain("未実装");
  });

  it("routes scenario-based (TTK-07) to design_scenario_flows deterministically", () => {
    const entry = testTechniqueCatalog.entries.find((e) => e.id === "TTK-07");
    expect(entry?.techniqueId).toBe("scenario-based");
    expect(entry?.engineToolName).toBe("design_scenario_flows");
    expect(entry?.deterministic).toBe(true);
    expect(entry?.requiredInputs).toContain("分岐の終了状態(goal-achieved / aborted)");
    expect(entry?.note).toContain("design_scenario_flows");
    expect(entry?.note).toContain("SC:");
    expect(entry?.note).not.toContain("未実装");
  });

  it("keeps TTC-COV-06 / TTC-COV-07 ids and names unchanged", () => {
    const ttk06 = testTechniqueCatalog.entries.find((e) => e.id === "TTK-06");
    const ttk07 = testTechniqueCatalog.entries.find((e) => e.id === "TTK-07");
    expect(ttk06?.coverageCriteria[0].id).toBe("TTC-COV-06");
    expect(ttk06?.coverageCriteria[0].nameJa).toBe("主要・代替フロー被覆");
    expect(ttk07?.coverageCriteria[0].id).toBe("TTC-COV-07");
    expect(ttk07?.coverageCriteria[0].nameJa).toBe("主要・代替フロー被覆");
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
