import type { ReviewSeverity } from "./types.js";

/**
 * 決定的指摘の「対処優先度」算出。
 *
 * severity（判定区分ごとの固定値）は書き換えず、指摘実体（影響ID数・文書横断性・
 * 章節解決可否）から独立にスコアを算出して併記する。純関数と定数のみで構成し、
 * MCP・zod には依存しない。
 */

export type FindingPrioritySeverity = ReviewSeverity | "info";
export type FindingPriorityBand = "P1" | "P2" | "P3" | "P4";

/** 指摘実体から観測した因子値。宣言値は severity のみで、他は実体由来。 */
export interface FindingPriorityFactors {
  /** 判定区分の宣言値（本スコアで上書きしない） */
  severity: FindingPrioritySeverity;
  /** 指摘が指している要件ID/機能ID（出現順・重複除去済み） */
  impactedIds: readonly string[];
  /** 根拠位置が跨る文書名（出現順・重複除去済み） */
  documents: readonly string[];
  /** 章節ラベルが1つ以上解決できたか */
  sectionResolved: boolean;
}

export interface FindingPriorityInput extends FindingPriorityFactors {
  /** 指摘ID（F-01 / TB-01 / BC-003 / PAC-01#1 など） */
  id: string;
  /** 判定区分ID（"ID重複" / "BC-01" / "PAC-01" 等。表示用） */
  categoryId: string;
  /** "文書名:行番号 章節" 形式の該当箇所（表示用） */
  place: string;
}

export interface FindingPriorityPoints {
  severity: number;
  impactedId: number;
  crossDocument: number;
  sectionResolved: number;
}

export interface FindingPriorityResult extends FindingPriorityInput {
  points: FindingPriorityPoints;
  /** points 4項の総和 */
  score: number;
  band: FindingPriorityBand;
  /** 1始まりの連番 */
  rank: number;
}

/** severity（宣言値）の配点。 */
export const FINDING_PRIORITY_SEVERITY_POINTS: Record<FindingPrioritySeverity, number> = {
  high: 30,
  medium: 15,
  low: 5,
  info: 0,
};

/** 影響ID数の配点。 */
export const FINDING_PRIORITY_IMPACTED_ID_POINTS = [
  { maxCount: 0, points: 0 },
  { maxCount: 1, points: 2 },
  { maxCount: 2, points: 4 },
  { maxCount: 4, points: 6 },
  { maxCount: 9, points: 8 },
  { maxCount: Infinity, points: 10 },
] as const;

/** 文書横断の配点。 */
export const FINDING_PRIORITY_CROSS_DOCUMENT_POINTS = [
  { maxCount: 1, points: 0 },
  { maxCount: 2, points: 6 },
  { maxCount: 3, points: 8 },
  { maxCount: Infinity, points: 10 },
] as const;

/** 章節が解決できた場合の配点。 */
export const FINDING_PRIORITY_SECTION_RESOLVED_POINTS = 5;

/** 取り得るスコアの最大値（high 30 + 影響ID 10 + 文書横断 10 + 章節 5）。 */
export const FINDING_PRIORITY_MAX_SCORE = 55;

/** 帯の下限スコア（降順）。 */
export const FINDING_PRIORITY_BANDS = [
  { band: "P1" as const, minScore: 40 },
  { band: "P2" as const, minScore: 30 },
  { band: "P3" as const, minScore: 20 },
  { band: "P4" as const, minScore: -Infinity },
] as const;

/** 既定表示（verbose=false）で優先度一覧に載せる行数の上限。 */
export const MAX_PRIORITIZED_FINDING_ROWS = 20;

/** 章節ラベルが解決できなかったときのラベル。 */
export const UNRESOLVED_SECTION_LABEL = "(見出しなし)";

const SEVERITY_RANK: Record<FindingPrioritySeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

function severityRank(s: FindingPrioritySeverity): number {
  return SEVERITY_RANK[s] ?? 0;
}

function pointsForCount(
  table: readonly { readonly maxCount: number; readonly points: number }[],
  count: number
): number {
  for (const entry of table) {
    if (count <= entry.maxCount) return entry.points;
  }
  return table[table.length - 1].points;
}

/** 空文字を除き出現順で重複除去する。 */
export function distinctInOrder(values: readonly (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    if (v === undefined || v === null) continue;
    if (v === "") continue;
    if (seen.has(v)) continue;
    seen.add(v);
    result.push(v);
  }
  return result;
}

/** `UNRESOLVED_SECTION_LABEL` でも空文字でもない見出しが1つ以上あれば true。 */
export function isSectionResolved(headings: readonly (string | undefined)[]): boolean {
  return headings.some((h) => h !== undefined && h !== "" && h !== UNRESOLVED_SECTION_LABEL);
}

/** 単一指摘の配点・スコア・帯を算出する。 */
export function scoreFindingPriority(factors: FindingPriorityFactors): {
  points: FindingPriorityPoints;
  score: number;
  band: FindingPriorityBand;
} {
  const points: FindingPriorityPoints = {
    severity: FINDING_PRIORITY_SEVERITY_POINTS[factors.severity] ?? 0,
    impactedId: pointsForCount(FINDING_PRIORITY_IMPACTED_ID_POINTS, factors.impactedIds.length),
    crossDocument: pointsForCount(FINDING_PRIORITY_CROSS_DOCUMENT_POINTS, factors.documents.length),
    sectionResolved: factors.sectionResolved ? FINDING_PRIORITY_SECTION_RESOLVED_POINTS : 0,
  };
  const score = points.severity + points.impactedId + points.crossDocument + points.sectionResolved;
  const band = FINDING_PRIORITY_BANDS.find((b) => score >= b.minScore)!.band;
  return { points, score, band };
}

/**
 * スコア降順 → severity ランク降順 → 入力配列の元インデックス昇順で安定ソートし、
 * rank を1始まり連番で付与する。
 */
export function rankFindingPriorities(
  inputs: readonly FindingPriorityInput[]
): FindingPriorityResult[] {
  const scored = inputs.map((input, index) => ({ input, index, ...scoreFindingPriority(input) }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      severityRank(b.input.severity) - severityRank(a.input.severity) ||
      a.index - b.index
  );
  return scored.map((e, i) => ({
    ...e.input,
    points: e.points,
    score: e.score,
    band: e.band,
    rank: i + 1,
  }));
}

function formatNames(names: readonly string[], maxNames: number): string {
  if (names.length === 0) return "-";
  if (maxNames === Infinity || names.length <= maxNames) return names.join(", ");
  const shown = names.slice(0, maxNames);
  return `${shown.join(", ")}, ほか${names.length - shown.length}件`;
}

/** 算出根拠セルの文字列を作る。 */
export function formatFindingPriorityBasis(
  result: FindingPriorityResult,
  opts: { maxNames?: number } = {}
): string {
  const maxNames = opts.maxNames ?? 3;
  const idPart = `影響ID${result.impactedIds.length}件(${formatNames(result.impactedIds, maxNames)})=${
    result.points.impactedId
  }`;
  const docPart = `文書${result.documents.length}件(${formatNames(result.documents, maxNames)})=${
    result.points.crossDocument
  }`;
  const sectionPart = `章節解決=${result.sectionResolved ? "済" : "未"}(${result.points.sectionResolved})`;
  return `severity=${result.severity}(${result.points.severity}) / ${idPart} / ${docPart} / ${sectionPart}`;
}

/** 配点表の凡例1行。 */
export function renderFindingPriorityLegendLine(): string {
  return (
    "- 優先度スコア配点: severity(high 30 / medium 15 / low 5 / info 0)" +
    " + 影響ID数(0件 0 / 1件 2 / 2件 4 / 3-4件 6 / 5-9件 8 / 10件以上 10)" +
    " + 文書横断(1文書以下 0 / 2文書 6 / 3文書 8 / 4文書以上 10)" +
    " + 章節解決(済 5 / 未 0)。最大55点。" +
    "帯は P1:40点以上 / P2:30-39 / P3:20-29 / P4:20点未満。" +
    "severity は判定区分ごとの固定値であり本スコアで上書きしない。"
  );
}

function bandCounts(results: readonly FindingPriorityResult[]): Record<FindingPriorityBand, number> {
  const counts: Record<FindingPriorityBand, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const r of results) counts[r.band] += 1;
  return counts;
}

/** 帯内訳のサマリ1行。shownCount が total と同数なら全件表示の文言にする。 */
export function renderFindingPriorityBandSummaryLine(
  results: readonly FindingPriorityResult[],
  shownCount: number
): string {
  const total = results.length;
  const c = bandCounts(results);
  const breakdown = `（P1:${c.P1} / P2:${c.P2} / P3:${c.P3} / P4:${c.P4}）`;
  if (shownCount >= total) {
    return `- 対象指摘: 全${total}件${breakdown}。全件を対処優先度スコア降順で表示。`;
  }
  return `- 対象指摘: 全${total}件${breakdown}。対処優先度スコア降順で上位${shownCount}件を表示（残り${
    total - shownCount
  }件）。`;
}

/** 打ち切り注記（#205/#206/#225 で確立した既存書式と完全一致）。 */
export function renderFindingPriorityTruncationNote(
  label: string,
  total: number,
  shown: number
): string {
  return `- ${label}: 全${total}件中 ${shown}件を表示（${
    total - shown
  }件を省略）。全件は verbose: true で取得できる。`;
}

/**
 * 宣言(severity)と実体(因子)の照合。低 severity 側のスコアが高 severity 側を
 * 上回っているペア数を数え、1組以上なら注意行を返す。
 */
export function renderSeverityDivergenceLine(
  results: readonly FindingPriorityResult[]
): string | undefined {
  let pairCount = 0;
  let example: { low: FindingPriorityResult; high: FindingPriorityResult; gap: number } | undefined;
  for (const a of results) {
    for (const b of results) {
      if (severityRank(a.severity) >= severityRank(b.severity)) continue;
      if (a.score <= b.score) continue;
      pairCount += 1;
      const gap = a.score - b.score;
      if (
        example === undefined ||
        gap > example.gap ||
        (gap === example.gap && a.rank < example.low.rank)
      ) {
        example = { low: a, high: b, gap };
      }
    }
  }
  if (pairCount === 0 || example === undefined) return undefined;
  return (
    `- severity宣言と実体因子の逆転: ${pairCount}組（例: ${example.low.id} [${example.low.severity}] スコア${example.low.score}` +
    ` > ${example.high.id} [${example.high.severity}] スコア${example.high.score}）。` +
    "severity は判定区分の固定値、スコアは指摘実体の影響範囲からの算出であり、" +
    "食い違う箇所は severity の妥当性を本文で確認すること。"
  );
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** 「対処優先度順の指摘一覧」節を出す共通レンダラ。 */
export function renderFindingPrioritySection(
  heading: string,
  label: string,
  inputs: readonly FindingPriorityInput[],
  verbose: boolean
): string[] {
  const lines: string[] = [];
  lines.push(`### ${heading}`);
  lines.push("");

  const results = rankFindingPriorities(inputs);
  if (results.length === 0) {
    lines.push("- 対象指摘なし（決定的検査の指摘が0件）。未指摘は合格を意味しない。");
    lines.push("");
    return lines;
  }

  const shown = verbose ? results : results.slice(0, MAX_PRIORITIZED_FINDING_ROWS);
  lines.push(renderFindingPriorityLegendLine());
  lines.push(renderFindingPriorityBandSummaryLine(results, shown.length));
  lines.push("| 順位 | 優先度 | スコア | 指摘ID | 区分 | 重大度 | 該当箇所 | 算出根拠 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  const maxNames = verbose ? Infinity : 3;
  for (const r of shown) {
    lines.push(
      `| ${r.rank} | ${r.band} | ${r.score} | ${escapeCell(r.id)} | ${escapeCell(r.categoryId)} | ${
        r.severity
      } | ${escapeCell(r.place)} | ${escapeCell(formatFindingPriorityBasis(r, { maxNames }))} |`
    );
  }
  if (!verbose && shown.length < results.length) {
    lines.push(renderFindingPriorityTruncationNote(label, results.length, shown.length));
  }
  const divergence = renderSeverityDivergenceLine(results);
  if (divergence) lines.push(divergence);
  lines.push("");
  return lines;
}
