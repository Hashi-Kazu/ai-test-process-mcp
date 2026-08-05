import { describe, expect, it } from "vitest";
import { qualityInUseCharacteristicModel } from "../src/resources/qualityInUseCharacteristics.js";
import { qualityCharacteristicModel } from "../src/resources/qualityCharacteristics.js";
import { jstqbGlossary } from "../src/resources/jstqbGlossary.js";

const glossaryIds = new Set(jstqbGlossary.terms.map((t) => t.id));

describe("qualityInUseCharacteristicModel", () => {
  it("has unique characteristic and sub-characteristic ids matching the expected format", () => {
    const seen = new Set<string>();
    for (const c of qualityInUseCharacteristicModel.characteristics) {
      expect(seen.has(c.id)).toBe(false);
      seen.add(c.id);
      expect(c.id).toMatch(/^QU-\d{2}$/);
      for (const sub of c.subCharacteristics) {
        expect(seen.has(sub.id)).toBe(false);
        seen.add(sub.id);
        expect(sub.id).toMatch(/^QU-\d{2}-\d{2}$/);
      }
    }
  });

  it("has at least one non-empty focus item per sub-characteristic", () => {
    for (const c of qualityInUseCharacteristicModel.characteristics) {
      for (const sub of c.subCharacteristics) {
        expect(sub.focus.length).toBeGreaterThan(0);
        for (const f of sub.focus) {
          expect(f.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("only references existing jstqbGlossary term ids in relatedTestTypes", () => {
    for (const c of qualityInUseCharacteristicModel.characteristics) {
      for (const sub of c.subCharacteristics) {
        for (const id of sub.relatedTestTypes) {
          expect(glossaryIds.has(id)).toBe(true);
        }
      }
    }
  });

  it("does not include standard-compliance wording", () => {
    expect(qualityInUseCharacteristicModel.name).not.toContain("25010");
    expect(qualityInUseCharacteristicModel.name).not.toContain("準拠");
    expect(qualityInUseCharacteristicModel.note).not.toContain("25010");
    expect(qualityInUseCharacteristicModel.note).not.toContain("準拠");
  });

  it("has exactly 5 characteristics with ids that never collide with the product quality model", () => {
    expect(qualityInUseCharacteristicModel.characteristics.length).toBe(5);
    const productIds = new Set(qualityCharacteristicModel.characteristics.map((c) => c.id));
    for (const c of qualityInUseCharacteristicModel.characteristics) {
      expect(c.id.startsWith("QU-")).toBe(true);
      expect(productIds.has(c.id)).toBe(false);
    }
  });
});
