import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildInterviewPromptText, type InterviewTopic } from "./interviewTopic.js";

// 質問形式で reexpand_threshold_changes の入力を収集するためのプロンプト。

export const thresholdChangeInterviewTopics: InterviewTopic[] = [
  {
    id: "TCH-01",
    titleJa: "変更前の閾値パラメータ表",
    required: true,
    guidance: "変更前の閾値・台数・価格・タイムアウト等を、名前・値・単位・出典の4点で確認する。",
    collectTo: "parametersBefore",
  },
  {
    id: "TCH-02",
    titleJa: "変更後の閾値パラメータ表",
    required: true,
    guidance:
      "変更後の値を同じ4点で確認する。変更前が存在しないパラメータは新規追加として扱う。",
    collectTo: "parametersAfter",
  },
  {
    id: "TCH-03",
    titleJa: "変更前後の仕様書本文",
    required: false,
    guidance: "パラメータの出典となる変更前／変更後の仕様書本文があれば確認する。",
    collectTo: "documentsBefore / documentsAfter",
  },
  {
    id: "TCH-04",
    titleJa: "抽出候補の承認",
    required: false,
    guidance:
      "文書から抽出したパラメータ候補のうち、利用者が承認したものだけを確認する。未承認の候補で表を書き換えない。",
    collectTo: "approvedExtractions",
  },
  {
    id: "TCH-05",
    titleJa: "既存のテスト条件",
    required: false,
    guidance: "閾値変更の影響を判定する対象となる既存テスト条件を確認する。",
    collectTo: "testConditions",
  },
  {
    id: "TCH-06",
    titleJa: "既存のテストケース",
    required: false,
    guidance: "再展開の対象となる既存テストケースを確認する。",
    collectTo: "testCases",
  },
  {
    id: "TCH-07",
    titleJa: "境界値変数とパラメータの束縛",
    required: false,
    guidance: "境界値分析の変数が、どの閾値パラメータを下限・上限として参照しているかを確認する。",
    collectTo: "boundaryBindings / boundaryMode",
  },
  {
    id: "TCH-08",
    titleJa: "同値クラスとパラメータの束縛",
    required: false,
    guidance: "同値クラスの区切りが、どの閾値パラメータに束縛されているかを確認する。",
    collectTo: "equivalenceBindings",
  },
  {
    id: "TCH-09",
    titleJa: "出力量",
    required: false,
    guidance: "詳細出力を必要とするかを確認する。",
    collectTo: "verbose",
  },
];

export function buildThresholdChangeInterviewPrompt(
  topics: readonly InterviewTopic[] = thresholdChangeInterviewTopics,
  subjectName?: string
): string {
  return buildInterviewPromptText({
    toolName: "reexpand_threshold_changes",
    roleJa: "閾値変更影響の再展開",
    topics,
    subjectName,
    extraProcedureLines: [
      "- パラメータは名前・値・単位・出典の4点で聞く。変更前が存在しないものは新規追加として扱う。",
      "- 抽出候補（TCH-04）は利用者の承認があったものだけを有効な表へ反映する。未承認の候補で表を書き換えない。",
    ],
  });
}

export function registerThresholdChangeInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "threshold_change_interview",
    {
      title: "Threshold Change Interview",
      description:
        "質問形式で閾値変更影響の再展開のコンテキストを収集するためのガイド。変更前後の閾値パラメータ表・仕様書本文・抽出候補の" +
        "承認・既存のテスト条件とテストケース・境界値/同値クラスとパラメータの束縛を確認し reexpand_threshold_changes を呼ぶ" +
        "よう誘導する。",
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
            text: buildThresholdChangeInterviewPrompt(
              thresholdChangeInterviewTopics,
              args.subjectName
            ),
          },
        },
      ],
    })
  );
}
