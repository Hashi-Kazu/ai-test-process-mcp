import { describe, expect, it } from "vitest";
import { businessRequirementFrame } from "../src/resources/businessRequirementFrame.js";

describe("businessRequirementFrame", () => {
  it("declares that it is an original paraphrased summary, not a verbatim reproduction", () => {
    expect(businessRequirementFrame.note).toContain("逐語転載");
    expect(businessRequirementFrame.note).toContain("主張するものでもない");
    expect(businessRequirementFrame.name).toContain("自作整理");
  });

  it("has exactly four layers in systemPurpose -> drivingData order with BRL-0x ids", () => {
    expect(businessRequirementFrame.layers).toHaveLength(4);
    expect(businessRequirementFrame.layers.map((l) => l.key)).toEqual([
      "systemPurpose",
      "businessUseCase",
      "businessFlow",
      "drivingData",
    ]);
    expect(businessRequirementFrame.layers.map((l) => l.id)).toEqual([
      "BRL-01",
      "BRL-02",
      "BRL-03",
      "BRL-04",
    ]);
    for (const layer of businessRequirementFrame.layers) {
      expect(layer.nameJa.length).toBeGreaterThan(0);
      expect(layer.definition.length).toBeGreaterThan(0);
      expect(layer.granularityGuidance.length).toBeGreaterThan(0);
      expect(layer.questionExamples.length).toBeGreaterThan(0);
      expect(layer.badExamples.length).toBeGreaterThan(0);
    }
  });

  it("has exactly three purpose levels in businessGoal -> achievementMetric order with BPL-0x ids", () => {
    expect(businessRequirementFrame.purposeLevels).toHaveLength(3);
    expect(businessRequirementFrame.purposeLevels.map((l) => l.key)).toEqual([
      "businessGoal",
      "systemizationPurpose",
      "achievementMetric",
    ]);
    expect(businessRequirementFrame.purposeLevels.map((l) => l.id)).toEqual([
      "BPL-01",
      "BPL-02",
      "BPL-03",
    ]);
    for (const level of businessRequirementFrame.purposeLevels) {
      expect(level.definition.length).toBeGreaterThan(0);
      expect(level.questionExamples.length).toBeGreaterThan(0);
      expect(level.badExamples.length).toBeGreaterThan(0);
    }
  });

  it("has exactly six use case aspects with BUC-0x ids and required flags", () => {
    expect(businessRequirementFrame.useCaseAspects).toHaveLength(6);
    expect(businessRequirementFrame.useCaseAspects.map((a) => a.id)).toEqual([
      "BUC-01",
      "BUC-02",
      "BUC-03",
      "BUC-04",
      "BUC-05",
      "BUC-06",
    ]);
    for (const aspect of businessRequirementFrame.useCaseAspects) {
      expect(aspect.nameJa.length).toBeGreaterThan(0);
      expect(aspect.definition.length).toBeGreaterThan(0);
      expect(aspect.questionExamples.length).toBeGreaterThan(0);
      expect(typeof aspect.required).toBe("boolean");
    }
  });

  it("has exactly five flow aspects with BFL-0x ids", () => {
    expect(businessRequirementFrame.flowAspects).toHaveLength(5);
    expect(businessRequirementFrame.flowAspects.map((a) => a.id)).toEqual([
      "BFL-01",
      "BFL-02",
      "BFL-03",
      "BFL-04",
      "BFL-05",
    ]);
    for (const aspect of businessRequirementFrame.flowAspects) {
      expect(aspect.definition.length).toBeGreaterThan(0);
      expect(aspect.questionExamples.length).toBeGreaterThan(0);
    }
  });

  it("has exactly five data aspects with BDA-0x ids and only known DataClassKind suggestions", () => {
    expect(businessRequirementFrame.dataAspects).toHaveLength(5);
    expect(businessRequirementFrame.dataAspects.map((a) => a.id)).toEqual([
      "BDA-01",
      "BDA-02",
      "BDA-03",
      "BDA-04",
      "BDA-05",
    ]);
    const knownKinds = [
      "master",
      "transaction",
      "counter",
      "credential",
      "external-settlement",
      "time-dependent",
    ];
    for (const aspect of businessRequirementFrame.dataAspects) {
      expect(aspect.definition.length).toBeGreaterThan(0);
      expect(aspect.questionExamples.length).toBeGreaterThan(0);
      for (const kind of aspect.suggestedDataClassKinds ?? []) {
        expect(knownKinds).toContain(kind);
      }
    }
  });

  it("defines the role separation with business flow / role / goal shared topics", () => {
    const separation = businessRequirementFrame.roleSeparation;
    expect(separation.businessFrameScope.length).toBeGreaterThan(0);
    expect(separation.personaFrameScope.length).toBeGreaterThan(0);
    expect(separation.sharedTopics.length).toBeGreaterThanOrEqual(3);
    const topics = separation.sharedTopics.map((t) => t.topic).join("\n");
    expect(topics).toContain("業務フロー");
    expect(topics).toContain("役割");
    expect(topics).toContain("目標");
    for (const topic of separation.sharedTopics) {
      expect(["business", "persona"]).toContain(topic.owner);
      expect(topic.rule.length).toBeGreaterThan(0);
    }
    expect(separation.avoidDuplication.length).toBeGreaterThan(0);
  });

  it("has exactly four handover conventions with BRH-0x ids, BRH-04 marked unavailable", () => {
    expect(businessRequirementFrame.handoverConventions).toHaveLength(4);
    expect(businessRequirementFrame.handoverConventions.map((c) => c.id)).toEqual([
      "BRH-01",
      "BRH-02",
      "BRH-03",
      "BRH-04",
    ]);
    const byId = new Map(businessRequirementFrame.handoverConventions.map((c) => [c.id, c]));
    expect(byId.get("BRH-01")?.targetTool).toBe("design_scenario_flows");
    expect(byId.get("BRH-01")?.available).toBe(true);
    expect(byId.get("BRH-02")?.targetTool).toBe("design_test_data");
    expect(byId.get("BRH-02")?.available).toBe(true);
    expect(byId.get("BRH-03")?.targetTool).toBe("audit_cross_matrix");
    expect(byId.get("BRH-03")?.available).toBe(true);
    expect(byId.get("BRH-04")?.available).toBe(false);
    for (const convention of businessRequirementFrame.handoverConventions) {
      expect(convention.rules.length).toBeGreaterThan(0);
    }
  });

  it("keeps every id unique across the whole frame", () => {
    const ids = [
      ...businessRequirementFrame.layers.map((l) => l.id),
      ...businessRequirementFrame.purposeLevels.map((l) => l.id),
      ...businessRequirementFrame.useCaseAspects.map((a) => a.id),
      ...businessRequirementFrame.flowAspects.map((a) => a.id),
      ...businessRequirementFrame.dataAspects.map((a) => a.id),
      ...businessRequirementFrame.handoverConventions.map((c) => c.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
