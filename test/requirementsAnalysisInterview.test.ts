import { describe, expect, it } from "vitest";
import {
  buildRequirementsInterviewPrompt,
  requirementsInterviewTopics,
} from "../src/prompts/requirementsAnalysisInterview.js";

describe("buildRequirementsInterviewPrompt", () => {
  it("includes the subject name in brackets when provided", () => {
    const text = buildRequirementsInterviewPrompt(requirementsInterviewTopics, "チケット販売システム");
    expect(text).toContain("「チケット販売システム」");
  });

  it("uses 対象システム when no subject name is provided", () => {
    const text = buildRequirementsInterviewPrompt(requirementsInterviewTopics);
    expect(text).toContain("対象システム");
  });

  it("references analyze_requirements", () => {
    const text = buildRequirementsInterviewPrompt();
    expect(text).toContain("analyze_requirements");
  });

  it("includes every topic title and collectTo hint", () => {
    const text = buildRequirementsInterviewPrompt();
    for (const topic of requirementsInterviewTopics) {
      expect(text).toContain(topic.titleJa);
      expect(text).toContain(`（収集先: ${topic.collectTo}）`);
    }
  });

  it("marks required topics with a star-prefixed line", () => {
    const text = buildRequirementsInterviewPrompt();
    const lines = text.split("\n");
    for (const topic of requirementsInterviewTopics.filter((t) => t.required)) {
      const line = lines.find((l) => l.includes(topic.titleJa));
      expect(line).toBeDefined();
      expect(line!.trimStart().startsWith("★")).toBe(true);
    }
  });
});
