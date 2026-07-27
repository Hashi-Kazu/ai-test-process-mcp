import { describe, expect, it } from "vitest";
import {
  testPerspectiveCatalog,
  testTechniqueToolMapping,
} from "../src/resources/testPerspectiveCatalog.js";
import { qualityCharacteristicModel } from "../src/resources/qualityCharacteristics.js";

const qualityIds = new Set<string>();
for (const c of qualityCharacteristicModel.characteristics) {
  qualityIds.add(c.id);
  for (const sub of c.subCharacteristics) qualityIds.add(sub.id);
}

describe("testPerspectiveCatalog", () => {
  it("has 18 categories", () => {
    expect(testPerspectiveCatalog.categories).toHaveLength(18);
  });

  it("has unique ids matching the expected formats", () => {
    const seen = new Set<string>();
    for (const category of testPerspectiveCatalog.categories) {
      expect(category.id).toMatch(/^TPC-\d{2}$/);
      expect(seen.has(category.id)).toBe(false);
      seen.add(category.id);
      for (const p of category.perspectives) {
        expect(p.id).toMatch(/^TPC-\d{2}-\d{2}$/);
        expect(seen.has(p.id)).toBe(false);
        seen.add(p.id);
      }
    }
  });

  it("has at least one perspective per category and non-empty focus examples / techniques", () => {
    for (const category of testPerspectiveCatalog.categories) {
      expect(category.perspectives.length).toBeGreaterThan(0);
      for (const p of category.perspectives) {
        expect(p.focusExamples.length).toBeGreaterThan(0);
        for (const f of p.focusExamples) {
          expect(f.trim().length).toBeGreaterThan(0);
        }
        expect(p.recommendedTechniques.length).toBeGreaterThan(0);
      }
    }
  });

  it("only references existing quality characteristic ids", () => {
    for (const category of testPerspectiveCatalog.categories) {
      for (const p of category.perspectives) {
        for (const id of p.relatedQualityCharacteristicIds) {
          expect(qualityIds.has(id)).toBe(true);
        }
      }
    }
  });

  it("does not include standard-compliance wording", () => {
    expect(testPerspectiveCatalog.note).not.toContain("25010");
    expect(testPerspectiveCatalog.note).not.toContain("準拠");
    expect(testPerspectiveCatalog.name).not.toContain("25010");
    expect(testPerspectiveCatalog.name).not.toContain("準拠");
  });

  it("maps known technique ids to existing design tools", () => {
    const techniqueIds = new Set<string>();
    for (const category of testPerspectiveCatalog.categories) {
      for (const p of category.perspectives) {
        for (const t of p.recommendedTechniques) techniqueIds.add(t);
      }
    }
    for (const mapping of testTechniqueToolMapping) {
      expect(techniqueIds.has(mapping.techniqueId)).toBe(true);
      expect(mapping.toolName.length).toBeGreaterThan(0);
    }
  });

  it("routes exploratory/error-guessing/checklist-based to generate_exploratory_charters", () => {
    const experienceBasedIds: (typeof testTechniqueToolMapping)[number]["techniqueId"][] = [
      "exploratory",
      "error-guessing",
      "checklist-based",
    ];
    for (const id of experienceBasedIds) {
      const mapping = testTechniqueToolMapping.find((m) => m.techniqueId === id);
      expect(mapping?.toolName).toBe("generate_exploratory_charters");
    }
  });
});
