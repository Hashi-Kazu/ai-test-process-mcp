import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { executionOrderAnalysisCriteria } from "../src/resources/executionOrderCriteria.js";

describe("executionOrderAnalysisCriteria", () => {
  it("has unique EOC-xx category ids in the expected format and ascending order", () => {
    const ids = executionOrderAnalysisCriteria.categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^EOC-\d{2}$/);
    }
    expect(ids).toEqual([...ids].sort());
  });

  it("has 27 categories (EOC-01..EOC-27)", () => {
    expect(executionOrderAnalysisCriteria.categories).toHaveLength(27);
    expect(executionOrderAnalysisCriteria.categories.map((c) => c.id)).toEqual(
      Array.from({ length: 27 }, (_, i) => `EOC-${String(i + 1).padStart(2, "0")}`)
    );
  });

  it("has a valid severity for every category", () => {
    for (const c of executionOrderAnalysisCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
  });

  it("has a non-empty nameJa, definition and recommendedAction for every category", () => {
    for (const c of executionOrderAnalysisCriteria.categories) {
      expect(c.nameJa.trim().length).toBeGreaterThan(0);
      expect(c.definition.trim().length).toBeGreaterThan(0);
      expect(c.recommendedAction.trim().length).toBeGreaterThan(0);
    }
  });

  it("has at least one note stating the limits of the check", () => {
    expect(executionOrderAnalysisCriteria.notes.length).toBeGreaterThanOrEqual(1);
    for (const note of executionOrderAnalysisCriteria.notes) {
      expect(note.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not include verbatim external standard wording", () => {
    expect(executionOrderAnalysisCriteria.summary).not.toContain("JSTQB");
    expect(executionOrderAnalysisCriteria.summary).not.toContain("準拠");
    for (const c of executionOrderAnalysisCriteria.categories) {
      expect(c.definition).not.toContain("JSTQB");
      expect(c.definition).not.toContain("準拠");
    }
  });

  // 宣言（カタログ）と実体（エンジンが実際に push する categoryId）の照合。
  it("covers every categoryId that analyzeExecutionOrder.ts can emit", () => {
    const source = readFileSync(new URL("../src/tools/analyzeExecutionOrder.ts", import.meta.url), "utf8");
    const emitted = new Set([...source.matchAll(/categoryId: "(EOC-\d{2})"/g)].map((m) => m[1]));
    expect(emitted.size).toBeGreaterThan(0);
    const declared = new Set(executionOrderAnalysisCriteria.categories.map((c) => c.id));
    for (const id of [...emitted].sort()) {
      expect(declared).toContain(id);
    }
  });
});
