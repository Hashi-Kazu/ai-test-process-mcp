import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { testPlanTemplate } from "../resources/testPlanTemplate.js";
import type { TestPlanTemplate } from "../types.js";

// 質問形式でのコンテキスト収集用プロンプト。
// テンプレート構造データ（titleJa + guidance）から設問を自動生成し、
// アシスタントがユーザーに順に質問して create_test_plan を呼ぶよう誘導する。

// fieldKey → create_test_plan の入力キーの対応メモ（設問に添えて収集漏れを防ぐ）。
const fieldHint: Record<string, string> = {
  scope: "scope（必須）/ objectives[]（任意）",
  references: "references[]{name, author, version, receivedDate, note} / referenceDocs[]{name, description}",
  background: "background{current, concerns}",
  testLevels: "testLevels[]",
  testItems: "testItems[]{name, summary} / systemOverview{name, users, purpose, detail, devType}",
  selectedTestTypes: "selectedTestTypes[]（テストタイプ名の配列）",
  featuresToTest: "featuresToTest[]",
  featuresNotToTest: "featuresNotToTest[]",
  risks: "risks[]{description, impact, mitigation}",
  testTechniques: "testTechniques[]{testType, approach, technique}",
  testPeriod: "testPeriod",
  scheduleConstraints: "scheduleConstraints{startDate, endDate, milestones}",
  deliverables: "deliverables[]",
  startCriteria: "startCriteria / endCriteria",
  suspensionCriteria: "suspensionCriteria",
  completionCriteria: "completionCriteria[]",
  passFailCriteria: "passFailCriteria",
  metricsNote: "metricsNote",
  environment: "environment",
  testDataRequirements: "testDataRequirements[]{description, owner, period}",
  team: "team[]{role, name, responsibilities}",
  stakeholders: "stakeholders[]{role, name, contact}",
  assumptions: "assumptions[] / constraints[]",
  glossary: "glossary[]{term, definition}",
  approvers: "approvers[]",
  notes: "notes",
};

/**
 * テンプレート構造から質問形式のインタビュー指示文を生成する純関数。
 * 必須(*)セクションを中心に、章ごとに設問を並べる。
 */
export function buildInterviewPrompt(
  template: TestPlanTemplate = testPlanTemplate,
  projectName?: string
): string {
  const lines: string[] = [];
  const target = projectName?.trim() ? `「${projectName.trim()}」` : "対象システム";

  lines.push(
    `あなたはテスト計画づくりの聞き手です。${target}のテスト計画書ドラフトを作成するため、` +
      `以下の項目についてユーザーに1〜3項目ずつ順に質問し、回答を集めてください。`
  );
  lines.push("");
  lines.push("進め方:");
  lines.push("- 必須(★)の項目を優先し、一度に多く聞きすぎない。");
  lines.push("- ユーザーが「不明」「後で」と答えた項目はスキップしてよい（未記入として扱われる）。");
  lines.push(
    "- ひととおり集まったら、収集した回答を create_test_plan ツールの引数にマッピングして呼び出し、" +
      "テスト計画書ドラフトを生成する。"
  );
  lines.push("- projectName と scope は必須。最低限この2つは必ず確認する。");
  lines.push("");
  lines.push("## 質問項目");
  lines.push("");

  let currentChapter = "";
  for (const section of template.sections) {
    if (section.level === 1) {
      currentChapter = `${section.no} ${section.titleJa}`;
      // 章見出しでも、子を持たず入力に対応する（fieldKey あり）章は設問化する。
      if (!section.fieldKey) continue;
    }
    // 入力に対応する（fieldKey あり）セクションを設問化する。
    if (!section.fieldKey) continue;
    const star = section.required ? "★" : "・";
    const hint = fieldHint[section.fieldKey] ?? section.fieldKey;
    const guidance = section.guidance ? ` — ${section.guidance}` : "";
    const label =
      section.level === 1
        ? `${section.no} ${section.titleJa}`
        : `${currentChapter} / ${section.no} ${section.titleJa}`;
    lines.push(`${star} [${label}]${guidance}`);
    lines.push(`   （収集先: ${hint}）`);
  }

  lines.push("");
  lines.push(
    "上記の質問が終わったら create_test_plan を呼び出してください。未収集の必須項目は " +
      "テスト計画書上で「未記入（必須）」と明示されます。"
  );

  return lines.join("\n");
}

export function registerTestPlanInterviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "test_plan_interview",
    {
      title: "Test Plan Interview",
      description:
        "質問形式でテスト計画書のコンテキストを収集するためのガイド。テンプレートの必須項目を中心に、ユーザーへ順に質問し create_test_plan を呼ぶよう誘導する。",
      argsSchema: {
        projectName: z
          .string()
          .optional()
          .describe("テスト対象システム／プロジェクト名（分かっていれば）"),
      },
    },
    (args) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: buildInterviewPrompt(testPlanTemplate, args.projectName),
          },
        },
      ],
    })
  );
}
