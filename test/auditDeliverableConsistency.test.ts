import { describe, expect, it } from "vitest";
import { renderDeliverableConsistencyAudit } from "../src/tools/auditDeliverableConsistency.js";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import type { AuditDeliverableConsistencyInput, ConsistencyDeliverable } from "../src/types.js";

const FIXED_HEADINGS = [
  "# 成果物間整合性監査結果",
  "## 1. 監査対象",
  "### 1.1 投入された成果物",
  "### 1.2 入力ダイジェスト",
  "### 1.3 抽出サマリ",
  "## 2. 決定的検査(自動)",
  "### 2.1 参照テストベース文書リストの突き合わせ",
  "### 2.2 IDの成果物間相互参照",
  "### 2.3 章節参照の実在性",
  "### 2.4 同一項目・同一IDの記述差分",
  "### 2.5 件数・網羅率宣言と本文実体の照合",
  "### 2.6 指摘一覧",
  "### 2.7 サマリ",
  "## 3. 判定区分と対処指針",
  "## 4. 意味的確認の指示(意味的層)",
  "## 5. 決定的層で検出できない不整合の型",
  "## 次に実行すべきツール",
];

// --- 矛盾ありサンプル（sample/contest_testbase/2026 由来の抜粋） ---

const PLAN: ConsistencyDeliverable = {
  name: "テスト計画書.md",
  kind: "test-plan",
  content: `# テスト計画書

## 1 はじめに

### 1.3 参考文献

- 11_園内チケットシステム要求仕様書.pdf: 機能要求の一次情報
- 13_園内チケットシステム発券機画面仕様書.pdf: 発券機の画面遷移の詳細仕様
- 72_だんだん動物園入場システムデータ連携仕様書.pdf: システム間データ連携仕様

## 14 リスク

### 14.1 プロダクトリスク

| 区分 | 内容 |
| --- | --- |
| 構成変更 | 入場ゲートハブ新設に伴う整合性 |

## 15 特記事項

### 15.2 テストベース読解状況

本計画書はサンプル資料01・02・11号文書を精読して作成した。13(発券機画面仕様書)・72(データ連携仕様書)は未読のため、追加確認が必要。
`,
};

const ANALYSIS: ConsistencyDeliverable = {
  name: "テスト分析.md",
  kind: "test-analysis",
  content: `# テスト分析

## 0 本書の位置づけ

対象テストベースは以下のとおり。

- 11_園内チケットシステム要求仕様書.pdf
- 13_園内チケットシステム発券機画面仕様書.pdf
- 72_だんだん動物園入場システムデータ連携仕様書.pdf

## 1 要件分析

### 1.1 要件ID体系

テスト依頼元への質問状項目としても記録する（8.2節参照）。

## 2 テスト条件

### 2.1 プロダクトリスク

| ID | 内容 |
| --- | --- |
| R-01 | 複数ゲート間でQRコードの整合性が崩壊する |
| R-02 | 入場制限人数パラメータ変更の影響 |
| R-03 | 応答遅延 |
| R-04 | 決済通信障害時のフォールバック不備 |

うちR-01〜R-04はテスト計画書14.1プロダクトリスクと対応する。
`,
};

const DESIGN: ConsistencyDeliverable = {
  name: "テスト設計.md",
  kind: "test-design",
  content: `# テスト設計

## 3 テストケース

### 3.5 閾値のパラメータ名参照化

| ID | 対象 | 内容 |
| --- | --- | --- |
| TCS-010 | 入場制限人数 | 入場制限人数が上限値のとき入場不可となること |
| TCS-013 | 残数表示 | 残数がしきい値を下回ると表示が切り替わること |
| TCS-014 | 残数表示 | 残数が0のとき満了表示となること |
| TCS-015 | 入場制限人数 | 入場制限人数の既定値で入場可となること |
| TCS-040 | データ連携 | 連携ファイルの受信が成功すること |

対象リスクは R-01 である。

## 4 決定的検査結果(改修前の証跡)

| 指摘 | 件数 |
| --- | --- |
| 閾値の直値埋め込み | 7件（TCS-010, TCS-013, TCS-014, TCS-015, TCS-040。3.5節で改修済み） |
`,
};

const CONFLICTING_INPUT: AuditDeliverableConsistencyInput = {
  deliverables: [PLAN, ANALYSIS, DESIGN],
};

// --- 矛盾なしサンプル（相互に整合した2成果物） ---

const CONSISTENT_PLAN: ConsistencyDeliverable = {
  name: "計画書.md",
  kind: "test-plan",
  content: `# 計画書

## 1 はじめに

### 1.1 スコープ

- 入場ゲート複数台化
- 入場ゲートハブ新設

### 1.2 参考文献

- 11_園内チケットシステム要求仕様書.pdf
- 12_園内チケットシステムハードウェア仕様書.pdf
`,
};

const CONSISTENT_ANALYSIS: ConsistencyDeliverable = {
  name: "分析.md",
  kind: "test-analysis",
  content: `# 分析

## 1 位置づけ

### 1.1 スコープ

- 入場ゲート複数台化
- 入場ゲートハブ新設

テスト計画書1.1節のスコープをそのまま引き継ぐ。

### 1.2 参照したテストベース

- 11_園内チケットシステム要求仕様書.pdf
- 12_園内チケットシステムハードウェア仕様書.pdf

## 2 テスト条件

| ID | 内容 |
| --- | --- |
| TC-001 | 入場ゲートが3台構成で並行して入場処理できること |
`,
};

const CONSISTENT_INPUT: AuditDeliverableConsistencyInput = {
  deliverables: [CONSISTENT_PLAN, CONSISTENT_ANALYSIS],
};

function sectionBody(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.indexOf(heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

describe("renderDeliverableConsistencyAudit", () => {
  it("固定見出しが各1回だけ出力される", () => {
    const markdown = renderDeliverableConsistencyAudit(CONFLICTING_INPUT);
    for (const heading of FIXED_HEADINGS) {
      const count = markdown.split("\n").filter((l) => l === heading).length;
      expect(count, heading).toBe(1);
    }
  });

  it("末尾に「次に実行すべきツール」節が1回だけ現れる", () => {
    expectNextToolsSection(renderDeliverableConsistencyAudit(CONFLICTING_INPUT));
  });

  it("矛盾ありサンプルで DCC-01 / DCC-07 / DCC-09 / DCC-15 が該当節に現れる", () => {
    const markdown = renderDeliverableConsistencyAudit(CONFLICTING_INPUT);
    expect(sectionBody(markdown, "### 2.1 参照テストベース文書リストの突き合わせ")).toContain("DCC-01");
    expect(sectionBody(markdown, "### 2.2 IDの成果物間相互参照")).toContain("DCC-07");
    expect(sectionBody(markdown, "### 2.3 章節参照の実在性")).toContain("DCC-09");
    expect(sectionBody(markdown, "### 2.5 件数・網羅率宣言と本文実体の照合")).toContain("DCC-15");
  });

  it("2.1 に文書 × 成果物の状態マトリクスを出力する", () => {
    const markdown = renderDeliverableConsistencyAudit(CONFLICTING_INPUT);
    const body = sectionBody(markdown, "### 2.1 参照テストベース文書リストの突き合わせ");
    expect(body).toContain("| 文書 | ラベル | テスト計画書.md | テスト分析.md | テスト設計.md |");
    expect(body).toMatch(/\| 13 \| 園内チケットシステム発券機画面仕様書.pdf \| 読了\+未読 \| 読了 \| - \|/);
  });

  it("2.7 サマリの総指摘数が 2.6 指摘一覧の行数と一致する", () => {
    const markdown = renderDeliverableConsistencyAudit(CONFLICTING_INPUT);
    const listBody = sectionBody(markdown, "### 2.6 指摘一覧");
    const rowCount = listBody.split("\n").filter((l) => /^\| DC-\d{3} \|/.test(l)).length;
    const summaryBody = sectionBody(markdown, "### 2.7 サマリ");
    const m = /総指摘数: (\d+)\(うち high (\d+)\)/.exec(summaryBody);
    expect(m).not.toBeNull();
    expect(Number((m as RegExpExecArray)[1])).toBe(rowCount);
    expect(rowCount).toBeGreaterThan(0);
  });

  it("矛盾なしサンプルでは各検査節が「- なし」でサマリ総指摘0件", () => {
    const markdown = renderDeliverableConsistencyAudit(CONSISTENT_INPUT);
    for (const heading of [
      "### 2.1 参照テストベース文書リストの突き合わせ",
      "### 2.2 IDの成果物間相互参照",
      "### 2.3 章節参照の実在性",
      "### 2.4 同一項目・同一IDの記述差分",
      "### 2.5 件数・網羅率宣言と本文実体の照合",
      "### 2.6 指摘一覧",
    ]) {
      expect(sectionBody(markdown, heading), heading).toContain("- なし");
    }
    expect(sectionBody(markdown, "### 2.7 サマリ")).toContain("総指摘数: 0(うち high 0)");
  });

  it("任意入力が未指定なら「(要確認)」行を出力する", () => {
    const markdown = renderDeliverableConsistencyAudit(CONFLICTING_INPUT);
    const refBody = sectionBody(markdown, "### 2.1 参照テストベース文書リストの突き合わせ");
    expect(refBody).toContain("declaredReferencedDocuments が未指定");
    expect(refBody).toContain("idPrefixOwners が未指定");
    expect(refBody).toContain("(要確認)");
    expect(sectionBody(markdown, "### 2.5 件数・網羅率宣言と本文実体の照合")).toContain(
      "countClaimSubjects が未指定"
    );
  });

  it("任意入力を指定すると「(要確認)」行が消え、DCC-04 / DCC-05 が検査される", () => {
    const markdown = renderDeliverableConsistencyAudit({
      ...CONFLICTING_INPUT,
      declaredReferencedDocuments: [
        { deliverable: "テスト分析.md", readDocuments: ["11", "13", "72"] },
      ],
      idPrefixOwners: [{ documentKey: "13", prefixes: ["S-"] }],
      countClaimSubjects: [{ keyword: "プロダクトリスク", idPrefix: "R-" }],
    });
    const refBody = sectionBody(markdown, "### 2.1 参照テストベース文書リストの突き合わせ");
    expect(refBody).not.toContain("declaredReferencedDocuments が未指定");
    expect(refBody).not.toContain("idPrefixOwners が未指定");
    expect(sectionBody(markdown, "### 2.5 件数・網羅率宣言と本文実体の照合")).not.toContain(
      "countClaimSubjects が未指定"
    );
  });

  it("3節に DCC-01〜DCC-17 の17行が出力される", () => {
    const markdown = renderDeliverableConsistencyAudit(CONFLICTING_INPUT);
    const body = sectionBody(markdown, "## 3. 判定区分と対処指針");
    for (let i = 1; i <= 17; i++) {
      const id = `DCC-${String(i).padStart(2, "0")}`;
      expect(body.split("\n").filter((l) => l.startsWith(`| ${id} |`)).length, id).toBe(1);
    }
  });

  it("8/8(100%) だが本文定義IDが20件の入力で 2.5 節に DCC-16 が現れる", () => {
    const analysis20: ConsistencyDeliverable = {
      name: "分析.md",
      kind: "test-analysis",
      content: `# 分析\n\n## 2 テスト条件\n\n| ID | 内容 |\n| --- | --- |\n${Array.from(
        { length: 20 },
        (_, i) => `| TC-${String(i + 1).padStart(3, "0")} | 条件${i + 1} |`
      ).join("\n")}\n`,
    };
    const designRatio: ConsistencyDeliverable = {
      name: "設計比率.md",
      kind: "test-design",
      content: `# 設計\n\n### 3.6 網羅率\n\n| テスト条件網羅率 | 8/8（100%） |\n`,
    };
    const markdown = renderDeliverableConsistencyAudit({
      deliverables: [analysis20, designRatio],
      countClaimSubjects: [{ keyword: "テスト条件", idPrefix: "TC-" }],
    });
    expect(sectionBody(markdown, "### 2.5 件数・網羅率宣言と本文実体の照合")).toContain("DCC-16");
  });

  it("母集団を解決できない率宣言があるとき 2.5 節に母集団照合の(要確認)行が出る", () => {
    const markdown = renderDeliverableConsistencyAudit(CONFLICTING_INPUT);
    // CONFLICTING_INPUT の DESIGN には網羅率宣言が無いため、まず率宣言を含む入力を用意する
    const designWithRatio: ConsistencyDeliverable = {
      ...DESIGN,
      content: `${DESIGN.content}\n### 3.6 網羅率\n\n| 状態網羅 | 6/6（100.0%） |\n`,
    };
    const markdownWithRatio = renderDeliverableConsistencyAudit({
      deliverables: [PLAN, ANALYSIS, designWithRatio],
    });
    expect(sectionBody(markdownWithRatio, "### 2.5 件数・網羅率宣言と本文実体の照合")).toContain(
      "母集団照合ができない(要確認)"
    );
    expect(markdown).toBeDefined();
  });

  it("| を含む成果物名でもセルが崩れない", () => {
    const markdown = renderDeliverableConsistencyAudit({
      deliverables: [
        { ...PLAN, name: "テスト|計画書.md" },
        ANALYSIS,
      ],
    });
    expect(markdown).toContain("テスト\\|計画書.md");
    expect(markdown).not.toContain("| テスト|計画書.md |");
  });

  it("同一入力で2回描画しても同一の Markdown になる", () => {
    expect(renderDeliverableConsistencyAudit(CONFLICTING_INPUT)).toBe(
      renderDeliverableConsistencyAudit(CONFLICTING_INPUT)
    );
  });
});
