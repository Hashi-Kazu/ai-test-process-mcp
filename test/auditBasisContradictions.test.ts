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
      /- 総候補数: \d+\(high:\d+ \/ medium:\d+ \/ low:\d+\) \/ 検査別: BC-01:\d+, BC-02:\d+, BC-03:\d+, BC-04:\d+, BC-05:\d+, BC-06:\d+, BC-07:\d+, BC-08:\d+, BC-09:\d+, BC-10:\d+ \/ 対象文書数: \d+ \/ 確信度抑制件数: \d+ \/ 既知解消除外件数: \d+ \/ 抽出品質により除外: \d+件\(NF-01:\d+ \/ NF-02:\d+ \/ NF-03:\d+ \/ NF-04:\d+\)/
    );
  });

  it("ends with exactly one trailing newline", () => {
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });
});

describe("renderBasisContradictionAudit 抽出品質フィルタの自己申告", () => {
  it("2.11サマリに抽出品質による除外件数が出る。断片を含まない入力では0件になる", () => {
    const noFragmentMarkdown = renderBasisContradictionAudit({
      documents: [{ name: "doc", content: "特に矛盾のない普通の文章です。" }],
    });
    const summarySection = noFragmentMarkdown.split("### 2.11 サマリ")[1].split("## 3.")[0];
    expect(summarySection).toMatch(/抽出品質により除外: 0件\(NF-01:0 \/ NF-02:0 \/ NF-03:0 \/ NF-04:0\)/);
  });

  it("表セル断片を含む入力では除外件数が非ゼロになり、5章に(d)の自己申告項が出て件数が本文と一致する", () => {
    const fragmentInput: AuditBasisContradictionsInput = {
      documents: [
        {
          name: "doc",
          content: ["EH-900 発券機起動", "EH-900 い", "EH-900 パスワードの"].join("\n"),
        },
      ],
    };
    const markdown = renderBasisContradictionAudit(fragmentInput);
    const summarySection = markdown.split("### 2.11 サマリ")[1].split("## 3.")[0];
    const summaryMatch = summarySection.match(/抽出品質により除外: (\d+)件\(NF-01:(\d+) \/ NF-02:(\d+) \/ NF-03:(\d+) \/ NF-04:(\d+)\)/);
    expect(summaryMatch).not.toBeNull();
    const excludedTotal = Number(summaryMatch![1]);
    expect(excludedTotal).toBe(2);

    const section5 = markdown.split("## 5. 決定的層で検出できない矛盾の型")[1];
    expect(section5).toContain("(d)");
    expect(section5).toContain(`${excludedTotal} 件`);
  });
});

describe("renderBasisContradictionAudit 検査不能区分の明示", () => {
  it("ID出現・UI要素・遷移がいずれも0件のとき、BC-01〜BC-10すべてが検査不能と明示される", () => {
    const markdown = renderBasisContradictionAudit({
      documents: [
        { name: "実務文書A", content: "特に矛盾のない普通の文章です。" },
        { name: "実務文書B", content: "こちらも普通の文章です。" },
      ],
    });
    const summarySection = markdown.split("### 2.11 サマリ")[1].split("## 3.")[0];
    expect(summarySection).toContain(
      "検査不能(要確認)の区分: BC-01, BC-02, BC-03, BC-04, BC-05, BC-06, BC-07, BC-08, BC-09, BC-10"
    );
    expect(summarySection).toContain("ID出現・UI要素・遷移がいずれも0件のため");
    expect(summarySection).toContain("未指摘は合格を意味しない");
  });

  it("UI要素と遷移が0件で ID出現のみある場合、該当区分のみが列挙される", () => {
    const markdown = renderBasisContradictionAudit({
      documents: [{ name: "doc", content: "W-008-04 予約詳細画面" }],
    });
    const summarySection = markdown.split("### 2.11 サマリ")[1].split("## 3.")[0];
    const unavailableLine = summarySection.split("\n").find((l) => l.startsWith("- 検査不能"));
    expect(unavailableLine).toContain("検査不能(要確認)の区分: BC-02, BC-03, BC-04, BC-05, BC-06, BC-10");
    expect(unavailableLine).not.toContain("BC-01");
    expect(unavailableLine).not.toContain("BC-07");
    expect(unavailableLine).not.toContain("BC-08");
    expect(unavailableLine).not.toContain("BC-09");
  });

  it("ID出現・UI要素・遷移がいずれも非ゼロなら検査不能行は出ない", () => {
    const markdown = renderBasisContradictionAudit(baseInput);
    const summarySection = markdown.split("### 2.11 サマリ")[1].split("## 3.")[0];
    expect(summarySection).not.toContain("検査不能(要確認)の区分");
  });
});

describe("renderBasisContradictionAudit 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderBasisContradictionAudit(baseInput));
  });
});
