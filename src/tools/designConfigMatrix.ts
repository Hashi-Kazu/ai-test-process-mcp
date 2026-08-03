import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ConfigMatrixExcludedCombination,
  ConfigMatrixFactorSpec,
  ConfigMatrixFinding,
  ConfigMatrixLevelStatus,
  ConfigMatrixPairStatus,
  ConfigMatrixResult,
  ConfigMatrixRow,
  ConfigMatrixSelector,
  ConfigMatrixSpec,
  TestCaseCoverageTarget,
} from "../types.js";

// design_config_matrix 固有の決定的エンジン。
// 純関数群で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。
// design*.ts 各ファイルは自己完結という規約のため、designPairwise.ts の内部関数は import せず、
// 同型のロジックをこのファイル内に再実装する。

export const DEFAULT_CONFIG_MATRIX_ID = "MAIN";
export const DEFAULT_MAX_COMBINATION_COUNT = 5000;
export const DEFAULT_CONFIG_MATRIX_SEARCH_NODES = 5000;

/** 決定的検査の Markdown 出力で、同一区分の指摘を丸める件数。findings 配列自体は全件保持する。 */
const FINDING_RENDER_LIMIT = 50;
/** 網羅対象一覧の表示上限。universe 自体は全件が対象。 */
const TARGET_RENDER_LIMIT = 200;
/** 到達不能な水準・ペアの表示上限。 */
const UNREACHABLE_RENDER_LIMIT = 50;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

export function configMatrixTargetId(matrixId: string, rowNo: number): string {
  return `CFG:${matrixId}:R${rowNo}`;
}

function selectorValues(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/** when が values に完全一致するか（未割当因子があれば不一致扱い）。 */
function selectorMatches(when: ConfigMatrixSelector, values: Record<string, string>): boolean {
  for (const [factorId, raw] of Object.entries(when)) {
    const assigned = values[factorId];
    if (assigned === undefined) return false;
    if (!selectorValues(raw).includes(assigned)) return false;
  }
  return true;
}

/** when が partial と矛盾しない（＝将来この除外に一致し得る）か。 */
function selectorCompatible(when: ConfigMatrixSelector, partial: Record<string, string>): boolean {
  for (const [factorId, raw] of Object.entries(when)) {
    const assigned = partial[factorId];
    if (assigned === undefined) continue;
    if (!selectorValues(raw).includes(assigned)) return false;
  }
  return true;
}

function excludedLabel(ex: ConfigMatrixExcludedCombination, index: number): string {
  return ex.id ?? `excludedCombinations[${index}]`;
}

function describeSelector(when: ConfigMatrixSelector, factors: ConfigMatrixFactorSpec[]): string {
  return Object.entries(when)
    .map(([factorId, raw]) => {
      const factor = factors.find((f) => f.id === factorId);
      const name = factor ? factor.name : factorId;
      return `${name}=${selectorValues(raw).join("|")}`;
    })
    .join(", ");
}

type CompletionResult =
  | { kind: "found"; values: Record<string, string> }
  | { kind: "none" }
  | { kind: "budget-exceeded" };

/**
 * 因子ごとの候補水準（allowedLevels）の範囲内で、どの除外組合せにも一致しない完全割当を1件探す。
 * 探索は因子の宣言順・水準の宣言順の DFS で、最初に見つかった1件を返すため決定的。
 * 訪問ノード数が maxNodes を超えたら budget-exceeded を返す。
 */
function searchAssignment(
  factors: ConfigMatrixFactorSpec[],
  allowedLevels: Record<string, string[]>,
  excluded: ConfigMatrixExcludedCombination[],
  maxNodes: number
): CompletionResult {
  const current: Record<string, string> = {};
  let nodes = 0;
  let exceeded = false;

  const violates = (): boolean => excluded.some((ex) => selectorMatches(ex.when, current));

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

/** 部分割当 assigned を固定したまま、除外組合せに一致しない完全割当を1件探す。 */
function findValidCompletion(
  assigned: Record<string, string>,
  factors: ConfigMatrixFactorSpec[],
  excluded: ConfigMatrixExcludedCombination[],
  maxNodes: number
): CompletionResult {
  const allowed: Record<string, string[]> = {};
  for (const f of factors) {
    const pinned = assigned[f.id];
    allowed[f.id] = pinned === undefined ? f.levels : [pinned];
  }
  return searchAssignment(factors, allowed, excluded, maxNodes);
}

function pairMapKey(i: number, levelA: string, j: number, levelB: string): string {
  return JSON.stringify([i, levelA, j, levelB]);
}

// --- メインエンジン ---

export function computeConfigMatrixRows(spec: ConfigMatrixSpec): ConfigMatrixResult {
  const matrixId = spec.matrixId ?? DEFAULT_CONFIG_MATRIX_ID;
  const factors = spec.factors;
  const excluded = spec.excludedCombinations ?? [];
  const coveragePolicy = spec.coveragePolicy ?? "single";
  const maxCombinationCount = spec.maxCombinationCount ?? DEFAULT_MAX_COMBINATION_COUNT;
  const maxSearchNodes = spec.maxSearchNodes ?? DEFAULT_CONFIG_MATRIX_SEARCH_NODES;

  const findings: ConfigMatrixFinding[] = [];

  // --- 1. 入力検査 ---
  const factorIds = new Set<string>();
  const factorById = new Map<string, ConfigMatrixFactorSpec>();
  for (const f of factors) {
    if (factorIds.has(f.id)) {
      findings.push({
        categoryId: "CMC-03",
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
          categoryId: "CMC-03",
          severity: "high",
          target: f.id,
          detail: `因子「${f.id}」の水準「${lv}」が重複して宣言されている。`,
        });
      }
      levelSeen.add(lv);
    }
    if (f.levels.length <= 1) {
      findings.push({
        categoryId: "CMC-04",
        severity: "medium",
        target: f.id,
        detail: `因子「${f.id}」の取り得る水準が${f.levels.length}件しかなく、組合せに寄与しない。`,
      });
    }
  }

  if (factors.length === 0) {
    findings.push({
      categoryId: "CMC-05",
      severity: "high",
      target: matrixId,
      detail: "因子が1件も宣言されていない。",
    });
  }

  const nameOf = (factorId: string): string => factorById.get(factorId)?.name ?? factorId;

  const checkSelector = (label: string, when: ConfigMatrixSelector): boolean => {
    let ok = true;
    for (const [factorId, raw] of Object.entries(when)) {
      if (!factorIds.has(factorId)) {
        findings.push({
          categoryId: "CMC-01",
          severity: "high",
          target: label,
          detail: `「${label}」が未宣言の因子ID「${factorId}」を参照している。`,
        });
        ok = false;
        continue;
      }
      const factor = factorById.get(factorId) as ConfigMatrixFactorSpec;
      for (const v of selectorValues(raw)) {
        if (!factor.levels.includes(v)) {
          findings.push({
            categoryId: "CMC-02",
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

  excluded.forEach((ex, i) => {
    checkSelector(excludedLabel(ex, i), ex.when);
    if (ex.reason === undefined || ex.reason.trim().length === 0) {
      findings.push({
        categoryId: "CMC-06",
        severity: "high",
        target: excludedLabel(ex, i),
        detail: `除外組合せ「${excludedLabel(ex, i)}」に除外理由(reason)が記入されていない。`,
      });
    }
  });

  // --- 共通のカウント（generated=false でも算出する） ---
  let totalPairCount = 0;
  for (let i = 0; i < factors.length; i++) {
    for (let j = i + 1; j < factors.length; j++) {
      totalPairCount += factors[i].levels.length * factors[j].levels.length;
    }
  }
  const totalLevelCount = factors.reduce((n, f) => n + f.levels.length, 0);

  const skipResult = (skipReason: string): ConfigMatrixResult => ({
    matrixId,
    coveragePolicy,
    generated: false,
    skipReason,
    factorCount: factors.length,
    totalLevelCount,
    totalPairCount,
    unreachableLevelCount: 0,
    unreachablePairCount: 0,
    targetLevelCount: 0,
    targetPairCount: 0,
    coveredLevelCount: 0,
    coveredPairCount: 0,
    levelCoverageRatioPercent: 0,
    pairCoverageRatioPercent: 0,
    rows: [],
    levels: [],
    pairs: [],
    untestedLevels: [],
    findings,
  });

  // --- 2. 致命的な指摘があれば生成しない ---
  const blocking = findings.filter((f) => f.severity === "high");
  if (blocking.length > 0) {
    const categories = [...new Set(blocking.map((f) => f.categoryId))].join(", ");
    return skipResult(`入力の構造に致命的な指摘(${categories})があるため構成生成を行わなかった`);
  }

  // --- 3. 全構成数の上限判定 ---
  const rawFullCombinationCount = factors.reduce((n, f) => n * f.levels.length, 1);
  const fullCombinationCount = Number.isSafeInteger(rawFullCombinationCount)
    ? rawFullCombinationCount
    : undefined;

  if (fullCombinationCount === undefined || fullCombinationCount > maxCombinationCount) {
    const countText = fullCombinationCount === undefined ? "算出不能(安全整数を超える)" : `${fullCombinationCount}件`;
    findings.push({
      categoryId: "CMC-09",
      severity: "info",
      target: matrixId,
      detail: `全構成数(${countText})が上限 ${maxCombinationCount} 件を超えるため構成生成を行わなかった。`,
    });
    return skipResult(`全構成数(${countText})が上限 ${maxCombinationCount} 件を超えるため構成生成を行わなかった`);
  }

  // --- 4. 水準・ペアの到達可否判定 ---
  const levels: ConfigMatrixLevelStatus[] = [];
  let unreachableLevelCount = 0;
  for (const f of factors) {
    for (const lv of f.levels) {
      const completion = findValidCompletion({ [f.id]: lv }, factors, excluded, maxSearchNodes);
      if (completion.kind !== "none") {
        levels.push({ factorId: f.id, level: lv, status: "reachable", coveredByRowNos: [] });
        continue;
      }
      unreachableLevelCount += 1;
      const related = excluded
        .map((ex, i) => ({ ex, i }))
        .filter(({ ex }) => selectorCompatible(ex.when, { [f.id]: lv }) && ex.when[f.id] !== undefined);
      const base = "除外組合せにより、この水準を含む有効な構成が存在しない";
      const unreachableReason =
        related.length > 0
          ? `${base}（該当: ${related.map(({ ex, i }) => `${excludedLabel(ex, i)}: ${ex.reason ?? "(未記入)"}`).join(" / ")}）`
          : base;
      levels.push({ factorId: f.id, level: lv, status: "unreachable", unreachableReason, coveredByRowNos: [] });
    }
  }

  const pairs: ConfigMatrixPairStatus[] = [];
  let unreachablePairCount = 0;
  if (factors.length >= 2) {
    for (let i = 0; i < factors.length; i++) {
      for (let j = i + 1; j < factors.length; j++) {
        for (const levelA of factors[i].levels) {
          for (const levelB of factors[j].levels) {
            const assigned = { [factors[i].id]: levelA, [factors[j].id]: levelB };
            const completion = findValidCompletion(assigned, factors, excluded, maxSearchNodes);
            if (completion.kind !== "none") {
              pairs.push({
                factorIdA: factors[i].id,
                levelA,
                factorIdB: factors[j].id,
                levelB,
                status: "reachable",
                coveredByRowNos: [],
              });
              continue;
            }
            unreachablePairCount += 1;
            const related = excluded
              .map((ex, ei) => ({ ex, ei }))
              .filter(
                ({ ex }) =>
                  selectorCompatible(ex.when, assigned) &&
                  (ex.when[factors[i].id] !== undefined || ex.when[factors[j].id] !== undefined)
              );
            const base = "除外組合せにより、この水準ペアを含む有効な構成が存在しない";
            const unreachableReason =
              related.length > 0
                ? `${base}（該当: ${related.map(({ ex, ei }) => `${excludedLabel(ex, ei)}: ${ex.reason ?? "(未記入)"}`).join(" / ")}）`
                : base;
            pairs.push({
              factorIdA: factors[i].id,
              levelA,
              factorIdB: factors[j].id,
              levelB,
              status: "unreachable",
              unreachableReason,
              coveredByRowNos: [],
            });
            findings.push({
              categoryId: "CMC-07",
              severity: "medium",
              target: `${nameOf(factors[i].id)}=${levelA} × ${nameOf(factors[j].id)}=${levelB}`,
              detail: `水準ペア「${nameOf(factors[i].id)}=${levelA} × ${nameOf(factors[j].id)}=${levelB}」は${unreachableReason}。`,
            });
          }
        }
      }
    }
  }

  const targetLevelCount = totalLevelCount - unreachableLevelCount;
  const targetPairCount = totalPairCount - unreachablePairCount;

  // --- 5. 冗長・到達不能な除外組合せの検出 ---
  excluded.forEach((ex, i) => {
    const allowed: Record<string, string[]> = {};
    for (const f of factors) {
      const raw = ex.when[f.id];
      allowed[f.id] = raw === undefined ? f.levels : f.levels.filter((lv) => selectorValues(raw).includes(lv));
    }
    const others = excluded.filter((_, oi) => oi !== i);
    const result = searchAssignment(factors, allowed, others, maxSearchNodes);
    if (result.kind !== "none") return; // budget 超過時は判定を出さない
    findings.push({
      categoryId: "CMC-08",
      severity: "medium",
      target: excludedLabel(ex, i),
      detail: `除外組合せ「${excludedLabel(ex, i)}」に一致する組合せが他の除外で既に全て除外されており、冗長または到達不能である。`,
    });
  });

  // --- 6. 構成（rows）の生成 ---
  const generatedValues: Array<Record<string, string>> = [];

  const generateSingleRows = (): Array<Record<string, string>> => {
    const rows: Array<Record<string, string>> = [];
    const coveredKey = new Set<string>();
    for (const f of factors) {
      for (const lv of f.levels) {
        const key = `${f.id} ${lv}`;
        if (coveredKey.has(key)) continue;
        const levelStatus = levels.find((l) => l.factorId === f.id && l.level === lv);
        if (!levelStatus || levelStatus.status !== "reachable") continue;
        const completion = findValidCompletion({ [f.id]: lv }, factors, excluded, maxSearchNodes);
        let values: Record<string, string>;
        if (completion.kind === "found") {
          values = completion.values;
        } else {
          // 防御的フォールバック: level status が reachable なので通常ここには来ない。
          values = { [f.id]: lv };
          for (const other of factors) {
            if (other.id === f.id) continue;
            const pick = other.levels.find(
              (candidateLv) => !excluded.some((ex) => selectorMatches(ex.when, { ...values, [other.id]: candidateLv }))
            );
            values[other.id] = pick ?? other.levels[0];
          }
        }
        rows.push(values);
        for (const ff of factors) coveredKey.add(`${ff.id} ${values[ff.id]}`);
      }
    }
    return rows;
  };

  const generateFullRows = (): Array<Record<string, string>> => {
    const rows: Array<Record<string, string>> = [];
    const values: Record<string, string> = {};
    const rec = (idx: number): void => {
      if (idx === factors.length) {
        if (!excluded.some((ex) => selectorMatches(ex.when, values))) rows.push({ ...values });
        return;
      }
      for (const lv of factors[idx].levels) {
        values[factors[idx].id] = lv;
        rec(idx + 1);
      }
      delete values[factors[idx].id];
    };
    rec(0);
    return rows;
  };

  const generatePairwiseRows = (): Array<Record<string, string>> => {
    if (factors.length < 2) return generateSingleRows();
    const rows: Array<Record<string, string>> = [];
    const pairIndexByKey = new Map<string, number>();
    let idx = 0;
    for (let i = 0; i < factors.length; i++) {
      for (let j = i + 1; j < factors.length; j++) {
        for (const la of factors[i].levels) {
          for (const lb of factors[j].levels) {
            pairIndexByKey.set(pairMapKey(i, la, j, lb), idx);
            idx += 1;
          }
        }
      }
    }
    const covered = new Array<boolean>(pairs.length).fill(false);

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
        const key = pairMapKey(i as number, li as string, j as number, lj as string);
        const pairIdx = pairIndexByKey.get(key);
        if (pairIdx === undefined) continue;
        if (pairs[pairIdx].status === "reachable" && !covered[pairIdx]) count += 1;
      }
      return count;
    };

    for (;;) {
      // 未被覆の到達可能ペアを正準順(因子添字 i<j、水準宣言順)で探す。決定的な種選びのため常に先頭を取る。
      let seed: ConfigMatrixPairStatus | undefined;
      let seedKeyIdx = -1;
      outer: for (let i = 0; i < factors.length; i++) {
        for (let j = i + 1; j < factors.length; j++) {
          for (const la of factors[i].levels) {
            for (const lb of factors[j].levels) {
              const pIdx = pairIndexByKey.get(pairMapKey(i, la, j, lb)) as number;
              const p = pairs[pIdx];
              if (p.status === "reachable" && !covered[pIdx]) {
                seed = p;
                seedKeyIdx = pIdx;
                break outer;
              }
            }
          }
        }
      }
      if (!seed) break;

      const values: Record<string, string> = {
        [seed.factorIdA]: seed.levelA,
        [seed.factorIdB]: seed.levelB,
      };
      const assignedFactorIndexes: number[] = [];
      factors.forEach((f, i) => {
        if (values[f.id] !== undefined) assignedFactorIndexes.push(i);
      });

      for (let fi = 0; fi < factors.length; fi++) {
        const factor = factors[fi];
        if (values[factor.id] !== undefined) continue;

        let bestLevel: string | undefined;
        let bestScore = -1;
        for (const level of factor.levels) {
          const candidate = { ...values, [factor.id]: level };
          if (excluded.some((ex) => selectorMatches(ex.when, candidate))) continue;
          const completion = findValidCompletion(candidate, factors, excluded, maxSearchNodes);
          if (completion.kind !== "found") continue;
          const score = newlyCoverableCount(assignedFactorIndexes, fi, level, values);
          if (score > bestScore) {
            bestScore = score;
            bestLevel = level;
          }
        }

        if (bestLevel === undefined) {
          const completion = findValidCompletion(values, factors, excluded, maxSearchNodes);
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
        assignedFactorIndexes.push(fi);
      }

      rows.push(values);
      covered[seedKeyIdx] = true;
      for (let i = 0; i < factors.length; i++) {
        for (let j = i + 1; j < factors.length; j++) {
          const key = pairMapKey(i, values[factors[i].id], j, values[factors[j].id]);
          const pIdx = pairIndexByKey.get(key);
          if (pIdx !== undefined) covered[pIdx] = true;
        }
      }
    }
    return rows;
  };

  if (coveragePolicy === "full") {
    generatedValues.push(...generateFullRows());
  } else if (coveragePolicy === "pairwise") {
    generatedValues.push(...generatePairwiseRows());
  } else {
    generatedValues.push(...generateSingleRows());
  }

  const rows: ConfigMatrixRow[] = generatedValues.map((values, i) => ({ no: i + 1, values }));

  // --- 7. 生成結果に基づく被覆状態の反映 ---
  for (const row of rows) {
    for (const lvl of levels) {
      if (row.values[lvl.factorId] === lvl.level) lvl.coveredByRowNos.push(row.no);
    }
    for (const pr of pairs) {
      if (row.values[pr.factorIdA] === pr.levelA && row.values[pr.factorIdB] === pr.levelB) {
        pr.coveredByRowNos.push(row.no);
      }
    }
  }

  // --- 8. カウント ---
  const coveredLevelCount = levels.filter((l) => l.status === "reachable" && l.coveredByRowNos.length > 0).length;
  const coveredPairCount = pairs.filter((p) => p.status === "reachable" && p.coveredByRowNos.length > 0).length;
  const levelCoverageRatioPercent =
    targetLevelCount === 0 ? 0 : Math.round((coveredLevelCount / targetLevelCount) * 1000) / 10;
  const pairCoverageRatioPercent =
    targetPairCount === 0 ? 0 : Math.round((coveredPairCount / targetPairCount) * 1000) / 10;

  const untestedLevels = levels.filter((l) => l.status === "reachable" && l.coveredByRowNos.length === 0);
  if (untestedLevels.length > 0) {
    findings.push({
      categoryId: "CMC-10",
      severity: "high",
      target: matrixId,
      detail: `生成後も${untestedLevels.length}件の水準がどの構成にも現れていない。`,
    });
  }

  return {
    matrixId,
    coveragePolicy,
    generated: true,
    factorCount: factors.length,
    totalLevelCount,
    totalPairCount,
    unreachableLevelCount,
    unreachablePairCount,
    targetLevelCount,
    targetPairCount,
    coveredLevelCount,
    coveredPairCount,
    levelCoverageRatioPercent,
    pairCoverageRatioPercent,
    rows,
    levels,
    pairs,
    untestedLevels,
    findings,
  };
}

export function buildConfigMatrixCoverageTargets(spec: ConfigMatrixSpec): TestCaseCoverageTarget[] {
  const matrixId = spec.matrixId ?? DEFAULT_CONFIG_MATRIX_ID;
  const result = computeConfigMatrixRows(spec);
  if (!result.generated) return [];
  return result.rows.map((row) => ({
    id: configMatrixTargetId(matrixId, row.no),
    techniqueId: "config-matrix" as const,
    description: spec.factors.map((f) => `${f.name}=${row.values[f.id]}`).join(" × "),
    origin: matrixId,
  }));
}

export function renderConfigMatrix(spec: ConfigMatrixSpec): string {
  const matrixId = spec.matrixId ?? DEFAULT_CONFIG_MATRIX_ID;
  const result = computeConfigMatrixRows(spec);
  const factors = spec.factors;
  const excluded = spec.excludedCombinations ?? [];
  const nameOf = (factorId: string): string => factors.find((f) => f.id === factorId)?.name ?? factorId;

  const lines: string[] = [];
  lines.push("# 構成・環境マトリクス設計結果");
  lines.push("");
  if (spec.title) {
    lines.push(`- 対象: ${spec.title}`);
    lines.push("");
  }
  lines.push(`- 網羅方針: ${result.coveragePolicy}`);
  lines.push("");

  const skipLine = (): void => {
    lines.push(`- 未算出(理由: ${escapeCell(result.skipReason ?? "")})`);
    lines.push("");
  };

  lines.push("## 1. 構成因子・水準一覧");
  lines.push("");
  lines.push("| 因子ID | 因子名 | 水準数 | 水準 |");
  lines.push("| --- | --- | --- | --- |");
  for (const f of factors) {
    lines.push(
      `| ${escapeCell(f.id)} | ${escapeCell(f.name)} | ${f.levels.length} | ${escapeCell(f.levels.join(", "))} |`
    );
  }
  lines.push("");

  lines.push("## 2. 除外組合せ一覧");
  lines.push("");
  if (excluded.length === 0) {
    lines.push("- 宣言なし");
    lines.push("");
  } else {
    lines.push("| ID | 条件 | 理由 |");
    lines.push("| --- | --- | --- |");
    excluded.forEach((ex, i) => {
      const reasonText = ex.reason === undefined || ex.reason.trim().length === 0 ? "(未記入)" : ex.reason;
      lines.push(
        `| ${escapeCell(excludedLabel(ex, i))} | ${escapeCell(describeSelector(ex.when, factors))} | ${escapeCell(
          reasonText
        )} |`
      );
    });
    lines.push("");
  }

  lines.push("## 3. 到達不能な水準・ペアの一覧");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const unreachableLevels = result.levels.filter((l) => l.status === "unreachable");
    const unreachablePairs = result.pairs.filter((p) => p.status === "unreachable");
    if (unreachableLevels.length === 0 && unreachablePairs.length === 0) {
      lines.push("- 到達不能な水準・ペアなし");
      lines.push("");
    } else {
      lines.push("| 種別 | 対象 | 理由 |");
      lines.push("| --- | --- | --- |");
      for (const l of unreachableLevels.slice(0, UNREACHABLE_RENDER_LIMIT)) {
        lines.push(
          `| 水準 | ${escapeCell(`${nameOf(l.factorId)}=${l.level}`)} | ${escapeCell(l.unreachableReason ?? "")} |`
        );
      }
      for (const p of unreachablePairs.slice(0, UNREACHABLE_RENDER_LIMIT)) {
        lines.push(
          `| ペア | ${escapeCell(`${nameOf(p.factorIdA)}=${p.levelA} × ${nameOf(p.factorIdB)}=${p.levelB}`)} | ${escapeCell(
            p.unreachableReason ?? ""
          )} |`
        );
      }
      lines.push("");
    }
  }

  lines.push(`## 4. 生成した構成表(網羅方針: ${result.coveragePolicy})`);
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const header = ["No", ...factors.map((f) => f.name)];
    lines.push(`| ${header.map(escapeCell).join(" | ")} |`);
    lines.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (const row of result.rows) {
      const cells = [String(row.no), ...factors.map((f) => row.values[f.id])];
      lines.push(`| ${cells.map((v) => escapeCell(String(v))).join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push("## 5. 決定的検査");
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("- 指摘なし");
  } else {
    const sorted = [...result.findings].sort((a, b) => a.categoryId.localeCompare(b.categoryId));
    const cmc07Total = sorted.filter((f) => f.categoryId === "CMC-07").length;
    let cmc07Seen = 0;
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      if (f.categoryId === "CMC-07") {
        cmc07Seen += 1;
        if (cmc07Seen > FINDING_RENDER_LIMIT) continue;
      }
      lines.push(`- [${f.severity}] ${f.categoryId} ${escapeCell(f.target)}: ${escapeCell(f.detail)}`);
      const isLast =
        f.categoryId === "CMC-07" && (i + 1 >= sorted.length || sorted[i + 1].categoryId !== "CMC-07");
      if (isLast && cmc07Total > FINDING_RENDER_LIMIT) {
        lines.push(`- 他 ${cmc07Total - FINDING_RENDER_LIMIT} 件（表示を ${FINDING_RENDER_LIMIT} 件に丸めた）`);
      }
    }
  }
  lines.push("");

  lines.push("## 6. 網羅対象一覧(generate_test_cases 引き渡し)");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const targets = buildConfigMatrixCoverageTargets(spec);
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
      `- 表は表示上の抜粋であり、generate_test_cases の configMatrix へ渡した場合は ${targets.length} 件全てが universe の対象になる。`
    );
    lines.push("");
  }

  lines.push("## 7. サマリ");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    lines.push(
      `- 因子数: ${result.factorCount} / 全水準数: ${result.totalLevelCount} / 全ペア数: ${result.totalPairCount} / ` +
        `到達不能水準: ${result.unreachableLevelCount} / 到達不能ペア: ${result.unreachablePairCount} / ` +
        `対象水準数: ${result.targetLevelCount} / 対象ペア数: ${result.targetPairCount} / ` +
        `水準被覆率: ${result.levelCoverageRatioPercent.toFixed(1)}% / ペア被覆率: ${result.pairCoverageRatioPercent.toFixed(1)}% / ` +
        `生成行数: ${result.rows.length}`
    );
  }

  lines.push(
    ...renderNextToolsSection(
      "design_config_matrix",
      [],
      spec.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

const configMatrixSelectorSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

export const designConfigMatrixInputShape = {
  ...completedToolsInputShape,
  matrixId: z.string().optional().describe("Matrix id used to build coverage target ids (default MAIN)"),
  title: z.string().optional(),
  factors: z
    .array(
      z.object({
        id: z.string().describe("Factor id, unique within the matrix, e.g. F1"),
        name: z.string().describe("Factor name, e.g. OS / Browser / Resolution"),
        levels: z.array(z.string()).min(1).describe("Levels of this factor; at least 1"),
      })
    )
    .min(1)
    .describe("Configuration factors (OS, browser, resolution, device, etc.)"),
  coveragePolicy: z
    .enum(["single", "pairwise", "full"])
    .optional()
    .describe("Coverage policy: single (each level once), pairwise (all level pairs), full (full product); default single"),
  excludedCombinations: z
    .array(
      z.object({
        id: z.string().optional(),
        when: configMatrixSelectorSchema,
        reason: z
          .string()
          .optional()
          .describe("Why this combination is excluded; leaving it empty is flagged as CMC-06[high]"),
      })
    )
    .optional()
    .describe("Combinations that are excluded from the generated matrix"),
  maxCombinationCount: z.number().int().positive().optional().describe("Full combination count cap (default 5000)"),
  maxSearchNodes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Node budget per reachability search / greedy completion (default 5000)"),
} as const;

const designConfigMatrixInputSchema = z.object(designConfigMatrixInputShape);
export type DesignConfigMatrixInput = z.infer<typeof designConfigMatrixInputSchema>;

export function registerDesignConfigMatrixTool(server: McpServer): void {
  server.registerTool(
    "design_config_matrix",
    {
      title: "Design Config Matrix",
      description:
        "構成因子(OS/ブラウザ/解像度/機種など)と水準、網羅方針(single=シングルカバレッジ / pairwise=ペア / full=フル)、" +
        "除外する組合せとその理由から、決定的に構成一覧を生成し、水準被覆率・ペア被覆率・テストされない水準・除外理由未記入をMarkdownで返す。" +
        "各構成は CFG: プレフィックスの網羅対象IDとして generate_test_cases の configMatrix へそのまま渡せる。",
      inputSchema: designConfigMatrixInputShape,
    },
    async (input) => {
      const text = renderConfigMatrix(input as ConfigMatrixSpec);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
