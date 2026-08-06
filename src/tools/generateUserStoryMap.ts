import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { personaJourneyFrame } from "../resources/personaJourneyFrame.js";
import {
  findIncompletePersonaQuadrants,
  formatPersonaQuadrantCell,
  personaQuadrantColumns,
} from "../testConditionAnalysis.js";
import {
  findDuplicateStoryMapIds,
  findIncompleteTestRequirementRows,
  findMissingStoryMapNumbers,
  findPersonasWithoutStories,
  findPersonasWithoutTestRequirements,
  findPrefixMismatchStoryMapIds,
  findUnknownDomainAnalysisAspectIds,
  findUnresolvedStoryMapRefs,
  findUnusedDomainAnalysisAspects,
  resolveStoryMapIdPrefixes,
  storyMapEntityLabels,
} from "../userStoryMapAnalysis.js";
import {
  evaluateStakeholderWeighting,
  findFocusPersonasWithoutTestRequirements,
  hasAnyStakeholderWeighting,
  resolveStakeholderWeightingAxisLabels,
  stakeholderAxisAllowedValues,
  stakeholderWeightingShape,
} from "../stakeholderWeightingAnalysis.js";
import type {
  GenerateUserStoryMapInput,
  PersonaJourneyFrame,
  UserStoryMapActivityInput,
  UserStoryMapStoryInput,
  UserStoryMapTaskInput,
} from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

const UNFILLED = "未記入(要確認)";

interface StoryMapRow {
  personaIds: string;
  productGoal: string;
  activity: string;
  task: string;
  story: string;
  priority: string;
}

function activityCell(activity: UserStoryMapActivityInput): string {
  return `${activity.id} ${activity.activity}`;
}
function taskCell(task: UserStoryMapTaskInput): string {
  return `${task.id} ${task.task}`;
}
function storyCell(story: UserStoryMapStoryInput): string {
  return `${story.id} ${story.story}`;
}

/** 5階層マップ表の行を、アクティビティ → タスク → ユーザーストーリーの入力順で組み立てる */
function buildStoryMapRows(input: GenerateUserStoryMapInput): StoryMapRow[] {
  const activities = input.activities ?? [];
  const tasks = input.tasks ?? [];
  const stories = input.stories ?? [];
  const activityIds = new Set(activities.map((a) => a.id));
  const taskIds = new Set(tasks.map((t) => t.id));

  const rows: StoryMapRow[] = [];
  for (const activity of activities) {
    const activityTasks = tasks.filter((t) => t.activityId === activity.id);
    const base = {
      personaIds: activity.personaIds.length > 0 ? activity.personaIds.join(", ") : "-",
      productGoal: activity.productGoal,
      activity: activityCell(activity),
    };
    if (activityTasks.length === 0) {
      rows.push({ ...base, task: "-", story: "-", priority: "-" });
      continue;
    }
    for (const task of activityTasks) {
      const taskStories = stories.filter((s) => s.taskId === task.id);
      if (taskStories.length === 0) {
        rows.push({ ...base, task: taskCell(task), story: "-", priority: "-" });
        continue;
      }
      for (const story of taskStories) {
        rows.push({
          ...base,
          personaIds:
            story.personaIds && story.personaIds.length > 0
              ? story.personaIds.join(", ")
              : base.personaIds,
          task: taskCell(task),
          story: storyCell(story),
          priority: story.priority ?? "未設定",
        });
      }
    }
  }

  // 上位が未解決のタスク・ストーリーも表から落とさない（6.2 で不整合として指摘される）
  for (const task of tasks) {
    if (activityIds.has(task.activityId)) continue;
    rows.push({
      personaIds: "-",
      productGoal: UNFILLED,
      activity: `${task.activityId}(未解決)`,
      task: taskCell(task),
      story: "-",
      priority: "-",
    });
  }
  for (const story of stories) {
    if (taskIds.has(story.taskId)) continue;
    rows.push({
      personaIds:
        story.personaIds && story.personaIds.length > 0 ? story.personaIds.join(", ") : "-",
      productGoal: UNFILLED,
      activity: "-",
      task: `${story.taskId}(未解決)`,
      story: storyCell(story),
      priority: story.priority ?? "未設定",
    });
  }
  return rows;
}

export function renderUserStoryMap(
  input: GenerateUserStoryMapInput,
  frame: PersonaJourneyFrame = personaJourneyFrame
): string {
  const personas = input.personas ?? [];
  const activities = input.activities ?? [];
  const tasks = input.tasks ?? [];
  const stories = input.stories ?? [];
  const testRequirements = input.testRequirements ?? [];
  const domainAnalysis = input.domainAnalysis ?? [];
  const prefixes = resolveStoryMapIdPrefixes(input.idPrefixes);
  const generationOnly =
    activities.length === 0 &&
    tasks.length === 0 &&
    stories.length === 0 &&
    testRequirements.length === 0;

  const duplicates = findDuplicateStoryMapIds(input);
  const missingNumbers = findMissingStoryMapNumbers(input);
  const prefixMismatch = findPrefixMismatchStoryMapIds(input);
  const unresolvedRefs = findUnresolvedStoryMapRefs(input);
  const personasWithoutStories = findPersonasWithoutStories(input);
  const personasWithoutTestRequirements = findPersonasWithoutTestRequirements(input);
  const incompleteQuadrants = findIncompletePersonaQuadrants(personas);
  const incompleteRequirementRows = findIncompleteTestRequirementRows(input);
  const unusedAspects = findUnusedDomainAnalysisAspects(input, frame);
  const unknownAspectIds = findUnknownDomainAnalysisAspectIds(input, frame);
  const swf = frame.stakeholderWeightingFrame;
  const axisLabels = resolveStakeholderWeightingAxisLabels(frame);
  const weightingSpecified = hasAnyStakeholderWeighting(personas);
  const weightingEvaluations = evaluateStakeholderWeighting(personas, frame);
  const focusPersonasWithoutTestRequirements = findFocusPersonasWithoutTestRequirements(input, frame);

  const lines: string[] = [];
  lines.push("# 利用状況モデリング結果");
  lines.push("");

  // --- 1. 前提と対象 ---
  lines.push("## 1. 前提と対象");
  lines.push("");
  lines.push(`- 対象: ${input.subjectName?.trim() ? escapeCell(input.subjectName.trim()) : "未指定"}`);
  lines.push(
    `- 入力件数: ペルソナ ${personas.length} / アクティビティ ${activities.length} / タスク ${tasks.length} / ユーザーストーリー ${stories.length} / テスト要求 ${testRequirements.length}`
  );
  lines.push(
    `- モード: ${
      generationOnly
        ? "生成指示のみ(アクティビティ・タスク・ユーザーストーリー・テスト要求が未指定)"
        : "既存成果物のレビュー"
    }`
  );
  lines.push(
    `- IDプレフィックス: アクティビティ ${prefixes.activity} / タスク ${prefixes.task} / ユーザーストーリー ${prefixes.story} / テスト要求 ${prefixes.testRequirement}`
  );
  lines.push(`- 参照フレーム: ${escapeCell(frame.name)}`);
  lines.push(`- ${escapeCell(frame.note)}`);
  lines.push("");

  // --- 2. ドメイン分析 ---
  lines.push("## 2. ドメイン分析");
  lines.push("");
  lines.push("| 観点ID | 観点 | 概要 | 把握した事実 | 状態 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const aspect of frame.domainAnalysisAspects) {
    const findings = domainAnalysis
      .filter((d) => d.aspectId === aspect.id)
      .flatMap((d) => d.findings ?? [])
      .filter((f) => f.trim() !== "");
    lines.push(
      `| ${escapeCell(aspect.id)} | ${escapeCell(aspect.nameJa)} | ${escapeCell(
        aspect.summary
      )} | ${escapeCell(findings.length > 0 ? findings.join("; ") : UNFILLED)} | ${
        findings.length > 0 ? "記入済み" : "未記入"
      } |`
    );
  }
  lines.push("");
  if (unknownAspectIds.length > 0) {
    for (const id of unknownAspectIds) {
      lines.push(
        `- [medium] 「${escapeCell(id)}」はフレームに存在しないドメイン分析観点IDである。DOM-xx のいずれかへ修正すること。`
      );
    }
    lines.push("");
  }

  // --- 3. ペルソナ4象限シート ---
  lines.push("## 3. ペルソナ4象限シート");
  lines.push("");
  lines.push("### 3.1 ペルソナ4象限シート");
  lines.push("");
  if (personas.length === 0) {
    lines.push("- ペルソナの指定なし。まず4象限でペルソナを立案すること。");
  } else {
    lines.push("| ペルソナID | 役割 | 氏名 | 属性 | 発言・思考 | 目標 | 不満点 |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const p of personas) {
      const quadrantCells = personaQuadrantColumns
        .map((column) => escapeCell(formatPersonaQuadrantCell(p, column.key)))
        .join(" | ");
      lines.push(
        `| ${escapeCell(p.id)} | ${escapeCell(p.role)} | ${escapeCell(p.name ?? "-")} | ${quadrantCells} |`
      );
    }
  }
  lines.push("");

  lines.push(
    `### 3.2 ステークホルダー2軸評価（${escapeCell(swf.influenceAxis.nameJa)}×${escapeCell(
      swf.interestAxis.nameJa
    )}）`
  );
  lines.push("");
  lines.push("| 軸ID | 軸 | 値 | レベル | 判定基準 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const axis of [swf.influenceAxis, swf.interestAxis]) {
    for (const level of axis.levels) {
      lines.push(
        `| ${escapeCell(axis.id)} | ${escapeCell(axis.nameJa)} | ${level.value} | ${escapeCell(
          level.label
        )} | ${escapeCell(level.criteria)} |`
      );
    }
  }
  lines.push("");
  lines.push(`- 得点化: ${escapeCell(swf.formula)} 高評価の下限(highThreshold): ${swf.highThreshold}`);
  lines.push("");
  lines.push("| クラスID | クラス | 条件 | 既定優先度 | 指針 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const handlingClass of swf.handlingClasses) {
    lines.push(
      `| ${escapeCell(handlingClass.id)} | ${escapeCell(handlingClass.nameJa)} | ${escapeCell(
        handlingClass.rule
      )} | ${escapeCell(handlingClass.defaultConditionPriority)} | ${escapeCell(handlingClass.guidance)} |`
    );
  }
  lines.push("");
  if (!weightingSpecified) {
    lines.push(
      "ステークホルダー2軸評価が未指定である。上記の軸定義と扱いクラスに従い、すべてのペルソナについて" +
        `${swf.influenceAxis.nameJa}・${swf.interestAxis.nameJa}を評価し、その根拠となる事実を添えて ` +
        "personas[].stakeholderWeighting へ渡して再度本ツールで検査すること。"
    );
  } else {
    lines.push(
      `| ペルソナID | 役割 | ${swf.influenceAxis.nameJa} | ${swf.interestAxis.nameJa} | スコア | 導出クラス | 宣言クラス | 評価根拠 | 絞り込み |`
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const evaluation of weightingEvaluations) {
      const persona = personas.find((p) => p.id === evaluation.personaId);
      const weighting = persona?.stakeholderWeighting;
      const scoreCell =
        evaluation.derivedScore === undefined
          ? evaluation.declaredScore === undefined
            ? UNFILLED
            : `${UNFILLED}(宣言 ${evaluation.declaredScore})`
          : evaluation.scoreMismatch
            ? `${evaluation.derivedScore}(宣言 ${evaluation.declaredScore})`
            : `${evaluation.derivedScore}`;
      const rationale = (weighting?.rationale ?? []).filter((r) => r.trim() !== "");
      const screening = evaluation.excludedByScreening
        ? `対象外(${weighting?.exclusionReason?.trim() ? weighting.exclusionReason.trim() : UNFILLED})`
        : "対象";
      lines.push(
        `| ${escapeCell(evaluation.personaId)} | ${escapeCell(persona?.role ?? "-")} | ${
          evaluation.influence ?? UNFILLED
        } | ${evaluation.interest ?? UNFILLED} | ${escapeCell(scoreCell)} | ${escapeCell(
          evaluation.derivedClassId ?? UNFILLED
        )} | ${escapeCell(evaluation.declaredClassId ?? "-")} | ${escapeCell(
          rationale.length > 0 ? rationale.join("; ") : UNFILLED
        )} | ${escapeCell(screening)} |`
      );
    }
  }
  lines.push("");

  // --- 4. ユーザーストーリーマップ ---
  lines.push(
    "## 4. ユーザーストーリーマップ（ペルソナ→プロダクトゴール→アクティビティ→タスク→ユーザーストーリー）"
  );
  lines.push("");
  lines.push("| 階層ID | 階層 | 定義 | 粒度の目安 |");
  lines.push("| --- | --- | --- | --- |");
  for (const level of frame.storyMapLevels) {
    lines.push(
      `| ${escapeCell(level.id)} | ${escapeCell(level.nameJa)} | ${escapeCell(
        level.definition
      )} | ${escapeCell(level.granularityGuidance)} |`
    );
  }
  lines.push("");
  const rows = buildStoryMapRows(input);
  if (rows.length === 0) {
    lines.push(
      "アクティビティ・タスク・ユーザーストーリーが未指定である。3節のペルソナ4象限と上記の階層定義に従い、" +
        `プロダクトゴールから ${prefixes.activity}/${prefixes.task}/${prefixes.story} のIDを振って5階層を作成し、再度本ツールへ渡して決定的検査を通すこと。`
    );
  } else {
    lines.push("| ペルソナID | プロダクトゴール | アクティビティ | タスク | ユーザーストーリー | 優先度 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const row of rows) {
      lines.push(
        `| ${escapeCell(row.personaIds)} | ${escapeCell(row.productGoal)} | ${escapeCell(
          row.activity
        )} | ${escapeCell(row.task)} | ${escapeCell(row.story)} | ${escapeCell(row.priority)} |`
      );
    }
  }
  lines.push("");

  // --- 5. テスト要求導出表 ---
  lines.push("## 5. テスト要求導出表（現状(Before)/将来(After)/テスト要求）");
  lines.push("");
  lines.push("| 列ID | 列 | 定義 |");
  lines.push("| --- | --- | --- |");
  for (const column of frame.testRequirementFrame.columns) {
    lines.push(
      `| ${escapeCell(column.id)} | ${escapeCell(column.nameJa)} | ${escapeCell(column.definition)} |`
    );
  }
  lines.push("");
  if (testRequirements.length === 0) {
    lines.push(
      "テスト要求が未指定である。ペルソナごとに現状(Before)と将来(After)を書き分け、その差分を確かめるテスト要求を" +
        `${prefixes.testRequirement} のIDで起こすこと。`
    );
  } else {
    lines.push("| テスト要求ID | ペルソナID | 関連ストーリーID | 現状(Before) | 将来(After) | テスト要求 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const r of testRequirements) {
      lines.push(
        `| ${escapeCell(r.id)} | ${escapeCell(r.personaId)} | ${escapeCell(
          r.storyIds && r.storyIds.length > 0 ? r.storyIds.join(", ") : "-"
        )} | ${escapeCell(r.before.trim() !== "" ? r.before : UNFILLED)} | ${escapeCell(
          r.after.trim() !== "" ? r.after : UNFILLED
        )} | ${escapeCell(r.testRequirement.trim() !== "" ? r.testRequirement : UNFILLED)} |`
      );
    }
  }
  lines.push("");

  // --- 6. 決定的検査(自動) ---
  lines.push("## 6. 決定的検査(自動)");
  lines.push("");

  lines.push("### 6.1 IDの重複・欠番・プレフィックス不一致");
  lines.push("");
  if (duplicates.length === 0) {
    lines.push("- 重複: なし");
  } else {
    for (const dup of duplicates) {
      lines.push(`- 重複: ${storyMapEntityLabels[dup.kind]} ${dup.id}(${dup.count}件)`);
    }
  }
  if (missingNumbers.length === 0) {
    lines.push("- 欠番: なし");
  } else {
    for (const miss of missingNumbers) {
      lines.push(`- 欠番: ${storyMapEntityLabels[miss.kind]} ${miss.id}`);
    }
  }
  if (prefixMismatch.length === 0) {
    lines.push("- プレフィックス不一致ID: なし");
  } else {
    for (const issue of prefixMismatch) {
      lines.push(
        `- プレフィックス不一致ID: ${storyMapEntityLabels[issue.kind]} ${issue.id}(期待 ${issue.expectedPrefix})`
      );
    }
  }
  lines.push("");

  lines.push("### 6.2 階層参照の未解決");
  lines.push("");
  if (unresolvedRefs.length === 0) {
    lines.push("- なし");
  } else {
    lines.push("| 参照元ID | 参照 | 照合対象 |");
    lines.push("| --- | --- | --- |");
    for (const ref of unresolvedRefs) {
      lines.push(
        `| ${escapeCell(ref.ownerId)} | ${escapeCell(ref.ref)} | ${escapeCell(ref.expectedKind)} |`
      );
    }
  }
  lines.push("");

  lines.push("### 6.3 ストーリー未紐づけペルソナ");
  lines.push("");
  if (personasWithoutStories.length === 0) {
    lines.push("- なし");
  } else {
    for (const id of personasWithoutStories) {
      lines.push(
        `- [high] ${escapeCell(id)}: 紐づくユーザーストーリーが0件。このペルソナのアクティビティ・タスク・ストーリーを起こすこと。`
      );
    }
  }
  lines.push("");

  lines.push("### 6.4 テスト要求0件ペルソナ");
  lines.push("");
  if (personasWithoutTestRequirements.length === 0) {
    lines.push("- なし");
  } else {
    for (const id of personasWithoutTestRequirements) {
      lines.push(
        `- [high] ${escapeCell(id)}: テスト要求が0件。現状(Before)と将来(After)の差分からテスト要求を起こすこと。`
      );
    }
  }
  lines.push("");

  lines.push("### 6.5 ペルソナ4象限の記入状況");
  lines.push("");
  if (personas.length === 0) {
    lines.push("- ペルソナの指定なし");
  } else if (incompleteQuadrants.length === 0) {
    lines.push("- 未記入の象限があるペルソナ: なし");
  } else {
    for (const row of incompleteQuadrants) {
      lines.push(
        `- [medium] ${escapeCell(row.personaId)}: 未記入の象限 ${escapeCell(
          row.missingQuadrants.join(", ")
        )}。persona_journey_interview で深掘りすること。`
      );
    }
  }
  lines.push("");

  lines.push("### 6.6 テスト要求行の欠落");
  lines.push("");
  if (incompleteRequirementRows.length === 0) {
    lines.push("- なし");
  } else {
    for (const row of incompleteRequirementRows) {
      lines.push(
        `- [high] ${escapeCell(row.id)}: 未記入の列 ${escapeCell(row.missingFields.join(", "))}。`
      );
    }
  }
  lines.push("");

  lines.push("### 6.7 ドメイン分析観点の被覆状況");
  lines.push("");
  if (unusedAspects.length === 0) {
    lines.push("- 未記入の観点: なし");
  } else {
    for (const aspect of unusedAspects) {
      lines.push(
        `- [medium] ${aspect.id} ${escapeCell(aspect.nameJa)}: 把握した事実が未記入。対象外とする理由を明記するか、事実を収集すること。`
      );
    }
  }
  if (unknownAspectIds.length > 0) {
    lines.push(`- [medium] 未知の観点ID: ${escapeCell(unknownAspectIds.join(", "))}`);
  }
  lines.push("");

  lines.push("### 6.8 ステークホルダー2軸評価の宣言・実体の照合");
  lines.push("");
  const weightingFindings: string[] = [];
  if (weightingSpecified) {
    const focusClassId =
      swf.handlingClasses.find((c) => c.key === "focus")?.id ?? "SWC-01";
    const evaluationStep = swf.steps.find((s) => s.nameJa.includes("2軸評価"));
    for (const evaluation of weightingEvaluations) {
      const id = escapeCell(evaluation.personaId);
      if (evaluation.missingAxes.length > 0) {
        weightingFindings.push(
          `- [high] ${id}: ${escapeCell(
            axisLabels.map((a) => a.nameJa).join("・")
          )}の未評価軸 ${escapeCell(evaluation.missingAxes.join(", "))}。${
            evaluationStep ? `${evaluationStep.id} に従い両軸を評価すること。` : "両軸を評価すること。"
          }`
        );
      }
      for (const outOfRange of evaluation.outOfRangeAxes) {
        const axis = axisLabels.find((a) => a.nameJa === outOfRange.axis);
        const allowed = axis ? stakeholderAxisAllowedValues(axis.axis, frame) : [];
        weightingFindings.push(
          `- [high] ${id}: ${escapeCell(outOfRange.axis)} の値 ${
            outOfRange.value
          } は levels の値（${allowed.join(", ")}）に存在しない。`
        );
      }
      if (evaluation.classMismatch) {
        weightingFindings.push(
          `- [high] ${id}: 宣言された扱いクラス ${escapeCell(
            evaluation.declaredClassId ?? "-"
          )} は matrix の (${swf.influenceAxis.nameJa} ${evaluation.influence}, ${
            swf.interestAxis.nameJa
          } ${evaluation.interest}) 対応 ${escapeCell(
            evaluation.derivedClassId ?? "-"
          )} と一致しない。scoreだけで判定していないか確認すること。`
        );
      }
      if (evaluation.unevaluatedButExcluded) {
        weightingFindings.push(`- [high] ${id}: 両軸が未評価のまま絞り込み済みとして扱われている。`);
      }
      if (evaluation.focusExcluded) {
        weightingFindings.push(
          `- [high] ${id}: 重点クラス(${focusClassId})のペルソナを絞り込みで対象外にしている。`
        );
      }
      if (evaluation.scoreMismatch) {
        weightingFindings.push(
          `- [medium] ${id}: 宣言スコア ${evaluation.declaredScore} は influence×interest=${evaluation.derivedScore} と一致しない。`
        );
      }
      if (evaluation.missingRationale) {
        weightingFindings.push(`- [medium] ${id}: 評価値を選んだ根拠となる事実が未記入。`);
      }
      if (evaluation.missingExclusionReason) {
        weightingFindings.push(`- [medium] ${id}: 絞り込みで対象外にした理由が未記入。`);
      }
      if (focusPersonasWithoutTestRequirements.includes(evaluation.personaId)) {
        weightingFindings.push(
          `- [high] ${id}: 重点クラス(${focusClassId})だがテスト要求が0件。Before/After のテスト要求列を最初に埋めること。`
        );
      }
    }
    if (weightingFindings.length === 0) {
      lines.push("- なし");
    } else {
      lines.push(...weightingFindings);
    }
  } else {
    lines.push("- ステークホルダー2軸評価の指定なし");
  }
  lines.push("");

  lines.push("### 6.9 サマリ");
  lines.push("");
  lines.push(
    `- ペルソナ数: ${personas.length} / アクティビティ数: ${activities.length} / タスク数: ${tasks.length} / ` +
      `ユーザーストーリー数: ${stories.length} / テスト要求数: ${testRequirements.length} / ` +
      `重複ID数: ${duplicates.length} / 欠番数: ${missingNumbers.length} / プレフィックス不一致数: ${prefixMismatch.length} / ` +
      `未解決参照数: ${unresolvedRefs.length} / ストーリー未紐づけペルソナ数: ${personasWithoutStories.length} / ` +
      `テスト要求0件ペルソナ数: ${personasWithoutTestRequirements.length} / 4象限未記入ペルソナ数: ${incompleteQuadrants.length} / ` +
      `テスト要求欠落行数: ${incompleteRequirementRows.length} / ドメイン分析未記入観点数: ${unusedAspects.length}` +
      ` / 2軸評価指摘件数: ${weightingFindings.length} / 重点クラステスト要求0件ペルソナ数: ${focusPersonasWithoutTestRequirements.length}`
  );
  lines.push("");

  // --- 7. 意味的層の指示 ---
  lines.push("## 7. 意味的層の指示");
  lines.push("");
  lines.push(
    "以下の質問例を使ってユーザーに深掘りし、2〜5節の未記入・不足を埋めたうえで再度本ツールへ渡すこと。"
  );
  lines.push("");
  lines.push("### 7.1 ドメイン分析の深掘り");
  lines.push("");
  for (const aspect of frame.domainAnalysisAspects) {
    const unused = unusedAspects.some((a) => a.id === aspect.id);
    lines.push(
      `- ${aspect.id} ${aspect.nameJa}${unused ? "(未記入・優先)" : ""}: ${aspect.questionExamples.join(" / ")}`
    );
  }
  lines.push("");
  lines.push("### 7.2 ペルソナ4象限の深掘り");
  lines.push("");
  for (const quadrant of frame.personaQuadrants) {
    const missing = incompleteQuadrants
      .filter((row) => row.missingQuadrants.includes(quadrant.nameJa))
      .map((row) => row.personaId);
    lines.push(
      `- ${quadrant.id} ${quadrant.nameJa}: ${quadrant.definition} 質問例: ${quadrant.questionExamples.join(
        " / "
      )} 避ける書き方: ${quadrant.badExamples.join(" / ")}${
        missing.length > 0 ? ` 未記入ペルソナ: ${missing.join(", ")}` : ""
      }`
    );
  }
  lines.push("");
  lines.push("### 7.3 5階層の粒度");
  lines.push("");
  for (const level of frame.storyMapLevels) {
    lines.push(`- ${level.id} ${level.nameJa}: ${level.granularityGuidance}`);
  }
  lines.push("");
  lines.push("### 7.4 テスト要求の書き方");
  lines.push("");
  for (const column of frame.testRequirementFrame.columns) {
    lines.push(`- ${column.id} ${column.nameJa}: ${column.definition}`);
  }
  lines.push("");

  // --- 8. extract_test_conditions への引き渡し ---
  lines.push("## 8. extract_test_conditions への引き渡し");
  lines.push("");
  for (const rule of frame.testRequirementFrame.handoverConvention) {
    lines.push(`- ${rule}`);
  }
  for (const rule of swf.handoverConvention) {
    lines.push(`- ${rule}`);
  }
  lines.push("");
  if (!weightingSpecified) {
    lines.push(
      "ステークホルダー2軸評価が未指定のため重点クラス引き渡し表は空である。3.2 の評価表を埋めたうえで " +
        "personas[].stakeholderWeighting を extract_test_conditions へ渡すこと。"
    );
  } else {
    const handoverRows = weightingEvaluations.filter(
      (e) => e.derivedClassKey === "focus" || e.derivedClassKey === "standard"
    );
    if (handoverRows.length === 0) {
      lines.push("重点クラス・通常クラスに該当するペルソナがないため重点クラス引き渡し表は空である。");
    } else {
      lines.push("| ペルソナID | 扱いクラス | 既定priority | 紐づくテスト要求ID |");
      lines.push("| --- | --- | --- | --- |");
      for (const evaluation of handoverRows) {
        const handlingClass = swf.handlingClasses.find((c) => c.id === evaluation.derivedClassId);
        const relatedIds = testRequirements
          .filter((r) => r.personaId === evaluation.personaId)
          .map((r) => r.id);
        lines.push(
          `| ${escapeCell(evaluation.personaId)} | ${escapeCell(
            evaluation.derivedClassId ?? "-"
          )} | ${escapeCell(handlingClass?.defaultConditionPriority ?? "-")} | ${escapeCell(
            relatedIds.length > 0 ? relatedIds.join(", ") : "-"
          )} |`
        );
      }
    }
    lines.push("");
  }
  if (testRequirements.length === 0) {
    lines.push(
      "テスト要求が未指定のため引き渡し表は空である。5節でテスト要求を起こしたうえで、" +
        'source="stakeholder" のテスト条件へ展開すること。'
    );
  } else {
    lines.push("| テスト要求ID | 由来ペルソナID | source | derivedFrom | 関連ストーリーID | 展開すべき確認内容 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const r of testRequirements) {
      lines.push(
        `| ${escapeCell(r.id)} | ${escapeCell(r.personaId)} | stakeholder | ${escapeCell(
          r.personaId
        )} | ${escapeCell(r.storyIds && r.storyIds.length > 0 ? r.storyIds.join(", ") : "-")} | ${escapeCell(
          r.testRequirement.trim() !== "" ? r.testRequirement : UNFILLED
        )} |`
      );
    }
  }
  lines.push("");

  lines.push(
    ...renderNextToolsSection(
      "generate_user_story_map",
      [],
      input.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

const personaShape = z.object({
  id: z.string().describe("Persona id referenced by activities / stories / test requirements"),
  role: z.string().describe("Persona role"),
  name: z.string().optional().describe("Persona name"),
  concerns: z
    .string()
    .optional()
    .describe("Known concerns of this persona (legacy field; prefer painPoints)"),
  demographics: z
    .array(z.string())
    .optional()
    .describe("Demographics quadrant: age range, occupation, usage environment, IT literacy, etc."),
  saysAndThinks: z
    .array(z.string())
    .optional()
    .describe("Says & Thinks quadrant: what this persona says and thinks in the target context"),
  goals: z.array(z.string()).optional().describe("Goals quadrant: what this persona wants to achieve"),
  painPoints: z
    .array(z.string())
    .optional()
    .describe("Pain Point quadrant: frustrations and obstacles this persona faces"),
  stakeholderWeighting: stakeholderWeightingShape,
});

export const generateUserStoryMapInputShape = {
  ...completedToolsInputShape,
  subjectName: z.string().optional().describe("Target system / project name"),
  domainAnalysis: z
    .array(
      z.object({
        aspectId: z.string().describe("Domain analysis aspect id from the frame, e.g. DOM-01"),
        findings: z.array(z.string()).describe("Facts gathered for this aspect"),
      })
    )
    .optional()
    .describe("Domain analysis findings per aspect id (persona-journey-frame domainAnalysisAspects)"),
  personas: z
    .array(personaShape)
    .min(1)
    .describe(
      "Personas described with the Demographics / Says&Thinks / Goals / PainPoint quadrants; handed over to extract_test_conditions as-is"
    ),
  activities: z
    .array(
      z.object({
        id: z.string().describe("Activity id, e.g. ACT-01"),
        personaIds: z.array(z.string()).describe("Persona ids this activity belongs to"),
        productGoal: z.string().describe("Product goal this activity contributes to"),
        activity: z.string().describe("Activity name (story map column heading)"),
      })
    )
    .optional()
    .describe("Activity level of the story map; omitted or empty triggers generation-instruction-only mode"),
  tasks: z
    .array(
      z.object({
        id: z.string().describe("Task id, e.g. TSK-01"),
        activityId: z.string().describe("Parent activity id"),
        task: z.string().describe("Task name"),
      })
    )
    .optional()
    .describe("Task level of the story map"),
  stories: z
    .array(
      z.object({
        id: z.string().describe("User story id, e.g. US-01"),
        taskId: z.string().describe("Parent task id"),
        story: z.string().describe("User story statement"),
        personaIds: z.array(z.string()).optional().describe("Persona ids this story belongs to"),
        priority: z.enum(["高", "中", "低"]).optional().describe("Priority of this story"),
      })
    )
    .optional()
    .describe("User story level of the story map"),
  testRequirements: z
    .array(
      z.object({
        id: z.string().describe("Test requirement id, e.g. TR-01"),
        personaId: z.string().describe("Persona id this test requirement was derived from"),
        storyIds: z.array(z.string()).optional().describe("Related user story ids"),
        before: z.string().describe("Current state (Before): how the persona struggles today"),
        after: z.string().describe("Future state (After): what success looks like"),
        testRequirement: z.string().describe("What testing must confirm about the before/after delta"),
      })
    )
    .optional()
    .describe("Test requirements derived from the before/after delta; handed over as source=stakeholder conditions"),
  idPrefixes: z
    .object({
      activity: z.string().optional().describe("Activity id prefix (default ACT-)"),
      task: z.string().optional().describe("Task id prefix (default TSK-)"),
      story: z.string().optional().describe("User story id prefix (default US-)"),
      testRequirement: z.string().optional().describe("Test requirement id prefix (default TR-)"),
    })
    .optional()
    .describe("Id prefixes used for duplicate / gap / prefix-mismatch detection"),
} as const;

export function registerGenerateUserStoryMapTool(server: McpServer): void {
  server.registerTool(
    "generate_user_story_map",
    {
      title: "Generate User Story Map",
      description:
        "上流の利用状況モデリング（ドメイン分析 → ペルソナ立案 → ユーザーストーリーマップ5階層 → " +
        "テスト要求導出）を二層構成で支援する。決定的層は、アクティビティ/タスク/ストーリー/テスト要求のID重複・欠番・" +
        "プレフィックス不一致・階層参照の未解決・ストーリー未紐づけペルソナ・テスト要求0件ペルソナ・ペルソナ4象限の未記入・" +
        "テスト要求行(現状/将来/テスト要求)の欠落・ドメイン分析観点の被覆状況に加えて、ステークホルダー2軸評価（影響力×関心度）の" +
        "未評価軸・範囲外値・宣言扱いクラスと matrix 対応の不一致・評価根拠の未記入・重点クラスのテスト要求0件を検査する。意味的層は、フレームの質問例に基づく" +
        "深掘り指示のみを呼び出し側LLMへ返す。activities / tasks / stories / testRequirements が未指定・空の場合は生成指示のみを返し、" +
        "既存成果物を渡せばレビューとして機能する。導出したテスト要求は source=\"stakeholder\" のテスト条件として " +
        "extract_test_conditions へ引き渡す。",
      inputSchema: generateUserStoryMapInputShape,
    },
    async (input) => {
      const markdown = renderUserStoryMap(input as GenerateUserStoryMapInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
