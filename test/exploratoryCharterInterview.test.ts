import { describe, expect, it } from "vitest";
import {
  buildExploratoryCharterInterviewPrompt,
  exploratoryCharterInterviewTopics,
} from "../src/prompts/exploratoryCharterInterview.js";
import { generateExploratoryChartersInputShape } from "../src/tools/generateExploratoryCharters.js";
import { registerPrompts } from "../src/prompts/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("buildExploratoryCharterInterviewPrompt", () => {
  it("includes the subject name in brackets when provided", () => {
    const text = buildExploratoryCharterInterviewPrompt(
      exploratoryCharterInterviewTopics,
      "チケット販売システム"
    );
    expect(text).toContain("「チケット販売システム」");
  });

  it("uses 対象システム when no subject name is provided", () => {
    const text = buildExploratoryCharterInterviewPrompt(exploratoryCharterInterviewTopics);
    expect(text).toContain("対象システム");
  });

  it("references generate_exploratory_charters", () => {
    const text = buildExploratoryCharterInterviewPrompt();
    expect(text).toContain("generate_exploratory_charters");
  });

  it("has 8 topics with unique EXC-xx ids", () => {
    expect(exploratoryCharterInterviewTopics).toHaveLength(8);
    const seen = new Set<string>();
    for (const topic of exploratoryCharterInterviewTopics) {
      expect(topic.id).toMatch(/^EXC-\d{2}$/);
      expect(seen.has(topic.id)).toBe(false);
      seen.add(topic.id);
    }
  });

  it("includes every topic title and collectTo hint", () => {
    const text = buildExploratoryCharterInterviewPrompt();
    for (const topic of exploratoryCharterInterviewTopics) {
      expect(text).toContain(topic.titleJa);
      expect(text).toContain(`（収集先: ${topic.collectTo}）`);
    }
  });

  it("marks required topics with a star-prefixed line", () => {
    const text = buildExploratoryCharterInterviewPrompt();
    const lines = text.split("\n");
    for (const topic of exploratoryCharterInterviewTopics.filter((t) => t.required)) {
      const line = lines.find((l) => l.includes(topic.titleJa));
      expect(line).toBeDefined();
      expect(line!.trimStart().startsWith("★")).toBe(true);
    }
  });

  it("marks non-required topics with a dot-prefixed line", () => {
    const text = buildExploratoryCharterInterviewPrompt();
    const lines = text.split("\n");
    for (const topic of exploratoryCharterInterviewTopics.filter((t) => !t.required)) {
      const line = lines.find((l) => l.includes(topic.titleJa));
      expect(line).toBeDefined();
      expect(line!.trimStart().startsWith("・")).toBe(true);
    }
  });

  it("keeps every collectTo consistent with the generate_exploratory_charters input keys", () => {
    const knownKeys = new Set(Object.keys(generateExploratoryChartersInputShape));
    for (const topic of exploratoryCharterInterviewTopics) {
      const parts = topic.collectTo.split(" / ");
      for (const part of parts) {
        const before = part.split(/[[.]/)[0];
        expect(knownKeys.has(before)).toBe(true);
      }
    }
  });

  it("registers the exploratory_charter_interview prompt", () => {
    const registeredNames: string[] = [];
    const stub = {
      registerPrompt: (name: string, _config: unknown, _handler: unknown) => {
        registeredNames.push(name);
      },
    };
    registerPrompts(stub as unknown as McpServer);
    expect(registeredNames).toContain("exploratory_charter_interview");
  });
});
