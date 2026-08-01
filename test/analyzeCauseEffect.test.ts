import { describe, expect, it } from "vitest";
import { renderCauseEffectAnalysis } from "../src/tools/analyzeCauseEffect.js";
import type { AnalyzeCauseEffectInput } from "../src/types.js";

function baseInput(overrides: Partial<AnalyzeCauseEffectInput> = {}): AnalyzeCauseEffectInput {
  return {
    sectionId: "SEC-01",
    sectionTitle: "送料計算",
    specText: "会員である場合は送料を無料にする",
    causes: [{ id: "C1", statement: "会員である", quote: "会員である場合" }],
    effects: [{ id: "E1", statement: "送料を無料にする", quote: "送料を無料にする" }],
    edges: [{ from: "C1", to: "E1" }],
    ...overrides,
  };
}

// 指定した見出し行から、次の見出し行の直前までを切り出す。
function section(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.startsWith(heading));
  expect(start).toBeGreaterThanOrEqual(0);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,4} /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

const twoCauseInput = (overrides: Partial<AnalyzeCauseEffectInput> = {}): AnalyzeCauseEffectInput =>
  baseInput({
    specText: "会員である場合は送料を無料にする\nクーポンを保持する場合は送料を無料にする",
    causes: [
      { id: "C1", statement: "会員である", quote: "会員である場合" },
      { id: "C2", statement: "クーポンを保持する", quote: "クーポンを保持する場合" },
    ],
    effects: [{ id: "E1", statement: "送料を無料にする", logic: "or", quote: "送料を無料にする" }],
    edges: [
      { from: "C1", to: "E1" },
      { from: "C2", to: "E1" },
    ],
    ...overrides,
  });

describe("renderCauseEffectAnalysis", () => {
  it("renders the fixed title and all section headings", () => {
    const md = renderCauseEffectAnalysis(baseInput());

    expect(md.startsWith("# 原因結果グラフ分析結果\n")).toBe(true);
    for (const heading of [
      "## 1. 前提と宣言",
      "### 1.1 対象セクション",
      "### 1.2 原因一覧",
      "### 1.3 結果一覧",
      "### 1.4 中間ノード",
      "### 1.5 制約一覧",
      "## 2. 原因結果グラフ",
      "### 2.1 mermaid 図",
      "### 2.2 辺一覧",
      "## 3. 決定的検査(自動)",
      "### 3.1 グラフ構造検査",
      "### 3.2 孤立原因",
      "### 3.3 導出されない結果",
      "### 3.4 中間ノードの片側未接続",
      "### 3.5 制約の整合性",
      "### 3.6 組合せ数とデシジョンテーブル列数",
      "### 3.7 結果の可変性検査",
      "### 3.8 引用の仕様文実在照合",
      "### 3.9 仕様文のモデル化網羅",
      "### 3.10 論理接続語のモデル反映検査",
      "### 3.11 曖昧語(参考)",
      "### 3.12 サマリ",
      "## 4. 判定区分と対処指針(カタログ)",
      "## 5. デシジョンテーブルへの引き渡し",
      "### 5.1 条件項目・動作項目",
      "### 5.2 ルール表(圧縮後)",
      "### 5.3 design_decision_table 入力(JSON)",
      "## 6. 追加モデリング指示(意味的層)",
    ]) {
      expect(md).toContain(heading);
    }
  });

  it("reports an isolated cause in section 3.2", () => {
    const md = renderCauseEffectAnalysis(
      baseInput({
        specText: "会員である場合は送料を無料にする\n住所を登録する",
        causes: [
          { id: "C1", statement: "会員である", quote: "会員である場合" },
          { id: "C2", statement: "住所を登録する", quote: "住所を登録する" },
        ],
        effects: [{ id: "E1", statement: "送料を無料にする", quote: "送料を無料にする" }],
        intermediateNodes: [{ id: "N1", statement: "行き止まり" }],
        edges: [
          { from: "C1", to: "E1" },
          { from: "C2", to: "N1" },
        ],
      })
    );

    const s32 = section(md, "### 3.2 孤立原因");
    expect(s32).toContain("[high] CEG-04");
    expect(s32).toContain("C2");
    expect(s32).not.toContain("C1:");
  });

  it("grounds the combination counts in section 3.6 against the rule table in section 5.2", () => {
    const md = renderCauseEffectAnalysis(twoCauseInput());

    const s36 = section(md, "### 3.6 組合せ数とデシジョンテーブル列数");
    expect(s36).toContain("理論上限の組合せ数: 2^2 = 4");
    expect(s36).toContain("制約充足後の組合せ数(=デシジョンテーブル列数): 4");
    expect(s36).toContain("圧縮後の列数: 3");
    expect(s36).toContain("5.2 節のルール表本文（圧縮後 3 行）に一致する");

    const s52 = section(md, "### 5.2 ルール表(圧縮後)");
    const ruleRows = s52.split("\n").filter((line) => /^\| \d+ \|/.test(line));
    expect(ruleRows).toHaveLength(3);
  });

  it("emits no counts but a 未算出 reason in 3.6 / 5.2 / 5.3 when full enumeration is skipped", () => {
    const md = renderCauseEffectAnalysis(twoCauseInput({ maxEnumerationCauses: 1 }));

    const s36 = section(md, "### 3.6 組合せ数とデシジョンテーブル列数");
    expect(s36).toContain("未算出（理由:");
    expect(s36).not.toContain("制約充足後の組合せ数(=デシジョンテーブル列数)");
    expect(s36).not.toContain("圧縮後の列数");

    const s52 = section(md, "### 5.2 ルール表(圧縮後)");
    expect(s52).toContain("未算出（理由:");
    expect(s52.split("\n").filter((line) => /^\| \d+ \|/.test(line))).toHaveLength(0);

    const s53 = section(md, "### 5.3 design_decision_table 入力(JSON)");
    expect(s53).toContain("未算出（理由:");
    expect(s53).not.toContain("```json");
  });

  it("reports the declared and the computed rule count when they disagree", () => {
    const md = renderCauseEffectAnalysis(twoCauseInput({ expectedRuleCount: 3 }));

    const s36 = section(md, "### 3.6 組合せ数とデシジョンテーブル列数");
    expect(s36).toContain("宣言列数: 3 / 算出列数: 4 / 判定: 不一致");
    expect(s36).toContain("CEG-19");
  });

  it("shows the modeled sentence ratio and the body of every unmodeled sentence in 3.9", () => {
    const md = renderCauseEffectAnalysis(
      baseInput({
        specText: "会員である場合は送料を無料にする。返品期限は14日以内とする。",
      })
    );

    const s39 = section(md, "### 3.9 仕様文のモデル化網羅");
    expect(s39).toContain("モデル化率: 1/2 (50.0%)");
    expect(s39).toContain("[medium] CEG-16 文2: 「返品期限は14日以内とする」");
  });

  it("emits a design_decision_table-ready DecisionTableSpec JSON in 5.3", () => {
    const md = renderCauseEffectAnalysis(twoCauseInput());

    const s53 = section(md, "### 5.3 design_decision_table 入力(JSON)");
    expect(s53).toContain("```json");
    const jsonText = s53.split("```json")[1].split("```")[0];
    const spec = JSON.parse(jsonText);

    expect(spec.conditions.every((c: { levels: string[] }) => JSON.stringify(c.levels) === JSON.stringify(["T", "F"]))).toBe(
      true
    );
    for (const rule of spec.rules) {
      for (const value of Object.values(rule.actions)) {
        expect(["Y", "N", "-"]).toContain(value);
      }
    }
    for (const invalid of spec.invalidCombinations) {
      expect(invalid.reason).toMatch(/CN\d+|制約/);
    }
    expect(s53).toContain("design_decision_table ツールの入力としてそのまま渡せる形式（DecisionTableSpec）である");
  });

  it("5.3 の JSON を computeDecisionTableRows へ渡すと high の DTC 指摘が0件で、有効組合せ数が原因結果グラフの制約充足後の件数と一致する", async () => {
    const { computeDecisionTableRows } = await import("../src/tools/designDecisionTable.js");
    const input = twoCauseInput();
    const md = renderCauseEffectAnalysis(input);
    const s53 = section(md, "### 5.3 design_decision_table 入力(JSON)");
    const jsonText = s53.split("```json")[1].split("```")[0];
    const spec = JSON.parse(jsonText);

    const result = computeDecisionTableRows(spec);
    expect(result.findings.filter((f) => f.severity === "high")).toHaveLength(0);
    expect(result.validCombinationCount).toBe(4);
    expect(s53).toContain("突き合わせ結果: 一致");
  });

  it("no longer mentions design_decision_table as unimplemented", () => {
    const md = renderCauseEffectAnalysis(twoCauseInput());
    expect(md).not.toContain("未実装");
  });

  it("lists every catalog category CEG-01..CEG-20 in section 4", () => {
    const md = renderCauseEffectAnalysis(baseInput());
    const s4 = section(md, "## 4. 判定区分と対処指針(カタログ)");

    for (let i = 1; i <= 20; i++) {
      const id = `CEG-${String(i).padStart(2, "0")}`;
      expect(s4).toContain(`| ${id} |`);
    }
  });

  it("says there is nothing more to do for a sound model", () => {
    const md = renderCauseEffectAnalysis(baseInput());
    const s6 = section(md, "## 6. 追加モデリング指示(意味的層)");

    expect(s6).toContain("- 追加の対応指示なし。");
  });

  it("does not throw when no sentence of specText is linked to any node", () => {
    const input = baseInput({
      specText: "本節は用語の定義のみを述べる。以降の章で参照する。",
      causes: [{ id: "C1", statement: "会員である" }],
      effects: [{ id: "E1", statement: "送料を無料にする" }],
      edges: [{ from: "C1", to: "E1" }],
    });

    expect(() => renderCauseEffectAnalysis(input)).not.toThrow();
    const md = renderCauseEffectAnalysis(input);
    expect(section(md, "### 3.9 仕様文のモデル化網羅")).toContain("モデル化率: 0/2 (0.0%)");
  });
});
