import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// 質問形式で analyze_requirements の入力を収集するためのプロンプト。
// testPlanInterview.ts と同型の実装（純関数 + register関数）。

export interface RequirementsInterviewTopic {
  id: string; // "RI-01"
  titleJa: string;
  required: boolean;
  guidance: string;
  collectTo: string; // analyze_requirements の入力キー
}

export const requirementsInterviewTopics: RequirementsInterviewTopic[] = [
  {
    id: "RI-01",
    titleJa: "開発背景",
    required: true,
    guidance: "なぜこの開発・変更が必要になったのか、経緯や課題感を確認する。",
    collectTo: "background",
  },
  {
    id: "RI-02",
    titleJa: "分析対象文書",
    required: true,
    guidance: "分析対象とする要件・仕様文書一式（名称とテキスト）を確認する。",
    collectTo: "documents",
  },
  {
    id: "RI-03",
    titleJa: "スコープ・重点項目",
    required: true,
    guidance: "特に重点的に確認したい機能・非機能領域を確認する。",
    collectTo: "focusAreas",
  },
  {
    id: "RI-04",
    titleJa: "スコープ外",
    required: true,
    guidance: "今回の分析・テストの対象外とする範囲を確認する。",
    collectTo: "outOfScope",
  },
  {
    id: "RI-05",
    titleJa: "既に保証済みの範囲",
    required: false,
    guidance: "他のテスト・レビューで既に確認済みの範囲があれば確認する。",
    collectTo: "alreadyAssured",
  },
  {
    id: "RI-06",
    titleJa: "ステークホルダー",
    required: false,
    guidance: "影響を受ける利用者・関係者の役割、ニーズや懸念を確認する。",
    collectTo: "stakeholders",
  },
  {
    id: "RI-07",
    titleJa: "変更差分",
    required: false,
    guidance: "新規実装・変更・既存への影響有無が分かる変更項目一覧を確認する。",
    collectTo: "changeItems",
  },
  {
    id: "RI-08",
    titleJa: "制約・マイルストーン",
    required: false,
    guidance:
      "納期・体制・環境などの制約や主要なマイルストーンを確認する。回答内容は documents に添えるか、指摘表の暫定前提として扱う。",
    collectTo: "(専用の入力キーなし。回答内容を documents に添えるか、指摘表の暫定前提として扱う)",
  },
];

export function buildRequirementsInterviewPrompt(
  topics: RequirementsInterviewTopic[] = requirementsInterviewTopics,
  subjectName?: string
): string {
  const lines: string[] = [];
  const target = subjectName?.trim() ? `「${subjectName.trim()}」` : "対象システム";

  lines.push(
    `あなたは要件分析の聞き手です。${target}について analyze_requirements ツールを呼び出すため、` +
      `以下の項目についてユーザーに1〜3項目ずつ順に質問し、回答を集めてください。`
  );
  lines.push("");
  lines.push("進め方:");
  lines.push("- 必須(★)の項目を優先し、一度に多く聞きすぎない。");
  lines.push("- ユーザーが「不明」「後で」と答えた項目はスキップしてよい。");
  lines.push("- ひととおり集まったら analyze_requirements を呼び出す。");
  lines.push("");
  lines.push("## 質問項目");
  lines.push("");

  for (const topic of topics) {
    const star = topic.required ? "★" : "・";
    lines.push(`${star} [${topic.titleJa}] — ${topic.guidance}`);
    lines.push(`   （収集先: ${topic.collectTo}）`);
  }

  lines.push("");
  lines.push("上記の質問が終わったら、収集した回答を analyze_requirements ツールの引数にマッピングして呼び出してください。");

  return lines.join("\n");
}

export function registerRequirementsAnalysisInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "requirements_analysis_interview",
    {
      title: "Requirements Analysis Interview",
      description:
        "質問形式で要件分析のコンテキストを収集するためのガイド。開発背景・スコープ・ステークホルダー・変更差分等を確認し analyze_requirements を呼ぶよう誘導する。",
      argsSchema: {
        subjectName: z
          .string()
          .optional()
          .describe("分析対象システム／プロジェクト名（分かっていれば）"),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: buildRequirementsInterviewPrompt(requirementsInterviewTopics, args.subjectName),
          },
        },
      ],
    })
  );
}
