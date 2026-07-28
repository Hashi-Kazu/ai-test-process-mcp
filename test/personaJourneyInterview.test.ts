import { describe, expect, it } from "vitest";
import {
  buildPersonaJourneyInterviewPrompt,
  personaJourneyInterviewTopics,
} from "../src/prompts/personaJourneyInterview.js";
import { generateUserStoryMapInputShape } from "../src/tools/generateUserStoryMap.js";
import { registerPrompts } from "../src/prompts/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("buildPersonaJourneyInterviewPrompt", () => {
  it("includes the subject name in brackets when provided", () => {
    const text = buildPersonaJourneyInterviewPrompt(
      personaJourneyInterviewTopics,
      "園内チケットシステム"
    );
    expect(text).toContain("「園内チケットシステム」");
  });

  it("uses 対象システム when no subject name is provided", () => {
    expect(buildPersonaJourneyInterviewPrompt()).toContain("対象システム");
  });

  it("references generate_user_story_map", () => {
    const text = buildPersonaJourneyInterviewPrompt();
    expect(text).toContain("generate_user_story_map");
    expect(text).toContain('extract_test_conditions の source="stakeholder"');
  });

  it("has 9 topics with unique PJ-xx ids", () => {
    expect(personaJourneyInterviewTopics).toHaveLength(9);
    const seen = new Set<string>();
    for (const topic of personaJourneyInterviewTopics) {
      expect(topic.id).toMatch(/^PJ-\d{2}$/);
      expect(seen.has(topic.id)).toBe(false);
      seen.add(topic.id);
    }
  });

  it("includes every topic title and collectTo hint", () => {
    const text = buildPersonaJourneyInterviewPrompt();
    for (const topic of personaJourneyInterviewTopics) {
      expect(text).toContain(topic.titleJa);
      expect(text).toContain(`（収集先: ${topic.collectTo}）`);
    }
  });

  it("marks required topics with a star-prefixed line", () => {
    const lines = buildPersonaJourneyInterviewPrompt().split("\n");
    for (const topic of personaJourneyInterviewTopics.filter((t) => t.required)) {
      const line = lines.find((l) => l.includes(`[${topic.titleJa}]`));
      expect(line).toBeDefined();
      expect(line!.trimStart().startsWith("★")).toBe(true);
    }
  });

  it("collects the four persona quadrants and the before/after test requirements", () => {
    const collectTargets = personaJourneyInterviewTopics.map((t) => t.collectTo).join("\n");
    expect(collectTargets).toContain("personas[].demographics");
    expect(collectTargets).toContain("personas[].saysAndThinks");
    expect(collectTargets).toContain("personas[].goals");
    expect(collectTargets).toContain("personas[].painPoints");
    expect(collectTargets).toContain("testRequirements");
  });

  it("keeps every collectTo consistent with the generate_user_story_map input keys", () => {
    const knownKeys = new Set(Object.keys(generateUserStoryMapInputShape));
    for (const topic of personaJourneyInterviewTopics) {
      for (const part of topic.collectTo.split(" / ")) {
        const before = part.split(/[[.（]/)[0].trim();
        expect(knownKeys.has(before)).toBe(true);
      }
    }
  });

  it("orders the flow from domain analysis to test requirements", () => {
    const text = buildPersonaJourneyInterviewPrompt();
    expect(text).toContain(
      "ドメイン分析 → ペルソナ立案（4象限） → プロダクトゴール → アクティビティ・タスク → ユーザーストーリー → テスト要求 の順に進める。"
    );
  });

  it("registers the persona_journey_interview prompt", () => {
    const registeredNames: string[] = [];
    const stub = {
      registerPrompt: (name: string, _config: unknown, _handler: unknown) => {
        registeredNames.push(name);
      },
    };
    registerPrompts(stub as unknown as McpServer);
    expect(registeredNames).toContain("persona_journey_interview");
  });
});
