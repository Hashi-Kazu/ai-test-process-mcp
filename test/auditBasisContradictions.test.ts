import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderBasisContradictionAudit } from "../src/tools/auditBasisContradictions.js";
import type { AuditBasisContradictionsInput } from "../src/types.js";

const documents: AuditBasisContradictionsInput["documents"] = [
  {
    name: "21号",
    content: [
      "W-008-04 予約詳細画面",
      "「予約購入詳細へ」ボタンを押すと予約購入詳細画面に遷移する",
      "「開始」ボタンを押すと未知案内画面に遷移する",
    ].join("\n"),
  },
  {
    name: "22号",
    content: ["W-008-04 予約詳細画面", "「予約購入詳細へする」ボタンを押すと予約購入詳細画面に遷移する"].join("\n"),
  },
];

const baseInput: AuditBasisContradictionsInput = { documents };

const EXPECTED_HEADINGS = [
  "# テストベース仕様矛盾監査結果",
  "## 1. 監査対象",
  "### 1.1 投入されたテストベース文書",
  "### 1.2 抽出サマリ",
  "### 1.3 宣言カタログとの突合",
  "### 1.4 改訂宣言の反映状況",
  "## 2. 決定的検査(自動)",
  "### 2.1 同一IDの名称不一致",
  "### 2.2 構成要素ラベルの表記不一致",
  "### 2.3 構成要素の片側欠落",
  "### 2.4 同一トリガの遷移先不一致",
  "### 2.5 未定義の遷移先・表示先",
  "### 2.6 振る舞い未記述の操作要素",
  "### 2.7 一覧宣言と本文実体の主題不一致",
  "### 2.8 同一パラメータの値不一致",
  "### 2.9 改訂宣言の旧値が本文に残存",
  "### 2.10 少数派の遷移先(参考)",
  "### 2.11 サマリ",
  "## 3. 判定区分と対処指針",
  "## 4. 意味的確認の指示(意味的層)",
  "## 5. 決定的層で検出できない矛盾の型",
];

describe("renderBasisContradictionAudit", () => {
  const markdown = renderBasisContradictionAudit(baseInput);

  it("各見出しが1回だけ出力される", () => {
    const lines = markdown.split("\n");
    for (const heading of EXPECTED_HEADINGS) {
      expect(lines.filter((l) => l === heading)).toHaveLength(1);
    }
  });

  it("候補が無い検査節には - なし を出す", () => {
    const section = markdown.split("### 2.8 同一パラメータの値不一致")[1].split("### 2.9")[0];
    expect(section).toContain("- なし");
  });

  it("5章の『決定的層で検出できない矛盾の型』は候補0件でも必ず出力される", () => {
    const emptyMarkdown = renderBasisContradictionAudit({
      documents: [{ name: "empty", content: "特に矛盾のない普通の文章です。" }],
    });
    const section5 = emptyMarkdown.split("## 5. 決定的層で検出できない矛盾の型")[1];
    expect(section5).toContain("(a)");
    expect(section5).toContain("(b)");
    expect(section5).toContain("(c)");
    expect(section5).toContain("候補0件は");
  });

  it("minConfidence=high を指定すると low/medium 候補が出力されず、抑制件数がサマリに出る", () => {
    const highOnly = renderBasisContradictionAudit({ ...baseInput, minConfidence: "high" });
    const summarySection = highOnly.split("### 2.11 サマリ")[1];
    expect(summarySection).toMatch(/確信度抑制件数: [1-9]\d*/);
    expect(highOnly).not.toContain("[medium]");
    expect(highOnly).not.toContain("[low]");
  });

  it("knownResolved で除外した対象は候補から消え、1.3に理由付きで残る", () => {
    const withoutKnownResolved = renderBasisContradictionAudit(baseInput);
    expect(withoutKnownResolved).toContain("W-008-04");

    const withKnownResolved = renderBasisContradictionAudit({
      ...baseInput,
      knownResolved: [{ subject: "W-008-04", reason: "既に表記統一済みと確認済み" }],
    });
    const section2 = withKnownResolved.split("## 2. 決定的検査(自動)")[1].split("## 3.")[0];
    expect(section2).not.toContain("W-008-04");
    const section13 = withKnownResolved.split("### 1.3 宣言カタログとの突合")[1].split("### 1.4")[0];
    expect(section13).toContain("W-008-04");
    expect(section13).toContain("既に表記統一済みと確認済み");
  });

  it("テーブルセルのパイプ文字がエスケープされる", () => {
    const escaped = renderBasisContradictionAudit({
      documents: [{ name: "doc|X", content: "特に矛盾のない普通の文章です。" }],
    });
    expect(escaped).toContain("doc\\|X");
  });

  it("サマリ行が期待フォーマットで出る", () => {
    const section = markdown.split("### 2.11 サマリ")[1].split("## 3.")[0];
    expect(section).toMatch(
      /- 総候補数: \d+\(high:\d+ \/ medium:\d+ \/ low:\d+\) \/ 検査別: BC-01:\d+, BC-02:\d+, BC-03:\d+, BC-04:\d+, BC-05:\d+, BC-06:\d+, BC-07:\d+, BC-08:\d+, BC-09:\d+, BC-10:\d+ \/ 対象文書数: \d+ \/ 確信度抑制件数: \d+ \/ 既知解消除外件数: \d+/
    );
  });

  it("ends with exactly one trailing newline", () => {
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });
});

describe("renderBasisContradictionAudit 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderBasisContradictionAudit(baseInput));
  });
});
