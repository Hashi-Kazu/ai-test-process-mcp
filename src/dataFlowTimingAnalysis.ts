import type {
  DataFlowClaimedSkewInput,
  DataFlowCommunicationInput,
  DataFlowCoverage,
  DataFlowDelayWindowRow,
  DataFlowEdgeLatency,
  DataFlowHandoverRow,
  DataFlowPathResult,
  DataFlowSkewWindowRow,
  DataFlowTimingFinding,
  DataFlowTimingResult,
  DataFlowTimingSpec,
} from "./types.js";

// analyze_data_flow_timing 固有の決定的エンジン。
// 純関数群で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。

export const DEFAULT_MAX_DATA_FLOW_COMMUNICATIONS = 300;
export const DEFAULT_MAX_DATA_FLOW_PATHS_PER_PAIR = 1000;

/** 周期で送るタイミング種別（送信待ちが最悪 intervalSeconds 発生する）。 */
const PERIODIC_KINDS = new Set(["periodic", "batch", "on-demand"]);

const EPS = 1e-9;

/** 秒の演算結果を丸める（浮動小数の桁揺れで宣言照合が不安定になるのを防ぐ）。 */
export function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 遅延窓ID。呼び出し側での文字列連結の再実装を防ぐため export する。 */
export function delayWindowId(dataItemId: string, originId: string, terminalId: string): string {
  return `DFW:${dataItemId}:${originId}:${terminalId}`;
}

/** 乖離窓ID。呼び出し側での文字列連結の再実装を防ぐため export する。 */
export function skewWindowId(dataItemId: string, originId: string): string {
  return `DSW:${dataItemId}:${originId}`;
}

/**
 * 通信1本あたりの最大／最小遅延。
 * 最大 = 送信待ち(周期系は intervalSeconds、event は 0) + 伝送時間 + タイムアウト×再送回数
 * 最小 = 伝送時間
 * タイミングが確定しない通信は computed:false とし、0秒で代替しない。
 */
export function computeEdgeLatency(comm: DataFlowCommunicationInput): DataFlowEdgeLatency {
  const kind = comm.timing?.kind;
  if (kind === undefined || kind === "undefined") {
    return {
      communicationId: comm.id,
      computed: false,
      reason: "timing.kind が undefined(タイミング未定義)である",
    };
  }
  if (PERIODIC_KINDS.has(kind) && comm.timing.intervalSeconds === undefined) {
    return {
      communicationId: comm.id,
      computed: false,
      reason: `timing.kind が ${kind} なのに intervalSeconds が未指定である`,
    };
  }
  if (kind === "event" && (comm.timing.trigger === undefined || comm.timing.trigger.trim() === "")) {
    return {
      communicationId: comm.id,
      computed: false,
      reason: "timing.kind が event なのに trigger が未記入である",
    };
  }
  const waitMax = PERIODIC_KINDS.has(kind) ? (comm.timing.intervalSeconds ?? 0) : 0;
  const transmission = comm.transmissionLatencySeconds ?? 0;
  const retryPenalty = (comm.timeoutSeconds ?? 0) * (comm.retry?.maxCount ?? 0);
  return {
    communicationId: comm.id,
    computed: true,
    maxSeconds: roundSeconds(waitMax + transmission + retryPenalty),
    minSeconds: roundSeconds(transmission),
  };
}

interface Edge {
  comm: DataFlowCommunicationInput;
  fromId: string;
  toId: string;
  latency: DataFlowEdgeLatency;
}

interface PathRecord extends DataFlowPathResult {
  sortKey: string;
}

/** 起点から単純パスを全列挙する。列挙順は communications の入力順に従う。 */
function enumerateSimplePaths(
  originId: string,
  outEdges: Map<string, Edge[]>,
  maxPaths: number
): { paths: PathRecord[]; truncated: boolean } {
  const paths: PathRecord[] = [];
  const visited = new Set<string>([originId]);
  const stack: Edge[] = [];
  let truncated = false;

  const walk = (node: string): void => {
    if (truncated) return;
    for (const edge of outEdges.get(node) ?? []) {
      if (truncated) return;
      if (visited.has(edge.toId)) continue;
      if (paths.length >= maxPaths) {
        truncated = true;
        return;
      }
      stack.push(edge);
      visited.add(edge.toId);

      const communicationIds = stack.map((e) => e.comm.id);
      const undefinedCommunicationIds = stack.filter((e) => !e.latency.computed).map((e) => e.comm.id);
      const computed = undefinedCommunicationIds.length === 0;
      paths.push({
        terminalId: edge.toId,
        communicationIds,
        componentIds: [originId, ...stack.map((e) => e.toId)],
        computed,
        maxSeconds: computed ? roundSeconds(stack.reduce((n, e) => n + (e.latency.maxSeconds ?? 0), 0)) : undefined,
        minSeconds: computed ? roundSeconds(stack.reduce((n, e) => n + (e.latency.minSeconds ?? 0), 0)) : undefined,
        undefinedCommunicationIds,
        sortKey: communicationIds.join(">"),
      });

      walk(edge.toId);

      stack.pop();
      visited.delete(edge.toId);
    }
  };

  walk(originId);
  paths.sort((a, b) => cmp(a.terminalId, b.terminalId) || cmp(a.sortKey, b.sortKey));
  return { paths, truncated };
}

export function computeDataFlowTiming(spec: DataFlowTimingSpec): DataFlowTimingResult {
  const findings: DataFlowTimingFinding[] = [];
  const components = spec.components;
  const dataItems = spec.dataItems;
  const communications = spec.communications;
  const maxCommunications = spec.maxCommunications ?? DEFAULT_MAX_DATA_FLOW_COMMUNICATIONS;
  const maxPathsPerPair = spec.maxPathsPerPair ?? DEFAULT_MAX_DATA_FLOW_PATHS_PER_PAIR;

  // --- DFT-01: ID重複 ---
  const reportDuplicates = (ids: string[], label: string): void => {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, count] of counts) {
      if (count > 1) {
        findings.push({
          categoryId: "DFT-01",
          severity: "high",
          target: id,
          detail: `${label}のID「${id}」が${count}件重複して宣言されている。`,
        });
      }
    }
  };
  reportDuplicates(components.map((c) => c.id), "構成要素");
  reportDuplicates(dataItems.map((d) => d.id), "データ項目");
  reportDuplicates(communications.map((c) => c.id), "通信");

  const componentById = new Map(components.map((c) => [c.id, c]));
  const dataItemById = new Map(dataItems.map((d) => [d.id, d]));
  const componentIndex = new Map(components.map((c, i) => [c.id, i]));
  const nameOf = (id: string): string => componentById.get(id)?.nameJa ?? id;
  const dataNameOf = (id: string): string => dataItemById.get(id)?.nameJa ?? id;

  // --- 通信の入力検査(DFT-02/03/04/05/06/14/16)と辺の構築 ---
  const edgeLatencies: DataFlowEdgeLatency[] = [];
  const validEdges: Edge[] = [];
  const carriedDataItemIds = new Set<string>();
  const touchedComponentIds = new Set<string>();

  for (const comm of communications) {
    const latency = computeEdgeLatency(comm);
    edgeLatencies.push(latency);

    if (!latency.computed) {
      findings.push({
        categoryId: "DFT-04",
        severity: "high",
        target: comm.id,
        detail: `通信「${comm.id}」(${comm.fromId} → ${comm.toId})のタイミングが確定しない: ${latency.reason}。latency 不定として扱い、0秒で代替しない。`,
      });
    }

    if (comm.ackKind === undefined || comm.ackKind === "undeclared") {
      findings.push({
        categoryId: "DFT-05",
        severity: "medium",
        target: comm.id,
        detail: `通信「${comm.id}」(${comm.fromId} → ${comm.toId})にACK・応答(ackKind)が定義されていない。`,
      });
    } else if (
      (comm.ackKind === "application-ack" || comm.ackKind === "transport-ack") &&
      comm.timeoutSeconds === undefined
    ) {
      findings.push({
        categoryId: "DFT-06",
        severity: "medium",
        target: comm.id,
        detail: `通信「${comm.id}」は ackKind:${comm.ackKind} だがタイムアウト値(timeoutSeconds)が宣言されていない。`,
      });
    }

    if (comm.sourceRef === undefined) {
      findings.push({
        categoryId: "DFT-16",
        severity: "medium",
        target: comm.id,
        detail: `通信「${comm.id}」にテストベース上の根拠位置(sourceRef)が指定されていない。`,
      });
    }

    let endpointsValid = true;
    if (!componentById.has(comm.fromId)) {
      endpointsValid = false;
      findings.push({
        categoryId: "DFT-02",
        severity: "high",
        target: comm.id,
        detail: `通信「${comm.id}」の送信元「${comm.fromId}」が構成要素の母集団に存在しない。`,
      });
    }
    if (!componentById.has(comm.toId)) {
      endpointsValid = false;
      findings.push({
        categoryId: "DFT-02",
        severity: "high",
        target: comm.id,
        detail: `通信「${comm.id}」の宛先「${comm.toId}」が構成要素の母集団に存在しない。`,
      });
    }
    const validDataItemIds: string[] = [];
    for (const did of comm.dataItemIds ?? []) {
      if (!dataItemById.has(did)) {
        findings.push({
          categoryId: "DFT-02",
          severity: "high",
          target: comm.id,
          detail: `通信「${comm.id}」が運ぶデータ項目「${did}」がデータ項目の母集団に存在しない。`,
        });
        continue;
      }
      if (!validDataItemIds.includes(did)) validDataItemIds.push(did);
    }
    if (validDataItemIds.length === 0) {
      findings.push({
        categoryId: "DFT-14",
        severity: "medium",
        target: comm.id,
        detail: `通信「${comm.id}」はどのデータ項目も運んでいない(有効な dataItemIds が0件)。`,
      });
    }
    for (const did of validDataItemIds) carriedDataItemIds.add(did);

    if (comm.fromId === comm.toId) {
      findings.push({
        categoryId: "DFT-03",
        severity: "high",
        target: comm.id,
        detail: `通信「${comm.id}」の送信元と宛先が同一(${comm.fromId})である。`,
      });
      continue;
    }
    if (!endpointsValid) continue;

    touchedComponentIds.add(comm.fromId);
    touchedComponentIds.add(comm.toId);
    validEdges.push({ comm: { ...comm, dataItemIds: validDataItemIds }, fromId: comm.fromId, toId: comm.toId, latency });
  }

  // --- DFT-13: どの通信からも運ばれないデータ項目 ---
  const uncarriedDataItemIds: string[] = [];
  for (const d of dataItems) {
    if (!carriedDataItemIds.has(d.id)) {
      uncarriedDataItemIds.push(d.id);
      findings.push({
        categoryId: "DFT-13",
        severity: "medium",
        target: d.id,
        detail: `データ項目「${d.id}」(${d.nameJa})はどの通信からも運ばれていない。`,
      });
    }
  }

  // --- DFT-15: 孤立した構成要素 ---
  const isolatedComponentIds: string[] = [];
  for (const c of components) {
    if (!touchedComponentIds.has(c.id)) {
      isolatedComponentIds.push(c.id);
      findings.push({
        categoryId: "DFT-15",
        severity: "info",
        target: c.id,
        detail: `構成要素「${c.id}」(${c.nameJa})は送信も受信もしていない。`,
      });
    }
  }

  // --- DFT-17: 同一データ項目を運ぶ周期系通信の周期不揃い ---
  for (const d of dataItems) {
    const intervals = new Map<number, string[]>();
    for (const e of validEdges) {
      if (!e.comm.dataItemIds.includes(d.id)) continue;
      if (!PERIODIC_KINDS.has(e.comm.timing.kind)) continue;
      const interval = e.comm.timing.intervalSeconds;
      if (interval === undefined) continue;
      const arr = intervals.get(interval) ?? [];
      arr.push(e.comm.id);
      intervals.set(interval, arr);
    }
    if (intervals.size >= 2) {
      const detail = [...intervals.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([sec, ids]) => `${sec}秒(${ids.join(", ")})`)
        .join(" / ");
      findings.push({
        categoryId: "DFT-17",
        severity: "medium",
        target: d.id,
        detail: `データ項目「${d.id}」(${d.nameJa})を運ぶ周期系通信の周期が揃っていない: ${detail}。乖離の原因候補である。`,
      });
    }
  }

  const emptyCoverage = (reason: string): DataFlowCoverage => ({
    basis: "unavailable",
    denominator: 0,
    reason,
    claimMismatch: false,
  });

  // --- DFT-19: 通信件数の上限超過（算出を打ち切る） ---
  if (communications.length > maxCommunications) {
    const detail = `通信件数(${communications.length}件)が上限 ${maxCommunications} 件を超えるため、伝播遅延・乖離時間の算出を打ち切った。`;
    findings.push({ categoryId: "DFT-19", severity: "info", target: "communications", detail });
    return {
      generated: false,
      skipReason: detail,
      edgeLatencies,
      delayWindows: [],
      skewWindows: [],
      isolatedComponentIds,
      uncarriedDataItemIds,
      handoverRows: [],
      coverage: emptyCoverage(detail),
      truncated: false,
      findings,
    };
  }

  // --- データ項目ごとの部分グラフと遅延窓・乖離窓の算出 ---
  const delayWindows: DataFlowDelayWindowRow[] = [];
  const skewWindows: DataFlowSkewWindowRow[] = [];
  let truncated = false;

  for (const d of dataItems) {
    const edgesForItem = validEdges.filter((e) => e.comm.dataItemIds.includes(d.id));
    if (edgesForItem.length === 0) continue;

    const outEdges = new Map<string, Edge[]>();
    for (const e of edgesForItem) {
      const arr = outEdges.get(e.fromId) ?? [];
      arr.push(e);
      outEdges.set(e.fromId, arr);
    }

    const originIds = [...outEdges.keys()].sort(
      (a, b) => (componentIndex.get(a) ?? 0) - (componentIndex.get(b) ?? 0)
    );

    for (const originId of originIds) {
      const { paths, truncated: pairTruncated } = enumerateSimplePaths(originId, outEdges, maxPathsPerPair);
      if (pairTruncated) {
        truncated = true;
        findings.push({
          categoryId: "DFT-19",
          severity: "info",
          target: `${d.id}:${originId}`,
          detail: `データ項目「${d.id}」の起点「${originId}」からの経路列挙が上限 ${maxPathsPerPair} 件で打ち切られた。遅延窓・乖離窓は打ち切り後の経路集合に基づく。`,
        });
      }

      const terminalIds: string[] = [];
      for (const p of paths) if (!terminalIds.includes(p.terminalId)) terminalIds.push(p.terminalId);
      terminalIds.sort(cmp);

      const rowsForOrigin: DataFlowDelayWindowRow[] = [];
      for (const terminalId of terminalIds) {
        const terminalPaths = paths.filter((p) => p.terminalId === terminalId);
        const undefinedIds: string[] = [];
        for (const p of terminalPaths) {
          for (const id of p.undefinedCommunicationIds) if (!undefinedIds.includes(id)) undefinedIds.push(id);
        }
        const windowId = delayWindowId(d.id, originId, terminalId);
        if (undefinedIds.length > 0) {
          const skipReason = `経路上にタイミング未定義の通信を含む: ${undefinedIds.join(", ")}`;
          const row: DataFlowDelayWindowRow = {
            windowId,
            dataItemId: d.id,
            originId,
            terminalId,
            computed: false,
            criticalPathCommunicationIds: [],
            pathCount: terminalPaths.length,
            skipReason,
          };
          rowsForOrigin.push(row);
          findings.push({
            categoryId: "DFT-07",
            severity: "high",
            target: windowId,
            detail: `遅延窓「${windowId}」(${nameOf(originId)} → ${nameOf(terminalId)})の最大伝播遅延を算出できない。${skipReason}。`,
          });
          continue;
        }
        let best = terminalPaths[0];
        for (const p of terminalPaths) {
          if ((p.maxSeconds ?? 0) > (best.maxSeconds ?? 0)) best = p;
        }
        const maxLatencySeconds = roundSeconds(Math.max(...terminalPaths.map((p) => p.maxSeconds ?? 0)));
        const minLatencySeconds = roundSeconds(Math.min(...terminalPaths.map((p) => p.minSeconds ?? 0)));
        rowsForOrigin.push({
          windowId,
          dataItemId: d.id,
          originId,
          terminalId,
          computed: true,
          maxLatencySeconds,
          minLatencySeconds,
          criticalPathCommunicationIds: best.communicationIds,
          pathCount: terminalPaths.length,
        });
      }
      delayWindows.push(...rowsForOrigin);

      // 乖離窓: 観測点2件以上、または観測点1件でも経路が2本以上あるとき
      const multiPathSingleTerminal = terminalIds.length === 1 && paths.length >= 2;
      if (terminalIds.length >= 2 || multiPathSingleTerminal) {
        const wid = skewWindowId(d.id, originId);
        const uncomputed = rowsForOrigin.filter((r) => !r.computed);
        if (uncomputed.length > 0) {
          const skipReason = `到達先の遅延窓が算出不能である: ${uncomputed.map((r) => r.windowId).join(", ")}`;
          skewWindows.push({
            windowId: wid,
            dataItemId: d.id,
            originId,
            observerCount: terminalIds.length,
            computed: false,
            slowestPathCommunicationIds: [],
            fastestPathCommunicationIds: [],
            skipReason,
          });
        } else {
          let slowest = rowsForOrigin[0];
          for (const r of rowsForOrigin) {
            if ((r.maxLatencySeconds ?? 0) > (slowest.maxLatencySeconds ?? 0)) slowest = r;
          }
          let fastestPath = paths[0];
          for (const p of paths) {
            if ((p.minSeconds ?? 0) < (fastestPath.minSeconds ?? 0)) fastestPath = p;
          }
          const maxSkewSeconds = roundSeconds((slowest.maxLatencySeconds ?? 0) - (fastestPath.minSeconds ?? 0));
          skewWindows.push({
            windowId: wid,
            dataItemId: d.id,
            originId,
            observerCount: terminalIds.length,
            computed: true,
            maxSkewSeconds,
            slowestTerminalId: slowest.terminalId,
            slowestPathCommunicationIds: slowest.criticalPathCommunicationIds,
            fastestTerminalId: fastestPath.terminalId,
            fastestPathCommunicationIds: fastestPath.communicationIds,
          });
        }
      }
    }
  }

  delayWindows.sort(
    (a, b) => cmp(a.dataItemId, b.dataItemId) || cmp(a.originId, b.originId) || cmp(a.terminalId, b.terminalId)
  );
  skewWindows.sort((a, b) => cmp(a.dataItemId, b.dataItemId) || cmp(a.originId, b.originId));

  const delayWindowById = new Map(delayWindows.map((w) => [w.windowId, w]));
  const skewWindowById = new Map(skewWindows.map((w) => [w.windowId, w]));

  // --- DFT-09 / DFT-08: 宣言した伝播先・最大伝播遅延の照合 ---
  for (const pt of spec.propagationTargets ?? []) {
    const reachableWindows: DataFlowDelayWindowRow[] = [];
    let unresolved = false;
    const unresolvedReasons: string[] = [];
    for (const terminalId of pt.terminalComponentIds) {
      const wid = delayWindowId(pt.dataItemId, pt.originComponentId, terminalId);
      const row = delayWindowById.get(wid);
      if (row === undefined) {
        unresolved = true;
        unresolvedReasons.push(`${terminalId}(到達不能)`);
        findings.push({
          categoryId: "DFT-09",
          severity: "high",
          target: pt.id,
          detail: `伝播先宣言「${pt.id}」の終端「${terminalId}」は、データ項目「${pt.dataItemId}」の部分グラフで起点「${pt.originComponentId}」から到達できない。`,
        });
        continue;
      }
      if (!row.computed) {
        unresolved = true;
        unresolvedReasons.push(`${terminalId}(算出不能)`);
        continue;
      }
      reachableWindows.push(row);
    }
    if (pt.claimedMaxLatencySeconds === undefined) continue;
    if (unresolved || reachableWindows.length === 0) {
      findings.push({
        categoryId: "DFT-08",
        severity: "high",
        target: pt.id,
        detail: `最大伝播遅延の宣言値(${pt.claimedMaxLatencySeconds}秒)は算出不能で裏付けられない(${
          unresolvedReasons.join(", ") || "対象の遅延窓が存在しない"
        })。`,
      });
      continue;
    }
    const computedMax = roundSeconds(Math.max(...reachableWindows.map((w) => w.maxLatencySeconds ?? 0)));
    if (Math.abs(computedMax - pt.claimedMaxLatencySeconds) >= EPS) {
      findings.push({
        categoryId: "DFT-08",
        severity: "high",
        target: pt.id,
        detail: `最大伝播遅延の宣言値(${pt.claimedMaxLatencySeconds}秒)が算出値(${computedMax}秒)と一致しない(対象遅延窓: ${reachableWindows
          .map((w) => w.windowId)
          .join(", ")})。`,
      });
    }
  }

  // --- DFT-18: 最大乖離時間の宣言照合 ---
  for (const claim of (spec.claimedMaxSkewSeconds ?? []) as DataFlowClaimedSkewInput[]) {
    const wid = skewWindowId(claim.dataItemId, claim.originComponentId);
    const row = skewWindowById.get(wid);
    if (row === undefined || !row.computed) {
      findings.push({
        categoryId: "DFT-18",
        severity: "high",
        target: wid,
        detail: `最大乖離時間の宣言値(${claim.seconds}秒)は算出不能で裏付けられない(${
          row === undefined ? "対応する乖離窓が算出されていない" : (row.skipReason ?? "算出不能")
        })。`,
      });
      continue;
    }
    if (Math.abs((row.maxSkewSeconds ?? 0) - claim.seconds) >= EPS) {
      findings.push({
        categoryId: "DFT-18",
        severity: "high",
        target: wid,
        detail: `最大乖離時間の宣言値(${claim.seconds}秒)が算出値(${row.maxSkewSeconds}秒)と一致しない。`,
      });
    }
  }

  // --- テスト条件との突合(DFT-10/11/12) ---
  const testConditions = spec.testConditions ?? [];
  const referencedWindowIds = new Map<string, string[]>(); // windowId -> conditionIds
  for (const tc of testConditions) {
    for (const wid of tc.coveredDelayWindowIds ?? []) {
      const arr = referencedWindowIds.get(wid) ?? [];
      if (!arr.includes(tc.id)) arr.push(tc.id);
      referencedWindowIds.set(wid, arr);
      if (!delayWindowById.has(wid) && !skewWindowById.has(wid)) {
        const isSkewRef = wid.startsWith("DSW:");
        findings.push({
          categoryId: isSkewRef ? "DFT-11" : "DFT-10",
          severity: "medium",
          target: tc.id,
          detail: `テスト条件「${tc.id}」が参照する窓ID「${wid}」は算出された${
            isSkewRef ? "乖離窓" : "遅延窓"
          }の実体に存在しない。`,
        });
      }
    }
  }

  const coveredDelayWindows = delayWindows.filter(
    (w) => w.computed && (w.maxLatencySeconds ?? 0) > 0
  );
  const coveredSkewWindows = skewWindows.filter((w) => w.computed && (w.maxSkewSeconds ?? 0) > 0);

  for (const w of coveredDelayWindows) {
    if (!referencedWindowIds.has(w.windowId)) {
      findings.push({
        categoryId: "DFT-10",
        severity: "medium",
        target: w.windowId,
        detail: `遅延窓「${w.windowId}」(最大 ${w.maxLatencySeconds} 秒、${nameOf(w.originId)} → ${nameOf(
          w.terminalId
        )})に対応するテスト条件が無い。`,
      });
    }
  }
  for (const w of coveredSkewWindows) {
    if (!referencedWindowIds.has(w.windowId)) {
      findings.push({
        categoryId: "DFT-11",
        severity: "medium",
        target: w.windowId,
        detail: `乖離窓「${w.windowId}」(最大乖離 ${w.maxSkewSeconds} 秒、起点 ${nameOf(
          w.originId
        )})に対応するテスト条件が無い。`,
      });
    }
  }

  for (const tc of testConditions) {
    if (tc.expectsImmediate !== true) continue;
    for (const did of tc.dataItemIds ?? []) {
      for (const w of coveredDelayWindows) {
        if (w.dataItemId !== did) continue;
        findings.push({
          categoryId: "DFT-12",
          severity: "high",
          target: tc.id,
          detail: `テスト条件「${tc.id}」は「${dataNameOf(did)}」の即時反映を期待しているが、遅延窓「${
            w.windowId
          }」に最大 ${w.maxLatencySeconds} 秒の伝播遅延がある(経路: ${w.criticalPathCommunicationIds.join(" → ")})。`,
        });
      }
    }
  }

  // --- 遅延窓被覆率(DFT-20) ---
  const denominatorWindowIds = [
    ...coveredDelayWindows.map((w) => w.windowId),
    ...coveredSkewWindows.map((w) => w.windowId),
  ];
  let coverage: DataFlowCoverage;
  if (denominatorWindowIds.length === 0) {
    coverage = emptyCoverage(
      "最大伝播遅延・最大乖離時間が0秒超で算出済みの窓が1件も無いため、遅延窓被覆率を算出できない。"
    );
  } else {
    const numerator = denominatorWindowIds.filter((wid) => (referencedWindowIds.get(wid) ?? []).length > 0).length;
    coverage = {
      basis: "computed",
      denominator: denominatorWindowIds.length,
      numerator,
      percent: Math.round((numerator / denominatorWindowIds.length) * 1000) / 10,
      claimMismatch: false,
    };
  }
  if (spec.claimedDelayWindowCoveragePercent !== undefined) {
    coverage.claimedPercent = spec.claimedDelayWindowCoveragePercent;
    if (coverage.basis === "unavailable") {
      coverage.claimMismatch = true;
      findings.push({
        categoryId: "DFT-20",
        severity: "high",
        target: "delay-window-coverage",
        detail: `遅延窓被覆率の宣言値(${spec.claimedDelayWindowCoveragePercent}%)は算出不能で裏付けられない(${coverage.reason})。`,
      });
    } else if (Math.abs((coverage.percent ?? 0) - spec.claimedDelayWindowCoveragePercent) >= EPS) {
      coverage.claimMismatch = true;
      findings.push({
        categoryId: "DFT-20",
        severity: "high",
        target: "delay-window-coverage",
        detail: `遅延窓被覆率の宣言値(${spec.claimedDelayWindowCoveragePercent}%)が算出値(${coverage.percent}%、分母 ${coverage.denominator} / 分子 ${coverage.numerator})と一致しない。`,
      });
    }
  }

  // --- extract_test_conditions 引き渡し行 ---
  const requirementIdsOf = (commIds: readonly string[]): { kind: "requirement"; id: string }[] => {
    const ids: string[] = [];
    for (const cid of commIds) {
      const edge = validEdges.find((e) => e.comm.id === cid);
      for (const rid of edge?.comm.requirementIds ?? []) {
        if (!ids.includes(rid)) ids.push(rid);
      }
    }
    return ids.map((id) => ({ kind: "requirement" as const, id }));
  };

  const handoverRows: DataFlowHandoverRow[] = [];
  for (const w of coveredDelayWindows) {
    handoverRows.push({
      proposedConditionId: `DFT-DELAY:${w.dataItemId}:${w.originId}:${w.terminalId}`,
      windowKind: "delay",
      windowId: w.windowId,
      target: nameOf(w.terminalId),
      statement: `「${dataNameOf(w.dataItemId)}」が${nameOf(w.originId)}で変化してから${nameOf(
        w.terminalId
      )}へ反映されるまで最大 ${w.maxLatencySeconds} 秒の遅延窓があり、その窓の間の${nameOf(
        w.terminalId
      )}側の振る舞いが規定どおりであること`,
      source: "testbase",
      derivedFrom: requirementIdsOf(w.criticalPathCommunicationIds),
      recommendedTechniques: ["timing-order-test"],
    });
  }
  for (const w of coveredSkewWindows) {
    handoverRows.push({
      proposedConditionId: `DFT-SKEW:${w.dataItemId}:${w.originId}`,
      windowKind: "skew",
      windowId: w.windowId,
      target: nameOf(w.originId),
      statement: `「${dataNameOf(w.dataItemId)}」について${nameOf(w.fastestTerminalId ?? "")}と${nameOf(
        w.slowestTerminalId ?? ""
      )}の間に最大 ${w.maxSkewSeconds} 秒の表示・状態乖離が構造的に存在し、その乖離下での振る舞いが規定どおりであること`,
      source: "testbase",
      derivedFrom: requirementIdsOf([...w.slowestPathCommunicationIds, ...w.fastestPathCommunicationIds]),
      recommendedTechniques: ["timing-order-test"],
    });
  }

  return {
    generated: true,
    edgeLatencies,
    delayWindows,
    skewWindows,
    isolatedComponentIds,
    uncarriedDataItemIds,
    handoverRows,
    coverage,
    truncated,
    findings,
  };
}
