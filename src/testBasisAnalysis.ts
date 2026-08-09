import { parseHeadings, escapeRegExp, groupByHeading } from "./tools/reviewTestPlan.js";
import type { ParsedHeading } from "./tools/reviewTestPlan.js";
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

function headingsPerLine(content: string): string[] {
  const lines = content.split("\n");
  const headings = parseHeadings(content);
  const result: string[] = new Array(lines.length);
  let current = "(見出しなし)";
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    while (idx < headings.length && headings[idx].lineIndex === i) {
      current = headings[idx].raw.trim() || "(見出しなし)";
      idx++;
    }
    result[i] = current;
  }
  return result;
}

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
    const headingPerLine = headingsPerLine(doc.content);
    lines.forEach((line, lineIndex) => {
      const matches = findRawIdMatches(line, patterns, options);
      if (matches.length === 0) return;
      const leadMatch = LEADING_MARKER_REGEX.exec(line);
      const leadPos = leadMatch ? leadMatch[0].length : 0;
      const heading = headingPerLine[lineIndex] ?? "(見出しなし)";
      const lineText = line.trim();
      matches.forEach((match, i) => {
        const isDefinition = i === 0 && match.start === leadPos;
        occurrences.push({
          id: match.id,
          prefix: match.prefix,
          numberPart: match.numberPart,
          document: doc.name,
          lineIndex,
          heading,
          lineText,
          role: isDefinition ? "definition" : "reference",
          kind: match.kind,
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

  const results: TestBasisAmbiguousTermFinding[] = [];
  for (const { term, category } of terms) {
    const regex = new RegExp(`(?<![不非未無])${escapeRegExp(term)}`, "g");
    let total = 0;
    const byHeading: { document: string; heading: string; count: number }[] = [];
    for (const doc of documents) {
      const lines = doc.content.split("\n");
      const headingPerLine = headingsPerLine(doc.content);
      const localOccurrences: { heading: string }[] = [];
      lines.forEach((line, lineIndex) => {
        const matches = line.match(regex);
        if (!matches) return;
        for (let i = 0; i < matches.length; i++) {
          localOccurrences.push({ heading: headingPerLine[lineIndex] ?? "(見出しなし)" });
        }
      });
      const grouped = groupByHeading(localOccurrences);
      for (const g of grouped) {
        byHeading.push({ document: doc.name, heading: g.heading, count: g.count });
        total += g.count;
      }
    }
    if (total > 0) {
      results.push({ term, category, total, byHeading });
    }
  }
  return results;
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
    const headingPerLine = headingsPerLine(doc.content);
    lines.forEach((line, lineIndex) => {
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
            heading: headingPerLine[lineIndex] ?? "(見出しなし)",
            hasBoundaryWord: BOUNDARY_WORD_REGEX.test(m[0]),
          });
        }
      }
    });
  }

  return results;
}
