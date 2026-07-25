import { parseHeadings, escapeRegExp, groupByHeading } from "./tools/reviewTestPlan.js";
import type { ParsedHeading } from "./tools/reviewTestPlan.js";
import type {
  TestBasisAmbiguousTermFinding,
  TestBasisDocument,
  TestBasisDuplicateId,
  TestBasisIdOccurrence,
  TestBasisPrefixIssue,
  TestBasisPrefixStat,
  TestBasisQuantityExpression,
  TestBasisQuantityKind,
  TestBasisUnresolvedReference,
} from "./types.js";

// 要件ID・機能IDの既定検出パターン。
// EH-100 / S-001-01 / W-008-04 / W-Mail-011-01 / E-016 のような表記を拾える一方、
// 日付表記（2026-04-26 等）は先頭が英大文字ではないため対象外になる。
export const DEFAULT_ID_PATTERN_SOURCE =
  "\\b([A-Z][A-Za-z0-9]{0,5}(?:-[A-Za-z][A-Za-z0-9]{0,7})?)-(\\d{1,4}(?:-\\d{1,3})*)\\b";

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
}

const LEADING_MARKER_REGEX = /^\s*(?:#{1,6}\s+|[-*]\s+|\d+[.).]\s*|\|\s*)?/;

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
}

function findRawIdMatches(line: string, patterns: string[]): RawIdMatch[] {
  const seen = new Map<string, RawIdMatch>();
  for (const source of patterns) {
    const regex = new RegExp(source, "gi");
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      const prefix = m[1];
      const numberPart = m[2];
      const start = m.index;
      const end = start + m[0].length;
      const key = `${start}:${end}`;
      if (!seen.has(key)) {
        seen.set(key, { id: `${prefix}-${numberPart}`, prefix, numberPart, start, end });
      }
      if (m[0].length === 0) regex.lastIndex++;
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.start - b.start);
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
      const matches = findRawIdMatches(line, patterns);
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
        });
      });
    });
  }

  return occurrences;
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
  const definitions = occurrences.filter((o) => o.role === "definition");

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
    const regex = new RegExp(escapeRegExp(term), "g");
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
