import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { businessRequirementFrame } from "../resources/businessRequirementFrame.js";
import {
  computeFeatureCoverage,
  findDataTouchGaps,
  findDuplicateBusinessRequirementIds,
  findFeatureLessBusinessUseCases,
  findFlowLessBusinessUseCases,
  findIncompletePurposes,
  findMissingBusinessRequirementNumbers,
  findMissingExceptionOperations,
  findMissingRequiredUseCaseAspects,
  findMissingStepActors,
  findOrphanBusinessUseCases,
  findOrphanPurposes,
  findPrefixMismatchBusinessRequirementIds,
  findStateDeclarationMismatches,
  findUndeclaredFeatureIdRefs,
  findUnreferencedFeatureIds,
  findUnresolvedBusinessRequirementRefs,
  businessRequirementEntityLabels,
  resolveBusinessRequirementIdPrefixes,
} from "../businessRequirementAnalysis.js";
import type {
  BusinessDrivingDataInput,
  BusinessRequirementFrame,
  DataAccessKind,
  GenerateBusinessRequirementModelInput,
} from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

const UNFILLED = "未記入(要確認)";

function cellOrUnfilled(value: string | undefined | null): string {
  if (!value || value.trim() === "") return UNFILLED;
  return escapeCell(value);
}

function listOrDash(values: string[] | undefined): string {
  return values && values.length > 0 ? escapeCell(values.join(", ")) : "-";
}

/** データID -> [{useCaseId, access}] のインデックス。flowSteps.dataAccess から実体を組み立てる */
function buildDataUsageIndex(
  input: GenerateBusinessRequirementModelInput
): Map<string, { useCaseId: string; access: DataAccessKind }[]> {
  const index = new Map<string, { useCaseId: string; access: DataAccessKind }[]>();
  for (const step of input.flowSteps ?? []) {
    for (const access of step.dataAccess ?? []) {
      const list = index.get(access.dataId) ?? [];
      list.push({ useCaseId: step.useCaseId, access: access.access });
      index.set(access.dataId, list);
    }
  }
  return index;
}

function formatDataUsage(
  data: BusinessDrivingDataInput,
  usageIndex: Map<string, { useCaseId: string; access: DataAccessKind }[]>
): string {
  const usages = usageIndex.get(data.id) ?? [];
  if (usages.length === 0) return "-";
  return escapeCell(usages.map((u) => `${u.useCaseId}(${u.access})`).join(", "));
}

export function renderBusinessRequirementModel(
  input: GenerateBusinessRequirementModelInput,
  frame: BusinessRequirementFrame = businessRequirementFrame
): string {
  const purposes = input.purposes ?? [];
  const businessUseCases = input.businessUseCases ?? [];
  const flowSteps = input.flowSteps ?? [];
  const drivingData = input.drivingData ?? [];
  const prefixes = resolveBusinessRequirementIdPrefixes(input.idPrefixes);

  const generationOnly = businessUseCases.length === 0;

  if (generationOnly) {
    const lines: string[] = [];
    lines.push("# 業務ユースケース・要件モデル結果");
    lines.push("");
    lines.push("## 1. 前提と対象");
    lines.push("");
    lines.push(`- 対象: ${input.subjectName?.trim() ? escapeCell(input.subjectName.trim()) : "未指定"}`);
    lines.push(
      `- 入力件数: 目的 ${purposes.length} / 業務ユースケース 0 / フロー工程 ${flowSteps.length} / 駆動データ ${drivingData.length}`
    );
    lines.push("- モード: 生成指示のみ(businessUseCases が未指定・空)");
    lines.push(`- 参照フレーム: ${escapeCell(frame.name)}`);
    lines.push(`- ${escapeCell(frame.note)}`);
    lines.push("");
    lines.push(
      `businessUseCases が未指定である。1節「システム化の目的」→2節「業務ユースケース」→3節「業務フロー」→` +
        `4節「駆動する情報」の順に4層を埋め、${prefixes.purpose}/${prefixes.businessUseCase}/${prefixes.flowStep}/${prefixes.drivingData} のIDを振って` +
        "再度本ツールへ渡すこと。"
    );
    lines.push("");
    lines.push("## 2. 意味的層の指示");
    lines.push("");
    for (const layer of frame.layers) {
      lines.push(
        `- ${layer.id} ${layer.nameJa}: ${layer.definition} 質問例: ${layer.questionExamples.join(" / ")}`
      );
    }
    lines.push("");
    return lines.join("\n").trimEnd() + "\n";
  }

  const duplicates = findDuplicateBusinessRequirementIds(input);
  const missingNumbers = findMissingBusinessRequirementNumbers(input);
  const prefixMismatch = findPrefixMismatchBusinessRequirementIds(input);
  const unresolvedRefs = findUnresolvedBusinessRequirementRefs(input);
  const orphanPurposes = findOrphanPurposes(input);
  const orphanUseCases = findOrphanBusinessUseCases(input);
  const featureLessUseCases = findFeatureLessBusinessUseCases(input);
  const unreferencedFeatureIds = findUnreferencedFeatureIds(input);
  const undeclaredFeatureRefs = findUndeclaredFeatureIdRefs(input);
  const flowLessUseCases = findFlowLessBusinessUseCases(input);
  const missingStepActors = findMissingStepActors(input);
  const dataTouchGaps = findDataTouchGaps(input);
  const stateMismatches = findStateDeclarationMismatches(input);
  const incompletePurposes = findIncompletePurposes(input);
  const missingExceptionOperations = findMissingExceptionOperations(input);
  const featureCoverage = computeFeatureCoverage(input);
  const missingRequiredAspects = findMissingRequiredUseCaseAspects(input, frame);

  const usageIndex = buildDataUsageIndex(input);

  const lines: string[] = [];
  lines.push("# 業務ユースケース・要件モデル結果");
  lines.push("");

  // --- 1. 前提と対象 ---
  lines.push("## 1. 前提と対象");
  lines.push("");
  lines.push(`- 対象: ${input.subjectName?.trim() ? escapeCell(input.subjectName.trim()) : "未指定"}`);
  lines.push(
    `- 入力件数: 目的 ${purposes.length} / 業務ユースケース ${businessUseCases.length} / フロー工程 ${flowSteps.length} / 駆動データ ${drivingData.length}`
  );
  lines.push("- モード: 既存成果物のレビュー");
  lines.push(
    `- IDプレフィックス: 目的 ${prefixes.purpose} / 業務ユースケース ${prefixes.businessUseCase} / ` +
      `フロー工程 ${prefixes.flowStep} / 駆動データ ${prefixes.drivingData}`
  );
  lines.push(`- 参照フレーム: ${escapeCell(frame.name)}`);
  lines.push(`- ${escapeCell(frame.note)}`);
  lines.push("");

  // --- 2. 目的階層表 ---
  lines.push("## 2. 目的階層表");
  lines.push("");
  lines.push("| 階層ID | 階層 | 記入内容 | 達成判定指標 |");
  lines.push("| --- | --- | --- | --- |");
  for (const level of frame.purposeLevels) {
    const rowsForLevel = purposes.filter((p) => p.level === level.key);
    if (rowsForLevel.length === 0) {
      lines.push(`| ${escapeCell(level.id)} | ${escapeCell(level.key)} | ${UNFILLED} | ${UNFILLED} |`);
    } else {
      for (const p of rowsForLevel) {
        lines.push(
          `| ${escapeCell(level.id)} | ${escapeCell(p.id)} | ${cellOrUnfilled(p.statement)} | ${cellOrUnfilled(
            p.achievementMetric
          )} |`
        );
      }
    }
  }
  lines.push("");

  // --- 3. 業務ユースケース一覧表 ---
  lines.push("## 3. 業務ユースケース一覧表");
  lines.push("");
  lines.push("| ID | 名称 | 担い手 | 契機 | 完了状態 | 関連機能ID | 例外時運用 | 由来目的ID |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const u of businessUseCases) {
    lines.push(
      `| ${escapeCell(u.id)} | ${cellOrUnfilled(u.name)} | ${cellOrUnfilled(u.actorRoleId)} | ` +
        `${cellOrUnfilled(u.trigger)} | ${cellOrUnfilled(u.completionState)} | ${listOrDash(
          u.featureIds
        )} | ${cellOrUnfilled(u.exceptionOperation)} | ${listOrDash(u.purposeIds)} |`
    );
  }
  lines.push("");

  // --- 4. 業務フロー表 ---
  lines.push("## 4. 業務フロー表");
  lines.push("");
  lines.push("| ユースケースID | 工程No | 担い手 | 行為 | 受け渡す情報 | 分岐条件 | 機能ID |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  if (flowSteps.length === 0) {
    lines.push(`| - | - | ${UNFILLED} | - | - | - | - |`);
  } else {
    for (const s of flowSteps) {
      lines.push(
        `| ${escapeCell(s.useCaseId)} | ${s.no} | ${cellOrUnfilled(s.actorRoleId)} | ${cellOrUnfilled(
          s.action
        )} | ${cellOrUnfilled(s.handedOverInfo)} | ${cellOrUnfilled(s.branchCondition)} | ${listOrDash(
          s.featureIds
        )} |`
      );
    }
  }
  lines.push("");

  // --- 5. 駆動データ表 ---
  lines.push("## 5. 駆動データ表");
  lines.push("");
  lines.push(
    "| ID | 名称 | 推奨データ区分 | 発生源 | 状態を持つか | 共有範囲 | 利用ユースケースID・アクセス種別 |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const d of drivingData) {
    lines.push(
      `| ${escapeCell(d.id)} | ${cellOrUnfilled(d.name)} | ${cellOrUnfilled(d.suggestedKind)} | ` +
        `${cellOrUnfilled(d.source)} | ${d.hasStates === undefined ? UNFILLED : d.hasStates ? "はい" : "いいえ"} | ` +
        `${cellOrUnfilled(d.sharingScope)} | ${formatDataUsage(d, usageIndex)} |`
    );
  }
  lines.push("");

  // --- 6. 決定的整合性検査 ---
  lines.push("## 6. 決定的整合性検査");
  lines.push("");

  if (unresolvedRefs.length === 0) {
    lines.push("- BRC-01[high] 未解決参照: なし");
  } else {
    for (const ref of unresolvedRefs) {
      lines.push(
        `- BRC-01[high] 未解決参照: ${escapeCell(ref.ownerId)} が参照する「${escapeCell(
          ref.ref
        )}」は ${escapeCell(ref.expectedKind)} に存在しない。`
      );
    }
  }

  if (duplicates.length === 0 && missingNumbers.length === 0 && prefixMismatch.length === 0) {
    lines.push("- BRC-02[medium] ID重複・欠番・プレフィックス不一致: なし");
  } else {
    for (const dup of duplicates) {
      lines.push(
        `- BRC-02[medium] ID重複: ${businessRequirementEntityLabels[dup.kind]} ${dup.id}(${dup.count}件)`
      );
    }
    for (const miss of missingNumbers) {
      lines.push(`- BRC-02[medium] 欠番: ${businessRequirementEntityLabels[miss.kind]} ${miss.id}`);
    }
    for (const issue of prefixMismatch) {
      lines.push(
        `- BRC-02[medium] プレフィックス不一致: ${businessRequirementEntityLabels[issue.kind]} ${issue.id}(期待 ${issue.expectedPrefix})`
      );
    }
  }

  if (orphanPurposes.length === 0) {
    lines.push("- BRC-03[high] どの業務ユースケースからも参照されない目的: なし");
  } else {
    for (const p of orphanPurposes) {
      lines.push(`- BRC-03[high] ${escapeCell(p.id)}: どの業務ユースケースからも参照されていない。`);
    }
  }

  if (orphanUseCases.length === 0) {
    lines.push("- BRC-04[high] どの目的にも紐づかない業務ユースケース: なし");
  } else {
    for (const id of orphanUseCases) {
      lines.push(`- BRC-04[high] ${escapeCell(id)}: purposeIds が未指定または空である。`);
    }
  }

  if (featureLessUseCases.length === 0) {
    lines.push("- BRC-05[medium] 機能IDが1件も紐づかない業務ユースケース: なし");
  } else {
    for (const id of featureLessUseCases) {
      lines.push(`- BRC-05[medium] ${escapeCell(id)}: featureIds が未指定または空である。`);
    }
  }

  if (!input.featureIdPopulation || input.featureIdPopulation.length === 0) {
    lines.push("- BRC-06[medium] 機能ID母集団未宣言のため未検査");
    lines.push("- BRC-07[high] 機能ID母集団未宣言のため未検査");
  } else {
    if (unreferencedFeatureIds.length === 0) {
      lines.push("- BRC-06[medium] 母集団のうちどの業務ユースケースからも参照されない機能ID: なし");
    } else {
      lines.push(
        `- BRC-06[medium] 母集団のうちどの業務ユースケースからも参照されない機能ID: ${escapeCell(
          unreferencedFeatureIds.join(", ")
        )}`
      );
    }
    if (undeclaredFeatureRefs.length === 0) {
      lines.push("- BRC-07[high] 宣言した機能ID母集団に無い機能IDの参照: なし");
    } else {
      for (const ref of undeclaredFeatureRefs) {
        lines.push(
          `- BRC-07[high] ${escapeCell(ref.ownerId)} が参照する機能ID「${escapeCell(
            ref.featureId
          )}」は母集団に無い。`
        );
      }
    }
  }

  if (flowLessUseCases.length === 0) {
    lines.push("- BRC-08[medium] 業務フローの工程が0件の業務ユースケース: なし");
  } else {
    for (const id of flowLessUseCases) {
      lines.push(`- BRC-08[medium] ${escapeCell(id)}: 紐づく業務フロー工程が0件である。`);
    }
  }

  if (missingStepActors.length === 0) {
    lines.push("- BRC-09[high] 工程の担い手が未記入: なし");
  } else {
    for (const s of missingStepActors) {
      lines.push(
        `- BRC-09[high] ${escapeCell(s.stepId)}(${escapeCell(s.useCaseId)} 工程No.${s.no}): 担い手が未記入である。`
      );
    }
  }

  if (dataTouchGaps.untouchedDataIds.length === 0 && dataTouchGaps.dataLessUseCaseIds.length === 0) {
    lines.push("- BRC-10[medium] 未接触の駆動データ・業務ユースケース: なし");
  } else {
    for (const id of dataTouchGaps.untouchedDataIds) {
      lines.push(`- BRC-10[medium] 駆動データ ${escapeCell(id)}: どの工程からも read/update されていない。`);
    }
    for (const id of dataTouchGaps.dataLessUseCaseIds) {
      lines.push(`- BRC-10[medium] 業務ユースケース ${escapeCell(id)}: どの駆動データにも触れていない。`);
    }
  }

  if (stateMismatches.length === 0) {
    lines.push("- BRC-11[high] hasStates 宣言と states 実体の不一致: なし");
  } else {
    for (const m of stateMismatches) {
      const detail =
        m.kind === "declared-but-no-states"
          ? "hasStates:true と宣言されているが states が未宣言である。"
          : "states が宣言されているが hasStates が false である。";
      lines.push(`- BRC-11[high] 駆動データ ${escapeCell(m.dataId)}: ${detail}`);
    }
  }

  if (incompletePurposes.length === 0) {
    lines.push("- BRC-12[medium] 達成判定指標・測定方法の未記入: なし");
  } else {
    for (const p of incompletePurposes) {
      lines.push(
        `- BRC-12[medium] ${escapeCell(p.id)}: 未記入の項目 ${escapeCell(p.missing.join(", "))}。`
      );
    }
  }

  if (missingExceptionOperations.length === 0) {
    lines.push("- BRC-13[medium] 例外時の業務運用(BUC-06)が未記入: なし");
  } else {
    for (const id of missingExceptionOperations) {
      lines.push(
        `- BRC-13[medium] ${escapeCell(id)}: 例外時の業務運用が未記入で、design_scenario_flows の例外フローを起こせない。`
      );
    }
  }

  if (featureCoverage.basis === "unavailable") {
    lines.push(
      "- BRC-14[high] 機能ID被覆率: featureCoverageBasis=unavailable(機能ID母集団が未宣言のため被覆率は算出しない)" +
        (featureCoverage.claimedPercent !== undefined
          ? `。claimedFeatureCoveragePercent(${featureCoverage.claimedPercent}%)は裏付け不能である。`
          : "。")
    );
  } else {
    lines.push(
      `- 機能ID被覆率: featureCoverageBasis=declared-population、算出値 ${featureCoverage.computedPercent}%` +
        (featureCoverage.claimedPercent !== undefined
          ? `、宣言値 ${featureCoverage.claimedPercent}%`
          : "")
    );
    if (featureCoverage.mismatch) {
      lines.push(
        `- BRC-14[high] claimedFeatureCoveragePercent(${featureCoverage.claimedPercent}%)と算出値(${featureCoverage.computedPercent}%)が不一致である。`
      );
    } else {
      lines.push("- BRC-14[high] claimedFeatureCoveragePercent と算出値の不一致: なし");
    }
  }

  if (missingRequiredAspects.length === 0) {
    lines.push("- BRC-15[medium] 必須観点(useCaseAspects required:true)の空欄: なし");
  } else {
    for (const row of missingRequiredAspects) {
      lines.push(
        `- BRC-15[medium] ${escapeCell(row.id)}: 未記入の必須観点 ${escapeCell(row.missingAspectIds.join(", "))}。`
      );
    }
  }
  lines.push("");

  lines.push(
    `- サマリ: 業務ユースケース数 ${businessUseCases.length} / フロー工程数 ${flowSteps.length} / 駆動データ数 ${drivingData.length} / ` +
      `重複ID数 ${duplicates.length} / 欠番数 ${missingNumbers.length} / プレフィックス不一致数 ${prefixMismatch.length} / ` +
      `未解決参照数 ${unresolvedRefs.length} / 孤立目的数 ${orphanPurposes.length} / 目的未紐づけ業務ユースケース数 ${orphanUseCases.length} / ` +
      `機能ID未紐づけ業務ユースケース数 ${featureLessUseCases.length} / フロー工程0件業務ユースケース数 ${flowLessUseCases.length} / ` +
      `担い手未記入工程数 ${missingStepActors.length} / 未接触駆動データ数 ${dataTouchGaps.untouchedDataIds.length} / ` +
      `状態宣言不一致数 ${stateMismatches.length} / 達成判定指標未記入数 ${incompletePurposes.length} / ` +
      `例外運用未記入数 ${missingExceptionOperations.length} / 必須観点空欄数 ${missingRequiredAspects.length}`
  );
  lines.push("");

  // --- 7. 意味的層の指示 ---
  lines.push("## 7. 意味的層の指示");
  lines.push("");
  lines.push("### 7.1 4層の深掘り");
  lines.push("");
  for (const layer of frame.layers) {
    lines.push(
      `- ${layer.id} ${layer.nameJa}: ${layer.definition} 質問例: ${layer.questionExamples.join(" / ")}`
    );
  }
  lines.push("");
  lines.push("### 7.2 目的階層の深掘り");
  lines.push("");
  for (const level of frame.purposeLevels) {
    const unfilled = incompletePurposes.some((p) => {
      const purpose = purposes.find((x) => x.id === p.id);
      return purpose?.level === level.key;
    });
    lines.push(
      `- ${level.id} ${level.key}${unfilled ? "(未記入・優先)" : ""}: ${level.definition} 質問例: ${level.questionExamples.join(
        " / "
      )}`
    );
  }
  lines.push("");
  lines.push("### 7.3 業務ユースケース観点の深掘り");
  lines.push("");
  for (const aspect of frame.useCaseAspects) {
    const unfilled = missingRequiredAspects.some((row) => row.missingAspectIds.includes(aspect.id));
    const exceptionMissing = aspect.id === "BUC-06" && missingExceptionOperations.length > 0;
    const featureMissing = aspect.id === "BUC-05" && featureLessUseCases.length > 0;
    lines.push(
      `- ${aspect.id} ${aspect.nameJa}${unfilled || exceptionMissing || featureMissing ? "(未記入・優先)" : ""}: ${aspect.definition} 質問例: ${aspect.questionExamples.join(
        " / "
      )}`
    );
  }
  lines.push("");
  lines.push("### 7.4 業務フロー観点の深掘り");
  lines.push("");
  for (const aspect of frame.flowAspects) {
    lines.push(`- ${aspect.id} ${aspect.nameJa}: ${aspect.definition} 質問例: ${aspect.questionExamples.join(" / ")}`);
  }
  lines.push("");
  lines.push("### 7.5 駆動データ観点の深掘り");
  lines.push("");
  for (const aspect of frame.dataAspects) {
    const kinds =
      aspect.suggestedDataClassKinds && aspect.suggestedDataClassKinds.length > 0
        ? ` 推奨データ区分: ${aspect.suggestedDataClassKinds.join(", ")}`
        : "";
    lines.push(`- ${aspect.id} ${aspect.nameJa}: ${aspect.definition} 質問例: ${aspect.questionExamples.join(" / ")}${kinds}`);
  }
  lines.push("");

  // --- 8. 下流への引き渡し ---
  lines.push("## 8. 下流への引き渡し");
  lines.push("");
  const conventionById = new Map(frame.handoverConventions.map((c) => [c.id, c]));

  lines.push("### 8.1 design_scenario_flows への変換");
  lines.push("");
  const brh01 = conventionById.get("BRH-01");
  if (brh01) {
    for (const rule of brh01.rules) lines.push(`- ${rule}`);
  }
  lines.push("");
  lines.push("| 業務ユースケースID | → useCases[].id | 担い手 → actors[] | 契機 → preconditions | 例外運用 → branches[kind=exception] |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const u of businessUseCases) {
    lines.push(
      `| ${escapeCell(u.id)} | ${escapeCell(u.id)} | ${cellOrUnfilled(u.actorRoleId)} | ${cellOrUnfilled(
        u.trigger
      )} | ${cellOrUnfilled(u.exceptionOperation)} |`
    );
  }
  lines.push("");

  lines.push("### 8.2 design_test_data データ区分表");
  lines.push("");
  const brh02 = conventionById.get("BRH-02");
  if (brh02) {
    for (const rule of brh02.rules) lines.push(`- ${rule}`);
  }
  lines.push("");
  lines.push("| 駆動データID | → dataClasses[].id | 推奨kind | states 宣言 |");
  lines.push("| --- | --- | --- | --- |");
  for (const d of drivingData) {
    lines.push(
      `| ${escapeCell(d.id)} | ${escapeCell(d.id)} | ${cellOrUnfilled(d.suggestedKind)} | ${listOrDash(
        d.states
      )} |`
    );
  }
  lines.push("");

  lines.push("### 8.3 audit_cross_matrix 軸定義表");
  lines.push("");
  const brh03 = conventionById.get("BRH-03");
  if (brh03) {
    for (const rule of brh03.rules) lines.push(`- ${rule}`);
  }
  lines.push("");
  lines.push("| 軸ID | 軸名 | 要素 |");
  lines.push("| --- | --- | --- |");
  lines.push(`| BIZUC | 業務ユースケース軸 | ${listOrDash(businessUseCases.map((u) => u.id))} |`);
  lines.push(
    `| FEATURE | 機能ID軸 | ${listOrDash(
      input.featureIdPopulation && input.featureIdPopulation.length > 0
        ? input.featureIdPopulation
        : Array.from(allReferencedFeatureIdsForRender(input))
    )} |`
  );
  lines.push("");

  lines.push("### 8.4 テスト目的導出フレームへの申し送り");
  lines.push("");
  const brh04 = conventionById.get("BRH-04");
  if (brh04) {
    lines.push(`- ${brh04.id} 対象ツール: ${escapeCell(brh04.targetTool)}(available: ${brh04.available})`);
    for (const rule of brh04.rules) lines.push(`- ${rule}`);
    lines.push(
      `- 目的階層ID: ${listOrDash(purposes.map((p) => p.id))}`
    );
  }
  lines.push("");

  // --- 9. persona フレームとの役割分担 ---
  lines.push("## 9. persona フレームとの役割分担");
  lines.push("");
  lines.push(`- 本フレームの範囲: ${escapeCell(frame.roleSeparation.businessFrameScope)}`);
  lines.push(`- persona フレームの範囲: ${escapeCell(frame.roleSeparation.personaFrameScope)}`);
  lines.push("");
  lines.push("| トピック | 正となる側 | 運用規則 |");
  lines.push("| --- | --- | --- |");
  for (const topic of frame.roleSeparation.sharedTopics) {
    lines.push(`| ${escapeCell(topic.topic)} | ${escapeCell(topic.owner)} | ${escapeCell(topic.rule)} |`);
  }
  lines.push("");
  for (const note of frame.roleSeparation.avoidDuplication) {
    lines.push(`- ${note}`);
  }
  lines.push("");

  return lines.join("\n").trimEnd() + "\n";
}

function allReferencedFeatureIdsForRender(input: GenerateBusinessRequirementModelInput): Set<string> {
  const ids = new Set<string>();
  for (const u of input.businessUseCases ?? []) {
    for (const f of u.featureIds ?? []) ids.add(f);
  }
  for (const s of input.flowSteps ?? []) {
    for (const f of s.featureIds ?? []) ids.add(f);
  }
  return ids;
}

const businessUseCaseShape = z.object({
  id: z.string().describe("Business use case id, e.g. BUC-01"),
  purposeIds: z.array(z.string()).optional().describe("Ids of purposes this use case derives from"),
  name: z.string().optional().describe("Business-side name of this use case (BUC-01)"),
  actorRoleId: z.string().optional().describe("Business role id that owns this use case (BUC-02, references roles[].id)"),
  trigger: z.string().optional().describe("What triggers this use case (BUC-03)"),
  completionState: z.string().optional().describe("Business completion state of this use case (BUC-04)"),
  featureIds: z.array(z.string()).optional().describe("Feature ids this use case spans (BUC-05)"),
  exceptionOperation: z
    .string()
    .optional()
    .describe("Manual business operation used when the system does not behave as expected (BUC-06)"),
});

export const generateBusinessRequirementModelInputShape = {
  subjectName: z.string().optional().describe("Target system / project name"),
  roles: z
    .array(z.object({ id: z.string().describe("Role id"), nameJa: z.string().describe("Role name") }))
    .optional()
    .describe("Business role ids referenced by businessUseCases[].actorRoleId / flowSteps[].actorRoleId"),
  purposes: z
    .array(
      z.object({
        id: z.string().describe("Purpose id, e.g. PUR-01"),
        level: z
          .enum(["businessGoal", "systemizationPurpose", "achievementMetric"])
          .describe("Purpose hierarchy level"),
        statement: z.string().describe("Statement of this purpose"),
        achievementMetric: z.string().optional().describe("Achievement metric for this purpose"),
        measurementMethod: z.string().optional().describe("How the metric is measured"),
      })
    )
    .optional()
    .describe("Systemization purpose hierarchy (business goal / systemization purpose / achievement metric)"),
  businessUseCases: z
    .array(businessUseCaseShape)
    .optional()
    .describe("Business use cases; omitted or empty triggers generation-instruction-only mode"),
  flowSteps: z
    .array(
      z.object({
        id: z.string().describe("Flow step id, e.g. BFL-01"),
        useCaseId: z.string().describe("Parent business use case id"),
        no: z.number().describe("Step number within the use case"),
        actorRoleId: z.string().optional().describe("Role id performing this step (references roles[].id)"),
        action: z.string().optional().describe("Action performed in this step"),
        handedOverInfo: z.string().optional().describe("Information handed over to the next step"),
        branchCondition: z.string().optional().describe("Branch condition / authority for decisions in this step"),
        featureIds: z.array(z.string()).optional().describe("Feature ids touched by this step"),
        dataAccess: z
          .array(
            z.object({
              dataId: z.string().describe("drivingData[].id being accessed"),
              access: z.enum(["read", "update"]).describe("Access kind"),
            })
          )
          .optional()
          .describe("Driving data read/update by this step"),
      })
    )
    .optional()
    .describe("Business flow steps"),
  drivingData: z
    .array(
      z.object({
        id: z.string().describe("Driving data id, e.g. BDT-01"),
        name: z.string().describe("Name of this driving data"),
        suggestedKind: z
          .enum(["master", "transaction", "counter", "credential", "external-settlement", "time-dependent"])
          .optional()
          .describe("Suggested design_test_data DataClassKind"),
        source: z.string().optional().describe("Where this data originates"),
        hasStates: z.boolean().optional().describe("Whether this data has lifecycle states (declared)"),
        states: z.array(z.string()).optional().describe("Actual state names (substantiates hasStates)"),
        sharingScope: z.string().optional().describe("Sharing scope across use cases / actors"),
        retentionPeriod: z.string().optional().describe("Retention period / applicable regulation"),
        usedByUseCaseIds: z
          .array(z.string())
          .optional()
          .describe("Declared business use case ids that use this data"),
      })
    )
    .optional()
    .describe("Driving data behind the business flows"),
  featureIdPopulation: z
    .array(z.string())
    .optional()
    .describe("Declared population of feature ids; omitted disables population-based checks and the coverage rate"),
  claimedFeatureCoveragePercent: z
    .number()
    .optional()
    .describe("Claimed feature id coverage percent, checked against the computed value when the population is declared"),
  idPrefixes: z
    .object({
      purpose: z.string().optional().describe("Purpose id prefix (default PUR-)"),
      businessUseCase: z.string().optional().describe("Business use case id prefix (default BUC-)"),
      flowStep: z.string().optional().describe("Flow step id prefix (default BFL-)"),
      drivingData: z.string().optional().describe("Driving data id prefix (default BDT-)"),
    })
    .optional()
    .describe("Id prefixes used for duplicate / gap / prefix-mismatch detection"),
} as const;

export function registerGenerateBusinessRequirementModelTool(server: McpServer): void {
  server.registerTool(
    "generate_business_requirement_model",
    {
      title: "Generate Business Requirement Model",
      description:
        "業務側から見た「システム化の目的 → 業務ユースケース → 業務フロー → 駆動する情報」の4層モデルを、" +
        "機能IDの章立てに従属せずに再構成する。決定的層(BRC-01..BRC-15)は、目的/業務ユースケース/フロー工程/駆動データの" +
        "ID重複・欠番・プレフィックス不一致・未解決参照、目的と業務ユースケースの相互紐づけ、機能ID母集団との双方向照合、" +
        "業務フローの工程0件・担い手未記入、駆動データの未接触、hasStates宣言とstates実体の照合、達成判定指標の未記入、" +
        "例外時の業務運用の未記入、宣言した機能ID被覆率と算出値の一致、必須観点の空欄を検査する。businessUseCases が" +
        "未指定・空の場合は生成指示のみを返す。design_scenario_flows / design_test_data / audit_cross_matrix への" +
        "引き渡し表と、テスト目的の導出フレーム(#85未実装)への申し送り、testcondition://persona/journey-frame との" +
        "役割分担を併せて出力する。",
      inputSchema: generateBusinessRequirementModelInputShape,
    },
    async (input) => {
      const markdown = renderBusinessRequirementModel(input as GenerateBusinessRequirementModelInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
