import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildInterviewPromptText, type InterviewTopic } from "./interviewTopic.js";

// 質問形式で review_test_specification の入力を収集するためのプロンプト。

export const testSpecificationReviewInterviewTopics: InterviewTopic[] = [
  {
    id: "TSR-01",
    titleJa: "テストベース文書一式",
    required: true,
    guidance: "レビューの根拠になる要件・仕様文書の名称と本文を確認する。",
    collectTo: "testBasisDocuments",
  },
  {
    id: "TSR-02",
    titleJa: "レビュー対象のテスト仕様書本文",
    required: true,
    guidance: "レビュー対象となるテスト仕様書のテキストそのものを確認する。",
    collectTo: "testSpecificationText",
  },
  {
    id: "TSR-03",
    titleJa: "構造化テストケース",
    required: false,
    guidance:
      "ケースID・前提・手順・期待結果・導出元をもつ構造化テストケースを用意できるかを確認する。未指定だとID抽出ベースの簡易チェックしか出ない。",
    collectTo: "testCases",
  },
  {
    id: "TSR-04",
    titleJa: "要件ID母集団",
    required: false,
    guidance: "テスト仕様書が網羅すべき要件ID／機能IDの母集団を確認する。",
    collectTo: "requirementIds",
  },
  {
    id: "TSR-05",
    titleJa: "テスト条件一覧",
    required: false,
    guidance: "テスト仕様書と突合するテスト条件一覧を確認する。",
    collectTo: "testConditions",
  },
  {
    id: "TSR-06",
    titleJa: "リスク一覧",
    required: false,
    guidance: "テストケースの導出元として参照するリスクのID・記述を確認する。",
    collectTo: "risks",
  },
  {
    id: "TSR-07",
    titleJa: "ID表記の規則",
    required: false,
    guidance: "プロジェクト固有のID表記パターンと、テストケースIDのプレフィックスを確認する。",
    collectTo: "idPatterns / idPrefix",
  },
  {
    id: "TSR-08",
    titleJa: "追加の曖昧語・主観語",
    required: false,
    guidance: "既定の辞書に加えて、この案件で曖昧語・主観語として扱いたい語を確認する。",
    collectTo: "additionalAmbiguousTerms / additionalSubjectiveTerms",
  },
];

export function buildTestSpecificationReviewInterviewPrompt(
  topics: readonly InterviewTopic[] = testSpecificationReviewInterviewTopics,
  subjectName?: string
): string {
  return buildInterviewPromptText({
    toolName: "review_test_specification",
    roleJa: "テスト仕様書レビュー",
    topics,
    subjectName,
    extraProcedureLines: [
      "- testCases 未指定ではID抽出ベースの簡易チェックしか出ないため、構造化テストケース（TSR-03）を用意できるかを必ず確認する。",
    ],
  });
}

export function registerTestSpecificationReviewInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "test_specification_review_interview",
    {
      title: "Test Specification Review Interview",
      description:
        "質問形式でテスト仕様書レビューのコンテキストを収集するためのガイド。テストベース文書一式・レビュー対象のテスト仕様書" +
        "本文・構造化テストケース・要件ID母集団・テスト条件・リスク・ID表記規則を確認し review_test_specification を呼ぶよう" +
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
            text: buildTestSpecificationReviewInterviewPrompt(
              testSpecificationReviewInterviewTopics,
              args.subjectName
            ),
          },
        },
      ],
    })
  );
}
