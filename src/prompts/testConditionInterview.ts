import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildInterviewPromptText, type InterviewTopic } from "./interviewTopic.js";

// 質問形式で extract_test_conditions の入力を収集するためのプロンプト。

export const testConditionInterviewTopics: InterviewTopic[] = [
  {
    id: "TCI-01",
    titleJa: "要件ID母集団",
    required: true,
    guidance:
      "カバレッジ行になる要件ID／機能IDの全量を確認する。母集団が欠けると、未カバー0件が母集団縮退による見かけの値になり網羅率が嵩上げされる。",
    collectTo: "requirementIds",
  },
  {
    id: "TCI-02",
    titleJa: "テスト条件の本体",
    required: true,
    guidance: "条件ID・対象（機能ID／画面ID）・条件文を1件ずつ確認する。",
    collectTo: "testConditions",
  },
  {
    id: "TCI-03",
    titleJa: "導出系統",
    required: true,
    guidance:
      "各テスト条件を testbase / stakeholder / risk / guideword のどの系統から導出したかを条件ごとに確認する。",
    collectTo: "testConditions[].source",
  },
  {
    id: "TCI-04",
    titleJa: "導出元ID",
    required: true,
    guidance:
      "各テスト条件が要件ID・リスクID・ペルソナIDのどれに紐づくかを確認する。名前空間が曖昧なら {kind, id} の形で確認する。",
    collectTo: "testConditions[].derivedFrom",
  },
  {
    id: "TCI-05",
    titleJa: "観点カテゴリ",
    required: true,
    guidance:
      "観点カタログ（TPC-xx）のどの区分に当たるか、および対象とする観点カテゴリの母集団をどこまでとするかを確認する。",
    collectTo: "testConditions[].perspectiveCategoryId / perspectiveCategoryIds",
  },
  {
    id: "TCI-06",
    titleJa: "優先度と判定基準",
    required: true,
    guidance: "各条件の高／中／低の付与と、その優先度をどう判定したかの基準の宣言を確認する。",
    collectTo: "testConditions[].priority / priorityCriteria",
  },
  {
    id: "TCI-07",
    titleJa: "リスク3軸",
    required: false,
    guidance:
      "影響度・発生可能性・変更差分区分を確認する。宣言した優先度がリスクベースの導出値と食い違う場合は、その理由も確認する。",
    collectTo:
      "testConditions[].impact / testConditions[].likelihood / testConditions[].changeCategory",
  },
  {
    id: "TCI-08",
    titleJa: "ペルソナ",
    required: false,
    guidance: "derivedFrom から参照するペルソナのID・役割・関心事を確認する。",
    collectTo: "personas",
  },
  {
    id: "TCI-09",
    titleJa: "リスク一覧",
    required: false,
    guidance: "derivedFrom から参照するリスクのID・記述を確認する。",
    collectTo: "risks",
  },
  {
    id: "TCI-10",
    titleJa: "網羅基準の宣言",
    required: false,
    guidance: "既定以外に明示したい網羅基準があれば確認する。",
    collectTo: "coverageCriteria",
  },
  {
    id: "TCI-11",
    titleJa: "テスト目的",
    required: false,
    guidance: "derive_test_purposes で導出した目的IDと、各テスト条件との紐づけを確認する。",
    collectTo: "testPurposes",
  },
  {
    id: "TCI-12",
    titleJa: "テストベース内の出典位置",
    required: false,
    guidance: "各条件の根拠がテストベースのどこにあるか（文書名・行範囲・見出し）を確認する。",
    collectTo: "requirementSources / testConditions[].sourceRefs",
  },
  {
    id: "TCI-13",
    titleJa: "条件IDプレフィックス",
    required: false,
    guidance: "既定以外の条件IDプレフィックスを使う場合はその表記を確認する。",
    collectTo: "idPrefix",
  },
];

export function buildTestConditionInterviewPrompt(
  topics: readonly InterviewTopic[] = testConditionInterviewTopics,
  subjectName?: string
): string {
  return buildInterviewPromptText({
    toolName: "extract_test_conditions",
    roleJa: "テスト条件抽出",
    topics,
    subjectName,
    extraProcedureLines: [
      "- 要件ID母集団（TCI-01）を先に固めてから条件を集める。母集団を縮めると未カバー0件が見かけの値になる。",
    ],
    extraClosingText:
      "導出したテスト条件は、続けて emitHandoverPayload: true を指定して design_test_architecture / generate_test_cases / audit_cross_matrix へ引き渡せる。",
  });
}

export function registerTestConditionInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "test_condition_interview",
    {
      title: "Test Condition Interview",
      description:
        "質問形式でテスト条件抽出のコンテキストを収集するためのガイド。要件ID母集団・テスト条件本体・導出系統・導出元ID・" +
        "観点カテゴリ・優先度と判定基準・リスク3軸・出典位置を確認し extract_test_conditions を呼ぶよう誘導する。",
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
            text: buildTestConditionInterviewPrompt(testConditionInterviewTopics, args.subjectName),
          },
        },
      ],
    })
  );
}
