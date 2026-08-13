import { analyzeCrossMatrix } from "./crossMatrixAnalysis.js";
import { hasDerivedFromRef } from "./derivedFromRefs.js";
import { handoverPayloadCharCount, type HandoverPayloadFinding, type HandoverPayloadRender } from "./handoverPayload.js";
import { testPerspectiveCatalog } from "./resources/testPerspectiveCatalog.js";
import { riskAnalysisFrame } from "./resources/riskAnalysisFrame.js";
import {
  evaluateRisks,
  findUncoveredRequirementIds,
  findUnresolvedDerivedFromRefs,
  findUnusedPerspectiveCategories,
} from "./testConditionAnalysis.js";
import type {
  AuditCrossMatrixInput,
  CrossMatrixAxisItem,
  CrossMatrixAxisSpec,
  CrossMatrixLinkRef,
  ExtractTestConditionsInput,
  RiskAnalysisFrame,
  TestArchitectureHandoverPayload,
  TestCaseHandoverPayload,
  TestConditionInput,
  TestPerspectiveCatalog,
} from "./types.js";

// extract_test_conditions を上流とする下流ツール引き渡しペイロードの生成と往復照合。
// すべて純関数で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。
//
// 下流ツールの zod shape 定数は import しない（testCaseAnalysis 経由の循環importで
// ランタイム undefined になるため）。受け側スキーマ検証はテストでのみ行う。

const CROSS_MATRIX_AXIS_TEST_CONDITION = "TESTCONDITION";
const CROSS_MATRIX_AXIS_REQUIREMENT = "REQUIREMENT";
const CROSS_MATRIX_AXIS_PERSPECTIVE = "PERSPECTIVE";
const CROSS_MATRIX_AXIS_RISK = "RISK";

function idsEqualExact(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function idSetDiff(a: string[], b: string[]): { onlyInA: string[]; onlyInB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    onlyInA: a.filter((v) => !setB.has(v)),
    onlyInB: b.filter((v) => !setA.has(v)),
  };
}

// --- 1. design_test_architecture 引き渡し ---

export function buildTestArchitectureHandoverPayload(
  input: ExtractTestConditionsInput
): TestArchitectureHandoverPayload {
  return {
    testConditions: input.testConditions.map((condition) => {
      const entry: TestArchitectureHandoverPayload["testConditions"][number] = {
        id: condition.id,
        statement: condition.statement,
        target: condition.target,
        perspectiveCategoryId: condition.perspectiveCategoryId,
        containerIds: [],
      };
      // 宣言値をそのまま渡す。導出優先度への書き換え（是正）はしない。
      if (condition.priority !== undefined) entry.priority = condition.priority;
      return entry;
    }),
  };
}

export function buildTestArchitectureHandoverRender(
  input: ExtractTestConditionsInput,
  heading: string,
  catalog: TestPerspectiveCatalog = testPerspectiveCatalog,
  frame: RiskAnalysisFrame = riskAnalysisFrame
): HandoverPayloadRender {
  const payload = buildTestArchitectureHandoverPayload(input);
  const findings: HandoverPayloadFinding[] = [];

  // (a) ID列の順序込み一致
  const payloadIds = payload.testConditions.map((c) => c.id);
  const upstreamIds = input.testConditions.map((c) => c.id);
  if (!idsEqualExact(payloadIds, upstreamIds)) {
    const diff = idSetDiff(payloadIds, upstreamIds);
    findings.push({
      categoryId: "HPO-01",
      severity: "high",
      target: "testConditions",
      detail: `引き渡しペイロードの条件ID列が上流の条件ID列と一致しない（ペイロードのみ: ${
        diff.onlyInA.join(", ") || "なし"
      } / 上流のみ: ${diff.onlyInB.join(", ") || "なし"}）。`,
    });
  }

  // (b) ペイロードを未使用観点カテゴリ算出へ通し直し、3.3節の提示値と照合
  const upstreamUnused = findUnusedPerspectiveCategories(
    input.testConditions,
    catalog,
    input.perspectiveCategoryIds
  ).map((c) => c.id);
  const payloadUnused = findUnusedPerspectiveCategories(
    payload.testConditions as unknown as TestConditionInput[],
    catalog,
    input.perspectiveCategoryIds
  ).map((c) => c.id);
  if (!idsEqualExact(payloadUnused, upstreamUnused)) {
    const diff = idSetDiff(payloadUnused, upstreamUnused);
    findings.push({
      categoryId: "HPO-02",
      severity: "high",
      target: "perspectiveCategoryId",
      detail: `ペイロードから再算出した未使用観点カテゴリ集合が 3.3節の提示値と一致しない（ペイロードのみ: ${
        diff.onlyInA.join(", ") || "なし"
      } / 3.3節のみ: ${diff.onlyInB.join(", ") || "なし"}）。`,
    });
  }

  // (c) 宣言優先度と導出優先度の逸脱
  const evaluations = evaluateRisks(input.testConditions, frame);
  const deviating = evaluations.filter((e) => e.deviates);
  const reasonById = new Map(input.testConditions.map((c) => [c.id, c.priorityDeviationReason]));
  const withoutReason = deviating.filter((e) => {
    const reason = reasonById.get(e.conditionId);
    return reason === undefined || reason.trim() === "";
  });
  if (deviating.length > 0) {
    findings.push({
      categoryId: "HPO-05",
      severity: "medium",
      target: "testConditions[].priority",
      detail: `宣言優先度がリスク導出優先度から逸脱 ${deviating.length} 件（うち逸脱理由未記入 ${withoutReason.length} 件）を宣言値のまま引き渡している。4.4節の指摘に従って是正すること。`,
    });
  }

  const missingStatement = payload.testConditions.filter((c) => c.statement === undefined).map((c) => c.id);
  if (missingStatement.length > 0) {
    findings.push({
      categoryId: "HPO-03",
      severity: "high",
      target: "testConditions[].statement",
      detail: `条件文を上流実体から埋められなかった条件がある: ${missingStatement.join(", ")}。`,
    });
  }

  return {
    heading,
    targetTool: "design_test_architecture",
    payload,
    countLines: [
      `テスト条件 ${payload.testConditions.length} 件 / 生成JSON ${handoverPayloadCharCount(payload)} 文字`,
      `優先度を宣言値のまま引き渡した条件 ${
        payload.testConditions.filter((c) => c.priority !== undefined).length
      } 件（優先度未宣言 ${payload.testConditions.filter((c) => c.priority === undefined).length} 件）`,
    ],
    manualFieldLines: [
      "`containerIds` と `containers[]` はコンテナ設計判断のため利用者が記入する（本ツールは containerIds を空配列で出力する）",
      "`scope` / `decompositionAxisIds` / `testCases` も利用者が用意する",
    ],
    roundTripLines: [
      `design_test_architecture 側の必須フィールド id / containerIds は全 ${payload.testConditions.length} 件で充足している`,
      `未使用観点カテゴリ: ペイロード再算出 ${payloadUnused.length} 件 / 3.3節の提示値 ${upstreamUnused.length} 件`,
    ],
    findings,
  };
}

// --- 2. generate_test_cases 引き渡し ---

export function buildTestCaseHandoverPayload(input: ExtractTestConditionsInput): TestCaseHandoverPayload {
  const payload: TestCaseHandoverPayload = {
    testConditions: input.testConditions.map((condition) => {
      const entry: TestCaseHandoverPayload["testConditions"][number] = {
        id: condition.id,
        target: condition.target,
        statement: condition.statement,
        derivedFrom: condition.derivedFrom,
      };
      if (condition.priority !== undefined) entry.priority = condition.priority;
      if (condition.perspectiveCategoryId !== undefined) {
        entry.perspectiveCategoryId = condition.perspectiveCategoryId;
      }
      if (condition.recommendedTechniques !== undefined) {
        entry.recommendedTechniques = condition.recommendedTechniques;
      }
      // requirementSources 経由の解決は受け側に任せ、条件に明示指定があるときだけ出す。
      if (condition.sourceRefs !== undefined) entry.sourceRefs = condition.sourceRefs;
      return entry;
    }),
    requirementIds: input.requirementIds,
  };

  const riskIds = (input.risks ?? []).map((r) => r.id);
  if (riskIds.length > 0) payload.riskIds = riskIds;
  const personaIds = (input.personas ?? []).map((p) => p.id);
  if (personaIds.length > 0) payload.personaIds = personaIds;
  if (input.requirementSources !== undefined) payload.requirementSources = input.requirementSources;

  return payload;
}

export function buildTestCaseHandoverRender(
  input: ExtractTestConditionsInput,
  heading: string
): HandoverPayloadRender {
  const payload = buildTestCaseHandoverPayload(input);
  const findings: HandoverPayloadFinding[] = [];

  const payloadIds = payload.testConditions.map((c) => c.id);
  const upstreamIds = input.testConditions.map((c) => c.id);
  if (!idsEqualExact(payloadIds, upstreamIds)) {
    const diff = idSetDiff(payloadIds, upstreamIds);
    findings.push({
      categoryId: "HPO-01",
      severity: "high",
      target: "testConditions",
      detail: `引き渡しペイロードの条件ID列が上流の条件ID列と一致しない（ペイロードのみ: ${
        diff.onlyInA.join(", ") || "なし"
      } / 上流のみ: ${diff.onlyInB.join(", ") || "なし"}）。`,
    });
  }

  // 受け側は derivedFrom を requirementIds / riskIds / personaIds の母集団に対して検証する。
  // ペイロードの derivedFrom と各母集団だけを使って上流と同じ未解決参照検査を再実行し、件数を照合する。
  // source は generate_test_cases のスキーマに存在しないため、照合時のみ上流の source を復元する
  // （検査対象は derivedFrom と各ID母集団の引き渡し忠実性であり、source そのものではない）。
  const sourceById = new Map(input.testConditions.map((c) => [c.id, c.source]));
  const reconstructed: ExtractTestConditionsInput = {
    requirementIds: payload.requirementIds,
    testConditions: payload.testConditions.map((c) => ({
      id: c.id,
      target: c.target,
      perspectiveCategoryId: c.perspectiveCategoryId ?? "",
      statement: c.statement,
      source: sourceById.get(c.id) ?? "testbase",
      derivedFrom: c.derivedFrom,
    })),
    risks: (payload.riskIds ?? []).map((id) => ({ id, description: "" })),
    personas: (payload.personaIds ?? []).map((id) => ({ id, role: "" })),
  };
  const upstreamUnresolved = findUnresolvedDerivedFromRefs(input);
  const payloadUnresolved = findUnresolvedDerivedFromRefs(reconstructed);
  if (payloadUnresolved.length !== upstreamUnresolved.length) {
    findings.push({
      categoryId: "HPO-04",
      severity: "high",
      target: "testConditions[].derivedFrom",
      detail: `ペイロードに対して再実行した derivedFrom 未解決参照 ${payloadUnresolved.length} 件が、上流入力に対する ${upstreamUnresolved.length} 件と一致しない。`,
    });
  }

  const emptyDerivedFrom = payload.testConditions.filter((c) => c.derivedFrom.length === 0).map((c) => c.id);
  if (emptyDerivedFrom.length > 0) {
    findings.push({
      categoryId: "HPO-03",
      severity: "high",
      target: "testConditions[].derivedFrom",
      detail: `受け側必須の derivedFrom が空の条件がある: ${emptyDerivedFrom.join(", ")}。`,
    });
  }

  return {
    heading,
    targetTool: "generate_test_cases",
    payload,
    countLines: [
      `テスト条件 ${payload.testConditions.length} 件 / 要件ID ${payload.requirementIds.length} 件 / リスクID ${
        (payload.riskIds ?? []).length
      } 件 / ペルソナID ${(payload.personaIds ?? []).length} 件 / 要件根拠位置 ${
        (payload.requirementSources ?? []).length
      } 件 / 生成JSON ${handoverPayloadCharCount(payload)} 文字`,
      `根拠位置(sourceRefs)を明示指定していた条件 ${
        payload.testConditions.filter((c) => c.sourceRefs !== undefined).length
      } 件`,
    ],
    manualFieldLines: [
      "`additionalCoverageTargets` は網羅対象の意味付け（技法ごとの description）を伴うため機械生成しない。`testCases` / `parameters` / `coverageCriteriaDeclaration` / `testBasisDocuments` も利用者が用意する",
    ],
    roundTripLines: [
      `derivedFrom 未解決参照: ペイロード再実行 ${payloadUnresolved.length} 件 / 上流入力 ${upstreamUnresolved.length} 件`,
      `generate_test_cases 側の必須フィールド id / target / statement / derivedFrom は全 ${payload.testConditions.length} 件で充足している`,
    ],
    findings,
  };
}

// --- 3. audit_cross_matrix 引き渡し ---

function perspectiveAxisPopulation(input: ExtractTestConditionsInput): string[] {
  if (input.perspectiveCategoryIds !== undefined && input.perspectiveCategoryIds.length > 0) {
    return [...input.perspectiveCategoryIds];
  }
  const seen: string[] = [];
  for (const condition of input.testConditions) {
    if (condition.perspectiveCategoryId === undefined) continue;
    if (seen.includes(condition.perspectiveCategoryId)) continue;
    seen.push(condition.perspectiveCategoryId);
  }
  return seen;
}

export function buildCrossMatrixHandoverPayload(input: ExtractTestConditionsInput): AuditCrossMatrixInput {
  const requirementIds = input.requirementIds;
  const riskIds = (input.risks ?? []).map((r) => r.id);
  const perspectiveIds = perspectiveAxisPopulation(input);

  const conditionItems: CrossMatrixAxisItem[] = input.testConditions.map((condition) => {
    const links: CrossMatrixLinkRef[] = [];
    const pushLink = (targetId: string): void => {
      const link: CrossMatrixLinkRef = { targetId, evidenceSource: "extract_test_conditions" };
      // evidence は導出根拠(rationale)がある場合のみ。未記入は受け側で CMX-16[high] になる。
      if (condition.rationale !== undefined && condition.rationale.trim() !== "") {
        link.evidence = condition.rationale;
      }
      links.push(link);
    };
    // findUncoveredRequirementIds と同じ判定述語を使い、上流の算出結果と必ず一致させる。
    for (const requirementId of requirementIds) {
      if (hasDerivedFromRef(condition.derivedFrom, requirementId, "requirement")) pushLink(requirementId);
    }
    for (const riskId of riskIds) {
      if (hasDerivedFromRef(condition.derivedFrom, riskId, "risk")) pushLink(riskId);
    }
    if (
      condition.perspectiveCategoryId !== undefined &&
      perspectiveIds.includes(condition.perspectiveCategoryId)
    ) {
      pushLink(condition.perspectiveCategoryId);
    }
    return { id: condition.id, label: condition.statement, links };
  });

  const axes: CrossMatrixAxisSpec[] = [
    {
      axisId: CROSS_MATRIX_AXIS_TEST_CONDITION,
      axisName: "テスト条件",
      items: conditionItems,
    },
    {
      axisId: CROSS_MATRIX_AXIS_REQUIREMENT,
      axisName: "対象要件ID",
      items: requirementIds.map((id) => ({ id })),
    },
  ];
  if (perspectiveIds.length > 0) {
    axes.push({
      axisId: CROSS_MATRIX_AXIS_PERSPECTIVE,
      axisName: "テスト観点カテゴリ",
      items: perspectiveIds.map((id) => ({ id })),
    });
  }
  if (riskIds.length > 0) {
    axes.push({
      axisId: CROSS_MATRIX_AXIS_RISK,
      axisName: "プロダクトリスク",
      items: riskIds.map((id) => ({ id })),
    });
  }

  const expectedAxisPopulations = [
    { axisId: CROSS_MATRIX_AXIS_REQUIREMENT, ids: [...requirementIds] },
  ];
  if (perspectiveIds.length > 0) {
    expectedAxisPopulations.push({ axisId: CROSS_MATRIX_AXIS_PERSPECTIVE, ids: [...perspectiveIds] });
  }

  return { axes, expectedAxisPopulations };
}

export function buildCrossMatrixHandoverRender(
  input: ExtractTestConditionsInput,
  heading: string
): HandoverPayloadRender {
  const payload = buildCrossMatrixHandoverPayload(input);
  const findings: HandoverPayloadFinding[] = [];

  const conditionAxis = payload.axes[0];
  const linkTotal = conditionAxis.items.reduce((sum, item) => sum + (item.links ?? []).length, 0);
  const linksWithoutEvidence = conditionAxis.items.reduce(
    (sum, item) =>
      sum +
      (item.links ?? []).filter((link) => typeof link === "string" || link.evidence === undefined).length,
    0
  );

  const result = analyzeCrossMatrix(payload);
  const pair = result.pairs.find(
    (p) =>
      (p.axisA === CROSS_MATRIX_AXIS_TEST_CONDITION && p.axisB === CROSS_MATRIX_AXIS_REQUIREMENT) ||
      (p.axisA === CROSS_MATRIX_AXIS_REQUIREMENT && p.axisB === CROSS_MATRIX_AXIS_TEST_CONDITION)
  );

  const upstreamUncovered = findUncoveredRequirementIds(input.requirementIds, input.testConditions);
  let receivedUncovered: string[] = [];
  if (pair === undefined) {
    findings.push({
      categoryId: "HPO-04",
      severity: "high",
      target: `${CROSS_MATRIX_AXIS_TEST_CONDITION} x ${CROSS_MATRIX_AXIS_REQUIREMENT}`,
      detail: "audit_cross_matrix 側で条件×要件の軸ペアが生成されなかった。",
    });
  } else {
    const emptyLines = [...pair.emptyRows, ...pair.emptyColumns].filter(
      (line) => line.axisId === CROSS_MATRIX_AXIS_REQUIREMENT
    );
    receivedUncovered = input.requirementIds.filter((id) => emptyLines.some((line) => line.itemId === id));
    if (!idsEqualExact(receivedUncovered, upstreamUncovered)) {
      const diff = idSetDiff(receivedUncovered, upstreamUncovered);
      findings.push({
        categoryId: "HPO-04",
        severity: "high",
        target: `${CROSS_MATRIX_AXIS_REQUIREMENT}`,
        detail: `audit_cross_matrix が空列と判定した要件ID集合が 3.2節の未カバー要件ID集合と一致しない（受け側のみ: ${
          diff.onlyInA.join(", ") || "なし"
        } / 3.2節のみ: ${diff.onlyInB.join(", ") || "なし"}）。`,
      });
    }
  }

  // 軸ID・項目IDの重複（CMX-02）は受け側の直積表を壊すため転記する。
  for (const finding of result.findings) {
    if (finding.categoryId !== "CMX-02") continue;
    findings.push({
      categoryId: "HPO-04",
      severity: "high",
      target: finding.target,
      detail: `audit_cross_matrix 側の指摘 ${finding.categoryId}: ${finding.detail}`,
    });
  }

  if (linksWithoutEvidence > 0) {
    findings.push({
      categoryId: "HPO-05",
      severity: "medium",
      target: "axes[].items[].links[].evidence",
      detail: `evidence 未記入リンク ${linksWithoutEvidence} 件は受け側で CMX-16[high] になる。テスト条件の rationale へ根拠を記入すること。`,
    });
  }

  return {
    heading,
    targetTool: "audit_cross_matrix",
    payload,
    countLines: [
      `軸 ${payload.axes.length} 件（${payload.axes.map((a) => a.axisId).join(", ")}） / 要素 ${payload.axes.reduce(
        (sum, axis) => sum + axis.items.length,
        0
      )} 件 / リンク ${linkTotal} 件 / 生成JSON ${handoverPayloadCharCount(payload)} 文字`,
      `evidence 記入済みリンク ${linkTotal - linksWithoutEvidence} 件 / 未記入 ${linksWithoutEvidence} 件`,
    ],
    manualFieldLines: [
      "`declaredCoverage` / `exclusions` / `documents` は成果物側の宣言と根拠本文のため利用者が用意する",
      "テスト条件の rationale が未記入の場合、link の `evidence` は機械生成できない",
    ],
    roundTripLines: [
      `条件×要件の空列（未カバー要件ID）: 受け側再計算 ${receivedUncovered.length} 件 / 3.2節の提示値 ${upstreamUncovered.length} 件`,
      `受け側の直積表: 軸ペア ${result.pairs.length} 件 / 孤立要素 ${result.isolatedItems.length} 件`,
    ],
    findings,
  };
}
