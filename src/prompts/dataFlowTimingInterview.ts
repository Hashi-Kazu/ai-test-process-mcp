import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildInterviewPromptText, type InterviewTopic } from "./interviewTopic.js";

// 質問形式で analyze_data_flow_timing の入力を収集するためのプロンプト。

export const dataFlowTimingInterviewTopics: InterviewTopic[] = [
  {
    id: "DFT-01",
    titleJa: "構成要素（機器・サービス・クラウド・ストア・人）",
    required: true,
    guidance: "データを持つ・運ぶ・使う構成要素を、IDと名称と種別で確認する。",
    collectTo: "components",
  },
  {
    id: "DFT-02",
    titleJa: "論理データ項目",
    required: true,
    guidance: "構成要素間でやり取りされる論理的なデータ項目を、IDと名称で確認する。",
    collectTo: "dataItems",
  },
  {
    id: "DFT-03",
    titleJa: "通信経路（送信元・宛先・運ぶデータ項目）",
    required: true,
    guidance: "どの構成要素IDからどの構成要素IDへ、どのデータ項目IDを運ぶかを1経路ずつ確認する。",
    collectTo: "communications",
  },
  {
    id: "DFT-04",
    titleJa: "送信タイミング（種別・周期・契機）",
    required: true,
    guidance: "各通信が定期送信か契機送信か、周期は何秒か、どの事象を契機とするかを確認する。",
    collectTo: "communications[].timing",
  },
  {
    id: "DFT-05",
    titleJa: "遅延・ACK・タイムアウト・リトライ",
    required: false,
    guidance: "各通信の伝送遅延・ACKの有無と種別・タイムアウト時間・リトライ方針を確認する。",
    collectTo:
      "communications[].transmissionLatencySeconds / communications[].ackKind / communications[].timeoutSeconds / communications[].retry",
  },
  {
    id: "DFT-06",
    titleJa: "伝播の起点と終端",
    required: false,
    guidance: "データ伝播の起点となる構成要素と、到達を確認したい終端の構成要素を確認する。",
    collectTo: "propagationTargets",
  },
  {
    id: "DFT-07",
    titleJa: "主張する最大スキュー",
    required: false,
    guidance: "設計側が主張している構成要素間の最大時刻ずれ（秒）を確認する。",
    collectTo: "claimedMaxSkewSeconds",
  },
  {
    id: "DFT-08",
    titleJa: "突合するテスト条件",
    required: false,
    guidance: "データフロー・タイミングと突合したい既存のテスト条件を確認する。",
    collectTo: "testConditions",
  },
  {
    id: "DFT-09",
    titleJa: "遅延窓被覆率の宣言",
    required: false,
    guidance: "遅延窓の被覆率として主張したい値があれば確認する。",
    collectTo: "claimedDelayWindowCoveragePercent",
  },
  {
    id: "DFT-10",
    titleJa: "タイトル・件数上限",
    required: false,
    guidance: "成果物のタイトルと、通信件数・要素ペアあたりの経路数の上限を確認する。",
    collectTo: "title / maxCommunications / maxPathsPerPair",
  },
];

export function buildDataFlowTimingInterviewPrompt(
  topics: readonly InterviewTopic[] = dataFlowTimingInterviewTopics,
  subjectName?: string
): string {
  return buildInterviewPromptText({
    toolName: "analyze_data_flow_timing",
    roleJa: "データフロー・タイミング分析",
    topics,
    subjectName,
    extraProcedureLines: [
      "- 構成要素とデータ項目にIDを付けてから通信経路を聞く。通信は必ず「どのIDからどのIDへ、どのデータ項目を、どのタイミングで」の4点で確認する。",
    ],
  });
}

export function registerDataFlowTimingInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "data_flow_timing_interview",
    {
      title: "Data Flow / Timing Interview",
      description:
        "質問形式でデータフロー・タイミング分析のコンテキストを収集するためのガイド。構成要素・論理データ項目・通信経路・" +
        "送信タイミング・遅延/ACK/タイムアウト/リトライ・伝播の起点と終端・主張する最大スキューを確認し " +
        "analyze_data_flow_timing を呼ぶよう誘導する。",
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
            text: buildDataFlowTimingInterviewPrompt(dataFlowTimingInterviewTopics, args.subjectName),
          },
        },
      ],
    })
  );
}
