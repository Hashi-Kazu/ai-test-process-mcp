import { describe, expect, it } from "vitest";
import {
  DIGEST_PREFIX_MIN_PEAK,
  buildDocumentDigests,
  computeInputQualityMetrics,
  extractTableCells,
  findDocumentDigestFindings,
  findUnmatchedIdPatterns,
  formatCount,
  formatPercent,
  renderDocumentDigestLines,
  sanitizeTestBasisDocuments,
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
    expect(rows[0].tocIdCount).toBe(0);
    expect(rows[0].quantityCount).toBe(1);
    expect(rows[0].prefixCounts).toEqual([{ prefix: "EH", definitionCount: 1 }]);
    expect(rows[0].otherPrefixReferenceCount).toBe(0);
  });

  it("counts toc-role occurrences separately in tocIdCount", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "13_設計書",
        content: [
          "# 目次",
          "EH-100 発券機起動.......................................... 5",
          "# 発券機",
          "EH-100 発券機起動",
        ].join("\n"),
      },
    ];
    const rows = buildDocumentDigests(documents);
    expect(rows[0].tocIdCount).toBe(1);
    expect(rows[0].definedIdCount).toBe(1);
    expect(rows[0].idCount).toBe(2);
  });

  it("excludes empty-prefix (non-prefix ID system) definitions from prefixCounts", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc.md", content: "| 031 | 1 | 宛名番号 |\n| 999 | 2 | 別項目 |" },
    ];
    const rows = buildDocumentDigests(documents, {
      idPatterns: ["(?<![0-9A-Za-z])(\\d{3})(?![0-9A-Za-z])"],
    });
    expect(rows[0].prefixCounts).toEqual([]);
    expect(rows[0].definedIdCount).toBeGreaterThan(0);
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

  it("flags no-defined-id when ids are detected but none are definitions (deterministic layer misses)", () => {
    const rows = buildDocumentDigests([
      {
        name: "参照のみ文書",
        content: ["# 概要", "詳細は EH-100 を参照する。", "同様に EH-101 についても参照する。"].join("\n"),
      },
    ]);
    expect(rows[0].idCount).toBeGreaterThan(0);
    expect(rows[0].definedIdCount).toBe(0);
    const referenceCount = rows[0].idCount - rows[0].definedIdCount - rows[0].tocIdCount;
    const findings = findDocumentDigestFindings(rows);
    const finding = findings.find((f) => f.kind === "no-defined-id");
    expect(finding).toBeDefined();
    expect(finding?.document).toBe("参照のみ文書");
    expect(finding?.severity).toBe("medium");
    expect(finding?.detail).toContain("検査不能（要確認）");
    expect(finding?.detail).toContain("指摘が0件であることは合格を意味しない");
    expect(finding?.detail).toContain("idPatterns");
    expect(finding?.detail).toContain(String(referenceCount));
  });

  it("does not flag no-defined-id when a document already has at least one defined id", () => {
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
    expect(rows[0].definedIdCount).toBeGreaterThanOrEqual(1);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "no-defined-id")).toBe(false);
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
    expect(lines[0]).toBe("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照/目次) | 数値トークン |");
    expect(lines[1]).toBe("| --- | --- | --- | --- | --- | --- |");
    expect(lines[2]).toContain("11_要求\\|仕様書");
    expect(lines[2]).toContain("| 35,525 |");
    expect(lines[2]).toContain("| 0 / 0 / 0 |");
    expect(lines).toContain(
      "- [info] 11_要求\\|仕様書: 検出IDが0件で、他文書が持つIDプレフィックスへの参照も無い。この文書はID体系を持たない文書であり、抜粋の指摘ではない。"
    );
    expect(lines[lines.length - 1]).toBe(
      "- ダイジェストは投入されたテキストのみを対象とする。抜粋を投入した場合、以降の集計・検査はすべて抜粋の範囲に限定される。"
    );
    expect(renderDocumentDigestLines(rows, findings)).toEqual(lines);
  });

  it("renders the toc id count as the third value in the 検出ID cell", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "13_設計書",
        content: [
          "# 目次",
          "EH-100 発券機起動.......................................... 5",
          "# 発券機",
          "EH-100 発券機起動",
        ].join("\n"),
      },
    ];
    const rows = buildDocumentDigests(documents);
    const findings = findDocumentDigestFindings(rows);
    const lines = renderDocumentDigestLines(rows, findings);
    expect(lines[2]).toContain("| 1 / 0 / 1 |");
  });

  it("emits a [medium] finding line when the unmatched pattern's document already has other defined IDs (population not degraded)", () => {
    const rows = buildDocumentDigests([{ name: "doc.md", content: "EH-100 発券機起動" }]);
    const findings = findDocumentDigestFindings(rows);
    const lines = renderDocumentDigestLines(rows, findings, ["\\b(ZZZ)-(\\d+)\\b"]);
    expect(
      lines.some(
        (l) =>
          l.startsWith("- [medium] 指定パターンが1件も一致しなかった:") &&
          l.includes("ZZZ") &&
          l.includes("縮退しているとは限らない")
      )
    ).toBe(true);
  });

  it("emits a [high] finding line when no defined IDs exist at all across the documents (population truly degraded)", () => {
    const rows = buildDocumentDigests([{ name: "doc.md", content: "何もIDらしき記述は無い。" }]);
    const findings = findDocumentDigestFindings(rows);
    const lines = renderDocumentDigestLines(rows, findings, ["\\b(ZZZ)-(\\d+)\\b"]);
    expect(
      lines.some(
        (l) =>
          l.startsWith("- [high] 指定パターンが1件も一致しなかった:") &&
          l.includes("ZZZ") &&
          l.includes("母集団が縮退したまま")
      )
    ).toBe(true);
  });

  it("does not emit the unmatched-pattern line when the third argument is omitted", () => {
    const rows = buildDocumentDigests([{ name: "doc.md", content: "EH-100 発券機起動" }]);
    const findings = findDocumentDigestFindings(rows);
    const lines = renderDocumentDigestLines(rows, findings);
    expect(lines.some((l) => l.includes("指定パターンが1件も一致しなかった"))).toBe(false);
  });
});

describe("findUnmatchedIdPatterns", () => {
  it("returns only the patterns that matched no line across all documents", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "REQ_100 is defined here." },
      { name: "doc2.md", content: "何もIDらしき記述は無い。" },
    ];
    const unmatched = findUnmatchedIdPatterns(documents, {
      idPatterns: ["\\b(REQ)_(\\d+)\\b", "\\b(ZZZ)-(\\d+)\\b"],
    });
    expect(unmatched).toEqual(["\\b(ZZZ)-(\\d+)\\b"]);
  });

  it("returns an empty array when idPatterns is not specified", () => {
    const documents: TestBasisDocument[] = [{ name: "doc1.md", content: "EH-100" }];
    expect(findUnmatchedIdPatterns(documents)).toEqual([]);
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

describe("computeInputQualityMetrics / findDocumentDigestFindings (IQC-05 bidi control chars)", () => {
  it("counts bidi control chars from the raw content while other metrics are computed on the sanitized content", () => {
    const content = "‭見出し‬\nEH-100 発券機起動";
    const metrics = computeInputQualityMetrics(content);
    expect(metrics.bidiControlCount).toBe(2);
    expect(metrics.bidiControlCounts).toEqual([
      { codePoint: "U+202C", count: 1 },
      { codePoint: "U+202D", count: 1 },
    ]);
  });

  it("returns bidiControlCount 0 and an empty breakdown for content without bidi control chars", () => {
    const metrics = computeInputQualityMetrics("普通の本文である。");
    expect(metrics.bidiControlCount).toBe(0);
    expect(metrics.bidiControlCounts).toEqual([]);
  });

  it("computes charCount as the sanitized (post-removal) length while lineCount is unchanged", () => {
    const raw = "‭# 見出し‬\nEH-100 発券機起動\n以上とする。";
    const documents = [{ name: "制御文字文書", content: raw }];
    const rows = buildDocumentDigests(documents);
    const sanitizedLength = raw.replace(/[‪-‮⁦-⁩‎‏]/gu, "").length;
    expect(rows[0].charCount).toBe(sanitizedLength);
    expect(rows[0].charCount).toBeLessThan(raw.length);
    expect(rows[0].lineCount).toBe(raw.split("\n").length);
  });

  it("emits an IQC-05 finding whose detail contains the total count and the per-codepoint breakdown", () => {
    const content = "‭見出し‬".repeat(3);
    const rows = buildDocumentDigests([{ name: "双方向制御文字文書", content }]);
    const findings = findDocumentDigestFindings(rows);
    const iqc05 = findings.filter((f) => f.kind === "bidi-control-chars");
    expect(iqc05).toHaveLength(1);
    expect(iqc05[0].severity).toBe("medium");
    expect(iqc05[0].detail).toContain("[IQC-05]");
    expect(iqc05[0].detail).toContain("6字");
    expect(iqc05[0].detail).toContain("U+202C 3字");
    expect(iqc05[0].detail).toContain("U+202D 3字");
  });

  it("does not append the generic [IQC] note when only IQC-05 fires among the IQC-01..04 kinds", () => {
    const content = "‭見出し‬";
    const rows = buildDocumentDigests([{ name: "双方向制御文字のみ文書", content }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "bidi-control-chars")).toBe(true);
    expect(
      findings.some((f) =>
        ["isolated-numeric-cells", "furigana-contamination", "no-heading", "broken-table-cells"].includes(
          f.kind
        )
      )
    ).toBe(false);
    const lines = renderDocumentDigestLines(rows, findings);
    expect(lines.some((l) => l.startsWith("- [IQC]"))).toBe(false);
  });

  it("does not mutate the input documents when bidi control chars are present", () => {
    const documents = [{ name: "制御文字文書", content: "‭見出し‬\n本文" }];
    const snapshot = JSON.stringify(documents);
    buildDocumentDigests(documents);
    expect(JSON.stringify(documents)).toBe(snapshot);
  });
});

describe("sanitizeTestBasisDocuments", () => {
  it("strips bidi control characters from content without mutating the input array or objects", () => {
    const documents = [
      { name: "doc1", content: "‭見出し‬\n本文" },
      { name: "doc2", content: "制御文字なし" },
    ];
    const snapshot = JSON.stringify(documents);
    const sanitized = sanitizeTestBasisDocuments(documents);
    expect(sanitized).toEqual([
      { name: "doc1", content: "見出し\n本文" },
      { name: "doc2", content: "制御文字なし" },
    ]);
    expect(JSON.stringify(documents)).toBe(snapshot);
  });

  it("preserves line count and line numbers (bidi control chars never contain newlines)", () => {
    const documents = [{ name: "doc1", content: "‭行1‬\n行2\n‭行3‬" }];
    const sanitized = sanitizeTestBasisDocuments(documents);
    expect(sanitized[0].content.split("\n").length).toBe(documents[0].content.split("\n").length);
    expect(sanitized[0].content.split("\n")).toEqual(["行1", "行2", "行3"]);
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

// --- 代替アンカー（見出し退化時のパイプ表 行/列アンカー）の明示 ---

/** 見出し0件・パイプ表ありで chars 文字の文書。 */
function degeneratedTableDoc(chars: number): string {
  const base = [
    "| 改定後 | 現行 |",
    "| --- | --- |",
    "| 適切な運用とする。 | 適宜運用する。 |",
  ].join("\n");
  return `${base}\n${"あ".repeat(chars - base.length - 1)}`;
}

/** 見出し0件・パイプ表0件の大きな文書（pdftotext -layout 出力の模擬）。 */
function noStructureDoc(): string {
  const lines: string[] = ["項番   区分   内容"];
  for (let i = 0; i < 60; i++) {
    lines.push(`本文${i}の説明として必要な記述をここに続ける。適切な運用を前提とする。`);
  }
  return lines.join("\n");
}

describe("buildDocumentDigests (sectionAnchor)", () => {
  it("reports mode alternative with the number of anchored lines and tables for a degenerated document", () => {
    const content = degeneratedTableDoc(IQC_NO_HEADING_MIN_CHARS);
    const rows = buildDocumentDigests([{ name: "新旧対照表", content }]);
    expect(rows[0].sectionAnchor).toEqual({
      mode: "alternative",
      distinctHeadingAnchors: 1,
      alternativeAnchorLineCount: 2,
      alternativeTableCount: 1,
    });
  });

  it("reports mode heading for a document whose headings are discriminative", () => {
    const content = ["# 第1章", "本文である。", "# 第2章", "| A | B |", "| 1 | 2 |"].join("\n");
    const rows = buildDocumentDigests([{ name: "仕様書", content }]);
    expect(rows[0].sectionAnchor.mode).toBe("heading");
    expect(rows[0].sectionAnchor.alternativeAnchorLineCount).toBe(0);
    expect(rows[0].sectionAnchor.distinctHeadingAnchors).toBeGreaterThanOrEqual(2);
  });

  it("reports mode none for a heading-less, pipe-table-less document", () => {
    const rows = buildDocumentDigests([{ name: "pdf.txt", content: noStructureDoc() }]);
    expect(rows[0].sectionAnchor.mode).toBe("none");
    expect(rows[0].sectionAnchor.alternativeAnchorLineCount).toBe(0);
    expect(rows[0].sectionAnchor.alternativeTableCount).toBe(0);
  });

  it("does not switch to alternative anchors just below the char threshold", () => {
    const rows = buildDocumentDigests([
      { name: "小さい対照表", content: degeneratedTableDoc(IQC_NO_HEADING_MIN_CHARS - 1) },
    ]);
    expect(rows[0].sectionAnchor.mode).toBe("none");
  });

  it("is deterministic across two calls", () => {
    const documents: TestBasisDocument[] = [
      { name: "新旧対照表", content: degeneratedTableDoc(IQC_NO_HEADING_MIN_CHARS) },
      { name: "pdf.txt", content: noStructureDoc() },
    ];
    const snapshot = JSON.stringify(documents);
    const first = buildDocumentDigests(documents);
    const second = buildDocumentDigests(documents);
    expect(second).toEqual(first);
    expect(JSON.stringify(documents)).toBe(snapshot);
  });
});

describe("findDocumentDigestFindings (alternative-section-anchor)", () => {
  it("emits one info finding stating the fact, the resolution method and the counts", () => {
    const content = degeneratedTableDoc(IQC_NO_HEADING_MIN_CHARS);
    const rows = buildDocumentDigests([{ name: "新旧対照表", content }]);
    const findings = findDocumentDigestFindings(rows);
    const alt = findings.filter((f) => f.kind === "alternative-section-anchor");
    expect(alt).toHaveLength(1);
    expect(alt[0].document).toBe("新旧対照表");
    expect(alt[0].severity).toBe("info");
    expect(alt[0].detail).toContain("代替アンカー");
    expect(alt[0].detail).toContain("パイプ表の行アンカー");
    expect(alt[0].detail).toContain("章節ラベルが1種類");
    expect(alt[0].detail).toContain(formatCount(rows[0].charCount) + "字");
    expect(alt[0].detail).toContain("対象行2行");
    expect(alt[0].detail).toContain("表1件");
    expect(alt[0].detail).toContain("「(見出しなし)」のまま残す");
  });

  it("does not emit the finding for a heading-less, pipe-table-less document (PDF invariance)", () => {
    const rows = buildDocumentDigests([{ name: "pdf.txt", content: noStructureDoc() }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "alternative-section-anchor")).toBe(false);
  });

  it("does not emit the finding for a document with discriminative headings and a pipe table", () => {
    const content = ["# 第1章", "| A | B |", "| 1 | 2 |", "# 第2章", "本文。"].join("\n");
    const rows = buildDocumentDigests([{ name: "仕様書", content }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.some((f) => f.kind === "alternative-section-anchor")).toBe(false);
  });

  it("appends the finding after the existing findings without changing their order", () => {
    const content = degeneratedTableDoc(IQC_NO_HEADING_MIN_CHARS * 2);
    const rows = buildDocumentDigests([{ name: "新旧対照表", content }]);
    const findings = findDocumentDigestFindings(rows);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[findings.length - 1].kind).toBe("alternative-section-anchor");
    expect(findings.slice(0, -1).some((f) => f.kind === "alternative-section-anchor")).toBe(false);
  });
});

describe("renderDocumentDigestLines (代替アンカー注記)", () => {
  it("inserts the alternative-anchor note before the fixed DIGEST_NOTE", () => {
    const content = degeneratedTableDoc(IQC_NO_HEADING_MIN_CHARS);
    const rows = buildDocumentDigests([{ name: "新旧対照表", content }]);
    const findings = findDocumentDigestFindings(rows);
    const lines = renderDocumentDigestLines(rows, findings);
    const noteIndex = lines.findIndex((l) => l.startsWith("- [代替アンカー]"));
    expect(noteIndex).toBeGreaterThan(0);
    expect(lines[noteIndex]).toBe(
      "- [代替アンカー] 章節が「[代替アンカー:表行] …」形式のラベルになっている指摘は、見出しではなくパイプ表の行位置で解決したものである。原文へはラベル末尾の行番号と表の行・列で逆引きすること。"
    );
    expect(noteIndex).toBe(lines.length - 2);
    const iqcIndex = lines.findIndex((l) => l.startsWith("- [IQC]"));
    if (iqcIndex >= 0) expect(iqcIndex).toBeLessThan(noteIndex);
    expect(lines[lines.length - 1]).toBe(
      "- ダイジェストは投入されたテキストのみを対象とする。抜粋を投入した場合、以降の集計・検査はすべて抜粋の範囲に限定される。"
    );
    // ダイジェスト表の列は増やさない
    expect(lines[0]).toBe("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照/目次) | 数値トークン |");
  });

  it("does not emit the note when no document used an alternative anchor", () => {
    const rows = buildDocumentDigests([{ name: "pdf.txt", content: noStructureDoc() }]);
    const findings = findDocumentDigestFindings(rows);
    const lines = renderDocumentDigestLines(rows, findings);
    expect(lines.some((l) => l.startsWith("- [代替アンカー]"))).toBe(false);
  });
});
