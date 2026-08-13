import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildInterviewPromptText, type InterviewTopic } from "./interviewTopic.js";

// 質問形式で design_scenario_flows の入力を収集するためのプロンプト。

export const scenarioFlowInterviewTopics: InterviewTopic[] = [
  {
    id: "SFI-01",
    titleJa: "アクター",
    required: true,
    guidance: "システムと関わる人・外部システムのID・名称・役割を確認する。",
    collectTo: "actors",
  },
  {
    id: "SFI-02",
    titleJa: "ユースケースと主アクター",
    required: true,
    guidance: "ユースケースのID・名称と、それぞれの主アクターを確認する。",
    collectTo: "useCases / useCases[].primaryActor",
  },
  {
    id: "SFI-03",
    titleJa: "事前条件・事後条件",
    required: true,
    guidance: "各ユースケースの開始前に成立している状態と、正常終了後に成立している状態を確認する。",
    collectTo: "useCases[].preconditions / useCases[].postconditions",
  },
  {
    id: "SFI-04",
    titleJa: "主フロー（ステップ番号順）",
    required: true,
    guidance: "目的が達成される標準的な手順を、ステップ番号順に確認する。",
    collectTo: "useCases[].mainFlow",
  },
  {
    id: "SFI-05",
    titleJa: "代替フロー・例外フロー",
    required: true,
    guidance: "主フローから外れる代替手順と、失敗・エラー時の例外手順を確認する。",
    collectTo: "useCases[].branches",
  },
  {
    id: "SFI-06",
    titleJa: "分岐の起点・契機・復帰先",
    required: true,
    guidance:
      "各分岐が主フローの何番目のステップから出て、どの契機で発生し、何番目へ戻るか（戻らないか）を確認する。",
    collectTo:
      "useCases[].branches[].fromStepNo / useCases[].branches[].trigger / useCases[].branches[].rejoinStepNo",
  },
  {
    id: "SFI-07",
    titleJa: "分岐の帰結（目的達成／中断）",
    required: true,
    guidance: "各分岐の結果としてユースケースの目的が達成されるのか、中断するのかを確認する。",
    collectTo: "useCases[].branches[].outcome",
  },
  {
    id: "SFI-08",
    titleJa: "機能ID母集団",
    required: false,
    guidance: "シナリオが網羅すべき機能IDの母集団を確認する。",
    collectTo: "featureIds",
  },
  {
    id: "SFI-09",
    titleJa: "突合するテスト条件",
    required: false,
    guidance: "既に抽出済みで、シナリオと突合したいテスト条件があれば確認する。",
    collectTo: "testConditions",
  },
  {
    id: "SFI-10",
    titleJa: "タイトル・展開上限",
    required: false,
    guidance: "成果物のタイトルと、1ユースケースあたりの展開シナリオ数の上限を確認する。",
    collectTo: "title / maxScenariosPerUseCase",
  },
];

export function buildScenarioFlowInterviewPrompt(
  topics: readonly InterviewTopic[] = scenarioFlowInterviewTopics,
  subjectName?: string
): string {
  return buildInterviewPromptText({
    toolName: "design_scenario_flows",
    roleJa: "シナリオフロー設計",
    topics,
    subjectName,
    extraProcedureLines: [
      "- 主フローを固めてから代替/例外フローを聞く。分岐は「主フローの何番目から出て、何番目へ戻るか（戻らないか）」まで確認する。",
    ],
    extraClosingText:
      "展開したシナリオは、続けて emitHandoverPayload: true を指定して generate_test_cases へ引き渡せる。",
  });
}

export function registerScenarioFlowInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "scenario_flow_interview",
    {
      title: "Scenario Flow Interview",
      description:
        "質問形式でシナリオフロー設計のコンテキストを収集するためのガイド。アクター・ユースケースと主アクター・事前/事後条件・" +
        "主フロー・代替/例外フロー・分岐の起点と復帰先・分岐の帰結を確認し design_scenario_flows を呼ぶよう誘導する。",
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
            text: buildScenarioFlowInterviewPrompt(scenarioFlowInterviewTopics, args.subjectName),
          },
        },
      ],
    })
  );
}
