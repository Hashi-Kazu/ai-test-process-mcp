import { parseHeadings } from "./tools/reviewTestPlan.js";
import {
  extractIdOccurrences,
  extractQuantityExpressions,
  type TestBasisAnalysisOptions,
} from "./testBasisAnalysis.js";
import type { DocumentDigestFinding, DocumentDigestRow, TestBasisDocument } from "./types.js";

// documents / testBasisDocuments を受け取るツール共通の「入力ダイジェスト」。
// 投入されたテキストの規模と検出量を可視化し、抜粋だけを投入した状態を検出できるようにする。
// すべて純関数で、入力を破壊せず、出力順は入力順（または明示したキー順）で決定的。

/** 最多文書の 1/10 以下の定義数なら抜粋の疑いとみなす。 */
export const DIGEST_PREFIX_SPARSE_RATIO = 0.1;
/** 最多文書の定義数がこの件数未満のプレフィックスは判定に使わない。 */
export const DIGEST_PREFIX_MIN_PEAK = 10;

const DIGEST_NOTE =
  "- ダイジェストは投入されたテキストのみを対象とする。抜粋を投入した場合、以降の集計・検査はすべて抜粋の範囲に限定される。";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** ロケール非依存の3桁区切り（toLocaleString は使わない）。 */
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function buildDocumentDigests(
  documents: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): DocumentDigestRow[] {
  return documents.map((doc) => {
    const occurrences = extractIdOccurrences([doc], options);
    const definitions = occurrences.filter((o) => o.role === "definition");
    const prefixOrder: string[] = [];
    const prefixCountMap = new Map<string, number>();
    for (const def of definitions) {
      if (!prefixCountMap.has(def.prefix)) {
        prefixCountMap.set(def.prefix, 0);
        prefixOrder.push(def.prefix);
      }
      prefixCountMap.set(def.prefix, (prefixCountMap.get(def.prefix) as number) + 1);
    }
    return {
      document: doc.name,
      charCount: doc.content.length,
      lineCount: doc.content.split("\n").length,
      headingCount: parseHeadings(doc.content).length,
      idCount: occurrences.length,
      definedIdCount: definitions.length,
      quantityCount: extractQuantityExpressions([doc]).length,
      prefixCounts: prefixOrder.map((prefix) => ({
        prefix,
        definitionCount: prefixCountMap.get(prefix) as number,
      })),
    };
  });
}

export function findDocumentDigestFindings(rows: DocumentDigestRow[]): DocumentDigestFinding[] {
  const findings: DocumentDigestFinding[] = [];

  for (const row of rows) {
    if (row.idCount === 0) {
      findings.push({
        document: row.document,
        kind: "no-id",
        severity: "medium",
        detail:
          "検出IDが0件。抜粋のみが投入されている可能性がある。全文を投入して再実行すること。",
      });
    }
  }

  // プレフィックス初出順 → 文書入力順
  const prefixOrder: string[] = [];
  for (const row of rows) {
    for (const p of row.prefixCounts) {
      if (p.definitionCount >= 1 && !prefixOrder.includes(p.prefix)) prefixOrder.push(p.prefix);
    }
  }

  for (const prefix of prefixOrder) {
    const present = rows
      .map((row) => ({
        row,
        count: row.prefixCounts.find((p) => p.prefix === prefix)?.definitionCount ?? 0,
      }))
      .filter((entry) => entry.count >= 1);
    if (present.length < 2) continue;
    let peak = 0;
    let peakDoc = "";
    for (const entry of present) {
      if (entry.count > peak) {
        peak = entry.count;
        peakDoc = entry.row.document;
      }
    }
    if (peak < DIGEST_PREFIX_MIN_PEAK) continue;
    // 整数演算で判定する（浮動小数の丸めに依存しないため 1/ratio を整数倍率へ変換する）
    const sparseFactor = Math.round(1 / DIGEST_PREFIX_SPARSE_RATIO);
    for (const entry of present) {
      if (entry.count * sparseFactor > peak) continue;
      findings.push({
        document: entry.row.document,
        kind: "sparse-prefix",
        severity: "medium",
        detail: `プレフィックス「${prefix}」の定義が${entry.count}件で、最多の ${peakDoc}(${peak}件) に比べ著しく少ない。抜粋投入の可能性がある。`,
      });
    }
  }

  return findings;
}

export function renderDocumentDigestLines(
  rows: DocumentDigestRow[],
  findings: DocumentDigestFinding[]
): string[] {
  const lines: string[] = [];
  lines.push("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照) | 数値トークン |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    lines.push(
      `| ${escapeCell(row.document)} | ${formatCount(row.charCount)} | ${formatCount(
        row.lineCount
      )} | ${formatCount(row.headingCount)} | ${formatCount(row.definedIdCount)} / ${formatCount(
        row.idCount - row.definedIdCount
      )} | ${formatCount(row.quantityCount)} |`
    );
  }
  lines.push("");
  for (const f of findings) {
    lines.push(`- [${f.severity}] ${escapeCell(f.document)}: ${f.detail}`);
  }
  lines.push(DIGEST_NOTE);
  return lines;
}
