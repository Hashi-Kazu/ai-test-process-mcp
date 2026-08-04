import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  GeneratedScenario,
  ScenarioBranchSpec,
  ScenarioFlowFinding,
  ScenarioFlowResult,
  ScenarioFlowSpec,
  ScenarioFlowUseCaseResult,
  ScenarioOutcomeClass,
  ScenarioPassStep,
  ScenarioStepSpec,
  TestCaseCoverageTarget,
  UseCaseSpec,
} from "../types.js";

// design_scenario_flows 固有の決定的エンジン。
// 純関数群で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。

export const MAIN_FLOW_ID = "MAIN";
export const DEFAULT_MAX_SCENARIOS_PER_USE_CASE = 200;

/** 決定的検査の Markdown 出力で、同一区分の指摘を丸める件数。findings 配列自体は全件保持する。 */
const FINDING_RENDER_LIMIT = 50;
/** 網羅対象一覧の表示上限。universe 自体は全件が対象。 */
const TARGET_RENDER_LIMIT = 200;

const MAIN_FLOW_LABEL = "主フロー";

const OUTCOME_CLASS_LABEL: Record<ScenarioOutcomeClass, string> = {
  normal: "正常系",
  "semi-normal": "準正常系",
  abnormal: "異常系",
};

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** 網羅対象ID・description の中で使うため export する（呼び出し側での文字列連結の再実装を防ぐ）。 */
export function scenarioTargetId(useCaseId: string, index: number): string {
  return `SC:${useCaseId}:S${index}`;
}

/** 網羅対象ID・description の中で使うため export する（呼び出し側での文字列連結の再実装を防ぐ）。 */
export function useCaseFlowTargetId(useCaseId: string, flowId: string): string {
  return `UC:${useCaseId}:${flowId}`;
}

function flowLabel(uc: UseCaseSpec, flowId: string): string {
  if (flowId === MAIN_FLOW_ID) return MAIN_FLOW_LABEL;
  const branch = (uc.branches ?? []).find((b) => b.id === flowId);
  return branch ? branch.nameJa : flowId;
}

function flowSteps(uc: UseCaseSpec, flowId: string): ScenarioStepSpec[] {
  if (flowId === MAIN_FLOW_ID) return uc.mainFlow;
  const branch = (uc.branches ?? []).find((b) => b.id === flowId);
  return branch ? branch.steps : [];
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

const normalizeTrigger = (v: string | undefined): string => (v ?? "").trim().replace(/\s+/g, " ");

function checkStepNumbering(
  steps: ScenarioStepSpec[],
  label: string,
  findings: ScenarioFlowFinding[]
): void {
  const seen = new Set<number>();
  steps.forEach((s, i) => {
    if (seen.has(s.no)) {
      findings.push({
        categoryId: "SFC-03",
        severity: "high",
        target: label,
        detail: `「${label}」のステップ番号 ${s.no} が重複している。`,
      });
      return;
    }
    seen.add(s.no);
    if (s.no !== i + 1) {
      findings.push({
        categoryId: "SFC-03",
        severity: "high",
        target: label,
        detail: `「${label}」のステップ番号が1始まりの連番でない（期待: ${i + 1}、実際: ${s.no}）。`,
      });
    }
  });
}

function outcomeClassOf(branch: ScenarioBranchSpec): ScenarioOutcomeClass {
  // 分類は終了状態(outcome)だけで決める。kind(alternate / exception)は分類に使わない。
  return branch.outcome === "goal-achieved" ? "semi-normal" : "abnormal";
}

function toPassStep(flowId: string, step: ScenarioStepSpec): ScenarioPassStep {
  return {
    flowId,
    stepNo: step.no,
    actor: step.actor,
    action: step.action,
    featureIds: [...(step.featureIds ?? [])],
  };
}

// --- メインエンジン ---

export function computeScenarioFlows(spec: ScenarioFlowSpec): ScenarioFlowResult {
  const actors = spec.actors ?? [];
  const useCases = spec.useCases ?? [];
  const declaredFeatureIds = dedupe(spec.featureIds ?? []);
  const testConditions = spec.testConditions;
  const maxScenariosPerUseCase =
    spec.maxScenariosPerUseCase ?? DEFAULT_MAX_SCENARIOS_PER_USE_CASE;

  const findings: ScenarioFlowFinding[] = [];

  // --- 1. 入力検査（宣言と実体の照合） ---
  const actorIds = new Set(actors.map((a) => a.id));
  const checkActor = (actorId: string, label: string): void => {
    if (actorIds.has(actorId)) return;
    findings.push({
      categoryId: "SFC-01",
      severity: "high",
      target: label,
      detail: `「${label}」が未宣言のアクターID「${actorId}」を参照している。`,
    });
  };

  const seenUseCaseIds = new Set<string>();
  for (const uc of useCases) {
    if (seenUseCaseIds.has(uc.id)) {
      findings.push({
        categoryId: "SFC-02",
        severity: "high",
        target: uc.id,
        detail: `ユースケースID「${uc.id}」が重複して宣言されている。`,
      });
    } else {
      seenUseCaseIds.add(uc.id);
    }

    checkActor(uc.primaryActor, `${uc.id} primaryActor`);
    for (const supporting of uc.supportingActors ?? []) {
      checkActor(supporting, `${uc.id} supportingActors`);
    }

    checkStepNumbering(uc.mainFlow, `${uc.id} ${MAIN_FLOW_LABEL}`, findings);
    uc.mainFlow.forEach((s) => checkActor(s.actor, `${uc.id} ${MAIN_FLOW_ID} step${s.no}`));

    const mainStepNos = new Set(uc.mainFlow.map((s) => s.no));
    const seenBranchIds = new Set<string>();
    for (const branch of uc.branches ?? []) {
      const label = `${uc.id} ${branch.id}`;
      if (seenBranchIds.has(branch.id)) {
        findings.push({
          categoryId: "SFC-02",
          severity: "high",
          target: label,
          detail: `ユースケース「${uc.id}」内で分岐ID「${branch.id}」が重複して宣言されている。`,
        });
      } else {
        seenBranchIds.add(branch.id);
      }

      checkStepNumbering(branch.steps, label, findings);
      branch.steps.forEach((s) => checkActor(s.actor, `${label} step${s.no}`));

      if (!mainStepNos.has(branch.fromStepNo)) {
        findings.push({
          categoryId: "SFC-04",
          severity: "high",
          target: label,
          detail: `分岐元のステップ番号 ${branch.fromStepNo} が主フローに存在しない。`,
        });
      }
      if (branch.rejoinStepNo !== undefined) {
        if (!mainStepNos.has(branch.rejoinStepNo)) {
          findings.push({
            categoryId: "SFC-04",
            severity: "high",
            target: label,
            detail: `復帰先のステップ番号 ${branch.rejoinStepNo} が主フローに存在しない。`,
          });
        } else if (branch.rejoinStepNo <= branch.fromStepNo) {
          findings.push({
            categoryId: "SFC-04",
            severity: "high",
            target: label,
            detail: `復帰先のステップ番号 ${branch.rejoinStepNo} が分岐元 ${branch.fromStepNo} 以前を指している。`,
          });
        }
      }

      if (branch.trigger.trim().length === 0) {
        findings.push({
          categoryId: "SFC-05",
          severity: "high",
          target: label,
          detail: `分岐「${branch.nameJa}」に分岐条件(trigger)が記入されていない。`,
        });
      }
    }

    if (!(uc.branches ?? []).some((b) => b.kind === "exception")) {
      findings.push({
        categoryId: "SFC-07",
        severity: "medium",
        target: uc.id,
        detail: `ユースケース「${uc.nameJa}」に例外フローが1件も宣言されておらず、異常系シナリオを構成できない。`,
      });
    }

    // 機能IDの宣言母集団との照合（母集団未宣言時は検査しない）
    if (declaredFeatureIds.length > 0) {
      const allFlows: { flowId: string; steps: ScenarioStepSpec[] }[] = [
        { flowId: MAIN_FLOW_ID, steps: uc.mainFlow },
        ...(uc.branches ?? []).map((b) => ({ flowId: b.id, steps: b.steps })),
      ];
      for (const flow of allFlows) {
        for (const step of flow.steps) {
          for (const featureId of step.featureIds ?? []) {
            if (declaredFeatureIds.includes(featureId)) continue;
            findings.push({
              categoryId: "SFC-06",
              severity: "high",
              target: `${uc.id} ${flow.flowId} step${step.no}`,
              detail: `ステップが未宣言の機能ID「${featureId}」を参照している。`,
            });
          }
        }
      }
    }

    // 機能IDが1件も紐づかないフロー
    const flowsForFeatureCheck: { flowId: string; label: string; steps: ScenarioStepSpec[] }[] = [
      { flowId: MAIN_FLOW_ID, label: MAIN_FLOW_LABEL, steps: uc.mainFlow },
      ...(uc.branches ?? []).map((b) => ({ flowId: b.id, label: b.nameJa, steps: b.steps })),
    ];
    for (const flow of flowsForFeatureCheck) {
      const hasFeature = flow.steps.some((s) => (s.featureIds ?? []).length > 0);
      if (hasFeature) continue;
      findings.push({
        categoryId: "SFC-10",
        severity: "medium",
        target: useCaseFlowTargetId(uc.id, flow.flowId),
        detail: `フロー「${flow.label}」の全ステップに機能IDが付与されておらず、機能ID被覆の根拠が取れない。`,
      });
    }
  }

  const flowCount = useCases.reduce((n, uc) => n + 1 + (uc.branches ?? []).length, 0);

  const skipResult = (skipReason: string): ScenarioFlowResult => ({
    generated: false,
    skipReason,
    useCases: [],
    scenarioCount: 0,
    normalCount: 0,
    semiNormalCount: 0,
    abnormalCount: 0,
    flowCount,
    expandedFlowCount: 0,
    flowExpansionRatioPercent: 0,
    declaredFeatureIds,
    passedFeatureIds: [],
    uncoveredFeatureIds: [...declaredFeatureIds],
    featureCoverageBasis: "unavailable",
    findings,
  });

  // --- 2. 致命的な指摘があれば生成しない ---
  const blocking = findings.filter((f) => f.severity === "high");
  if (blocking.length > 0) {
    const categories = [...new Set(blocking.map((f) => f.categoryId))].sort().join(", ");
    return skipResult(`入力の構造に致命的な指摘(${categories})があるためシナリオ生成を行わなかった`);
  }

  // --- 3. ユースケースあたりのシナリオ数上限 ---
  for (const uc of useCases) {
    const count = 1 + (uc.branches ?? []).length;
    if (count <= maxScenariosPerUseCase) continue;
    findings.push({
      categoryId: "SFC-14",
      severity: "info",
      target: uc.id,
      detail: `ユースケース「${uc.id}」のシナリオ数 ${count} 件が上限 ${maxScenariosPerUseCase} 件を超えるためシナリオ生成を行わなかった。`,
    });
    return skipResult(
      `ユースケース「${uc.id}」のシナリオ数 ${count} 件が上限 ${maxScenariosPerUseCase} 件を超えるためシナリオ生成を行わなかった`
    );
  }

  // --- 4. シナリオ展開（主フロー単独 + 1分岐ずつ。複数分岐の同時通過は生成しない） ---
  const results: ScenarioFlowUseCaseResult[] = [];
  const passedFeatureIdsAll: string[] = [];

  for (const uc of useCases) {
    const branches = uc.branches ?? [];
    const flowIds = [MAIN_FLOW_ID, ...branches.map((b) => b.id)];
    const scenarios: GeneratedScenario[] = [];

    const mainSteps = uc.mainFlow.map((s) => toPassStep(MAIN_FLOW_ID, s));
    scenarios.push({
      index: 1,
      id: scenarioTargetId(uc.id, 1),
      useCaseId: uc.id,
      nameJa: `${uc.nameJa} ${MAIN_FLOW_LABEL}`,
      outcomeClass: "normal",
      passedFlowIds: dedupe(mainSteps.map((s) => s.flowId)),
      steps: mainSteps,
      featureIds: dedupe(mainSteps.flatMap((s) => s.featureIds)),
    });

    branches.forEach((branch, i) => {
      const index = i + 2;
      const steps: ScenarioPassStep[] = [
        ...uc.mainFlow.filter((s) => s.no <= branch.fromStepNo).map((s) => toPassStep(MAIN_FLOW_ID, s)),
        ...branch.steps.map((s) => toPassStep(branch.id, s)),
      ];
      if (branch.rejoinStepNo !== undefined) {
        const rejoin = branch.rejoinStepNo;
        steps.push(
          ...uc.mainFlow.filter((s) => s.no >= rejoin).map((s) => toPassStep(MAIN_FLOW_ID, s))
        );
      }
      scenarios.push({
        index,
        id: scenarioTargetId(uc.id, index),
        useCaseId: uc.id,
        nameJa: `${uc.nameJa} ${branch.nameJa}`,
        branchId: branch.id,
        trigger: branch.trigger,
        outcomeClass: outcomeClassOf(branch),
        passedFlowIds: dedupe(steps.map((s) => s.flowId)),
        steps,
        featureIds: dedupe(steps.flatMap((s) => s.featureIds)),
      });
    });

    for (const scenario of scenarios) {
      for (const featureId of scenario.featureIds) passedFeatureIdsAll.push(featureId);
    }

    const expanded = new Set<string>();
    for (const scenario of scenarios) {
      for (const flowId of scenario.passedFlowIds) expanded.add(flowId);
    }

    // 重複シナリオ（通過ステップ列・分岐条件・分類が完全一致）。
    // 分岐IDそのものは鍵に含めないが、分岐条件(trigger)と分類(終了状態)は含める。
    // 分岐IDを鍵に含めると別IDというだけで常に相異なってしまい、実体として同じ経路になる二重宣言を検出できないため。
    // 一方、ステップ列が同じでも入る条件や終わり方が違えば別シナリオとして扱う。
    const seenSequences = new Map<string, string>();
    for (const scenario of scenarios) {
      const stepKey = scenario.steps
        .map((s) => `${s.flowId === MAIN_FLOW_ID ? "MAIN" : "BRANCH"}#${s.stepNo}:${s.actor}:${s.action}`)
        .join(">");
      const key = `${scenario.outcomeClass}|${normalizeTrigger(scenario.trigger)}|${stepKey}`;
      const first = seenSequences.get(key);
      if (first === undefined) {
        seenSequences.set(key, scenario.id);
        continue;
      }
      findings.push({
        categoryId: "SFC-13",
        severity: "medium",
        target: scenario.id,
        detail: `シナリオ「${scenario.nameJa}」の通過ステップ列・分岐条件・分類が ${first} と完全に一致している。`,
      });
    }

    for (const flowId of flowIds) {
      if (expanded.has(flowId)) continue;
      findings.push({
        categoryId: "SFC-15",
        severity: "medium",
        target: useCaseFlowTargetId(uc.id, flowId),
        detail: `フロー「${flowLabel(uc, flowId)}」にステップが1件も無く、生成シナリオのステップ列に実体として現れない。`,
      });
    }

    results.push({
      useCaseId: uc.id,
      nameJa: uc.nameJa,
      primaryActor: uc.primaryActor,
      flowIds,
      expandedFlowIds: flowIds.filter((id) => expanded.has(id)),
      scenarios,
      normalCount: scenarios.filter((s) => s.outcomeClass === "normal").length,
      semiNormalCount: scenarios.filter((s) => s.outcomeClass === "semi-normal").length,
      abnormalCount: scenarios.filter((s) => s.outcomeClass === "abnormal").length,
    });
  }

  const scenarioCount = results.reduce((n, r) => n + r.scenarios.length, 0);
  const normalCount = results.reduce((n, r) => n + r.normalCount, 0);
  const semiNormalCount = results.reduce((n, r) => n + r.semiNormalCount, 0);
  const abnormalCount = results.reduce((n, r) => n + r.abnormalCount, 0);
  const expandedFlowCount = results.reduce((n, r) => n + r.expandedFlowIds.length, 0);
  const flowExpansionRatioPercent =
    flowCount === 0 ? 0 : Math.round((expandedFlowCount / flowCount) * 1000) / 10;

  if (scenarioCount > 0 && (semiNormalCount === 0 || abnormalCount === 0)) {
    const lacking = [
      semiNormalCount === 0 ? "準正常系" : undefined,
      abnormalCount === 0 ? "異常系" : undefined,
    ].filter((v): v is string => v !== undefined);
    findings.push({
      categoryId: "SFC-08",
      severity: "medium",
      target: "全ユースケース",
      detail: `生成したシナリオに${lacking.join("・")}が1件も含まれていない。分岐の宣言が偏っていないか確認すること。`,
    });
  }

  // --- 5. 機能IDの宣言と実体の双方向照合 ---
  const passedFeatureIds = dedupe(passedFeatureIdsAll);
  const uncoveredFeatureIds = declaredFeatureIds.filter((id) => !passedFeatureIds.includes(id));

  for (const featureId of uncoveredFeatureIds) {
    findings.push({
      categoryId: "SFC-09",
      severity: "medium",
      target: featureId,
      detail: `宣言した機能ID「${featureId}」を通過するシナリオが1件も無い。`,
    });
  }

  const featureCoverageBasis: ScenarioFlowResult["featureCoverageBasis"] =
    declaredFeatureIds.length > 0 ? "declared-population" : "unavailable";
  const featureCoverageRatioPercent =
    featureCoverageBasis === "declared-population"
      ? Math.round(
          ((declaredFeatureIds.length - uncoveredFeatureIds.length) / declaredFeatureIds.length) *
            1000
        ) / 10
      : undefined;

  // --- 6. テスト条件との突合（未指定時は検査しない） ---
  if (testConditions !== undefined) {
    const conditionFeatureIds = dedupe(testConditions.flatMap((c) => c.featureIds ?? []));
    for (const featureId of conditionFeatureIds) {
      if (passedFeatureIds.includes(featureId)) continue;
      const owners = testConditions
        .filter((c) => (c.featureIds ?? []).includes(featureId))
        .map((c) => c.id);
      findings.push({
        categoryId: "SFC-11",
        severity: "medium",
        target: featureId,
        detail: `テスト条件(${owners.join(", ")})が参照する機能ID「${featureId}」を通過するシナリオが無い。`,
      });
    }
    for (const featureId of passedFeatureIds) {
      if (conditionFeatureIds.includes(featureId)) continue;
      findings.push({
        categoryId: "SFC-12",
        severity: "medium",
        target: featureId,
        detail: `シナリオが通過する機能ID「${featureId}」を参照するテスト条件が無い。`,
      });
    }
  }

  return {
    generated: true,
    useCases: results,
    scenarioCount,
    normalCount,
    semiNormalCount,
    abnormalCount,
    flowCount,
    expandedFlowCount,
    flowExpansionRatioPercent,
    declaredFeatureIds,
    passedFeatureIds,
    uncoveredFeatureIds,
    featureCoverageBasis,
    featureCoverageRatioPercent,
    findings,
  };
}

export function buildScenarioFlowCoverageTargets(spec: ScenarioFlowSpec): TestCaseCoverageTarget[] {
  const result = computeScenarioFlows(spec);
  if (!result.generated) return [];

  const targets: TestCaseCoverageTarget[] = [];
  for (const ucResult of result.useCases) {
    const uc = spec.useCases.find((u) => u.id === ucResult.useCaseId) as UseCaseSpec;
    for (const flowId of ucResult.flowIds) {
      targets.push({
        id: useCaseFlowTargetId(ucResult.useCaseId, flowId),
        techniqueId: "use-case-based",
        description: `${ucResult.nameJa} / ${flowLabel(uc, flowId)}`,
        origin: ucResult.useCaseId,
      });
    }
    for (const scenario of ucResult.scenarios) {
      targets.push({
        id: scenario.id,
        techniqueId: "scenario-based",
        description: `${OUTCOME_CLASS_LABEL[scenario.outcomeClass]}: ${scenario.nameJa}`,
        origin: ucResult.useCaseId,
      });
    }
  }
  return targets;
}

export function renderScenarioFlows(spec: ScenarioFlowSpec): string {
  const result = computeScenarioFlows(spec);
  const useCases = spec.useCases ?? [];

  const lines: string[] = [];
  lines.push("# ユースケース／シナリオ設計結果");
  lines.push("");
  if (spec.title) {
    lines.push(`- 対象: ${spec.title}`);
    lines.push("");
  }

  const skipLine = (): void => {
    lines.push(`- 未算出(理由: ${escapeCell(result.skipReason ?? "")})`);
    lines.push("");
  };

  // --- 1. アクター一覧 ---
  lines.push("## 1. アクター一覧");
  lines.push("");
  if ((spec.actors ?? []).length === 0) {
    lines.push("- 宣言なし");
    lines.push("");
  } else {
    lines.push("| アクターID | 名称 | 種別 |");
    lines.push("| --- | --- | --- |");
    for (const actor of spec.actors) {
      const kind = actor.kind === "system" ? "システム" : actor.kind === "human" ? "人" : "-";
      lines.push(`| ${escapeCell(actor.id)} | ${escapeCell(actor.nameJa)} | ${kind} |`);
    }
    lines.push("");
  }

  // --- 2. ユースケース・フロー一覧 ---
  lines.push("## 2. ユースケース・フロー一覧");
  lines.push("");
  lines.push("| ユースケース | フローID | 種別 | 分岐元 | 復帰先 | トリガー | 終了状態 | ステップ数 | 機能ID |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const uc of useCases) {
    const mainFeatures = dedupe(uc.mainFlow.flatMap((s) => s.featureIds ?? []));
    lines.push(
      `| ${escapeCell(`${uc.id} ${uc.nameJa}`)} | ${MAIN_FLOW_ID} | ${MAIN_FLOW_LABEL} | - | - | - | goal-achieved | ${
        uc.mainFlow.length
      } | ${escapeCell(mainFeatures.length === 0 ? "-" : mainFeatures.join(", "))} |`
    );
    for (const branch of uc.branches ?? []) {
      const features = dedupe(branch.steps.flatMap((s) => s.featureIds ?? []));
      const kind = branch.kind === "exception" ? "例外フロー" : "代替フロー";
      lines.push(
        `| ${escapeCell(`${uc.id} ${uc.nameJa}`)} | ${escapeCell(branch.id)} | ${kind} | ${
          branch.fromStepNo
        } | ${branch.rejoinStepNo ?? "復帰なし"} | ${escapeCell(branch.trigger)} | ${branch.outcome} | ${
          branch.steps.length
        } | ${escapeCell(features.length === 0 ? "-" : features.join(", "))} |`
      );
    }
  }
  lines.push("");

  // --- 3. シナリオ一覧 ---
  lines.push("## 3. シナリオ一覧");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    lines.push("| シナリオID | ユースケース | 名称 | 分類 | 通過フロー | ステップ列 | 通過機能ID |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const ucResult of result.useCases) {
      for (const scenario of ucResult.scenarios) {
        const stepText = scenario.steps
          .map((s) => `${s.flowId}#${s.stepNo} ${s.action}`)
          .join(" → ");
        lines.push(
          `| ${escapeCell(scenario.id)} | ${escapeCell(`${ucResult.useCaseId} ${ucResult.nameJa}`)} | ${escapeCell(
            scenario.nameJa
          )} | ${OUTCOME_CLASS_LABEL[scenario.outcomeClass]} | ${escapeCell(
            scenario.passedFlowIds.join(" + ")
          )} | ${escapeCell(stepText === "" ? "-" : stepText)} | ${escapeCell(
            scenario.featureIds.length === 0 ? "-" : scenario.featureIds.join(", ")
          )} |`
        );
      }
    }
    lines.push("");
  }

  // --- 4. 分類サマリ ---
  lines.push("## 4. 分類サマリ");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    lines.push("| ユースケース | 正常系 | 準正常系 | 異常系 | 合計 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const ucResult of result.useCases) {
      lines.push(
        `| ${escapeCell(`${ucResult.useCaseId} ${ucResult.nameJa}`)} | ${ucResult.normalCount} | ${
          ucResult.semiNormalCount
        } | ${ucResult.abnormalCount} | ${ucResult.scenarios.length} |`
      );
    }
    lines.push(
      `| 合計 | ${result.normalCount} | ${result.semiNormalCount} | ${result.abnormalCount} | ${result.scenarioCount} |`
    );
    lines.push("");
  }

  // --- 5. 機能ID被覆 ---
  lines.push("## 5. 機能ID被覆");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else if (result.featureCoverageBasis === "unavailable") {
    lines.push("- 未算出(理由: 機能ID母集団が未宣言)");
    lines.push(
      `- シナリオが通過した機能ID: ${
        result.passedFeatureIds.length === 0 ? "なし" : result.passedFeatureIds.join(", ")
      }`
    );
    lines.push("");
  } else {
    lines.push(`- 宣言母集団(${result.declaredFeatureIds.length}件): ${result.declaredFeatureIds.join(", ")}`);
    lines.push(
      `- 通過(${result.passedFeatureIds.length}件): ${
        result.passedFeatureIds.length === 0 ? "なし" : result.passedFeatureIds.join(", ")
      }`
    );
    lines.push(
      `- 未通過(${result.uncoveredFeatureIds.length}件): ${
        result.uncoveredFeatureIds.length === 0 ? "なし" : result.uncoveredFeatureIds.join(", ")
      }`
    );
    lines.push(
      `- 機能ID被覆率: ${(result.featureCoverageRatioPercent as number).toFixed(1)}%（分母: 宣言母集団 ${
        result.declaredFeatureIds.length
      } 件、分子: シナリオのステップが実際に通過した機能ID ${
        result.declaredFeatureIds.length - result.uncoveredFeatureIds.length
      } 件）`
    );
    lines.push("");
  }

  // --- 6. テスト条件との突合 ---
  lines.push("## 6. テスト条件との突合");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else if (spec.testConditions === undefined) {
    lines.push("- 宣言なし");
    lines.push("");
  } else {
    lines.push("| テスト条件ID | 条件文 | 参照機能ID | 通過シナリオID |");
    lines.push("| --- | --- | --- | --- |");
    for (const condition of spec.testConditions) {
      const featureIds = condition.featureIds ?? [];
      const hitScenarioIds: string[] = [];
      for (const ucResult of result.useCases) {
        for (const scenario of ucResult.scenarios) {
          if (featureIds.some((f) => scenario.featureIds.includes(f))) hitScenarioIds.push(scenario.id);
        }
      }
      lines.push(
        `| ${escapeCell(condition.id)} | ${escapeCell(condition.statement ?? "-")} | ${escapeCell(
          featureIds.length === 0 ? "-" : featureIds.join(", ")
        )} | ${escapeCell(hitScenarioIds.length === 0 ? "なし" : hitScenarioIds.join(", "))} |`
      );
    }
    lines.push("");
  }

  // --- 7. 決定的検査 ---
  lines.push("## 7. 決定的検査");
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("- 指摘なし");
  } else {
    const sorted = [...result.findings].sort((a, b) => a.categoryId.localeCompare(b.categoryId));
    for (const f of sorted.slice(0, FINDING_RENDER_LIMIT)) {
      lines.push(`- [${f.severity}] ${f.categoryId} ${escapeCell(f.target)}: ${escapeCell(f.detail)}`);
    }
    if (sorted.length > FINDING_RENDER_LIMIT) {
      lines.push(`- 他 ${sorted.length - FINDING_RENDER_LIMIT} 件（表示を ${FINDING_RENDER_LIMIT} 件に丸めた）`);
    }
  }
  lines.push("");

  // --- 8. 網羅対象一覧 ---
  lines.push("## 8. 網羅対象一覧(generate_test_cases 引き渡し)");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const targets = buildScenarioFlowCoverageTargets(spec);
    const flowTargets = targets.filter((t) => t.id.startsWith("UC:"));
    const scenarioTargets = targets.filter((t) => t.id.startsWith("SC:"));

    lines.push("### 8.1 フロー(UC:)");
    lines.push("");
    lines.push("| 網羅対象ID | 内容 |");
    lines.push("| --- | --- |");
    for (const t of flowTargets.slice(0, TARGET_RENDER_LIMIT)) {
      lines.push(`| ${escapeCell(t.id)} | ${escapeCell(t.description)} |`);
    }
    lines.push("");
    if (flowTargets.length > TARGET_RENDER_LIMIT) {
      lines.push(`- 他 ${flowTargets.length - TARGET_RENDER_LIMIT} 件`);
      lines.push("");
    }

    lines.push("### 8.2 シナリオ(SC:)");
    lines.push("");
    lines.push("| 網羅対象ID | 内容 |");
    lines.push("| --- | --- |");
    for (const t of scenarioTargets.slice(0, TARGET_RENDER_LIMIT)) {
      lines.push(`| ${escapeCell(t.id)} | ${escapeCell(t.description)} |`);
    }
    lines.push("");
    if (scenarioTargets.length > TARGET_RENDER_LIMIT) {
      lines.push(`- 他 ${scenarioTargets.length - TARGET_RENDER_LIMIT} 件`);
      lines.push("");
    }
    lines.push(
      `- 表は表示上の抜粋であり、generate_test_cases の scenarioFlows へ渡した場合は ${targets.length} 件全てが universe の対象になる。`
    );
    lines.push("");
  }

  // --- 9. サマリ ---
  lines.push("## 9. サマリ");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const featureText =
      result.featureCoverageBasis === "declared-population"
        ? `機能ID被覆率: ${(result.featureCoverageRatioPercent as number).toFixed(1)}%（分母: 宣言母集団 ${
            result.declaredFeatureIds.length
          } 件）`
        : "機能ID被覆率: 未算出(理由: 機能ID母集団が未宣言)";
    lines.push(
      `- ユースケース数: ${result.useCases.length} / フロー数: ${result.flowCount} / 実体化フロー数: ${
        result.expandedFlowCount
      } / フロー展開率: ${result.flowExpansionRatioPercent.toFixed(1)}%（分母: 宣言フロー ${
        result.flowCount
      } 件、分子: 生成シナリオのステップ列に実際に現れたフロー ${
        result.expandedFlowCount
      } 件） / シナリオ数: ${
        result.scenarioCount
      }（正常系 ${result.normalCount} / 準正常系 ${result.semiNormalCount} / 異常系 ${
        result.abnormalCount
      }） / ${featureText} / 指摘: ${result.findings.length} 件`
    );
    lines.push(
      "- フロー展開率は「宣言した各フローがシナリオのステップ列に実体として現れたか」を照合した構造的な指標であり、テストの網羅度ではない。シナリオ展開は宣言された各フローを必ず1件以上のシナリオへ含めるため、全フローにステップが宣言されていれば 100% になる。テストケースに対する実被覆は generate_test_cases の UC: / SC: 網羅対象で数えること。"
    );
  }

  return lines.join("\n").trimEnd() + "\n";
}

const scenarioStepShape = z.object({
  no: z.number().int().positive().describe("Step number, 1-based and sequential within the flow"),
  actor: z.string().describe("Actor id declared in actors[]"),
  action: z.string(),
  featureIds: z.array(z.string()).optional().describe("Feature ids this step passes through"),
});

export const designScenarioFlowsInputShape = {
  title: z.string().optional(),
  actors: z
    .array(
      z.object({
        id: z.string().describe("Actor id, unique within the spec"),
        nameJa: z.string(),
        kind: z.enum(["human", "system"]).optional(),
      })
    )
    .min(1)
    .describe("Actors appearing in the use cases"),
  useCases: z
    .array(
      z.object({
        id: z.string().describe("Use case id, e.g. UC-01"),
        nameJa: z.string(),
        primaryActor: z.string().describe("Actor id declared in actors[]"),
        supportingActors: z.array(z.string()).optional(),
        preconditions: z.array(z.string()).min(1),
        postconditions: z.array(z.string()).optional(),
        mainFlow: z.array(scenarioStepShape).min(1),
        branches: z
          .array(
            z.object({
              id: z.string().describe("Branch id, unique within the use case, e.g. AF-01 / EF-01"),
              kind: z.enum(["alternate", "exception"]),
              nameJa: z.string(),
              fromStepNo: z.number().int().positive().describe("Main flow step number this branch leaves from"),
              trigger: z.string().describe("Condition that triggers this branch (required)"),
              steps: z.array(scenarioStepShape).min(1),
              rejoinStepNo: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Main flow step number this branch returns to; omit if the branch terminates"),
              outcome: z
                .enum(["goal-achieved", "aborted"])
                .describe("goal-achieved becomes a semi-normal scenario, aborted becomes an abnormal one"),
            })
          )
          .optional(),
      })
    )
    .min(1)
    .describe("Use cases to expand into scenarios"),
  featureIds: z
    .array(z.string())
    .optional()
    .describe("Declared feature id population; feature coverage ratio is only computed when this is given"),
  testConditions: z
    .array(
      z.object({
        id: z.string(),
        statement: z.string().optional(),
        featureIds: z.array(z.string()).optional(),
      })
    )
    .optional()
    .describe("Test conditions to reconcile against the feature ids the scenarios pass through"),
  maxScenariosPerUseCase: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Scenario count cap per use case (default 200)"),
} as const;

const designScenarioFlowsInputSchema = z.object(designScenarioFlowsInputShape);
export type DesignScenarioFlowsInput = z.infer<typeof designScenarioFlowsInputSchema>;

export function registerDesignScenarioFlowsTool(server: McpServer): void {
  server.registerTool(
    "design_scenario_flows",
    {
      title: "Design Scenario Flows",
      description:
        "アクター・事前条件・主フロー・代替/例外フローから、シナリオ一覧（正常系/準正常系/異常系分類つき）を決定的に生成し、" +
        "フロー被覆・機能ID通過・テスト条件との突合を検査してMarkdownで返す。" +
        "各フローは UC:、各シナリオは SC: プレフィックスの網羅対象IDとして generate_test_cases の scenarioFlows へそのまま渡せる。" +
        "1シナリオは主フロー＋高々1分岐であり、複数分岐が同時に絡む経路は生成しない（必要なら additionalCoverageTargets で補うこと）。",
      inputSchema: designScenarioFlowsInputShape,
    },
    async (input) => {
      const text = renderScenarioFlows(input as ScenarioFlowSpec);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
