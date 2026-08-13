import { handoverPayloadCharCount, type HandoverPayloadFinding, type HandoverPayloadRender } from "./handoverPayload.js";
import { buildScenarioFlowCoverageTargets, computeScenarioFlows } from "./tools/designScenarioFlows.js";
import type { ScenarioFlowSpec, ScenarioFlowTestCaseHandoverPayload } from "./types.js";

// design_scenario_flows → generate_test_cases 引き渡しペイロードの生成と往復照合。
// すべて純関数で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。
//
// 受け側 zod shape 定数は import しない（循環importでランタイム undefined になるため）。
// buildScenarioFlowCoverageTargets は generate_test_cases が実際に呼ぶのと同じ関数宣言であり、
// 循環しても巻き上げられるため安全に呼び出せる。

function idsEqualExact(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function buildScenarioFlowsTestCasePayload(
  spec: ScenarioFlowSpec
): ScenarioFlowTestCaseHandoverPayload | undefined {
  const result = computeScenarioFlows(spec);
  if (!result.generated) return undefined;

  const scenarioFlows: ScenarioFlowTestCaseHandoverPayload["scenarioFlows"] = {
    actors: spec.actors,
    useCases: spec.useCases,
  };
  // 上流に存在するキーだけを入れる。completedTools は受け側の宣言であり引き渡さない。
  if (spec.title !== undefined) scenarioFlows.title = spec.title;
  if (spec.featureIds !== undefined) scenarioFlows.featureIds = spec.featureIds;
  if (spec.testConditions !== undefined) scenarioFlows.testConditions = spec.testConditions;
  if (spec.maxScenariosPerUseCase !== undefined) {
    scenarioFlows.maxScenariosPerUseCase = spec.maxScenariosPerUseCase;
  }

  return { scenarioFlows };
}

export function buildScenarioFlowsTestCaseRender(
  spec: ScenarioFlowSpec,
  heading: string
): HandoverPayloadRender {
  const result = computeScenarioFlows(spec);
  const payload = buildScenarioFlowsTestCasePayload(spec);

  const base = {
    heading,
    targetTool: "generate_test_cases",
    manualFieldLines: [
      "`testConditions` / `parameters` / `testCases` など scenarioFlows 以外の generate_test_cases 入力は利用者が用意する",
      "`additionalCoverageTargets` は網羅対象の意味付けを伴うため機械生成しない",
    ],
  };

  if (payload === undefined) {
    return {
      ...base,
      payload: undefined,
      unavailableReason: result.skipReason ?? "シナリオが算出できていないため引き渡しJSONを生成しない",
      countLines: [],
      roundTripLines: [],
      findings: [],
    };
  }

  const findings: HandoverPayloadFinding[] = [];

  // 8節が表示している網羅対象と、ペイロードから受け側と同じ関数で再生成した網羅対象の照合。
  const upstreamTargets = buildScenarioFlowCoverageTargets(spec);
  const payloadTargets = buildScenarioFlowCoverageTargets(payload.scenarioFlows as ScenarioFlowSpec);
  const upstreamIds = upstreamTargets.map((t) => t.id);
  const payloadIds = payloadTargets.map((t) => t.id);
  if (!idsEqualExact(payloadIds, upstreamIds)) {
    findings.push({
      categoryId: "HPO-04",
      severity: "high",
      target: "scenarioFlows",
      detail: `ペイロードから再生成した網羅対象ID列（${payloadIds.length} 件）が 8節の対象ID列（${upstreamIds.length} 件）と順序込みで一致しない。`,
    });
  }
  if (payloadTargets.length !== upstreamTargets.length) {
    findings.push({
      categoryId: "HPO-02",
      severity: "high",
      target: "scenarioFlows",
      detail: `ペイロードから再生成した網羅対象件数 ${payloadTargets.length} が 8節の総件数 ${upstreamTargets.length} と一致しない。`,
    });
  }

  const flowTargetCount = payloadIds.filter((id) => id.startsWith("UC:")).length;
  const scenarioTargetCount = payloadIds.filter((id) => id.startsWith("SC:")).length;

  return {
    ...base,
    payload,
    countLines: [
      `アクター ${payload.scenarioFlows.actors.length} 件 / ユースケース ${
        payload.scenarioFlows.useCases.length
      } 件 / 機能ID母集団 ${(payload.scenarioFlows.featureIds ?? []).length} 件 / テスト条件参照 ${
        (payload.scenarioFlows.testConditions ?? []).length
      } 件 / 生成JSON ${handoverPayloadCharCount(payload)} 文字`,
      `引き渡し後に universe の対象となる網羅対象 ${payloadTargets.length} 件（UC: ${flowTargetCount} 件 / SC: ${scenarioTargetCount} 件）`,
    ],
    roundTripLines: [
      `網羅対象ID列: ペイロード再生成 ${payloadIds.length} 件 / 8節の提示 ${upstreamIds.length} 件`,
    ],
    findings,
  };
}
