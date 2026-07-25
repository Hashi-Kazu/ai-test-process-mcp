import { describe, expect, it } from "vitest";
import { qualityCharacteristicModel } from "../src/resources/qualityCharacteristics.js";
import { jstqbGlossary } from "../src/resources/jstqbGlossary.js";

const glossaryIds = new Set(jstqbGlossary.terms.map((t) => t.id));

describe("qualityCharacteristicModel", () => {
  it("has unique characteristic and sub-characteristic ids matching the expected format", () => {
    const seen = new Set<string>();
    for (const c of qualityCharacteristicModel.characteristics) {
      expect(seen.has(c.id)).toBe(false);
      seen.add(c.id);
      expect(c.id).toMatch(/^QC-\d{2}$/);
      for (const sub of c.subCharacteristics) {
        expect(seen.has(sub.id)).toBe(false);
        seen.add(sub.id);
        expect(sub.id).toMatch(/^QC-\d{2}-\d{2}$/);
      }
    }
  });

  it("has at least one non-empty focus item per sub-characteristic", () => {
    for (const c of qualityCharacteristicModel.characteristics) {
      for (const sub of c.subCharacteristics) {
        expect(sub.focus.length).toBeGreaterThan(0);
        for (const f of sub.focus) {
          expect(f.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("only references existing jstqbGlossary term ids in relatedTestTypes", () => {
    for (const c of qualityCharacteristicModel.characteristics) {
      for (const sub of c.subCharacteristics) {
        for (const id of sub.relatedTestTypes) {
          expect(glossaryIds.has(id)).toBe(true);
        }
      }
    }
  });

  it("does not include standard-compliance wording", () => {
    expect(qualityCharacteristicModel.name).not.toContain("25010");
    expect(qualityCharacteristicModel.name).not.toContain("準拠");
    expect(qualityCharacteristicModel.note).not.toContain("25010");
    expect(qualityCharacteristicModel.note).not.toContain("準拠");
  });
});
