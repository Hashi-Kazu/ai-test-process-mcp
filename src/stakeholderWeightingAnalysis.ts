import { z } from "zod";
import { personaJourneyFrame } from "./resources/personaJourneyFrame.js";
import { hasDerivedFromRef, toDerivedFromRef } from "./derivedFromRefs.js";
import type {
  ExtractTestConditionsInput,
  FocusConditionPriorityIssue,
  GenerateUserStoryMapInput,
  PersonaJourneyFrame,
  StakeholderHandlingClassKey,
  StakeholderWeightingEvaluation,
  TestConditionPersonaInput,
  TestConditionPriority,
} from "./types.js";

type StakeholderAxis = "influence" | "interest";

/**
 * 2軸評価の入力スキーマ（generate_user_story_map / extract_test_conditions の personas で同形に使う）。
 * influence / interest に min/max は付けない。範囲外は決定的検査で指摘する。
 */
export const stakeholderWeightingShape = z
  .object({
    influence: z
      .number()
      .int()
      .optional()
      .describe("Influence axis value taken from the frame levels (SW-INFLUENCE); omit when unevaluated"),
    interest: z
      .number()
      .int()
      .optional()
      .describe("Interest axis value taken from the frame levels (SW-INTEREST); omit when unevaluated"),
    score: z
      .number()
      .int()
      .optional()
      .describe("Declared stakeholderScore; cross-checked against influence x interest"),
    handlingClassId: z
      .string()
      .optional()
      .describe("Declared handling class id (SWC-01..SWC-03); cross-checked against the frame matrix"),
    rationale: z
      .array(z.string())
      .optional()
      .describe("Facts backing the chosen axis values (at least one required)"),
    excludedByScreening: z
      .boolean()
      .optional()
      .describe("Whether this stakeholder was screened out in SWS-04"),
    exclusionReason: z
      .string()
      .optional()
      .describe("Reason for screening out; required when excludedByScreening is true"),
  })
  .optional()
  .describe("Stakeholder weighting (influence x interest) result from the persona journey frame");

/** 軸の日本語名は frame から取得する（ハードコードしない） */
export function resolveStakeholderWeightingAxisLabels(
  frame: PersonaJourneyFrame = personaJourneyFrame
): { axis: StakeholderAxis; nameJa: string }[] {
  const swf = frame.stakeholderWeightingFrame;
  return [
    { axis: "influence", nameJa: swf.influenceAxis.nameJa },
    { axis: "interest", nameJa: swf.interestAxis.nameJa },
  ];
}

/** 既定フレームの軸ラベル（影響力・関心度の順） */
export const stakeholderWeightingAxisLabels: { axis: StakeholderAxis; nameJa: string }[] =
  resolveStakeholderWeightingAxisLabels();

function axisDefinition(axis: StakeholderAxis, frame: PersonaJourneyFrame) {
  const swf = frame.stakeholderWeightingFrame;
  return axis === "influence" ? swf.influenceAxis : swf.interestAxis;
}

/** frame の levels の value 集合に含まれるかで判定する（1..4 を埋め込まない） */
export function isKnownStakeholderAxisValue(
  value: number,
  axis: StakeholderAxis,
  frame: PersonaJourneyFrame = personaJourneyFrame
): boolean {
  return axisDefinition(axis, frame).levels.some((level) => level.value === value);
}

/** 軸の許容値一覧（表示用） */
export function stakeholderAxisAllowedValues(
  axis: StakeholderAxis,
  frame: PersonaJourneyFrame = personaJourneyFrame
): number[] {
  return axisDefinition(axis, frame).levels.map((level) => level.value);
}

/**
 * matrix の (influence, interest) セルから扱いクラスを引く。
 * score や highThreshold からの自前判定は行わない（matrix が唯一の判定根拠）。
 */
export function resolveStakeholderHandlingClass(
  influence: number | undefined,
  interest: number | undefined,
  frame: PersonaJourneyFrame = personaJourneyFrame
): { id: string; key: StakeholderHandlingClassKey } | undefined {
  if (influence === undefined || interest === undefined) return undefined;
  const swf = frame.stakeholderWeightingFrame;
  const cell = swf.matrix.find((m) => m.influence === influence && m.interest === interest);
  if (!cell) return undefined;
  const handlingClass = swf.handlingClasses.find((c) => c.key === cell.classKey);
  if (!handlingClass) return undefined;
  return { id: handlingClass.id, key: handlingClass.key };
}

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function nonEmptyEntries(values: string[] | undefined): string[] {
  return (values ?? []).filter((v) => typeof v === "string" && v.trim() !== "");
}

/** 1件でも stakeholderWeighting が指定されているか（後方互換の判定に使う） */
export function hasAnyStakeholderWeighting(
  personas: TestConditionPersonaInput[] | undefined
): boolean {
  return (personas ?? []).some((p) => p.stakeholderWeighting !== undefined);
}

export function evaluateStakeholderWeighting(
  personas: TestConditionPersonaInput[] | undefined,
  frame: PersonaJourneyFrame = personaJourneyFrame
): StakeholderWeightingEvaluation[] {
  const axes = resolveStakeholderWeightingAxisLabels(frame);
  return (personas ?? []).map((persona) => {
    const weighting = persona.stakeholderWeighting;
    const influence = weighting?.influence;
    const interest = weighting?.interest;
    const values: Record<StakeholderAxis, number | undefined> = { influence, interest };

    const missingAxes: string[] = [];
    const outOfRangeAxes: { axis: string; value: number }[] = [];
    for (const axis of axes) {
      const value = values[axis.axis];
      if (value === undefined) {
        missingAxes.push(axis.nameJa);
        continue;
      }
      if (!isKnownStakeholderAxisValue(value, axis.axis, frame)) {
        outOfRangeAxes.push({ axis: axis.nameJa, value });
      }
    }

    const inRange = missingAxes.length === 0 && outOfRangeAxes.length === 0;
    const derivedScore = inRange ? (influence as number) * (interest as number) : undefined;
    const derivedClass = inRange ? resolveStakeholderHandlingClass(influence, interest, frame) : undefined;

    const declaredScore = weighting?.score;
    const declaredClassId = weighting?.handlingClassId;
    const excludedByScreening = weighting?.excludedByScreening === true;

    return {
      personaId: persona.id,
      influence,
      interest,
      missingAxes,
      outOfRangeAxes,
      derivedScore,
      declaredScore,
      scoreMismatch:
        declaredScore !== undefined && derivedScore !== undefined && declaredScore !== derivedScore,
      derivedClassId: derivedClass?.id,
      derivedClassKey: derivedClass?.key,
      declaredClassId,
      classMismatch:
        declaredClassId !== undefined &&
        derivedClass !== undefined &&
        declaredClassId !== derivedClass.id,
      missingRationale: nonEmptyEntries(weighting?.rationale).length === 0,
      excludedByScreening,
      missingExclusionReason: excludedByScreening && !hasText(weighting?.exclusionReason),
      focusExcluded: excludedByScreening && derivedClass?.key === "focus",
      unevaluatedButExcluded: excludedByScreening && missingAxes.length > 0,
    };
  });
}

function focusPersonaIds(
  personas: TestConditionPersonaInput[] | undefined,
  frame: PersonaJourneyFrame
): string[] {
  return evaluateStakeholderWeighting(personas, frame)
    .filter((e) => e.derivedClassKey === "focus")
    .map((e) => e.personaId);
}

/** 重点クラスなのにテスト要求が0件のペルソナID（入力順） */
export function findFocusPersonasWithoutTestRequirements(
  input: GenerateUserStoryMapInput,
  frame: PersonaJourneyFrame = personaJourneyFrame
): string[] {
  const testRequirements = input.testRequirements ?? [];
  return focusPersonaIds(input.personas, frame).filter(
    (id) => !testRequirements.some((r) => r.personaId === id)
  );
}

/** 重点クラスなのに source="stakeholder" のテスト条件が0件のペルソナID（入力順） */
export function findFocusPersonasWithoutConditions(
  input: ExtractTestConditionsInput,
  frame: PersonaJourneyFrame = personaJourneyFrame
): string[] {
  const testConditions = input.testConditions ?? [];
  return focusPersonaIds(input.personas, frame).filter(
    (id) =>
      !testConditions.some(
        (c) => c.source === "stakeholder" && hasDerivedFromRef(c.derivedFrom, id, "stakeholder")
      )
  );
}

const priorityRank: Record<TestConditionPriority, number> = { 高: 3, 中: 2, 低: 1 };

/** 重点クラス由来条件の priority 引き下げで理由が未記入のもの（testConditions の入力順） */
export function findFocusConditionPriorityIssues(
  input: ExtractTestConditionsInput,
  frame: PersonaJourneyFrame = personaJourneyFrame
): FocusConditionPriorityIssue[] {
  const focusClass = frame.stakeholderWeightingFrame.handlingClasses.find((c) => c.key === "focus");
  if (!focusClass) return [];
  const defaultPriority = focusClass.defaultConditionPriority;
  const focusIds = focusPersonaIds(input.personas, frame);
  if (focusIds.length === 0) return [];

  const issues: FocusConditionPriorityIssue[] = [];
  for (const condition of input.testConditions ?? []) {
    if (condition.source !== "stakeholder") continue;
    const declaredPriority = condition.priority;
    if (declaredPriority === undefined) continue;
    if (priorityRank[declaredPriority] >= priorityRank[defaultPriority]) continue;
    // 同一条件が複数の focus ペルソナに紐づく場合は、条件内で最初に一致した focus ペルソナで1件のみ返す
    const personaId = condition.derivedFrom
      .map((entry) => toDerivedFromRef(entry))
      .filter((ref) => ref.kind === undefined || ref.kind === "stakeholder")
      .map((ref) => ref.id)
      .find((id) => focusIds.includes(id));
    if (personaId === undefined) continue;
    if (hasText(condition.priorityDeviationReason) || hasText(condition.rationale)) continue;
    issues.push({ conditionId: condition.id, personaId, declaredPriority, defaultPriority });
  }
  return issues;
}
