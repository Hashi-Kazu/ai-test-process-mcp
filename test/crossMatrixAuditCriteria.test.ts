import { describe, expect, it } from "vitest";
import { crossMatrixAuditCriteria } from "../src/resources/crossMatrixAuditCriteria.js";

describe("crossMatrixAuditCriteria", () => {
  it("covers CMX-01..CMX-17 exactly once with unique ids", () => {
    const ids = crossMatrixAuditCriteria.categories.map((c) => c.id);
    const expected = Array.from({ length: 17 }, (_, i) => `CMX-${String(i + 1).padStart(2, "0")}`);
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every category a non-empty nameJa / definition / recommendedAction and a valid severity", () => {
    for (const c of crossMatrixAuditCriteria.categories) {
      expect(c.nameJa.length).toBeGreaterThan(0);
      expect(c.definition.length).toBeGreaterThan(0);
      expect(c.recommendedAction.length).toBeGreaterThan(0);
      expect(["high", "medium", "info"]).toContain(c.severity);
    }
  });

  it("documents the fill rate denominator in notes", () => {
    expect(crossMatrixAuditCriteria.notes.length).toBeGreaterThan(0);
    expect(crossMatrixAuditCriteria.notes.some((n) => n.includes("分母"))).toBe(true);
    expect(crossMatrixAuditCriteria.notes.some((n) => n.includes("行数 × 列数"))).toBe(true);
  });

  it("is JSON serializable so it can be exposed as a resource", () => {
    const json = JSON.stringify(crossMatrixAuditCriteria, null, 2);
    expect(JSON.parse(json)).toEqual(crossMatrixAuditCriteria);
  });
});
