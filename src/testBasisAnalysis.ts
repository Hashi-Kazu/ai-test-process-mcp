import { parseHeadings, escapeRegExp, groupByHeading } from "./tools/reviewTestPlan.js";
import type { ParsedHeading } from "./tools/reviewTestPlan.js";
import { ambiguityExclusionRules } from "./resources/ambiguityExclusionRules.js";
import type {
  RequirementSourceRef,
  TestBasisAmbiguousTermFinding,
  TestBasisDocument,
  TestBasisDuplicateId,
  TestBasisIdKind,
  TestBasisIdOccurrence,
  TestBasisPrefixIssue,
  TestBasisPrefixStat,
  TestBasisQuantityExpression,
  TestBasisQuantityKind,
  TestBasisSourceRef,
  TestBasisUnresolvedReference,
} from "./types.js";

// 要件ID・機能IDの既定検出パターン。
// EH-100 / S-001-01 / W-008-04 / W-Mail-011-01 / E-016 のような表記を拾える一方、
// 日付表記（2026-04-26 等）は先頭が英大文字ではないため対象外になる。
export const DEFAULT_ID_PATTERN_SOURCE =
  "\\b([A-Z][A-Za-z0-9]{0,5}(?:-[A-Za-z][A-Za-z0-9]{0,7})?)-(\\d{1,4}(?:-\\d{1,3})*)\\b";

// design_* 系エンジンが発行するコロン区切りの網羅対象ID。
// 例: CFG:MAIN:R12 / PW:MAIN:P3 / DL:S:ORDER:PAID / UC:UC-01:F1 / BV:金額:1000
export const COVERAGE_TARGET_ID_PATTERN_SOURCE =
  "(?<![A-Za-z0-9:])(BV|EP|ST|DT|PW|SC|UC|DL|CFG):" +
  "([A-Za-z0-9_.\\-\\u3040-\\u30FF\\u4E00-\\u9FFF]+(?::[A-Za-z0-9_.\\-\\u3040-\\u30FF\\u4E00-\\u9FFF]+){0,2})";

export const DEFAULT_AMBIGUOUS_TERMS: { term: string; category: TestBasisAmbiguousTermFinding["category"] }[] = [
  // ambiguous（曖昧な限定語）
  { term: "相応の", category: "ambiguous" },
  { term: "必要な", category: "ambiguous" },
  { term: "適切な", category: "ambiguous" },
  { term: "適宜", category: "ambiguous" },
  { term: "十分な", category: "ambiguous" },
  { term: "十分に", category: "ambiguous" },
  { term: "など", category: "ambiguous" },
  { term: "等", category: "ambiguous" },
  { term: "場合によっては", category: "ambiguous" },
  { term: "原則", category: "ambiguous" },
  { term: "基本的に", category: "ambiguous" },
  { term: "可能な限り", category: "ambiguous" },
  { term: "速やかに", category: "ambiguous" },
  { term: "若干", category: "ambiguous" },
  { term: "定期的に", category: "ambiguous" },
  // weak-requirement（弱い要求語）
  { term: "望ましい", category: "weak-requirement" },
  { term: "推奨", category: "weak-requirement" },
  { term: "できるだけ", category: "weak-requirement" },
  { term: "可能であれば", category: "weak-requirement" },
  { term: "考慮する", category: "weak-requirement" },
  { term: "検討する", category: "weak-requirement" },
  { term: "配慮する", category: "weak-requirement" },
  { term: "努める", category: "weak-requirement" },
  // incomplete-note（未完成の注記）
  { term: "一部概要のみ記載", category: "incomplete-note" },
  { term: "詳細は別途", category: "incomplete-note" },
  { term: "TBD", category: "incomplete-note" },
  { term: "未定", category: "incomplete-note" },
  { term: "追記予定", category: "incomplete-note" },
  { term: "省略", category: "incomplete-note" },
  { term: "後述", category: "incomplete-note" },
];

export interface TestBasisAnalysisOptions {
  /** 追加/上書きのID正規表現（source文字列。指定時は既定パターンに追加される） */
  idPatterns?: string[];
  /** 追加の曖昧語（categoryは"ambiguous"扱い） */
  additionalAmbiguousTerms?: string[];
  /**
   * design_* 系エンジンが発行するコロン区切りの網羅対象ID（BV:/EP:/ST:/DT:/PW:/SC:/UC:/DL:/CFG:）を
   * ID索引に含めるかどうか。既定 false（現行挙動を完全維持）。
   */
  includeCoverageTargetIds?: boolean;
}

// 先頭の「空セルだけ」を読み飛ばす。"| | 031 |" の 031 は定義、"| 名前 | 031 |" の 031 は参照のまま。
// \s* はパイプを消費しないため、非空セルの手前で必ず停止する。
const LEADING_MARKER_REGEX = /^\s*(?:#{1,6}\s+|[-*]\s+|\d+[.).]\s*|(?:\|\s*)+)?/;

// 目次行の検出パターン。ドットリーダ（"." または "…" が6文字以上連続）＋任意の空白＋末尾がページ番号（数字のみ）。
// 例: "W-001 新規登録.......................................... 5"
const TOC_DOT_LEADER_REGEX = /[.…]{6,}\s*\d+\s*$/;

export function isTableOfContentsLine(line: string): boolean {
  return TOC_DOT_LEADER_REGEX.test(line);
}

// --- 章節アンカー解決器 ---
//
// Markdown 見出し（`#`）が識別力を持つ文書は従来どおり見出しラベルで章節を示す。
// 見出しラベルが文書全体で1種類しか無く（識別力ゼロ）、かつ一定規模以上の文書に限り、
// パイプ表（`| a | b |`）の行アンカー（表見出し要約＋データ行番号＋列＋行番号）を代替アンカーとして使う。
// 見出しもパイプ表も無い箇所は "(見出しなし)" のまま残す（pdftotext 出力等の現状維持）。

/** 代替アンカーへ切り替える最小文字数（IQC-03 の見出し0件判定と同じ閾値）。 */
export const ALT_ANCHOR_MIN_CHARS = 2000;

const NO_HEADING_LABEL = "(見出しなし)";

/** パイプ表の区切り行（`| --- | --- |` 等）。documentDigest 側と同一のパターン。 */
const PIPE_TABLE_SEPARATOR_REGEX = /^\|[\s:|-]+\|$/;

/** ラベル用セル要約の1セルあたり最大文字数。 */
const ANCHOR_CELL_MAX_CHARS = 10;
/** ラベル用の表見出し要約全体の最大文字数。 */
const ANCHOR_SUMMARY_MAX_CHARS = 40;
/** 表見出し要約に使う先頭セル数。 */
const ANCHOR_SUMMARY_CELL_COUNT = 3;

export type SectionAnchorKind = "heading" | "table-row" | "none";

export interface SectionAnchor {
  /** 章節ラベル。kind==="heading" は見出しの生テキスト、"none" は "(見出しなし)" */
  label: string;
  kind: SectionAnchorKind;
  /** 逆引き用の1-based行番号。"heading" は見出し行、"table-row" は当該行、"none" は undefined */
  anchorLine?: number;
  /** kind==="table-row" のみ: 文書内のパイプ表ブロック番号（1-based） */
  tableIndex?: number;
  /** kind==="table-row" のみ: データ行番号（1-based。表見出し行は 0） */
  rowNumber?: number;
  /** kind==="table-row" のみ: 表見出し要約（ラベル用に正規化済み） */
  tableSummary?: string;
  /** kind==="table-row" のみ: 列解決用のセル境界（行内オフセット）とヘッダ文字列 */
  cells?: { start: number; end: number; header: string }[];
}

export interface SectionAnchorResolution {
  /** 行(0-based index)ごとの章節アンカー。要素数は content.split("\n").length と一致する。 */
  anchors: SectionAnchor[];
  /** 行ごとの見出しラベルの異なり数（1以下なら見出しに識別力が無い） */
  distinctHeadingAnchors: number;
  /** kind==="table-row" の行数 */
  alternativeAnchorLineCount: number;
  /** 代替アンカーを与えたパイプ表ブロック数 */
  alternativeTableCount: number;
}

/**
 * パイプ表行なら各セル（行内オフセット付き。raw行基準）を返す。
 * 区切り行と、先頭末尾を除いた要素が2件未満の行は null。
 * 判定・分割規約は documentDigest.extractTableCells のパイプ分岐と同一。
 */
export function parsePipeTableRow(
  line: string
): { text: string; start: number; end: number }[] | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  if (PIPE_TABLE_SEPARATOR_REGEX.test(trimmed)) return null;

  // trim で落ちた先頭空白ぶんを足して raw 行基準のオフセットにする。
  const offset = line.length - line.trimStart().length;
  const parts: { text: string; start: number; end: number }[] = [];
  let current = "";
  let start = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    // 直前が \\ でない | を区切りとする（documentDigest.escapeCell と対称）
    if (ch === "|" && trimmed[i - 1] !== "\\") {
      parts.push({ text: current, start: offset + start, end: offset + i });
      current = "";
      start = i + 1;
    } else {
      current += ch;
    }
  }
  parts.push({ text: current, start: offset + start, end: offset + trimmed.length });

  const inner = parts.slice(1, -1);
  if (inner.length < 2) return null;
  return inner;
}

/** ラベルに `|` と改行を持ち込まないようセルを正規化し、長すぎる場合は切り詰める。 */
function normalizeCellForLabel(text: string): string {
  const normalized = text
    .replace(/\\\|/g, "/")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length > ANCHOR_CELL_MAX_CHARS) {
    return `${normalized.slice(0, ANCHOR_CELL_MAX_CHARS)}…`;
  }
  return normalized;
}

/** 表見出し行の非空セル先頭3件から表の要約ラベルを作る。 */
function buildTableSummary(cells: { text: string }[]): string {
  const labels: string[] = [];
  for (const cell of cells) {
    const normalized = normalizeCellForLabel(cell.text);
    if (normalized === "") continue;
    labels.push(normalized);
    if (labels.length >= ANCHOR_SUMMARY_CELL_COUNT) break;
  }
  if (labels.length === 0) return "(無題)";
  const joined = labels.join(" / ");
  if (joined.length > ANCHOR_SUMMARY_MAX_CHARS) {
    return `${joined.slice(0, ANCHOR_SUMMARY_MAX_CHARS)}…`;
  }
  return joined;
}

/** 表行アンカーのラベルを組み立てる唯一の関数（label と anchorLabelAt の両方がここを通る）。 */
function formatTableRowLabel(anchor: SectionAnchor, columnIndex: number | null): string {
  const rowPart = anchor.rowNumber === 0 ? "見出し行" : `第${anchor.rowNumber}行`;
  let columnPart = "";
  if (columnIndex !== null) {
    const header = anchor.cells?.[columnIndex]?.header ?? "";
    columnPart = ` 第${columnIndex + 1}列${header === "" ? "" : `「${header}」`}`;
  }
  return `[代替アンカー:表行] 表「${anchor.tableSummary}」${rowPart}${columnPart}(行${anchor.anchorLine})`;
}

/**
 * 行(0-based index)ごとの章節アンカーと、代替アンカーの利用実体を返す。
 * 純関数・決定的。要素数は content.split("\n").length と一致する。
 */
export function resolveSectionAnchorsDetailed(content: string): SectionAnchorResolution {
  const lines = content.split("\n");
  const headings = parseHeadings(content);

  const headingLabels: string[] = new Array(lines.length);
  const headingLines: (number | undefined)[] = new Array(lines.length);
  let currentLabel = NO_HEADING_LABEL;
  let currentLine: number | undefined = undefined;
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    while (idx < headings.length && headings[idx].lineIndex === i) {
      const raw = headings[idx].raw.trim();
      if (raw === "") {
        currentLabel = NO_HEADING_LABEL;
        currentLine = undefined;
      } else {
        currentLabel = raw;
        currentLine = i + 1;
      }
      idx++;
    }
    headingLabels[i] = currentLabel;
    headingLines[i] = currentLine;
  }

  const distinctHeadingAnchors = new Set(headingLabels).size;
  const anchors: SectionAnchor[] = lines.map((_line, i) =>
    headingLabels[i] === NO_HEADING_LABEL
      ? { label: NO_HEADING_LABEL, kind: "none" }
      : { label: headingLabels[i], kind: "heading", anchorLine: headingLines[i] }
  );

  let alternativeAnchorLineCount = 0;
  let alternativeTableCount = 0;

  // 見出しラベルが1種類しか無く（識別力ゼロ）、かつ十分に大きい文書だけ代替アンカーへ切り替える。
  const degenerated =
    distinctHeadingAnchors <= 1 && content.length >= ALT_ANCHOR_MIN_CHARS;
  if (degenerated) {
    let tableIndex = 0;
    let blockActive = false;
    let blockHasHeader = false;
    let rowNumber = 0;
    let headerCells: { text: string; start: number; end: number }[] = [];
    let tableSummary = "";
    for (let i = 0; i < lines.length; i++) {
      const cells = parsePipeTableRow(lines[i]);
      const isSeparator = cells === null && PIPE_TABLE_SEPARATOR_REGEX.test(lines[i].trim());
      if (cells === null && !isSeparator) {
        // パイプ表ブロックの終端
        blockActive = false;
        blockHasHeader = false;
        continue;
      }
      if (!blockActive) {
        blockActive = true;
        blockHasHeader = false;
      }
      // 区切り行はデータ行番号を消費しない
      if (cells === null) continue;
      if (!blockHasHeader) {
        blockHasHeader = true;
        tableIndex += 1;
        alternativeTableCount += 1;
        headerCells = cells;
        tableSummary = buildTableSummary(cells);
        rowNumber = 0;
      } else {
        rowNumber += 1;
      }
      const anchor: SectionAnchor = {
        label: "",
        kind: "table-row",
        anchorLine: i + 1,
        tableIndex,
        rowNumber,
        tableSummary,
        cells: cells.map((cell, ci) => ({
          start: cell.start,
          end: cell.end,
          header: normalizeCellForLabel(headerCells[ci]?.text ?? ""),
        })),
      };
      anchor.label = formatTableRowLabel(anchor, null);
      anchors[i] = anchor;
      alternativeAnchorLineCount += 1;
    }
  }

  return { anchors, distinctHeadingAnchors, alternativeAnchorLineCount, alternativeTableCount };
}

/** 行(0-based index)ごとの章節アンカーを返す。要素数は content.split("\n").length と一致する。 */
export function resolveSectionAnchors(content: string): SectionAnchor[] {
  return resolveSectionAnchorsDetailed(content).anchors;
}

/**
 * 行内オフセットから列位置まで解決したラベルを返す。
 * table-row 以外・オフセットがセル外なら anchor.label をそのまま返す。
 */
export function anchorLabelAt(anchor: SectionAnchor, offsetInLine: number): string {
  if (anchor.kind !== "table-row" || anchor.cells === undefined) return anchor.label;
  const index = anchor.cells.findIndex(
    (cell) => offsetInLine >= cell.start && offsetInLine < cell.end
  );
  if (index < 0) return anchor.label;
  return formatTableRowLabel(anchor, index);
}

const FALLBACK_ANCHOR: SectionAnchor = { label: NO_HEADING_LABEL, kind: "none" };

interface RawIdMatch {
  id: string;
  prefix: string;
  numberPart: string;
  start: number;
  end: number;
  kind: TestBasisIdKind;
}

function overlapsRange(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

// ID末尾の数値列（"-" "_" "." 区切りの多階層を含む）を numberPart として切り出す。
// 例: "REQ_001" -> {prefix:"REQ_", numberPart:"001"} / "031" -> {prefix:"", numberPart:"031"}
//     "FR1.2.3" -> {prefix:"FR", numberPart:"1.2.3"} / "ABC" -> {prefix:"ABC", numberPart:""}
const ID_TAIL_NUMBER_REGEX = /^(.*?)(\d+(?:[-._]\d+)*)$/;

export function splitIdIntoPrefixAndNumber(id: string): { prefix: string; numberPart: string } {
  const m = ID_TAIL_NUMBER_REGEX.exec(id);
  if (m === null) return { prefix: id, numberPart: "" };
  return { prefix: m[1], numberPart: m[2] };
}

function findRawIdMatches(
  line: string,
  patterns: string[],
  options: TestBasisAnalysisOptions = {}
): RawIdMatch[] {
  const coverageMatches: RawIdMatch[] = [];
  if (options.includeCoverageTargetIds === true) {
    const regex = new RegExp(COVERAGE_TARGET_ID_PATTERN_SOURCE, "g");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      coverageMatches.push({
        id: `${m[1]}:${m[2]}`,
        prefix: `${m[1]}:`,
        numberPart: m[2],
        start,
        end,
        kind: "coverageTarget",
      });
      if (m[0].length === 0) regex.lastIndex++;
    }
  }

  const seen = new Map<string, RawIdMatch>();
  for (const source of patterns) {
    const regex = new RegExp(source, "gi");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (coverageMatches.some((c) => overlapsRange([c.start, c.end], [start, end]))) {
        if (m[0].length === 0) regex.lastIndex++;
        continue;
      }
      const key = `${start}:${end}`;
      if (!seen.has(key)) {
        // キャプチャグループ数でID組み立て規約を切り替える。
        // 2グループ以上: 従来どおり `${m[1]}-${m[2]}` として再構成する（既定パターンの挙動を維持）。
        // 1グループ:     m[1] 全体をIDとして扱い、ハイフン結合しない。
        // 0グループ:     m[0]（マッチ全体）をIDとして扱う。
        // m[2] が undefined（省略可能グループが不参加）のときも1グループ扱いにし、"…-undefined" を作らない。
        let id: string;
        let prefix: string;
        let numberPart: string;
        if (m.length >= 3 && m[2] !== undefined && m[1] !== undefined) {
          id = `${m[1]}-${m[2]}`;
          prefix = m[1];
          numberPart = m[2];
        } else if (m.length >= 2 && m[1] !== undefined) {
          id = m[1];
          ({ prefix, numberPart } = splitIdIntoPrefixAndNumber(id));
        } else {
          id = m[0];
          ({ prefix, numberPart } = splitIdIntoPrefixAndNumber(id));
        }
        seen.set(key, {
          id,
          prefix,
          numberPart,
          start,
          end,
          kind: "requirement",
        });
      }
      if (m[0].length === 0) regex.lastIndex++;
    }
  }
  return [...coverageMatches, ...seen.values()].sort((a, b) => a.start - b.start);
}

export function extractIdOccurrences(
  documents: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): TestBasisIdOccurrence[] {
  const patterns = [DEFAULT_ID_PATTERN_SOURCE, ...(options.idPatterns ?? [])];
  const occurrences: TestBasisIdOccurrence[] = [];

  for (const doc of documents) {
    const lines = doc.content.split("\n");
    const anchors = resolveSectionAnchors(doc.content);
    const headingLineIndexSet = new Set(parseHeadings(doc.content).map((h) => h.lineIndex));
    lines.forEach((line, lineIndex) => {
      const matches = findRawIdMatches(line, patterns, options);
      if (matches.length === 0) return;
      const leadMatch = LEADING_MARKER_REGEX.exec(line);
      const leadPos = leadMatch ? leadMatch[0].length : 0;
      const anchor = anchors[lineIndex] ?? FALLBACK_ANCHOR;
      const lineText = line.trim();
      const isToc = isTableOfContentsLine(line);
      const isHeadingLine = headingLineIndexSet.has(lineIndex);
      matches.forEach((match, i) => {
        let role: "definition" | "reference" | "toc";
        if (isToc) {
          role = "toc";
        } else {
          const isDefinition = i === 0 && match.start === leadPos;
          role = isDefinition ? "definition" : "reference";
        }
        occurrences.push({
          id: match.id,
          prefix: match.prefix,
          numberPart: match.numberPart,
          document: doc.name,
          lineIndex,
          heading: anchorLabelAt(anchor, match.start),
          lineText,
          role,
          kind: match.kind,
          isHeadingLine,
        });
      });
    });
  }

  return occurrences;
}

/**
 * 行/文書横断でIDを1回だけ数えたい呼び出し向けのヘルパー。
 * findRawIdMatches によるID再構成ロジックを1か所に集約し、出現順・重複排除済みのID配列を返す。
 */
export function extractIdStringsFromText(
  text: string,
  options: TestBasisAnalysisOptions = {}
): string[] {
  const patterns = [DEFAULT_ID_PATTERN_SOURCE, ...(options.idPatterns ?? [])];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of findRawIdMatches(text, patterns, options)) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    result.push(match.id);
  }
  return result;
}

function extractDefinitionTitle(occurrence: TestBasisIdOccurrence): string {
  let text = occurrence.lineText.replace(LEADING_MARKER_REGEX, "");
  const idRegex = new RegExp(`^${escapeRegExp(occurrence.id)}\\s*[:：\\-–—]?\\s*`, "i");
  text = text.replace(idRegex, "").trim();
  if (text.length > 40) return `${text.slice(0, 40)}…`;
  return text;
}

/**
 * 要件ID(定義occurrence)ごとに、テストベース文書内の根拠位置（行範囲・見出し・引用ラベル）を組み立てる。
 * 入力の出現順を保つ決定的な純関数。
 */
export function buildRequirementSourceRefs(
  occurrences: TestBasisIdOccurrence[],
  documents: TestBasisDocument[]
): RequirementSourceRef[] {
  const definitions = occurrences.filter((o) => o.role === "definition");

  const docLastLine = new Map<string, number>();
  for (const doc of documents) {
    docLastLine.set(doc.name, doc.content.trimEnd().split("\n").length);
  }

  const byDoc = new Map<string, TestBasisIdOccurrence[]>();
  for (const def of definitions) {
    if (!byDoc.has(def.document)) byDoc.set(def.document, []);
    byDoc.get(def.document)!.push(def);
  }
  for (const list of byDoc.values()) {
    list.sort((a, b) => a.lineIndex - b.lineIndex);
  }

  const result: RequirementSourceRef[] = [];
  for (const def of definitions) {
    const docDefs = byDoc.get(def.document) ?? [def];
    const next = docDefs.find((d) => d.lineIndex > def.lineIndex);
    const startLine = def.lineIndex + 1;
    let endLine: number;
    if (next) {
      endLine = next.lineIndex; // 次定義行(0-based)＝次定義の1行前(1-based)
    } else {
      endLine = docLastLine.get(def.document) ?? startLine;
    }
    if (endLine < startLine) endLine = startLine;

    const title = extractDefinitionTitle(def);
    let label: string;
    if (title) {
      label = `${def.id} ${title}`;
    } else if (def.heading) {
      label = def.heading;
    } else {
      label = def.id;
    }

    result.push({
      requirementId: def.id,
      document: def.document,
      startLine,
      endLine,
      heading: def.heading,
      label,
    });
  }
  return result;
}

export function formatSourceRef(ref: TestBasisSourceRef): string {
  if (ref.endLine === undefined || ref.endLine === ref.startLine) {
    return `${ref.document}:${ref.startLine}`;
  }
  return `${ref.document}:${ref.startLine}-${ref.endLine}`;
}

export function formatSourceCitation(ref: TestBasisSourceRef): string {
  const label = ref.label ?? ref.document;
  if (ref.endLine === undefined || ref.endLine === ref.startLine) {
    return `(${label}, line ${ref.startLine})`;
  }
  return `(${label}, line ${ref.startLine}-${ref.endLine})`;
}

export function findDuplicateIds(occurrences: TestBasisIdOccurrence[]): TestBasisDuplicateId[] {
  const order: string[] = [];
  const byId = new Map<string, TestBasisIdOccurrence[]>();
  for (const occ of occurrences) {
    if (occ.role !== "definition") continue;
    if (!byId.has(occ.id)) {
      order.push(occ.id);
      byId.set(occ.id, []);
    }
    byId.get(occ.id)!.push(occ);
  }

  const result: TestBasisDuplicateId[] = [];
  for (const id of order) {
    const defs = byId.get(id)!;
    if (defs.length < 2) continue;
    const sameText = defs.every((d) => d.lineText === defs[0].lineText);
    const headingCount = defs.filter((d) => d.isHeadingLine).length;
    const severity: "high" | "medium" =
      defs.length === 2 && headingCount === 1 ? "medium" : "high";
    result.push({
      id,
      count: defs.length,
      places: defs.map((d) => ({
        document: d.document,
        lineIndex: d.lineIndex,
        heading: d.heading,
        lineText: d.lineText,
      })),
      sameText,
      severity,
    });
  }
  return result;
}

export function findUnresolvedReferences(
  occurrences: TestBasisIdOccurrence[]
): TestBasisUnresolvedReference[] {
  const definedIds = new Set(occurrences.filter((o) => o.role === "definition").map((o) => o.id));
  const result: TestBasisUnresolvedReference[] = [];
  for (const occ of occurrences) {
    if (occ.role !== "reference") continue;
    if (definedIds.has(occ.id)) continue;
    result.push({
      id: occ.id,
      document: occ.document,
      lineIndex: occ.lineIndex,
      heading: occ.heading,
      lineText: occ.lineText,
    });
  }
  return result;
}

function uniqueSortedNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

export function analyzePrefixes(occurrences: TestBasisIdOccurrence[]): {
  stats: TestBasisPrefixStat[];
  issues: TestBasisPrefixIssue[];
} {
  // prefix === "" は接頭辞ベースのID体系ではない（数値のみのID等）ことを意味するため、
  // 接頭辞の一貫性検査（桁数/セグメント数/大文字小文字/希少プレフィックス）の対象から除外する。
  // 既定パターンでは prefix が空になることは無いため、既存挙動への影響は無い。
  const definitions = occurrences.filter(
    (o) => o.role === "definition" && o.kind !== "coverageTarget" && o.prefix !== ""
  );

  const prefixOrder: string[] = [];
  const byPrefix = new Map<string, TestBasisIdOccurrence[]>();
  for (const def of definitions) {
    if (!byPrefix.has(def.prefix)) {
      prefixOrder.push(def.prefix);
      byPrefix.set(def.prefix, []);
    }
    byPrefix.get(def.prefix)!.push(def);
  }

  const stats: TestBasisPrefixStat[] = prefixOrder.map((prefix) => {
    const defs = byPrefix.get(prefix)!;
    const widths: number[] = [];
    const segmentCounts: number[] = [];
    const documents: string[] = [];
    for (const def of defs) {
      const segments = def.numberPart.split("-");
      segmentCounts.push(segments.length);
      for (const seg of segments) widths.push(seg.length);
      if (!documents.includes(def.document)) documents.push(def.document);
    }
    return {
      prefix,
      definitionCount: defs.length,
      digitWidths: uniqueSortedNumbers(widths),
      segmentCounts: uniqueSortedNumbers(segmentCounts),
      documents,
    };
  });

  const issues: TestBasisPrefixIssue[] = [];

  // digit-width-mismatch / segment-count-mismatch
  for (const prefix of prefixOrder) {
    const defs = byPrefix.get(prefix)!;
    const segmentCountSet = uniqueSortedNumbers(defs.map((d) => d.numberPart.split("-").length));
    if (segmentCountSet.length > 1) {
      issues.push({
        kind: "segment-count-mismatch",
        prefixes: [prefix],
        detail: `プレフィックス「${prefix}」でIDのセグメント数が統一されていません（${segmentCountSet.join(
          " / "
        )}セグメントが混在）。`,
      });
    }

    const bySegmentCount = new Map<number, string[][]>();
    for (const def of defs) {
      const segments = def.numberPart.split("-");
      const key = segments.length;
      if (!bySegmentCount.has(key)) bySegmentCount.set(key, []);
      bySegmentCount.get(key)!.push(segments);
    }
    let widthMismatch = false;
    for (const segmentsList of bySegmentCount.values()) {
      if (segmentsList.length < 2) continue;
      const segCount = segmentsList[0].length;
      for (let pos = 0; pos < segCount; pos++) {
        const widthsAtPos = uniqueSortedNumbers(segmentsList.map((segs) => segs[pos].length));
        if (widthsAtPos.length > 1) {
          widthMismatch = true;
        }
      }
    }
    if (widthMismatch) {
      issues.push({
        kind: "digit-width-mismatch",
        prefixes: [prefix],
        detail: `プレフィックス「${prefix}」で連番の桁数が統一されていません。`,
      });
    }
  }

  // case-variant
  const normalizedGroups = new Map<string, Set<string>>();
  for (const prefix of prefixOrder) {
    const norm = prefix.toLowerCase();
    if (!normalizedGroups.has(norm)) normalizedGroups.set(norm, new Set());
    normalizedGroups.get(norm)!.add(prefix);
  }
  for (const variants of normalizedGroups.values()) {
    if (variants.size > 1) {
      issues.push({
        kind: "case-variant",
        prefixes: Array.from(variants),
        detail: `大文字小文字だけが異なるプレフィックス（${Array.from(variants).join(
          " / "
        )}）が混在しています。`,
      });
    }
  }

  // rare-prefix
  const commonPrefixes = prefixOrder.filter((p) => (byPrefix.get(p)?.length ?? 0) >= 3);
  if (commonPrefixes.length > 0) {
    for (const prefix of prefixOrder) {
      const count = byPrefix.get(prefix)!.length;
      if (count === 1 && commonPrefixes.some((p) => p !== prefix)) {
        issues.push({
          kind: "rare-prefix",
          prefixes: [prefix],
          detail: `プレフィックス「${prefix}」の定義は1件のみで、他に3件以上定義されているプレフィックスが存在します。誤記の可能性があります。`,
        });
      }
    }
  }

  return { stats, issues };
}

export function findAmbiguousTerms(
  documents: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): TestBasisAmbiguousTermFinding[] {
  const terms: { term: string; category: TestBasisAmbiguousTermFinding["category"] }[] = [
    ...DEFAULT_AMBIGUOUS_TERMS,
    ...(options.additionalAmbiguousTerms ?? []).map((term) => ({
      term,
      category: "ambiguous" as const,
    })),
  ];

  // 用語ごとの文脈依存除外規則（ambiguityExclusionRules.rules から term 一致分のみ）。
  const exclusionRulesByTerm = new Map<
    string,
    { id: string; regex: RegExp }[]
  >();
  for (const rule of ambiguityExclusionRules.rules) {
    if (!exclusionRulesByTerm.has(rule.term)) exclusionRulesByTerm.set(rule.term, []);
    exclusionRulesByTerm.get(rule.term)!.push({ id: rule.id, regex: new RegExp(rule.contextPatternSource, "g") });
  }

  const QUOTE_CONTEXT_CHARS = 18;
  function buildQuote(line: string, start: number, end: number): string {
    const before = line.slice(Math.max(0, start - QUOTE_CONTEXT_CHARS), start);
    const after = line.slice(end, end + QUOTE_CONTEXT_CHARS);
    return `${before}「${line.slice(start, end)}」${after}`;
  }

  const results: TestBasisAmbiguousTermFinding[] = [];
  for (const { term, category } of terms) {
    const regex = new RegExp(`(?<![不非未無])${escapeRegExp(term)}`, "g");
    const rulesForTerm = exclusionRulesByTerm.get(term) ?? [];
    let total = 0;
    const byHeading: { document: string; heading: string; count: number }[] = [];
    const excludedByRuleMap = new Map<string, number>();
    const exclusionHits: { ruleId: string; document: string; heading: string; quote: string }[] = [];
    for (const doc of documents) {
      const lines = doc.content.split("\n");
      const anchors = resolveSectionAnchors(doc.content);
      const localOccurrences: { heading: string }[] = [];
      lines.forEach((line, lineIndex) => {
        const anchor = anchors[lineIndex] ?? FALLBACK_ANCHOR;
        // regex は用語ごとに1個を使い回すため、行単位で lastIndex を明示リセットする。
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(line)) !== null) {
          const start = m.index;
          const end = start + m[0].length;
          const matchedRule = rulesForTerm.find((rule) => {
            rule.regex.lastIndex = start;
            const rm = rule.regex.exec(line);
            return rm !== null && rm.index === start;
          });
          if (matchedRule) {
            excludedByRuleMap.set(matchedRule.id, (excludedByRuleMap.get(matchedRule.id) ?? 0) + 1);
            exclusionHits.push({
              ruleId: matchedRule.id,
              document: doc.name,
              heading: anchorLabelAt(anchor, start),
              quote: buildQuote(line, start, end),
            });
          } else {
            localOccurrences.push({ heading: anchorLabelAt(anchor, start) });
          }
          if (m[0].length === 0) regex.lastIndex++;
        }
      });
      const grouped = groupByHeading(localOccurrences);
      for (const g of grouped) {
        byHeading.push({ document: doc.name, heading: g.heading, count: g.count });
        total += g.count;
      }
    }
    const excludedTotal = Array.from(excludedByRuleMap.values()).reduce((sum, n) => sum + n, 0);
    if (total > 0 || excludedTotal > 0) {
      results.push({
        term,
        category,
        total,
        byHeading,
        excludedTotal,
        excludedByRule: Array.from(excludedByRuleMap.entries()).map(([ruleId, count]) => ({ ruleId, count })),
        exclusionHits,
      });
    }
  }
  return results;
}

/**
 * 1行サマリ用の除外件数・規則ID内訳の断片（例:「（除外12件: AMBX-01×10, AMBX-02×2）」）。
 * excludedTotal===0 なら空文字列。review_test_basis / analyze_requirements / analyze_cause_effect で共有する。
 */
export function formatAmbiguousExclusionSummary(finding: TestBasisAmbiguousTermFinding): string {
  if (finding.excludedTotal === 0) return "";
  const byRuleText = finding.excludedByRule.map((r) => `${r.ruleId}×${r.count}`).join(", ");
  return `（除外${finding.excludedTotal}件: ${byRuleText}）`;
}

/**
 * 除外規則の宣言(件数)と実体(本文中の一致箇所)を突き合わせるための引用一覧行。
 * exclusionHits が無ければ null。maxHits 超過分は「ほかN件」に畳む(verbose なら全件)。
 */
export function formatAmbiguousExclusionHitsLine(
  finding: TestBasisAmbiguousTermFinding,
  maxHits: number,
  verbose: boolean
): string | null {
  if (finding.exclusionHits.length === 0) return null;
  const hitsToShow = verbose ? finding.exclusionHits : finding.exclusionHits.slice(0, maxHits);
  const rest = finding.exclusionHits.length - hitsToShow.length;
  const hitsText =
    hitsToShow.map((h) => `[${h.ruleId}] ${h.document} / ${h.heading}: ${h.quote}`).join(" / ") +
    (rest > 0 ? ` ほか${rest}件` : "");
  return `  - 除外実体: ${hitsText}`;
}

const BOUNDARY_WORD_REGEX = /以上|以下|未満|超|以内/;

const QUANTITY_KIND_PATTERNS: { kind: TestBasisQuantityKind; regex: RegExp }[] = [
  {
    kind: "comparison",
    regex: /\d+(?:\.\d+)?\s*(?:秒|分|時間|日|回|件|人|枚|桁|%|円|個|台|文字)?\s*(?:以上|以下|未満|超|以内|まで)/g,
  },
  {
    kind: "time",
    regex: /\b([01]?\d|2[0-3]):[0-5]\d\b|\d{1,2}時(?:\d{1,2}分)?/g,
  },
  {
    kind: "duration",
    regex: /\d+(?:\.\d+)?\s*(?:秒|分|時間|日)/g,
  },
  {
    kind: "count",
    regex: /\d+\s*(?:回|件|人|枚)/g,
  },
  {
    kind: "digits",
    regex: /\d+\s*桁/g,
  },
  {
    kind: "period",
    regex: /毎日|毎時|毎週|毎月|毎年|定期的に|定期|\d+(?:日|時間|分)ごと/g,
  },
  {
    kind: "quantity",
    regex: /\d+(?:\.\d+)?\s*(?:%|円|個|台|文字|ページ|kg|km|m)/g,
  },
];

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export function extractQuantityExpressions(
  documents: TestBasisDocument[]
): TestBasisQuantityExpression[] {
  const results: TestBasisQuantityExpression[] = [];

  for (const doc of documents) {
    const lines = doc.content.split("\n");
    const anchors = resolveSectionAnchors(doc.content);
    lines.forEach((line, lineIndex) => {
      const anchor = anchors[lineIndex] ?? FALLBACK_ANCHOR;
      const occupied: [number, number][] = [];
      for (const { kind, regex } of QUANTITY_KIND_PATTERNS) {
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(line)) !== null) {
          const start = m.index;
          const end = start + m[0].length;
          if (m[0].length === 0) {
            regex.lastIndex++;
            continue;
          }
          if (occupied.some((range) => overlaps(range, [start, end]))) continue;
          occupied.push([start, end]);
          results.push({
            raw: m[0],
            kind,
            document: doc.name,
            lineIndex,
            heading: anchorLabelAt(anchor, start),
            hasBoundaryWord: BOUNDARY_WORD_REGEX.test(m[0]),
          });
        }
      }
    });
  }

  return results;
}
