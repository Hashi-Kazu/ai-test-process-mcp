import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { expectInspectabilitySection, expectExecuted, expectUninspectable } from "./inspectabilitySectionHelper.js";
import { renderBasisContradictionAudit } from "../src/tools/auditBasisContradictions.js";
import { basisContradictionCriteria } from "../src/resources/basisContradictionCriteria.js";
import { MAX_PRIORITIZED_FINDING_ROWS } from "../src/findingPriority.js";
import {
  expectPrioritySectionInvariants,
  parsePriorityRows,
} from "./findingPrioritySectionHelper.js";
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
    // 2.1〜2.11（候補列挙節）から消えること。2.12は他候補の影響IDとして同IDに言及し得るため、
    // 「除外対象を主題とする候補行が出ない」ことを別に確認する。
    const section2 = withKnownResolved
      .split("## 2. 決定的検査(自動)")[1]
      .split("### 2.12")[0];
    expect(section2).not.toContain("W-008-04");
    const section212 = withKnownResolved.split("### 2.12")[1].split("## 3.")[0];
    const priorityRows = section212.split("\n").filter((l) => /^\| \d+ \| P[1-4] \|/.test(l));
    const withoutKnownResolvedRows = withoutKnownResolved
      .split("### 2.12")[1]
      .split("## 3.")[0]
      .split("\n")
      .filter((l) => /^\| \d+ \| P[1-4] \|/.test(l));
    expect(priorityRows.length).toBeLessThan(withoutKnownResolvedRows.length);
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

function buildLargeAuditInput(n: number): AuditBasisContradictionsInput {
  const doc1Lines: string[] = [];
  const doc2Lines: string[] = [];
  const declaredEntities: NonNullable<AuditBasisContradictionsInput["declaredEntities"]> = [];
  const revisionLines: string[] = [];
  for (let i = 1; i <= n; i++) {
    const id = `W-${String(i).padStart(4, "0")}-01`;
    doc1Lines.push(`${id} 画面名称A${i}`);
    doc2Lines.push(`${id} 画面名称B${i}`);
    declaredEntities.push({ id, name: `宣言名称${i}` });
    revisionLines.push(`2026/1/${(i % 28) + 1}V1.0.${i} 旧値${i}から新値${i}へ変更された`);
  }
  return {
    documents: [
      { name: "doc1", content: doc1Lines.join("\n") },
      { name: "doc2", content: [...doc2Lines, ...revisionLines].join("\n") },
    ],
    declaredEntities,
  };
}

describe("renderBasisContradictionAudit 件数上限つき既定出力(verbose)", () => {
  const largeInput = buildLargeAuditInput(250);
  const defaultMarkdown = renderBasisContradictionAudit(largeInput);
  const verboseMarkdown = renderBasisContradictionAudit({ ...largeInput, verbose: true });

  it("truncates default output below 40,000 chars while keeping every check section and summary counts", () => {
    expect(defaultMarkdown.length).toBeLessThan(40000);

    for (const heading of [
      "### 2.1 ",
      "### 2.2 ",
      "### 2.3 ",
      "### 2.4 ",
      "### 2.5 ",
      "### 2.6 ",
      "### 2.7 ",
      "### 2.8 ",
      "### 2.9 ",
      "### 2.10 ",
    ]) {
      expect(defaultMarkdown).toContain(heading);
    }

    const truncationLine = /全\d+件中 \d+件を表示（\d+件を省略）。全件は verbose: true で取得できる。/;
    expect(defaultMarkdown).toMatch(truncationLine);

    const defaultSummary = defaultMarkdown.split("### 2.11 サマリ")[1].split("### 2.12")[0];
    const verboseSummary = verboseMarkdown.split("### 2.11 サマリ")[1].split("### 2.12")[0];
    expect(defaultSummary).toBe(verboseSummary);
    for (const id of ["BC-01", "BC-02", "BC-03", "BC-04", "BC-05", "BC-06", "BC-07", "BC-08", "BC-09", "BC-10"]) {
      expect(defaultSummary).toContain(`${id}:`);
    }
  });

  it("verbose: true では打ち切り注記が出ず、候補行数が全件と一致する", () => {
    const truncationLine = /全\d+件中 \d+件を表示（\d+件を省略）。全件は verbose: true で取得できる。/;
    expect(verboseMarkdown).not.toMatch(truncationLine);
    const section21 = verboseMarkdown.split("### 2.1 ")[1].split("### 2.2")[0];
    expect((section21.match(/^- \[/gm) ?? []).length).toBe(250);
  });

  it("is deterministic across repeated calls", () => {
    const first = renderBasisContradictionAudit(largeInput);
    const second = renderBasisContradictionAudit(largeInput);
    expect(first).toBe(second);
  });

  it("verbose未指定時のみ冒頭の要約表示に関する1行が出る", () => {
    expect(defaultMarkdown).toContain("既定(verbose未指定/false)は要約表示。");
    expect(verboseMarkdown).not.toContain("既定(verbose未指定/false)は要約表示。");
  });
});

describe("renderBasisContradictionAudit 2.12 対処優先度順の候補一覧", () => {
  const largeInput = buildLargeAuditInput(250);
  const defaultMarkdown = renderBasisContradictionAudit(largeInput);
  const verboseMarkdown = renderBasisContradictionAudit({ ...largeInput, verbose: true });

  function section212(md: string): string {
    return md.split("### 2.12 対処優先度順の候補一覧")[1].split("## 3.")[0];
  }

  /** 2章の各検査節の「該当 N件」を合計して visible 件数をテスト側で独立に求める。 */
  function visibleCount(md: string): number {
    const chapter2 = md.split("## 2. 決定的検査(自動)")[1].split("### 2.12")[0];
    return (chapter2.match(/^- 該当 (\d+)件（/gm) ?? [])
      .map((l) => Number(/(\d+)/.exec(l)![1]))
      .reduce((a, b) => a + b, 0);
  }

  it("既定は上限20件・スコア降順・算出根拠の再計算一致・帯内訳合計が visible 件数と一致する", () => {
    const total = visibleCount(defaultMarkdown);
    expect(total).toBeGreaterThan(MAX_PRIORITIZED_FINDING_ROWS);
    const { rows } = expectPrioritySectionInvariants(section212(defaultMarkdown), {
      label: "対処優先度順の候補一覧",
      verbose: false,
      maxRows: MAX_PRIORITIZED_FINDING_ROWS,
      expectedTotal: total,
    });
    expect(rows.length).toBe(MAX_PRIORITIZED_FINDING_ROWS);
    expect(section212(defaultMarkdown)).toContain(
      "- 本表は矛盾の断定ではなく、確認着手順の提示である。"
    );
  });

  it("verbose: true では全件表示・打ち切り注記なし・帯内訳が既定と同値になる", () => {
    const total = visibleCount(defaultMarkdown);
    const defaultSummary = expectPrioritySectionInvariants(section212(defaultMarkdown), {
      label: "対処優先度順の候補一覧",
      verbose: false,
      maxRows: MAX_PRIORITIZED_FINDING_ROWS,
      expectedTotal: total,
    }).summary;
    const verboseSummary = expectPrioritySectionInvariants(section212(verboseMarkdown), {
      label: "対処優先度順の候補一覧",
      verbose: true,
      maxRows: MAX_PRIORITIZED_FINDING_ROWS,
      expectedTotal: visibleCount(verboseMarkdown),
    }).summary;
    for (const band of ["P1", "P2", "P3", "P4"] as const) {
      expect(verboseSummary[band]).toBe(defaultSummary[band]);
    }
    expect(section212(verboseMarkdown)).not.toContain("を省略）。全件は verbose: true で取得できる。");
  });

  it("severity は判定区分カタログの宣言値と一致する（スコアで上書きしない）", () => {
    const rows = parsePriorityRows(section212(verboseMarkdown));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const category = basisContradictionCriteria.categories.find((c) => c.id === row.categoryId);
      expect(category, `未知の区分ID: ${row.categoryId}`).toBeDefined();
      expect(row.severity).toBe(category!.severity);
    }
  });

  it("算出根拠セルの影響ID名・文書名がフィクスチャ本文から裏付けられる（verbose 全件）", () => {
    const rows = parsePriorityRows(section212(verboseMarkdown));
    let checked = 0;
    for (const row of rows) {
      for (const id of row.basis.impactedIdNames) {
        const expectedDocs = largeInput.documents
          .filter((d) => d.content.includes(id))
          .map((d) => d.name);
        expect(expectedDocs.length).toBeGreaterThan(0);
        for (const name of row.basis.documentNames) expect(expectedDocs).toContain(name);
        checked += 1;
      }
      if (row.place.includes("(見出しなし)")) {
        expect(row.basis.sectionResolved).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("minConfidence: high 指定時は 2.12 の対象件数が visible 件数と一致する（抑制済み候補を混入させない）", () => {
    // baseInput は high/medium/low が混在するため、抑制の有無で件数差が観測できる
    const all = renderBasisContradictionAudit(baseInput);
    const highOnly = renderBasisContradictionAudit({ ...baseInput, minConfidence: "high" });
    const allTotal = visibleCount(all);
    const highTotal = visibleCount(highOnly);
    expect(highTotal).toBeGreaterThan(0);
    expect(highTotal).toBeLessThan(allTotal);

    const { summary, rows } = expectPrioritySectionInvariants(section212(highOnly), {
      label: "対処優先度順の候補一覧",
      verbose: false,
      maxRows: MAX_PRIORITIZED_FINDING_ROWS,
      expectedTotal: highTotal,
    });
    expect(summary.total).toBe(highTotal);
    // 抑制された候補（medium/low の判定区分）が優先度一覧に混入していないこと
    const visibleIds = new Set(
      (highOnly.split("## 2. 決定的検査(自動)")[1].split("### 2.12")[0].match(/^- \[\w+\] (BC-\d+)/gm) ??
        []).map((l) => /(BC-\d+)/.exec(l)![1])
    );
    expect(visibleIds.size).toBe(highTotal);
    for (const row of rows) {
      expect(visibleIds.has(row.id)).toBe(true);
      const category = basisContradictionCriteria.categories.find((c) => c.id === row.categoryId);
      expect(category).toBeDefined();
    }
  });

  it("2.11 サマリの集計行が既定/verboseで完全一致する（検出件数不変）", () => {
    const summaryOf = (md: string) => md.split("### 2.11 サマリ")[1].split("### 2.12")[0];
    expect(summaryOf(defaultMarkdown)).toBe(summaryOf(verboseMarkdown));
  });

  it("既定出力が40,000字未満のままである", () => {
    expect(defaultMarkdown.length).toBeLessThan(40000);
  });

  it("候補0件では表を出さず「対象指摘なし」を出す", () => {
    const md = renderBasisContradictionAudit({
      documents: [{ name: "empty", content: "特に矛盾のない普通の文章です。" }],
    });
    const section = section212(md);
    expect(section).toContain("- 対象指摘なし（決定的検査の指摘が0件）。未指摘は合格を意味しない。");
    expect(section).not.toContain("| 順位 |");
  });
});

describe("renderBasisContradictionAudit 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderBasisContradictionAudit(baseInput));
  });
});

describe("renderBasisContradictionAudit 検査実行状況節", () => {
  it("対照表が出て、実行された検査の節ラベルが同一出力の見出しに現れる", () => {
    expectInspectabilitySection(renderBasisContradictionAudit(baseInput), "audit_basis_contradictions");
  });

  it("改訂宣言0件なら BC-09、数量パラメータ0件なら BC-08 が検査不能になる", () => {
    const md = renderBasisContradictionAudit(baseInput);
    expectUninspectable(md, "BC-09");
    expectUninspectable(md, "BC-08");
    expectExecuted(md, "BC-01");
    expectExecuted(md, "BC-02");
  });

  it("ID出現・UI要素・遷移がすべて0件なら全区分が検査不能になる", () => {
    const md = renderBasisContradictionAudit({
      documents: [{ name: "memo", content: "自由記述のみの文書。" }],
    });
    for (const id of ["BC-01", "BC-02", "BC-03", "BC-04", "BC-05", "BC-06", "BC-07", "BC-08", "BC-09", "BC-10"]) {
      expectUninspectable(md, id);
    }
  });
});
