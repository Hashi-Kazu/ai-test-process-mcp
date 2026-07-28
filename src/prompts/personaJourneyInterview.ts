import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// 質問形式で generate_user_story_map の入力を収集するためのプロンプト。
// testDesignInterview.ts と同型の実装（純関数 + register関数）。

export interface PersonaJourneyInterviewTopic {
  id: string; // "PJ-01"
  titleJa: string;
  required: boolean;
  guidance: string;
  collectTo: string; // generate_user_story_map の入力キー
}

export const personaJourneyInterviewTopics: PersonaJourneyInterviewTopic[] = [
  {
    id: "PJ-01",
    titleJa: "対象業界の提供サービス",
    required: true,
    guidance:
      "対象の組織が誰に何を提供して収益を得ているか、止まると誰が困るのかを確認する（ドメイン分析 DOM-01）。",
    collectTo: "domainAnalysis（aspectId: DOM-01）",
  },
  {
    id: "PJ-02",
    titleJa: "利用者・従業員の構成",
    required: true,
    guidance:
      "利用者の年齢層・同伴形態・IT習熟度と、現場で操作する従業員の職種・人数・習熟度を確認する（DOM-02 / DOM-03）。",
    collectTo: "domainAnalysis（aspectId: DOM-02, DOM-03）",
  },
  {
    id: "PJ-03",
    titleJa: "業務フローとIT化・自動化の傾向",
    required: true,
    guidance:
      "受付から完了までの流れ・待ち行列の発生箇所と、既にシステム化された業務／人手に残る業務を確認する（DOM-04 / DOM-05）。法規制・季節性（DOM-06 / DOM-07）も併せて聞く。",
    collectTo: "domainAnalysis（aspectId: DOM-04〜DOM-07）",
  },
  {
    id: "PJ-04",
    titleJa: "ペルソナの属性（Demographics）",
    required: true,
    guidance:
      "対象となる人物ごとに、年齢層・職業・役割・利用環境（端末・場所）・IT習熟度・利用頻度を確認する。",
    collectTo: "personas[].demographics",
  },
  {
    id: "PJ-05",
    titleJa: "ペルソナの発言・思考（Says & Thinks）",
    required: true,
    guidance:
      "その人物が口に出す言葉・問い合わせの言い回しと、口には出さない不安・本音を確認する。",
    collectTo: "personas[].saysAndThinks",
  },
  {
    id: "PJ-06",
    titleJa: "ペルソナの目標と不満点（Goals / PainPoint）",
    required: true,
    guidance:
      "その人物が達したい状態（手段ではなく結果）と、それを妨げている具体的な事象を確認する。",
    collectTo: "personas[].goals / personas[].painPoints",
  },
  {
    id: "PJ-07",
    titleJa: "プロダクトゴール",
    required: true,
    guidance:
      "ペルソナの目標を製品側の言葉に置き換え、製品が達成すべき状態を1ペルソナあたり1〜3件確認する。",
    collectTo: "activities[].productGoal",
  },
  {
    id: "PJ-08",
    titleJa: "アクティビティとタスク",
    required: true,
    guidance:
      "プロダクトゴールに至る大きな活動の区切り（アクティビティ）と、それを構成する作業単位（タスク）を利用者の時間軸順に確認する。",
    collectTo: "activities / tasks",
  },
  {
    id: "PJ-09",
    titleJa: "ユーザーストーリーとテスト要求（Before/After）",
    required: true,
    guidance:
      "タスクを実現する個々の要求（誰が・何をしたい・なぜ）と、導入前の現状(Before)／導入後の将来(After)、その差分を確かめるテスト要求を確認する。",
    collectTo: "stories / testRequirements",
  },
];

export function buildPersonaJourneyInterviewPrompt(
  topics: PersonaJourneyInterviewTopic[] = personaJourneyInterviewTopics,
  subjectName?: string
): string {
  const lines: string[] = [];
  const target = subjectName?.trim() ? `「${subjectName.trim()}」` : "対象システム";

  lines.push(
    `あなたは上流の利用状況モデリングの聞き手です。${target}について generate_user_story_map ツールを呼び出すため、` +
      `以下の項目についてユーザーに1〜3項目ずつ順に質問し、回答を集めてください。`
  );
  lines.push("");
  lines.push("進め方:");
  lines.push("- ドメイン分析 → ペルソナ立案（4象限） → プロダクトゴール → アクティビティ・タスク → ユーザーストーリー → テスト要求 の順に進める。");
  lines.push("- 必須(★)の項目を優先し、一度に多く聞きすぎない。");
  lines.push("- ペルソナは属性・発言・思考・目標・不満点の4象限をすべて埋めることを目標にする。");
  lines.push("- 目標は手段ではなく達成したい状態で、不満点は現状で起きている具体的な事象で書き取る。");
  lines.push("- ユーザーが「不明」「後で」と答えた項目はスキップしてよい。");
  lines.push("- ひととおり集まったら generate_user_story_map を呼び出す。");
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
    "上記の質問が終わったら、収集した回答を generate_user_story_map ツールの引数にマッピングして呼び出してください。" +
      "導出したテスト要求は、続けて extract_test_conditions の source=\"stakeholder\" のテスト条件へ展開してください。"
  );

  return lines.join("\n");
}

export function registerPersonaJourneyInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "persona_journey_interview",
    {
      title: "Persona / User Story Map Interview",
      description:
        "質問形式で上流の利用状況モデリングのコンテキストを収集するためのガイド。ドメイン分析（提供サービス・利用者/従業員構成・" +
        "IT化傾向）→ ペルソナ4象限（属性・発言・思考・目標・不満点）→ プロダクトゴール → アクティビティ・タスク → " +
        "ユーザーストーリー → テスト要求（Before/After）を順に確認し generate_user_story_map を呼ぶよう誘導する。",
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
            text: buildPersonaJourneyInterviewPrompt(personaJourneyInterviewTopics, args.subjectName),
          },
        },
      ],
    })
  );
}
