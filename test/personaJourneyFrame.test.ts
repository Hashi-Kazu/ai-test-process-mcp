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
  });

  it("keeps every id unique across the whole frame", () => {
    const ids = [
      ...personaJourneyFrame.domainAnalysisAspects.map((a) => a.id),
      ...personaJourneyFrame.personaQuadrants.map((q) => q.id),
      ...personaJourneyFrame.storyMapLevels.map((l) => l.id),
      ...personaJourneyFrame.testRequirementFrame.columns.map((c) => c.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
