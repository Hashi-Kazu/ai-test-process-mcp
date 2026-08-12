import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { expectInspectabilitySection, expectExecuted, expectUninspectable } from "./inspectabilitySectionHelper.js";
import {
  renderIdPopulationAudit,
  buildIdPopulationPriorityInputs,
} from "../src/tools/auditIdPopulation.js";
import { buildDefinedIdIndex } from "../src/idPopulationAnalysis.js";
import { idPopulationAuditCriteria } from "../src/resources/idPopulationAuditCriteria.js";
import { MAX_PRIORITIZED_FINDING_ROWS } from "../src/findingPriority.js";
import {
  expectPrioritySectionInvariants,
  parsePriorityRows,
} from "./findingPrioritySectionHelper.js";
import type { AuditIdPopulationInput, TestBasisDocument } from "../src/types.js";

const documents: AuditIdPopulationInput["documents"] = [
  {
    name: "doc-A",
    content: ["# doc-A", "EH-100 発券機起動", "EH-101 発券機停止"].join("\n"),
  },
  {
    name: "doc-B",
    content: ["# doc-B|注記", "W-001 警告表示", "W-002 警告解除"].join("\n"),
  },
];

const input: AuditIdPopulationInput = {
  documents,
  declaredPopulations: [{ toolName: "extract_test_conditions", ids: ["EH-100", "EH-101"] }],
};

const markdown = renderIdPopulationAudit(input);

describe("renderIdPopulationAudit", () => {
  it("renders section 2.2 exactly once and lists never-declared ids as high severity", () => {
    expect(markdown.split("\n").filter((l) => l === "### 2.2 未宣言ID一覧")).toHaveLength(1);
    expect(markdown).toContain("- [high] W-001");
  });

  it("emits 未宣言IDなし and no [high] never-declared line when all ids are declared", () => {
    const fullInput: AuditIdPopulationInput = {
      documents,
      declaredPopulations: [
        { toolName: "extract_test_conditions", ids: ["EH-100", "EH-101", "W-001", "W-002"] },
      ],
    };
    const md = renderIdPopulationAudit(fullInput);
    const section = md.split("### 2.2 未宣言ID一覧")[1].split("### 2.3")[0];
    expect(section).toContain("- 未宣言IDなし");
    expect(section).not.toContain("[high]");
  });

  it("renders the summary line matching the expected format", () => {
    expect(markdown).toContain(
      "- 定義ID総数: 4 / 宣言済み: 2 / 除外宣言: 0 / 未宣言: 2 / 母集団反映率: 50%"
    );
  });

  it("reports missing documents with [high] when expectedDocumentNames is provided, and (要確認) otherwise", () => {
    const withExpected = renderIdPopulationAudit({
      ...input,
      expectedDocumentNames: ["doc-A", "doc-B", "doc-C"],
    });
    const section6 = withExpected.split("### 2.6")[1].split("### 2.7")[0];
    expect(section6).toContain("[high] doc-C");

    const withoutExpected = markdown.split("### 2.6")[1].split("### 2.7")[0];
    expect(withoutExpected).toContain("(要確認)");
  });

  it("escapes pipe characters in table cells such as headings", () => {
    expect(markdown).toContain("doc-B\\|注記");
  });

  it("ends with exactly one trailing newline", () => {
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });
});

describe("renderIdPopulationAudit - 入力ダイジェスト", () => {
  it("renders the input digest table in 1.1 with escaped document names", () => {
    const section11 = markdown.split("### 1.1 投入されたテストベース文書")[1].split("### 1.2")[0];
    expect(section11).toContain("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照/目次) | 数値トークン |");
    expect(section11).toContain("| doc-A |");
    expect(section11).toContain("| doc-B |");
    const escaped = renderIdPopulationAudit({
      ...input,
      documents: [{ name: "doc|X", content: "EH-100 発券機起動" }],
    });
    expect(escaped).toContain("| doc\\|X |");
    expect(section11).toContain("- doc-A");
    expect(section11).toContain(
      "- ダイジェストは投入されたテキストのみを対象とする。抜粋を投入した場合、以降の集計・検査はすべて抜粋の範囲に限定される。"
    );
    expect(markdown).toContain("ダイジェスト指摘数: 0");
  });

  it("flags a document with no detected ids and no other-prefix reference as [info] and counts it in the 2.8 summary", () => {
    const md = renderIdPopulationAudit({
      ...input,
      documents: [...documents, { name: "doc-C", content: "抜粋メモのみ" }],
    });
    expect(md).toContain(
      "- [info] doc-C: 検出IDが0件で、他文書が持つIDプレフィックスへの参照も無い。この文書はID体系を持たない文書であり、抜粋の指摘ではない。"
    );
    expect(md).toContain("ダイジェスト指摘数: 1");
  });
});

describe("renderIdPopulationAudit - 数値のみのID体系（項目定義書相当）", () => {
  const itemDefinitionDocuments: AuditIdPopulationInput["documents"] = [
    {
      name: "item-definition",
      content: [
        "# 項目定義書",
        "| 031 | 1 | 宛名番号 |",
        "| 031 | 2 | 氏名 |",
        "| 031 | 3 | 生年月日 |",
      ].join("\n"),
    },
  ];

  it("populates 2.1 with numeric ids and a non-zero 2.8 defined id total when a 1-group idPatterns is given", () => {
    const md = renderIdPopulationAudit({
      documents: itemDefinitionDocuments,
      declaredPopulations: [],
      idPatterns: ["(?<![0-9A-Za-z])(\\d{3})(?![0-9A-Za-z])"],
    });
    const section21 = md.split("### 2.1")[1].split("### 2.2")[0];
    expect(section21).toContain("| 031 |");
    expect(md).not.toContain("定義ID総数: 0 ");
  });

  it("emits the [high] unmatched idPatterns finding in 1.1 digest when the pattern matches nothing", () => {
    const md = renderIdPopulationAudit({
      documents: itemDefinitionDocuments,
      declaredPopulations: [],
      idPatterns: ["\\b(ZZZ)-(\\d+)\\b"],
    });
    expect(md).toContain("- [high] 指定パターンが1件も一致しなかった");
  });
});

describe("renderIdPopulationAudit - verbose", () => {
  const verboseInput: AuditIdPopulationInput = {
    documents,
    declaredPopulations: [{ toolName: "extract_test_conditions", ids: ["EH-100", "EH-101"] }],
    exclusions: [{ id: "W-002", reason: "対象外機能のため" }],
  };

  it("shows the default-summary notice at the top of the output", () => {
    const md = renderIdPopulationAudit(verboseInput);
    expect(md).toContain(
      "既定(verbose未指定/false)は要約表示。2.1節は判定フラグ(never-declared/excluded)付きの行のみ表示する。全件が必要な場合は `verbose: true` を指定すること。"
    );
  });

  it("by default lists only never-declared/excluded rows in 2.1, excluding declared rows", () => {
    const md = renderIdPopulationAudit(verboseInput);
    const section21 = md.split("### 2.1")[1].split("### 2.2")[0];
    expect(section21).toContain("W-001");
    expect(section21).toContain("W-002");
    const tableSection = section21.split("| ID | 定義文書 | 行 | 章節 | 宣言された母集団 | 状態 |")[1] ?? "";
    expect(tableSection).not.toContain("EH-100");
    expect(tableSection).not.toContain("EH-101");
  });

  it("lists every defined-id row in 2.1 when verbose is true", () => {
    const md = renderIdPopulationAudit({ ...verboseInput, verbose: true });
    const section21 = md.split("### 2.1")[1].split("### 2.2")[0];
    const tableSection = section21.split("| ID | 定義文書 | 行 | 章節 | 宣言された母集団 | 状態 |")[1] ?? "";
    expect(tableSection).toContain("EH-100");
    expect(tableSection).toContain("EH-101");
    expect(tableSection).toContain("W-001");
    expect(tableSection).toContain("W-002");
  });

  it("shows a per-prefix count summary table in 2.1", () => {
    const md = renderIdPopulationAudit(verboseInput);
    const section21 = md.split("### 2.1")[1].split("### 2.2")[0];
    expect(section21).toContain("| プレフィックス | 定義ID数 | declared | excluded | never-declared |");
    expect(section21).toContain("| EH- |");
    expect(section21).toContain("| W- |");
  });
});

describe("renderIdPopulationAudit 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderIdPopulationAudit(input));
  });
});

// --- 2.9 対処優先度順の指摘一覧（大規模合成フィクスチャ） ---

/**
 * 見出しの有無・宣言/未宣言/除外・母集団差分・未投入文書を混在させた大規模フィクスチャ。
 * 各判定区分（PAC-01〜PAC-05）が1件以上発生するように構成する。
 */
function buildLargePopulationInput(n: number): AuditIdPopulationInput {
  const docALines: string[] = ["# doc-A"];
  const docBLines: string[] = ["## 2.1 予約一覧"];
  const allIds: string[] = [];
  for (let i = 1; i <= n; i++) {
    const id = `REQ-${String(i).padStart(3, "0")}`;
    allIds.push(id);
    if (i % 2 === 0) docBLines.push(`- ${id} doc-B の定義行${i}`);
    else docALines.push(`- ${id} doc-A の定義行${i}`);
  }
  return {
    documents: [
      { name: "doc-A", content: docALines.join("\n") },
      { name: "doc-B", content: docBLines.join("\n") },
    ],
    // 先頭50件のみ宣言 → 残りは never-declared(PAC-01)
    declaredPopulations: [
      { toolName: "extract_test_conditions", ids: allIds.slice(0, 50) },
      // 縮退した母集団 → PAC-05
      { toolName: "generate_test_cases", ids: allIds.slice(0, 10) },
      // テストベースに定義が無いID → PAC-03
      { toolName: "design_pairwise", ids: ["NOPE-001", "NOPE-002"] },
    ],
    // 除外宣言 → PAC-02
    exclusions: allIds.slice(50, 60).map((id) => ({ id, reason: `スコープ外(${id})` })),
    // 未投入文書 → PAC-04
    expectedDocumentNames: ["doc-A", "doc-B", "doc-C", "doc-D"],
  };
}

describe("renderIdPopulationAudit 2.9 対処優先度順の指摘一覧", () => {
  const largeInput = buildLargePopulationInput(150);
  const defaultMarkdown = renderIdPopulationAudit(largeInput);
  const verboseMarkdown = renderIdPopulationAudit({ ...largeInput, verbose: true });

  function section29(md: string): string {
    return md.split("### 2.9 対処優先度順の指摘一覧")[1].split("## 3.")[0];
  }

  /** 2.2/2.3/2.4/2.6/2.7 の決定的判定行をテスト側で独立に数える。 */
  function expectedTotal(md: string): number {
    const count = (heading: string, next: string, pattern: RegExp) =>
      (md.split(heading)[1].split(next)[0].match(pattern) ?? []).length;
    const neverDeclared = count("### 2.2 未宣言ID一覧", "### 2.3", /^- \[high\] /gm);
    const excluded = count("### 2.3 除外宣言されたID", "### 2.4", /^- \[info\] /gm);
    const undefinedIds = count("### 2.4 テストベースに定義が無い母集団ID", "### 2.5", /^- \[high\] /gm);
    const missingDocs = count("### 2.6 未投入のテストベース文書", "### 2.7", /^- \[high\] /gm);
    const diffRows = md
      .split("### 2.7 母集団間の差分(工程間の縮退)")[1]
      .split("### 2.8")[0]
      .split("\n")
      .filter((l) => l.startsWith("| ") && !l.startsWith("| ---") && !l.startsWith("| 母集団 |"))
      .filter((l) => l.split("|")[3]?.trim() !== "-").length;
    return neverDeclared + excluded + undefinedIds + missingDocs + diffRows;
  }

  const total = expectedTotal(defaultMarkdown);

  it("PAC-01〜PAC-05 のすべてが1件以上発生するフィクスチャである", () => {
    const rows = parsePriorityRows(section29(verboseMarkdown));
    for (const id of ["PAC-01", "PAC-02", "PAC-03", "PAC-04", "PAC-05"]) {
      expect(rows.some((r) => r.categoryId === id), `${id} が0件`).toBe(true);
    }
    // PAC-06 は決定的なフラグ判定が無いため優先度一覧に含めない
    expect(rows.some((r) => r.categoryId === "PAC-06")).toBe(false);
  });

  it("既定は上限20件・スコア降順・算出根拠の再計算一致・帯内訳合計が全件数と一致する", () => {
    expect(total).toBeGreaterThan(MAX_PRIORITIZED_FINDING_ROWS);
    const { rows } = expectPrioritySectionInvariants(section29(defaultMarkdown), {
      label: "対処優先度順の指摘一覧",
      verbose: false,
      maxRows: MAX_PRIORITIZED_FINDING_ROWS,
      expectedTotal: total,
    });
    expect(rows.length).toBe(MAX_PRIORITIZED_FINDING_ROWS);
  });

  it("verbose: true では全件表示・打ち切り注記なし・帯内訳が既定と同値になる", () => {
    const defaultSummary = expectPrioritySectionInvariants(section29(defaultMarkdown), {
      label: "対処優先度順の指摘一覧",
      verbose: false,
      maxRows: MAX_PRIORITIZED_FINDING_ROWS,
      expectedTotal: total,
    }).summary;
    const verboseSummary = expectPrioritySectionInvariants(section29(verboseMarkdown), {
      label: "対処優先度順の指摘一覧",
      verbose: true,
      maxRows: MAX_PRIORITIZED_FINDING_ROWS,
      expectedTotal: expectedTotal(verboseMarkdown),
    }).summary;
    for (const band of ["P1", "P2", "P3", "P4"] as const) {
      expect(verboseSummary[band]).toBe(defaultSummary[band]);
    }
    expect(section29(verboseMarkdown)).not.toContain("を省略）。全件は verbose: true で取得できる。");
  });

  it("severity は判定区分カタログの宣言値と一致する（スコアで上書きしない）", () => {
    for (const row of parsePriorityRows(section29(verboseMarkdown))) {
      const category = idPopulationAuditCriteria.categories.find((c) => c.id === row.categoryId);
      expect(category, `未知の区分ID: ${row.categoryId}`).toBeDefined();
      expect(row.severity).toBe(category!.severity);
    }
  });

  it("算出根拠セルの影響ID名・文書名がフィクスチャ本文から裏付けられる（verbose 全件）", () => {
    const rows = parsePriorityRows(section29(verboseMarkdown));
    let checked = 0;
    for (const row of rows) {
      // 文書名を挙げている行は、その文書に当該IDが実在すること
      if (row.categoryId === "PAC-01" || row.categoryId === "PAC-02") {
        expect(row.basis.impactedIdNames.length).toBe(1);
        const id = row.basis.impactedIdNames[0];
        const expectedDocs = largeInput.documents
          .filter((d) => d.content.includes(id))
          .map((d) => d.name);
        expect(row.basis.documentNames).toEqual(expectedDocs);
        checked += 1;
      }
      if (row.place.includes("(見出しなし)")) {
        expect(row.basis.sectionResolved).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("2.8 サマリの集計行が既定/verboseで完全一致する（検出件数不変）", () => {
    const summaryLineOf = (md: string) =>
      md.split("### 2.8 サマリ")[1].split("\n").filter((l) => l.trim())[0];
    expect(summaryLineOf(defaultMarkdown)).toBe(summaryLineOf(verboseMarkdown));
  });

  it("既定のみ 2.9節の件数上限に関する案内行が出る（既存の無条件案内文は別行として不変）", () => {
    expect(defaultMarkdown).toContain(
      "既定(verbose未指定/false)は要約表示。2.1節は判定フラグ(never-declared/excluded)付きの行のみ表示する。全件が必要な場合は `verbose: true` を指定すること。"
    );
    expect(verboseMarkdown).toContain(
      "既定(verbose未指定/false)は要約表示。2.1節は判定フラグ(never-declared/excluded)付きの行のみ表示する。全件が必要な場合は `verbose: true` を指定すること。"
    );
    expect(defaultMarkdown).toContain(
      "既定では 2.9節の対処優先度順の指摘一覧に件数上限を適用し、打ち切った箇所には全件数と省略件数を併記する。"
    );
    expect(verboseMarkdown).not.toContain(
      "既定では 2.9節の対処優先度順の指摘一覧に件数上限を適用し、打ち切った箇所には全件数と省略件数を併記する。"
    );
  });

  it("指摘0件なら表を出さず「対象指摘なし」を出す", () => {
    const md = renderIdPopulationAudit({
      documents,
      declaredPopulations: [
        { toolName: "extract_test_conditions", ids: ["EH-100", "EH-101", "W-001", "W-002"] },
      ],
    });
    const section = section29(md);
    expect(section).toContain("- 対象指摘なし（決定的検査の指摘が0件）。未指摘は合格を意味しない。");
    expect(section).not.toContain("| 順位 |");
  });

  it("buildIdPopulationPriorityInputs のIDは区分ID + # + 区分内連番になる", () => {
    const inputs = buildIdPopulationPriorityInputs({
      neverDeclared: [
        { id: "A-001", document: "doc-A", lineIndex: 1, heading: "見出し", declaredIn: [], status: "never-declared" },
        { id: "A-002", document: "doc-A", lineIndex: 2, heading: "見出し", declaredIn: [], status: "never-declared" },
      ],
      excluded: [
        {
          id: "A-003",
          document: "doc-A",
          lineIndex: 3,
          heading: "見出し",
          declaredIn: [],
          status: "excluded",
          exclusionReason: "スコープ外",
        },
      ],
      undefinedIds: [{ id: "NOPE-001", populations: ["design_pairwise"] }],
      missingDocuments: ["doc-C"],
      populationDiff: [
        { population: "generate_test_cases", idCount: 1, missingIds: ["A-002"] },
        { population: "extract_test_conditions", idCount: 2, missingIds: [] },
      ],
      criteria: idPopulationAuditCriteria,
    });
    expect(inputs.map((i) => i.id)).toEqual([
      "PAC-01#1",
      "PAC-01#2",
      "PAC-02#1",
      "PAC-03#1",
      "PAC-04#1",
      "PAC-05#1",
    ]);
    // PAC-03/PAC-05 は母集団由来で文書に紐づかないため documents は空（文書横断0点）
    expect(inputs.find((i) => i.id === "PAC-03#1")!.documents).toEqual([]);
    expect(inputs.find((i) => i.id === "PAC-05#1")!.documents).toEqual([]);
    expect(inputs.find((i) => i.id === "PAC-05#1")!.impactedIds).toEqual(["A-002"]);
  });
});

describe("renderIdPopulationAudit - 双方向制御文字の除去（生＝除去済み同値性）", () => {
  function stripIqc05Lines(md: string): string {
    return md
      .split("\n")
      .filter((l) => !l.includes("[IQC-05]"))
      .join("\n");
  }

  const rawDocuments: AuditIdPopulationInput["documents"] = [
    {
      name: "doc-A",
      content: ["# doc-A", "‭EH-100 発券機起動‬", "‭EH-101 発券機停止‬"].join("\n"),
    },
    {
      name: "doc-B",
      content: ["# doc-B", "W-001 警告表示", "W-002 警告解除"].join("\n"),
    },
  ];
  const cleanDocuments: AuditIdPopulationInput["documents"] = [
    {
      name: "doc-A",
      content: ["# doc-A", "EH-100 発券機起動", "EH-101 発券機停止"].join("\n"),
    },
    {
      name: "doc-B",
      content: ["# doc-B", "W-001 警告表示", "W-002 警告解除"].join("\n"),
    },
  ];

  it("produces identical output (excluding IQC-05 lines) whether or not the input has embedded bidi controls", () => {
    const rawMd = renderIdPopulationAudit({
      documents: rawDocuments,
      declaredPopulations: [{ toolName: "extract_test_conditions", ids: ["EH-100", "EH-101"] }],
    });
    const cleanMd = renderIdPopulationAudit({
      documents: cleanDocuments,
      declaredPopulations: [{ toolName: "extract_test_conditions", ids: ["EH-100", "EH-101"] }],
    });
    expect(stripIqc05Lines(rawMd)).toBe(stripIqc05Lines(cleanMd));
  });

  it("does not degrade definitions to references when a bidi control char sits at the start of the definition line", () => {
    const rawMd = renderIdPopulationAudit({
      documents: rawDocuments,
      declaredPopulations: [],
    });
    const cleanMd = renderIdPopulationAudit({
      documents: cleanDocuments,
      declaredPopulations: [],
    });
    const definedCountOf = (md: string): string => {
      const match = /定義ID総数: (\d+)/.exec(md);
      return match ? match[1] : "";
    };
    expect(definedCountOf(rawMd)).toBe(definedCountOf(cleanMd));
    expect(definedCountOf(rawMd)).not.toBe("0");
  });
});

describe("renderIdPopulationAudit 次に実行すべきツール節の内容", () => {
  function nextToolsSection(md: string): string {
    return md.split("## 次に実行すべきツール")[1];
  }

  it("未宣言IDがあると extract_test_conditions / generate_test_cases 行が出る", () => {
    const section = nextToolsSection(markdown);
    expect(section).toContain("| 未実施 | extract_test_conditions |");
    expect(section).toContain("| 未実施 | generate_test_cases |");
  });

  it("全ID宣言済みなら未宣言ID由来の行は出ない", () => {
    const section = nextToolsSection(
      renderIdPopulationAudit({
        documents,
        declaredPopulations: [
          { toolName: "extract_test_conditions", ids: ["EH-100", "EH-101", "W-001", "W-002"] },
        ],
      })
    );
    expect(section).not.toContain("| 未実施 | extract_test_conditions |");
    expect(section).not.toContain("| 未実施 | generate_test_cases |");
  });
});

describe("buildDefinedIdIndex - 目次行のIDが定義ID母集団に入らないこと", () => {
  it("excludes an id that only appears on a toc line from the defined id index", () => {
    const tocOnlyDocuments: TestBasisDocument[] = [
      {
        name: "13_設計書",
        content: [
          "# 目次",
          "W-001 新規登録.......................................... 5",
        ].join("\n"),
      },
    ];
    const index = buildDefinedIdIndex(tocOnlyDocuments);
    expect(index.some((e) => e.id === "W-001")).toBe(false);
  });
});

describe("renderIdPopulationAudit 検査実行状況節", () => {
  it("対照表が出て、実行された検査の節ラベルが同一出力の見出しに現れる", () => {
    expectInspectabilitySection(markdown, "audit_id_population");
  });

  it("exclusions 未指定なら PAC-02 が検査不能になる", () => {
    expectUninspectable(markdown, "PAC-02");
    expectExecuted(markdown, "PAC-01");
    expectExecuted(markdown, "PAC-03");
    expectExecuted(markdown, "PAC-06");
  });

  it("expectedDocumentNames 未指定なら PAC-04、母集団1件なら PAC-05 が検査不能になる", () => {
    expectUninspectable(markdown, "PAC-04");
    expectUninspectable(markdown, "PAC-05");
  });

  it("母集団未宣言なら PAC-01 / PAC-03 / PAC-06 も検査不能になる", () => {
    const md = renderIdPopulationAudit({ documents, declaredPopulations: [] });
    expectUninspectable(md, "PAC-01");
    expectUninspectable(md, "PAC-03");
    expectUninspectable(md, "PAC-06");
  });

  it("除外宣言・期待文書名・母集団2件を渡すと該当区分が実行になる", () => {
    const md = renderIdPopulationAudit({
      documents,
      declaredPopulations: [
        { toolName: "extract_test_conditions", ids: ["EH-100", "EH-101"] },
        { toolName: "generate_test_cases", ids: ["EH-100"] },
      ],
      exclusions: [{ id: "W-001", reason: "スコープ外" }],
      expectedDocumentNames: ["doc-A", "doc-B"],
    });
    expectExecuted(md, "PAC-02");
    expectExecuted(md, "PAC-04");
    expectExecuted(md, "PAC-05");
  });
});
