import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// 質問形式で generate_test_cases の入力を収集するためのプロンプト。
// requirementsAnalysisInterview.ts と同型の実装（純関数 + register関数）。

export interface TestDesignInterviewTopic {
  id: string; // "TD-01"
  titleJa: string;
  required: boolean;
  guidance: string;
  collectTo: string; // generate_test_cases の入力キー
}

export const testDesignInterviewTopics: TestDesignInterviewTopic[] = [
  {
    id: "TD-01",
    titleJa: "対象テスト条件",
    required: true,
    guidance: "テストケース化する対象のテスト条件一覧(条件ID・対象・条件文・由来)を確認する。",
    collectTo: "testConditions",
  },
  {
    id: "TD-02",
    titleJa: "テストベースの特徴",
    required: true,
    guidance: "各テスト条件の入力が範囲/分類/複数条件/状態/因子/フロー/データ/並行のどれに該当するかを確認する。",
    collectTo: "testConditions[].basisCharacteristics",
  },
  {
    id: "TD-03",
    titleJa: "範囲を持つ入力（下限・上限・刻み・型）",
    required: true,
    guidance: "境界値分析の対象となる変数の下限・上限・刻み幅・型を確認する。",
    collectTo: "boundaryVariables",
  },
  {
    id: "TD-04",
    titleJa: "分類を持つ入力（有効／無効同値クラスと代表値）",
    required: true,
    guidance: "同値分割の対象となる変数の有効/無効同値クラスとその代表値を確認する。",
    collectTo: "equivalenceVariables",
  },
  {
    id: "TD-05",
    titleJa: "因子と水準",
    required: false,
    guidance: "組合せ爆発が懸念される因子と各因子の水準を確認する。",
    collectTo: "additionalCoverageTargets（ペアワイズの網羅対象として宣言）",
  },
  {
    id: "TD-06",
    titleJa: "状態と遷移（イベント・ガード・初期状態）",
    required: false,
    guidance: "状態遷移テストの対象となる状態一覧と遷移(イベント・ガード・初期状態)を確認する。",
    collectTo: "stateTransition",
  },
  {
    id: "TD-07",
    titleJa: "前提条件の状態変数",
    required: true,
    guidance: "各テストケースの実行前提となる状態変数(名前と値)を確認する。",
    collectTo: "testCases[].preconditions",
  },
  {
    id: "TD-08",
    titleJa: "閾値・台数・価格・タイムアウト等のパラメータ",
    required: true,
    guidance: "ケース本文で直値を使わず参照させる閾値パラメータの名前・値・単位・出典を確認する。",
    collectTo: "parameters",
  },
  {
    id: "TD-09",
    titleJa: "網羅基準の宣言",
    required: false,
    guidance: "既定の網羅基準以外に明示したい網羅基準があれば確認する。",
    collectTo: "coverageCriteriaDeclaration",
  },
  {
    id: "TD-10",
    titleJa: "要件ID一覧・優先度・テストタイプ",
    required: false,
    guidance: "derivedFrom の照合に使う要件ID一覧、各ケースの優先度・テストタイプを確認する。",
    collectTo: "requirementIds / testCases[].priority / testCases[].testType",
  },
];

export function buildTestDesignInterviewPrompt(
  topics: TestDesignInterviewTopic[] = testDesignInterviewTopics,
  subjectName?: string
): string {
  const lines: string[] = [];
  const target = subjectName?.trim() ? `「${subjectName.trim()}」` : "対象システム";

  lines.push(
    `あなたはテスト設計の聞き手です。${target}について generate_test_cases ツールを呼び出すため、` +
      `以下の項目についてユーザーに1〜3項目ずつ順に質問し、回答を集めてください。`
  );
  lines.push("");
  lines.push("進め方:");
  lines.push("- 必須(★)の項目を優先し、一度に多く聞きすぎない。");
  lines.push("- ユーザーが「不明」「後で」と答えた項目はスキップしてよい。");
  lines.push("- ひととおり集まったら generate_test_cases を呼び出す。");
  lines.push("");
  lines.push("## 質問項目");
  lines.push("");

  for (const topic of topics) {
    const star = topic.required ? "★" : "・";
    lines.push(`${star} [${topic.titleJa}] — ${topic.guidance}`);
    lines.push(`   （収集先: ${topic.collectTo}）`);
  }

  lines.push("");
  lines.push("上記の質問が終わったら、収集した回答を generate_test_cases ツールの引数にマッピングして呼び出してください。");

  return lines.join("\n");
}

export function registerTestDesignInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "test_design_interview",
    {
      title: "Test Design Interview",
      description:
        "質問形式でテスト設計のコンテキストを収集するためのガイド。テスト条件・テストベースの特徴・境界値・同値クラス・" +
        "状態遷移・因子水準・前提条件・閾値パラメータ等を確認し generate_test_cases を呼ぶよう誘導する。",
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
            text: buildTestDesignInterviewPrompt(testDesignInterviewTopics, args.subjectName),
          },
        },
      ],
    })
  );
}
