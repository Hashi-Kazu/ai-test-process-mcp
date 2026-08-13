import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildInterviewPromptText, type InterviewTopic } from "./interviewTopic.js";

// 質問形式で design_test_architecture の入力を収集するためのプロンプト。

export const testArchitectureInterviewTopics: InterviewTopic[] = [
  {
    id: "TAI-01",
    titleJa: "テストスコープ（対象・対象外と理由）",
    required: false,
    guidance: "今回のテストアーキテクチャで対象とする範囲・対象外とする範囲と、その理由を確認する。",
    collectTo: "scope",
  },
  {
    id: "TAI-02",
    titleJa: "コンテナ分解軸",
    required: true,
    guidance:
      "テストコンテナをどの軸（機能・品質特性・テストレベル・利用者・リスク等）で分解するかを確認する。",
    collectTo: "decompositionAxisIds",
  },
  {
    id: "TAI-03",
    titleJa: "テストコンテナの定義（ID・名称・親子・責務）",
    required: true,
    guidance: "各テストコンテナのID・名称・親コンテナ・そのコンテナが担う責務を確認する。",
    collectTo: "containers",
  },
  {
    id: "TAI-04",
    titleJa: "テストレベルとテストタイプ",
    required: true,
    guidance: "各コンテナがどのテストレベルに属し、どのテストタイプを担当するかを確認する。",
    collectTo: "containers[].testLevel / containers[].testTypes",
  },
  {
    id: "TAI-05",
    titleJa: "実行必要性の優先度クラス",
    required: true,
    guidance:
      "各コンテナの実行必要性（must / conditional / optional）と、その判断根拠を確認する。",
    collectTo: "containers[].priorityClass",
  },
  {
    id: "TAI-06",
    titleJa: "コンテナが担当する観点カテゴリ",
    required: false,
    guidance: "各コンテナが担当する観点カテゴリ（TPC-xx）を確認する。",
    collectTo: "containers[].perspectiveCategoryIds",
  },
  {
    id: "TAI-07",
    titleJa: "環境・開始条件・終了条件",
    required: false,
    guidance: "各コンテナの実行環境と、開始条件・終了条件を確認する。",
    collectTo:
      "containers[].environment / containers[].entryCriteria / containers[].exitCriteria",
  },
  {
    id: "TAI-08",
    titleJa: "テスト条件とコンテナ帰属",
    required: true,
    guidance:
      "配置対象のテスト条件一覧と、各テスト条件がどのコンテナに帰属するかを確認する。",
    collectTo: "testConditions / testConditions[].containerIds",
  },
  {
    id: "TAI-09",
    titleJa: "テストケース（テストサイズ分布用）",
    required: false,
    guidance: "テストサイズ分布の算出に使う既存のテストケース一覧があれば確認する。",
    collectTo: "testCases",
  },
  {
    id: "TAI-10",
    titleJa: "階層・件数の上限",
    required: false,
    guidance: "成果物のタイトルと、コンテナ件数・階層の深さの上限を確認する。",
    collectTo: "title / maxContainers / maxDepth",
  },
];

export function buildTestArchitectureInterviewPrompt(
  topics: readonly InterviewTopic[] = testArchitectureInterviewTopics,
  subjectName?: string
): string {
  return buildInterviewPromptText({
    toolName: "design_test_architecture",
    roleJa: "テストアーキテクチャ設計",
    topics,
    subjectName,
    extraProcedureLines: [
      "- testConditions は extract_test_conditions を emitHandoverPayload: true で呼べば手組み不要。コンテナ帰属（containerIds）だけを聞き取ればよい。",
      "- 優先度クラス（must / conditional / optional）の意味は testarch://container/design-principles を参照する。",
    ],
  });
}

export function registerTestArchitectureInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "test_architecture_interview",
    {
      title: "Test Architecture Interview",
      description:
        "質問形式でテストアーキテクチャ設計のコンテキストを収集するためのガイド。テストスコープ・コンテナ分解軸・コンテナ定義" +
        "（責務・テストレベル・テストタイプ・優先度クラス）・観点カテゴリ・環境と開始/終了条件・テスト条件のコンテナ帰属を" +
        "確認し design_test_architecture を呼ぶよう誘導する。",
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
            text: buildTestArchitectureInterviewPrompt(
              testArchitectureInterviewTopics,
              args.subjectName
            ),
          },
        },
      ],
    })
  );
}
