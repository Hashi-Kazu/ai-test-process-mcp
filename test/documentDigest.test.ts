import { describe, expect, it } from "vitest";
import {
  DIGEST_PREFIX_MIN_PEAK,
  buildDocumentDigests,
  computeInputQualityMetrics,
  extractTableCells,
  findDocumentDigestFindings,
  formatPercent,
  renderDocumentDigestLines,
} from "../src/documentDigest.js";
import {
  IQC_FURIGANA_MIN_RUNS,
  IQC_MIN_TABLE_CELLS,
  IQC_NO_HEADING_MIN_CHARS,
  IQC_NO_HEADING_MIN_LINES,
} from "../src/resources/inputQualityCriteria.js";
import type { TestBasisDocument } from "../src/types.js";

function prefixDoc(name: string, count: number): TestBasisDocument {
  const lines: string[] = ["# 例外ハンドリング"];
  for (let i = 1; i <= count; i++) {
    lines.push(`EH-${100 + i} 例外${i}の扱い`);
  }
  return { name, content: lines.join("\n") };
}

describe("buildDocumentDigests", () => {
  it("returns char/line/heading counts, defined and referenced id counts and quantity tokens", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "11_要求仕様書",
        content: [
          "# 発券機",
          "EH-100 発券機起動",
          "入場制限人数は 60人以下とする。",
          "詳細は EH-100 を参照する。",
        ].join("\n"),
      },
    ];
    const rows = buildDocumentDigests(documents);
    expect(rows).toHaveLength(1);
    expect(rows[0].document).toBe("11_要求仕様書");
    expect(rows[0].charCount).toBe(documents[0].content.length);
    expect(rows[0].lineCount).toBe(4);
    expect(rows[0].headingCount).toBe(1);
    expect(rows[0].idCount).toBe(2);
    expect(rows[0].definedIdCount).toBe(1);
    expect(rows[0].quantityCount).toBe(1);
    expect(rows[0].prefixCounts).toEqual([{ prefix: "EH", definitionCount: 1 }]);
    expect(rows[0].otherPrefixReferenceCount).toBe(0);
  });

  it("is deterministic and does not mutate the input", () => {
    const documents: TestBasisDocument[] = [prefixDoc("docA", 3)];
    const snapshot = JSON.stringify(documents);
    const first = buildDocumentDigests(documents);
    const second = buildDocumentDigests(documents);
    expect(second).toEqual(first);
    expect(JSON.stringify(documents)).toBe(snapshot);
  });
});

describe("findDocumentDigestFindings", () => {
  it("flags a document with no detected ids and no other-prefix reference as ID-system-less", () => {
    const rows = buildDocumentDigests([{ name: "抜粋メモ", content: "残数が少ない場合の扱い\n以上" }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      document: "抜粋メモ",
      kind: "no-id-system",
      severity: "info",
      detail:
        "検出IDが0件で、他文書が持つIDプレフィックスへの参照も無い。この文書はID体系を持たない文書であり、抜粋の指摘ではない。",
    });
  });

  it("keeps medium severity when a loose reference to another document's prefix exists", () => {
    const docA = prefixDoc("docA", DIGEST_PREFIX_MIN_PEAK);
    const docB: TestBasisDocument = {
      name: "docB",
      content: "# 概要\n本文中にEHという単語のみが登場する。IDらしき表記は無い。",
    };
    const rows = buildDocumentDigests([docA, docB]);
    const docBRow = rows.find((r) => r.document === "docB");
    expect(docBRow?.otherPrefixReferenceCount).toBe(1);
    const findings = findDocumentDigestFindings(rows);
    const docBFinding = findings.find((f) => f.document === "docB");
    expect(docBFinding).toEqual({
      document: "docB",
      kind: "no-id",
      severity: "medium",
      detail:
        "検出IDが0件だが、他文書が持つIDプレフィックスへの参照が見つかった。抜粋のみが投入されている可能性がある。全文を投入して再実行すること。",
    });
  });

  it("reports info when there is no reference to any other document's prefix", () => {
    const docA = prefixDoc("docA", DIGEST_PREFIX_MIN_PEAK);
    const docC: TestBasisDocument = {
      name: "docC",
      content: "# 一般業務文書\n本文書は発注業務の手順を説明する一般的な業務文書であり、特定の識別子体系を持たない。",
    };
    const rows = buildDocumentDigests([docA, docC]);
    const docCRow = rows.find((r) => r.document === "docC");
    expect(docCRow?.otherPrefixReferenceCount).toBe(0);
    const findings = findDocumentDigestFindings(rows);
    const docCFinding = findings.find((f) => f.document === "docC");
    expect(docCFinding).toEqual({
      document: "docC",
      kind: "no-id-system",
      severity: "info",
      detail:
        "検出IDが0件で、他文書が持つIDプレフィックスへの参照も無い。この文書はID体系を持たない文書であり、抜粋の指摘ではない。",
    });
    expect(findings.some((f) => f.document === "docC" && f.severity === "medium")).toBe(false);
  });

  it("flags only the sparse document when one document holds far more definitions of a prefix", () => {
    const rows = buildDocumentDigests([prefixDoc("docA", 12), prefixDoc("docB", 1)]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings).toHaveLength(1);
    expect(findings[0].document).toBe("docB");
    expect(findings[0].kind).toBe("sparse-prefix");
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].detail).toContain("プレフィックス「EH」");
    expect(findings[0].detail).toContain("docA(12件)");
  });

  it("does not flag a sparse prefix when the peak is below the minimum peak", () => {
    const rows = buildDocumentDigests([
      prefixDoc("docA", DIGEST_PREFIX_MIN_PEAK - 1),
      prefixDoc("docB", 1),
    ]);
    expect(findDocumentDigestFindings(rows)).toEqual([]);
  });
});

describe("renderDocumentDigestLines", () => {
  it("renders the table header, thousands separators, escaped pipes and the fixed note", () => {
    const documents: TestBasisDocument[] = [
      { name: "11_要求|仕様書", content: "a".repeat(35525) },
    ];
    const rows = buildDocumentDigests(documents);
    const findings = findDocumentDigestFindings(rows);
    const lines = renderDocumentDigestLines(rows, findings);
    expect(lines[0]).toBe("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照) | 数値トークン |");
    expect(lines[1]).toBe("| --- | --- | --- | --- | --- | --- |");
    expect(lines[2]).toContain("11_要求\\|仕様書");
    expect(lines[2]).toContain("| 35,525 |");
    expect(lines[2]).toContain("| 0 / 0 |");
    expect(lines).toContain(
      "- [info] 11_要求\\|仕様書: 検出IDが0件で、他文書が持つIDプレフィックスへの参照も無い。この文書はID体系を持たない文書であり、抜粋の指摘ではない。"
    );
    expect(lines[lines.length - 1]).toBe(
      "- ダイジェストは投入されたテキストのみを対象とする。抜粋を投入した場合、以降の集計・検査はすべて抜粋の範囲に限定される。"
    );
    expect(renderDocumentDigestLines(rows, findings)).toEqual(lines);
  });
});

// --- IQC (input quality / conversion fidelity) fixtures ---

/** 12列×40行のパイプ表。各セルは 100〜399 の範囲から決定的に選ばれた数値のみ。 */
function isolatedNumericPipeTable(cols = 12, rows = 40): string {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      const value = 100 + ((r * cols + c) % 300);
      cells.push(String(value));
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

/** 12列×40行のパイプ表。1列だけ数値、残り11列は日本語ラベル（正しい変換を模した比率約8%）。 */
function mostlyLabelPipeTable(cols = 12, rows = 40): string {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      if (c === 0) {
        cells.push(String(100 + ((r * cols + c) % 300)));
      } else {
        cells.push(`項目${r}-${c}の説明`);
      }
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

describe("extractTableCells", () => {
  it("extracts pipe-delimited cells from a pipe table row, excluding separator rows", () => {
    const content = ["| A | B | C |", "| --- | --- | --- |", "| 1 | 2 | 3 |"].join("\n");
    expect(extractTableCells(content)).toEqual(["A", "B", "C", "1", "2", "3"]);
  });

  it("extracts layout-extracted cells when a line has 3+ whitespace-separated segments", () => {
    const content = "項番   区分   内容";
    expect(extractTableCells(content)).toEqual(["項番", "区分", "内容"]);
  });

  it("does not extract cells from a 2-segment whitespace-separated line", () => {
    const content = "項番   内容";
    expect(extractTableCells(content)).toEqual([]);
  });

  it("does not extract cells from a single-cell pipe line (fewer than 2 inner elements)", () => {
    const content = "| 単独セル |";
    expect(extractTableCells(content)).toEqual([]);
  });
});

describe("computeInputQualityMetrics / findDocumentDigestFindings (IQC-01 isolated numeric cells)", () => {
  it("flags a document whose table cells are dominated by unlabeled 2+ digit numeric values", () => {
    const content = isolatedNumericPipeTable();
    const metrics = computeInputQualityMetrics(content);
    expect(metrics.tableCellCount).toBeGreaterThanOrEqual(IQC_MIN_TABLE_CELLS);
    expect(metrics.isolatedNumericDistinct).toBeGreaterThanOrEqual(20);

    const rows = buildDocumentDigests([{ name: "破損Excel", content }]);
    const findings = findDocumentDigestFindings(rows);
    const iqc01 = findings.filter((f) => f.kind === "isolated-numeric-cells");
    expect(iqc01).toHaveLength(1);
    expect(iqc01[0].severity).toBe("high");
    expect(iqc01[0].detail).toContain(String(metrics.tableCellCount));
    expect(iqc01[0].detail).toContain(String(metrics.isolatedNumericCount));
    expect(iqc01[0].detail).toContain("%");
    expect(iqc01[0].detail).toContain(String(metrics.isolatedNumericDistinct));
  });

  it("does not flag a table whose numeric ratio matches a correct conversion (~8%)", () => {
    const content = mostlyLabelPipeTable();
    const rows = buildDocumentDigests([{ name: "正しい変換Excel", content }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.severity === "high")).toBe(false);
  });

  it("does not flag a broken-looking table when the cell population is below the minimum (29 cells)", () => {
    const rowsOfCells: string[] = [];
    let value = 100;
    for (let r = 0; r < 15; r++) {
      const a = String(value++);
      const b = r === 14 ? "" : String(value++);
      rowsOfCells.push(`| ${a} | ${b} |`);
    }
    const content = rowsOfCells.join("\n");
    const metrics = computeInputQualityMetrics(content);
    expect(metrics.tableCellCount).toBe(29);

    const rows = buildDocumentDigests([{ name: "母数不足Excel", content }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "isolated-numeric-cells")).toBe(false);
  });

  it("does not flag a table whose isolated-numeric ratio is 40% but distinct values are 19 or fewer", () => {
    const lines: string[] = [];
    for (let r = 0; r < 10; r++) {
      const cells: string[] = [];
      for (let c = 0; c < 10; c++) {
        if (c < 4) {
          cells.push(String(100 + ((r * 4 + c) % 10)));
        } else {
          cells.push("対象データの説明");
        }
      }
      lines.push(`| ${cells.join(" | ")} |`);
    }
    const content = lines.join("\n");
    const metrics = computeInputQualityMetrics(content);
    expect(metrics.tableCellCount).toBe(100);
    expect(metrics.isolatedNumericCount).toBe(40);
    expect(metrics.isolatedNumericDistinct).toBeLessThanOrEqual(19);

    const rows = buildDocumentDigests([{ name: "異なり値不足Excel", content }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "isolated-numeric-cells")).toBe(false);
  });
});

describe("findDocumentDigestFindings (IQC-02 furigana contamination)", () => {
  /** 1漢字＋9文字のカタカナ列（ふりがな候補）。長音符・促音・小書きカナを含まない。 */
  const FURIGANA_UNIT = "外ジュウトウガイシャ";

  it("flags high severity when the furigana-run character ratio is 1% or more with 3+ runs", () => {
    const content = FURIGANA_UNIT.repeat(5); // 5 runs, ratio far above 1%
    const rows = buildDocumentDigests([{ name: "ふりがな混入Excel", content }]);
    const metrics = rows[0].inputQuality;
    expect(metrics.furiganaRunCount).toBeGreaterThanOrEqual(IQC_FURIGANA_MIN_RUNS);
    const findings = findDocumentDigestFindings(rows);
    const iqc02 = findings.filter((f) => f.kind === "furigana-contamination");
    expect(iqc02).toHaveLength(1);
    expect(iqc02[0].severity).toBe("high");
  });

  it("flags medium severity when the furigana-run character ratio is between 0.2% and 1%", () => {
    const runs = FURIGANA_UNIT.repeat(3); // 3 runs x 9 chars = 27 furigana chars
    const totalChars = 5000; // 27 / 5000 = 0.54%
    const content = runs + "あ".repeat(totalChars - runs.length);
    const rows = buildDocumentDigests([{ name: "ふりがな混入Excel2", content }]);
    const metrics = rows[0].inputQuality;
    expect(metrics.furiganaCharCount).toBe(27);
    const findings = findDocumentDigestFindings(rows);
    const iqc02 = findings.filter((f) => f.kind === "furigana-contamination");
    expect(iqc02).toHaveLength(1);
    expect(iqc02[0].severity).toBe("medium");
  });

  it("does not flag ordinary Japanese text containing katakana loanwords after kanji", () => {
    const content = [
      "# 概要",
      "システムテストの実施計画を作成する。",
      "サブシステムとの連携を確認する。",
      "オンラインチケットの購入フローを検証する。",
      "入場システムの起動時刻を確認する。",
      "タイムアウトエラーの発生条件を検証する。",
    ].join("\n");
    const rows = buildDocumentDigests([{ name: "通常文書", content }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "furigana-contamination")).toBe(false);
  });
});

describe("findDocumentDigestFindings (IQC-03 no heading)", () => {
  function noHeadingBody(lines: number, charsPerLine: number): string {
    const line = "本文の説明文がここに続きます".slice(0, charsPerLine).padEnd(charsPerLine, "。");
    return Array.from({ length: lines }, () => line).join("\n");
  }

  it("flags a document with zero headings that is at least 2000 chars and 50 lines", () => {
    const content = noHeadingBody(IQC_NO_HEADING_MIN_LINES, 45);
    expect(content.length).toBeGreaterThanOrEqual(IQC_NO_HEADING_MIN_CHARS);
    const rows = buildDocumentDigests([{ name: "見出しなし文書", content }]);
    expect(rows[0].headingCount).toBe(0);
    const findings = findDocumentDigestFindings(rows);
    const iqc03 = findings.filter((f) => f.kind === "no-heading");
    expect(iqc03).toHaveLength(1);
    expect(iqc03[0].severity).toBe("medium");
  });

  it("does not flag a document just below the char threshold (1999 chars, 50+ lines)", () => {
    const content = noHeadingBody(60, 33).slice(0, IQC_NO_HEADING_MIN_CHARS - 1);
    expect(content.length).toBe(IQC_NO_HEADING_MIN_CHARS - 1);
    const rows = buildDocumentDigests([{ name: "文字数不足文書", content }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "no-heading")).toBe(false);
  });

  it("does not flag a document just below the line threshold (49 lines)", () => {
    const content = noHeadingBody(IQC_NO_HEADING_MIN_LINES - 1, 45);
    const rows = buildDocumentDigests([{ name: "行数不足文書", content }]);
    expect(rows[0].lineCount).toBe(IQC_NO_HEADING_MIN_LINES - 1);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "no-heading")).toBe(false);
  });

  it("does not flag a document that has at least one heading", () => {
    const content = "# 見出し\n" + noHeadingBody(IQC_NO_HEADING_MIN_LINES, 45);
    const rows = buildDocumentDigests([{ name: "見出しあり文書", content }]);
    expect(rows[0].headingCount).toBeGreaterThanOrEqual(1);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "no-heading")).toBe(false);
  });
});

describe("findDocumentDigestFindings (IQC-04 broken table cells)", () => {
  it("flags a table whose broken (particle/comma-ending) cell ratio is 12% or more", () => {
    const lines: string[] = [];
    for (let r = 0; r < 10; r++) {
      const cells: string[] = [];
      for (let c = 0; c < 5; c++) {
        if (r < 2) {
          cells.push("対象データを"); // broken: ends with the particle "を"
        } else {
          cells.push(`セル${r}-${c}`);
        }
      }
      lines.push(`| ${cells.join(" | ")} |`);
    }
    const content = lines.join("\n");
    const metrics = computeInputQualityMetrics(content);
    expect(metrics.tableCellCount).toBeGreaterThanOrEqual(IQC_MIN_TABLE_CELLS);
    expect(metrics.brokenTableCellCount * 100).toBeGreaterThanOrEqual(metrics.tableCellCount * 12);

    const rows = buildDocumentDigests([{ name: "表崩れ文書", content }]);
    const findings = findDocumentDigestFindings(rows);
    const iqc04 = findings.filter((f) => f.kind === "broken-table-cells");
    expect(iqc04).toHaveLength(1);
    expect(iqc04[0].severity).toBe("medium");
  });

  it("does not flag a table filled with cells that do not end in a particle/comma", () => {
    const lines: string[] = [];
    for (let r = 0; r < 10; r++) {
      const cells: string[] = [];
      for (let c = 0; c < 5; c++) {
        cells.push(c % 2 === 0 ? "影響なし" : "実施済");
      }
      lines.push(`| ${cells.join(" | ")} |`);
    }
    const content = lines.join("\n");
    const rows = buildDocumentDigests([{ name: "正常表文書", content }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "broken-table-cells")).toBe(false);
  });
});

describe("renderDocumentDigestLines (IQC note)", () => {
  it("appends the IQC note line before the fixed DIGEST_NOTE when an IQC finding exists, and keeps DIGEST_NOTE last", () => {
    const content = "外ジュウトウガイシャ".repeat(5);
    const rows = buildDocumentDigests([{ name: "ふりがな混入文書", content }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "furigana-contamination")).toBe(true);
    const lines = renderDocumentDigestLines(rows, findings);
    expect(
      lines.includes(
        "- [IQC] 入力品質の指摘は投入テキストの変換品質に関する指標であり、テストベース仕様そのものの欠陥ではない。原本から再変換したテキストで再実行すること。"
      )
    ).toBe(true);
    expect(lines[lines.length - 1]).toBe(
      "- ダイジェストは投入されたテキストのみを対象とする。抜粋を投入した場合、以降の集計・検査はすべて抜粋の範囲に限定される。"
    );
  });

  it("does not append the IQC note when no IQC finding exists", () => {
    const documents: TestBasisDocument[] = [{ name: "通常文書", content: "普通の本文である。" }];
    const rows = buildDocumentDigests(documents);
    const findings = findDocumentDigestFindings(rows);
    const lines = renderDocumentDigestLines(rows, findings);
    expect(lines.some((l) => l.startsWith("- [IQC]"))).toBe(false);
  });
});

describe("determinism and non-mutation with IQC metrics", () => {
  it("returns identical results across two calls and does not mutate the input documents", () => {
    const documents: TestBasisDocument[] = [
      { name: "破損Excel", content: isolatedNumericPipeTable() },
      { name: "ふりがな文書", content: "外ジュウトウガイシャ".repeat(5) },
    ];
    const snapshot = JSON.stringify(documents);
    const firstRows = buildDocumentDigests(documents);
    const secondRows = buildDocumentDigests(documents);
    expect(secondRows).toEqual(firstRows);
    expect(JSON.stringify(documents)).toBe(snapshot);

    const firstFindings = findDocumentDigestFindings(firstRows);
    const secondFindings = findDocumentDigestFindings(secondRows);
    expect(secondFindings).toEqual(firstFindings);

    const firstLines = renderDocumentDigestLines(firstRows, firstFindings);
    const secondLines = renderDocumentDigestLines(secondRows, secondFindings);
    expect(secondLines).toEqual(firstLines);
  });
});

describe("formatPercent", () => {
  it("formats an integer-arithmetic percentage with 1 decimal place", () => {
    expect(formatPercent(778, 1000)).toBe("77.8");
    expect(formatPercent(3, 10)).toBe("30");
  });

  it("returns '0' when total is 0", () => {
    expect(formatPercent(5, 0)).toBe("0");
  });
});
