import { describe, expect, it } from "vitest";
import {
  buildTestDesignInterviewPrompt,
  testDesignInterviewTopics,
} from "../src/prompts/testDesignInterview.js";

describe("buildTestDesignInterviewPrompt", () => {
  it("includes the subject name in brackets when provided", () => {
    const text = buildTestDesignInterviewPrompt(testDesignInterviewTopics, "チケット販売システム");
    expect(text).toContain("「チケット販売システム」");
  });

  it("uses 対象システム when no subject name is provided", () => {
    const text = buildTestDesignInterviewPrompt(testDesignInterviewTopics);
    expect(text).toContain("対象システム");
  });

  it("references generate_test_cases", () => {
    const text = buildTestDesignInterviewPrompt();
    expect(text).toContain("generate_test_cases");
  });

  it("has 10 topics", () => {
    expect(testDesignInterviewTopics).toHaveLength(10);
  });

  it("includes every topic title and collectTo hint", () => {
    const text = buildTestDesignInterviewPrompt();
    for (const topic of testDesignInterviewTopics) {
      expect(text).toContain(topic.titleJa);
      expect(text).toContain(`（収集先: ${topic.collectTo}）`);
    }
  });

  it("marks required topics with a star-prefixed line", () => {
    const text = buildTestDesignInterviewPrompt();
    const lines = text.split("\n");
    for (const topic of testDesignInterviewTopics.filter((t) => t.required)) {
      const line = lines.find((l) => l.includes(topic.titleJa));
      expect(line).toBeDefined();
      expect(line!.trimStart().startsWith("★")).toBe(true);
    }
  });
});
