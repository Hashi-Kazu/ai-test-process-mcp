import { describe, expect, it } from "vitest";
import { personaJourneyFrame } from "../src/resources/personaJourneyFrame.js";

describe("personaJourneyFrame", () => {
  it("declares that it is an original paraphrased summary, not a verbatim reproduction", () => {
    expect(personaJourneyFrame.note).toContain("逐語転載");
    expect(personaJourneyFrame.note).toContain("主張するものでもない");
    expect(personaJourneyFrame.name).toContain("自作整理");
  });

  it("has exactly four persona quadrants with the expected keys and PQ-0x ids", () => {
    expect(personaJourneyFrame.personaQuadrants).toHaveLength(4);
    expect(personaJourneyFrame.personaQuadrants.map((q) => q.key)).toEqual([
      "demographics",
      "saysAndThinks",
      "goals",
      "painPoints",
    ]);
    expect(personaJourneyFrame.personaQuadrants.map((q) => q.id)).toEqual([
      "PQ-01",
      "PQ-02",
      "PQ-03",
      "PQ-04",
    ]);
  });

  it("gives every quadrant a definition, question examples and bad examples", () => {
    for (const quadrant of personaJourneyFrame.personaQuadrants) {
      expect(quadrant.nameJa.length).toBeGreaterThan(0);
      expect(quadrant.definition.length).toBeGreaterThan(0);
      expect(quadrant.questionExamples.length).toBeGreaterThan(0);
      expect(quadrant.badExamples.length).toBeGreaterThan(0);
    }
  });

  it("has exactly five story map levels in persona -> user story order", () => {
    expect(personaJourneyFrame.storyMapLevels).toHaveLength(5);
    expect(personaJourneyFrame.storyMapLevels.map((l) => l.key)).toEqual([
      "persona",
      "productGoal",
      "activity",
      "task",
      "userStory",
    ]);
    expect(personaJourneyFrame.storyMapLevels.map((l) => l.id)).toEqual([
      "USM-01",
      "USM-02",
      "USM-03",
      "USM-04",
      "USM-05",
    ]);
    for (const level of personaJourneyFrame.storyMapLevels) {
      expect(level.definition.length).toBeGreaterThan(0);
      expect(level.granularityGuidance.length).toBeGreaterThan(0);
    }
  });

  it("uses unique DOM-xx ids with question examples for every domain analysis aspect", () => {
    const ids = personaJourneyFrame.domainAnalysisAspects.map((a) => a.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const aspect of personaJourneyFrame.domainAnalysisAspects) {
      expect(aspect.id).toMatch(/^DOM-\d{2}$/);
      expect(aspect.summary.length).toBeGreaterThan(0);
      expect(aspect.questionExamples.length).toBeGreaterThan(0);
    }
  });

  it("defines the before / after / test requirement columns and the handover convention", () => {
    expect(personaJourneyFrame.testRequirementFrame.columns.map((c) => c.nameJa)).toEqual([
      "現状(Before)",
      "将来(After)",
      "テスト要求",
    ]);
    const convention = personaJourneyFrame.testRequirementFrame.handoverConvention.join("\n");
    expect(convention).toContain("extract_test_conditions");
    expect(convention).toContain('source="stakeholder"');
    expect(convention).toContain("personas[].id");
    expect(convention).toContain("quality://characteristics/in-use");
  });

  it("keeps every id unique across the whole frame", () => {
    const swf = personaJourneyFrame.stakeholderWeightingFrame;
    const ids = [
      ...personaJourneyFrame.domainAnalysisAspects.map((a) => a.id),
      ...personaJourneyFrame.personaQuadrants.map((q) => q.id),
      ...personaJourneyFrame.storyMapLevels.map((l) => l.id),
      ...personaJourneyFrame.testRequirementFrame.columns.map((c) => c.id),
      ...swf.steps.map((s) => s.id),
      ...swf.handlingClasses.map((c) => c.id),
      swf.influenceAxis.id,
      swf.interestAxis.id,
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("personaJourneyFrame.stakeholderWeightingFrame", () => {
  const swf = personaJourneyFrame.stakeholderWeightingFrame;

  it("declares that it is an original paraphrased summary, not a verbatim reproduction", () => {
    expect(swf.note).toContain("逐語転載");
    expect(swf.note).toContain("主張するものでもない");
    expect(swf.name).toContain("自作整理");
  });

  it("has exactly four analysis steps with SWS-0x ids and non-empty content", () => {
    expect(swf.steps.map((s) => s.id)).toEqual(["SWS-01", "SWS-02", "SWS-03", "SWS-04"]);
    for (const step of swf.steps) {
      expect(step.definition.length).toBeGreaterThan(0);
      expect(step.outputArtifact.length).toBeGreaterThan(0);
    }
  });

  it("defines influence and interest axes with four ascending levels each", () => {
    expect(swf.influenceAxis.id).toBe("SW-INFLUENCE");
    expect(swf.interestAxis.id).toBe("SW-INTEREST");
    for (const axis of [swf.influenceAxis, swf.interestAxis]) {
      expect(axis.levels.map((l) => l.value)).toEqual([1, 2, 3, 4]);
      for (const level of axis.levels) {
        expect(level.label.length).toBeGreaterThan(0);
        expect(level.criteria.length).toBeGreaterThan(0);
      }
    }
  });

  it("defines three handling classes with the expected keys, names and priorities", () => {
    expect(swf.handlingClasses.map((c) => c.id)).toEqual(["SWC-01", "SWC-02", "SWC-03"]);
    expect(swf.handlingClasses.map((c) => c.key)).toEqual(["focus", "standard", "reference"]);
    expect(swf.handlingClasses.map((c) => c.nameJa)).toEqual(["重点", "通常", "参考"]);
    expect(swf.handlingClasses.map((c) => c.defaultConditionPriority)).toEqual(["高", "中", "低"]);
  });

  it("exhaustively enumerates all 16 influence x interest combinations without duplicates", () => {
    expect(swf.matrix).toHaveLength(16);
    const pairs = new Set(swf.matrix.map((cell) => `${cell.influence}-${cell.interest}`));
    expect(pairs.size).toBe(16);
    for (const influence of [1, 2, 3, 4]) {
      for (const interest of [1, 2, 3, 4]) {
        expect(pairs.has(`${influence}-${interest}`)).toBe(true);
      }
    }
  });

  it("computes score as influence * interest for every matrix cell", () => {
    for (const cell of swf.matrix) {
      expect(cell.score).toBe(cell.influence * cell.interest);
    }
  });

  it("assigns classKey consistently with the highThreshold rule for every matrix cell", () => {
    const validKeys = new Set(swf.handlingClasses.map((c) => c.key));
    for (const cell of swf.matrix) {
      const influenceHigh = cell.influence >= swf.highThreshold;
      const interestHigh = cell.interest >= swf.highThreshold;
      const expectedKey =
        influenceHigh && interestHigh ? "focus" : influenceHigh || interestHigh ? "standard" : "reference";
      expect(cell.classKey).toBe(expectedKey);
      expect(validKeys.has(cell.classKey)).toBe(true);
    }
  });

  it("defines the handover convention including the stakeholder-specific handoff rules", () => {
    const convention = swf.handoverConvention.join("\n");
    expect(convention).toContain("extract_test_conditions");
    expect(convention).toContain('source="stakeholder"');
    expect(convention).toContain("personas[].id");
    expect(convention).toContain("SWC-01");
  });
});
