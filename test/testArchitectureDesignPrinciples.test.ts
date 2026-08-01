import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testArchitectureDesignPrinciples } from "../src/resources/testArchitectureDesignPrinciples.js";

const principles = testArchitectureDesignPrinciples;

function expectIdSeries(ids: string[], pattern: RegExp): void {
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) {
    expect(id).toMatch(pattern);
  }
  expect(ids).toEqual([...ids].sort());
}

describe("testArchitectureDesignPrinciples", () => {
  it("has unique TAC-xx category ids in the expected format and ascending order", () => {
    expectIdSeries(
      principles.categories.map((c) => c.id),
      /^TAC-\d{2}$/
    );
  });

  it("has 17 categories (TAC-01..TAC-17)", () => {
    expect(principles.categories).toHaveLength(17);
    expect(principles.categories.map((c) => c.id)).toEqual([
      "TAC-01",
      "TAC-02",
      "TAC-03",
      "TAC-04",
      "TAC-05",
      "TAC-06",
      "TAC-07",
      "TAC-08",
      "TAC-09",
      "TAC-10",
      "TAC-11",
      "TAC-12",
      "TAC-13",
      "TAC-14",
      "TAC-15",
      "TAC-16",
      "TAC-17",
    ]);
  });

  it("declares the expected severity per category", () => {
    const expected: Record<string, string> = {
      "TAC-01": "high",
      "TAC-02": "high",
      "TAC-03": "high",
      "TAC-04": "high",
      "TAC-05": "high",
      "TAC-06": "medium",
      "TAC-07": "medium",
      "TAC-08": "medium",
      "TAC-09": "medium",
      "TAC-10": "medium",
      "TAC-11": "medium",
      "TAC-12": "medium",
      "TAC-13": "medium",
      "TAC-14": "medium",
      "TAC-15": "medium",
      "TAC-16": "info",
      "TAC-17": "medium",
    };
    for (const c of principles.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
      expect(c.severity).toBe(expected[c.id]);
    }
  });

  it("has a non-empty nameJa, definition and recommendedAction for every category", () => {
    for (const c of principles.categories) {
      expect(c.nameJa.trim().length).toBeGreaterThan(0);
      expect(c.definition.trim().length).toBeGreaterThan(0);
      expect(c.recommendedAction.trim().length).toBeGreaterThan(0);
    }
  });

  it("has unique TAX-xx decomposition axis ids with question / suitableWhen / caution", () => {
    expectIdSeries(
      principles.decompositionAxes.map((a) => a.id),
      /^TAX-\d{2}$/
    );
    expect(principles.decompositionAxes.length).toBeGreaterThanOrEqual(8);
    for (const a of principles.decompositionAxes) {
      expect(a.nameJa.trim().length).toBeGreaterThan(0);
      expect(a.question.trim().length).toBeGreaterThan(0);
      expect(a.suitableWhen.trim().length).toBeGreaterThan(0);
      expect(a.caution.trim().length).toBeGreaterThan(0);
    }
  });

  it("has unique RFD-xx responsibility fields and marks the four mandatory ones as required", () => {
    expectIdSeries(
      principles.responsibilityFields.map((f) => f.id),
      /^RFD-\d{2}$/
    );
    const requiredFields = principles.responsibilityFields.filter((f) => f.required).map((f) => f.field);
    expect(requiredFields).toEqual(["responsibility", "testLevel", "testTypes", "priorityClass"]);
    for (const f of principles.responsibilityFields) {
      expect(f.field.trim().length).toBeGreaterThan(0);
      expect(f.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("has unique TPR-xx priority classes covering must / conditional / optional exactly once", () => {
    expectIdSeries(
      principles.priorityClasses.map((p) => p.id),
      /^TPR-\d{2}$/
    );
    const classIds = principles.priorityClasses.map((p) => p.classId);
    expect([...classIds].sort()).toEqual(["conditional", "must", "optional"]);
    for (const p of principles.priorityClasses) {
      expect(p.nameJa.trim().length).toBeGreaterThan(0);
      expect(p.description.trim().length).toBeGreaterThan(0);
      expect(p.allowedConditionPriorities.length).toBeGreaterThan(0);
      for (const priority of p.allowedConditionPriorities) {
        expect(["高", "中", "低"]).toContain(priority);
      }
    }
  });

  it("has unique TSC-xx scope declaration items", () => {
    expectIdSeries(
      principles.scopeDeclarationItems.map((s) => s.id),
      /^TSC-\d{2}$/
    );
    for (const s of principles.scopeDeclarationItems) {
      expect(s.nameJa.trim().length).toBeGreaterThan(0);
      expect(s.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("has at least six notes stating the limits of the check", () => {
    expect(principles.notes.length).toBeGreaterThanOrEqual(6);
    for (const note of principles.notes) {
      expect(note.trim().length).toBeGreaterThan(0);
    }
    const notes = principles.notes.join("\n");
    expect(notes).toContain("未算出");
    expect(notes).toContain("対象外");
    expect(notes).toContain("分母");
    expect(notes).toContain("取りこぼしは検出できない");
    expect(notes).toContain("クリティカルパス");
  });

  it("does not include verbatim external standard wording", () => {
    expect(principles.summary).not.toContain("JSTQB");
    expect(principles.summary).not.toContain("準拠");
    for (const c of principles.categories) {
      expect(c.definition).not.toContain("JSTQB");
      expect(c.definition).not.toContain("準拠");
    }
  });

  // 宣言（カタログ）と実体（エンジンが実際に push する categoryId）の照合。
  it("covers every categoryId that designTestArchitecture.ts can emit", () => {
    const source = readFileSync(new URL("../src/tools/designTestArchitecture.ts", import.meta.url), "utf8");
    const emitted = new Set([...source.matchAll(/categoryId: "(TAC-\d{2})"/g)].map((m) => m[1]));
    expect(emitted.size).toBeGreaterThan(0);
    const declared = new Set(principles.categories.map((c) => c.id));
    for (const id of [...emitted].sort()) {
      expect(declared).toContain(id);
    }
    // 逆方向: 宣言だけあって実体（emit 箇所）が無い区分が無いこと。
    for (const id of [...declared].sort()) {
      expect(emitted).toContain(id);
    }
  });
});
