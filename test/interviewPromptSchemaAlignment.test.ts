import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerPrompts } from "../src/prompts/index.js";
import {
  COLLECT_TO_NO_KEY_PREFIX,
  extractCollectToRootKeys,
  type InterviewTopic,
} from "../src/prompts/interviewTopic.js";

import { buildInterviewPrompt } from "../src/prompts/testPlanInterview.js";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";
import {
  buildRequirementsInterviewPrompt,
  requirementsInterviewTopics,
} from "../src/prompts/requirementsAnalysisInterview.js";
import {
  buildTestDesignInterviewPrompt,
  testDesignInterviewTopics,
} from "../src/prompts/testDesignInterview.js";
import {
  buildExploratoryCharterInterviewPrompt,
  exploratoryCharterInterviewTopics,
} from "../src/prompts/exploratoryCharterInterview.js";
import {
  buildPersonaJourneyInterviewPrompt,
  personaJourneyInterviewTopics,
} from "../src/prompts/personaJourneyInterview.js";
import {
  buildTestConditionInterviewPrompt,
  testConditionInterviewTopics,
} from "../src/prompts/testConditionInterview.js";
import {
  buildTestArchitectureInterviewPrompt,
  testArchitectureInterviewTopics,
} from "../src/prompts/testArchitectureInterview.js";
import {
  buildScenarioFlowInterviewPrompt,
  scenarioFlowInterviewTopics,
} from "../src/prompts/scenarioFlowInterview.js";
import {
  buildTestSpecificationReviewInterviewPrompt,
  testSpecificationReviewInterviewTopics,
} from "../src/prompts/testSpecificationReviewInterview.js";
import {
  buildIdPopulationAuditInterviewPrompt,
  idPopulationAuditInterviewTopics,
} from "../src/prompts/idPopulationAuditInterview.js";
import {
  buildThresholdChangeInterviewPrompt,
  thresholdChangeInterviewTopics,
} from "../src/prompts/thresholdChangeInterview.js";
import {
  buildDataFlowTimingInterviewPrompt,
  dataFlowTimingInterviewTopics,
} from "../src/prompts/dataFlowTimingInterview.js";

import { generateTestPlanInputShape } from "../src/tools/generateTestPlan.js";
import { analyzeRequirementsInputShape } from "../src/tools/analyzeRequirements.js";
import { generateTestCasesInputShape } from "../src/tools/generateTestCases.js";
import { generateExploratoryChartersInputShape } from "../src/tools/generateExploratoryCharters.js";
import { generateUserStoryMapInputShape } from "../src/tools/generateUserStoryMap.js";
import { extractTestConditionsInputShape } from "../src/tools/extractTestConditions.js";
import { designTestArchitectureInputShape } from "../src/tools/designTestArchitecture.js";
import { designScenarioFlowsInputShape } from "../src/tools/designScenarioFlows.js";
import { reviewTestSpecificationInputShape } from "../src/tools/reviewTestSpecification.js";
import { auditIdPopulationInputShape } from "../src/tools/auditIdPopulation.js";
import { reexpandThresholdChangesInputShape } from "../src/tools/reexpandThresholdChanges.js";
import { analyzeDataFlowTimingInputShape } from "../src/tools/analyzeDataFlowTiming.js";

type Entry = {
  promptName: string;
  toolName: string;
  inputShape: Record<string, z.ZodTypeAny>;
  build: (subjectName?: string) => string;
  /** テンプレート駆動の test_plan_interview だけ null */
  topics: readonly InterviewTopic[] | null;
  idPattern: RegExp | null;
  topicCount: number | null;
};

const entries: Entry[] = [
  {
    promptName: "test_plan_interview",
    toolName: "create_test_plan",
    inputShape: generateTestPlanInputShape,
    build: (subjectName) => buildInterviewPrompt(testPlanTemplate, subjectName),
    topics: null,
    idPattern: null,
    topicCount: null,
  },
  {
    promptName: "requirements_analysis_interview",
    toolName: "analyze_requirements",
    inputShape: analyzeRequirementsInputShape,
    build: (subjectName) => buildRequirementsInterviewPrompt(requirementsInterviewTopics, subjectName),
    topics: requirementsInterviewTopics,
    idPattern: /^RI-\d{2}$/,
    topicCount: 8,
  },
  {
    promptName: "test_design_interview",
    toolName: "generate_test_cases",
    inputShape: generateTestCasesInputShape,
    build: (subjectName) => buildTestDesignInterviewPrompt(testDesignInterviewTopics, subjectName),
    topics: testDesignInterviewTopics,
    idPattern: /^TD-\d{2}$/,
    topicCount: 10,
  },
  {
    promptName: "exploratory_charter_interview",
    toolName: "generate_exploratory_charters",
    inputShape: generateExploratoryChartersInputShape,
    build: (subjectName) =>
      buildExploratoryCharterInterviewPrompt(exploratoryCharterInterviewTopics, subjectName),
    topics: exploratoryCharterInterviewTopics,
    idPattern: /^EXC-\d{2}$/,
    topicCount: 8,
  },
  {
    promptName: "persona_journey_interview",
    toolName: "generate_user_story_map",
    inputShape: generateUserStoryMapInputShape,
    build: (subjectName) =>
      buildPersonaJourneyInterviewPrompt(personaJourneyInterviewTopics, subjectName),
    topics: personaJourneyInterviewTopics,
    idPattern: /^PJ-\d{2}$/,
    topicCount: 9,
  },
  {
    promptName: "test_condition_interview",
    toolName: "extract_test_conditions",
    inputShape: extractTestConditionsInputShape,
    build: (subjectName) =>
      buildTestConditionInterviewPrompt(testConditionInterviewTopics, subjectName),
    topics: testConditionInterviewTopics,
    idPattern: /^TCI-\d{2}$/,
    topicCount: 13,
  },
  {
    promptName: "test_architecture_interview",
    toolName: "design_test_architecture",
    inputShape: designTestArchitectureInputShape,
    build: (subjectName) =>
      buildTestArchitectureInterviewPrompt(testArchitectureInterviewTopics, subjectName),
    topics: testArchitectureInterviewTopics,
    idPattern: /^TAI-\d{2}$/,
    topicCount: 10,
  },
  {
    promptName: "scenario_flow_interview",
    toolName: "design_scenario_flows",
    inputShape: designScenarioFlowsInputShape,
    build: (subjectName) => buildScenarioFlowInterviewPrompt(scenarioFlowInterviewTopics, subjectName),
    topics: scenarioFlowInterviewTopics,
    idPattern: /^SFI-\d{2}$/,
    topicCount: 10,
  },
  {
    promptName: "test_specification_review_interview",
    toolName: "review_test_specification",
    inputShape: reviewTestSpecificationInputShape,
    build: (subjectName) =>
      buildTestSpecificationReviewInterviewPrompt(
        testSpecificationReviewInterviewTopics,
        subjectName
      ),
    topics: testSpecificationReviewInterviewTopics,
    idPattern: /^TSR-\d{2}$/,
    topicCount: 8,
  },
  {
    promptName: "id_population_audit_interview",
    toolName: "audit_id_population",
    inputShape: auditIdPopulationInputShape,
    build: (subjectName) =>
      buildIdPopulationAuditInterviewPrompt(idPopulationAuditInterviewTopics, subjectName),
    topics: idPopulationAuditInterviewTopics,
    idPattern: /^IPA-\d{2}$/,
    topicCount: 8,
  },
  {
    promptName: "threshold_change_interview",
    toolName: "reexpand_threshold_changes",
    inputShape: reexpandThresholdChangesInputShape,
    build: (subjectName) =>
      buildThresholdChangeInterviewPrompt(thresholdChangeInterviewTopics, subjectName),
    topics: thresholdChangeInterviewTopics,
    idPattern: /^TCH-\d{2}$/,
    topicCount: 9,
  },
  {
    promptName: "data_flow_timing_interview",
    toolName: "analyze_data_flow_timing",
    inputShape: analyzeDataFlowTimingInputShape,
    build: (subjectName) =>
      buildDataFlowTimingInterviewPrompt(dataFlowTimingInterviewTopics, subjectName),
    topics: dataFlowTimingInterviewTopics,
    idPattern: /^DFT-\d{2}$/,
    topicCount: 10,
  },
];

/** zod スキーマの必須トップレベルキーを算出する（_def を直接読まない） */
function requiredInputKeys(inputShape: Record<string, z.ZodTypeAny>): string[] {
  return Object.entries(inputShape)
    .filter(([, schema]) => !schema.safeParse(undefined).success)
    .map(([key]) => key);
}

function requiredTopicRootKeys(topics: readonly InterviewTopic[]): Set<string> {
  const keys = new Set<string>();
  for (const topic of topics.filter((t) => t.required)) {
    for (const key of extractCollectToRootKeys(topic.collectTo)) keys.add(key);
  }
  return keys;
}

const topicEntries = entries.filter(
  (entry): entry is Entry & { topics: readonly InterviewTopic[]; idPattern: RegExp; topicCount: number } =>
    entry.topics !== null
);

describe("interview prompt inventory", () => {
  it("covers at least 12 interview prompts", () => {
    expect(entries.length).toBeGreaterThanOrEqual(12);
  });

  it("has no duplicated prompt name in the table", () => {
    const names = entries.map((e) => e.promptName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("registers every prompt exactly once via registerPrompts", () => {
    const registeredNames: string[] = [];
    const stub = {
      registerPrompt: (name: string, _config: unknown, _handler: unknown) => {
        registeredNames.push(name);
      },
    };
    registerPrompts(stub as unknown as McpServer);
    for (const entry of entries) {
      expect(registeredNames).toContain(entry.promptName);
    }
    expect(new Set(registeredNames).size).toBe(registeredNames.length);
    expect(registeredNames.length).toBeGreaterThanOrEqual(12);
  });
});

describe.each(topicEntries)("$promptName", (entry) => {
  it("collects only into keys that exist in the target tool input shape", () => {
    const knownKeys = new Set(Object.keys(entry.inputShape));
    for (const topic of entry.topics) {
      for (const key of extractCollectToRootKeys(topic.collectTo)) {
        expect(
          knownKeys.has(key),
          `${topic.id} collects into unknown key "${key}" of ${entry.toolName}`
        ).toBe(true);
      }
    }
  });

  it("covers every required input key of the target tool with a required topic", () => {
    const covered = requiredTopicRootKeys(entry.topics);
    for (const key of requiredInputKeys(entry.inputShape)) {
      expect(
        covered.has(key),
        `required key "${key}" of ${entry.toolName} is not collected by any required topic of ${entry.promptName}`
      ).toBe(true);
    }
  });

  it("marks a topic without a dedicated input key as optional", () => {
    for (const topic of entry.topics) {
      if (topic.collectTo.startsWith(COLLECT_TO_NO_KEY_PREFIX)) {
        expect(topic.required).toBe(false);
      }
    }
  });

  it("renders the subject name and the target tool name", () => {
    expect(entry.build("チケット販売システム")).toContain("「チケット販売システム」");
    expect(entry.build()).toContain("対象システム");
    expect(entry.build()).toContain(entry.toolName);
  });

  it("renders every topic title and collectTo hint", () => {
    const text = entry.build();
    for (const topic of entry.topics) {
      expect(text).toContain(topic.titleJa);
      expect(text).toContain(`（収集先: ${topic.collectTo}）`);
    }
  });

  it("prefixes required topics with ★ and optional topics with ・", () => {
    const lines = entry.build().split("\n");
    for (const topic of entry.topics) {
      const line = lines.find((l) => l.includes(`[${topic.titleJa}]`));
      expect(line, `no rendered line for ${topic.id}`).toBeDefined();
      expect(line!.startsWith(topic.required ? "★" : "・")).toBe(true);
    }
  });

  it("has the declared number of topics with unique well-formed ids", () => {
    expect(entry.topics).toHaveLength(entry.topicCount);
    const seen = new Set<string>();
    for (const topic of entry.topics) {
      expect(topic.id).toMatch(entry.idPattern);
      expect(seen.has(topic.id)).toBe(false);
      seen.add(topic.id);
    }
  });

  it("has non-empty guidance for every topic", () => {
    for (const topic of entry.topics) {
      expect(topic.guidance.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("test_plan_interview (template driven)", () => {
  const entry = entries.find((e) => e.promptName === "test_plan_interview")!;

  it("explicitly states the required create_test_plan inputs", () => {
    const text = entry.build();
    expect(requiredInputKeys(entry.inputShape)).toEqual(["projectName", "scope"]);
    expect(text).toContain("projectName");
    expect(text).toContain("scope");
    expect(text).toContain("- projectName と scope は必須。最低限この2つは必ず確認する。");
  });
});
