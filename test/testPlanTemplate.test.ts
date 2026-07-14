import { describe, expect, it } from "vitest";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";
import { iso29119TestPlanStructure } from "../src/resources/iso29119.js";

describe("testPlanTemplate", () => {
  it("defines exactly 15 level-1 chapters matching ISO/IEC/IEEE 29119-3", () => {
    const chapters = testPlanTemplate.sections.filter((s) => s.level === 1);
    expect(chapters).toHaveLength(15);
    expect(chapters.map((c) => c.no)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
    ]);

    const isoIds = iso29119TestPlanStructure.sections.map((s) => s.id);
    expect(chapters.map((c) => c.id)).toEqual(isoIds);
  });

  it("has unique section numbers and ids", () => {
    const nos = testPlanTemplate.sections.map((s) => s.no);
    expect(new Set(nos).size).toBe(nos.length);

    const ids = testPlanTemplate.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks the expected required sections", () => {
    const requiredNos = testPlanTemplate.sections
      .filter((s) => s.required)
      .map((s) => s.no);

    expect(requiredNos).toEqual([
      "1.1",
      "2",
      "3",
      "5.1",
      "5.2",
      "6.2",
      "7",
      "8",
      "10.1",
      "10.2",
      "11",
      "11.1",
      "13.1",
      "13.2",
      "14.1",
    ]);
  });

  it("references only valid ISO 29119 section ids", () => {
    const isoIds = new Set(iso29119TestPlanStructure.sections.map((s) => s.id));
    for (const section of testPlanTemplate.sections) {
      if (section.isoRef) {
        expect(isoIds.has(section.isoRef)).toBe(true);
      }
    }
  });
});
