import { describe, expect, it } from "vitest";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";
import { iso29119TestPlanStructure } from "../src/resources/iso29119.js";

describe("testPlanTemplate", () => {
  it("defines exactly 17 level-1 chapters", () => {
    const chapters = testPlanTemplate.sections.filter((s) => s.level === 1);
    expect(chapters).toHaveLength(17);
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
      "16",
      "17",
    ]);
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
      "2.1",
      "2.2",
      "3.1",
      "3.2",
      "4.1",
      "4.4",
      "4.5",
      "6.2",
      "7.1",
      "8.5",
      "9.1",
      "9.2",
      "9.3",
      "9.4",
      "10.1",
      "10.2",
      "10.3",
      "10.4",
      "10.5",
      "11.1",
      "12.1",
      "12.2",
      "13.3",
      "13.5",
      "13.8",
      "14.2",
      "16.1",
      "16.2",
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
