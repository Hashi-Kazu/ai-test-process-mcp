import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { expectInspectabilitySection, expectExecuted, expectUninspectable } from "./inspectabilitySectionHelper.js";
import { z } from "zod";
import {
  renderRequirementsAnalysis,
  MAX_DUPLICATE_ID_LINES,
  MAX_UNRESOLVED_REFERENCE_LINES,
  MAX_REQUIREMENT_SOURCE_REFS,
} from "../src/tools/analyzeRequirements.js";
import { MAX_PRIORITIZED_FINDING_ROWS } from "../src/findingPriority.js";
import { designBoundaryValuesInputShape } from "../src/tools/designBoundaryValues.js";
import { qualityCharacteristicModel } from "../src/resources/qualityCharacteristics.js";
import { qualityInUseCharacteristicModel } from "../src/resources/qualityInUseCharacteristics.js";
import { questionPriorityDefinitions } from "../src/resources/testPlanTemplate.js";
import { buildDeterministicFindings } from "../src/requirementsAnalysis.js";
import type { AnalyzeRequirementsInput, TestBasisDocument } from "../src/types.js";

const docA: TestBasisDocument = {
  name: "doc-a.md",
  content: [
    "## 3. 購入条件",
    "- W-001 Web購入は利用日の29日後まで可能とする。",
    "- W-002 応答は3秒以内に返すこと。",
    "本項は W-999 を参照する。",
    "## 用語定義",
    "| 用語 | 定義 |",
    "| --- | --- |",
    "| 入場券 | 当日利用可能なチケット |",
    "| サーバ | 予約サービスを提供する機器 |",
  ].join("\n"),
};

const docB: TestBasisDocument = {
  name: "doc-b.md",
  content: [
    "## 2. 購入条件",
    "- W-001 Web購入は利用日の30日後まで可能とする。",
    "- W-003 必要な範囲で適切に通知する。",
    "サーバーの応答は速やかに返す。",
    "入場券の枚数上限は10枚。",
  ].join("\n"),
};

const baseInput: AnalyzeRequirementsInput = {
  documents: [docA, docB],
};

describe("renderRequirementsAnalysis", () => {
  it("includes all fixed section headings", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    expect(markdown).toContain("# 要件分析結果");
    expect(markdown).toContain("## 1. 対象文書");
    expect(markdown).toContain("## 2. 決定的分析(自動)");
    expect(markdown).toContain("### 2.1 要件ID体系");
    expect(markdown).toContain("### 2.2 数量表現の全文書横断集約");
    expect(markdown).toContain("### 2.3 境界値候補(design_boundary_values 連携)");
    expect(markdown).toContain("### 2.4 用語定義と本文使用の照合");
    expect(markdown).toContain("### 2.5 曖昧語・弱い語・未完成注記");
    expect(markdown).toContain("### 2.6 要件ID → テストベース根拠位置");
    expect(markdown).toContain("### 2.7 サマリ");
    expect(markdown).toContain("## 3. 指摘表");
    expect(markdown).toContain("## 4. 品質特性 × 要件のマッピング指示");
    expect(markdown).toContain("## 5. ステークホルダー別影響の抽出指示");
    expect(markdown).toContain("## 6. 変更差分の4区分");
    expect(markdown).toContain("## 7. 意味的分析の観点");
  });

  it("shows the 29/30 day contradiction in both the quantity table and the finding table", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    expect(markdown).toContain("29, 30");
    expect(markdown).toContain("矛盾");
  });

  it("emits a json block under 2.3 that parses and validates against the design_boundary_values schema", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    const match = /```json\n([\s\S]*?)\n```/.exec(markdown);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    const result = z.object(designBoundaryValuesInputShape).safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("emits a json block under 2.6 with a valid requirementSources array", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    const section26 = markdown.split("### 2.6 要件ID → テストベース根拠位置")[1].split("### 2.7")[0];
    const match = /```json\n([\s\S]*?)\n```/.exec(section26);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(Array.isArray(parsed.requirementSources)).toBe(true);
    expect(parsed.requirementSources.length).toBeGreaterThan(0);
    for (const ref of parsed.requirementSources) {
      expect(typeof ref.requirementId).toBe("string");
      expect(typeof ref.document).toBe("string");
      expect(typeof ref.startLine).toBe("number");
    }
  });

  it("lists every quality characteristic id by default and restricts when qualityCharacteristicIds is given", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    for (const c of qualityCharacteristicModel.characteristics) {
      expect(markdown).toContain(c.id);
    }

    const restricted = renderRequirementsAnalysis({ ...baseInput, qualityCharacteristicIds: ["QC-01"] });
    const section4 = restricted.split("## 4. 品質特性")[1].split("## 5.")[0];
    expect(section4).toContain("QC-01");
    for (const c of qualityCharacteristicModel.characteristics) {
      if (c.id === "QC-01") continue;
      expect(section4).not.toContain(c.id);
    }
  });

  it("lists every quality-in-use characteristic id by default", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    for (const c of qualityInUseCharacteristicModel.characteristics) {
      expect(markdown).toContain(c.id);
    }
  });

  it("restricts quality-in-use characteristics when qualityCharacteristicIds is given", () => {
    const restricted = renderRequirementsAnalysis({ ...baseInput, qualityCharacteristicIds: ["QU-04"] });
    const section4 = restricted.split("## 4. 品質特性")[1].split("## 5.")[0];
    expect(section4).toContain("QU-04");
    for (const c of qualityCharacteristicModel.characteristics) {
      expect(section4).not.toContain(c.id);
    }
    for (const c of qualityInUseCharacteristicModel.characteristics) {
      if (c.id === "QU-04") continue;
      expect(section4).not.toContain(c.id);
    }
  });

  it("places changeItems under the matching category heading and unclassified items under 未分類", () => {
    const markdown = renderRequirementsAnalysis({
      ...baseInput,
      changeItems: [
        { description: "新規機能A", category: "new" },
        { description: "既存機能Bの変更", category: "modified" },
        { description: "既存機能Cへの影響", category: "existing-impacted" },
        { description: "既存機能Dは影響なし", category: "existing-unaffected" },
        { description: "分類未定の項目E" },
      ],
    });
    expect(markdown).toContain("### 新規実装");
    expect(markdown).toContain("### 変更");
    expect(markdown).toContain("### 既存・影響あり");
    expect(markdown).toContain("### 既存・影響なし");
    expect(markdown).toContain("### 未分類(LLM が分類する)");
    expect(markdown).toContain("新規機能A");
    expect(markdown).toContain("既存機能Bの変更");
    expect(markdown).toContain("既存機能Cへの影響");
    expect(markdown).toContain("既存機能Dは影響なし");
    expect(markdown).toContain("分類未定の項目E");
  });

  it("does not throw when stakeholders are not provided and still shows the table and instruction", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    expect(markdown).toContain("| ステークホルダー | ニーズ・期待 | 懸念 | 導かれるテスト要求 |");
    expect(markdown).toContain("ステークホルダーごとに");
  });

  it("includes every question priority level in section 3", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    for (const def of questionPriorityDefinitions) {
      expect(markdown).toContain(def.level);
    }
  });

  it("ends with a trailing newline", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });
});

describe("renderRequirementsAnalysis - 入力ダイジェスト", () => {
  it("renders the input digest table in section 1 and keeps the document list lines", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    const section1 = markdown.split("## 1. 対象文書")[1].split("### 開発背景")[0];
    expect(section1).toContain("### 入力ダイジェスト");
    expect(section1).toContain("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照/目次) | 数値トークン |");
    expect(section1).toContain("| doc-a.md |");
    expect(section1).toContain("| doc-b.md |");
    expect(section1).toContain("- doc-a.md(行数: 9)");
    expect(section1).toContain(
      "- ダイジェストは投入されたテキストのみを対象とする。抜粋を投入した場合、以降の集計・検査はすべて抜粋の範囲に限定される。"
    );
  });

  it("flags a document with no detected ids and no other-prefix reference as [info] and counts it in the 2.7 summary", () => {
    const markdown = renderRequirementsAnalysis({
      documents: [...baseInput.documents, { name: "memo.md", content: "抜粋メモのみ" }],
    });
    expect(markdown).toContain(
      "- [info] memo.md: 検出IDが0件で、他文書が持つIDプレフィックスへの参照も無い。この文書はID体系を持たない文書であり、抜粋の指摘ではない。"
    );
    expect(markdown).toContain("ダイジェスト指摘数: 1");
  });
});

describe("renderRequirementsAnalysis - verbose", () => {
  it("shows the default-summary notice at the top of the output", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    expect(markdown).toContain("既定(verbose未指定/false)は要約表示。2.6節は根拠位置を絞り込んで表示する。全件が必要な場合は `verbose: true` を指定すること。");
  });

  it("shows a per-prefix count summary table in 2.6", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    const section26 = markdown.split("### 2.6 要件ID → テストベース根拠位置")[1].split("### 2.7")[0];
    expect(section26).toContain("| プレフィックス | 根拠位置数 |");
    expect(section26).toContain("| W- |");
  });

  it("by default lists only flagged (duplicate) IDs' source references in 2.6, excluding unflagged IDs", () => {
    const markdown = renderRequirementsAnalysis(baseInput);
    const section26 = markdown.split("### 2.6 要件ID → テストベース根拠位置")[1].split("### 2.7")[0];
    expect(section26).toContain("W-001");
    const tableSection = section26.split("| 要件ID | 文書 | 行範囲 | 章節 | 引用ラベル |")[1] ?? "";
    expect(tableSection).not.toContain("W-002");
    expect(tableSection).not.toContain("W-003");
  });

  it("lists source references for every requirement id when verbose is true", () => {
    const markdown = renderRequirementsAnalysis({ ...baseInput, verbose: true });
    const section26 = markdown.split("### 2.6 要件ID → テストベース根拠位置")[1].split("### 2.7")[0];
    const tableSection = section26.split("| 要件ID | 文書 | 行範囲 | 章節 | 引用ラベル |")[1] ?? "";
    expect(tableSection).toContain("W-001");
    expect(tableSection).toContain("W-002");
    expect(tableSection).toContain("W-003");
  });
});

describe("renderRequirementsAnalysis 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderRequirementsAnalysis(baseInput));
  });
});

describe("renderRequirementsAnalysis 検査実行状況節", () => {
  it("対照表が出て、実行された検査の節ラベルが同一出力の見出しに現れる", () => {
    expectInspectabilitySection(renderRequirementsAnalysis(baseInput), "analyze_requirements");
  });

  it("定義IDが0件なら要件ID体系と根拠位置照合が検査不能になる", () => {
    const md = renderRequirementsAnalysis({
      documents: [{ name: "note.md", content: ["# メモ", "上限は10件とする。"].join("\n") }],
    });
    expectUninspectable(md, "要件ID体系");
    expectUninspectable(md, "要件ID → テストベース根拠位置");
    expectExecuted(md, "数量表現の全文書横断集約");
    expectExecuted(md, "境界値候補");
  });

  it("数量表現が0件なら境界値候補が検査不能になる", () => {
    const md = renderRequirementsAnalysis({
      documents: [{ name: "note.md", content: ["# メモ", "処理は適切に行う。"].join("\n") }],
    });
    expectUninspectable(md, "境界値候補");
  });
});

// --- 既定出力の件数上限（大規模合成フィクスチャ） ---

/**
 * 9文書・要件ID 150種を doc01/doc02 の2文書にまたがって定義する大規模フィクスチャ。
 * - REQ-001〜REQ-050: doc01では見出し行・doc02では非見出し行で定義（重複severity=medium）
 * - REQ-051〜REQ-150: doc01・doc02ともに非見出し行で定義（重複severity=high）
 * - doc03: 未使用の用語定義を5件追加（低重大度の指摘を発生させる）
 * - doc04〜doc09: 文書数を9件に揃えるための最小限の文書
 */
function buildLargeFixtureDocuments(): TestBasisDocument[] {
  const pad = (n: number) => String(n).padStart(3, "0");

  const doc01Lines: string[] = ["# 要求仕様書1"];
  const doc02Lines: string[] = ["# 要求仕様書2"];
  for (let i = 1; i <= 150; i++) {
    const id = `REQ-${pad(i)}`;
    if (i <= 50) {
      doc01Lines.push(`### ${id} 見出し${pad(i)}`);
      doc01Lines.push(`本項は${id}の内容を定義する。`);
    } else {
      doc01Lines.push(`- ${id} 説明文${pad(i)}。`);
    }
    doc02Lines.push(`- ${id} doc02内の説明${pad(i)}。`);
  }

  const doc01: TestBasisDocument = { name: "doc01.md", content: doc01Lines.join("\n") };
  const doc02: TestBasisDocument = { name: "doc02.md", content: doc02Lines.join("\n") };

  // 未使用の用語定義を多数追加する。2.4節（用語照合表）は既定でも件数上限を設けないため、
  // 実測相当のテストベース規模（全体40,000字未満・2.6節比率20%未満）に近づけるための調整に使う。
  const termLines = ["## 用語定義", "| 用語 | 定義 |", "| --- | --- |"];
  for (let i = 1; i <= 150; i++) {
    termLines.push(`| 用語カテゴリ${pad(i)} | これは補足用語${pad(i)}の定義文であり本文中では使用されない想定の用語である |`);
  }
  const doc03: TestBasisDocument = { name: "doc03.md", content: termLines.join("\n") };

  const extraDocs: TestBasisDocument[] = [];
  for (let i = 4; i <= 9; i++) {
    extraDocs.push({
      name: `doc0${i}.md`,
      content: [`## 補足文書${i}`, `補足文書${i}の説明文。`].join("\n"),
    });
  }

  return [doc01, doc02, doc03, ...extraDocs];
}

const largeFixtureInput: AnalyzeRequirementsInput = { documents: buildLargeFixtureDocuments() };

// --- 算出根拠セルの分解と、テスト内で再宣言した配点表からの再計算 ---

interface ParsedBasis {
  severity: string;
  severityPoints: number;
  impactedIdCount: number;
  impactedIdNames: string[];
  impactedIdPoints: number;
  documentCount: number;
  documentNames: string[];
  documentPoints: number;
  sectionResolved: boolean;
  sectionPoints: number;
  band?: string;
}

function splitNames(text: string): string[] {
  if (text === "-") return [];
  return text.split(", ");
}

function parseBasisCell(cell: string): ParsedBasis {
  const m =
    /^severity=(high|medium|low|info)\((\d+)\) \/ 影響ID(\d+)件\((.*)\)=(\d+) \/ 文書(\d+)件\((.*)\)=(\d+) \/ 章節解決=(済|未)\((\d+)\)$/.exec(
      cell
    );
  expect(m, `算出根拠セルの形式不一致: ${cell}`).not.toBeNull();
  const [
    ,
    severity,
    severityPoints,
    idCount,
    idNames,
    idPoints,
    docCount,
    docNames,
    docPoints,
    sectionLabel,
    sectionPoints,
  ] = m!;
  return {
    severity,
    severityPoints: Number(severityPoints),
    impactedIdCount: Number(idCount),
    impactedIdNames: splitNames(idNames),
    impactedIdPoints: Number(idPoints),
    documentCount: Number(docCount),
    documentNames: splitNames(docNames),
    documentPoints: Number(docPoints),
    sectionResolved: sectionLabel === "済",
    sectionPoints: Number(sectionPoints),
  };
}

const TEST_SEVERITY_POINTS: Record<string, number> = { high: 30, medium: 15, low: 5, info: 0 };

function testImpactedIdPoints(n: number): number {
  if (n === 0) return 0;
  if (n === 1) return 2;
  if (n === 2) return 4;
  if (n <= 4) return 6;
  if (n <= 9) return 8;
  return 10;
}

function testCrossDocumentPoints(d: number): number {
  if (d <= 1) return 0;
  if (d === 2) return 6;
  if (d === 3) return 8;
  return 10;
}

/** 配点表を src から import せず、根拠セルの因子値から独立に再計算する。 */
function recomputeScore(p: ParsedBasis): number {
  expect(p.severityPoints).toBe(TEST_SEVERITY_POINTS[p.severity]);
  expect(p.impactedIdPoints).toBe(testImpactedIdPoints(p.impactedIdCount));
  expect(p.documentPoints).toBe(testCrossDocumentPoints(p.documentCount));
  expect(p.sectionPoints).toBe(p.sectionResolved ? 5 : 0);
  return (
    TEST_SEVERITY_POINTS[p.severity] +
    testImpactedIdPoints(p.impactedIdCount) +
    testCrossDocumentPoints(p.documentCount) +
    (p.sectionResolved ? 5 : 0)
  );
}

function bandOfScore(score: number): string {
  if (score >= 40) return "P1";
  if (score >= 30) return "P2";
  if (score >= 20) return "P3";
  return "P4";
}

describe("renderRequirementsAnalysis - 既定出力の件数上限", () => {
  it("2.1節の重複行が上限以下で、全件数・省略件数・verboseの案内を含む注記行がある", () => {
    const markdown = renderRequirementsAnalysis(largeFixtureInput);
    const section21 = markdown.split("### 2.1 要件ID体系")[1].split("### 2.2")[0];
    const dupLines = section21.split("\n").filter((l) => l.startsWith("  - [") || false);
    // 重複ID一覧行（"  - [severity] ..." 形式）のみを数える
    const listedDupLines = section21
      .split("\n")
      .filter((l) => /^  - \[(high|medium|low)\]/.test(l));
    expect(listedDupLines.length).toBeLessThanOrEqual(MAX_DUPLICATE_ID_LINES);
    expect(section21).toContain(
      `ID重複: 全150件中 ${MAX_DUPLICATE_ID_LINES}件を表示（${150 - MAX_DUPLICATE_ID_LINES}件を省略）。全件は verbose: true で取得できる。`
    );
    expect(dupLines.length).toBeGreaterThanOrEqual(0);
  });

  it("2.6節の表・JSONが上限件数で一致し、打ち切り注記に「表・JSONブロックともに同じ{shown}件」を含む", () => {
    const markdown = renderRequirementsAnalysis(largeFixtureInput);
    const section26 = markdown.split("### 2.6 要件ID → テストベース根拠位置")[1].split("### 2.7")[0];
    const tableSection = section26.split("| 要件ID | 文書 | 行範囲 | 章節 | 引用ラベル |")[1] ?? "";
    const tableRows = tableSection
      .split("\n")
      .filter((l) => l.startsWith("| REQ-"));
    expect(tableRows.length).toBeLessThanOrEqual(MAX_REQUIREMENT_SOURCE_REFS);
    const match = /```json\n([\s\S]*?)\n```/.exec(section26);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.requirementSources.length).toBe(tableRows.length);
    expect(section26).toContain(`表・JSONブロックともに同じ${MAX_REQUIREMENT_SOURCE_REFS}件`);
  });

  it("3章の指摘表が上限以下・スコア降順・内訳合計が全件数と一致し、打ち切り注記がある", () => {
    const markdown = renderRequirementsAnalysis(largeFixtureInput);
    const section3 = markdown.split("## 3. 指摘表")[1].split("## 4.")[0];
    const findingRows = section3.split("\n").filter((l) => l.startsWith("| F-"));
    expect(findingRows.length).toBeLessThanOrEqual(MAX_PRIORITIZED_FINDING_ROWS);

    // スコア列（10列表の9列目）が単調非増加であること
    const scores = findingRows.map((row) => Number(row.split("|")[9]?.trim()));
    for (const s of scores) expect(Number.isFinite(s)).toBe(true);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }

    // 算出根拠セルを分解し、テスト内で再宣言した配点表から再計算した値と一致すること
    for (const row of findingRows) {
      const cells = row.split("|");
      const parsed = parseBasisCell(cells[10]!.trim());
      expect(parsed.severity).toBe(cells[3]!.trim());
      expect(recomputeScore(parsed)).toBe(Number(cells[9]!.trim()));
      expect(parsed.band).toBeUndefined();
      expect(cells[8]!.trim()).toBe(bandOfScore(Number(cells[9]!.trim())));
    }

    const total = buildDeterministicFindings(largeFixtureInput.documents).length;
    const breakdownMatch = /- 指摘件数: 全(\d+)件（severity内訳 high: (\d+) \/ medium: (\d+) \/ low: (\d+)）。対処優先度スコア降順で上位(\d+)件を表示（残り(\d+)件）。/.exec(
      section3
    );
    expect(breakdownMatch).not.toBeNull();
    const [, totalStr, highStr, mediumStr, lowStr, shownStr, omittedStr] = breakdownMatch!;
    expect(Number(totalStr)).toBe(total);
    expect(Number(highStr) + Number(mediumStr) + Number(lowStr)).toBe(total);
    expect(Number(shownStr)).toBe(findingRows.length);
    expect(Number(shownStr) + Number(omittedStr)).toBe(total);

    expect(section3).toContain(
      `指摘表: 全${total}件中 ${findingRows.length}件を表示（${total - findingRows.length}件を省略）。全件は verbose: true で取得できる。`
    );
    expect(section3).toContain("- 優先度スコア配点: severity(high 30 / medium 15 / low 5 / info 0)");
  });

  it("同一スコア内で元のF-ID順が保たれる（安定ソート）", () => {
    const markdown = renderRequirementsAnalysis(largeFixtureInput);
    const section3 = markdown.split("## 3. 指摘表")[1].split("## 4.")[0];
    const findingRows = section3.split("\n").filter((l) => l.startsWith("| F-"));
    const byScore = new Map<number, number[]>();
    for (const row of findingRows) {
      const cells = row.split("|");
      const score = Number(cells[9]!.trim());
      const no = Number(cells[1]!.trim().replace("F-", ""));
      if (!byScore.has(score)) byScore.set(score, []);
      byScore.get(score)!.push(no);
    }
    let checkedGroups = 0;
    for (const [, numbers] of byScore) {
      if (numbers.length < 2) continue;
      checkedGroups += 1;
      for (let i = 1; i < numbers.length; i++) {
        expect(numbers[i]).toBeGreaterThan(numbers[i - 1]);
      }
    }
    expect(checkedGroups).toBeGreaterThan(0);
  });

  it("算出根拠セルの影響ID名・文書名がフィクスチャ本文から裏付けられる（verbose 全件）", () => {
    const markdown = renderRequirementsAnalysis({ ...largeFixtureInput, verbose: true });
    const section3 = markdown.split("## 3. 指摘表")[1].split("## 4.")[0];
    const findingRows = section3.split("\n").filter((l) => l.startsWith("| F-"));
    let checkedRows = 0;
    for (const row of findingRows) {
      const cells = row.split("|");
      const kind = cells[2]!.trim();
      const parsed = parseBasisCell(cells[10]!.trim());
      expect(parsed.impactedIdNames).not.toContain("ほか");
      expect(parsed.documentNames).not.toContain("ほか");

      // 該当箇所が (見出しなし) のときに限り 章節解決=未(0)
      const place = cells[4]!.trim();
      if (place.includes("(見出しなし)")) {
        expect(parsed.sectionResolved).toBe(false);
      }

      // ID重複は定義箇所の全文書から documents を導出しているため、本文の実在で突合できる
      if (kind !== "ID重複") continue;
      expect(parsed.impactedIdNames.length).toBe(1);
      const id = parsed.impactedIdNames[0];
      const expectedDocs = largeFixtureInput.documents
        .filter((d) => d.content.includes(id))
        .map((d) => d.name);
      expect(parsed.documentNames).toEqual(expectedDocs);
      checkedRows += 1;
    }
    expect(checkedRows).toBe(150);
  });

  it("verbose: true では3章の指摘表が全件・打ち切りなしで、優先度3列が全行に出る", () => {
    const markdown = renderRequirementsAnalysis({ ...largeFixtureInput, verbose: true });
    const section3 = markdown.split("## 3. 指摘表")[1].split("## 4.")[0];
    const findingRows = section3.split("\n").filter((l) => l.startsWith("| F-"));
    const total = buildDeterministicFindings(largeFixtureInput.documents).length;
    expect(findingRows.length).toBe(total);
    expect(section3).not.toContain("を省略）。全件は verbose: true で取得できる。");
    for (const row of findingRows) {
      const cells = row.split("|");
      expect(cells[8]!.trim()).toMatch(/^P[1-4]$/);
      const parsed = parseBasisCell(cells[10]!.trim());
      expect(recomputeScore(parsed)).toBe(Number(cells[9]!.trim()));
    }
  });

  it("既定出力の全文字数が40,000字未満である", () => {
    const markdown = renderRequirementsAnalysis(largeFixtureInput);
    expect(markdown.length).toBeLessThan(40000);
  });

  it("2.6節の文字数 / 全体文字数が0.20未満である", () => {
    const markdown = renderRequirementsAnalysis(largeFixtureInput);
    const section26 = markdown.split("### 2.6 要件ID → テストベース根拠位置")[1].split("### 2.7")[0];
    const ratio = section26.length / markdown.length;
    expect(ratio).toBeLessThan(0.2);
  });

  it("verbose: true では2.6節の表・JSONが根拠位置の全件（打ち切りなし）になる", () => {
    const markdown = renderRequirementsAnalysis({ ...largeFixtureInput, verbose: true });
    const section26 = markdown.split("### 2.6 要件ID → テストベース根拠位置")[1].split("### 2.7")[0];
    const tableSection = section26.split("| 要件ID | 文書 | 行範囲 | 章節 | 引用ラベル |")[1] ?? "";
    const tableRows = tableSection.split("\n").filter((l) => l.startsWith("| REQ-"));
    const match = /```json\n([\s\S]*?)\n```/.exec(section26);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    // 150 IDs each defined twice (doc01 + doc02) = 300 source references
    expect(tableRows.length).toBe(300);
    expect(parsed.requirementSources.length).toBe(300);
  });

  it("verbose: true では3章のF-行がF-01からの生成順(ソートなし)で全件出る", () => {
    const markdown = renderRequirementsAnalysis({ ...largeFixtureInput, verbose: true });
    const section3 = markdown.split("## 3. 指摘表")[1].split("## 4.")[0];
    const findingRows = section3.split("\n").filter((l) => l.startsWith("| F-"));
    const total = buildDeterministicFindings(largeFixtureInput.documents).length;
    expect(findingRows.length).toBe(total);
    const ids = findingRows.map((row) => row.split("|")[1].trim());
    for (let i = 0; i < ids.length; i++) {
      expect(ids[i]).toBe(`F-${String(i + 1).padStart(2, "0")}`);
    }
  });

  it("verbose: true の出力には打ち切り注記・severity内訳・追加アナウンスのいずれも現れない", () => {
    const markdown = renderRequirementsAnalysis({ ...largeFixtureInput, verbose: true });
    expect(markdown).not.toContain("を省略）。全件は verbose: true で取得できる。");
    expect(markdown).not.toContain("- 指摘件数: 全");
    expect(markdown).not.toContain(
      "既定では 2.1節のID重複・未解決参照、2.6節の根拠位置、3章の指摘表に件数上限を適用する。3章は対処優先度スコア降順に並べ替えたうえで打ち切り、打ち切った箇所には全件数と省略件数を併記する。"
    );
  });

  it("### 2.7 サマリ 直後の対象文書数行が既定出力とverbose:trueで完全一致する", () => {
    const defaultMarkdown = renderRequirementsAnalysis(largeFixtureInput);
    const verboseMarkdown = renderRequirementsAnalysis({ ...largeFixtureInput, verbose: true });
    const extractLine = (md: string) => md.split("### 2.7 サマリ")[1].split("\n").filter((l) => l.trim())[0];
    expect(extractLine(defaultMarkdown)).toBe(extractLine(verboseMarkdown));
  });

  it("### 2.7 サマリ の指摘件数・根拠位置数が打ち切りの影響を受けない", () => {
    const markdown = renderRequirementsAnalysis(largeFixtureInput);
    const summaryLine = markdown.split("### 2.7 サマリ")[1].split("\n").filter((l) => l.trim())[0];
    const total = buildDeterministicFindings(largeFixtureInput.documents).length;
    expect(summaryLine).toContain(`指摘件数: ${total}`);
    expect(summaryLine).toContain("根拠位置数: 300");
  });
});
