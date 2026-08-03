import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderUserStoryMap } from "../src/tools/generateUserStoryMap.js";
import { personaJourneyFrame } from "../src/resources/personaJourneyFrame.js";
import type { GenerateUserStoryMapInput } from "../src/types.js";

const SECTION_HEADINGS = [
  "## 1. 前提と対象",
  "## 2. ドメイン分析",
  "## 3. ペルソナ4象限シート",
  "## 4. ユーザーストーリーマップ（ペルソナ→プロダクトゴール→アクティビティ→タスク→ユーザーストーリー）",
  "## 5. テスト要求導出表（現状(Before)/将来(After)/テスト要求）",
  "## 6. 決定的検査(自動)",
  "## 7. 意味的層の指示",
  "## 8. extract_test_conditions への引き渡し",
];

const input: GenerateUserStoryMapInput = {
  subjectName: "園内チケットシステム",
  domainAnalysis: [
    { aspectId: "DOM-01", findings: ["入場券とアトラクション利用料が主な収益源"] },
    { aspectId: "DOM-99", findings: ["フレームに無い観点"] },
  ],
  personas: [
    {
      id: "P-001",
      role: "来園者",
      name: "田中",
      demographics: ["30代", "会社員"],
      saysAndThinks: ["列に並ぶ時間がもったいない"],
      goals: ["待たずに入場したい"],
      painPoints: ["当日券の列が長い"],
    },
    { id: "P-002", role: "運用担当", concerns: "障害時の切り替え手順|が煩雑" },
  ],
  activities: [
    { id: "ACT-01", personaIds: ["P-001"], productGoal: "待たずに入場できる", activity: "入場する" },
    { id: "ACT-02", personaIds: ["P-001"], productGoal: "待たずに入場できる", activity: "チケットを買う" },
  ],
  tasks: [
    { id: "TSK-01", activityId: "ACT-01", task: "QRをかざす" },
    { id: "TSK-02", activityId: "ACT-99", task: "親アクティビティが未解決のタスク" },
  ],
  stories: [
    { id: "US-01", taskId: "TSK-01", story: "来園者としてQRをかざして入場したい", priority: "高" },
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
    {
      id: "TR-02",
      personaId: "P-999",
      before: "手順書を探していた",
      after: "",
      testRequirement: "   ",
    },
  ],
};

const markdown = renderUserStoryMap(input);

describe("renderUserStoryMap", () => {
  it("renders the top-level heading exactly once", () => {
    expect(markdown.split("\n").filter((l) => l === "# 利用状況モデリング結果")).toHaveLength(1);
  });

  it("renders all sections from 1 to 8 exactly once each", () => {
    for (const heading of SECTION_HEADINGS) {
      expect(markdown.split("\n").filter((l) => l === heading)).toHaveLength(1);
    }
  });

  it("renders every 6.x deterministic check subsection", () => {
    for (const heading of [
      "### 6.1 IDの重複・欠番・プレフィックス不一致",
      "### 6.2 階層参照の未解決",
      "### 6.3 ストーリー未紐づけペルソナ",
      "### 6.4 テスト要求0件ペルソナ",
      "### 6.5 ペルソナ4象限の記入状況",
      "### 6.6 テスト要求行の欠落",
      "### 6.7 ドメイン分析観点の被覆状況",
      "### 6.8 サマリ",
    ]) {
      expect(markdown.split("\n").filter((l) => l === heading)).toHaveLength(1);
    }
  });

  it("shows the subject name and the review mode in section 1", () => {
    const section = markdown.split("## 1. 前提と対象")[1].split("## 2.")[0];
    expect(section).toContain("園内チケットシステム");
    expect(section).toContain("モード: 既存成果物のレビュー");
    expect(section).toContain("ACT-");
    expect(section).toContain(personaJourneyFrame.name);
  });

  it("renders the domain analysis table with every frame aspect and flags unknown aspect ids", () => {
    const section = markdown.split("## 2. ドメイン分析")[1].split("## 3.")[0];
    expect(section).toContain("| 観点ID | 観点 | 概要 | 把握した事実 | 状態 |");
    for (const aspect of personaJourneyFrame.domainAnalysisAspects) {
      expect(section).toContain(aspect.id);
    }
    expect(section).toContain("入場券とアトラクション利用料が主な収益源");
    expect(section).toContain("「DOM-99」はフレームに存在しないドメイン分析観点IDである");
  });

  it("renders the persona quadrant sheet with the legacy concerns fallback", () => {
    const section = markdown.split("## 3. ペルソナ4象限シート")[1].split("## 4.")[0];
    expect(section).toContain("| ペルソナID | 役割 | 氏名 | 属性 | 発言・思考 | 目標 | 不満点 |");
    expect(section).toContain("30代; 会社員");
    expect(section).toContain("障害時の切り替え手順\\|が煩雑");
    expect(section).toContain("未記入(要確認)");
  });

  it("renders the 5-level story map table including the level definitions", () => {
    const section = markdown.split("## 4. ユーザーストーリーマップ")[1].split("## 5.")[0];
    expect(section).toContain("| 階層ID | 階層 | 定義 | 粒度の目安 |");
    for (const level of personaJourneyFrame.storyMapLevels) {
      expect(section).toContain(`| ${level.id} |`);
    }
    expect(section).toContain(
      "| ペルソナID | プロダクトゴール | アクティビティ | タスク | ユーザーストーリー | 優先度 |"
    );
    expect(section).toContain("| P-001 | 待たずに入場できる | ACT-01 入場する | TSK-01 QRをかざす | US-01 来園者としてQRをかざして入場したい | 高 |");
    expect(section).toContain("ACT-02 チケットを買う");
    expect(section).toContain("ACT-99(未解決)");
  });

  it("renders the before/after/test requirement table with unfilled cells marked", () => {
    const section = markdown.split("## 5. テスト要求導出表")[1].split("## 6.")[0];
    expect(section).toContain(
      "| テスト要求ID | ペルソナID | 関連ストーリーID | 現状(Before) | 将来(After) | テスト要求 |"
    );
    expect(section).toContain("当日券の列に20分並んでいた");
    const row = section.split("\n").find((l) => l.startsWith("| TR-02 |"));
    expect(row).toContain("未記入(要確認)");
  });

  it("lists unresolved hierarchy references under 6.2", () => {
    const section = markdown.split("### 6.2 階層参照の未解決")[1].split("### 6.3")[0];
    expect(section).toContain("| TSK-02 | ACT-99 | activities[].id |");
    expect(section).toContain("| TR-02 | P-999 | personas[].id |");
  });

  it("lists personas without stories and without test requirements", () => {
    const storySection = markdown.split("### 6.3 ストーリー未紐づけペルソナ")[1].split("### 6.4")[0];
    expect(storySection).toContain("[high] P-002");
    expect(storySection).not.toContain("P-001");

    const requirementSection = markdown.split("### 6.4 テスト要求0件ペルソナ")[1].split("### 6.5")[0];
    expect(requirementSection).toContain("[high] P-002");
  });

  it("lists missing persona quadrants under 6.5 and incomplete requirement rows under 6.6", () => {
    const quadrantSection = markdown.split("### 6.5 ペルソナ4象限の記入状況")[1].split("### 6.6")[0];
    expect(quadrantSection).toContain("[medium] P-002: 未記入の象限 属性, 発言・思考, 目標。");
    expect(quadrantSection).toContain("persona_journey_interview");

    const rowSection = markdown.split("### 6.6 テスト要求行の欠落")[1].split("### 6.7")[0];
    expect(rowSection).toContain("[high] TR-02: 未記入の列 将来(After), テスト要求。");
    expect(rowSection).not.toContain("TR-01");
  });

  it("includes the counters in the 6.8 summary", () => {
    const summaryLine = markdown.split("\n").find((l) => l.startsWith("- ペルソナ数:"));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toContain("未解決参照数: 2");
    expect(summaryLine).toContain("テスト要求欠落行数: 1");
    expect(summaryLine).toContain("4象限未記入ペルソナ数: 1");
  });

  it("emits the semantic-layer question examples of the frame in section 7", () => {
    const section = markdown.split("## 7. 意味的層の指示")[1].split("## 8.")[0];
    for (const aspect of personaJourneyFrame.domainAnalysisAspects) {
      expect(section).toContain(aspect.questionExamples[0]);
    }
    for (const quadrant of personaJourneyFrame.personaQuadrants) {
      expect(section).toContain(quadrant.questionExamples[0]);
      expect(section).toContain(quadrant.badExamples[0]);
    }
    for (const level of personaJourneyFrame.storyMapLevels) {
      expect(section).toContain(level.granularityGuidance);
    }
  });

  it("maps test requirements onto stakeholder-sourced test conditions in section 8", () => {
    const section = markdown.split("## 8. extract_test_conditions への引き渡し")[1];
    for (const rule of personaJourneyFrame.testRequirementFrame.handoverConvention) {
      expect(section).toContain(rule);
    }
    expect(section).toContain(
      "| テスト要求ID | 由来ペルソナID | source | derivedFrom | 関連ストーリーID | 展開すべき確認内容 |"
    );
    expect(section).toContain("| TR-01 | P-001 | stakeholder | P-001 | US-01 |");
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(input);
    expect(renderUserStoryMap(input)).toBe(markdown);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("renderUserStoryMap in generation-instruction-only mode", () => {
  const minimal: GenerateUserStoryMapInput = {
    personas: [{ id: "P-001", role: "来園者" }],
  };
  const md = renderUserStoryMap(minimal);

  it("keeps the full chapter skeleton", () => {
    for (const heading of SECTION_HEADINGS) {
      expect(md).toContain(heading);
    }
  });

  it("declares the generation-instruction-only mode in section 1", () => {
    expect(md).toContain("モード: 生成指示のみ");
  });

  it("returns generation instructions instead of the story map and test requirement tables", () => {
    const mapSection = md.split("## 4. ユーザーストーリーマップ")[1].split("## 5.")[0];
    expect(mapSection).toContain("アクティビティ・タスク・ユーザーストーリーが未指定である。");
    expect(mapSection).toContain("ACT-/TSK-/US-");
    expect(mapSection).not.toContain(
      "| ペルソナID | プロダクトゴール | アクティビティ | タスク | ユーザーストーリー | 優先度 |"
    );

    const requirementSection = md.split("## 5. テスト要求導出表")[1].split("## 6.")[0];
    expect(requirementSection).toContain("テスト要求が未指定である。");
    expect(requirementSection).toContain("TR- のIDで起こすこと。");

    const handoverSection = md.split("## 8. extract_test_conditions への引き渡し")[1];
    expect(handoverSection).toContain("テスト要求が未指定のため引き渡し表は空である。");
  });

  it("still reports the deterministic checks for the persona level", () => {
    const storySection = md.split("### 6.3 ストーリー未紐づけペルソナ")[1].split("### 6.4")[0];
    expect(storySection).toContain("[high] P-001");
    const quadrantSection = md.split("### 6.5 ペルソナ4象限の記入状況")[1].split("### 6.6")[0];
    expect(quadrantSection).toContain("未記入の象限 属性, 発言・思考, 目標, 不満点");
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(minimal);
    expect(renderUserStoryMap(minimal)).toBe(md);
    expect(JSON.stringify(minimal)).toBe(snapshot);
  });
});

describe("renderUserStoryMap 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderUserStoryMap(input));
  });
});
