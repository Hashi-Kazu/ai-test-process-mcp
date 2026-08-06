import { normalizeForGrounding } from "./groundingNormalization.js";
import type {
  AnalyzeCauseEffectInput,
  CauseEffectConstraintInput,
  CauseEffectEdgeInput,
  CauseEffectEdgeKind,
  CauseEffectEnumeration,
  CauseEffectFinding,
  CauseEffectGraph,
  CauseEffectNode,
  CauseEffectRule,
  CauseEffectSentence,
  CauseEffectSummary,
  DecisionTableActionValue,
  DecisionTableInvalidCombination,
  DecisionTableResult,
  DecisionTableRuleSpec,
  DecisionTableSpec,
} from "./types.js";

// analyze_cause_effect 固有の決定的検査ロジック。
// すべて純関数で、出力順は入力順（または明示したソートキー）により決定的。
// 意味的な原因・結果・制約への構造化は呼び出し側LLMの責務であり、本モジュールは
// 「渡されたモデルの整合性」と「渡された仕様文本文による裏付け」だけを検査する。

const DEFAULT_MAX_ENUMERATION_CAUSES = 12;

const LOGICAL_CONNECTIVES = [
  "かつ",
  "および",
  "または",
  "もしくは",
  "あるいは",
  "ただし",
  "を除く",
  "以外",
  "いずれか",
  "のみ",
  "同時に",
];

const CONSTRAINT_TYPE_LABEL: Record<CauseEffectConstraintInput["type"], string> = {
  exclusive: "排他(E): 真になれるのは最大1件",
  inclusive: "包含(I): 少なくとも1件は真",
  onlyOne: "唯一(O): ちょうど1件が真",
  requires: "要求(R): 先の原因が真なら後の原因も真",
  masks: "隠蔽(M): 先の結果が真なら後の結果は評価対象外",
};

export function constraintTypeLabel(type: CauseEffectConstraintInput["type"]): string {
  return CONSTRAINT_TYPE_LABEL[type];
}

// --- 1. グラフ構築 ---

export function buildCauseEffectGraph(input: AnalyzeCauseEffectInput): CauseEffectGraph {
  const nodes: CauseEffectNode[] = [];
  const nodeById = new Map<string, CauseEffectNode>();

  const addNode = (node: CauseEffectNode): void => {
    nodes.push(node);
    if (!nodeById.has(node.id)) nodeById.set(node.id, node);
  };

  for (const cause of input.causes) {
    addNode({
      id: cause.id,
      kind: "cause",
      statement: cause.statement,
      logic: "and",
      quote: cause.quote,
      note: cause.note,
      incoming: [],
      outgoing: [],
    });
  }
  for (const mid of input.intermediateNodes ?? []) {
    addNode({
      id: mid.id,
      kind: "intermediate",
      statement: mid.statement,
      logic: mid.logic ?? "and",
      note: mid.note,
      incoming: [],
      outgoing: [],
    });
  }
  for (const effect of input.effects) {
    addNode({
      id: effect.id,
      kind: "effect",
      statement: effect.statement,
      logic: effect.logic ?? "and",
      quote: effect.quote,
      note: effect.note,
      incoming: [],
      outgoing: [],
    });
  }

  const edges: (CauseEffectEdgeInput & { kind: CauseEffectEdgeKind })[] = input.edges.map((edge) => ({
    ...edge,
    kind: edge.kind ?? "identity",
  }));

  for (const edge of edges) {
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    // 未知ノードIDを参照する辺は edges にそのまま残すが、隣接情報には積まない（CEG-01 で報告する）。
    if (!fromNode || !toNode) continue;
    fromNode.outgoing.push(edge);
    toNode.incoming.push(edge);
  }

  return {
    nodes,
    nodeById,
    edges,
    causeIds: input.causes.map((c) => c.id),
    effectIds: input.effects.map((e) => e.id),
    intermediateIds: (input.intermediateNodes ?? []).map((n) => n.id),
  };
}

// --- 2. CEG-01 未知ノードの参照 ---

export function findUnknownNodeRefs(
  input: AnalyzeCauseEffectInput,
  graph: CauseEffectGraph
): CauseEffectFinding[] {
  const findings: CauseEffectFinding[] = [];

  input.edges.forEach((edge, i) => {
    if (!graph.nodeById.has(edge.from)) {
      findings.push({
        categoryId: "CEG-01",
        severity: "high",
        targetId: edge.from,
        place: `edges[${i}].from`,
        detail: `辺の始点「${edge.from}」が原因・中間ノード・結果のいずれにも定義されていない。`,
        suggestion: "定義済みのノードIDを指定するか、当該ノードを causes / intermediateNodes / effects に追加すること。",
      });
    }
    if (!graph.nodeById.has(edge.to)) {
      findings.push({
        categoryId: "CEG-01",
        severity: "high",
        targetId: edge.to,
        place: `edges[${i}].to`,
        detail: `辺の終点「${edge.to}」が原因・中間ノード・結果のいずれにも定義されていない。`,
        suggestion: "定義済みのノードIDを指定するか、当該ノードを causes / intermediateNodes / effects に追加すること。",
      });
    }
  });

  (input.constraints ?? []).forEach((constraint, i) => {
    constraint.nodeIds.forEach((nodeId, j) => {
      if (graph.nodeById.has(nodeId)) return;
      findings.push({
        categoryId: "CEG-01",
        severity: "high",
        targetId: nodeId,
        place: `constraints[${i}].nodeIds[${j}]`,
        detail: `制約「${constraint.id}」が未定義のノードID「${nodeId}」を参照している。`,
        suggestion: "制約の対象ノードIDを定義済みのIDへ修正すること。",
      });
    });
  });

  return findings;
}

// --- 3. CEG-02 ID重複 ---

export function findDuplicateNodeIds(input: AnalyzeCauseEffectInput): CauseEffectFinding[] {
  const findings: CauseEffectFinding[] = [];

  const declarations: { id: string; place: string }[] = [];
  input.causes.forEach((c, i) => declarations.push({ id: c.id, place: `causes[${i}].id` }));
  (input.intermediateNodes ?? []).forEach((n, i) =>
    declarations.push({ id: n.id, place: `intermediateNodes[${i}].id` })
  );
  input.effects.forEach((e, i) => declarations.push({ id: e.id, place: `effects[${i}].id` }));

  const seenNodeIds = new Set<string>();
  for (const declaration of declarations) {
    if (seenNodeIds.has(declaration.id)) {
      findings.push({
        categoryId: "CEG-02",
        severity: "high",
        targetId: declaration.id,
        place: declaration.place,
        detail: `ノードID「${declaration.id}」が原因・中間ノード・結果を横断して重複している。`,
        suggestion: "ノードIDは全種別を通じて一意にすること。",
      });
      continue;
    }
    seenNodeIds.add(declaration.id);
  }

  const seenConstraintIds = new Set<string>();
  (input.constraints ?? []).forEach((constraint, i) => {
    if (seenConstraintIds.has(constraint.id)) {
      findings.push({
        categoryId: "CEG-02",
        severity: "high",
        targetId: constraint.id,
        place: `constraints[${i}].id`,
        detail: `制約ID「${constraint.id}」が重複している。`,
        suggestion: "制約IDは一意にすること。",
      });
      return;
    }
    seenConstraintIds.add(constraint.id);
  });

  return findings;
}

// --- 4. CEG-03 IDプレフィックスの不一致 ---

export function findPrefixMismatchNodeIds(input: AnalyzeCauseEffectInput): CauseEffectFinding[] {
  const findings: CauseEffectFinding[] = [];

  const causePrefix = input.causeIdPrefix ?? "C";
  const intermediatePrefix = input.intermediateIdPrefix ?? "N";
  const effectPrefix = input.effectIdPrefix ?? "E";
  const constraintPrefix = input.constraintIdPrefix ?? "CN";

  const check = (id: string, prefix: string, place: string, kindJa: string): void => {
    if (prefix.length === 0) return;
    if (id.startsWith(prefix)) return;
    findings.push({
      categoryId: "CEG-03",
      severity: "info",
      targetId: id,
      place,
      detail: `${kindJa}のID「${id}」が既定のプレフィックス「${prefix}」で始まっていない。`,
      suggestion: `${kindJa}のIDは「${prefix}」で始める、またはプレフィックス指定を入力で明示すること。`,
    });
  };

  input.causes.forEach((c, i) => check(c.id, causePrefix, `causes[${i}].id`, "原因"));
  (input.intermediateNodes ?? []).forEach((n, i) =>
    check(n.id, intermediatePrefix, `intermediateNodes[${i}].id`, "中間ノード")
  );
  input.effects.forEach((e, i) => check(e.id, effectPrefix, `effects[${i}].id`, "結果"));
  (input.constraints ?? []).forEach((c, i) => check(c.id, constraintPrefix, `constraints[${i}].id`, "制約"));

  return findings;
}

// --- 5. 到達性 ---

function forwardReachable(graph: CauseEffectGraph, startId: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const node = graph.nodeById.get(current);
    if (!node) continue;
    for (const edge of node.outgoing) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push(edge.to);
    }
  }
  return visited;
}

function backwardReachable(graph: CauseEffectGraph, startId: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const node = graph.nodeById.get(current);
    if (!node) continue;
    for (const edge of node.incoming) {
      if (visited.has(edge.from)) continue;
      visited.add(edge.from);
      queue.push(edge.from);
    }
  }
  return visited;
}

export function findIsolatedCauses(graph: CauseEffectGraph): CauseEffectFinding[] {
  const findings: CauseEffectFinding[] = [];
  for (const node of graph.nodes) {
    if (node.kind !== "cause") continue;
    const reachable = forwardReachable(graph, node.id);
    const reachesEffect = [...reachable].some((id) => graph.nodeById.get(id)?.kind === "effect");
    if (reachesEffect) continue;
    findings.push({
      categoryId: "CEG-04",
      severity: "high",
      targetId: node.id,
      detail:
        node.outgoing.length === 0
          ? `原因「${node.id}」に出辺が1本もなく、どの結果にも接続していない。`
          : `原因「${node.id}」から辺をたどってもどの結果にも到達しない。`,
      suggestion: "当該原因が影響する結果を特定して辺を追加するか、原因として不要なら削除すること。",
    });
  }
  return findings;
}

export function findUnreachableEffects(graph: CauseEffectGraph): CauseEffectFinding[] {
  const findings: CauseEffectFinding[] = [];
  for (const node of graph.nodes) {
    if (node.kind !== "effect") continue;
    const reachable = backwardReachable(graph, node.id);
    const reachedFromCause = [...reachable].some((id) => graph.nodeById.get(id)?.kind === "cause");
    if (reachedFromCause) continue;
    findings.push({
      categoryId: "CEG-05",
      severity: "high",
      targetId: node.id,
      detail:
        node.incoming.length === 0
          ? `結果「${node.id}」に入辺が1本もなく、どの原因からも導かれない。`
          : `結果「${node.id}」を辺の逆向きにたどってもどの原因にも到達しない。`,
      suggestion: "当該結果を導く原因を仕様文から特定して辺を追加するか、結果として不要なら削除すること。",
    });
  }
  return findings;
}

export function findOrphanIntermediateNodes(graph: CauseEffectGraph): CauseEffectFinding[] {
  const findings: CauseEffectFinding[] = [];
  for (const node of graph.nodes) {
    if (node.kind !== "intermediate") continue;
    if (node.incoming.length > 0 && node.outgoing.length > 0) continue;
    const missing =
      node.incoming.length === 0 && node.outgoing.length === 0
        ? "入辺・出辺の両方"
        : node.incoming.length === 0
          ? "入辺"
          : "出辺";
    findings.push({
      categoryId: "CEG-06",
      severity: "medium",
      targetId: node.id,
      detail: `中間ノード「${node.id}」に${missing}が存在しない（入辺 ${node.incoming.length} 件 / 出辺 ${node.outgoing.length} 件）。`,
      suggestion: "中間ノードは原因側からの入辺と結果側への出辺の両方を持たせること。",
    });
  }
  return findings;
}

// --- 6. CEG-07 循環 ---

export function findGraphCycles(graph: CauseEffectGraph): { path: string[] }[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of graph.nodes) color.set(node.id, WHITE);

  const cycles: { path: string[] }[] = [];
  const seenCycleKeys = new Set<string>();
  const stack: string[] = [];

  const visit = (nodeId: string): void => {
    color.set(nodeId, GRAY);
    stack.push(nodeId);
    const node = graph.nodeById.get(nodeId);
    for (const edge of node?.outgoing ?? []) {
      const nextColor = color.get(edge.to);
      if (nextColor === undefined) continue;
      if (nextColor === WHITE) {
        visit(edge.to);
        continue;
      }
      if (nextColor === GRAY) {
        const index = stack.indexOf(edge.to);
        if (index < 0) continue;
        const path = [...stack.slice(index), edge.to];
        const key = path.join(" ");
        if (seenCycleKeys.has(key)) continue;
        seenCycleKeys.add(key);
        cycles.push({ path });
      }
    }
    stack.pop();
    color.set(nodeId, BLACK);
  };

  for (const node of graph.nodes) {
    if (color.get(node.id) === WHITE) visit(node.id);
  }

  return cycles;
}

export function findCycleFindings(graph: CauseEffectGraph): CauseEffectFinding[] {
  return findGraphCycles(graph).map((cycle) => ({
    categoryId: "CEG-07",
    severity: "high" as const,
    targetId: cycle.path[0],
    detail: `原因結果グラフに循環がある: ${cycle.path.join(" → ")}`,
    suggestion: "原因結果グラフは非循環である必要がある。辺の向きを見直し、循環を除去すること。",
  }));
}

// --- 7. CEG-08 制約の指定不正 ---

export function findConstraintShapeFindings(
  input: AnalyzeCauseEffectInput,
  graph: CauseEffectGraph
): CauseEffectFinding[] {
  const findings: CauseEffectFinding[] = [];

  (input.constraints ?? []).forEach((constraint, i) => {
    const place = `constraints[${i}]`;
    const push = (detail: string, suggestion: string): void => {
      findings.push({
        categoryId: "CEG-08",
        severity: "high",
        targetId: constraint.id,
        place,
        detail,
        suggestion,
      });
    };

    const uniqueIds = new Set(constraint.nodeIds);
    if (uniqueIds.size !== constraint.nodeIds.length) {
      push(
        `制約「${constraint.id}」(${constraint.type}) の対象ノードIDに重複がある: ${constraint.nodeIds.join(", ")}`,
        "同一ノードを複数回指定しないこと。"
      );
    }

    const knownNodes = constraint.nodeIds
      .map((id) => graph.nodeById.get(id))
      .filter((node): node is CauseEffectNode => node !== undefined);

    if (constraint.type === "exclusive" || constraint.type === "inclusive" || constraint.type === "onlyOne") {
      if (constraint.nodeIds.length < 2) {
        push(
          `制約「${constraint.id}」(${constraint.type}) の対象ノードが ${constraint.nodeIds.length} 件しかない（2件以上必要）。`,
          "排他・包含・唯一の制約は原因ノードを2件以上指定すること。"
        );
      }
      for (const node of knownNodes) {
        if (node.kind === "cause") continue;
        push(
          `制約「${constraint.id}」(${constraint.type}) が原因以外のノード「${node.id}」(${node.kind}) を対象にしている。`,
          "排他・包含・唯一の制約は原因ノードのみを対象にすること。"
        );
      }
      return;
    }

    if (constraint.type === "requires") {
      if (constraint.nodeIds.length !== 2) {
        push(
          `制約「${constraint.id}」(requires) の対象ノードが ${constraint.nodeIds.length} 件である（ちょうど2件必要）。`,
          "requires は [先行原因, 後続原因] のちょうど2件を指定すること。"
        );
      }
      for (const node of knownNodes) {
        if (node.kind === "cause") continue;
        push(
          `制約「${constraint.id}」(requires) が原因以外のノード「${node.id}」(${node.kind}) を対象にしている。`,
          "requires は原因ノード2件を対象にすること。"
        );
      }
      return;
    }

    // masks
    if (constraint.nodeIds.length !== 2) {
      push(
        `制約「${constraint.id}」(masks) の対象ノードが ${constraint.nodeIds.length} 件である（ちょうど2件必要）。`,
        "masks は [隠蔽する結果, 隠蔽される結果] のちょうど2件を指定すること。"
      );
    }
    for (const node of knownNodes) {
      if (node.kind === "effect") continue;
      push(
        `制約「${constraint.id}」(masks) が結果以外のノード「${node.id}」(${node.kind}) を対象にしている。`,
        "masks は結果ノード2件を対象にすること。"
      );
    }
  });

  return findings;
}

// --- 8. 全列挙 ---

const BLOCKING_CATEGORY_IDS = ["CEG-01", "CEG-02", "CEG-07", "CEG-08"];

function assignmentsFor(causeIds: string[], constraints: CauseEffectConstraintInput[]): boolean[][] {
  const n = causeIds.length;
  const total = 2 ** n;
  const results: boolean[][] = [];
  for (let mask = 0; mask < total; mask++) {
    // causes の入力順を最上位ビットから割り当てる。
    const assignment: boolean[] = [];
    for (let i = 0; i < n; i++) {
      assignment.push(((mask >> (n - 1 - i)) & 1) === 1);
    }
    const valueById = new Map<string, boolean>();
    causeIds.forEach((id, i) => valueById.set(id, assignment[i]));
    if (!satisfiesCauseConstraints(valueById, constraints)) continue;
    results.push(assignment);
  }
  return results;
}

export function findViolatedCauseConstraintIds(
  valueById: Map<string, boolean>,
  constraints: CauseEffectConstraintInput[]
): string[] {
  const violated: string[] = [];
  for (const constraint of constraints) {
    if (constraint.type === "masks") continue;
    if (constraint.type === "requires") {
      if (constraint.nodeIds.length !== 2) continue;
      const [a, b] = constraint.nodeIds;
      if (valueById.get(a) === true && valueById.get(b) !== true) violated.push(constraint.id);
      continue;
    }
    const trueCount = constraint.nodeIds.filter((id) => valueById.get(id) === true).length;
    if (constraint.type === "exclusive" && trueCount > 1) violated.push(constraint.id);
    if (constraint.type === "inclusive" && trueCount < 1) violated.push(constraint.id);
    if (constraint.type === "onlyOne" && trueCount !== 1) violated.push(constraint.id);
  }
  return violated;
}

function satisfiesCauseConstraints(
  valueById: Map<string, boolean>,
  constraints: CauseEffectConstraintInput[]
): boolean {
  return findViolatedCauseConstraintIds(valueById, constraints).length === 0;
}

function evaluateDerivedNodes(graph: CauseEffectGraph, causeValues: Map<string, boolean>): Map<string, boolean> {
  const values = new Map(causeValues);
  const indegree = new Map<string, number>();
  for (const node of graph.nodes) indegree.set(node.id, 0);
  for (const node of graph.nodes) {
    if (node.kind === "cause") continue;
    indegree.set(node.id, node.incoming.length);
  }

  const queue: string[] = graph.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  let head = 0;
  while (head < queue.length) {
    const currentId = queue[head];
    head += 1;
    const node = graph.nodeById.get(currentId);
    if (!node) continue;
    if (node.kind !== "cause") {
      if (node.incoming.length === 0) {
        values.set(node.id, false);
      } else {
        const inputValues = node.incoming.map((edge) => {
          const raw = values.get(edge.from) ?? false;
          return edge.kind === "not" ? !raw : raw;
        });
        values.set(node.id, node.logic === "or" ? inputValues.some(Boolean) : inputValues.every(Boolean));
      }
    }
    for (const edge of node.outgoing) {
      const target = graph.nodeById.get(edge.to);
      if (!target || target.kind === "cause") continue;
      const remaining = (indegree.get(edge.to) ?? 0) - 1;
      indegree.set(edge.to, remaining);
      if (remaining === 0) queue.push(edge.to);
    }
  }

  for (const node of graph.nodes) {
    if (!values.has(node.id)) values.set(node.id, false);
  }
  return values;
}

export function enumerateCauseEffect(
  input: AnalyzeCauseEffectInput,
  graph: CauseEffectGraph,
  blockingFindings: CauseEffectFinding[]
): CauseEffectEnumeration {
  const causeIds = graph.causeIds;
  const causeCount = causeIds.length;
  const theoreticalCombinationCount = 2 ** causeCount;
  const maxCauses = input.maxEnumerationCauses ?? DEFAULT_MAX_ENUMERATION_CAUSES;

  const blocking = blockingFindings.filter((f) => BLOCKING_CATEGORY_IDS.includes(f.categoryId));
  if (blocking.length > 0) {
    const categories = [...new Set(blocking.map((f) => f.categoryId))].join(", ");
    return {
      enumerated: false,
      skipReason: `モデルの構造に致命的な指摘（${categories}）があるため全列挙を行わなかった`,
      causeCount,
      theoreticalCombinationCount,
      validCombinationCount: 0,
      rules: [],
      compressedRules: [],
    };
  }

  if (causeCount > maxCauses) {
    return {
      enumerated: false,
      skipReason: `原因数 ${causeCount} 件が全列挙の上限 ${maxCauses} 件を超えているため全列挙を行わなかった`,
      causeCount,
      theoreticalCombinationCount,
      validCombinationCount: 0,
      rules: [],
      compressedRules: [],
    };
  }

  const constraints = input.constraints ?? [];
  const assignments = assignmentsFor(causeIds, constraints);
  const maskConstraints = constraints.filter((c) => c.type === "masks" && c.nodeIds.length === 2);

  const rules: CauseEffectRule[] = assignments.map((assignment, index) => {
    const causeValueMap = new Map<string, boolean>();
    causeIds.forEach((id, i) => causeValueMap.set(id, assignment[i]));
    const values = evaluateDerivedNodes(graph, causeValueMap);

    const causeValues: Record<string, "T" | "F" | "-"> = {};
    for (const id of causeIds) causeValues[id] = causeValueMap.get(id) ? "T" : "F";

    const effectValues: Record<string, "T" | "F" | "-"> = {};
    for (const id of graph.effectIds) effectValues[id] = values.get(id) ? "T" : "F";

    for (const constraint of maskConstraints) {
      const [maskingId, maskedId] = constraint.nodeIds;
      if (values.get(maskingId) !== true) continue;
      if (!(maskedId in effectValues)) continue;
      effectValues[maskedId] = "-";
    }

    return { no: index + 1, causeValues, effectValues };
  });

  return {
    enumerated: true,
    causeCount,
    theoreticalCombinationCount,
    validCombinationCount: rules.length,
    rules,
    compressedRules: compressCauseEffectRules(rules, causeIds),
  };
}

// --- 9. ルール圧縮 ---

export function compressCauseEffectRules(rules: CauseEffectRule[], causeIds: string[]): CauseEffectRule[] {
  const groupKeys: string[] = [];
  const groups = new Map<string, CauseEffectRule[]>();

  for (const rule of rules) {
    const key = JSON.stringify(rule.effectValues);
    const group = groups.get(key);
    if (group) {
      group.push(rule);
    } else {
      groupKeys.push(key);
      groups.set(key, [rule]);
    }
  }

  const merged: CauseEffectRule[] = [];

  for (const key of groupKeys) {
    const working: CauseEffectRule[] = (groups.get(key) ?? []).map((rule) => ({
      no: rule.no,
      causeValues: { ...rule.causeValues },
      effectValues: { ...rule.effectValues },
    }));

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < working.length && !changed; i++) {
        for (let j = i + 1; j < working.length && !changed; j++) {
          const diffs = causeIds.filter((id) => working[i].causeValues[id] !== working[j].causeValues[id]);
          if (diffs.length !== 1) continue;
          const mergedRule: CauseEffectRule = {
            no: Math.min(working[i].no, working[j].no),
            causeValues: { ...working[i].causeValues },
            effectValues: { ...working[i].effectValues },
          };
          mergedRule.causeValues[diffs[0]] = "-";
          working.splice(j, 1);
          working.splice(i, 1, mergedRule);
          changed = true;
        }
      }
    }

    merged.push(...working);
  }

  merged.sort((a, b) => a.no - b.no);
  return merged.map((rule, index) => ({ ...rule, no: index + 1 }));
}

// --- 10. CEG-09 / CEG-10 / CEG-11 制約の整合性 ---

function serializeAssignments(assignments: boolean[][]): string {
  return assignments.map((assignment) => assignment.map((v) => (v ? "1" : "0")).join("")).join("|");
}

export function findConstraintConsistencyFindings(
  input: AnalyzeCauseEffectInput,
  graph: CauseEffectGraph,
  enumeration: CauseEffectEnumeration
): CauseEffectFinding[] {
  const findings: CauseEffectFinding[] = [];
  const constraints = input.constraints ?? [];

  if (!enumeration.enumerated) {
    // フォールバック: ペア単位の局所検査のみ。
    for (const requires of constraints) {
      if (requires.type !== "requires" || requires.nodeIds.length !== 2) continue;
      const [a, b] = requires.nodeIds;
      for (const other of constraints) {
        if (other.type !== "exclusive" && other.type !== "onlyOne") continue;
        if (!other.nodeIds.includes(a) || !other.nodeIds.includes(b)) continue;
        findings.push({
          categoryId: "CEG-09",
          severity: "high",
          targetId: requires.id,
          detail: `制約「${requires.id}」(requires ${a} → ${b}) と制約「${other.id}」(${other.type}) が原因「${a}」「${b}」について同時に成立し得ない。全列挙未実施のため矛盾検査は局所検査に限定している。`,
          suggestion: "requires と exclusive / onlyOne のどちらの意図が仕様文に沿うかを確認し、片方を除去すること。",
        });
      }
    }
    return findings;
  }

  if (enumeration.validCombinationCount === 0) {
    findings.push({
      categoryId: "CEG-09",
      severity: "high",
      targetId: input.sectionId,
      detail: `制約を同時に満たす原因の真偽組合せが0件である（理論上限 ${enumeration.theoreticalCombinationCount} 件すべてが制約で排除された）。`,
      suggestion: "制約の指定が過剰または相互に矛盾している。制約を1件ずつ外して意図した組合せが残るか確認すること。",
    });
  }

  if (enumeration.rules.length > 0) {
    for (const causeId of graph.causeIds) {
      const values = enumeration.rules.map((rule) => rule.causeValues[causeId]);
      const first = values[0];
      if (!values.every((value) => value === first)) continue;
      findings.push({
        categoryId: "CEG-10",
        severity: "high",
        targetId: causeId,
        detail: `原因「${causeId}」は制約充足後の全 ${enumeration.rules.length} 通りの組合せで常に「${first}」に固定されており、原因として機能していない。`,
        suggestion: "制約の指定を見直すか、当該原因を条件項目から外して固定の前提条件として扱うこと。",
      });
    }
  }

  const fullKey = serializeAssignments(assignmentsFor(graph.causeIds, constraints));
  for (const constraint of constraints) {
    if (constraint.type === "masks") continue;
    const withoutConstraint = constraints.filter((c) => c !== constraint);
    const key = serializeAssignments(assignmentsFor(graph.causeIds, withoutConstraint));
    if (key !== fullKey) continue;
    findings.push({
      categoryId: "CEG-11",
      severity: "info",
      targetId: constraint.id,
      detail: `制約「${constraint.id}」(${constraint.type}) を外しても有効な原因の組合せ集合が変化しない（他の制約に含意されている）。`,
      suggestion: "冗長な制約は削除して制約表を簡潔に保つこと。ただし仕様文に明記された制約なら意図的な冗長として残してよい。",
    });
  }

  return findings;
}

// --- 11. CEG-12 / CEG-13 結果の可変性 ---

export function findEffectVariabilityFindings(
  enumeration: CauseEffectEnumeration,
  graph: CauseEffectGraph
): CauseEffectFinding[] {
  if (!enumeration.enumerated || enumeration.rules.length === 0) return [];

  const findings: CauseEffectFinding[] = [];
  for (const effectId of graph.effectIds) {
    const values = enumeration.rules.map((rule) => rule.effectValues[effectId]);
    const first = values[0];
    if (!values.every((value) => value === first)) continue;
    if (first === "F") {
      findings.push({
        categoryId: "CEG-12",
        severity: "high",
        targetId: effectId,
        detail: `結果「${effectId}」は制約充足後の全 ${enumeration.rules.length} 通りの組合せで常に偽であり、成立させる原因の組合せが存在しない。`,
        suggestion: "当該結果へ至る辺の向き・論理（and/or）・not 指定、および制約の指定を見直すこと。",
      });
      continue;
    }
    findings.push({
      categoryId: "CEG-13",
      severity: "medium",
      targetId: effectId,
      detail: `結果「${effectId}」は制約充足後の全 ${enumeration.rules.length} 通りの組合せで常に「${first}」であり、原因の真偽に依存していない。`,
      suggestion: "当該結果が原因の組合せで変化するようモデルを見直すか、原因に依存しない仕様であることを確認すること。",
    });
  }
  return findings;
}

// --- 12. CEG-14 / CEG-15 引用の実在照合 ---

export function findUngroundedNodeQuotes(input: AnalyzeCauseEffectInput): CauseEffectFinding[] {
  const findings: CauseEffectFinding[] = [];
  const normalizedSpec = normalizeForGrounding(input.specText);

  const targets: { id: string; quote?: string; place: string; kindJa: string }[] = [];
  input.causes.forEach((c, i) => targets.push({ id: c.id, quote: c.quote, place: `causes[${i}].quote`, kindJa: "原因" }));
  input.effects.forEach((e, i) =>
    targets.push({ id: e.id, quote: e.quote, place: `effects[${i}].quote`, kindJa: "結果" })
  );

  for (const target of targets) {
    const normalizedQuote = target.quote === undefined ? "" : normalizeForGrounding(target.quote);
    if (normalizedQuote.length < 2) {
      findings.push({
        categoryId: "CEG-15",
        severity: "medium",
        targetId: target.id,
        place: target.place,
        detail: `${target.kindJa}「${target.id}」に仕様文からの引用（quote）が指定されていない、または短すぎて照合できない。`,
        suggestion: "当該ノードの根拠となる仕様文の一文を quote として指定すること。",
      });
      continue;
    }
    if (normalizedSpec.includes(normalizedQuote)) continue;
    findings.push({
      categoryId: "CEG-14",
      severity: "high",
      targetId: target.id,
      place: target.place,
      detail: `${target.kindJa}「${target.id}」の引用「${target.quote}」が仕様文（specText）に存在しない。`,
      suggestion: "引用は仕様文本文からそのまま切り出すこと。要約・言い換えは statement 側に書くこと。",
    });
  }

  return findings;
}

// --- 13. 仕様文の文分割とモデル化網羅 ---

export function splitSpecSentences(specText: string): CauseEffectSentence[] {
  const sentences: CauseEffectSentence[] = [];
  for (const raw of specText.split(/[。\n]/)) {
    const text = raw.trim();
    if (text.length === 0) continue;
    const normalized = normalizeForGrounding(text);
    if (normalized.length < 5) continue;
    sentences.push({ no: sentences.length + 1, text, normalized, modeled: false, nodeIds: [] });
  }
  return sentences;
}

export function findUnmodeledSentences(
  input: AnalyzeCauseEffectInput,
  sentences: CauseEffectSentence[]
): CauseEffectFinding[] {
  const quotedNodes: { id: string; normalizedQuote: string }[] = [];
  for (const cause of input.causes) {
    const normalizedQuote = cause.quote === undefined ? "" : normalizeForGrounding(cause.quote);
    if (normalizedQuote.length >= 2) quotedNodes.push({ id: cause.id, normalizedQuote });
  }
  for (const effect of input.effects) {
    const normalizedQuote = effect.quote === undefined ? "" : normalizeForGrounding(effect.quote);
    if (normalizedQuote.length >= 2) quotedNodes.push({ id: effect.id, normalizedQuote });
  }

  const findings: CauseEffectFinding[] = [];
  for (const sentence of sentences) {
    const nodeIds: string[] = [];
    for (const node of quotedNodes) {
      if (
        sentence.normalized.includes(node.normalizedQuote) ||
        node.normalizedQuote.includes(sentence.normalized)
      ) {
        if (!nodeIds.includes(node.id)) nodeIds.push(node.id);
      }
    }
    sentence.nodeIds = nodeIds;
    sentence.modeled = nodeIds.length > 0;
    if (sentence.modeled) continue;
    findings.push({
      categoryId: "CEG-16",
      severity: "medium",
      targetId: `文${sentence.no}`,
      detail: `仕様文の第${sentence.no}文がどの原因・結果の引用にも紐づいていない: 「${sentence.text}」`,
      suggestion: "当該文が条件・動作を述べているなら原因／結果としてモデル化し、対象外なら対象外である理由を note に明記すること。",
    });
  }
  return findings;
}

// --- 14. CEG-17 論理接続語のモデル反映 ---

export function findUnmodeledConnectives(
  input: AnalyzeCauseEffectInput,
  graph: CauseEffectGraph,
  sentences: CauseEffectSentence[]
): CauseEffectFinding[] {
  const constraintNodeIds = new Set<string>();
  for (const constraint of input.constraints ?? []) {
    for (const nodeId of constraint.nodeIds) constraintNodeIds.add(nodeId);
  }

  const findings: CauseEffectFinding[] = [];
  for (const sentence of sentences) {
    const detected = LOGICAL_CONNECTIVES.filter((connective) => sentence.text.includes(connective));
    if (detected.length === 0) continue;

    if (sentence.nodeIds.length >= 2) continue;

    const reflected = sentence.nodeIds.some((nodeId) => {
      const node = graph.nodeById.get(nodeId);
      if (!node) return false;
      if (node.incoming.length >= 2) return true;
      if (node.logic === "or") return true;
      if (node.incoming.some((edge) => edge.kind === "not")) return true;
      if (constraintNodeIds.has(nodeId)) return true;
      return false;
    });
    if (reflected) continue;

    findings.push({
      categoryId: "CEG-17",
      severity: "medium",
      targetId: `文${sentence.no}`,
      detail: `仕様文の第${sentence.no}文は論理接続語（${detected.join(", ")}）を含むが、モデル側に論理合流・or 論理・not 辺・制約のいずれも現れていない: 「${sentence.text}」`,
      suggestion:
        "接続語が表す論理関係を、中間ノードの and/or・not 辺・制約（exclusive / inclusive / onlyOne / requires / masks）のいずれかとして明示すること。",
    });
  }
  return findings;
}

// --- 15. CEG-19 宣言列数の照合 ---

export function findDeclaredRuleCountFindings(
  input: AnalyzeCauseEffectInput,
  enumeration: CauseEffectEnumeration
): CauseEffectFinding[] {
  if (input.expectedRuleCount === undefined) return [];
  if (!enumeration.enumerated) return [];
  if (input.expectedRuleCount === enumeration.validCombinationCount) return [];
  return [
    {
      categoryId: "CEG-19",
      severity: "high",
      targetId: input.sectionId,
      detail: `宣言されたデシジョンテーブル列数 ${input.expectedRuleCount} 件が、原因と制約から算出した列数 ${enumeration.validCombinationCount} 件と一致しない。`,
      suggestion: "宣言値の根拠を確認し、モデル（原因・制約）側の誤りか宣言値側の誤りかを切り分けること。",
    },
  ];
}

// --- 16. 指摘の集約 ---

export function buildCauseEffectFindings(
  input: AnalyzeCauseEffectInput,
  graph: CauseEffectGraph,
  enumeration: CauseEffectEnumeration,
  sentences: CauseEffectSentence[]
): CauseEffectFinding[] {
  return [
    ...findUnknownNodeRefs(input, graph),
    ...findDuplicateNodeIds(input),
    ...findPrefixMismatchNodeIds(input),
    ...findIsolatedCauses(graph),
    ...findUnreachableEffects(graph),
    ...findOrphanIntermediateNodes(graph),
    ...findCycleFindings(graph),
    ...findConstraintShapeFindings(input, graph),
    ...findConstraintConsistencyFindings(input, graph, enumeration),
    ...findEffectVariabilityFindings(enumeration, graph),
    ...findUngroundedNodeQuotes(input),
    ...findUnmodeledSentences(input, sentences),
    ...findUnmodeledConnectives(input, graph, sentences),
    ...findDeclaredRuleCountFindings(input, enumeration),
  ];
}

// buildCauseEffectFindings の前段として、全列挙の前提チェックに使う構造検査だけを集める。
export function buildStructuralBlockingFindings(
  input: AnalyzeCauseEffectInput,
  graph: CauseEffectGraph
): CauseEffectFinding[] {
  return [
    ...findUnknownNodeRefs(input, graph),
    ...findDuplicateNodeIds(input),
    ...findCycleFindings(graph),
    ...findConstraintShapeFindings(input, graph),
  ];
}

// --- 17. サマリ ---

export function summarizeCauseEffect(
  input: AnalyzeCauseEffectInput,
  graph: CauseEffectGraph,
  enumeration: CauseEffectEnumeration,
  sentences: CauseEffectSentence[],
  findings: CauseEffectFinding[]
): CauseEffectSummary {
  const totalSentenceCount = sentences.length;
  const modeledSentenceCount = sentences.filter((s) => s.modeled).length;
  const modeledSentenceRatioPercent =
    totalSentenceCount === 0 ? 0 : Math.round((modeledSentenceCount / totalSentenceCount) * 1000) / 10;

  return {
    causeCount: graph.causeIds.length,
    effectCount: graph.effectIds.length,
    intermediateCount: graph.intermediateIds.length,
    edgeCount: graph.edges.length,
    constraintCount: (input.constraints ?? []).length,
    theoreticalCombinationCount: enumeration.theoreticalCombinationCount,
    validCombinationCount: enumeration.validCombinationCount,
    compressedRuleCount: enumeration.compressedRules.length,
    enumerated: enumeration.enumerated,
    modeledSentenceCount,
    totalSentenceCount,
    modeledSentenceRatioPercent,
    highCount: findings.filter((f) => f.severity === "high").length,
    mediumCount: findings.filter((f) => f.severity === "medium").length,
    infoCount: findings.filter((f) => f.severity === "info").length,
  };
}

// --- 18. デシジョンテーブルへの引き渡し ---

const MAX_DECISION_TABLE_COMBINATIONS_DEFAULT = 4096;

function toActionValue(value: "T" | "F" | "-"): DecisionTableActionValue {
  if (value === "T") return "Y";
  if (value === "F") return "N";
  return "-";
}

export function buildDecisionTableSpec(
  input: AnalyzeCauseEffectInput,
  graph: CauseEffectGraph,
  enumeration: CauseEffectEnumeration
): DecisionTableSpec | undefined {
  if (!enumeration.enumerated) return undefined;
  if (graph.causeIds.length === 0 || graph.effectIds.length === 0) return undefined;

  const causeById = new Map(input.causes.map((c) => [c.id, c]));
  const effectById = new Map(input.effects.map((e) => [e.id, e]));
  const constraints = input.constraints ?? [];

  const conditions = graph.causeIds.map((id) => ({
    id,
    statement: causeById.get(id)?.statement ?? id,
    levels: ["T", "F"],
  }));
  const actions = graph.effectIds.map((id) => ({
    id,
    statement: effectById.get(id)?.statement ?? id,
  }));

  const invalidCombinations: DecisionTableInvalidCombination[] = [];
  const causeCount = graph.causeIds.length;
  const total = 2 ** causeCount;
  for (let mask = 0; mask < total; mask++) {
    const assignment: boolean[] = [];
    for (let i = 0; i < causeCount; i++) {
      assignment.push(((mask >> (causeCount - 1 - i)) & 1) === 1);
    }
    const valueById = new Map<string, boolean>();
    graph.causeIds.forEach((id, i) => valueById.set(id, assignment[i]));
    const violatedIds = findViolatedCauseConstraintIds(valueById, constraints);
    if (violatedIds.length === 0) continue;

    const when: Record<string, "T" | "F"> = {};
    graph.causeIds.forEach((id) => {
      when[id] = valueById.get(id) ? "T" : "F";
    });
    const labels = violatedIds.map((id) => {
      const constraint = constraints.find((c) => c.id === id);
      return constraint ? constraintTypeLabel(constraint.type) : id;
    });
    invalidCombinations.push({
      id: `IC${invalidCombinations.length + 1}`,
      when,
      reason: `原因結果グラフの制約 ${violatedIds.join(", ")}（${labels.join(", ")}）を満たさない組合せ。`,
    });
  }

  const rules: DecisionTableRuleSpec[] = enumeration.compressedRules.map((rule) => {
    const when: Record<string, "T" | "F"> = {};
    for (const causeId of graph.causeIds) {
      const v = rule.causeValues[causeId];
      if (v === "-" || v === undefined) continue;
      when[causeId] = v;
    }
    const actionsOut: Record<string, DecisionTableActionValue> = {};
    for (const effectId of graph.effectIds) {
      actionsOut[effectId] = toActionValue(rule.effectValues[effectId] ?? "-");
    }
    return { id: `R${rule.no}`, when, actions: actionsOut };
  });

  const spec: DecisionTableSpec = {
    tableId: input.sectionId,
    title: input.sectionTitle ?? input.sectionId,
    conditions,
    actions,
    invalidCombinations,
    rules,
  };

  if (total > MAX_DECISION_TABLE_COMBINATIONS_DEFAULT) {
    spec.maxCombinations = total;
  }

  return spec;
}

export function findDecisionTableHandoverFindings(
  enumeration: CauseEffectEnumeration,
  spec: DecisionTableSpec,
  result: DecisionTableResult
): CauseEffectFinding[] {
  const findings: CauseEffectFinding[] = [];
  const push = (targetId: string | undefined, detail: string): void => {
    findings.push({ categoryId: "CEG-20", severity: "high", targetId, detail });
  };

  if (result.totalCombinationCount !== enumeration.theoreticalCombinationCount) {
    push(
      spec.tableId,
      `design_decision_table で再計算した全組合せ数 ${result.totalCombinationCount} が原因結果グラフの理論上限 ${enumeration.theoreticalCombinationCount} と一致しない。`
    );
  }
  if (result.validCombinationCount !== enumeration.validCombinationCount) {
    push(
      spec.tableId,
      `design_decision_table で再計算した有効組合せ数 ${result.validCombinationCount} が原因結果グラフの制約充足後の組合せ数 ${enumeration.validCombinationCount} と一致しない。`
    );
  }
  if (result.definedCombinationCount !== result.validCombinationCount) {
    push(
      spec.tableId,
      `design_decision_table で動作が確定した組合せ数 ${result.definedCombinationCount} が有効組合せ数 ${result.validCombinationCount} と一致しない。`
    );
  }
  if (result.undefinedCombinationIndexes.length > 0) {
    push(
      String(result.undefinedCombinationIndexes[0]),
      `design_decision_table で動作が未定義の組合せが ${result.undefinedCombinationIndexes.length} 件ある（先頭 index ${result.undefinedCombinationIndexes[0]}）。`
    );
  }
  if (result.conflictingCombinationIndexes.length > 0) {
    push(
      String(result.conflictingCombinationIndexes[0]),
      `design_decision_table でルールの動作が食い違う組合せが ${result.conflictingCombinationIndexes.length} 件ある（先頭 index ${result.conflictingCombinationIndexes[0]}）。`
    );
  }

  for (const combination of result.combinations) {
    if (combination.status !== "valid") continue;
    const values = combination.values;
    const matchedRule = enumeration.rules.find((rule) =>
      Object.keys(values).every((causeId) => {
        const level = values[causeId];
        return rule.causeValues[causeId] === level;
      })
    );
    if (!matchedRule) {
      push(
        spec.tableId,
        `組合せ index ${combination.index} の条件値に一致する原因結果グラフ側のルールが見つからない。`
      );
      continue;
    }
    for (const effectId of spec.actions.map((a) => a.id)) {
      const expected = toActionValue(matchedRule.effectValues[effectId] ?? "-");
      const actual = combination.actions?.[effectId];
      if (actual === expected) continue;
      push(
        effectId,
        `組合せ index ${combination.index} の動作「${effectId}」は design_decision_table 側「${actual ?? "(未確定)"}」に対し原因結果グラフ側の期待値は「${expected}」であり一致しない。`
      );
    }
  }

  for (const finding of result.findings) {
    if (finding.severity !== "high") continue;
    push(finding.target, `design_decision_table 側の指摘 ${finding.categoryId}: ${finding.detail}`);
  }

  return findings;
}

// --- 19. mermaid 図 ---

const CONSTRAINT_EDGE_SYMBOL: Record<CauseEffectConstraintInput["type"], string> = {
  exclusive: "E",
  inclusive: "I",
  onlyOne: "O",
  requires: "R",
  masks: "M",
};

function buildMermaidIdMap(graph: CauseEffectGraph): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const node of graph.nodes) {
    if (map.has(node.id)) continue;
    let base = node.id.replace(/[^A-Za-z0-9_]/g, "_");
    if (base.length === 0) base = "n";
    if (/^[0-9]/.test(base)) base = `n${base}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    map.set(node.id, candidate);
  }
  return map;
}

function mermaidLabel(text: string): string {
  const flat = text.replace(/[\r\n]+/g, " ").replace(/"/g, "'");
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

export function renderCauseEffectMermaid(
  graph: CauseEffectGraph,
  constraints: CauseEffectConstraintInput[]
): string {
  const idMap = buildMermaidIdMap(graph);
  const lines: string[] = ["flowchart LR"];

  for (const node of graph.nodes) {
    const mermaidId = idMap.get(node.id) as string;
    if (node.kind === "cause") {
      lines.push(`  ${mermaidId}(["${node.id}: ${mermaidLabel(node.statement)}"])`);
      continue;
    }
    if (node.kind === "intermediate") {
      lines.push(`  ${mermaidId}{{"${node.id}: ${node.logic.toUpperCase()}"}}`);
      continue;
    }
    lines.push(`  ${mermaidId}["${node.id}: ${mermaidLabel(node.statement)}"]`);
  }

  for (const edge of graph.edges) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (!from || !to) continue;
    lines.push(edge.kind === "not" ? `  ${from} -. NOT .-> ${to}` : `  ${from} --> ${to}`);
  }

  if (constraints.length > 0) {
    lines.push("  %% 制約");
    for (const constraint of constraints) {
      const symbol = CONSTRAINT_EDGE_SYMBOL[constraint.type];
      if (constraint.type === "requires" || constraint.type === "masks") {
        const from = idMap.get(constraint.nodeIds[0]);
        const to = idMap.get(constraint.nodeIds[1]);
        if (!from || !to) continue;
        lines.push(`  ${from} -. ${symbol} .-> ${to}`);
        continue;
      }
      for (let i = 0; i + 1 < constraint.nodeIds.length; i++) {
        const from = idMap.get(constraint.nodeIds[i]);
        const to = idMap.get(constraint.nodeIds[i + 1]);
        if (!from || !to) continue;
        lines.push(`  ${from} -. ${symbol} .-> ${to}`);
      }
    }
  }

  return lines.join("\n");
}
