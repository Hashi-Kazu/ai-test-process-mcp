import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scenarioFlowAnalysisCriteria } from "../src/resources/scenarioFlowCriteria.js";

describe("scenarioFlowAnalysisCriteria", () => {
  it("has unique SFC-xx category ids in the expected format and ascending order", () => {
    const ids = scenarioFlowAnalysisCriteria.categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^SFC-\d{2}$/);
    }
    expect(ids).toEqual([...ids].sort());
  });

  it("has 15 categories (SFC-01..SFC-15)", () => {
    expect(scenarioFlowAnalysisCriteria.categories).toHaveLength(15);
    expect(scenarioFlowAnalysisCriteria.categories.map((c) => c.id)).toEqual([
      "SFC-01",
      "SFC-02",
      "SFC-03",
      "SFC-04",
      "SFC-05",
      "SFC-06",
      "SFC-07",
      "SFC-08",
      "SFC-09",
      "SFC-10",
      "SFC-11",
      "SFC-12",
      "SFC-13",
      "SFC-14",
      "SFC-15",
    ]);
  });

  it("has a valid severity for every category", () => {
    for (const c of scenarioFlowAnalysisCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
  });

  it("declares the expected severity per category", () => {
    const expected: Record<string, string> = {
      "SFC-01": "high",
      "SFC-02": "high",
      "SFC-03": "high",
      "SFC-04": "high",
      "SFC-05": "high",
      "SFC-06": "high",
      "SFC-07": "medium",
      "SFC-08": "medium",
      "SFC-09": "medium",
      "SFC-10": "medium",
      "SFC-11": "medium",
      "SFC-12": "medium",
      "SFC-13": "medium",
      "SFC-14": "info",
      "SFC-15": "medium",
    };
    for (const c of scenarioFlowAnalysisCriteria.categories) {
      expect(c.severity).toBe(expected[c.id]);
    }
  });

  it("has a non-empty nameJa, definition and recommendedAction for every category", () => {
    for (const c of scenarioFlowAnalysisCriteria.categories) {
      expect(c.nameJa.trim().length).toBeGreaterThan(0);
      expect(c.definition.trim().length).toBeGreaterThan(0);
      expect(c.recommendedAction.trim().length).toBeGreaterThan(0);
    }
  });

  it("has at least five notes stating the limits of the check", () => {
    expect(scenarioFlowAnalysisCriteria.notes.length).toBeGreaterThanOrEqual(5);
    for (const note of scenarioFlowAnalysisCriteria.notes) {
      expect(note.trim().length).toBeGreaterThan(0);
    }
  });

  it("states the scenario expansion policy, classification rule, and coverage caveats in the notes", () => {
    const notes = scenarioFlowAnalysisCriteria.notes.join("\n");
    expect(notes).toContain("主フロー");
    expect(notes).toContain("outcome");
    expect(notes).toContain("kind");
    expect(notes).toContain("未算出");
    expect(notes).toContain("generate_test_cases");
    expect(notes).toContain("取りこぼしは検出できない");
  });

  it("does not include verbatim external standard wording", () => {
    expect(scenarioFlowAnalysisCriteria.summary).not.toContain("JSTQB");
    expect(scenarioFlowAnalysisCriteria.summary).not.toContain("準拠");
    for (const c of scenarioFlowAnalysisCriteria.categories) {
      expect(c.definition).not.toContain("JSTQB");
      expect(c.definition).not.toContain("準拠");
    }
  });

  // 宣言（カタログ）と実体（エンジンが実際に push する categoryId）の照合。
  it("covers every categoryId that designScenarioFlows.ts can emit", () => {
    const source = readFileSync(new URL("../src/tools/designScenarioFlows.ts", import.meta.url), "utf8");
    const emitted = new Set([...source.matchAll(/categoryId: "(SFC-\d{2})"/g)].map((m) => m[1]));
    expect(emitted.size).toBeGreaterThan(0);
    const declared = new Set(scenarioFlowAnalysisCriteria.categories.map((c) => c.id));
    for (const id of [...emitted].sort()) {
      expect(declared).toContain(id);
    }
  });
});
