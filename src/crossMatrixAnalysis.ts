import { normalizeForGrounding } from "./groundingNormalization.js";
import { extractIdOccurrences } from "./testBasisAnalysis.js";
import type { TestBasisAnalysisOptions } from "./testBasisAnalysis.js";
import type {
  AuditCrossMatrixInput,
  CrossMatrixAuditResult,
  CrossMatrixAxisItem,
  CrossMatrixAxisPairSpec,
  CrossMatrixAxisPopulation,
  CrossMatrixAxisSpec,
  CrossMatrixCell,
  CrossMatrixDeclaredCoverage,
  CrossMatrixEmptyLine,
  CrossMatrixExclusion,
  CrossMatrixFinding,
  CrossMatrixLinkRef,
  CrossMatrixPairResult,
  CrossMatrixSummary,
  TestBasisDocument,
} from "./types.js";

// audit_cross_matrix 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順（または明示したソートキー）で決定的。
// 乱数・現在時刻・環境依存の値は一切使わない。同一入力に対し配列順まで含めて同一出力になる。

/** 1ペアあたりのセル数上限の既定値。 */
export const DEFAULT_MAX_CELL_COUNT = 20000;

function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function itemLabel(item: CrossMatrixAxisItem): string {
  return item.label ?? item.id;
}

/** リンク根拠として扱う最小長（正規化後の文字数）。CEG-15 と同じ閾値。 */
const MIN_LINK_EVIDENCE_LENGTH = 2;

/**
 * items[].links の宣言（文字列 or オブジェクト）を CrossMatrixLinkRef へ正規化する。
 * - 文字列要素は { targetId: 文字列 } へ変換する。
 * - targetId が空文字/空白のみの宣言は除外する（CMX-01 で別に報告する）。
 * - 同一 targetId が複数回宣言された場合は最初の宣言のみを採用する。
 * - 入力は破壊しない。出力順は宣言順。
 */
export function normalizeAxisItemLinks(item: CrossMatrixAxisItem): CrossMatrixLinkRef[] {
  const result: CrossMatrixLinkRef[] = [];
  const seen = new Set<string>();
  for (const link of item.links ?? []) {
    const ref: CrossMatrixLinkRef =
      typeof link === "string" ? { targetId: link } : { ...link };
    if (ref.targetId.trim() === "") continue;
    if (seen.has(ref.targetId)) continue;
    seen.add(ref.targetId);
    result.push(ref);
  }
  return result;
}

/** 正規化済みリンク宣言の targetId 列（宣言順・重複除去済み）。 */
export function linkTargetIds(item: CrossMatrixAxisItem): string[] {
  return normalizeAxisItemLinks(item).map((link) => link.targetId);
}

/** targetId が空文字/空白のみのリンク宣言の件数。 */
function countBlankLinkTargets(item: CrossMatrixAxisItem): number {
  let count = 0;
  for (const link of item.links ?? []) {
    const targetId = typeof link === "string" ? link : link.targetId;
    if (targetId.trim() === "") count++;
  }
  return count;
}

function buildGroundingCorpus(documents: TestBasisDocument[]): string {
  return normalizeForGrounding(documents.map((doc) => doc.content).join("\n"));
}

/** 根拠が正規化済み corpus から裏付けられているか。未記入・短すぎる場合も false。 */
function isLinkEvidenceGrounded(link: CrossMatrixLinkRef, normalizedCorpus: string): boolean {
  const normalized = normalizeForGrounding(link.evidence ?? "");
  if (normalized.length < MIN_LINK_EVIDENCE_LENGTH) return false;
  return normalizedCorpus.includes(normalized);
}

/** axisId の初出宣言を採用した索引。 */
function buildAxisIndex(axes: CrossMatrixAxisSpec[]): Map<string, CrossMatrixAxisSpec> {
  const index = new Map<string, CrossMatrixAxisSpec>();
  for (const axis of axes) {
    if (!index.has(axis.axisId)) index.set(axis.axisId, axis);
  }
  return index;
}

export function findDuplicateAxisIds(axes: CrossMatrixAxisSpec[]): string[] {
  const seen = new Set<string>();
  const duplicated: string[] = [];
  for (const axis of axes) {
    if (seen.has(axis.axisId)) {
      if (!duplicated.includes(axis.axisId)) duplicated.push(axis.axisId);
      continue;
    }
    seen.add(axis.axisId);
  }
  return duplicated;
}

export function findDuplicateItemIds(
  axes: CrossMatrixAxisSpec[]
): { itemId: string; axisIds: string[] }[] {
  const order: string[] = [];
  const occurrences = new Map<string, string[]>();
  for (const axis of axes) {
    for (const item of axis.items) {
      if (!occurrences.has(item.id)) {
        order.push(item.id);
        occurrences.set(item.id, []);
      }
      (occurrences.get(item.id) as string[]).push(axis.axisId);
    }
  }
  const result: { itemId: string; axisIds: string[] }[] = [];
  for (const itemId of order) {
    const axisIds = occurrences.get(itemId) as string[];
    if (axisIds.length < 2) continue;
    const uniqueAxisIds: string[] = [];
    for (const axisId of axisIds) {
      if (!uniqueAxisIds.includes(axisId)) uniqueAxisIds.push(axisId);
    }
    result.push({ itemId, axisIds: uniqueAxisIds });
  }
  return result;
}

/** itemId -> axisId。同一 itemId が複数回宣言された場合は最初の宣言を採用する。 */
export function buildItemAxisIndex(axes: CrossMatrixAxisSpec[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const axis of axes) {
    for (const item of axis.items) {
      if (!index.has(item.id)) index.set(item.id, axis.axisId);
    }
  }
  return index;
}

export function findUnknownLinkTargets(
  axes: CrossMatrixAxisSpec[]
): { axisId: string; itemId: string; unknownIds: string[] }[] {
  const itemAxis = buildItemAxisIndex(axes);
  const result: { axisId: string; itemId: string; unknownIds: string[] }[] = [];
  for (const axis of axes) {
    for (const item of axis.items) {
      const unknownIds: string[] = [];
      for (const linkId of linkTargetIds(item)) {
        if (itemAxis.has(linkId)) continue;
        if (unknownIds.includes(linkId)) continue;
        unknownIds.push(linkId);
      }
      if (unknownIds.length > 0) {
        result.push({ axisId: axis.axisId, itemId: item.id, unknownIds });
      }
    }
  }
  return result;
}

export function findSelfAxisLinks(
  axes: CrossMatrixAxisSpec[]
): { axisId: string; itemId: string; linkedIds: string[] }[] {
  const itemAxis = buildItemAxisIndex(axes);
  const result: { axisId: string; itemId: string; linkedIds: string[] }[] = [];
  for (const axis of axes) {
    for (const item of axis.items) {
      const linkedIds: string[] = [];
      for (const linkId of linkTargetIds(item)) {
        if (linkId === item.id) continue;
        if (itemAxis.get(linkId) !== axis.axisId) continue;
        if (linkedIds.includes(linkId)) continue;
        linkedIds.push(linkId);
      }
      if (linkedIds.length > 0) {
        result.push({ axisId: axis.axisId, itemId: item.id, linkedIds });
      }
    }
  }
  return result;
}

export function resolveAxisPairs(
  axes: CrossMatrixAxisSpec[],
  axisPairs?: CrossMatrixAxisPairSpec[]
): { axisA: string; axisB: string }[] {
  const uniqueAxisIds: string[] = [];
  for (const axis of axes) {
    if (!uniqueAxisIds.includes(axis.axisId)) uniqueAxisIds.push(axis.axisId);
  }

  const resolved: { axisA: string; axisB: string }[] = [];
  const seen = new Set<string>();
  const key = (a: string, b: string): string => (a < b ? `${a}::${b}` : `${b}::${a}`);

  if (!axisPairs || axisPairs.length === 0) {
    for (let i = 0; i < uniqueAxisIds.length; i++) {
      for (let j = i + 1; j < uniqueAxisIds.length; j++) {
        resolved.push({ axisA: uniqueAxisIds[i], axisB: uniqueAxisIds[j] });
      }
    }
    return resolved;
  }

  for (const pair of axisPairs) {
    if (pair.axisA === pair.axisB) continue;
    if (!uniqueAxisIds.includes(pair.axisA)) continue;
    if (!uniqueAxisIds.includes(pair.axisB)) continue;
    const k = key(pair.axisA, pair.axisB);
    if (seen.has(k)) continue;
    seen.add(k);
    resolved.push({ axisA: pair.axisA, axisB: pair.axisB });
  }
  return resolved;
}

function isExcluded(
  exclusions: CrossMatrixExclusion[] | undefined,
  axisId: string,
  itemId: string,
  pairedAxisId: string
): CrossMatrixExclusion | undefined {
  for (const e of exclusions ?? []) {
    if (e.axisId !== axisId) continue;
    if (e.itemId !== itemId) continue;
    if (e.pairedAxisId !== undefined && e.pairedAxisId !== pairedAxisId) continue;
    return e;
  }
  return undefined;
}

function emptyLine(
  axisId: string,
  item: CrossMatrixAxisItem,
  pairedAxisId: string,
  exclusion: CrossMatrixExclusion | undefined
): CrossMatrixEmptyLine {
  return {
    axisId,
    itemId: item.id,
    label: itemLabel(item),
    pairedAxisId,
    excluded: exclusion !== undefined,
    ...(exclusion !== undefined ? { exclusionReason: exclusion.reason ?? "" } : {}),
  };
}

export function buildCrossMatrixPair(
  axes: CrossMatrixAxisSpec[],
  axisA: string,
  axisB: string,
  exclusions?: CrossMatrixExclusion[],
  maxCellCount: number = DEFAULT_MAX_CELL_COUNT,
  documents?: TestBasisDocument[]
): CrossMatrixPairResult {
  const axisIndex = buildAxisIndex(axes);
  const specA = axisIndex.get(axisA);
  const specB = axisIndex.get(axisB);
  const rows = specA?.items ?? [];
  const columns = specB?.items ?? [];
  const rowCount = rows.length;
  const columnCount = columns.length;
  const totalCellCount = rowCount * columnCount;

  const base = {
    axisA,
    axisAName: specA?.axisName ?? axisA,
    axisB,
    axisBName: specB?.axisName ?? axisB,
    rowCount,
    columnCount,
    totalCellCount,
  };

  if (!Number.isSafeInteger(totalCellCount) || totalCellCount > maxCellCount) {
    return {
      ...base,
      generated: false,
      skipReason: `セル数 ${rowCount} × ${columnCount} が上限 ${maxCellCount} を超えたため、この軸ペアの直積表を生成しなかった。`,
      filledCellCount: 0,
      cellFillRatePercent: 0,
      evidenceEvaluated: false,
      groundedFilledCellCount: 0,
      groundedCellFillRatePercent: 0,
      targetRowCount: 0,
      coveredRowCount: 0,
      rowCoverageRatePercent: 0,
      targetColumnCount: 0,
      coveredColumnCount: 0,
      columnCoverageRatePercent: 0,
      cells: [],
      emptyRows: [],
      emptyColumns: [],
    };
  }

  const evidenceEvaluated = (documents?.length ?? 0) > 0;
  const normalizedCorpus = evidenceEvaluated
    ? buildGroundingCorpus(documents as TestBasisDocument[])
    : "";

  /** item -> (targetId -> 根拠が裏付けられたか) */
  const linkMap = (item: CrossMatrixAxisItem): Map<string, boolean> => {
    const map = new Map<string, boolean>();
    for (const link of normalizeAxisItemLinks(item)) {
      map.set(
        link.targetId,
        evidenceEvaluated ? isLinkEvidenceGrounded(link, normalizedCorpus) : false
      );
    }
    return map;
  };

  const columnLinkMaps = columns.map((col) => linkMap(col));
  const cells: CrossMatrixCell[] = [];
  const rowFilled = rows.map(() => false);
  const columnFilled = columns.map(() => false);
  let filledCellCount = 0;
  let groundedFilledCellCount = 0;

  rows.forEach((row, rowIdx) => {
    const rowLinks = linkMap(row);
    columns.forEach((col, colIdx) => {
      const aToB = rowLinks.has(col.id);
      const bToA = columnLinkMaps[colIdx].has(row.id);
      const direction: CrossMatrixCell["direction"] =
        aToB && bToA ? "both" : aToB ? "a-to-b" : bToA ? "b-to-a" : "none";
      const state: CrossMatrixCell["state"] = aToB || bToA ? "filled" : "empty";
      const grounded =
        state === "filled" &&
        evidenceEvaluated &&
        ((aToB && rowLinks.get(col.id) === true) ||
          (bToA && columnLinkMaps[colIdx].get(row.id) === true));
      if (state === "filled") {
        filledCellCount++;
        rowFilled[rowIdx] = true;
        columnFilled[colIdx] = true;
        if (grounded) groundedFilledCellCount++;
      }
      cells.push({ rowItemId: row.id, columnItemId: col.id, state, direction, grounded });
    });
  });

  const emptyRows: CrossMatrixEmptyLine[] = [];
  let excludedRowCount = 0;
  let coveredRowCount = 0;
  rows.forEach((row, rowIdx) => {
    const exclusion = isExcluded(exclusions, axisA, row.id, axisB);
    if (exclusion !== undefined) excludedRowCount++;
    if (rowFilled[rowIdx]) {
      if (exclusion === undefined) coveredRowCount++;
      return;
    }
    emptyRows.push(emptyLine(axisA, row, axisB, exclusion));
  });

  const emptyColumns: CrossMatrixEmptyLine[] = [];
  let excludedColumnCount = 0;
  let coveredColumnCount = 0;
  columns.forEach((col, colIdx) => {
    const exclusion = isExcluded(exclusions, axisB, col.id, axisA);
    if (exclusion !== undefined) excludedColumnCount++;
    if (columnFilled[colIdx]) {
      if (exclusion === undefined) coveredColumnCount++;
      return;
    }
    emptyColumns.push(emptyLine(axisB, col, axisA, exclusion));
  });

  const targetRowCount = rowCount - excludedRowCount;
  const targetColumnCount = columnCount - excludedColumnCount;

  return {
    ...base,
    generated: true,
    filledCellCount,
    cellFillRatePercent: rate(filledCellCount, totalCellCount),
    evidenceEvaluated,
    groundedFilledCellCount: evidenceEvaluated ? groundedFilledCellCount : 0,
    groundedCellFillRatePercent: evidenceEvaluated
      ? rate(groundedFilledCellCount, totalCellCount)
      : 0,
    targetRowCount,
    coveredRowCount,
    rowCoverageRatePercent: rate(coveredRowCount, targetRowCount),
    targetColumnCount,
    coveredColumnCount,
    columnCoverageRatePercent: rate(coveredColumnCount, targetColumnCount),
    cells,
    emptyRows,
    emptyColumns,
  };
}

export function findAsymmetricLinks(
  axes: CrossMatrixAxisSpec[]
): { fromAxisId: string; fromItemId: string; toAxisId: string; toItemId: string }[] {
  const itemAxis = buildItemAxisIndex(axes);
  const itemById = new Map<string, CrossMatrixAxisItem>();
  for (const axis of axes) {
    for (const item of axis.items) {
      if (!itemById.has(item.id)) itemById.set(item.id, item);
    }
  }

  const result: { fromAxisId: string; fromItemId: string; toAxisId: string; toItemId: string }[] = [];
  for (const axis of axes) {
    for (const item of axis.items) {
      for (const linkId of linkTargetIds(item)) {
        const targetAxisId = itemAxis.get(linkId);
        if (targetAxisId === undefined) continue;
        if (targetAxisId === axis.axisId) continue;
        const target = itemById.get(linkId) as CrossMatrixAxisItem;
        if (linkTargetIds(target).includes(item.id)) continue;
        result.push({
          fromAxisId: axis.axisId,
          fromItemId: item.id,
          toAxisId: targetAxisId,
          toItemId: linkId,
        });
      }
    }
  }
  return result;
}

export function findIsolatedItems(
  axes: CrossMatrixAxisSpec[]
): { axisId: string; itemId: string; label: string }[] {
  const itemAxis = buildItemAxisIndex(axes);
  const linkedFromOthers = new Set<string>();
  for (const axis of axes) {
    for (const item of axis.items) {
      for (const linkId of linkTargetIds(item)) {
        const targetAxisId = itemAxis.get(linkId);
        if (targetAxisId === undefined) continue;
        if (targetAxisId === axis.axisId) continue;
        linkedFromOthers.add(linkId);
      }
    }
  }

  const result: { axisId: string; itemId: string; label: string }[] = [];
  const emitted = new Set<string>();
  for (const axis of axes) {
    for (const item of axis.items) {
      if (emitted.has(item.id)) continue;
      const linksOut = linkTargetIds(item).some((linkId) => {
        const targetAxisId = itemAxis.get(linkId);
        return targetAxisId !== undefined && targetAxisId !== axis.axisId;
      });
      if (linksOut || linkedFromOthers.has(item.id)) continue;
      emitted.add(item.id);
      result.push({ axisId: axis.axisId, itemId: item.id, label: itemLabel(item) });
    }
  }
  return result;
}

export function findAxisPopulationShrinkage(
  axes: CrossMatrixAxisSpec[],
  expectedAxisPopulations?: CrossMatrixAxisPopulation[]
): { axisId: string; missingIds: string[]; extraIds: string[] }[] {
  if (!expectedAxisPopulations || expectedAxisPopulations.length === 0) return [];
  const axisIndex = buildAxisIndex(axes);
  const result: { axisId: string; missingIds: string[]; extraIds: string[] }[] = [];
  for (const expected of expectedAxisPopulations) {
    const axis = axisIndex.get(expected.axisId);
    if (axis === undefined) continue;
    const actualIds = axis.items.map((item) => item.id);
    const actualSet = new Set(actualIds);
    const expectedSet = new Set(expected.ids);
    const missingIds: string[] = [];
    for (const id of expected.ids) {
      if (actualSet.has(id)) continue;
      if (missingIds.includes(id)) continue;
      missingIds.push(id);
    }
    const extraIds: string[] = [];
    for (const id of actualIds) {
      if (expectedSet.has(id)) continue;
      if (extraIds.includes(id)) continue;
      extraIds.push(id);
    }
    if (missingIds.length === 0 && extraIds.length === 0) continue;
    result.push({ axisId: expected.axisId, missingIds, extraIds });
  }
  return result;
}

export function findUngroundedAxisItems(
  axes: CrossMatrixAxisSpec[],
  documents?: TestBasisDocument[],
  _options: TestBasisAnalysisOptions = {}
): { axisId: string; itemId: string; label: string }[] {
  if (!documents || documents.length === 0) return [];
  const corpus = buildGroundingCorpus(documents);
  const result: { axisId: string; itemId: string; label: string }[] = [];
  for (const axis of axes) {
    for (const item of axis.items) {
      const label = itemLabel(item);
      const normalizedId = normalizeForGrounding(item.id);
      const normalizedLabel = normalizeForGrounding(label);
      const grounded =
        (normalizedId.length > 0 && corpus.includes(normalizedId)) ||
        (normalizedLabel.length > 0 && corpus.includes(normalizedLabel));
      if (grounded) continue;
      result.push({ axisId: axis.axisId, itemId: item.id, label });
    }
  }
  return result;
}

export interface CrossMatrixLinkEvidenceIssue {
  axisId: string;
  itemId: string;
  targetAxisId: string;
  targetId: string;
  evidence?: string;
}

/**
 * 他軸要素へ解決できたリンク宣言について、根拠(evidence)の未記入と本文未裏付けを切り分ける。
 * documents が未指定または0件のときは何も報告しない（CMX-10 と同じゲート条件）。
 */
export function findLinkEvidenceIssues(
  axes: CrossMatrixAxisSpec[],
  documents?: TestBasisDocument[]
): { missing: CrossMatrixLinkEvidenceIssue[]; ungrounded: CrossMatrixLinkEvidenceIssue[] } {
  if (!documents || documents.length === 0) return { missing: [], ungrounded: [] };
  const itemAxis = buildItemAxisIndex(axes);
  const corpus = buildGroundingCorpus(documents);
  const missing: CrossMatrixLinkEvidenceIssue[] = [];
  const ungrounded: CrossMatrixLinkEvidenceIssue[] = [];

  for (const axis of axes) {
    for (const item of axis.items) {
      for (const link of normalizeAxisItemLinks(item)) {
        const targetAxisId = itemAxis.get(link.targetId);
        if (targetAxisId === undefined) continue; // CMX-01 の担当
        if (targetAxisId === axis.axisId) continue; // CMX-05 の担当
        const issue: CrossMatrixLinkEvidenceIssue = {
          axisId: axis.axisId,
          itemId: item.id,
          targetAxisId,
          targetId: link.targetId,
          ...(link.evidence !== undefined ? { evidence: link.evidence } : {}),
        };
        const normalized = normalizeForGrounding(link.evidence ?? "");
        if (normalized.length < MIN_LINK_EVIDENCE_LENGTH) {
          missing.push(issue);
          continue;
        }
        if (!corpus.includes(normalized)) ungrounded.push(issue);
      }
    }
  }
  return { missing, ungrounded };
}

/** 他軸要素へ解決できたリンク宣言の総数（item ごとに targetId 重複除去後）。 */
export function countResolvedCrossAxisLinks(axes: CrossMatrixAxisSpec[]): number {
  const itemAxis = buildItemAxisIndex(axes);
  let count = 0;
  for (const axis of axes) {
    for (const item of axis.items) {
      for (const targetId of linkTargetIds(item)) {
        const targetAxisId = itemAxis.get(targetId);
        if (targetAxisId === undefined) continue;
        if (targetAxisId === axis.axisId) continue;
        count++;
      }
    }
  }
  return count;
}

export function findUnmappedDefinedIds(
  axes: CrossMatrixAxisSpec[],
  documents?: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): { id: string; document: string; lineIndex: number; heading: string }[] {
  if (!documents || documents.length === 0) return [];
  const itemAxis = buildItemAxisIndex(axes);
  const seen = new Set<string>();
  const result: { id: string; document: string; lineIndex: number; heading: string }[] = [];
  for (const occ of extractIdOccurrences(documents, options)) {
    if (occ.role !== "definition") continue;
    if (seen.has(occ.id)) continue;
    seen.add(occ.id);
    if (itemAxis.has(occ.id)) continue;
    result.push({
      id: occ.id,
      document: occ.document,
      lineIndex: occ.lineIndex,
      heading: occ.heading,
    });
  }
  return result;
}

export function findDeclaredCoverageMismatches(
  pairs: CrossMatrixPairResult[],
  declaredCoverage?: CrossMatrixDeclaredCoverage[]
): { axisA: string; axisB: string; field: string; claimed: number | boolean; actual: number | boolean }[] {
  if (!declaredCoverage || declaredCoverage.length === 0) return [];
  const result: {
    axisA: string;
    axisB: string;
    field: string;
    claimed: number | boolean;
    actual: number | boolean;
  }[] = [];

  for (const declared of declaredCoverage) {
    let pair = pairs.find((p) => p.axisA === declared.axisA && p.axisB === declared.axisB);
    let swapped = false;
    if (pair === undefined) {
      pair = pairs.find((p) => p.axisA === declared.axisB && p.axisB === declared.axisA);
      swapped = pair !== undefined;
    }
    if (pair === undefined || !pair.generated) continue;

    const actualRowRate = swapped ? pair.columnCoverageRatePercent : pair.rowCoverageRatePercent;
    const actualColumnRate = swapped ? pair.rowCoverageRatePercent : pair.columnCoverageRatePercent;

    if (declared.claimedFillRatePercent !== undefined) {
      if (declared.claimedFillRatePercent !== pair.cellFillRatePercent) {
        result.push({
          axisA: declared.axisA,
          axisB: declared.axisB,
          field: "claimedFillRatePercent",
          claimed: declared.claimedFillRatePercent,
          actual: pair.cellFillRatePercent,
        });
      } else if (
        // 宣言充填率が links 由来の充填率と一致していても、根拠裏付け後の充填率と一致しないなら
        // その充填は宣言だけで成立している。従来の不一致とは二重報告しない。
        pair.evidenceEvaluated &&
        declared.claimedFillRatePercent !== pair.groundedCellFillRatePercent
      ) {
        result.push({
          axisA: declared.axisA,
          axisB: declared.axisB,
          field: "claimedFillRatePercentGrounded",
          claimed: declared.claimedFillRatePercent,
          actual: pair.groundedCellFillRatePercent,
        });
      }
    }
    if (
      declared.claimedRowCoveragePercent !== undefined &&
      declared.claimedRowCoveragePercent !== actualRowRate
    ) {
      result.push({
        axisA: declared.axisA,
        axisB: declared.axisB,
        field: "claimedRowCoveragePercent",
        claimed: declared.claimedRowCoveragePercent,
        actual: actualRowRate,
      });
    }
    if (
      declared.claimedColumnCoveragePercent !== undefined &&
      declared.claimedColumnCoveragePercent !== actualColumnRate
    ) {
      result.push({
        axisA: declared.axisA,
        axisB: declared.axisB,
        field: "claimedColumnCoveragePercent",
        claimed: declared.claimedColumnCoveragePercent,
        actual: actualColumnRate,
      });
    }
    if (declared.claimedNoEmptyCells === true) {
      const hasEmptyLine =
        pair.emptyRows.some((line) => !line.excluded) ||
        pair.emptyColumns.some((line) => !line.excluded);
      if (hasEmptyLine) {
        result.push({
          axisA: declared.axisA,
          axisB: declared.axisB,
          field: "claimedNoEmptyCells",
          claimed: true,
          actual: false,
        });
      }
    }
  }
  return result;
}

export function summarizeCrossMatrix(
  pairs: CrossMatrixPairResult[],
  isolatedItems: { axisId: string; itemId: string; label: string }[],
  findings: CrossMatrixFinding[],
  axes: CrossMatrixAxisSpec[],
  linkEvidence: {
    missing: CrossMatrixLinkEvidenceIssue[];
    ungrounded: CrossMatrixLinkEvidenceIssue[];
  } = { missing: [], ungrounded: [] }
): CrossMatrixSummary {
  let emptyRowTotal = 0;
  let emptyColumnTotal = 0;
  let excludedLineTotal = 0;
  let filledSum = 0;
  let totalSum = 0;
  let generatedPairCount = 0;
  let evidenceEvaluatedPairCount = 0;
  let groundedFilledSum = 0;
  let groundedTotalSum = 0;

  for (const pair of pairs) {
    for (const line of pair.emptyRows) {
      if (line.excluded) excludedLineTotal++;
      else emptyRowTotal++;
    }
    for (const line of pair.emptyColumns) {
      if (line.excluded) excludedLineTotal++;
      else emptyColumnTotal++;
    }
    if (!pair.generated) continue;
    generatedPairCount++;
    filledSum += pair.filledCellCount;
    totalSum += pair.totalCellCount;
    if (!pair.evidenceEvaluated) continue;
    evidenceEvaluatedPairCount++;
    groundedFilledSum += pair.groundedFilledCellCount;
    groundedTotalSum += pair.totalCellCount;
  }

  let totalItemCount = 0;
  for (const axis of axes) totalItemCount += axis.items.length;

  return {
    axisCount: axes.length,
    pairCount: pairs.length,
    generatedPairCount,
    totalItemCount,
    isolatedItemCount: isolatedItems.length,
    emptyRowTotal,
    emptyColumnTotal,
    excludedLineTotal,
    overallCellFillRatePercent: rate(filledSum, totalSum),
    evidenceEvaluatedPairCount,
    linkDeclarationTotal: countResolvedCrossAxisLinks(axes),
    linksWithoutEvidenceTotal: linkEvidence.missing.length,
    ungroundedLinkTotal: linkEvidence.ungrounded.length,
    overallGroundedCellFillRatePercent: rate(groundedFilledSum, groundedTotalSum),
    findingTotal: findings.length,
    highFindingTotal: findings.filter((f) => f.severity === "high").length,
  };
}

export function analyzeCrossMatrix(input: AuditCrossMatrixInput): CrossMatrixAuditResult {
  const axes = input.axes ?? [];
  const maxCellCount = input.maxCellCount ?? DEFAULT_MAX_CELL_COUNT;
  const axisIndex = buildAxisIndex(axes);

  const resolvedPairs = resolveAxisPairs(axes, input.axisPairs);
  const pairs = resolvedPairs.map((pair) =>
    buildCrossMatrixPair(
      axes,
      pair.axisA,
      pair.axisB,
      input.exclusions,
      maxCellCount,
      input.documents
    )
  );

  const isolatedItems = findIsolatedItems(axes);
  const findings: CrossMatrixFinding[] = [];

  // CMX-01 未宣言IDへの紐づけ
  for (const entry of findUnknownLinkTargets(axes)) {
    findings.push({
      categoryId: "CMX-01",
      severity: "high",
      target: `${entry.axisId} / ${entry.itemId}`,
      detail: `links がどの軸の要素IDにも一致しないIDを参照している: ${entry.unknownIds.join(", ")}。当該リンクは直積表に反映していない。`,
    });
  }
  for (const axis of axes) {
    for (const item of axis.items) {
      const blankCount = countBlankLinkTargets(item);
      if (blankCount === 0) continue;
      findings.push({
        categoryId: "CMX-01",
        severity: "high",
        target: `${axis.axisId} / ${item.id}`,
        detail: `links に targetId が空のリンク宣言が ${blankCount} 件ある。当該リンクは直積表に反映していない。`,
      });
    }
  }
  for (const exclusion of input.exclusions ?? []) {
    const axis = axisIndex.get(exclusion.axisId);
    if (axis === undefined) continue;
    if (axis.items.some((item) => item.id === exclusion.itemId)) continue;
    findings.push({
      categoryId: "CMX-01",
      severity: "high",
      target: `${exclusion.axisId} / ${exclusion.itemId}`,
      detail: "exclusions が当該軸に存在しない要素IDを参照している。当該除外宣言は無視した。",
    });
  }

  // CMX-02 軸ID・要素IDの重複
  for (const axisId of findDuplicateAxisIds(axes)) {
    findings.push({
      categoryId: "CMX-02",
      severity: "high",
      target: axisId,
      detail: "axes[].axisId が重複している。最初の宣言のみを採用した。",
    });
  }
  for (const dup of findDuplicateItemIds(axes)) {
    findings.push({
      categoryId: "CMX-02",
      severity: "high",
      target: dup.itemId,
      detail: `要素IDが重複している(宣言軸: ${dup.axisIds.join(", ")})。索引は最初の宣言を採用した。`,
    });
  }

  // CMX-03 / CMX-04 空行・空列
  for (const pair of pairs) {
    for (const line of pair.emptyRows) {
      if (line.excluded) continue;
      findings.push({
        categoryId: "CMX-03",
        severity: "high",
        target: `${pair.axisA} / ${line.itemId} × ${pair.axisB}`,
        detail: `${pair.axisBName} のどの要素とも紐づいていない空行である。`,
      });
    }
    for (const line of pair.emptyColumns) {
      if (line.excluded) continue;
      findings.push({
        categoryId: "CMX-04",
        severity: "high",
        target: `${pair.axisB} / ${line.itemId} × ${pair.axisA}`,
        detail: `${pair.axisAName} のどの要素とも紐づいていない空列である。`,
      });
    }
  }

  // CMX-05 自軸内要素への紐づけ
  for (const entry of findSelfAxisLinks(axes)) {
    findings.push({
      categoryId: "CMX-05",
      severity: "medium",
      target: `${entry.axisId} / ${entry.itemId}`,
      detail: `links が同じ軸の要素を指している: ${entry.linkedIds.join(", ")}。軸間の紐づけとしては使えない。`,
    });
  }

  // CMX-06 片方向のみの紐づけ
  for (const entry of findAsymmetricLinks(axes)) {
    findings.push({
      categoryId: "CMX-06",
      severity: "medium",
      target: `${entry.fromAxisId} / ${entry.fromItemId} → ${entry.toAxisId} / ${entry.toItemId}`,
      detail: "片方向のみの紐づけ宣言である。逆方向の links にも相手IDを宣言すること。",
    });
  }

  // CMX-07 除外理由の未記入
  for (const exclusion of input.exclusions ?? []) {
    if (exclusion.reason !== undefined && exclusion.reason.trim() !== "") continue;
    findings.push({
      categoryId: "CMX-07",
      severity: "high",
      target: `${exclusion.axisId} / ${exclusion.itemId}`,
      detail: "除外宣言に reason が未記入である。空行・空列を許容する根拠を明記すること。",
    });
  }

  // CMX-08 宣言された充填率と実測値の不一致
  for (const mismatch of findDeclaredCoverageMismatches(pairs, input.declaredCoverage)) {
    findings.push({
      categoryId: "CMX-08",
      severity: "high",
      target: `${mismatch.axisA} × ${mismatch.axisB} / ${mismatch.field}`,
      detail: `宣言値 ${String(mismatch.claimed)} に対し実測値は ${String(mismatch.actual)} である。`,
    });
  }

  // CMX-09 軸母集団の縮退
  for (const shrink of findAxisPopulationShrinkage(axes, input.expectedAxisPopulations)) {
    if (shrink.missingIds.length > 0) {
      findings.push({
        categoryId: "CMX-09",
        severity: "high",
        target: shrink.axisId,
        detail: `expectedAxisPopulations にあるが軸の items に存在しないID: ${shrink.missingIds.join(", ")}。充填率が母集団の縮小による見かけの値でないか確認すること。`,
      });
    }
    if (shrink.extraIds.length > 0) {
      findings.push({
        categoryId: "CMX-09",
        severity: "high",
        target: shrink.axisId,
        detail: `軸の items にあるが expectedAxisPopulations に存在しないID: ${shrink.extraIds.join(", ")}。母集団宣言と軸のどちらが正しいか確認すること。`,
      });
    }
  }

  // CMX-10 テストベース本文に裏付けの無い軸要素
  for (const item of findUngroundedAxisItems(axes, input.documents, {
    idPatterns: input.idPatterns,
    includeCoverageTargetIds: input.includeCoverageTargetIds,
  })) {
    findings.push({
      categoryId: "CMX-10",
      severity: "high",
      target: `${item.axisId} / ${item.itemId}`,
      detail: `要素ID も表示名「${item.label}」も、投入されたテストベース本文に出現しない。`,
    });
  }

  // CMX-11 テストベースに定義があるのに軸に載っていないID
  const exclusionItemIds = new Set((input.exclusions ?? []).map((e) => e.itemId));
  for (const entry of findUnmappedDefinedIds(axes, input.documents, {
    idPatterns: input.idPatterns,
    includeCoverageTargetIds: input.includeCoverageTargetIds,
  })) {
    if (exclusionItemIds.has(entry.id)) continue;
    findings.push({
      categoryId: "CMX-11",
      severity: "medium",
      target: entry.id,
      detail: `${entry.document}:${entry.lineIndex + 1}（${entry.heading}）に定義があるが、どの軸の items にも載っていない。`,
    });
  }

  // CMX-12 直積に寄与しない軸
  for (const axis of axes) {
    if (axis.items.length > 1) continue;
    findings.push({
      categoryId: "CMX-12",
      severity: "medium",
      target: axis.axisId,
      detail: `要素が ${axis.items.length} 件しかなく、他軸との直積が実質的に成立しない。充填率が自明に高くなる点に注意すること。`,
    });
  }

  // CMX-13 セル数が上限超過
  for (const pair of pairs) {
    if (pair.generated) continue;
    findings.push({
      categoryId: "CMX-13",
      severity: "info",
      target: `${pair.axisA} × ${pair.axisB}`,
      detail: pair.skipReason ?? "セル数が上限を超えたため直積表を生成しなかった。",
    });
  }

  // CMX-14 未宣言の軸IDの参照 / 同一軸ペアの指定
  const knownAxisIds = new Set(axes.map((axis) => axis.axisId));
  const pushAxisRefFinding = (source: string, axisId: string): void => {
    findings.push({
      categoryId: "CMX-14",
      severity: "medium",
      target: `${source} / ${axisId}`,
      detail: "axes に宣言されていない軸IDを参照している。当該指定はスキップした。",
    });
  };
  for (const pair of input.axisPairs ?? []) {
    if (pair.axisA === pair.axisB) {
      findings.push({
        categoryId: "CMX-14",
        severity: "medium",
        target: `axisPairs / ${pair.axisA}`,
        detail: "axisA と axisB が同一軸である。同一軸同士の直積は生成しない。",
      });
      continue;
    }
    if (!knownAxisIds.has(pair.axisA)) pushAxisRefFinding("axisPairs", pair.axisA);
    if (!knownAxisIds.has(pair.axisB)) pushAxisRefFinding("axisPairs", pair.axisB);
  }
  for (const declared of input.declaredCoverage ?? []) {
    if (declared.axisA === declared.axisB) {
      findings.push({
        categoryId: "CMX-14",
        severity: "medium",
        target: `declaredCoverage / ${declared.axisA}`,
        detail: "axisA と axisB が同一軸である。同一軸同士の直積は生成しない。",
      });
      continue;
    }
    if (!knownAxisIds.has(declared.axisA)) pushAxisRefFinding("declaredCoverage", declared.axisA);
    if (!knownAxisIds.has(declared.axisB)) pushAxisRefFinding("declaredCoverage", declared.axisB);
  }
  for (const exclusion of input.exclusions ?? []) {
    if (!knownAxisIds.has(exclusion.axisId)) pushAxisRefFinding("exclusions", exclusion.axisId);
    if (exclusion.pairedAxisId !== undefined && !knownAxisIds.has(exclusion.pairedAxisId)) {
      pushAxisRefFinding("exclusions", exclusion.pairedAxisId);
    }
  }
  for (const population of input.expectedAxisPopulations ?? []) {
    if (!knownAxisIds.has(population.axisId)) {
      pushAxisRefFinding("expectedAxisPopulations", population.axisId);
    }
  }

  // CMX-15 完全孤立要素
  for (const item of isolatedItems) {
    findings.push({
      categoryId: "CMX-15",
      severity: "high",
      target: `${item.axisId} / ${item.itemId}`,
      detail: `他のどの軸の要素とも1件も紐づいていない(全ペアで空行かつ空列)。表示名: ${item.label}`,
    });
  }

  // CMX-16 / CMX-17 リンク根拠の未記入・本文未裏付け
  const linkEvidence = findLinkEvidenceIssues(axes, input.documents);
  for (const issue of linkEvidence.missing) {
    findings.push({
      categoryId: "CMX-16",
      severity: "high",
      target: `${issue.axisId} / ${issue.itemId} → ${issue.targetAxisId} / ${issue.targetId}`,
      detail:
        "リンク宣言に根拠(evidence)が無い、または短すぎて本文と照合できない。当該セルは根拠裏付け充填率の分子に数えていない。",
    });
  }
  for (const issue of linkEvidence.ungrounded) {
    findings.push({
      categoryId: "CMX-17",
      severity: "high",
      target: `${issue.axisId} / ${issue.itemId} → ${issue.targetAxisId} / ${issue.targetId}`,
      detail: `リンクの根拠「${issue.evidence ?? ""}」が投入されたテストベース本文に存在しない。当該セルは根拠裏付け充填率の分子に数えていない。`,
    });
  }

  return {
    axes,
    pairs,
    isolatedItems,
    findings,
    summary: summarizeCrossMatrix(pairs, isolatedItems, findings, axes, linkEvidence),
  };
}
