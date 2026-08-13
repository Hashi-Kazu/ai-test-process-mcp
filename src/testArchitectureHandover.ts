import { analyzeCrossMatrix } from "./crossMatrixAnalysis.js";
import { handoverPayloadCharCount, type HandoverPayloadFinding, type HandoverPayloadRender } from "./handoverPayload.js";
import { computeExecutionOrder } from "./tools/analyzeExecutionOrder.js";
import { computeTestArchitecture } from "./tools/designTestArchitecture.js";
import type {
  AuditCrossMatrixInput,
  CrossMatrixAxisItem,
  CrossMatrixLinkRef,
  ExecutionOrderHandoverPayload,
  ExecutionOrderSpec,
  TestArchitectureSpec,
  TestContainerPriorityClass,
} from "./types.js";

// design_test_architecture を上流とする下流ツール引き渡しペイロードの生成と往復照合。
// すべて純関数で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。
//
// 受け側 zod shape 定数は import しない（循環importでランタイム undefined になるため）。
// import してよいのは循環しても巻き上げられる純粋な関数宣言だけ。

const CROSS_MATRIX_AXIS_CONTAINER = "CONTAINER";
const CROSS_MATRIX_AXIS_TEST_CONDITION = "TESTCONDITION";

function idsEqualExact(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function idSetDiff(a: string[], b: string[]): { onlyInA: string[]; onlyInB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return { onlyInA: a.filter((v) => !setB.has(v)), onlyInB: b.filter((v) => !setA.has(v)) };
}

// --- 1. analyze_execution_order 引き渡し ---

export function buildExecutionOrderHandoverPayload(
  spec: TestArchitectureSpec
): ExecutionOrderHandoverPayload | undefined {
  const result = computeTestArchitecture(spec);
  if (!result.generated) return undefined;

  const containerById = new Map((spec.containers ?? []).map((c) => [c.id, c]));
  const payload: ExecutionOrderHandoverPayload = {
    nodes: result.containers.map((row) => {
      const container = containerById.get(row.containerId);
      return {
        id: row.containerId,
        nameJa: container?.nameJa ?? row.containerId,
        kind: "container" as const,
        priorityClass: (container?.priorityClass ?? "must") as TestContainerPriorityClass,
      };
    }),
    architectureContainerIds: result.containers.map((row) => row.containerId),
  };
  if (spec.title !== undefined) payload.title = spec.title;
  return payload;
}

export function buildExecutionOrderHandoverRender(
  spec: TestArchitectureSpec,
  heading: string
): HandoverPayloadRender {
  const result = computeTestArchitecture(spec);
  const payload = buildExecutionOrderHandoverPayload(spec);

  const base = {
    heading,
    targetTool: "analyze_execution_order",
    manualFieldLines: [
      "`dependsOn` / `durationHours` / `resources` / `slos` / `exitCriteria` / `monitoringCheckpoints` は実行計画側の判断のため利用者が記入する",
      "`maxParallelism` / `dataItemIds` / `claimed*`（宣言値との照合用）も利用者が用意する",
    ],
  };

  if (payload === undefined) {
    return {
      ...base,
      payload: undefined,
      unavailableReason:
        result.skipReason ?? "design_test_architecture がコンテナ構成を算出できていないため引き渡しJSONを生成しない",
      countLines: [],
      roundTripLines: [],
      findings: [],
    };
  }

  const findings: HandoverPayloadFinding[] = [];
  const executionResult = computeExecutionOrder(payload as unknown as ExecutionOrderSpec);

  // (a) 未計画コンテナ 0件
  if (executionResult.unplannedContainerIds.length > 0) {
    findings.push({
      categoryId: "HPO-04",
      severity: "high",
      target: "architectureContainerIds",
      detail: `analyze_execution_order が未計画コンテナを ${executionResult.unplannedContainerIds.length} 件検出した: ${executionResult.unplannedContainerIds.join(", ")}。`,
    });
  }
  // (b) 計画被覆率 100%
  if (executionResult.coverage.basis !== "computed" || executionResult.coverage.percent !== 100) {
    findings.push({
      categoryId: "HPO-04",
      severity: "high",
      target: "coverage",
      detail: `analyze_execution_order が再計算した計画被覆率が 100% にならない（基準: ${
        executionResult.coverage.basis
      } / 値: ${executionResult.coverage.percent ?? "未算出"}）。`,
    });
  }
  // (c) ノード数 = コンテナ数
  if (payload.nodes.length !== result.containers.length) {
    findings.push({
      categoryId: "HPO-01",
      severity: "high",
      target: "nodes",
      detail: `ペイロードのノード数 ${payload.nodes.length} がコンテナ実体 ${result.containers.length} 件と一致しない。`,
    });
  }
  const payloadIds = payload.nodes.map((n) => n.id);
  const containerIds = result.containers.map((c) => c.containerId);
  if (!idsEqualExact(payloadIds, containerIds)) {
    const diff = idSetDiff(payloadIds, containerIds);
    findings.push({
      categoryId: "HPO-01",
      severity: "high",
      target: "nodes[].id",
      detail: `ペイロードのノードID列がコンテナ実体のID列と一致しない（ペイロードのみ: ${
        diff.onlyInA.join(", ") || "なし"
      } / コンテナ実体のみ: ${diff.onlyInB.join(", ") || "なし"}）。`,
    });
  }

  // (d) priorityClass 分布の一致
  const payloadDistribution = new Map<string, number>();
  for (const node of payload.nodes) {
    payloadDistribution.set(node.priorityClass, (payloadDistribution.get(node.priorityClass) ?? 0) + 1);
  }
  for (const row of result.priorityClassDistribution) {
    const payloadCount = payloadDistribution.get(row.key) ?? 0;
    if (payloadCount === row.containerCount) continue;
    findings.push({
      categoryId: "HPO-02",
      severity: "high",
      target: `priorityClass=${row.key}`,
      detail: `ペイロードから数えた優先度クラス ${row.key} のノード数 ${payloadCount} が 5節の分布 ${row.containerCount} 件と一致しない。`,
    });
  }

  // (e) EOC-05（dependsOn 未宣言）の件数はノード数と一致するはず
  const eoc05Count = executionResult.findings.filter((f) => f.categoryId === "EOC-05").length;
  if (eoc05Count !== payload.nodes.length) {
    findings.push({
      categoryId: "HPO-04",
      severity: "high",
      target: "nodes[].dependsOn",
      detail: `analyze_execution_order が返した EOC-05 の件数 ${eoc05Count} がノード数 ${payload.nodes.length} と一致しない。`,
    });
  } else if (payload.nodes.length > 0) {
    findings.push({
      categoryId: "HPO-05",
      severity: "medium",
      target: "nodes[].dependsOn",
      detail: `dependsOn 未宣言 ${payload.nodes.length} 件は受け側で EOC-05 になる。依存関係は利用者が記入すること（依存なしを主張するなら空配列 [] を渡すこと）。`,
    });
  }

  const distributionText = result.priorityClassDistribution
    .map((row) => `${row.key} ${payloadDistribution.get(row.key) ?? 0}/${row.containerCount}`)
    .join(" / ");

  return {
    ...base,
    payload,
    countLines: [
      `実行ノード ${payload.nodes.length} 件 / アーキテクチャ母集団 ${payload.architectureContainerIds.length} 件 / 生成JSON ${handoverPayloadCharCount(
        payload
      )} 文字`,
      `優先度クラス分布（ペイロード/5節）: ${distributionText || "対象なし"}`,
    ],
    roundTripLines: [
      `analyze_execution_order 再計算: 未計画コンテナ ${executionResult.unplannedContainerIds.length} 件 / 計画被覆率 ${
        executionResult.coverage.percent ?? "未算出"
      }%（分母 ${executionResult.coverage.denominator}）`,
      `analyze_execution_order 側の EOC-05(dependsOn 未宣言): ${eoc05Count} 件 / ノード ${payload.nodes.length} 件`,
    ],
    findings,
  };
}

// --- 2. audit_cross_matrix 引き渡し ---

export function buildArchitectureCrossMatrixPayload(
  spec: TestArchitectureSpec
): AuditCrossMatrixInput | undefined {
  const result = computeTestArchitecture(spec);
  if (!result.generated) return undefined;

  const containerById = new Map((spec.containers ?? []).map((c) => [c.id, c]));
  const containerItems: CrossMatrixAxisItem[] = result.containers.map((row) => {
    const container = containerById.get(row.containerId);
    const links: CrossMatrixLinkRef[] = row.conditionIds.map((conditionId) => {
      const link: CrossMatrixLinkRef = { targetId: conditionId, evidenceSource: "design_test_architecture" };
      if (container?.responsibility !== undefined && container.responsibility.trim() !== "") {
        link.evidence = container.responsibility;
      }
      return link;
    });
    return { id: row.containerId, label: container?.nameJa ?? row.containerId, links };
  });

  return {
    axes: [
      { axisId: CROSS_MATRIX_AXIS_CONTAINER, axisName: "テストコンテナ", items: containerItems },
      {
        axisId: CROSS_MATRIX_AXIS_TEST_CONDITION,
        axisName: "テスト条件",
        items: (spec.testConditions ?? []).map((condition) => {
          const item: CrossMatrixAxisItem = { id: condition.id };
          if (condition.statement !== undefined) item.label = condition.statement;
          return item;
        }),
      },
    ],
    expectedAxisPopulations: [
      { axisId: CROSS_MATRIX_AXIS_TEST_CONDITION, ids: (spec.testConditions ?? []).map((c) => c.id) },
    ],
  };
}

export function buildArchitectureCrossMatrixRender(
  spec: TestArchitectureSpec,
  heading: string
): HandoverPayloadRender {
  const result = computeTestArchitecture(spec);
  const payload = buildArchitectureCrossMatrixPayload(spec);

  const base = {
    heading,
    targetTool: "audit_cross_matrix",
    manualFieldLines: [
      "`declaredCoverage` / `exclusions` / `documents` は成果物側の宣言と根拠本文のため利用者が用意する",
      "コンテナの responsibility が未記入の場合、link の `evidence` は機械生成できない",
    ],
  };

  if (payload === undefined) {
    return {
      ...base,
      payload: undefined,
      unavailableReason:
        result.skipReason ?? "design_test_architecture がコンテナ構成を算出できていないため引き渡しJSONを生成しない",
      countLines: [],
      roundTripLines: [],
      findings: [],
    };
  }

  const findings: HandoverPayloadFinding[] = [];
  const matrix = analyzeCrossMatrix(payload);

  const isolatedConditionIds = (spec.testConditions ?? [])
    .map((c) => c.id)
    .filter((id) =>
      matrix.isolatedItems.some(
        (item) => item.axisId === CROSS_MATRIX_AXIS_TEST_CONDITION && item.itemId === id
      )
    );
  if (!idsEqualExact(isolatedConditionIds, result.unassignedConditionIds)) {
    const diff = idSetDiff(isolatedConditionIds, result.unassignedConditionIds);
    findings.push({
      categoryId: "HPO-04",
      severity: "high",
      target: CROSS_MATRIX_AXIS_TEST_CONDITION,
      detail: `audit_cross_matrix が孤立と判定した条件ID集合が 4節の未帰属条件ID集合と一致しない（受け側のみ: ${
        diff.onlyInA.join(", ") || "なし"
      } / 4節のみ: ${diff.onlyInB.join(", ") || "なし"}）。`,
    });
  }

  for (const finding of matrix.findings) {
    if (finding.categoryId !== "CMX-02") continue;
    findings.push({
      categoryId: "HPO-04",
      severity: "high",
      target: finding.target,
      detail: `audit_cross_matrix 側の指摘 ${finding.categoryId}: ${finding.detail}`,
    });
  }

  const linkTotal = payload.axes[0].items.reduce((sum, item) => sum + (item.links ?? []).length, 0);
  const linksWithoutEvidence = payload.axes[0].items.reduce(
    (sum, item) =>
      sum +
      (item.links ?? []).filter((link) => typeof link === "string" || link.evidence === undefined).length,
    0
  );
  if (linksWithoutEvidence > 0) {
    findings.push({
      categoryId: "HPO-05",
      severity: "medium",
      target: "axes[].items[].links[].evidence",
      detail: `evidence 未記入リンク ${linksWithoutEvidence} 件は受け側で CMX-16[high] になる。コンテナの responsibility へ根拠を記入すること。`,
    });
  }

  return {
    ...base,
    payload,
    countLines: [
      `軸 ${payload.axes.length} 件（${payload.axes
        .map((a) => a.axisId)
        .join(", ")}） / コンテナ ${payload.axes[0].items.length} 件 / テスト条件 ${
        payload.axes[1].items.length
      } 件 / リンク ${linkTotal} 件 / 生成JSON ${handoverPayloadCharCount(payload)} 文字`,
      `evidence 記入済みリンク ${linkTotal - linksWithoutEvidence} 件 / 未記入 ${linksWithoutEvidence} 件`,
    ],
    roundTripLines: [
      `孤立したテスト条件: 受け側再計算 ${isolatedConditionIds.length} 件 / 4節の未帰属条件 ${result.unassignedConditionIds.length} 件`,
      `受け側の直積表: 軸ペア ${matrix.pairs.length} 件 / 空行 ${matrix.summary.emptyRowTotal} 件 / 空列 ${matrix.summary.emptyColumnTotal} 件`,
    ],
    findings,
  };
}
