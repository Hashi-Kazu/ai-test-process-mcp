import { describe, expect, it } from "vitest";
import { exploratoryCharterCatalog } from "../src/resources/exploratoryCharterCatalog.js";
import { testPerspectiveCatalog } from "../src/resources/testPerspectiveCatalog.js";
import { registerResources } from "../src/resources/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("exploratoryCharterCatalog", () => {
  it("has unique ECA-xx ids matching the expected format", () => {
    const seen = new Set<string>();
    for (const area of exploratoryCharterCatalog.charterAreas) {
      expect(area.id).toMatch(/^ECA-\d{2}$/);
      expect(seen.has(area.id)).toBe(false);
      seen.add(area.id);
    }
  });

  it("has unique ECC-xx table column ids", () => {
    const seen = new Set<string>();
    for (const col of exploratoryCharterCatalog.tableColumns) {
      expect(col.id).toMatch(/^ECC-\d{2}$/);
      expect(seen.has(col.id)).toBe(false);
      seen.add(col.id);
    }
  });

  it("has non-empty check/operation focus examples and stop heuristics per area", () => {
    for (const area of exploratoryCharterCatalog.charterAreas) {
      expect(area.checkFocusExamples.length).toBeGreaterThan(0);
      expect(area.operationFocusExamples.length).toBeGreaterThan(0);
      expect(area.stopHeuristics.length).toBeGreaterThan(0);
      for (const text of [
        ...area.checkFocusExamples,
        ...area.operationFocusExamples,
        ...area.stopHeuristics,
      ]) {
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("does not reuse the same sentence between check focus and operation focus", () => {
    for (const area of exploratoryCharterCatalog.charterAreas) {
      const checkSet = new Set(area.checkFocusExamples);
      for (const op of area.operationFocusExamples) {
        expect(checkSet.has(op)).toBe(false);
      }
    }
  });

  it("only references existing TPC-xx category ids in relatedPerspectiveCategoryIds", () => {
    const tpcIds = new Set(testPerspectiveCatalog.categories.map((c) => c.id));
    for (const area of exploratoryCharterCatalog.charterAreas) {
      expect(area.relatedPerspectiveCategoryIds.length).toBeGreaterThan(0);
      for (const id of area.relatedPerspectiveCategoryIds) {
        expect(tpcIds.has(id)).toBe(true);
      }
    }
  });

  it("has a positive integer recommendedTimeboxMinutes", () => {
    for (const area of exploratoryCharterCatalog.charterAreas) {
      expect(Number.isInteger(area.recommendedTimeboxMinutes)).toBe(true);
      expect(area.recommendedTimeboxMinutes).toBeGreaterThan(0);
    }
  });

  it("has a non-empty allocationProcedure", () => {
    expect(exploratoryCharterCatalog.allocationProcedure.length).toBeGreaterThan(0);
  });

  it("does not include verbatim external standard wording", () => {
    const text = JSON.stringify(exploratoryCharterCatalog);
    for (const term of ["JSTQB", "ISO", "IEC", "IEEE", "25010", "準拠"]) {
      expect(text).not.toContain(term);
    }
  });

  it("registers the exploratory charter catalog resource with the expected uri", () => {
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
    expect(registeredUris).toContain("testdesign://exploratory/charters");
  });
});
