import { describe, expect, it } from "vitest";
import { inputQualityCriteria } from "../src/resources/inputQualityCriteria.js";

describe("inputQualityCriteria", () => {
  it("has exactly 5 criteria with ids IQC-01..IQC-05, unique and ascending", () => {
    expect(inputQualityCriteria.criteria).toHaveLength(5);
    const ids = inputQualityCriteria.criteria.map((c) => c.id);
    expect(ids).toEqual(["IQC-01", "IQC-02", "IQC-03", "IQC-04", "IQC-05"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a valid severity (high | medium) for every criterion", () => {
    for (const c of inputQualityCriteria.criteria) {
      expect(["high", "medium"]).toContain(c.severity);
    }
  });

  it("has at least one measuredEvidence entry for every criterion", () => {
    for (const c of inputQualityCriteria.criteria) {
      expect(c.measuredEvidence.length).toBeGreaterThan(0);
      for (const evidence of c.measuredEvidence) {
        expect(evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("has non-empty nameJa / metric / threshold / description / action for every criterion", () => {
    for (const c of inputQualityCriteria.criteria) {
      expect(c.nameJa.length).toBeGreaterThan(0);
      expect(c.metric.length).toBeGreaterThan(0);
      expect(c.threshold.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.action.length).toBeGreaterThan(0);
    }
  });

  it("notes explain this is a conversion-quality indicator, not a defect of the test basis itself", () => {
    const joined = inputQualityCriteria.notes.join("\n");
    expect(joined).toContain("変換品質");
    expect(joined).toContain("仕様そのものの欠陥を示すものではない");
  });

  it("notes state that this catalog does not present coverage/achievement ratios", () => {
    const joined = inputQualityCriteria.notes.join("\n");
    expect(joined).toContain("網羅率・達成度を提示する");
  });

  it("IQC-05 targets bidi control characters and requires no threshold beyond 1 occurrence", () => {
    const iqc05 = inputQualityCriteria.criteria.find((c) => c.id === "IQC-05");
    expect(iqc05).toBeDefined();
    expect(iqc05?.severity).toBe("medium");
    expect(iqc05?.metric).toContain("双方向制御文字");
    expect(iqc05?.threshold).toContain("1文字でも検出したら");
  });

  it("notes explain that IQC-05 is a raw measured count, not an achievement ratio, with a per-codepoint breakdown", () => {
    const joined = inputQualityCriteria.notes.join("\n");
    expect(joined).toContain("IQC-05");
    expect(joined).toContain("符号位置別内訳");
  });
});
