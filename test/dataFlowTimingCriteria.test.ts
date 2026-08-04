import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataFlowTimingAnalysisCriteria } from "../src/resources/dataFlowTimingCriteria.js";

describe("dataFlowTimingAnalysisCriteria", () => {
  it("has unique DFT-xx category ids in the expected format and ascending order", () => {
    const ids = dataFlowTimingAnalysisCriteria.categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^DFT-\d{2}$/);
    }
    expect(ids).toEqual([...ids].sort());
  });

  it("has 20 categories (DFT-01..DFT-20)", () => {
    expect(dataFlowTimingAnalysisCriteria.categories).toHaveLength(20);
    expect(dataFlowTimingAnalysisCriteria.categories.map((c) => c.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => `DFT-${String(i + 1).padStart(2, "0")}`)
    );
  });

  it("has a valid severity for every category", () => {
    for (const c of dataFlowTimingAnalysisCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
  });

  it("has a non-empty nameJa, definition and recommendedAction for every category", () => {
    for (const c of dataFlowTimingAnalysisCriteria.categories) {
      expect(c.nameJa.trim().length).toBeGreaterThan(0);
      expect(c.definition.trim().length).toBeGreaterThan(0);
      expect(c.recommendedAction.trim().length).toBeGreaterThan(0);
    }
  });

  it("states the limits of the check and the mermaid arrow convention in the notes", () => {
    const notes = dataFlowTimingAnalysisCriteria.notes;
    expect(notes.length).toBeGreaterThanOrEqual(4);
    for (const note of notes) expect(note.trim().length).toBeGreaterThan(0);
    expect(notes.some((n) => n.includes("渡していない通信の取りこぼしは検出できない"))).toBe(true);
    expect(notes.some((n) => n.includes("実測値の代替にしない"))).toBe(true);
    expect(notes.some((n) => n.includes("周期差そのものと一致するとは限らない"))).toBe(true);
    expect(notes.some((n) => n.includes("mermaid"))).toBe(true);
  });

  it("does not include verbatim external standard wording", () => {
    expect(dataFlowTimingAnalysisCriteria.summary).not.toContain("JSTQB");
    expect(dataFlowTimingAnalysisCriteria.summary).not.toContain("準拠");
    for (const c of dataFlowTimingAnalysisCriteria.categories) {
      expect(c.definition).not.toContain("JSTQB");
      expect(c.definition).not.toContain("準拠");
    }
  });

  // 宣言（カタログ）と実体（エンジンが実際に push する categoryId）の照合。
  it("covers every categoryId that dataFlowTimingAnalysis.ts and analyzeDataFlowTiming.ts can emit", () => {
    const sources = [
      readFileSync(new URL("../src/dataFlowTimingAnalysis.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../src/tools/analyzeDataFlowTiming.ts", import.meta.url), "utf8"),
    ].join("\n");
    const emitted = new Set([...sources.matchAll(/categoryId: "(DFT-\d{2})"/g)].map((m) => m[1]));
    expect(emitted.size).toBeGreaterThan(0);
    const declared = new Set(dataFlowTimingAnalysisCriteria.categories.map((c) => c.id));
    for (const id of [...emitted].sort()) {
      expect(declared).toContain(id);
    }
  });
});
