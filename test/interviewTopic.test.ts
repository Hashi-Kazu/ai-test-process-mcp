import { describe, expect, it } from "vitest";
import {
  buildInterviewPromptText,
  extractCollectToRootKeys,
  type InterviewTopic,
} from "../src/prompts/interviewTopic.js";

const topics: InterviewTopic[] = [
  {
    id: "XX-01",
    titleJa: "必須トピック",
    required: true,
    guidance: "必須の説明。",
    collectTo: "alpha",
  },
  {
    id: "XX-02",
    titleJa: "任意トピック",
    required: false,
    guidance: "任意の説明。",
    collectTo: "beta[].gamma / delta",
  },
];

describe("extractCollectToRootKeys", () => {
  it("returns the key itself for a plain key", () => {
    expect(extractCollectToRootKeys("requirementIds")).toEqual(["requirementIds"]);
  });

  it("strips array element notation", () => {
    expect(extractCollectToRootKeys("testConditions[].source")).toEqual(["testConditions"]);
  });

  it("strips dotted sub-key notation", () => {
    expect(extractCollectToRootKeys("scope.inScope")).toEqual(["scope"]);
  });

  it("strips a full-width parenthesised note", () => {
    expect(
      extractCollectToRootKeys("additionalCoverageTargets（ペアワイズの網羅対象として宣言）")
    ).toEqual(["additionalCoverageTargets"]);
  });

  it("splits multiple keys on ' / '", () => {
    expect(extractCollectToRootKeys("a[].b / c.d / e")).toEqual(["a", "c", "e"]);
  });

  it("returns no key for the no-key marker", () => {
    expect(extractCollectToRootKeys("(専用の入力キーなし。documents に添える)")).toEqual([]);
  });

  it("keeps real keys while dropping the no-key marker", () => {
    expect(extractCollectToRootKeys("documents / (専用の入力キーなし。補足)")).toEqual([
      "documents",
    ]);
  });
});

describe("buildInterviewPromptText", () => {
  const baseSpec = { toolName: "dummy_tool", roleJa: "ダミー", topics };

  it("includes the subject name in brackets when provided", () => {
    const text = buildInterviewPromptText({ ...baseSpec, subjectName: "チケット販売システム" });
    expect(text).toContain("「チケット販売システム」");
    expect(text).not.toContain("対象システムについて");
  });

  it("uses 対象システム when no subject name is provided", () => {
    const text = buildInterviewPromptText(baseSpec);
    expect(text).toContain("対象システム");
  });

  it("treats a blank subject name as absent", () => {
    const text = buildInterviewPromptText({ ...baseSpec, subjectName: "   " });
    expect(text).toContain("対象システム");
  });

  it("renders required topics with ★ and optional topics with ・", () => {
    const lines = buildInterviewPromptText(baseSpec).split("\n");
    expect(lines.find((l) => l.includes("[必須トピック]"))!.startsWith("★")).toBe(true);
    expect(lines.find((l) => l.includes("[任意トピック]"))!.startsWith("・")).toBe(true);
  });

  it("renders the collectTo hint for every topic", () => {
    const text = buildInterviewPromptText(baseSpec);
    for (const topic of topics) {
      expect(text).toContain(`   （収集先: ${topic.collectTo}）`);
    }
  });

  it("places extraProcedureLines right after 進め方: and before the default lines", () => {
    const lines = buildInterviewPromptText({
      ...baseSpec,
      extraProcedureLines: ["- 追加の進め方。"],
    }).split("\n");
    const headerIndex = lines.indexOf("進め方:");
    const extraIndex = lines.indexOf("- 追加の進め方。");
    const defaultIndex = lines.indexOf("- 必須(★)の項目を優先し、一度に多く聞きすぎない。");
    expect(headerIndex).toBeGreaterThanOrEqual(0);
    expect(extraIndex).toBe(headerIndex + 1);
    expect(defaultIndex).toBe(extraIndex + 1);
  });

  it("appends extraClosingText to the closing line", () => {
    const text = buildInterviewPromptText({ ...baseSpec, extraClosingText: "追加の締め文。" });
    const lastLine = text.split("\n").at(-1)!;
    expect(lastLine).toBe(
      "上記の質問が終わったら、収集した回答を dummy_tool ツールの引数にマッピングして呼び出してください。追加の締め文。"
    );
  });

  it("omits the extra closing text when not provided", () => {
    const text = buildInterviewPromptText(baseSpec);
    expect(text.split("\n").at(-1)).toBe(
      "上記の質問が終わったら、収集した回答を dummy_tool ツールの引数にマッピングして呼び出してください。"
    );
  });

  it("is deterministic for the same input", () => {
    const spec = {
      ...baseSpec,
      subjectName: "X",
      extraProcedureLines: ["- 追加の進め方。"],
      extraClosingText: "追加の締め文。",
    };
    expect(buildInterviewPromptText(spec)).toBe(buildInterviewPromptText(spec));
  });
});
