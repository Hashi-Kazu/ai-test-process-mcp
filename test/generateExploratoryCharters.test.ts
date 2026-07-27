import { describe, expect, it } from "vitest";
import { renderExploratoryCharters } from "../src/tools/generateExploratoryCharters.js";
import { registerTools } from "../src/tools/index.js";
import type { GenerateExploratoryChartersInput } from "../src/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const HEADINGS = [
  "## 1. 前提と宣言",
  "### 1.1 対象テスト条件",
  "### 1.2 リスク一覧",
  "### 1.3 セッション時間予算・記録方法・停止条件",
  "## 2. 観点区分カタログ(決定的層)",
  "## 3. チャーター表",
  "## 4. 決定的検査(自動)",
  "### 4.1 チャーターIDの重複・欠番・プレフィックス不一致",
  "### 4.2 未知の観点区分ID",
  "### 4.3 由来メタデータの未解決参照",
  "### 4.4 観点区分の未使用",
  "### 4.5 高優先度テスト条件・リスクの未カバー",
  "### 4.6 タイムボックスと時間予算",
  "### 4.7 ミッション文の主観語検査",
  "### 4.8 サマリ",
  "## 5. チャーター設計指示(意味的層)",
];

const baseInput: GenerateExploratoryChartersInput = {
  testConditions: [
    {
      id: "TC-001",
      target: "チケット購入",
      statement: "枚数上限|下限で切り替わる",
      derivedFrom: ["R-001"],
      priority: "高",
    },
  ],
};

describe("renderExploratoryCharters", () => {
  it("emits H1 exactly once and includes every required heading", () => {
    const markdown = renderExploratoryCharters(baseInput);
    expect(markdown.match(/^# /gm)?.length).toBe(1);
    expect(markdown).toContain("# 探索的テストチャーター生成結果");
    for (const heading of HEADINGS) {
      expect(markdown).toContain(heading);
    }
  });

  it("renders the 3節 table header exactly", () => {
    const markdown = renderExploratoryCharters(baseInput);
    expect(markdown).toContain(
      "| チャーターID | 観点区分 | 確認観点 | 操作観点 | 実施内容(ミッション) | 実施者・タイムボックス | 障害記録 |"
    );
  });

  it("returns generation-instruction-only output in section 5 when charters is omitted", () => {
    const markdown = renderExploratoryCharters(baseInput);
    const section5 = markdown.split("## 5. チャーター設計指示(意味的層)")[1];
    expect(section5).toContain("再度本ツールへ渡して決定的検査を通すこと");
  });

  it("returns generation-instruction-only output when charters is an empty array", () => {
    const markdown = renderExploratoryCharters({ ...baseInput, charters: [] });
    const section5 = markdown.split("## 5. チャーター設計指示(意味的層)")[1];
    expect(section5).toContain("再度本ツールへ渡して決定的検査を通すこと");
  });

  it("flags the expected issues across 4.1〜4.7 for a problematic charter set", () => {
    const input: GenerateExploratoryChartersInput = {
      testConditions: [
        { id: "TC-001", target: "チケット購入", statement: "上限確認", derivedFrom: ["R-001"], priority: "高" },
        { id: "TC-002", target: "キャンセル", statement: "取消確認", derivedFrom: ["R-002"], priority: "高" },
      ],
      risks: [{ id: "RK-001", description: "二重決済リスク" }],
      areaIds: ["ECA-01", "ECA-02"],
      sessionBudgetMinutes: 30,
      charters: [
        {
          charterId: "EXC-001",
          areaId: "ECA-01",
          mission: "適切に動作することを確認する",
          checkFocus: ["確認観点"],
          operationFocus: ["操作観点"],
          derivedFrom: ["TC-001"],
          timeboxMinutes: 60,
        },
        {
          charterId: "EXC-001", // duplicate
          areaId: "ECA-99", // unknown area
          mission: "境界を揺さぶる",
          checkFocus: ["確認観点"],
          operationFocus: ["操作観点"],
          derivedFrom: ["ZZ-999"], // unresolved ref
          // timeboxMinutes missing
        },
      ],
    };
    const markdown = renderExploratoryCharters(input);

    const section41 = markdown.split("### 4.1")[1].split("### 4.2")[0];
    expect(section41).toContain("重複: EXC-001(2件)");

    const section42 = markdown.split("### 4.2")[1].split("### 4.3")[0];
    expect(section42).toContain("ECA-99");

    const section43 = markdown.split("### 4.3")[1].split("### 4.4")[0];
    expect(section43).toContain("ZZ-999");

    const section44 = markdown.split("### 4.4")[1].split("### 4.5")[0];
    expect(section44).toContain("ECA-02");

    const section45 = markdown.split("### 4.5")[1].split("### 4.6")[0];
    expect(section45).toContain("TC-002");
    expect(section45).toContain("RK-001");

    const section46 = markdown.split("### 4.6")[1].split("### 4.7")[0];
    expect(section46).toContain("EXC-001"); // one of the duplicate ids missing timebox note is skipped since dup id reused; still ensure summary line exists
    expect(section46).toContain("予算超過");

    const section47 = markdown.split("### 4.7")[1].split("### 4.8")[0];
    expect(section47).toContain("適切に");
  });

  it("escapes pipe characters inside cells", () => {
    const markdown = renderExploratoryCharters(baseInput);
    expect(markdown).toContain("枚数上限\\|下限で切り替わる");
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(baseInput);
    const first = renderExploratoryCharters(baseInput);
    const second = renderExploratoryCharters(baseInput);
    expect(second).toBe(first);
    expect(JSON.stringify(baseInput)).toBe(snapshot);
  });

  it("registers the generate_exploratory_charters tool", () => {
    const registeredNames: string[] = [];
    const stub = {
      registerTool: (name: string, _config: unknown, _handler: unknown) => {
        registeredNames.push(name);
      },
    };
    registerTools(stub as unknown as McpServer);
    expect(registeredNames).toContain("generate_exploratory_charters");
  });
});
