import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildInterviewPromptText, type InterviewTopic } from "./interviewTopic.js";

// 質問形式で audit_id_population の入力を収集するためのプロンプト。

export const idPopulationAuditInterviewTopics: InterviewTopic[] = [
  {
    id: "IPA-01",
    titleJa: "監査対象のテストベース文書",
    required: true,
    guidance: "母集団の実体を突き合わせる対象となるテストベース文書の名称と本文を確認する。",
    collectTo: "documents",
  },
  {
    id: "IPA-02",
    titleJa: "監査すべき文書の期待一覧",
    required: false,
    guidance: "本来監査対象に含まれるべき文書名の一覧を確認し、文書自体の渡し漏れを検出できるようにする。",
    collectTo: "expectedDocumentNames",
  },
  {
    id: "IPA-03",
    titleJa: "各ツール呼び出しに実際に渡した母集団",
    required: true,
    guidance:
      "どのツール呼び出しに、どのIDの集合を実際に渡したかを確認する。理想の母集団ではなく実績値を聞き取る。",
    collectTo: "declaredPopulations",
  },
  {
    id: "IPA-04",
    titleJa: "同一ツールの複数回呼び出しの識別",
    required: false,
    guidance: "同じツールを複数回呼んでいる場合、各呼び出しを区別するラベルを確認する。",
    collectTo: "declaredPopulations[].label",
  },
  {
    id: "IPA-05",
    titleJa: "意図的に対象外としたIDと理由",
    required: false,
    guidance: "母集団から意図的に除外したIDと、その除外理由を確認する。",
    collectTo: "exclusions",
  },
  {
    id: "IPA-06",
    titleJa: "ID表記パターン",
    required: false,
    guidance: "文書からIDを抽出するためのプロジェクト固有の表記パターンを確認する。",
    collectTo: "idPatterns",
  },
  {
    id: "IPA-07",
    titleJa: "網羅対象IDを索引に含めるか",
    required: false,
    guidance: "出力の索引に網羅対象IDを列挙するかどうかを確認する。",
    collectTo: "includeCoverageTargetIds",
  },
  {
    id: "IPA-08",
    titleJa: "出力量",
    required: false,
    guidance: "詳細出力を必要とするかを確認する。",
    collectTo: "verbose",
  },
];

export function buildIdPopulationAuditInterviewPrompt(
  topics: readonly InterviewTopic[] = idPopulationAuditInterviewTopics,
  subjectName?: string
): string {
  return buildInterviewPromptText({
    toolName: "audit_id_population",
    roleJa: "ID母集団監査",
    topics,
    subjectName,
    extraProcedureLines: [
      "- declaredPopulations は「どのツール呼び出しに、どのIDを渡したか」の実績である。理想の母集団ではなく実際に渡した値を聞き取る。",
    ],
  });
}

export function registerIdPopulationAuditInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "id_population_audit_interview",
    {
      title: "ID Population Audit Interview",
      description:
        "質問形式でID母集団監査のコンテキストを収集するためのガイド。監査対象のテストベース文書・監査すべき文書の期待一覧・" +
        "各ツール呼び出しに実際に渡した母集団・意図的な除外IDと理由・ID表記パターンを確認し audit_id_population を呼ぶよう" +
        "誘導する。",
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
            text: buildIdPopulationAuditInterviewPrompt(
              idPopulationAuditInterviewTopics,
              args.subjectName
            ),
          },
        },
      ],
    })
  );
}
