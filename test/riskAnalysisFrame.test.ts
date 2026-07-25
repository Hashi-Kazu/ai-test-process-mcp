import { describe, expect, it } from "vitest";
import { riskAnalysisFrame } from "../src/resources/riskAnalysisFrame.js";

describe("riskAnalysisFrame", () => {
  it("has impact and likelihood axes with values 1..5 without duplicates", () => {
    for (const axis of [riskAnalysisFrame.impactAxis, riskAnalysisFrame.likelihoodAxis]) {
      const values = axis.levels.map((l) => l.value).sort((a, b) => a - b);
      expect(values).toEqual([1, 2, 3, 4, 5]);
      for (const level of axis.levels) {
        expect(level.label.trim().length).toBeGreaterThan(0);
        expect(level.criteria.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("has a change axis covering the four change categories", () => {
    const labels = riskAnalysisFrame.changeAxis.levels.map((l) => l.label);
    for (const category of ["new", "modified", "existing-impacted", "existing-unaffected"]) {
      expect(labels.some((l) => l.startsWith(category))).toBe(true);
    }
    for (const level of riskAnalysisFrame.changeAxis.levels) {
      expect(level.value).toBeGreaterThanOrEqual(1);
      expect(level.value).toBeLessThanOrEqual(3);
    }
  });

  it("covers scores 1..75 with contiguous non-overlapping bands", () => {
    const bands = riskAnalysisFrame.bands;
    expect(bands[0].maxScore).toBe(75);
    expect(bands[bands.length - 1].minScore).toBe(1);
    for (let i = 0; i < bands.length; i++) {
      expect(bands[i].minScore).toBeLessThanOrEqual(bands[i].maxScore);
      if (i > 0) {
        expect(bands[i - 1].minScore).toBe(bands[i].maxScore + 1);
      }
    }
    for (let score = 1; score <= 75; score++) {
      const matched = bands.filter((b) => score >= b.minScore && score <= b.maxScore);
      expect(matched).toHaveLength(1);
    }
  });

  it("only uses 高/中/低 as band priorities", () => {
    for (const band of riskAnalysisFrame.bands) {
      expect(["高", "中", "低"]).toContain(band.priority);
    }
  });

  it("has stakeholder frames with at least two impact questions each", () => {
    expect(riskAnalysisFrame.stakeholderFrames.length).toBeGreaterThan(0);
    for (const sf of riskAnalysisFrame.stakeholderFrames) {
      expect(sf.id).toMatch(/^RSF-\d{2}$/);
      expect(sf.impactQuestions.length).toBeGreaterThanOrEqual(2);
    }
  });
});
