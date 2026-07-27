import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// 質問形式で generate_exploratory_charters の入力を収集するためのプロンプト。
// testDesignInterview.ts と同型の実装（純関数 + register関数）。

export interface ExploratoryCharterInterviewTopic {
  id: string; // "EXC-01"
  titleJa: string;
  required: boolean;
  guidance: string;
  collectTo: string; // generate_exploratory_charters の入力キー
}

export const exploratoryCharterInterviewTopics: ExploratoryCharterInterviewTopic[] = [
  {
    id: "EXC-01",
    titleJa: "対象領域とテスト条件",
    required: true,
    guidance: "探索的に確認したい対象領域と、関連するテスト条件一覧(条件ID・対象・条件文・優先度・由来)を確認する。",
    collectTo: "testConditions",
  },
  {
    id: "EXC-02",
    titleJa: "既存テストケースで薄い箇所",
    required: true,
    guidance:
      "既存のテストケースでは確認しきれていない、または手薄になっている操作・確認内容を確認する。あわせて、境界値分析・同値分割等の決定的技法で既にテストケース化済みのテスト条件IDを確認し、探索的テストの未カバー検査から除外する。",
    collectTo: "charters[].mission / deterministicallyCoveredConditionIds",
  },
  {
    id: "EXC-03",
    titleJa: "過去障害・経験上の勘所",
    required: true,
    guidance: "過去に発生した障害や、経験上「怪しい」と感じる箇所をリスクとして確認する。",
    collectTo: "risks",
  },
  {
    id: "EXC-04",
    titleJa: "観点区分の選択",
    required: true,
    guidance: "観点区分カタログのうち、今回のセッションで対象とする観点区分を確認する。",
    collectTo: "areaIds",
  },
  {
    id: "EXC-05",
    titleJa: "セッション時間予算",
    required: true,
    guidance: "探索的テストセッション全体に割ける時間予算(分)を確認する。",
    collectTo: "sessionBudgetMinutes",
  },
  {
    id: "EXC-06",
    titleJa: "実施者とスキル",
    required: false,
    guidance: "各チャーターの実施者と、そのスキルレベル(熟練/中級/初級)を確認する。",
    collectTo: "charters[].assignee / charters[].skillLevel",
  },
  {
    id: "EXC-07",
    titleJa: "記録方法",
    required: false,
    guidance: "セッション中に見つかった気づき・不具合をどこに、どの粒度で記録するかを確認する。",
    collectTo: "recordingMethod",
  },
  {
    id: "EXC-08",
    titleJa: "停止条件",
    required: true,
    guidance: "セッションを終了する目安(時間切れ以外に、どうなったら切り上げるか)を確認する。",
    collectTo: "stopConditionDeclaration",
  },
];

export function buildExploratoryCharterInterviewPrompt(
  topics: ExploratoryCharterInterviewTopic[] = exploratoryCharterInterviewTopics,
  subjectName?: string
): string {
  const lines: string[] = [];
  const target = subjectName?.trim() ? `「${subjectName.trim()}」` : "対象システム";

  lines.push(
    `あなたは探索的テストのチャーター設計の聞き手です。${target}について generate_exploratory_charters ツールを呼び出すため、` +
      `以下の項目についてユーザーに1〜3項目ずつ順に質問し、回答を集めてください。`
  );
  lines.push("");
  lines.push("進め方:");
  lines.push("- 必須(★)の項目を優先し、一度に多く聞きすぎない。");
  lines.push("- ユーザーが「不明」「後で」と答えた項目はスキップしてよい。");
  lines.push("- ひととおり集まったら generate_exploratory_charters を呼び出す。");
  lines.push("");
  lines.push("## 質問項目");
  lines.push("");

  for (const topic of topics) {
    const star = topic.required ? "★" : "・";
    lines.push(`${star} [${topic.titleJa}] — ${topic.guidance}`);
    lines.push(`   （収集先: ${topic.collectTo}）`);
  }

  lines.push("");
  lines.push(
    "上記の質問が終わったら、収集した回答を generate_exploratory_charters ツールの引数にマッピングして呼び出してください。"
  );

  return lines.join("\n");
}

export function registerExploratoryCharterInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "exploratory_charter_interview",
    {
      title: "Exploratory Charter Interview",
      description:
        "質問形式で探索的テストのチャーター設計のコンテキストを収集するためのガイド。対象領域・テスト条件・既存ケースの手薄な" +
        "箇所・過去障害/経験上の勘所・観点区分・セッション時間予算・実施者/スキル・記録方法・停止条件を確認し" +
        "generate_exploratory_charters を呼ぶよう誘導する。",
      argsSchema: {
        subjectName: z
          .string()
          .optional()
          .describe("対象システム／プロジェクト名（分かっていれば）"),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: buildExploratoryCharterInterviewPrompt(exploratoryCharterInterviewTopics, args.subjectName),
          },
        },
      ],
    })
  );
}
