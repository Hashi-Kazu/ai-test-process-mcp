import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executionOrderAnalysisCriteria } from "../resources/executionOrderCriteria.js";
import type {
  ExecutionOrderCoverage,
  ExecutionOrderFinding,
  ExecutionOrderResult,
  ExecutionOrderSpec,
  ExecutionResourceConflictRow,
  ExecutionScheduleBasis,
  ExecutionScheduleRow,
} from "../types.js";

// analyze_execution_order 固有の決定的エンジン。
// 純関数群で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。

export const DEFAULT_EXECUTION_PLAN_ID = "EXP";
export const DEFAULT_MAX_EXECUTION_NODES = 500;

const FINDING_RENDER_LIMIT = 50;
const EPS = 1e-9;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function fmtNum(value: number | undefined): string {
  return value === undefined ? "-" : String(value);
}

function arraysEqualExact(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// --- メインエンジン ---

export function computeExecutionOrder(spec: ExecutionOrderSpec): ExecutionOrderResult {
  const planId = spec.planId ?? DEFAULT_EXECUTION_PLAN_ID;
  const nodes = spec.nodes;
  const maxNodes = spec.maxNodes ?? DEFAULT_MAX_EXECUTION_NODES;

  const findings: ExecutionOrderFinding[] = [];

  const emptyResult = (skipReason: string): ExecutionOrderResult => ({
    planId,
    generated: false,
    skipReason,
    orderedNodeIds: [],
    waves: [],
    schedule: [],
    cycleNodeIds: [],
    representativeCycle: [],
    criticalPathNodeIds: [],
    totalDurationHours: undefined,
    scheduleBasis: "unavailable",
    undeclaredDependencyNodeIds: [],
    isolatedNodeIds: [],
    resourceConflicts: [],
    maxConcurrency: undefined,
    unplannedContainerIds: [],
    coverage: { basis: "unavailable", denominator: 0, reason: skipReason, claimMismatch: false },
    findings,
  });

  if (nodes.length > maxNodes) {
    const detail = `ノード件数(${nodes.length}件)が上限 ${maxNodes} 件を超えるため実行順序・依存関係・クリティカルパスの算出を打ち切った。`;
    findings.push({ categoryId: "EOC-26", severity: "info", target: planId, detail });
    return emptyResult(detail);
  }

  // --- 母集団の構築 ---
  const indexById = new Map<string, number>();
  const nodeById = new Map<string, (typeof nodes)[number]>();
  const idCounts = new Map<string, number>();
  for (const n of nodes) idCounts.set(n.id, (idCounts.get(n.id) ?? 0) + 1);
  for (const [id, count] of idCounts) {
    if (count > 1) {
      findings.push({
        categoryId: "EOC-01",
        severity: "high",
        target: id,
        detail: `ノードID「${id}」が${count}件重複して宣言されている。`,
      });
    }
  }
  nodes.forEach((n, i) => {
    indexById.set(n.id, i);
    nodeById.set(n.id, n);
  });

  const resources = spec.resources ?? [];
  const resourceById = new Map<string, (typeof resources)[number]>();
  for (const r of resources) resourceById.set(r.id, r);
  const dataItemIdSet = new Set(spec.dataItemIds ?? []);

  // --- 依存関係の入力検査(EOC-02/03/05/06/07/08)とグラフ構築 ---
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const n of nodes) {
    predecessors.set(n.id, []);
    successors.set(n.id, []);
  }

  const undeclaredDependencyNodeIds: string[] = [];

  for (const n of nodes) {
    const deps = n.dependsOn;
    if (deps === undefined) {
      undeclaredDependencyNodeIds.push(n.id);
      findings.push({
        categoryId: "EOC-05",
        severity: "high",
        target: n.id,
        detail: `ノード「${n.id}」に依存関係(dependsOn)が宣言されていない。`,
      });
      continue;
    }
    const seenFrom = new Set<string>();
    for (const dep of deps) {
      if (dep.fromId === n.id) {
        findings.push({
          categoryId: "EOC-03",
          severity: "high",
          target: n.id,
          detail: `ノード「${n.id}」が自己依存を宣言している。`,
        });
        continue;
      }
      if (!nodeById.has(dep.fromId)) {
        findings.push({
          categoryId: "EOC-02",
          severity: "high",
          target: n.id,
          detail: `ノード「${n.id}」の依存先「${dep.fromId}」が母集団に存在しない。`,
        });
        continue;
      }
      if (seenFrom.has(dep.fromId)) {
        findings.push({
          categoryId: "EOC-08",
          severity: "info",
          target: n.id,
          detail: `ノード「${n.id}」への依存「${dep.fromId} → ${n.id}」が重複して宣言されている。`,
        });
        continue;
      }
      seenFrom.add(dep.fromId);
      predecessors.get(n.id)!.push(dep.fromId);
      successors.get(dep.fromId)!.push(n.id);

      if (dep.reason === undefined || dep.reason.trim().length === 0) {
        findings.push({
          categoryId: "EOC-06",
          severity: "medium",
          target: n.id,
          detail: `ノード「${n.id}」の依存先「${dep.fromId}」に根拠(reason)が記入されていない。`,
        });
      }
      if (dep.basisKind === "artifact" || dep.basisKind === "resource" || dep.basisKind === "data") {
        const fromNode = nodeById.get(dep.fromId)!;
        let ok = false;
        if (dep.basisKind === "artifact") {
          ok = !!dep.basisRef && (fromNode.producedArtifactIds ?? []).includes(dep.basisRef);
        } else if (dep.basisKind === "resource") {
          ok = !!dep.basisRef && resourceById.has(dep.basisRef);
        } else if (dep.basisKind === "data") {
          ok = !!dep.basisRef && dataItemIdSet.has(dep.basisRef);
        }
        if (!ok) {
          findings.push({
            categoryId: "EOC-07",
            severity: "high",
            target: n.id,
            detail: `ノード「${n.id}」の依存先「${dep.fromId}」への根拠(${dep.basisKind}:${dep.basisRef ?? "-"})が実体に存在しない。`,
          });
        }
      }
    }
  }

  // 決定性のため、先行・後続の一覧を入力インデックス昇順に整列する
  for (const [, arr] of predecessors) arr.sort((a, b) => indexById.get(a)! - indexById.get(b)!);
  for (const [, arr] of successors) arr.sort((a, b) => indexById.get(a)! - indexById.get(b)!);

  // --- 必要リソースの入力検査(EOC-10/11/14) ---
  const resourceUsed = new Set<string>();
  const nodeResourceRequirements = new Map<string, { resourceId: string; amount: number }[]>();
  for (const n of nodes) {
    const reqs = n.requiredResources;
    if (reqs === undefined) {
      findings.push({
        categoryId: "EOC-10",
        severity: "medium",
        target: n.id,
        detail: `ノード「${n.id}」に必要リソース(requiredResources)が宣言されていない。`,
      });
      nodeResourceRequirements.set(n.id, []);
      continue;
    }
    const valid: { resourceId: string; amount: number }[] = [];
    for (const r of reqs) {
      if (!resourceById.has(r.resourceId)) {
        findings.push({
          categoryId: "EOC-11",
          severity: "high",
          target: n.id,
          detail: `ノード「${n.id}」が母集団に存在しないリソース「${r.resourceId}」を要求している。`,
        });
        continue;
      }
      resourceUsed.add(r.resourceId);
      valid.push({ resourceId: r.resourceId, amount: r.amount ?? 1 });
    }
    nodeResourceRequirements.set(n.id, valid);
  }
  for (const r of resources) {
    if (!resourceUsed.has(r.id)) {
      findings.push({
        categoryId: "EOC-14",
        severity: "medium",
        target: r.id,
        detail: `リソース「${r.id}」がどのノードからも要求されていない。`,
      });
    }
  }

  // --- 孤立ノード(EOC-15) ---
  const isolatedNodeIds: string[] = [];
  for (const n of nodes) {
    if ((predecessors.get(n.id) ?? []).length === 0 && (successors.get(n.id) ?? []).length === 0) {
      isolatedNodeIds.push(n.id);
      findings.push({
        categoryId: "EOC-15",
        severity: "info",
        target: n.id,
        detail: `ノード「${n.id}」は先行・後続のいずれの依存関係も持たない孤立ノードである。`,
      });
    }
  }

  // --- トポロジカルソート(Kahn法、入力インデックス昇順の安定順) ---
  const inDegree = new Map<string, number>();
  for (const n of nodes) inDegree.set(n.id, (predecessors.get(n.id) ?? []).length);

  const remainingIds = new Set(nodes.map((n) => n.id));
  const orderedNodeIds: string[] = [];

  for (;;) {
    let candidate: string | undefined;
    let candidateIndex = Infinity;
    for (const id of remainingIds) {
      if ((inDegree.get(id) ?? 0) === 0) {
        const idx = indexById.get(id)!;
        if (idx < candidateIndex) {
          candidateIndex = idx;
          candidate = id;
        }
      }
    }
    if (candidate === undefined) break;
    orderedNodeIds.push(candidate);
    remainingIds.delete(candidate);
    for (const succ of successors.get(candidate) ?? []) {
      if (remainingIds.has(succ)) {
        inDegree.set(succ, (inDegree.get(succ) ?? 0) - 1);
      }
    }
  }

  const cycleNodeIds = nodes.map((n) => n.id).filter((id) => remainingIds.has(id));
  const isCyclic = cycleNodeIds.length > 0;

  let representativeCycle: string[] = [];
  if (isCyclic) {
    findings.push({
      categoryId: "EOC-04",
      severity: "high",
      target: planId,
      detail: `循環依存が検出され、実行順序を一意に決定できない。残余ノード: ${cycleNodeIds.join(", ")}`,
    });

    const cycleSet = new Set(cycleNodeIds);
    const visited = new Set<string>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    let found: string[] | null = null;

    const dfs = (node: string): void => {
      if (found) return;
      stack.push(node);
      onStack.add(node);
      visited.add(node);
      const succ = (successors.get(node) ?? []).filter((id) => cycleSet.has(id));
      for (const next of succ) {
        if (found) return;
        if (onStack.has(next)) {
          const idx = stack.indexOf(next);
          found = [...stack.slice(idx), next];
          return;
        }
        if (!visited.has(next)) dfs(next);
      }
      if (!found) {
        stack.pop();
        onStack.delete(node);
      }
    };

    for (const id of cycleNodeIds) {
      if (!visited.has(id)) dfs(id);
      if (found) break;
    }
    representativeCycle = found ?? [];
  }

  // --- wave / CPM ---
  let waves: string[][] = [];
  let schedule: ExecutionScheduleRow[] = [];
  let criticalPathNodeIds: string[] = [];
  let totalDurationHours: number | undefined;
  let scheduleBasis: ExecutionScheduleBasis;
  const resourceConflicts: ExecutionResourceConflictRow[] = [];
  let maxConcurrency: number | undefined;

  if (isCyclic) {
    scheduleBasis = "unavailable";
  } else {
    const waveOf = new Map<string, number>();
    for (const id of orderedNodeIds) {
      const preds = predecessors.get(id) ?? [];
      const w = preds.length === 0 ? 0 : 1 + Math.max(...preds.map((p) => waveOf.get(p)!));
      waveOf.set(id, w);
    }
    const maxWave = orderedNodeIds.length > 0 ? Math.max(...orderedNodeIds.map((id) => waveOf.get(id)!)) : -1;
    for (let w = 0; w <= maxWave; w++) {
      waves.push(nodes.filter((n) => waveOf.get(n.id) === w).map((n) => n.id));
    }

    const definedCount = nodes.filter((n) => n.durationHours !== undefined).length;
    if (definedCount === nodes.length) scheduleBasis = "computed";
    else if (definedCount === 0) scheduleBasis = "unavailable";
    else scheduleBasis = "partial";

    if (scheduleBasis === "unavailable") {
      findings.push({
        categoryId: "EOC-27",
        severity: "info",
        target: planId,
        detail: "durationHours の申告が1件も無いため、クリティカルパス・リソース競合の算出ができない。",
      });
      schedule = nodes.map((n) => ({
        nodeId: n.id,
        label: n.nameJa ?? n.id,
        order: orderedNodeIds.indexOf(n.id) + 1,
        wave: waveOf.get(n.id)!,
        durationHours: n.durationHours,
        isCritical: false,
        predecessorIds: predecessors.get(n.id) ?? [],
        successorIds: successors.get(n.id) ?? [],
        requiredResourceIds: (nodeResourceRequirements.get(n.id) ?? []).map((r) => r.resourceId),
      }));
    } else {
      const ES = new Map<string, number>();
      const EF = new Map<string, number>();
      for (const id of orderedNodeIds) {
        const node = nodeById.get(id)!;
        const duration = node.durationHours ?? 0;
        const preds = predecessors.get(id) ?? [];
        const es = preds.length === 0 ? 0 : Math.max(...preds.map((p) => EF.get(p)!));
        ES.set(id, es);
        EF.set(id, es + duration);
      }
      totalDurationHours = orderedNodeIds.length > 0 ? Math.max(...orderedNodeIds.map((id) => EF.get(id)!)) : 0;

      const LS = new Map<string, number>();
      const LF = new Map<string, number>();
      for (let i = orderedNodeIds.length - 1; i >= 0; i--) {
        const id = orderedNodeIds[i];
        const node = nodeById.get(id)!;
        const duration = node.durationHours ?? 0;
        const succs = successors.get(id) ?? [];
        const lf = succs.length === 0 ? totalDurationHours! : Math.min(...succs.map((s) => LS.get(s)!));
        LF.set(id, lf);
        LS.set(id, lf - duration);
      }

      const slack = new Map<string, number>();
      const isCriticalMap = new Map<string, boolean>();
      for (const id of orderedNodeIds) {
        const s = LS.get(id)! - ES.get(id)!;
        slack.set(id, s);
        isCriticalMap.set(id, Math.abs(s) < EPS);
      }

      const criticalTerminals = orderedNodeIds
        .filter((id) => isCriticalMap.get(id) && Math.abs(EF.get(id)! - totalDurationHours!) < EPS)
        .sort((a, b) => indexById.get(a)! - indexById.get(b)!);
      if (criticalTerminals.length > 0) {
        let current = criticalTerminals[0];
        const path: string[] = [current];
        for (;;) {
          const preds = (predecessors.get(current) ?? []).filter(
            (p) => isCriticalMap.get(p) && Math.abs(EF.get(p)! - ES.get(current)!) < EPS
          );
          if (preds.length === 0) break;
          const prev = preds[0];
          path.push(prev);
          current = prev;
        }
        criticalPathNodeIds = path.reverse();
      }

      // --- リソース競合 / 並列度(EOC-12/13) ---
      interface Interval {
        nodeId: string;
        es: number;
        ef: number;
        amount: number;
      }
      interface Segment {
        from: number;
        to: number;
        total: number;
        nodeIds: string[];
      }

      const sweep = (items: Interval[]): Segment[] => {
        if (items.length === 0) return [];
        const points = Array.from(new Set(items.flatMap((i) => [i.es, i.ef]))).sort((a, b) => a - b);
        const segments: Segment[] = [];
        for (let i = 0; i < points.length - 1; i++) {
          const from = points[i];
          const to = points[i + 1];
          if (to - from <= 0) continue;
          const active = items.filter((it) => it.es <= from && it.ef >= to);
          if (active.length === 0) continue;
          const total = active.reduce((n, it) => n + it.amount, 0);
          const nodeIds = active.map((it) => it.nodeId).sort((a, b) => indexById.get(a)! - indexById.get(b)!);
          segments.push({ from, to, total, nodeIds });
        }
        return segments;
      };

      const arraysEqual = (a: string[], b: string[]): boolean =>
        a.length === b.length && a.every((v, i) => v === b[i]);

      const mergeSegments = (segments: Segment[]): Segment[] => {
        const sorted = [...segments].sort((a, b) => a.from - b.from);
        const merged: Segment[] = [];
        for (const seg of sorted) {
          const last = merged[merged.length - 1];
          if (last && last.to === seg.from && last.total === seg.total && arraysEqual(last.nodeIds, seg.nodeIds)) {
            last.to = seg.to;
          } else {
            merged.push({ ...seg });
          }
        }
        return merged;
      };

      const allIntervals: Interval[] = nodes
        .filter((n) => EF.get(n.id)! - ES.get(n.id)! > 0)
        .map((n) => ({ nodeId: n.id, es: ES.get(n.id)!, ef: EF.get(n.id)!, amount: 1 }));

      const concurrencySegments = sweep(allIntervals);
      maxConcurrency = allIntervals.length > 0 ? Math.max(...concurrencySegments.map((s) => s.total), 0) : 0;

      if (spec.maxParallelism !== undefined) {
        const overParallel = mergeSegments(concurrencySegments.filter((s) => s.total > spec.maxParallelism!));
        for (const seg of overParallel) {
          findings.push({
            categoryId: "EOC-13",
            severity: "medium",
            target: planId,
            detail: `${seg.from}h〜${seg.to}hの区間で同時実行数(${seg.total})が並列度上限(${spec.maxParallelism})を超えている(該当ノード: ${seg.nodeIds.join(", ")})。`,
          });
        }
      }

      const perResource = new Map<string, Interval[]>();
      for (const n of nodes) {
        const es = ES.get(n.id)!;
        const ef = EF.get(n.id)!;
        if (ef - es <= 0) continue;
        for (const req of nodeResourceRequirements.get(n.id) ?? []) {
          const arr = perResource.get(req.resourceId) ?? [];
          arr.push({ nodeId: n.id, es, ef, amount: req.amount });
          perResource.set(req.resourceId, arr);
        }
      }

      for (const [resourceId, intervals] of perResource) {
        const resource = resourceById.get(resourceId)!;
        const capacity = resource.capacity ?? 1;
        const segments = sweep(intervals);
        const overCapacity = mergeSegments(segments.filter((s) => s.total > capacity));
        for (const seg of overCapacity) {
          resourceConflicts.push({
            resourceId,
            fromHours: seg.from,
            toHours: seg.to,
            requestedAmount: seg.total,
            capacity,
            nodeIds: seg.nodeIds,
          });
          findings.push({
            categoryId: "EOC-12",
            severity: "high",
            target: resourceId,
            detail: `リソース「${resourceId}」の${seg.from}h〜${seg.to}hの区間で要求量(${seg.total})が容量(${capacity})を超えている(該当ノード: ${seg.nodeIds.join(", ")})。`,
          });
        }
      }

      schedule = nodes.map((n) => ({
        nodeId: n.id,
        label: n.nameJa ?? n.id,
        order: orderedNodeIds.indexOf(n.id) + 1,
        wave: waveOf.get(n.id)!,
        durationHours: n.durationHours,
        earliestStartHours: ES.get(n.id),
        earliestFinishHours: EF.get(n.id),
        latestStartHours: LS.get(n.id),
        latestFinishHours: LF.get(n.id),
        slackHours: slack.get(n.id),
        isCritical: isCriticalMap.get(n.id) ?? false,
        predecessorIds: predecessors.get(n.id) ?? [],
        successorIds: successors.get(n.id) ?? [],
        requiredResourceIds: (nodeResourceRequirements.get(n.id) ?? []).map((r) => r.resourceId),
      }));
    }
  }

  // --- クリティカルパス・総所要時間の宣言照合(EOC-16/17) ---
  if (spec.claimedTotalDurationHours !== undefined) {
    if (totalDurationHours === undefined) {
      findings.push({
        categoryId: "EOC-17",
        severity: "high",
        target: planId,
        detail: `総所要時間の宣言値(${spec.claimedTotalDurationHours}h)は算出不能で裏付けられない。`,
      });
    } else if (scheduleBasis === "partial") {
      findings.push({
        categoryId: "EOC-17",
        severity: "high",
        target: planId,
        detail: `総所要時間の宣言値(${spec.claimedTotalDurationHours}h)は所要時間の一部未申告により下限値のみで裏付けられない。`,
      });
    } else if (Math.abs(spec.claimedTotalDurationHours - totalDurationHours) >= EPS) {
      findings.push({
        categoryId: "EOC-17",
        severity: "high",
        target: planId,
        detail: `総所要時間の宣言値(${spec.claimedTotalDurationHours}h)が算出値(${totalDurationHours}h)と一致しない。`,
      });
    }
  }

  if (spec.claimedCriticalPathNodeIds !== undefined) {
    const unavailableForClaim = isCyclic || scheduleBasis === "unavailable";
    if (unavailableForClaim) {
      findings.push({
        categoryId: "EOC-16",
        severity: "high",
        target: planId,
        detail: "クリティカルパスの宣言値は算出不能で裏付けられない。",
      });
    } else if (!arraysEqualExact(spec.claimedCriticalPathNodeIds, criticalPathNodeIds)) {
      findings.push({
        categoryId: "EOC-16",
        severity: "high",
        target: planId,
        detail: `クリティカルパスの宣言値(${spec.claimedCriticalPathNodeIds.join(" → ")})が算出値(${criticalPathNodeIds.join(" → ") || "(空)"})と一致しない。`,
      });
    }
  }

  // --- アーキテクチャ母集団との照合(EOC-18/19/25) ---
  let unplannedContainerIds: string[] = [];
  let coverage: ExecutionOrderCoverage;
  const hasStructuralIssue = findings.some((f) => f.categoryId === "EOC-01" || f.categoryId === "EOC-02");
  if (spec.architectureContainerIds === undefined) {
    coverage = {
      basis: "unavailable",
      denominator: 0,
      reason: "architectureContainerIds が未指定のため計画被覆率を算出していない。",
      claimMismatch: false,
    };
  } else if (spec.architectureContainerIds.length === 0) {
    coverage = {
      basis: "unavailable",
      denominator: 0,
      reason: "architectureContainerIds が0件のため計画被覆率を算出できない。",
      claimMismatch: false,
    };
  } else if (hasStructuralIssue) {
    coverage = {
      basis: "unavailable",
      denominator: spec.architectureContainerIds.length,
      reason: "ノードID重複または依存先母集団外参照(EOC-01/EOC-02)があり、母集団が確定しないため算出不能。",
      claimMismatch: false,
    };
  } else {
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const denominator = spec.architectureContainerIds.length;
    unplannedContainerIds = spec.architectureContainerIds.filter((id) => !nodeIdSet.has(id));
    const numerator = denominator - unplannedContainerIds.length;
    const percent = Math.round((numerator / denominator) * 1000) / 10;
    coverage = { basis: "computed", denominator, numerator, percent, claimMismatch: false };
    for (const id of unplannedContainerIds) {
      findings.push({
        categoryId: "EOC-18",
        severity: "high",
        target: id,
        detail: `アーキテクチャ母集団のコンテナ「${id}」が実行計画(nodes)に含まれていない。`,
      });
    }
    const archSet = new Set(spec.architectureContainerIds);
    for (const n of nodes) {
      if (!archSet.has(n.id)) {
        findings.push({
          categoryId: "EOC-19",
          severity: "medium",
          target: n.id,
          detail: `ノード「${n.id}」がアーキテクチャ母集団(architectureContainerIds)に含まれていない。`,
        });
      }
    }
  }
  if (spec.claimedPlannedContainerCoveragePercent !== undefined) {
    coverage.claimedPercent = spec.claimedPlannedContainerCoveragePercent;
    if (coverage.basis === "unavailable") {
      coverage.claimMismatch = true;
      findings.push({
        categoryId: "EOC-25",
        severity: "high",
        target: planId,
        detail: `計画被覆率の宣言値(${spec.claimedPlannedContainerCoveragePercent}%)は算出不能で裏付けられない。`,
      });
    } else if (coverage.percent !== spec.claimedPlannedContainerCoveragePercent) {
      coverage.claimMismatch = true;
      findings.push({
        categoryId: "EOC-25",
        severity: "high",
        target: planId,
        detail: `計画被覆率の宣言値(${spec.claimedPlannedContainerCoveragePercent}%)が算出値(${coverage.percent}%)と一致しない。`,
      });
    }
  }

  // --- SLO・合格基準(EOC-20/21) ---
  const slos = spec.slos ?? [];
  const sloIdSet = new Set(slos.map((s) => s.id));
  const referencedSloIds = new Set<string>();
  for (const ec of spec.exitCriteria ?? []) {
    const hasSloRef = (ec.sloIds ?? []).length > 0;
    const hasNumeric = /\d/.test(ec.statement);
    if (!hasSloRef && !hasNumeric) {
      findings.push({
        categoryId: "EOC-20",
        severity: "high",
        target: ec.id,
        detail: `合格基準「${ec.id}」がSLO参照も数値も持たず、測定可能な基準になっていない。`,
      });
    }
    for (const sid of ec.sloIds ?? []) {
      if (!sloIdSet.has(sid)) {
        findings.push({
          categoryId: "EOC-21",
          severity: "high",
          target: ec.id,
          detail: `合格基準「${ec.id}」が存在しないSLO「${sid}」を参照している。`,
        });
      } else {
        referencedSloIds.add(sid);
      }
    }
  }
  for (const s of slos) {
    if (!referencedSloIds.has(s.id)) {
      findings.push({
        categoryId: "EOC-21",
        severity: "high",
        target: s.id,
        detail: `SLO「${s.id}」がどの合格基準(exitCriteria)からも参照されていない。`,
      });
    }
  }

  // --- モニタリング計画(EOC-22/23/24) ---
  const checkpoints = spec.monitoringCheckpoints ?? [];
  if (checkpoints.length === 0) {
    findings.push({
      categoryId: "EOC-22",
      severity: "medium",
      target: planId,
      detail: "モニタリング計画(monitoringCheckpoints)が宣言されていない。",
    });
  } else {
    const nodeIdSet = new Set(nodes.map((n) => n.id));
    for (const cp of checkpoints) {
      if (cp.atHour !== undefined) {
        const overUpper = totalDurationHours !== undefined && cp.atHour > totalDurationHours;
        if (cp.atHour < 0 || overUpper) {
          findings.push({
            categoryId: "EOC-23",
            severity: "high",
            target: cp.id,
            detail: `チェックポイント「${cp.id}」のatHour(${cp.atHour})が実行計画の範囲外である。`,
          });
        }
      }
      for (const nid of cp.afterNodeIds ?? []) {
        if (!nodeIdSet.has(nid)) {
          findings.push({
            categoryId: "EOC-23",
            severity: "high",
            target: cp.id,
            detail: `チェックポイント「${cp.id}」のafterNodeIds(${nid})が母集団に存在しない。`,
          });
        }
      }
      const hasSlo = (cp.sloIds ?? []).length > 0;
      const hasExit = (cp.exitCriterionIds ?? []).length > 0;
      if (!hasSlo && !hasExit) {
        findings.push({
          categoryId: "EOC-24",
          severity: "medium",
          target: cp.id,
          detail: `チェックポイント「${cp.id}」がSLO・合格基準のいずれにも接続していない。`,
        });
      }
    }
  }

  return {
    planId,
    generated: !isCyclic,
    skipReason: isCyclic
      ? `循環依存が検出されたため実行順序・スケジュールを算出できない(残余ノード: ${cycleNodeIds.join(", ")})`
      : undefined,
    orderedNodeIds: isCyclic ? [] : orderedNodeIds,
    waves,
    schedule,
    cycleNodeIds,
    representativeCycle,
    criticalPathNodeIds,
    totalDurationHours,
    scheduleBasis,
    undeclaredDependencyNodeIds,
    isolatedNodeIds,
    resourceConflicts,
    maxConcurrency,
    unplannedContainerIds,
    coverage,
    findings,
  };
}

// --- Markdown 出力 ---

export function renderExecutionOrder(spec: ExecutionOrderSpec): string {
  const planId = spec.planId ?? DEFAULT_EXECUTION_PLAN_ID;
  const result = computeExecutionOrder(spec);
  const resources = spec.resources ?? [];

  const lines: string[] = [];
  lines.push("# テスト実行順序・依存関係分析結果");
  lines.push("");

  const skipLine = (reason: string): void => {
    lines.push(`- 未算出(理由: ${escapeCell(reason)})`);
    lines.push("");
  };

  const isOverflow = result.findings.some((f) => f.categoryId === "EOC-26");
  const isCyclic = result.cycleNodeIds.length > 0;

  // 1. 対象と前提
  lines.push("## 1. 対象と前提");
  lines.push("");
  lines.push(`- planId: ${escapeCell(planId)}`);
  if (spec.title) lines.push(`- 対象: ${escapeCell(spec.title)}`);
  lines.push(`- ノード数: ${spec.nodes.length}`);
  lines.push(`- リソース数: ${resources.length}`);
  lines.push(`- 並列度上限(maxParallelism): ${spec.maxParallelism !== undefined ? spec.maxParallelism : "未指定"}`);
  lines.push(`- スケジュール算出根拠(scheduleBasis): ${result.scheduleBasis}`);
  lines.push("");

  if (isOverflow) {
    for (const heading of [
      "## 2. 実行順序（トポロジカルソート）",
      "## 3. 並列実行グループ（wave）",
      "## 4. クリティカルパスと総所要時間",
      "## 5. 各ノードのスケジュールとスラック",
      "## 6. リソースと競合",
      "## 7. 依存関係が未定義のコンテナ",
      "## 8. 合格基準・SLO・モニタリング計画",
      "## 9. アーキテクチャ母集団との照合",
    ]) {
      lines.push(heading);
      lines.push("");
      skipLine(result.skipReason ?? "");
    }
  } else {
    // 2. 実行順序（トポロジカルソート）
    lines.push("## 2. 実行順序（トポロジカルソート）");
    lines.push("");
    if (isCyclic) {
      skipLine("循環依存により実行順序を算出できない");
    } else {
      lines.push("| 実行順 | ノードID | 名称 | wave | 先行 | 後続 |");
      lines.push("| --- | --- | --- | --- | --- | --- |");
      for (const row of result.schedule) {
        lines.push(
          `| ${row.order} | ${escapeCell(row.nodeId)} | ${escapeCell(row.label)} | ${row.wave} | ${escapeCell(
            row.predecessorIds.join(", ") || "-"
          )} | ${escapeCell(row.successorIds.join(", ") || "-")} |`
        );
      }
      lines.push("");
    }

    // 3. 並列実行グループ（wave）
    lines.push("## 3. 並列実行グループ（wave）");
    lines.push("");
    if (isCyclic) {
      skipLine("循環依存により並列実行グループを算出できない");
    } else {
      lines.push("| wave | ノードID | 件数 |");
      lines.push("| --- | --- | --- |");
      result.waves.forEach((w, i) => {
        lines.push(`| ${i} | ${escapeCell(w.join(", "))} | ${w.length} |`);
      });
      lines.push("");
    }

    // 4. クリティカルパスと総所要時間
    lines.push("## 4. クリティカルパスと総所要時間");
    lines.push("");
    if (isCyclic) {
      lines.push(`- 代表閉路: ${escapeCell(result.representativeCycle.join(" → "))}`);
      skipLine("循環依存によりクリティカルパス・総所要時間を算出できない");
    } else if (result.scheduleBasis === "unavailable") {
      skipLine("durationHoursの申告が1件も無いためクリティカルパス・総所要時間を算出できない");
    } else {
      lines.push(`- クリティカルパス: ${escapeCell(result.criticalPathNodeIds.join(" → ") || "(なし)")}`);
      lines.push(
        `- 総所要時間: ${result.totalDurationHours}h${result.scheduleBasis === "partial" ? "(申告済み分のみでの下限値)" : ""}`
      );
      if (spec.claimedCriticalPathNodeIds !== undefined) {
        const match = arraysEqualExact(spec.claimedCriticalPathNodeIds, result.criticalPathNodeIds);
        lines.push(`- クリティカルパス宣言値との照合: ${match ? "一致" : "不一致"}`);
      }
      if (spec.claimedTotalDurationHours !== undefined) {
        const mismatch =
          result.scheduleBasis === "partial" ||
          Math.abs(spec.claimedTotalDurationHours - (result.totalDurationHours ?? 0)) >= EPS;
        lines.push(`- 総所要時間宣言値(${spec.claimedTotalDurationHours}h)との照合: ${mismatch ? "不一致" : "一致"}`);
      }
    }
    lines.push("");

    // 5. 各ノードのスケジュールとスラック
    lines.push("## 5. 各ノードのスケジュールとスラック");
    lines.push("");
    if (isCyclic) {
      skipLine("循環依存によりスケジュールを算出できない");
    } else {
      lines.push("| ノードID | 所要 | ES | EF | LS | LF | スラック | クリティカル |");
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const row of result.schedule) {
        lines.push(
          `| ${escapeCell(row.nodeId)} | ${fmtNum(row.durationHours)} | ${fmtNum(row.earliestStartHours)} | ${fmtNum(
            row.earliestFinishHours
          )} | ${fmtNum(row.latestStartHours)} | ${fmtNum(row.latestFinishHours)} | ${fmtNum(
            row.slackHours
          )} | ${row.isCritical ? "○" : ""} |`
        );
      }
      lines.push("");
    }

    // 6. リソースと競合
    lines.push("## 6. リソースと競合");
    lines.push("");
    if (resources.length === 0) {
      lines.push("- 宣言なし");
    } else {
      lines.push("| リソースID | 名称 | 種別 | 容量 |");
      lines.push("| --- | --- | --- | --- |");
      for (const r of resources) {
        lines.push(`| ${escapeCell(r.id)} | ${escapeCell(r.nameJa)} | ${escapeCell(r.kind)} | ${r.capacity ?? 1} |`);
      }
    }
    lines.push("");
    lines.push("### 6.1 リソース競合");
    lines.push("");
    if (isCyclic || result.scheduleBasis === "unavailable") {
      skipLine("スケジュール未算出のためリソース競合を判定できない");
    } else if (result.resourceConflicts.length === 0) {
      lines.push("- 対象なし");
      lines.push("");
    } else {
      lines.push("| リソースID | 開始(h) | 終了(h) | 要求量 | 容量 | ノードID |");
      lines.push("| --- | --- | --- | --- | --- | --- |");
      for (const c of result.resourceConflicts) {
        lines.push(
          `| ${escapeCell(c.resourceId)} | ${c.fromHours} | ${c.toHours} | ${c.requestedAmount} | ${c.capacity} | ${escapeCell(
            c.nodeIds.join(", ")
          )} |`
        );
      }
      lines.push("");
    }

    // 7. 依存関係が未定義のコンテナ
    lines.push("## 7. 依存関係が未定義のコンテナ");
    lines.push("");
    if (result.undeclaredDependencyNodeIds.length === 0) {
      lines.push("- 対象なし");
    } else {
      for (const id of result.undeclaredDependencyNodeIds) {
        lines.push(`- ${escapeCell(id)}`);
      }
    }
    lines.push("");

    // 8. 合格基準・SLO・モニタリング計画
    lines.push("## 8. 合格基準・SLO・モニタリング計画");
    lines.push("");
    const slos = spec.slos ?? [];
    lines.push("**SLO:**");
    lines.push("");
    if (slos.length === 0) {
      lines.push("- 宣言なし");
    } else {
      lines.push("| ID | 指標 | 比較 | 閾値 | 単位 |");
      lines.push("| --- | --- | --- | --- | --- |");
      for (const s of slos) {
        lines.push(`| ${escapeCell(s.id)} | ${escapeCell(s.metric)} | ${escapeCell(s.comparator)} | ${s.threshold} | ${escapeCell(s.unit)} |`);
      }
    }
    lines.push("");
    lines.push("**合格基準:**");
    lines.push("");
    const exitCriteria = spec.exitCriteria ?? [];
    if (exitCriteria.length === 0) {
      lines.push("- 宣言なし");
    } else {
      lines.push("| ID | 内容 | 参照SLO |");
      lines.push("| --- | --- | --- |");
      for (const ec of exitCriteria) {
        lines.push(`| ${escapeCell(ec.id)} | ${escapeCell(ec.statement)} | ${escapeCell((ec.sloIds ?? []).join(", ") || "-")} |`);
      }
    }
    lines.push("");
    lines.push("**モニタリングチェックポイント:**");
    lines.push("");
    const checkpoints = spec.monitoringCheckpoints ?? [];
    if (checkpoints.length === 0) {
      lines.push("- 宣言なし");
    } else {
      lines.push("| ID | 名称 | 時点(h) | 参照ノード | 確認項目 | 参照SLO | 参照合格基準 | 参加者 |");
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const cp of checkpoints) {
        lines.push(
          `| ${escapeCell(cp.id)} | ${escapeCell(cp.nameJa)} | ${cp.atHour ?? "-"} | ${escapeCell(
            (cp.afterNodeIds ?? []).join(", ") || "-"
          )} | ${escapeCell(cp.reviewItems.join(", "))} | ${escapeCell((cp.sloIds ?? []).join(", ") || "-")} | ${escapeCell(
            (cp.exitCriterionIds ?? []).join(", ") || "-"
          )} | ${escapeCell((cp.participants ?? []).join(", ") || "-")} |`
        );
      }
    }
    lines.push("");

    // 9. アーキテクチャ母集団との照合
    lines.push("## 9. アーキテクチャ母集団との照合");
    lines.push("");
    if (result.unplannedContainerIds.length === 0) {
      lines.push("- 未計画コンテナ: 対象なし");
    } else {
      lines.push("**未計画コンテナ:**");
      lines.push("");
      for (const id of result.unplannedContainerIds) {
        lines.push(`- ${escapeCell(id)}`);
      }
    }
    lines.push("");
    if (result.coverage.basis === "unavailable") {
      lines.push(`- 計画被覆率: 未算出(理由: ${escapeCell(result.coverage.reason ?? "")})`);
    } else {
      lines.push(
        `- 計画被覆率: 分母 ${result.coverage.denominator} / 分子 ${result.coverage.numerator} / ${result.coverage.percent}%`
      );
    }
    if (result.coverage.claimedPercent !== undefined) {
      lines.push(`- 宣言値(${result.coverage.claimedPercent}%)との照合: ${result.coverage.claimMismatch ? "不一致" : "一致"}`);
    }
    lines.push("");
  }

  // 10. 決定的検査
  lines.push("## 10. 決定的検査");
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("- 指摘なし");
    lines.push("");
  } else {
    const sorted = [...result.findings].sort((a, b) => a.categoryId.localeCompare(b.categoryId));
    let i = 0;
    while (i < sorted.length) {
      const catId = sorted[i].categoryId;
      let j = i;
      while (j < sorted.length && sorted[j].categoryId === catId) j++;
      const group = sorted.slice(i, j);
      const shown = group.slice(0, FINDING_RENDER_LIMIT);
      for (const f of shown) {
        lines.push(`- [${f.severity}] ${f.categoryId} ${escapeCell(f.target)}: ${escapeCell(f.detail)}`);
      }
      if (group.length > FINDING_RENDER_LIMIT) {
        lines.push(`- 他 ${group.length - FINDING_RENDER_LIMIT} 件（表示を ${FINDING_RENDER_LIMIT} 件に丸めた）`);
      }
      i = j;
    }
    lines.push("");
  }

  // 11. 判定区分と対処指針(カタログ)
  lines.push("## 11. 判定区分と対処指針(カタログ)");
  lines.push("");
  lines.push("| ID | 名称 | 重大度 | 定義 | 対処指針 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const c of executionOrderAnalysisCriteria.categories) {
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.nameJa)} | ${escapeCell(c.severity)} | ${escapeCell(c.definition)} | ${escapeCell(
        c.recommendedAction
      )} |`
    );
  }
  lines.push("");
  for (const note of executionOrderAnalysisCriteria.notes) {
    lines.push(`- ${escapeCell(note)}`);
  }
  lines.push("");

  // 12. サマリ
  lines.push("## 12. サマリ");
  lines.push("");
  if (!result.generated) {
    skipLine(result.skipReason ?? "");
  } else {
    lines.push(
      `ノード数 ${spec.nodes.length} / 循環依存 ${isCyclic ? "あり" : "なし"} / ` +
        `総所要時間 ${result.totalDurationHours !== undefined ? `${result.totalDurationHours}h` : "未算出"} / ` +
        `リソース競合 ${result.resourceConflicts.length}件 / 指摘件数 ${result.findings.length}`
    );
  }
  lines.push("");

  // 13. 再検討指示(意味的層)
  lines.push("## 13. 再検討指示(意味的層)");
  lines.push("");
  const guidanceByCategory: Record<string, string> = {
    "EOC-04": "循環している依存の一部を解消し、実行順序が一意に決まる有向非巡回グラフになるよう見直すこと。",
    "EOC-05": "依存が無いなら空配列で明示し、あるなら dependsOn に宣言すること。",
    "EOC-07": "依存の根拠(成果物・リソース・データ項目)が実在するIDを指すよう見直すこと。",
    "EOC-12": "リソース競合区間の実行順序をずらすか、リソースの容量・割当を見直すこと。",
    "EOC-18": "未計画のコンテナを実行計画に追加するか、対象外とする理由を明記すること。",
    "EOC-20": "測定可能な数値基準を明記するか、対応するSLOを参照すること。",
    "EOC-22": "テスト実施期間中のレビュー・進捗確認のタイミングをモニタリング計画として明記すること。",
  };
  const presentCategoryIds = [...new Set(result.findings.map((f) => f.categoryId))].sort();
  const guidanceLines = presentCategoryIds
    .filter((id) => guidanceByCategory[id] !== undefined)
    .map((id) => `- ${id}: ${guidanceByCategory[id]}`);
  if (guidanceLines.length === 0) {
    lines.push("- 追加の対応指示なし。実行順序・依存関係に変更が生じた場合は本ツールを再実行すること。");
  } else {
    for (const line of guidanceLines) lines.push(line);
  }

  return lines.join("\n").trimEnd() + "\n";
}

// --- MCP 登録 ---

const executionDependencyBasisKindEnum = z.enum(["artifact", "resource", "data", "other"]);
const executionResourceKindEnum = z.enum(["device", "environment", "person", "other"]);
const testContainerPriorityClassEnum = z.enum(["must", "conditional", "optional"]);

export const analyzeExecutionOrderInputShape = {
  planId: z.string().optional().describe(`Plan id used in headings and summary (default ${DEFAULT_EXECUTION_PLAN_ID})`),
  title: z.string().optional(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        nameJa: z.string().optional(),
        kind: z.enum(["container", "suite", "case"]).optional(),
        durationHours: z.number().nonnegative().optional(),
        dependsOn: z
          .array(
            z.object({
              fromId: z.string(),
              basisKind: executionDependencyBasisKindEnum.optional(),
              basisRef: z.string().optional(),
              reason: z.string().optional(),
            })
          )
          .optional()
          .describe("Predecessor edges; omit entirely to flag EOC-05, pass [] to declare no dependency"),
        requiredResources: z
          .array(
            z.object({
              resourceId: z.string(),
              amount: z.number().int().positive().optional(),
            })
          )
          .optional(),
        producedArtifactIds: z.array(z.string()).optional(),
        priorityClass: testContainerPriorityClassEnum.optional(),
        note: z.string().optional(),
      })
    )
    .min(1)
    .describe("Population of execution nodes (test containers / suites / cases) to order"),
  resources: z
    .array(
      z.object({
        id: z.string(),
        nameJa: z.string(),
        kind: executionResourceKindEnum,
        capacity: z.number().int().positive().optional(),
        note: z.string().optional(),
      })
    )
    .optional(),
  dataItemIds: z.array(z.string()).optional(),
  architectureContainerIds: z
    .array(z.string())
    .optional()
    .describe("design_test_architecture container population, used to check plan coverage"),
  slos: z
    .array(
      z.object({
        id: z.string(),
        metric: z.string(),
        comparator: z.enum(["<=", ">=", "==", "<", ">"]),
        threshold: z.number(),
        unit: z.string(),
        source: z.string().optional(),
      })
    )
    .optional(),
  exitCriteria: z
    .array(
      z.object({
        id: z.string(),
        statement: z.string(),
        sloIds: z.array(z.string()).optional(),
      })
    )
    .optional(),
  monitoringCheckpoints: z
    .array(
      z.object({
        id: z.string(),
        nameJa: z.string(),
        atHour: z.number().optional(),
        afterNodeIds: z.array(z.string()).optional(),
        reviewItems: z.array(z.string()),
        sloIds: z.array(z.string()).optional(),
        exitCriterionIds: z.array(z.string()).optional(),
        participants: z.array(z.string()).optional(),
      })
    )
    .optional(),
  maxParallelism: z.number().int().positive().optional(),
  claimedCriticalPathNodeIds: z.array(z.string()).optional(),
  claimedTotalDurationHours: z.number().nonnegative().optional(),
  claimedPlannedContainerCoveragePercent: z.number().min(0).max(100).optional(),
  maxNodes: z.number().int().positive().optional().describe(`Population size cap (default ${DEFAULT_MAX_EXECUTION_NODES})`),
} as const;

const analyzeExecutionOrderInputSchema = z.object(analyzeExecutionOrderInputShape);
export type AnalyzeExecutionOrderInput = z.infer<typeof analyzeExecutionOrderInputSchema>;

export function registerAnalyzeExecutionOrderTool(server: McpServer): void {
  server.registerTool(
    "analyze_execution_order",
    {
      title: "Analyze Execution Order",
      description:
        "テストコンテナ(またはスイート／ケース)の依存関係・所要時間・必要リソースから、実行順序・依存関係・クリティカルパス・" +
        "リソース競合・実行中モニタリング計画を決定的に検査してMarkdownで返す。トポロジカルソートによる実行順序の確定、" +
        "循環依存の検出と代表閉路の提示、CPMによるクリティカルパス・総所要時間の算出、最早開始スケジュール上のリソース競合・" +
        "並列度上限超過の検出、依存関係が未宣言のノードの全件列挙、品質目標(SLO)・合格基準・モニタリングチェックポイントの" +
        "測定可能性の点検、design_test_architecture のコンテナ母集団との計画被覆率の照合を行う。テストコンテナへの分割・" +
        "責務定義は design_test_architecture の担当で本ツールは対象外。判定区分と対処指針は " +
        "testdesign://execution-order/analysis-criteria を参照する。",
      inputSchema: analyzeExecutionOrderInputShape,
    },
    async (input) => {
      const text = renderExecutionOrder(input as unknown as ExecutionOrderSpec);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
