import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  PairwiseFactorSpec,
  PairwiseFinding,
  PairwiseForbiddenCombination,
  PairwisePair,
  PairwiseResult,
  PairwiseRow,
  PairwiseSelector,
  PairwiseSpec,
  TestCaseCoverageTarget,
} from "../types.js";

// design_pairwise 固有の決定的エンジン。
// 純関数群で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。

export const DEFAULT_PAIRWISE_SET_ID = "MAIN";
export const DEFAULT_MAX_PAIR_COUNT = 5000;
export const DEFAULT_MAX_PAIRWISE_ENUMERATION_COMBINATIONS = 4096;
export const DEFAULT_MAX_PAIRWISE_SEARCH_NODES = 20000;

/** 決定的検査の Markdown 出力で、同一区分の指摘を丸める件数。findings 配列自体は全件保持する。 */
const FINDING_RENDER_LIMIT = 50;
/** 網羅対象一覧の表示上限。universe 自体は全件が対象。 */
const TARGET_RENDER_LIMIT = 200;
/** 行別の新規被覆ペアIDの表示上限。 */
const NEWLY_COVERED_RENDER_LIMIT = 20;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** 網羅対象ID・description の中で使うため export する（呼び出し側での文字列連結の再実装を防ぐ）。 */
export function pairwiseTargetId(setId: string, pairIndex: number): string {
  return `PW:${setId}:P${pairIndex}`;
}

function selectorValues(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * 禁則の一致判定。when が参照する因子のうち1つでも values に未割当のものがあれば false
 * （＝まだ違反していない）。完全に確定した割当のみが禁則違反になる。
 */
function selectorMatches(when: PairwiseSelector, values: Record<string, string>): boolean {
  for (const [factorId, raw] of Object.entries(when)) {
    const assigned = values[factorId];
    if (assigned === undefined) return false;
    if (!selectorValues(raw).includes(assigned)) return false;
  }
  return true;
}

/** when が partial と矛盾しない（＝将来この禁則に一致し得る）か。 */
function selectorCompatible(when: PairwiseSelector, partial: Record<string, string>): boolean {
  for (const [factorId, raw] of Object.entries(when)) {
    const assigned = partial[factorId];
    if (assigned === undefined) continue;
    if (!selectorValues(raw).includes(assigned)) return false;
  }
  return true;
}

function forbiddenLabel(fc: PairwiseForbiddenCombination, index: number): string {
  return fc.id ?? `forbiddenCombinations[${index}]`;
}

type CompletionResult =
  | { kind: "found"; values: Record<string, string> }
  | { kind: "none" }
  | { kind: "budget-exceeded" };

/**
 * 因子ごとの候補水準（allowedLevels）の範囲内で、どの禁則にも一致しない完全割当を1件探す。
 * 探索は因子の宣言順・水準の宣言順の DFS で、最初に見つかった1件を返すため決定的。
 * 訪問ノード数（水準の試行回数）が maxNodes を超えたら budget-exceeded を返す。
 */
function searchAssignment(
  factors: PairwiseFactorSpec[],
  allowedLevels: Record<string, string[]>,
  forbidden: PairwiseForbiddenCombination[],
  maxNodes: number
): CompletionResult {
  const current: Record<string, string> = {};
  let nodes = 0;
  let exceeded = false;

  const violates = (): boolean => forbidden.some((fc) => selectorMatches(fc.when, current));

  const dfs = (idx: number): Record<string, string> | undefined => {
    if (idx === factors.length) return { ...current };
    const factor = factors[idx];
    const candidates = allowedLevels[factor.id] ?? factor.levels;
    for (const level of candidates) {
      nodes += 1;
      if (nodes > maxNodes) {
        exceeded = true;
        return undefined;
      }
      current[factor.id] = level;
      if (!violates()) {
        const found = dfs(idx + 1);
        if (found) {
          delete current[factor.id];
          return found;
        }
      }
      delete current[factor.id];
      if (exceeded) return undefined;
    }
    return undefined;
  };

  const found = dfs(0);
  if (found) return { kind: "found", values: found };
  if (exceeded) return { kind: "budget-exceeded" };
  return { kind: "none" };
}

/** 部分割当 assigned を固定したまま、禁則に一致しない完全割当を1件探す。 */
function findValidCompletion(
  assigned: Record<string, string>,
  factors: PairwiseFactorSpec[],
  forbidden: PairwiseForbiddenCombination[],
  maxNodes: number
): CompletionResult {
  const allowed: Record<string, string[]> = {};
  for (const f of factors) {
    const pinned = assigned[f.id];
    allowed[f.id] = pinned === undefined ? f.levels : [pinned];
  }
  return searchAssignment(factors, allowed, forbidden, maxNodes);
}

function pairMapKey(i: number, levelA: string, j: number, levelB: string): string {
  return JSON.stringify([i, levelA, j, levelB]);
}

function describeSelector(when: PairwiseSelector, factors: PairwiseFactorSpec[]): string {
  return Object.entries(when)
    .map(([factorId, raw]) => {
      const factor = factors.find((f) => f.id === factorId);
      const name = factor ? factor.name : factorId;
      return `${name}=${selectorValues(raw).join("|")}`;
    })
    .join(", ");
}

// --- メインエンジン ---

export function computePairwiseRows(spec: PairwiseSpec): PairwiseResult {
  const setId = spec.setId ?? DEFAULT_PAIRWISE_SET_ID;
  const factors = spec.factors;
  const forbidden = spec.forbiddenCombinations ?? [];
  const seedRows = spec.seedRows ?? [];
  const maxPairCount = spec.maxPairCount ?? DEFAULT_MAX_PAIR_COUNT;
  const maxEnumerationCombinations =
    spec.maxEnumerationCombinations ?? DEFAULT_MAX_PAIRWISE_ENUMERATION_COMBINATIONS;
  const maxSearchNodes = spec.maxSearchNodes ?? DEFAULT_MAX_PAIRWISE_SEARCH_NODES;

  const findings: PairwiseFinding[] = [];

  // --- 1. 入力検査 ---
  const factorIds = new Set<string>();
  const factorById = new Map<string, PairwiseFactorSpec>();
  for (const f of factors) {
    if (factorIds.has(f.id)) {
      findings.push({
        categoryId: "PWC-03",
        severity: "high",
        target: f.id,
        detail: `因子ID「${f.id}」が重複して宣言されている。`,
      });
    } else {
      factorIds.add(f.id);
      factorById.set(f.id, f);
    }
    const levelSeen = new Set<string>();
    for (const lv of f.levels) {
      if (levelSeen.has(lv)) {
        findings.push({
          categoryId: "PWC-03",
          severity: "high",
          target: f.id,
          detail: `因子「${f.id}」の水準「${lv}」が重複して宣言されている。`,
        });
      }
      levelSeen.add(lv);
    }
    if (f.levels.length <= 1) {
      findings.push({
        categoryId: "PWC-04",
        severity: "medium",
        target: f.id,
        detail: `因子「${f.id}」の取り得る水準が${f.levels.length}件しかなく、ペアの組合せに寄与しない。`,
      });
    }
  }

  if (factors.length < 2) {
    findings.push({
      categoryId: "PWC-05",
      severity: "high",
      target: setId,
      detail: `因子が${factors.length}件しかなく、水準ペアを構成できない。`,
    });
  }

  const checkSelector = (label: string, when: PairwiseSelector): boolean => {
    let ok = true;
    for (const [factorId, raw] of Object.entries(when)) {
      if (!factorIds.has(factorId)) {
        findings.push({
          categoryId: "PWC-01",
          severity: "high",
          target: label,
          detail: `「${label}」が未宣言の因子ID「${factorId}」を参照している。`,
        });
        ok = false;
        continue;
      }
      const factor = factorById.get(factorId) as PairwiseFactorSpec;
      for (const v of selectorValues(raw)) {
        if (!factor.levels.includes(v)) {
          findings.push({
            categoryId: "PWC-02",
            severity: "high",
            target: label,
            detail: `「${label}」が因子「${factorId}」に存在しない水準「${v}」を参照している。`,
          });
          ok = false;
        }
      }
    }
    return ok;
  };

  forbidden.forEach((fc, i) => checkSelector(forbiddenLabel(fc, i), fc.when));

  seedRows.forEach((seed, i) => {
    const label = seed.id ?? `seedRows[${i}]`;
    const refsOk = checkSelector(label, seed.values);
    const missing = factors.filter((f) => seed.values[f.id] === undefined).map((f) => f.id);
    if (missing.length > 0) {
      findings.push({
        categoryId: "PWC-09",
        severity: "high",
        target: label,
        detail: `seed行「${label}」が因子(${missing.join(", ")})の水準を指定しておらず、組合せが一意に定まらない。`,
      });
      return;
    }
    if (!refsOk) return;
    forbidden.forEach((fc, fi) => {
      if (selectorMatches(fc.when, seed.values)) {
        findings.push({
          categoryId: "PWC-09",
          severity: "high",
          target: label,
          detail: `seed行「${label}」が禁則「${forbiddenLabel(fc, fi)}」(${fc.reason})に違反している。`,
        });
      }
    });
  });

  // --- 共通のカウント（generated=false でも算出する） ---
  let totalPairCount = 0;
  for (let i = 0; i < factors.length; i++) {
    for (let j = i + 1; j < factors.length; j++) {
      totalPairCount += factors[i].levels.length * factors[j].levels.length;
    }
  }
  const levelCountsDesc = factors.map((f) => f.levels.length).sort((a, b) => b - a);
  const theoreticalMinimumRowCount =
    factors.length < 2 ? 0 : levelCountsDesc[0] * levelCountsDesc[1];

  const skipResult = (skipReason: string): PairwiseResult => ({
    setId,
    generated: false,
    skipReason,
    factorCount: factors.length,
    totalPairCount,
    unreachablePairCount: 0,
    undeterminedPairCount: 0,
    targetPairCount: 0,
    coveredPairCount: 0,
    pairCoverageRatioPercent: 0,
    rows: [],
    pairs: [],
    reductionBasis: "unavailable",
    reductionRatioPercent: 0,
    theoreticalMinimumRowCount,
    findings,
  });

  // --- 2. 致命的な指摘があれば生成しない ---
  const blocking = findings.filter((f) => f.severity === "high");
  if (blocking.length > 0) {
    const categories = [...new Set(blocking.map((f) => f.categoryId))].join(", ");
    return skipResult(`入力の構造に致命的な指摘(${categories})があるため組合せ生成を行わなかった`);
  }

  // --- 3. ペア数上限 ---
  if (totalPairCount > maxPairCount) {
    findings.push({
      categoryId: "PWC-10",
      severity: "info",
      target: setId,
      detail: `全ペア数 ${totalPairCount} 件が上限 ${maxPairCount} 件を超えるため組合せ生成を行わなかった。`,
    });
    return skipResult(`全ペア数 ${totalPairCount} 件が上限 ${maxPairCount} 件を超えるため組合せ生成を行わなかった`);
  }

  // --- 4. ペア一覧の構築と到達可否判定 ---
  // 正準順: 因子添字 i<j の二重ループ、内側は水準の宣言順。禁則の有無で採番はずれない。
  const pairs: PairwisePair[] = [];
  const pairIndexByKey = new Map<string, number>();
  for (let i = 0; i < factors.length; i++) {
    for (let j = i + 1; j < factors.length; j++) {
      for (const levelA of factors[i].levels) {
        for (const levelB of factors[j].levels) {
          const index = pairs.length + 1;
          pairs.push({
            index,
            factorIdA: factors[i].id,
            levelA,
            factorIdB: factors[j].id,
            levelB,
            status: "reachable",
            coveredByRowNos: [],
          });
          pairIndexByKey.set(pairMapKey(i, levelA, j, levelB), index);
        }
      }
    }
  }

  let unreachablePairCount = 0;
  let undeterminedPairCount = 0;
  for (const pair of pairs) {
    const assigned: Record<string, string> = {
      [pair.factorIdA]: pair.levelA,
      [pair.factorIdB]: pair.levelB,
    };
    const completion = findValidCompletion(assigned, factors, forbidden, maxSearchNodes);
    if (completion.kind === "found") continue;
    if (completion.kind === "budget-exceeded") {
      pair.status = "undetermined";
      undeterminedPairCount += 1;
      continue;
    }
    pair.status = "unreachable";
    unreachablePairCount += 1;
    const related = forbidden
      .map((fc, fi) => ({ fc, fi }))
      .filter(
        ({ fc }) =>
          selectorCompatible(fc.when, assigned) &&
          (fc.when[pair.factorIdA] !== undefined || fc.when[pair.factorIdB] !== undefined)
      );
    const base = "禁則により、この水準ペアを含む有効な組合せが存在しない";
    pair.unreachableReason =
      related.length > 0
        ? `${base}（該当禁則: ${related
            .map(({ fc, fi }) => `${forbiddenLabel(fc, fi)}: ${fc.reason}`)
            .join(" / ")}）`
        : base;
    const factorNameA = factorById.get(pair.factorIdA)?.name ?? pair.factorIdA;
    const factorNameB = factorById.get(pair.factorIdB)?.name ?? pair.factorIdB;
    findings.push({
      categoryId: "PWC-06",
      severity: "medium",
      target: pairwiseTargetId(setId, pair.index),
      detail: `ペア「${factorNameA}=${pair.levelA} × ${factorNameB}=${pair.levelB}」は${pair.unreachableReason}。`,
    });
  }

  if (undeterminedPairCount > 0) {
    findings.push({
      categoryId: "PWC-11",
      severity: "info",
      target: setId,
      detail: `到達可否の探索が上限 ${maxSearchNodes} ノードを超えたため、${undeterminedPairCount} 件のペアを判定保留とした。これらは被覆率の分母に含めない。`,
    });
  }

  const reachablePairs = pairs.filter((p) => p.status === "reachable");
  if (reachablePairs.length === 0 && totalPairCount > 0) {
    findings.push({
      categoryId: "PWC-07",
      severity: "high",
      target: setId,
      detail: "禁則により有効な組合せが1件も存在せず、被覆できるペアが残らない。",
    });
  }

  // --- 5. 冗長・到達不能な禁則の検出 ---
  forbidden.forEach((fc, fi) => {
    const allowed: Record<string, string[]> = {};
    for (const f of factors) {
      const raw = fc.when[f.id];
      allowed[f.id] = raw === undefined ? f.levels : f.levels.filter((lv) => selectorValues(raw).includes(lv));
    }
    const others = forbidden.filter((_, oi) => oi !== fi);
    const result = searchAssignment(factors, allowed, others, maxSearchNodes);
    if (result.kind !== "none") return; // budget 超過時は判定を出さない
    findings.push({
      categoryId: "PWC-08",
      severity: "medium",
      target: forbiddenLabel(fc, fi),
      detail: `禁則「${forbiddenLabel(fc, fi)}」に一致する組合せが他の禁則で既に全て除外されており、冗長または到達不能である。`,
    });
  });

  // --- 6. 行生成（決定的な貪欲法） ---
  const rows: PairwiseRow[] = [];

  const pairIndexesOfRow = (values: Record<string, string>): number[] => {
    const indexes: number[] = [];
    for (let i = 0; i < factors.length; i++) {
      for (let j = i + 1; j < factors.length; j++) {
        const index = pairIndexByKey.get(pairMapKey(i, values[factors[i].id], j, values[factors[j].id]));
        if (index !== undefined) indexes.push(index);
      }
    }
    return indexes.sort((a, b) => a - b);
  };

  const addRow = (source: "seed" | "generated", values: Record<string, string>): void => {
    const no = rows.length + 1;
    const covered = pairIndexesOfRow(values);
    const newlyCovered: number[] = [];
    for (const index of covered) {
      const pair = pairs[index - 1];
      if (pair.coveredByRowNos.length === 0) newlyCovered.push(index);
      pair.coveredByRowNos.push(no);
    }
    rows.push({ no, source, values, newlyCoveredPairIndexes: newlyCovered });
  };

  for (const seed of seedRows) {
    const values: Record<string, string> = {};
    for (const f of factors) values[f.id] = seed.values[f.id];
    addRow("seed", values);
  }

  const newlyCoverableCount = (
    assignedFactorIndexes: number[],
    factorIndex: number,
    level: string,
    values: Record<string, string>
  ): number => {
    let count = 0;
    for (const other of assignedFactorIndexes) {
      const [i, li, j, lj] =
        other < factorIndex
          ? [other, values[factors[other].id], factorIndex, level]
          : [factorIndex, level, other, values[factors[other].id]];
      const index = pairIndexByKey.get(pairMapKey(i as number, li as string, j as number, lj as string));
      if (index === undefined) continue;
      if (pairs[index - 1].coveredByRowNos.length === 0) count += 1;
    }
    return count;
  };

  // 各反復で必ず種ペアが被覆されるため停止する。
  for (;;) {
    const seedPair = pairs.find((p) => p.status === "reachable" && p.coveredByRowNos.length === 0);
    if (!seedPair) break;

    const values: Record<string, string> = {
      [seedPair.factorIdA]: seedPair.levelA,
      [seedPair.factorIdB]: seedPair.levelB,
    };
    const assignedFactorIndexes: number[] = [];
    factors.forEach((f, idx) => {
      if (values[f.id] !== undefined) assignedFactorIndexes.push(idx);
    });

    for (let idx = 0; idx < factors.length; idx++) {
      const factor = factors[idx];
      if (values[factor.id] !== undefined) continue;

      let bestLevel: string | undefined;
      let bestScore = -1;
      for (const level of factor.levels) {
        const candidate = { ...values, [factor.id]: level };
        if (forbidden.some((fc) => selectorMatches(fc.when, candidate))) continue;
        const completion = findValidCompletion(candidate, factors, forbidden, maxSearchNodes);
        if (completion.kind !== "found") continue; // budget 超過分は保守的に不採用
        const score = newlyCoverableCount(assignedFactorIndexes, idx, level, values);
        if (score > bestScore) {
          bestScore = score;
          bestLevel = level;
        }
      }

      if (bestLevel === undefined) {
        // 防御的フォールバック: 種ペアは reachable なので通常ここには来ない。
        const completion = findValidCompletion(values, factors, forbidden, maxSearchNodes);
        if (completion.kind === "found") {
          for (const f of factors) values[f.id] = completion.values[f.id];
        } else {
          for (const f of factors) {
            if (values[f.id] === undefined) values[f.id] = f.levels[0];
          }
        }
        break;
      }

      values[factor.id] = bestLevel;
      assignedFactorIndexes.push(idx);
    }

    addRow("generated", values);
  }

  // --- 7. カウント ---
  const coveredPairCount = pairs.filter(
    (p) => p.status === "reachable" && p.coveredByRowNos.length > 0
  ).length;
  const targetPairCount = totalPairCount - unreachablePairCount - undeterminedPairCount;
  const pairCoverageRatioPercent =
    targetPairCount === 0 ? 0 : Math.round((coveredPairCount / targetPairCount) * 1000) / 10;

  // 生成結果とカウントの自己整合チェック（通常は発生しない安全網）。
  if (targetPairCount > 0 && pairCoverageRatioPercent < 100) {
    findings.push({
      categoryId: "PWC-12",
      severity: "high",
      target: setId,
      detail: `生成後のペア被覆率が ${pairCoverageRatioPercent.toFixed(1)}% であり、到達可能なペアを全て被覆できていない。`,
    });
  }

  const rawFullCombinationCount = factors.reduce((n, f) => n * f.levels.length, 1);
  const fullCombinationCount = Number.isSafeInteger(rawFullCombinationCount)
    ? rawFullCombinationCount
    : undefined;

  let validCombinationCount: number | undefined;
  let reductionBasis: PairwiseResult["reductionBasis"] = "unavailable";
  let denominator = 0;
  if (fullCombinationCount === undefined) {
    reductionBasis = "unavailable";
  } else if (fullCombinationCount <= maxEnumerationCombinations) {
    let count = 0;
    const values: Record<string, string> = {};
    const enumerate = (idx: number): void => {
      if (idx === factors.length) {
        if (!forbidden.some((fc) => selectorMatches(fc.when, values))) count += 1;
        return;
      }
      for (const lv of factors[idx].levels) {
        values[factors[idx].id] = lv;
        enumerate(idx + 1);
      }
      delete values[factors[idx].id];
    };
    enumerate(0);
    validCombinationCount = count;
    reductionBasis = "valid-enumerated";
    denominator = count;
  } else {
    reductionBasis = "full-product";
    denominator = fullCombinationCount;
  }

  const reductionRatioPercent =
    reductionBasis === "unavailable" || denominator === 0
      ? 0
      : Math.round((1 - rows.length / denominator) * 1000) / 10;

  return {
    setId,
    generated: true,
    factorCount: factors.length,
    totalPairCount,
    unreachablePairCount,
    undeterminedPairCount,
    targetPairCount,
    coveredPairCount,
    pairCoverageRatioPercent,
    rows,
    pairs,
    fullCombinationCount,
    validCombinationCount,
    reductionBasis,
    reductionRatioPercent,
    theoreticalMinimumRowCount,
    findings,
  };
}

export function buildPairwiseCoverageTargets(spec: PairwiseSpec): TestCaseCoverageTarget[] {
  const setId = spec.setId ?? DEFAULT_PAIRWISE_SET_ID;
  const result = computePairwiseRows(spec);
  if (!result.generated) return [];

  const nameOf = (factorId: string): string =>
    spec.factors.find((f) => f.id === factorId)?.name ?? factorId;

  // 到達不能・判定保留のペアは universe に入れない（被覆できない対象を分母へ混ぜない）。
  return result.pairs
    .filter((p) => p.status === "reachable")
    .map((pair) => ({
      id: pairwiseTargetId(setId, pair.index),
      techniqueId: "pairwise" as const,
      description: `${nameOf(pair.factorIdA)}=${pair.levelA} × ${nameOf(pair.factorIdB)}=${pair.levelB}`,
      origin: setId,
    }));
}

export function renderPairwise(spec: PairwiseSpec): string {
  const setId = spec.setId ?? DEFAULT_PAIRWISE_SET_ID;
  const result = computePairwiseRows(spec);
  const factors = spec.factors;
  const forbidden = spec.forbiddenCombinations ?? [];
  const nameOf = (factorId: string): string =>
    factors.find((f) => f.id === factorId)?.name ?? factorId;

  const lines: string[] = [];
  lines.push("# ペアワイズ設計結果");
  lines.push("");
  if (spec.title) {
    lines.push(`- 対象: ${spec.title}`);
    lines.push("");
  }

  const skipLine = (): void => {
    lines.push(`- 未算出(理由: ${escapeCell(result.skipReason ?? "")})`);
    lines.push("");
  };

  lines.push("## 1. 因子・水準");
  lines.push("");
  lines.push("| 因子ID | 因子名 | 水準数 | 水準 |");
  lines.push("| --- | --- | --- | --- |");
  for (const f of factors) {
    lines.push(
      `| ${escapeCell(f.id)} | ${escapeCell(f.name)} | ${f.levels.length} | ${escapeCell(f.levels.join(", "))} |`
    );
  }
  lines.push("");

  lines.push("## 2. 禁則");
  lines.push("");
  if (forbidden.length === 0) {
    lines.push("- 宣言なし");
    lines.push("");
  } else {
    lines.push("| ID | 条件 | 理由 |");
    lines.push("| --- | --- | --- |");
    forbidden.forEach((fc, i) => {
      lines.push(
        `| ${escapeCell(forbiddenLabel(fc, i))} | ${escapeCell(describeSelector(fc.when, factors))} | ${escapeCell(
          fc.reason
        )} |`
      );
    });
    lines.push("");
  }

  lines.push("## 3. ペアの到達可否");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    lines.push(`- 全ペア数: ${result.totalPairCount}`);
    lines.push(`- 到達不能: ${result.unreachablePairCount}`);
    lines.push(`- 判定保留: ${result.undeterminedPairCount}`);
    lines.push(`- 対象ペア数: ${result.targetPairCount}`);
    lines.push("");
    const notReachable = result.pairs.filter((p) => p.status !== "reachable");
    if (notReachable.length > 0) {
      lines.push("| 網羅対象ID | ペア | 判定 | 理由 |");
      lines.push("| --- | --- | --- | --- |");
      for (const pair of notReachable.slice(0, FINDING_RENDER_LIMIT)) {
        const verdict = pair.status === "unreachable" ? "到達不能" : "判定保留";
        lines.push(
          `| ${escapeCell(pairwiseTargetId(setId, pair.index))} | ${escapeCell(
            `${nameOf(pair.factorIdA)}=${pair.levelA} × ${nameOf(pair.factorIdB)}=${pair.levelB}`
          )} | ${verdict} | ${escapeCell(pair.unreachableReason ?? "探索上限に達したため判定できなかった")} |`
        );
      }
      if (notReachable.length > FINDING_RENDER_LIMIT) {
        lines.push("");
        lines.push(`- 他 ${notReachable.length - FINDING_RENDER_LIMIT} 件`);
      }
      lines.push("");
    }
  }

  lines.push("## 4. 生成した組合せ表");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const header = ["No", "由来", ...factors.map((f) => f.name)];
    lines.push(`| ${header.map(escapeCell).join(" | ")} |`);
    lines.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (const row of result.rows) {
      const cells = [
        String(row.no),
        row.source === "seed" ? "seed" : "生成",
        ...factors.map((f) => row.values[f.id]),
      ];
      lines.push(`| ${cells.map((v) => escapeCell(String(v))).join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push("## 5. 行別の新規被覆ペア");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    lines.push("| No | 新規被覆ペアID | 件数 |");
    lines.push("| --- | --- | --- |");
    for (const row of result.rows) {
      const ids = row.newlyCoveredPairIndexes.map((i) => pairwiseTargetId(setId, i));
      const shown = ids.slice(0, NEWLY_COVERED_RENDER_LIMIT).join(", ");
      const suffix =
        ids.length > NEWLY_COVERED_RENDER_LIMIT ? ` 他 ${ids.length - NEWLY_COVERED_RENDER_LIMIT} 件` : "";
      lines.push(`| ${row.no} | ${escapeCell(shown === "" ? "-" : shown + suffix)} | ${ids.length} |`);
    }
    lines.push("");
  }

  lines.push("## 6. 決定的検査");
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("- 指摘なし");
  } else {
    const sorted = [...result.findings].sort((a, b) => a.categoryId.localeCompare(b.categoryId));
    const pwc06Total = sorted.filter((f) => f.categoryId === "PWC-06").length;
    let pwc06Seen = 0;
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      if (f.categoryId === "PWC-06") {
        pwc06Seen += 1;
        if (pwc06Seen > FINDING_RENDER_LIMIT) continue;
      }
      lines.push(`- [${f.severity}] ${f.categoryId} ${escapeCell(f.target)}: ${escapeCell(f.detail)}`);
      const isLast =
        f.categoryId === "PWC-06" && (i + 1 >= sorted.length || sorted[i + 1].categoryId !== "PWC-06");
      if (isLast && pwc06Total > FINDING_RENDER_LIMIT) {
        lines.push(`- 他 ${pwc06Total - FINDING_RENDER_LIMIT} 件（表示を ${FINDING_RENDER_LIMIT} 件に丸めた）`);
      }
    }
  }
  lines.push("");

  lines.push("## 7. 網羅対象一覧(generate_test_cases 引き渡し)");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const targets = buildPairwiseCoverageTargets(spec);
    lines.push("| 網羅対象ID | 内容 |");
    lines.push("| --- | --- |");
    for (const t of targets.slice(0, TARGET_RENDER_LIMIT)) {
      lines.push(`| ${escapeCell(t.id)} | ${escapeCell(t.description)} |`);
    }
    lines.push("");
    if (targets.length > TARGET_RENDER_LIMIT) {
      lines.push(`- 他 ${targets.length - TARGET_RENDER_LIMIT} 件`);
    }
    lines.push(
      `- 表は表示上の抜粋であり、generate_test_cases の pairwise へ渡した場合は ${targets.length} 件全てが universe の対象になる。`
    );
    lines.push("");
  }

  lines.push("## 8. サマリ");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const reductionText =
      result.reductionBasis === "unavailable"
        ? "削減率: 未算出(理由: 全組合せ数が安全整数を超える)"
        : result.reductionBasis === "valid-enumerated"
          ? `削減率: ${result.reductionRatioPercent.toFixed(1)}%（分母: 禁則適用後の有効組合せ数 ${result.validCombinationCount}）`
          : `削減率: ${result.reductionRatioPercent.toFixed(1)}%（分母: 禁則適用前の全組合せ数 ${result.fullCombinationCount}、禁則適用後の有効組合せ数は未列挙）`;
    lines.push(
      `- 因子数: ${result.factorCount} / 全ペア数: ${result.totalPairCount} / 到達不能: ${result.unreachablePairCount} / 判定保留: ${result.undeterminedPairCount} / 対象ペア数: ${result.targetPairCount} / 被覆ペア数: ${result.coveredPairCount} / ペア被覆率: ${result.pairCoverageRatioPercent.toFixed(
        1
      )}% / 生成行数(seed含む): ${result.rows.length} / 全網羅組合せ数: ${
        result.fullCombinationCount ?? "未算出"
      } / 有効組合せ数: ${result.validCombinationCount ?? "未列挙"} / ${reductionText} / 理論下限行数: ${result.theoreticalMinimumRowCount}`
    );
  }

  lines.push(
    ...renderNextToolsSection(
      "design_pairwise",
      [],
      spec.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

const pairwiseSelectorSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

export const designPairwiseInputShape = {
  ...completedToolsInputShape,
  setId: z.string().optional().describe("Set id used to build coverage target ids (default MAIN)"),
  title: z.string().optional(),
  factors: z
    .array(
      z.object({
        id: z.string().describe("Factor id, unique within the set, e.g. F1"),
        name: z.string().describe("Factor name"),
        levels: z.array(z.string()).min(1).describe("Levels of this factor; 2 or more expected"),
      })
    )
    .min(2)
    .describe("Factors to combine; at least 2 are required to form pairs"),
  forbiddenCombinations: z
    .array(
      z.object({
        id: z.string().optional(),
        when: pairwiseSelectorSchema,
        reason: z.string().describe("Why this combination is impossible (required)"),
      })
    )
    .optional()
    .describe("Combinations that can never occur; pairs only reachable through them become unreachable"),
  seedRows: z
    .array(
      z.object({
        id: z.string().optional(),
        values: z.record(z.string(), z.string()).describe("Level for every declared factor id"),
        note: z.string().optional(),
      })
    )
    .optional()
    .describe("Known important combinations that must be included; placed first as seed rows"),
  maxPairCount: z.number().int().positive().optional().describe("Pair count cap (default 5000)"),
  maxEnumerationCombinations: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Cap for exact enumeration of valid combinations (default 4096)"),
  maxSearchNodes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Node budget per reachability search (default 20000)"),
} as const;

const designPairwiseInputSchema = z.object(designPairwiseInputShape);
export type DesignPairwiseInput = z.infer<typeof designPairwiseInputSchema>;

export function registerDesignPairwiseTool(server: McpServer): void {
  server.registerTool(
    "design_pairwise",
    {
      title: "Design Pairwise",
      description:
        "因子と水準・禁則(ありえない組合せ)から、全ての水準ペアを被覆する組合せを決定的な貪欲法で生成し、" +
        "全ペア数・禁則により到達不能なペア・ペア被覆率・全網羅組合せ数に対する削減率をMarkdownで返す。" +
        "各ペアは PW: プレフィックスの網羅対象IDとして generate_test_cases の pairwise へそのまま渡せる。" +
        "因子・水準は testcondition://factor/ralph-frame の因子表(FHO-04)からそのまま投入できる。",
      inputSchema: designPairwiseInputShape,
    },
    async (input) => {
      const text = renderPairwise(input as PairwiseSpec);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
