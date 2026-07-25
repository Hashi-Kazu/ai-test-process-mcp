import { describe, expect, it } from "vitest";
import { guidewordDictionary } from "../src/resources/guidewordDictionary.js";

describe("guidewordDictionary", () => {
  it("has unique focus point and guideword ids matching the expected formats", () => {
    const seen = new Set<string>();
    for (const f of guidewordDictionary.focusPoints) {
      expect(f.id).toMatch(/^GWF-\d{2}$/);
      expect(seen.has(f.id)).toBe(false);
      seen.add(f.id);
      expect(f.examples.length).toBeGreaterThan(0);
    }
    for (const g of guidewordDictionary.guidewords) {
      expect(g.id).toMatch(/^GW-\d{2}$/);
      expect(seen.has(g.id)).toBe(false);
      seen.add(g.id);
    }
  });

  it("contains the required guideword vocabulary", () => {
    const words = guidewordDictionary.guidewords.map((g) => g.word);
    expect(words.length).toBeGreaterThanOrEqual(12);
    for (const required of [
      "有無",
      "程度",
      "速度",
      "持続時間",
      "範囲",
      "向き",
      "種類",
      "タイミング",
      "順序",
      "回数",
      "対象物",
      "対象物の量",
    ]) {
      expect(words).toContain(required);
    }
  });

  it("has question templates with the focus point placeholder", () => {
    for (const g of guidewordDictionary.guidewords) {
      expect(g.questionTemplates.length).toBeGreaterThan(0);
      for (const template of g.questionTemplates) {
        expect(template).toContain("{着目点1}");
      }
    }
  });

  it("declares an operating procedure of at least 5 steps", () => {
    expect(guidewordDictionary.procedure.length).toBeGreaterThanOrEqual(5);
  });

  it("does not name specific external methods or standards", () => {
    const allText = JSON.stringify(guidewordDictionary);
    expect(allText).not.toContain("HAZOP");
    expect(allText).not.toContain("JSTQB");
  });
});
