import { escapeRegExp, parseHeadings } from "./tools/reviewTestPlan.js";
import {
  extractIdOccurrences,
  extractQuantityExpressions,
  type TestBasisAnalysisOptions,
} from "./testBasisAnalysis.js";
import type {
  DocumentDigestFinding,
  DocumentDigestRow,
  DocumentInputQualityMetrics,
  TestBasisDocument,
} from "./types.js";
import {
  IQC_BROKEN_TABLE_PERCENT,
  IQC_FURIGANA_HIGH_PERMILLE,
  IQC_FURIGANA_MEDIUM_PERMILLE,
  IQC_FURIGANA_MIN_RUN_LENGTH,
  IQC_FURIGANA_MIN_RUNS,
  IQC_ISOLATED_NUMERIC_HIGH_PERCENT,
  IQC_ISOLATED_NUMERIC_MIN_DISTINCT,
  IQC_MIN_TABLE_CELLS,
  IQC_NO_HEADING_MIN_CHARS,
  IQC_NO_HEADING_MIN_LINES,
  IQC_YOMI_KATAKANA,
} from "./resources/inputQualityCriteria.js";

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

/** 整数演算で小数第1位までの百分率文字列を作る（例: 77.8 / 30）。total===0 のときは "0" を返す。 */
export function formatPercent(count: number, total: number): string {
  if (total === 0) return "0";
  return String(Math.round((count * 1000) / total) / 10);
}

const TABLE_ROW_SEPARATOR_PATTERN = /^\|[\s:|-]+\|$/;
const ISOLATED_NUMERIC_CELL_PATTERN = /^[0-9０-９]{2,}$/;
const BROKEN_TABLE_CELL_SUFFIX_PATTERN = /(、|[をにはがのでとへも]|して|され|および)$/;

/** 直前が \\ でない | を区切りとして分割する（escapeCell と対称）。 */
function splitByUnescapedPipe(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "|" && line[i - 1] !== "\\") {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * 表行のセルを抽出する。行単位で判定し、入力を破壊しない。
 * 1) trim 済みの行がパイプ表行（"|"で始まり"|"で終わり、区切り行でない）なら、
 *    直前が \\ でない | で分割し、先頭・末尾の空要素を除いた分割結果を採用（要素2件以上のときのみ）。
 * 2) そうでない行は、2個以上の連続空白（全角空白含む）で分割したセグメントが3件以上のとき
 *    レイアウト抽出表行として採用。
 * 3) 各セルを trim し、空文字セルを除いて返す。
 */
export function extractTableCells(content: string): string[] {
  const cells: string[] = [];
  const lines = content.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;

    let rowCells: string[] | null = null;
    if (line.startsWith("|") && line.endsWith("|") && !TABLE_ROW_SEPARATOR_PATTERN.test(line)) {
      const parts = splitByUnescapedPipe(line);
      const inner = parts.slice(1, -1);
      if (inner.length >= 2) {
        rowCells = inner;
      }
    }
    if (rowCells === null) {
      const segments = line.split(/\s{2,}|　+/).filter((s) => s !== "");
      if (segments.length >= 3) {
        rowCells = segments;
      }
    }
    if (rowCells) {
      for (const raw of rowCells) {
        const trimmed = raw.trim();
        if (trimmed !== "") cells.push(trimmed);
      }
    }
  }
  return cells;
}

/** content から DocumentInputQualityMetrics を算出する。 */
export function computeInputQualityMetrics(content: string): DocumentInputQualityMetrics {
  const cells = extractTableCells(content);
  const isolatedNumericSet = new Set<string>();
  let isolatedNumericCount = 0;
  let brokenTableCellCount = 0;
  for (const cell of cells) {
    if (ISOLATED_NUMERIC_CELL_PATTERN.test(cell)) {
      isolatedNumericCount++;
      isolatedNumericSet.add(cell);
    }
    if (cell.length >= 3 && BROKEN_TABLE_CELL_SUFFIX_PATTERN.test(cell)) {
      brokenTableCellCount++;
    }
  }

  const furiganaPattern = new RegExp(
    "[\\u4E00-\\u9FFF\\u3005]([" + IQC_YOMI_KATAKANA + "]{" + IQC_FURIGANA_MIN_RUN_LENGTH + ",})",
    "g"
  );
  let furiganaRunCount = 0;
  let furiganaCharCount = 0;
  let match: RegExpExecArray | null;
  while ((match = furiganaPattern.exec(content)) !== null) {
    furiganaRunCount++;
    furiganaCharCount += match[1].length;
  }

  return {
    tableCellCount: cells.length,
    isolatedNumericCount,
    isolatedNumericDistinct: isolatedNumericSet.size,
    furiganaRunCount,
    furiganaCharCount,
    brokenTableCellCount,
  };
}

export function buildDocumentDigests(
  documents: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): DocumentDigestRow[] {
  const perDoc = documents.map((doc) => {
    const occurrences = extractIdOccurrences([doc], options);
    const definitions = occurrences.filter((o) => o.role === "definition");
    const prefixOrder: string[] = [];
    const prefixCountMap = new Map<string, number>();
    for (const def of definitions) {
      // prefix === "" は接頭辞ベースのID体系ではない（数値のみのID等）ため、
      // 接頭辞別集計（prefixCounts）には載せない。definedIdCount/idCountからは除外しない。
      if (def.prefix === "") continue;
      if (!prefixCountMap.has(def.prefix)) {
        prefixCountMap.set(def.prefix, 0);
        prefixOrder.push(def.prefix);
      }
      prefixCountMap.set(def.prefix, (prefixCountMap.get(def.prefix) as number) + 1);
    }
    return { doc, occurrences, definitions, prefixOrder, prefixCountMap };
  });

  const globalPrefixes = new Set<string>();
  for (const entry of perDoc) {
    for (const prefix of entry.prefixOrder) {
      globalPrefixes.add(prefix);
    }
  }

  return perDoc.map(({ doc, occurrences, definitions, prefixOrder, prefixCountMap }) => {
    let otherPrefixReferenceCount = 0;
    if (occurrences.length === 0) {
      for (const prefix of globalPrefixes) {
        const pattern = new RegExp("\\b" + escapeRegExp(prefix) + "\\b", "g");
        const matches = doc.content.match(pattern);
        if (matches) otherPrefixReferenceCount += matches.length;
      }
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
      otherPrefixReferenceCount,
      inputQuality: computeInputQualityMetrics(doc.content),
    };
  });
}

/**
 * idPatterns で指定されたパターンのうち、投入文書のどの行にも1件も一致しなかったものを返す。
 * findRawIdMatches と同じ行単位・同じフラグ(gi)で走査する。既定パターンは対象外。
 */
export function findUnmatchedIdPatterns(
  documents: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): string[] {
  const sources = options.idPatterns ?? [];
  return sources.filter((source) => {
    const regex = new RegExp(source, "gi");
    for (const doc of documents) {
      for (const line of doc.content.split("\n")) {
        regex.lastIndex = 0;
        if (regex.test(line)) return false;
      }
    }
    return true;
  });
}

export function findDocumentDigestFindings(rows: DocumentDigestRow[]): DocumentDigestFinding[] {
  const findings: DocumentDigestFinding[] = [];

  for (const row of rows) {
    if (row.idCount === 0) {
      if (row.otherPrefixReferenceCount > 0) {
        findings.push({
          document: row.document,
          kind: "no-id",
          severity: "medium",
          detail:
            "検出IDが0件だが、他文書が持つIDプレフィックスへの参照が見つかった。抜粋のみが投入されている可能性がある。全文を投入して再実行すること。",
        });
      } else {
        findings.push({
          document: row.document,
          kind: "no-id-system",
          severity: "info",
          detail:
            "検出IDが0件で、他文書が持つIDプレフィックスへの参照も無い。この文書はID体系を持たない文書であり、抜粋の指摘ではない。",
        });
      }
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

  for (const row of rows) {
    const q = row.inputQuality;

    // IQC-01: 孤立数値セル
    if (
      q.tableCellCount >= IQC_MIN_TABLE_CELLS &&
      q.isolatedNumericCount * 100 >= q.tableCellCount * IQC_ISOLATED_NUMERIC_HIGH_PERCENT &&
      q.isolatedNumericDistinct >= IQC_ISOLATED_NUMERIC_MIN_DISTINCT
    ) {
      findings.push({
        document: row.document,
        kind: "isolated-numeric-cells",
        severity: "high",
        detail: `[IQC-01] 表行のセル${formatCount(q.tableCellCount)}件のうち、単位も文脈語も伴わない2桁以上の数値のみのセルが${formatCount(
          q.isolatedNumericCount
        )}件（${formatPercent(q.isolatedNumericCount, q.tableCellCount)}%、異なり値${formatCount(
          q.isolatedNumericDistinct
        )}種）を占める。変換時にセル値が別の値へ化けている可能性が高い。原本から再変換したテキストで再実行すること。`,
      });
    }

    // IQC-02: ふりがな混入
    if (q.furiganaRunCount >= IQC_FURIGANA_MIN_RUNS && row.charCount > 0) {
      const permilleOk = (n: number) => q.furiganaCharCount * 1000 >= row.charCount * n;
      let severity: "high" | "medium" | null = null;
      if (permilleOk(IQC_FURIGANA_HIGH_PERMILLE)) {
        severity = "high";
      } else if (permilleOk(IQC_FURIGANA_MEDIUM_PERMILLE)) {
        severity = "medium";
      }
      if (severity) {
        findings.push({
          document: row.document,
          kind: "furigana-contamination",
          severity,
          detail: `[IQC-02] 漢字の直後に区切りなく続くカタカナ列（読み仮名と推定）が${formatCount(
            q.furiganaRunCount
          )}件・計${formatCount(q.furiganaCharCount)}字あり、全文字数${formatCount(
            row.charCount
          )}字の${formatPercent(q.furiganaCharCount, row.charCount)}%を占める。変換時にふりがな（ルビ）が本文へ混入している可能性が高い。ふりがなを除いたテキストで再実行すること。`,
        });
      }
    }

    // IQC-03: 見出し0件
    if (row.headingCount === 0 && row.charCount >= IQC_NO_HEADING_MIN_CHARS && row.lineCount >= IQC_NO_HEADING_MIN_LINES) {
      findings.push({
        document: row.document,
        kind: "no-heading",
        severity: "medium",
        detail: `[IQC-03] ${formatCount(row.charCount)}字・${formatCount(
          row.lineCount
        )}行の文書に見出しが0件。変換時に見出し構造が失われている可能性がある。この状態では以降の全指摘の章節が「(見出しなし)」に退化する。見出しを保持した変換テキストで再実行すること。`,
      });
    }

    // IQC-04: 表崩れ
    if (
      q.tableCellCount >= IQC_MIN_TABLE_CELLS &&
      q.brokenTableCellCount * 100 >= q.tableCellCount * IQC_BROKEN_TABLE_PERCENT
    ) {
      findings.push({
        document: row.document,
        kind: "broken-table-cells",
        severity: "medium",
        detail: `[IQC-04] 表行のセル${formatCount(q.tableCellCount)}件のうち${formatCount(
          q.brokenTableCellCount
        )}件（${formatPercent(
          q.brokenTableCellCount,
          q.tableCellCount
        )}%）が助詞・読点で終わっている。表のセルが行方向に分断され、断片が1セルとして抽出されている可能性がある。セル結合を保持した変換テキストで再実行すること。`,
      });
    }
  }

  return findings;
}

const IQC_FINDING_KINDS: DocumentDigestFinding["kind"][] = [
  "isolated-numeric-cells",
  "furigana-contamination",
  "no-heading",
  "broken-table-cells",
];

const IQC_NOTE =
  "- [IQC] 入力品質の指摘は投入テキストの変換品質に関する指標であり、テストベース仕様そのものの欠陥ではない。原本から再変換したテキストで再実行すること。";

export function renderDocumentDigestLines(
  rows: DocumentDigestRow[],
  findings: DocumentDigestFinding[],
  unmatchedIdPatterns: string[] = []
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
  for (const source of unmatchedIdPatterns) {
    lines.push(
      `- [high] 指定パターンが1件も一致しなかった: \`${source}\`。idPatterns の誤りか、投入文書にそのID体系が無い。` +
        `この状態では実在ID母集団が縮退したまま以降の検査・網羅率が算出されるため、パターンを修正するか指定を外して再実行すること。`
    );
  }
  if (findings.some((f) => IQC_FINDING_KINDS.includes(f.kind))) {
    lines.push(IQC_NOTE);
  }
  lines.push(DIGEST_NOTE);
  return lines;
}
