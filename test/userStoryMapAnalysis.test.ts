import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORY_MAP_ID_PREFIXES,
  findDuplicateStoryMapIds,
  findIncompleteTestRequirementRows,
  findMissingStoryMapNumbers,
  findPersonasWithoutStories,
  findPersonasWithoutTestRequirements,
  findPrefixMismatchStoryMapIds,
  findUnknownDomainAnalysisAspectIds,
  findUnresolvedStoryMapRefs,
  findUnusedDomainAnalysisAspects,
  resolveStoryMapIdPrefixes,
} from "../src/userStoryMapAnalysis.js";
import { personaJourneyFrame } from "../src/resources/personaJourneyFrame.js";
import type { GenerateUserStoryMapInput } from "../src/types.js";

const base: GenerateUserStoryMapInput = {
  subjectName: "園内チケットシステム",
  personas: [
    {
      id: "P-001",
      role: "来園者",
      demographics: ["30代"],
      saysAndThinks: ["待ちたくない"],
      goals: ["すぐ入場したい"],
      painPoints: ["当日券の列が長い"],
    },
    { id: "P-002", role: "運用担当", concerns: "障害対応が煩雑" },
  ],
  activities: [
    { id: "ACT-01", personaIds: ["P-001"], productGoal: "待たずに入場できる", activity: "入場する" },
    { id: "ACT-02", personaIds: ["P-001"], productGoal: "待たずに入場できる", activity: "チケットを買う" },
  ],
  tasks: [
    { id: "TSK-01", activityId: "ACT-01", task: "QRをかざす" },
    { id: "TSK-02", activityId: "ACT-02", task: "決済する" },
  ],
  stories: [
    { id: "US-01", taskId: "TSK-01", story: "来園者としてQRをかざして入場したい", priority: "高" },
    { id: "US-02", taskId: "TSK-02", story: "来園者としてカードで決済したい", priority: "中" },
  ],
  testRequirements: [
    {
      id: "TR-01",
      personaId: "P-001",
      storyIds: ["US-01"],
      before: "当日券の列に20分並んでいた",
      after: "QRで待たずに入場できる",
      testRequirement: "QR入場が繁忙時でも規定時間内に完了することを確認する",
    },
  ],
};

describe("resolveStoryMapIdPrefixes", () => {
  it("falls back to the default prefixes", () => {
    expect(resolveStoryMapIdPrefixes()).toEqual(DEFAULT_STORY_MAP_ID_PREFIXES);
    expect(resolveStoryMapIdPrefixes({ task: "T-" })).toEqual({
      ...DEFAULT_STORY_MAP_ID_PREFIXES,
      task: "T-",
    });
  });
});

describe("findDuplicateStoryMapIds", () => {
  it("returns an empty array for a clean input", () => {
    expect(findDuplicateStoryMapIds(base)).toEqual([]);
  });

  it("reports duplicates per entity kind in input order", () => {
    const input: GenerateUserStoryMapInput = {
      ...base,
      tasks: [...(base.tasks ?? []), { id: "TSK-01", activityId: "ACT-02", task: "重複タスク" }],
      testRequirements: [...(base.testRequirements ?? []), { ...(base.testRequirements ?? [])[0] }],
    };
    expect(findDuplicateStoryMapIds(input)).toEqual([
      { kind: "task", id: "TSK-01", count: 2 },
      { kind: "testRequirement", id: "TR-01", count: 2 },
    ]);
  });
});

describe("findMissingStoryMapNumbers / findPrefixMismatchStoryMapIds", () => {
  it("detects gaps per entity kind", () => {
    const input: GenerateUserStoryMapInput = {
      ...base,
      stories: [
        { id: "US-01", taskId: "TSK-01", story: "s1" },
        { id: "US-03", taskId: "TSK-02", story: "s3" },
      ],
    };
    expect(findMissingStoryMapNumbers(input)).toEqual([
      { kind: "story", id: "US-02", expectedPrefix: "US-" },
    ]);
  });

  it("detects prefix mismatches and honours custom prefixes", () => {
    const input: GenerateUserStoryMapInput = {
      ...base,
      stories: [{ id: "STORY-01", taskId: "TSK-01", story: "s1" }],
    };
    expect(findPrefixMismatchStoryMapIds(input)).toEqual([
      { kind: "story", id: "STORY-01", expectedPrefix: "US-" },
    ]);
    expect(findPrefixMismatchStoryMapIds({ ...input, idPrefixes: { story: "STORY-" } })).toEqual([]);
  });
});

describe("findUnresolvedStoryMapRefs", () => {
  it("returns an empty array when every hierarchy reference resolves", () => {
    expect(findUnresolvedStoryMapRefs(base)).toEqual([]);
  });

  it("reports unresolved persona / activity / task / story references", () => {
    const input: GenerateUserStoryMapInput = {
      ...base,
      activities: [
        { id: "ACT-01", personaIds: ["P-999"], productGoal: "g", activity: "入場する" },
      ],
      tasks: [{ id: "TSK-01", activityId: "ACT-99", task: "QRをかざす" }],
      stories: [{ id: "US-01", taskId: "TSK-99", story: "s1", personaIds: ["P-888"] }],
      testRequirements: [
        {
          id: "TR-01",
          personaId: "P-777",
          storyIds: ["US-99"],
          before: "b",
          after: "a",
          testRequirement: "t",
        },
      ],
    };
    expect(findUnresolvedStoryMapRefs(input)).toEqual([
      { ownerId: "ACT-01", ref: "P-999", expectedKind: "personas[].id" },
      { ownerId: "TSK-01", ref: "ACT-99", expectedKind: "activities[].id" },
      { ownerId: "US-01", ref: "TSK-99", expectedKind: "tasks[].id" },
      { ownerId: "US-01", ref: "P-888", expectedKind: "personas[].id" },
      { ownerId: "TR-01", ref: "P-777", expectedKind: "personas[].id" },
      { ownerId: "TR-01", ref: "US-99", expectedKind: "stories[].id" },
    ]);
  });
});

describe("findPersonasWithoutStories", () => {
  it("links personas through the parent activity", () => {
    expect(findPersonasWithoutStories(base)).toEqual(["P-002"]);
  });

  it("links personas declared directly on the story", () => {
    const input: GenerateUserStoryMapInput = {
      ...base,
      stories: [
        { id: "US-01", taskId: "TSK-01", story: "s1", personaIds: ["P-002"] },
        { id: "US-02", taskId: "TSK-02", story: "s2" },
      ],
    };
    expect(findPersonasWithoutStories(input)).toEqual([]);
  });

  it("returns every persona when there are no stories at all", () => {
    expect(findPersonasWithoutStories({ personas: base.personas })).toEqual(["P-001", "P-002"]);
  });
});

describe("findPersonasWithoutTestRequirements", () => {
  it("lists personas with zero test requirements in input order", () => {
    expect(findPersonasWithoutTestRequirements(base)).toEqual(["P-002"]);
    expect(findPersonasWithoutTestRequirements({ personas: base.personas })).toEqual([
      "P-001",
      "P-002",
    ]);
  });
});

describe("findIncompleteTestRequirementRows", () => {
  it("returns an empty array when all three columns are filled", () => {
    expect(findIncompleteTestRequirementRows(base)).toEqual([]);
  });

  it("lists rows whose before / after / test requirement columns are blank", () => {
    const input: GenerateUserStoryMapInput = {
      ...base,
      testRequirements: [
        { id: "TR-01", personaId: "P-001", before: "  ", after: "a", testRequirement: "t" },
        { id: "TR-02", personaId: "P-002", before: "b", after: "", testRequirement: "   " },
      ],
    };
    expect(findIncompleteTestRequirementRows(input)).toEqual([
      { id: "TR-01", missingFields: ["現状(Before)"] },
      { id: "TR-02", missingFields: ["将来(After)", "テスト要求"] },
    ]);
  });
});

describe("findUnusedDomainAnalysisAspects / findUnknownDomainAnalysisAspectIds", () => {
  it("lists every frame aspect when domainAnalysis is omitted", () => {
    expect(findUnusedDomainAnalysisAspects(base).map((a) => a.id)).toEqual(
      personaJourneyFrame.domainAnalysisAspects.map((a) => a.id)
    );
  });

  it("treats blank findings as unused and unknown ids separately", () => {
    const input: GenerateUserStoryMapInput = {
      ...base,
      domainAnalysis: [
        { aspectId: "DOM-01", findings: ["入場券とアトラクション利用料が主な収益"] },
        { aspectId: "DOM-02", findings: ["  "] },
        { aspectId: "DOM-99", findings: ["未知の観点"] },
      ],
    };
    const unusedIds = findUnusedDomainAnalysisAspects(input).map((a) => a.id);
    expect(unusedIds).not.toContain("DOM-01");
    expect(unusedIds).toContain("DOM-02");
    expect(findUnknownDomainAnalysisAspectIds(input)).toEqual(["DOM-99"]);
  });
});

describe("purity of the user story map analysis functions", () => {
  it("does not mutate the input", () => {
    const snapshot = JSON.stringify(base);
    findDuplicateStoryMapIds(base);
    findMissingStoryMapNumbers(base);
    findPrefixMismatchStoryMapIds(base);
    findUnresolvedStoryMapRefs(base);
    findPersonasWithoutStories(base);
    findPersonasWithoutTestRequirements(base);
    findIncompleteTestRequirementRows(base);
    findUnusedDomainAnalysisAspects(base);
    findUnknownDomainAnalysisAspectIds(base);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
