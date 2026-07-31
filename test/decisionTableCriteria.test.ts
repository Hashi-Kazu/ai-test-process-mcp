import { describe, expect, it } from "vitest";
import { decisionTableAnalysisCriteria } from "../src/resources/decisionTableCriteria.js";

describe("decisionTableAnalysisCriteria", () => {
  it("has unique DTC-xx category ids in the expected format", () => {
    const ids = decisionTableAnalysisCriteria.categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^DTC-\d{2}$/);
    }
  });

  it("has 10 categories (DTC-01..DTC-10)", () => {
    expect(decisionTableAnalysisCriteria.categories).toHaveLength(10);
  });

  it("has a valid severity for every category", () => {
    for (const c of decisionTableAnalysisCriteria.categories) {
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
  });

  it("does not include verbatim external standard wording", () => {
    expect(decisionTableAnalysisCriteria.summary).not.toContain("JSTQB");
    expect(decisionTableAnalysisCriteria.summary).not.toContain("準拠");
    for (const c of decisionTableAnalysisCriteria.categories) {
      expect(c.definition).not.toContain("JSTQB");
      expect(c.definition).not.toContain("準拠");
    }
  });
});
