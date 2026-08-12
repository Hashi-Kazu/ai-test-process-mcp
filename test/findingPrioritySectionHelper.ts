import { expect } from "vitest";

/**
 * 「対処優先度順の指摘一覧」節の共通検査ヘルパー。
 * 配点表は src から import せずここで再宣言し、出力本文の算出根拠セルから
 * 独立に再計算してスコア列と突き合わせる。
 */

const TEST_SEVERITY_POINTS: Record<string, number> = { high: 30, medium: 15, low: 5, info: 0 };

export function impactedIdPoints(n: number): number {
  if (n === 0) return 0;
  if (n === 1) return 2;
  if (n === 2) return 4;
  if (n <= 4) return 6;
  if (n <= 9) return 8;
  return 10;
}

export function crossDocumentPoints(d: number): number {
  if (d <= 1) return 0;
  if (d === 2) return 6;
  if (d === 3) return 8;
  return 10;
}

export function bandOfScore(score: number): string {
  if (score >= 40) return "P1";
  if (score >= 30) return "P2";
  if (score >= 20) return "P3";
  return "P4";
}

export interface ParsedBasis {
  severity: string;
  severityPoints: number;
  impactedIdCount: number;
  impactedIdNames: string[];
  impactedIdPoints: number;
  documentCount: number;
  documentNames: string[];
  documentPoints: number;
  sectionResolved: boolean;
  sectionPoints: number;
}

function splitNames(text: string): string[] {
  if (text === "-") return [];
  return text.split(", ");
}

export function parseBasisCell(cell: string): ParsedBasis {
  const m =
    /^severity=(high|medium|low|info)\((\d+)\) \/ 影響ID(\d+)件\((.*)\)=(\d+) \/ 文書(\d+)件\((.*)\)=(\d+) \/ 章節解決=(済|未)\((\d+)\)$/.exec(
      cell
    );
  expect(m, `算出根拠セルの形式不一致: ${cell}`).not.toBeNull();
  const [
    ,
    severity,
    severityPoints,
    idCount,
    idNames,
    idPoints,
    docCount,
    docNames,
    docPoints,
    sectionLabel,
    sectionPoints,
  ] = m!;
  return {
    severity,
    severityPoints: Number(severityPoints),
    impactedIdCount: Number(idCount),
    impactedIdNames: splitNames(idNames),
    impactedIdPoints: Number(idPoints),
    documentCount: Number(docCount),
    documentNames: splitNames(docNames),
    documentPoints: Number(docPoints),
    sectionResolved: sectionLabel === "済",
    sectionPoints: Number(sectionPoints),
  };
}

/** 根拠セルの因子値から独立にスコアを再計算する。各項の配点も同時に検証する。 */
export function recomputeScore(p: ParsedBasis): number {
  expect(p.severityPoints).toBe(TEST_SEVERITY_POINTS[p.severity]);
  expect(p.impactedIdPoints).toBe(impactedIdPoints(p.impactedIdCount));
  expect(p.documentPoints).toBe(crossDocumentPoints(p.documentCount));
  expect(p.sectionPoints).toBe(p.sectionResolved ? 5 : 0);
  return (
    TEST_SEVERITY_POINTS[p.severity] +
    impactedIdPoints(p.impactedIdCount) +
    crossDocumentPoints(p.documentCount) +
    (p.sectionResolved ? 5 : 0)
  );
}

export interface PriorityRow {
  rank: number;
  band: string;
  score: number;
  id: string;
  categoryId: string;
  severity: string;
  place: string;
  basis: ParsedBasis;
}

/** 優先度一覧節の表行を分解する。 */
export function parsePriorityRows(section: string): PriorityRow[] {
  return section
    .split("\n")
    .filter((l) => /^\| \d+ \| P[1-4] \| \d+ \|/.test(l))
    .map((l) => {
      const c = l.split("|");
      return {
        rank: Number(c[1].trim()),
        band: c[2].trim(),
        score: Number(c[3].trim()),
        id: c[4].trim(),
        categoryId: c[5].trim(),
        severity: c[6].trim(),
        place: c[7].trim(),
        basis: parseBasisCell(c[8].trim()),
      };
    });
}

export interface BandSummary {
  total: number;
  P1: number;
  P2: number;
  P3: number;
  P4: number;
  shown?: number;
  omitted?: number;
  allShown: boolean;
}

export function parseBandSummaryLine(section: string): BandSummary {
  const line = section.split("\n").find((l) => l.startsWith("- 対象指摘: 全"));
  expect(line, "帯サマリ行が見つからない").toBeDefined();
  const m =
    /^- 対象指摘: 全(\d+)件（P1:(\d+) \/ P2:(\d+) \/ P3:(\d+) \/ P4:(\d+)）。(?:対処優先度スコア降順で上位(\d+)件を表示（残り(\d+)件）|全件を対処優先度スコア降順で表示)。$/.exec(
      line!
    );
  expect(m, `帯サマリ行の形式不一致: ${line}`).not.toBeNull();
  const [, total, p1, p2, p3, p4, shown, omitted] = m!;
  return {
    total: Number(total),
    P1: Number(p1),
    P2: Number(p2),
    P3: Number(p3),
    P4: Number(p4),
    shown: shown === undefined ? undefined : Number(shown),
    omitted: omitted === undefined ? undefined : Number(omitted),
    allShown: shown === undefined,
  };
}

export interface TruncationNote {
  label: string;
  total: number;
  shown: number;
  omitted: number;
}

export function parseTruncationNote(section: string, label: string): TruncationNote | undefined {
  const line = section.split("\n").find((l) => l.startsWith(`- ${label}: 全`));
  if (!line) return undefined;
  const m = new RegExp(
    `^- ${label}: 全(\\d+)件中 (\\d+)件を表示（(\\d+)件を省略）。全件は verbose: true で取得できる。$`
  ).exec(line);
  expect(m, `打ち切り注記の形式不一致: ${line}`).not.toBeNull();
  const [, total, shown, omitted] = m!;
  return { label, total: Number(total), shown: Number(shown), omitted: Number(omitted) };
}

/**
 * 優先度一覧節の共通不変条件を検証する。
 * - 表示行数が上限以下（既定時）
 * - スコア列が単調非増加
 * - 算出根拠セルの再計算値がスコア列と一致
 * - 帯・順位が整合
 * - 帯サマリの P1〜P4 合計が全件数と一致
 */
export function expectPrioritySectionInvariants(
  section: string,
  opts: { label: string; verbose: boolean; maxRows: number; expectedTotal: number }
): { rows: PriorityRow[]; summary: BandSummary; truncation?: TruncationNote } {
  const rows = parsePriorityRows(section);
  const summary = parseBandSummaryLine(section);
  const truncation = parseTruncationNote(section, opts.label);

  expect(summary.total).toBe(opts.expectedTotal);
  expect(summary.P1 + summary.P2 + summary.P3 + summary.P4).toBe(summary.total);

  if (opts.verbose) {
    expect(rows.length).toBe(summary.total);
    expect(summary.allShown).toBe(true);
    expect(truncation).toBeUndefined();
  } else {
    expect(rows.length).toBeLessThanOrEqual(opts.maxRows);
    expect(rows.length).toBe(Math.min(opts.maxRows, summary.total));
    if (summary.total > opts.maxRows) {
      expect(truncation).toBeDefined();
      expect(truncation!.total).toBe(summary.total);
      expect(truncation!.shown).toBe(rows.length);
      expect(truncation!.shown + truncation!.omitted).toBe(truncation!.total);
      expect(summary.shown).toBe(rows.length);
      expect(summary.omitted).toBe(summary.total - rows.length);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    expect(row.rank).toBe(i + 1);
    expect(recomputeScore(row.basis)).toBe(row.score);
    expect(row.basis.severity).toBe(row.severity);
    expect(row.band).toBe(bandOfScore(row.score));
    if (i > 0) expect(row.score).toBeLessThanOrEqual(rows[i - 1].score);
  }

  expect(section).toContain("- 優先度スコア配点: severity(high 30 / medium 15 / low 5 / info 0)");
  expect(section).toContain(
    "severity は判定区分ごとの固定値であり本スコアで上書きしない。"
  );

  return { rows, summary, truncation };
}
