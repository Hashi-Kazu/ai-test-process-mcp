import { describe, expect, it } from "vitest";
import {
  DIGEST_PREFIX_MIN_PEAK,
  buildDocumentDigests,
  findDocumentDigestFindings,
  renderDocumentDigestLines,
} from "../src/documentDigest.js";
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
