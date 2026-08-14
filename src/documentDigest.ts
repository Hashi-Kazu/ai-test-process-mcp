import { escapeRegExp, parseHeadings } from "./tools/reviewTestPlan.js";
import {
  extractIdOccurrences,
  extractQuantityExpressions,
  parsePipeTableRow,
  resolveSectionAnchorsDetailed,
  type TestBasisAnalysisOptions,
} from "./testBasisAnalysis.js";
import { countBidiControls, stripBidiControls } from "./groundingNormalization.js";
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

const ISOLATED_NUMERIC_CELL_PATTERN = /^[0-9０-９]{2,}$/;
const BROKEN_TABLE_CELL_SUFFIX_PATTERN = /(、|[をにはがのでとへも]|して|され|および)$/;

/**
 * 表行のセルを抽出する。行単位で判定し、入力を破壊しない。
 * 1) trim 済みの行がパイプ表行（"|"で始まり"|"で終わり、区切り行でない）なら、
 *    直前が \\ でない | で分割し、先頭・末尾の空要素を除いた分割結果を採用（要素2件以上のときのみ）。
 *    判定・分割は testBasisAnalysis.parsePipeTableRow() に集約している（章節の代替アンカーと同一規約）。
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
    const pipeCells = parsePipeTableRow(line);
    if (pipeCells !== null) {
      rowCells = pipeCells.map((cell) => cell.text);
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

/**
 * 投入配列・投入オブジェクトを破壊せず、テストベース文書の content を双方向制御文字除去後の
 * 内容に差し替えたコピーを返す共通ヘルパ。documents/testBasisDocuments/documentsBefore/documentsAfter を
 * 受け取る各ツールの入口で1回だけ適用する。
 */
export function sanitizeTestBasisDocuments<T extends { name: string; content: string }>(
  documents: T[]
): T[] {
  return documents.map((doc) => ({ ...doc, content: stripBidiControls(doc.content) }));
}

/**
 * content（サニタイズ前）から DocumentInputQualityMetrics を算出する。
 * bidiControlCount / bidiControlCounts はサニタイズ前の content から数える。
 * それ以外の指標（表セル・ふりがな・表崩れ）は双方向制御文字を除去した内容を対象とする。
 */
export function computeInputQualityMetrics(rawContent: string): DocumentInputQualityMetrics {
  const { total: bidiControlCount, byCodePoint: bidiControlCounts } = countBidiControls(rawContent);
  const content = stripBidiControls(rawContent);
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
    bidiControlCount,
    bidiControlCounts,
  };
}

export function buildDocumentDigests(
  documents: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): DocumentDigestRow[] {
  const perDoc = documents.map((rawDoc) => {
    const doc = { ...rawDoc, content: stripBidiControls(rawDoc.content) };
    const occurrences = extractIdOccurrences([doc], options);
    const definitions = occurrences.filter((o) => o.role === "definition");
    const tocIdCount = occurrences.filter((o) => o.role === "toc").length;
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
    return { doc, rawContent: rawDoc.content, occurrences, definitions, tocIdCount, prefixOrder, prefixCountMap };
  });

  const globalPrefixes = new Set<string>();
  for (const entry of perDoc) {
    for (const prefix of entry.prefixOrder) {
      globalPrefixes.add(prefix);
    }
  }

  return perDoc.map(({ doc, rawContent, occurrences, definitions, tocIdCount, prefixOrder, prefixCountMap }) => {
    let otherPrefixReferenceCount = 0;
    if (occurrences.length === 0) {
      for (const prefix of globalPrefixes) {
        const pattern = new RegExp("\\b" + escapeRegExp(prefix) + "\\b", "g");
        const matches = doc.content.match(pattern);
        if (matches) otherPrefixReferenceCount += matches.length;
      }
    }
    const headingCount = parseHeadings(doc.content).length;
    const anchorResolution = resolveSectionAnchorsDetailed(doc.content);
    const anchorMode: "heading" | "alternative" | "none" =
      anchorResolution.alternativeAnchorLineCount > 0
        ? "alternative"
        : headingCount > 0
          ? "heading"
          : "none";
    return {
      document: doc.name,
      charCount: doc.content.length,
      lineCount: doc.content.split("\n").length,
      headingCount,
      idCount: occurrences.length,
      definedIdCount: definitions.length,
      tocIdCount,
      quantityCount: extractQuantityExpressions([doc]).length,
      prefixCounts: prefixOrder.map((prefix) => ({
        prefix,
        definitionCount: prefixCountMap.get(prefix) as number,
      })),
      otherPrefixReferenceCount,
      inputQuality: computeInputQualityMetrics(rawContent),
      sectionAnchor: {
        mode: anchorMode,
        distinctHeadingAnchors: anchorResolution.distinctHeadingAnchors,
        alternativeAnchorLineCount: anchorResolution.alternativeAnchorLineCount,
        alternativeTableCount: anchorResolution.alternativeTableCount,
      },
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
      for (const line of stripBidiControls(doc.content).split("\n")) {
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
    } else if (row.definedIdCount === 0) {
      const referenceCount = row.idCount - row.definedIdCount - row.tocIdCount;
      findings.push({
        document: row.document,
        kind: "no-defined-id",
        severity: "medium",
        detail:
          `検出IDが${row.idCount}件（参照${referenceCount}件・目次${row.tocIdCount}件）あるが、定義IDが0件のため決定的層が空振りしている。idPatterns がこの文書のID書式に一致していない可能性があり、検査不能（要確認）。指摘が0件であることは合格を意味しない。idPatterns を見直すか、この文書のID書式を確認して再実行すること。`,
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

    // IQC-05: 双方向制御文字（除去済み。件数を明示する）
    if (q.bidiControlCount > 0) {
      const breakdown = q.bidiControlCounts
        .map((b) => `${b.codePoint} ${formatCount(b.count)}字`)
        .join(" / ");
      findings.push({
        document: row.document,
        kind: "bidi-control-chars",
        severity: "medium",
        detail: `[IQC-05] 双方向制御文字を${formatCount(q.bidiControlCount)}字（内訳: ${breakdown}）検出し、除去した上で以降の全検査を実施した。` +
          `本ダイジェストの文字数${formatCount(row.charCount)}字は除去後の値である。` +
          `除去しない場合、行頭マーカー直後のID定義が参照と誤判定され、本文に実在する逐語引用が未照合（偽陽性）になる。` +
          `原本の変換設定を見直し、双方向制御文字を含まないテキストを投入することが望ましいが、本実行の検査結果は除去後の本文に基づく。`,
      });
    }
  }

  // 代替アンカー（パイプ表の行アンカー）を実際に使った文書だけ、その事実と解決方式を明示する。
  // 既存指摘の順序を変えないため、専用ループを末尾に置く。
  for (const row of rows) {
    const anchor = row.sectionAnchor;
    if (anchor.mode !== "alternative") continue;
    findings.push({
      document: row.document,
      kind: "alternative-section-anchor",
      severity: "info",
      detail:
        `見出しによる章節解決が退化している（文書全体で章節ラベルが${formatCount(
          anchor.distinctHeadingAnchors
        )}種類・${formatCount(row.charCount)}字）ため、` +
        `代替アンカー（パイプ表の行アンカー: 表見出し行の要約＋データ行番号＋列＋行番号）で章節を解決した。` +
        `対象行${formatCount(anchor.alternativeAnchorLineCount)}行・表${formatCount(
          anchor.alternativeTableCount
        )}件。見出しもパイプ表も無い箇所は「(見出しなし)」のまま残す。`,
    });
  }

  return findings;
}

// IQC-01〜IQC-04 は「原本から再変換したテキストで再実行すること」という汎用注記(IQC_NOTE)の対象。
// bidi-control-chars（IQC-05）は本ツールが検出時点で除去して以降の全検査を実施済みであり、
// 再実行を要求する指摘ではないため、意図的にこの集合へ含めない。
const IQC_FINDING_KINDS: DocumentDigestFinding["kind"][] = [
  "isolated-numeric-cells",
  "furigana-contamination",
  "no-heading",
  "broken-table-cells",
];

const IQC_NOTE =
  "- [IQC] 入力品質の指摘は投入テキストの変換品質に関する指標であり、テストベース仕様そのものの欠陥ではない。原本から再変換したテキストで再実行すること。";

const ALT_ANCHOR_NOTE =
  "- [代替アンカー] 章節が「[代替アンカー:表行] …」形式のラベルになっている指摘は、見出しではなくパイプ表の行位置で解決したものである。原文へはラベル末尾の行番号と表の行・列で逆引きすること。";

export function renderDocumentDigestLines(
  rows: DocumentDigestRow[],
  findings: DocumentDigestFinding[],
  unmatchedIdPatterns: string[] = []
): string[] {
  const lines: string[] = [];
  lines.push("| 文書 | 文字数 | 行数 | 見出し数 | 検出ID(定義/参照/目次) | 数値トークン |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    lines.push(
      `| ${escapeCell(row.document)} | ${formatCount(row.charCount)} | ${formatCount(
        row.lineCount
      )} | ${formatCount(row.headingCount)} | ${formatCount(row.definedIdCount)} / ${formatCount(
        row.idCount - row.definedIdCount - row.tocIdCount
      )} / ${formatCount(row.tocIdCount)} | ${formatCount(row.quantityCount)} |`
    );
  }
  lines.push("");
  for (const f of findings) {
    lines.push(`- [${f.severity}] ${escapeCell(f.document)}: ${f.detail}`);
  }
  const totalDefinedIdCount = rows.reduce((sum, row) => sum + row.definedIdCount, 0);
  for (const source of unmatchedIdPatterns) {
    if (totalDefinedIdCount === 0) {
      lines.push(
        `- [high] 指定パターンが1件も一致しなかった: \`${source}\`。idPatterns の誤りか、投入文書にそのID体系が無い。` +
          `この状態では実在ID母集団が縮退したまま以降の検査・網羅率が算出されるため、パターンを修正するか指定を外して再実行すること。`
      );
    } else {
      lines.push(
        `- [medium] 指定パターンが1件も一致しなかった: \`${source}\`。ただし既定パターン等で定義IDを計${formatCount(
          totalDefinedIdCount
        )}件検出済みのため、実在ID母集団が縮退しているとは限らない。このパターンは投入文書に存在しない書式（例: 成果物側の表セル分割形式）を想定していた可能性がある。idPatterns の対象文書と用途を見直すこと。`
      );
    }
  }
  if (findings.some((f) => IQC_FINDING_KINDS.includes(f.kind))) {
    lines.push(IQC_NOTE);
  }
  if (findings.some((f) => f.kind === "alternative-section-anchor")) {
    lines.push(ALT_ANCHOR_NOTE);
  }
  lines.push(DIGEST_NOTE);
  return lines;
}
