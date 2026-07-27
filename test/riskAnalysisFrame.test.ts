import { describe, expect, it } from "vitest";
import { riskAnalysisFrame } from "../src/resources/riskAnalysisFrame.js";
import { testPerspectiveCatalog } from "../src/resources/testPerspectiveCatalog.js";

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

  it("has risk categories with unique RC-xx ids and 2+ probe questions each", () => {
    const seen = new Set<string>();
    for (const rc of riskAnalysisFrame.riskCategories) {
      expect(rc.id).toMatch(/^RC-\d{2}$/);
      expect(seen.has(rc.id)).toBe(false);
      seen.add(rc.id);
      expect(rc.probeQuestions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("only references existing TPC-xx category ids in riskCategories", () => {
    const tpcIds = new Set(testPerspectiveCatalog.categories.map((c) => c.id));
    for (const rc of riskAnalysisFrame.riskCategories) {
      expect(rc.relatedPerspectiveCategoryIds.length).toBeGreaterThan(0);
      for (const id of rc.relatedPerspectiveCategoryIds) {
        expect(tpcIds.has(id)).toBe(true);
      }
    }
  });

  it("includes a security risk category", () => {
    const hasSecurity = riskAnalysisFrame.riskCategories.some(
      (rc) => rc.nameJa.includes("セキュリティ")
    );
    expect(hasSecurity).toBe(true);
  });

  it("has a control flaw frame with 4 unique RCF-xx patterns and 2+ probe questions each", () => {
    const frame = riskAnalysisFrame.controlFlawFrame;
    expect(frame.patterns.length).toBe(4);
    const seen = new Set<string>();
    for (const p of frame.patterns) {
      expect(p.id).toMatch(/^RCF-\d{2}$/);
      expect(seen.has(p.id)).toBe(false);
      seen.add(p.id);
      expect(p.probeQuestions.length).toBeGreaterThanOrEqual(2);
      expect(p.nameJa.trim().length).toBeGreaterThan(0);
      expect(p.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("has a control flaw frame with 4 unique RCL-xx loop elements", () => {
    const frame = riskAnalysisFrame.controlFlawFrame;
    expect(frame.loopElements.length).toBe(4);
    const seen = new Set<string>();
    for (const el of frame.loopElements) {
      expect(el.id).toMatch(/^RCL-\d{2}$/);
      expect(seen.has(el.id)).toBe(false);
      seen.add(el.id);
    }
  });

  it("does not name specific external methods or standards", () => {
    const allText = JSON.stringify(riskAnalysisFrame);
    for (const term of ["STAMP", "STPA", "HAZOP", "FMEA", "FTA", "JSTQB", "ISO", "IEC", "IEEE"]) {
      expect(allText).not.toContain(term);
    }
  });
});
