import { describe, expect, it } from "vitest";
import { factorRalphFrame } from "../src/resources/factorRalphFrame.js";
import { registerResources } from "../src/resources/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("factorRalphFrame", () => {
  it("declares itself as a self-authored paraphrase", () => {
    expect(factorRalphFrame.note).toContain("逐語転載");
    expect(factorRalphFrame.note).toContain("主張するものでもない");
    expect(factorRalphFrame.name).toContain("自作整理");
  });

  it("has exactly four factor categories in signal/noise/state/control order", () => {
    expect(factorRalphFrame.categories).toHaveLength(4);
    expect(factorRalphFrame.categories.map((c) => c.key)).toEqual([
      "signal",
      "noise",
      "state",
      "control",
    ]);
    expect(factorRalphFrame.categories.map((c) => c.id)).toEqual([
      "FC-01",
      "FC-02",
      "FC-03",
      "FC-04",
    ]);
  });

  it("has non-empty required fields for every category", () => {
    for (const category of factorRalphFrame.categories) {
      expect(category.definition.trim().length).toBeGreaterThan(0);
      expect(category.roleInDesign.trim().length).toBeGreaterThan(0);
      expect(category.levelGuidance.trim().length).toBeGreaterThan(0);
      expect(category.probeQuestions.length).toBeGreaterThanOrEqual(3);
      expect(category.badExamples.length).toBeGreaterThanOrEqual(2);
      expect(category.levelHeuristicIds.length).toBeGreaterThan(0);
      expect(category.handoverConventionIds.length).toBeGreaterThan(0);
    }
  });

  it("resolves every declared level heuristic and handover convention reference", () => {
    const heuristicIds = new Set(factorRalphFrame.levelHeuristics.map((h) => h.id));
    const handoverIds = new Set(factorRalphFrame.handoverConventions.map((h) => h.id));
    for (const category of factorRalphFrame.categories) {
      for (const id of category.levelHeuristicIds) {
        expect(heuristicIds.has(id)).toBe(true);
      }
      for (const id of category.handoverConventionIds) {
        expect(handoverIds.has(id)).toBe(true);
      }
    }
  });

  it("resolves references in the reverse direction with no orphans", () => {
    const categoryKeys = new Set(factorRalphFrame.categories.map((c) => c.key));
    for (const handover of factorRalphFrame.handoverConventions) {
      for (const key of handover.applicableCategoryKeys) {
        expect(categoryKeys.has(key)).toBe(true);
      }
    }

    const referencedHeuristicIds = new Set(
      factorRalphFrame.categories.flatMap((c) => c.levelHeuristicIds)
    );
    for (const heuristic of factorRalphFrame.levelHeuristics) {
      expect(referencedHeuristicIds.has(heuristic.id)).toBe(true);
    }

    const referencedHandoverIds = new Set(
      factorRalphFrame.categories.flatMap((c) => c.handoverConventionIds)
    );
    for (const handover of factorRalphFrame.handoverConventions) {
      expect(referencedHandoverIds.has(handover.id)).toBe(true);
    }
  });

  it("has sequential FDS-xx procedure ids and well-formed FLH-xx level heuristics", () => {
    factorRalphFrame.procedure.forEach((step, index) => {
      expect(step.id).toBe(`FDS-${String(index + 1).padStart(2, "0")}`);
    });

    factorRalphFrame.levelHeuristics.forEach((heuristic, index) => {
      expect(heuristic.id).toMatch(/^FLH-\d{2}$/);
      expect(heuristic.id).toBe(`FLH-${String(index + 1).padStart(2, "0")}`);
      expect(heuristic.levelPattern.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("marks only design_pairwise as planned", () => {
    const targetTools = factorRalphFrame.handoverConventions.map((h) => h.targetTool);
    expect(targetTools).toEqual(
      expect.arrayContaining([
        "design_boundary_values",
        "design_equivalence_partitioning",
        "design_decision_table",
        "design_pairwise",
      ])
    );
    for (const handover of factorRalphFrame.handoverConventions) {
      if (handover.targetTool === "design_pairwise") {
        expect(handover.status).toBe("planned");
      } else {
        expect(handover.status).toBe("available");
      }
    }
  });

  it("references the actual argument names of each target tool in notation", () => {
    const byTool = new Map(
      factorRalphFrame.handoverConventions.map((h) => [h.targetTool, h])
    );

    const boundary = byTool.get("design_boundary_values");
    expect(boundary).toBeDefined();
    const boundaryText = boundary!.notation.join(" ");
    expect(boundaryText).toContain("variables[].name");
    expect(boundaryText).toContain("min");
    expect(boundaryText).toContain("max");
    expect(boundary!.traceability.trim().length).toBeGreaterThan(0);

    const equivalence = byTool.get("design_equivalence_partitioning");
    expect(equivalence).toBeDefined();
    const equivalenceText = equivalence!.notation.join(" ");
    expect(equivalenceText).toContain("validClasses");
    expect(equivalenceText).toContain("representative");
    expect(equivalence!.traceability.trim().length).toBeGreaterThan(0);

    const decisionTable = byTool.get("design_decision_table");
    expect(decisionTable).toBeDefined();
    const decisionTableText = decisionTable!.notation.join(" ");
    expect(decisionTableText).toContain("conditions[]");
    expect(decisionTableText).toContain("levels");
    expect(decisionTableText).toContain("impossibleCombinations");
    expect(decisionTable!.traceability.trim().length).toBeGreaterThan(0);

    const pairwise = byTool.get("design_pairwise");
    expect(pairwise).toBeDefined();
    expect(pairwise!.traceability.trim().length).toBeGreaterThan(0);
  });

  it("has non-empty idConvention and at least five completenessChecks", () => {
    expect(factorRalphFrame.idConvention.length).toBeGreaterThan(0);
    expect(factorRalphFrame.completenessChecks.length).toBeGreaterThanOrEqual(5);
  });

  it("has unique ids across the entire frame", () => {
    const allIds = [
      ...factorRalphFrame.procedure.map((s) => s.id),
      ...factorRalphFrame.categories.map((c) => c.id),
      ...factorRalphFrame.levelHeuristics.map((h) => h.id),
      ...factorRalphFrame.handoverConventions.map((h) => h.id),
    ];
    const seen = new Set<string>();
    for (const id of allIds) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it("does not include verbatim external standard or method names", () => {
    const text = JSON.stringify(factorRalphFrame);
    for (const term of ["JSTQB", "ISO", "IEC", "IEEE", "準拠", "HAYST", "ラルフ"]) {
      expect(text).not.toContain(term);
    }
  });

  it("registers the factor decomposition frame resource with the expected uri", () => {
    const registeredUris: string[] = [];
    const stub = {
      registerResource: (
        _name: string,
        uri: string,
        _meta: unknown,
        _handler: unknown
      ) => {
        registeredUris.push(uri);
      },
    };
    registerResources(stub as unknown as McpServer);
    expect(registeredUris).toContain("testcondition://factor/ralph-frame");
  });
});
