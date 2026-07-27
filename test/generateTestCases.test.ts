import { describe, expect, it } from "vitest";
import { renderTestCases } from "../src/tools/generateTestCases.js";
import type { GenerateTestCasesInput } from "../src/types.js";

const HEADINGS = [
  "## 1. 前提と宣言",
  "### 1.1 対象テスト条件",
  "### 1.2 適用技法と選定根拠",
  "### 1.3 採用した網羅基準",
  "### 1.4 閾値パラメータ表",
  "## 2. 網羅対象一覧(決定的層)",
  "## 3. テストケース仕様",
  "### 3.1 ケース一覧",
  "### 3.2 ケース詳細",
  "## 4. 決定的検査(自動)",
  "### 4.1 網羅率",
  "### 4.2 未充足の網羅対象",
  "### 4.3 テスト条件 × テストケース トレーサビリティ",
  "### 4.4 ケースIDの重複・欠番・プレフィックス不一致",
  "### 4.5 由来メタデータの未解決参照",
  "### 4.6 期待結果の主観語・空欄検査",
  "### 4.7 手順の粒度検査",
  "### 4.8 閾値の直値埋め込み検査",
  "### 4.9 サマリ",
  "## 5. 技法選定決定表(カタログ)",
  "## 6. テストケース組み立て指示(意味的層)",
];

const baseInput: GenerateTestCasesInput = {
  testConditions: [
    {
      id: "TC-001",
      target: "チケット購入",
      statement: "枚数が上限|下限で切り替わる",
      derivedFrom: ["R-001"],
      basisCharacteristics: ["入力が範囲を持つ"],
    },
  ],
  requirementIds: ["R-001"],
  parameters: [{ name: "MAX_TICKETS", value: "10", unit: "枚", source: "R-001" }],
  boundaryVariables: [{ name: "枚数", min: 1, max: 10 }],
  boundaryMode: "two",
};

describe("renderTestCases", () => {
  it("emits H1 exactly once and includes every required heading", () => {
    const markdown = renderTestCases(baseInput);
    expect(markdown.match(/^# /gm)?.length).toBe(1);
    expect(markdown).toContain("# テストケース生成結果");
    for (const heading of HEADINGS) {
      expect(markdown).toContain(heading);
    }
  });

  it("renders the 3.1 table header", () => {
    const markdown = renderTestCases(baseInput);
    expect(markdown).toContain("| ケースID | タイトル | 由来条件ID | 技法 | 優先度 | テストタイプ | 網羅対象 |");
  });

  it("renders the 1.1 table header with the source location column", () => {
    const markdown = renderTestCases(baseInput);
    expect(markdown).toContain("| 条件ID | 対象 | 条件文 | 優先度 | 由来 | 根拠位置 |");
  });

  it("renders the 4.3 table header with the source location column", () => {
    const markdown = renderTestCases(baseInput);
    expect(markdown).toContain("| 条件ID | 紐づくケースID | 件数 | 根拠位置 |");
  });

  it("marks the source location as 未特定 when requirementSources is not provided", () => {
    const markdown = renderTestCases(baseInput);
    const conditionRow = markdown.split("\n").find((l) => l.startsWith("| TC-001 |"));
    expect(conditionRow).toContain("未特定");
  });

  it("resolves and shows the source citation when requirementSources is provided", () => {
    const input: GenerateTestCasesInput = {
      ...baseInput,
      requirementSources: [
        {
          requirementId: "R-001",
          document: "spec.md",
          startLine: 652,
          endLine: 677,
          label: "EH-100 発券機起動",
        },
      ],
    };
    const markdown = renderTestCases(input);
    const conditionRow = markdown.split("\n").find((l) => l.startsWith("| TC-001 |"));
    expect(conditionRow).toContain("(EH-100 発券機起動, line 652-677)");
  });

  it("outputs a 根拠: line right after each case heading in 3.2", () => {
    const input: GenerateTestCasesInput = {
      ...baseInput,
      requirementSources: [
        { requirementId: "R-001", document: "spec.md", startLine: 10, endLine: 20 },
      ],
      testCases: [
        {
          caseId: "TCS-001",
          title: "下限で購入できる",
          testConditionId: "TC-001",
          derivedFrom: ["R-001"],
          techniqueId: "boundary-value-analysis",
          coverageTargets: ["BV:枚数:0"],
          preconditions: [{ name: "state", value: "初期状態" }],
          steps: [{ no: 1, action: "0枚で購入する", expected: "購入できない" }],
        },
      ],
    };
    const markdown = renderTestCases(input);
    const idx = markdown.indexOf("#### TCS-001 下限で購入できる");
    expect(idx).toBeGreaterThan(-1);
    const after = markdown.slice(idx).split("\n");
    expect(after[2]).toBe("根拠: (spec.md, line 10-20)");
  });

  it("shows 未特定(要記入) for cases with no resolvable source", () => {
    const markdown = renderTestCases({
      ...baseInput,
      testCases: [
        {
          caseId: "TCS-001",
          title: "テスト",
          testConditionId: "TC-001",
          derivedFrom: ["R-001"],
          techniqueId: "boundary-value-analysis",
          coverageTargets: ["BV:枚数:0"],
          preconditions: [{ name: "state", value: "初期状態" }],
          steps: [{ no: 1, action: "操作", expected: "結果" }],
        },
      ],
    });
    expect(markdown).toContain("根拠: 未特定(要記入)");
  });

  it("returns generation-instruction-only output when testCases is omitted", () => {
    const markdown = renderTestCases(baseInput);
    const section6 = markdown.split("## 6. テストケース組み立て指示(意味的層)")[1];
    expect(section6).toContain("再度本ツールへ渡して決定的検査を通すこと");
  });

  it("reports 50.0% coverage ratio when half of a technique's targets are covered", () => {
    const input: GenerateTestCasesInput = {
      ...baseInput,
      boundaryVariables: [{ name: "枚数", min: 1, max: 2 }],
      boundaryMode: "two",
      testCases: [
        {
          caseId: "TCS-001",
          title: "下限-刻みで購入不可",
          testConditionId: "TC-001",
          derivedFrom: ["R-001"],
          techniqueId: "boundary-value-analysis",
          coverageTargets: ["BV:枚数:0"],
          preconditions: [{ name: "state", value: "初期状態" }],
          steps: [{ no: 1, action: "0枚で購入する", expected: "購入できない" }],
        },
        {
          caseId: "TCS-002",
          title: "下限で購入できる",
          testConditionId: "TC-001",
          derivedFrom: ["R-001"],
          techniqueId: "boundary-value-analysis",
          coverageTargets: ["BV:枚数:1"],
          preconditions: [{ name: "state", value: "初期状態" }],
          steps: [{ no: 1, action: "1枚で購入する", expected: "購入できる" }],
        },
      ],
    };
    // universe has 4 targets: 0,1,2,3 -> 2 covered => 50%
    const markdown = renderTestCases(input);
    expect(markdown).toContain("50.0%");
  });

  it("flags subjective expected results, hardcoded values, and unresolved refs in their sections", () => {
    const input: GenerateTestCasesInput = {
      ...baseInput,
      testCases: [
        {
          caseId: "TCS-001",
          title: "テスト",
          testConditionId: "TC-999", // unresolved
          derivedFrom: ["R-999"], // unresolved against requirementIds
          techniqueId: "boundary-value-analysis",
          coverageTargets: ["BV:枚数:0"],
          preconditions: [{ name: "state", value: "初期状態" }],
          steps: [{ no: 1, action: "10枚購入する", expected: "適切に表示される" }],
        },
      ],
    };
    const markdown = renderTestCases(input);
    const section46 = markdown.split("### 4.6 期待結果の主観語・空欄検査")[1].split("### 4.7")[0];
    expect(section46).toContain("適切に");
    const section48 = markdown.split("### 4.8 閾値の直値埋め込み検査")[1].split("### 4.9")[0];
    expect(section48).toContain("MAX_TICKETS");
    const section45 = markdown.split("### 4.5 由来メタデータの未解決参照")[1].split("### 4.6")[0];
    expect(section45).toContain("TC-999");
    expect(section45).toContain("R-999");
  });

  it("escapes pipe characters inside cells", () => {
    const markdown = renderTestCases(baseInput);
    expect(markdown).toContain("枚数が上限\\|下限で切り替わる");
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(baseInput);
    const first = renderTestCases(baseInput);
    const second = renderTestCases(baseInput);
    expect(second).toBe(first);
    expect(JSON.stringify(baseInput)).toBe(snapshot);
  });
});
