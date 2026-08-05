import { describe, expect, it } from "vitest";
import { testPurposeDerivationFrame } from "../src/resources/testPurposeDerivationFrame.js";
import { registerResources } from "../src/resources/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("testPurposeDerivationFrame", () => {
  it("declares itself as a self-authored paraphrase", () => {
    expect(testPurposeDerivationFrame.note).toContain("逐語転載");
    expect(testPurposeDerivationFrame.note).toContain("適合を主張するものでもない");
    expect(testPurposeDerivationFrame.name).toContain("自作整理");
  });

  it("has exactly 17 PDC-xx categories in ascending order with no duplicates", () => {
    const ids = testPurposeDerivationFrame.categories.map((c) => c.id);
    expect(ids).toHaveLength(17);
    expect(new Set(ids).size).toBe(17);
    const expected = Array.from({ length: 17 }, (_, i) => `PDC-${String(i + 1).padStart(2, "0")}`);
    expect(ids).toEqual(expected);
    for (const id of ids) {
      expect(id).toMatch(/^PDC-\d{2}$/);
    }
  });

  it("has non-empty severity/nameJa/definition/recommendedAction for every category", () => {
    for (const c of testPurposeDerivationFrame.categories) {
      expect(["high", "medium", "low", "info"]).toContain(c.severity);
      expect(c.nameJa.trim().length).toBeGreaterThan(0);
      expect(c.definition.trim().length).toBeGreaterThan(0);
      expect(c.recommendedAction.trim().length).toBeGreaterThan(0);
    }
  });

  it("has 5 stages with unique keys, and question/bad examples for each", () => {
    expect(testPurposeDerivationFrame.stages).toHaveLength(5);
    const keys = testPurposeDerivationFrame.stages.map((s) => s.key);
    expect(new Set(keys).size).toBe(5);
    expect(keys).toEqual(["expectation", "testRequirement", "strategy", "purpose", "prioritization"]);
    for (const s of testPurposeDerivationFrame.stages) {
      expect(s.questionExamples.length).toBeGreaterThanOrEqual(2);
      expect(s.badExamples.length).toBeGreaterThanOrEqual(2);
      expect(s.outputConvention.trim().length).toBeGreaterThan(0);
    }
  });

  it("has 2 requirement lines: management and engineering", () => {
    expect(testPurposeDerivationFrame.requirementLines).toHaveLength(2);
    const lines = testPurposeDerivationFrame.requirementLines.map((r) => r.line);
    expect(lines.sort()).toEqual(["engineering", "management"]);
    for (const r of testPurposeDerivationFrame.requirementLines) {
      expect(r.probeQuestions.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("has well-formed purposeQualityRules and prioritizationAxes", () => {
    for (const q of testPurposeDerivationFrame.purposeQualityRules) {
      expect(q.id).toMatch(/^PQR-\d{2}$/);
      expect(q.nameJa.trim().length).toBeGreaterThan(0);
      expect(q.rule.trim().length).toBeGreaterThan(0);
    }
    for (const a of testPurposeDerivationFrame.prioritizationAxes) {
      expect(a.id).toMatch(/^PPA-\d{2}$/);
      expect(a.nameJa.trim().length).toBeGreaterThan(0);
      expect(a.definition.trim().length).toBeGreaterThan(0);
      expect(a.probeQuestions.length).toBeGreaterThan(0);
    }
  });

  it("includes the required limitation notes", () => {
    const text = testPurposeDerivationFrame.notes.join(" ");
    expect(text).toContain("渡された");
    expect(text).toContain("取りこぼしは検出できない");
    expect(text).toContain("例に過ぎない");
  });

  it("registers the test purpose derivation frame resource with the expected uri", () => {
    const registeredUris: string[] = [];
    const stub = {
      registerResource: (_name: string, uri: string, _meta: unknown, _handler: unknown) => {
        registeredUris.push(uri);
      },
    };
    registerResources(stub as unknown as McpServer);
    expect(registeredUris).toContain("testplan://purpose/derivation-frame");
  });
});
