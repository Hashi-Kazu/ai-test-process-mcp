import { testPerspectiveCatalog } from "./resources/testPerspectiveCatalog.js";
import { riskAnalysisFrame } from "./resources/riskAnalysisFrame.js";
import { guidewordDictionary } from "./resources/guidewordDictionary.js";
import { derivedFromIds, hasDerivedFromRef, toDerivedFromRef } from "./derivedFromRefs.js";
import type {
  DerivedFromEntry,
  ExtractTestConditionsInput,
  GuidewordDictionary,
  PersonaQuadrantCompleteness,
  RequirementCoverageRow,
  RequirementSourceRef,
  RequirementsChangeCategory,
  RiskAnalysisFrame,
  RiskCategoryDistributionRow,
  RiskLevelBand,
  RiskLikelihoodDetailInput,
  RiskSeverityGrade,
  RiskSeverityInput,
  RiskStakeholderImpactMatrix,
  TestBasisSourceRef,
  TestConditionDuplicateId,
  TestConditionInput,
  TestConditionPriority,
  TestConditionRiskEvaluation,
  TestConditionRiskInput,
  TestConditionSource,
  TestConditionSourceDistributionRow,
  TestConditionPersonaInput,
  TestConditionUnresolvedRef,
  TestPerspectiveCatalog,
  UnknownRiskCategoryRef,
  UnknownRiskPronenessFactorRef,
  UnknownRiskStakeholderFrameRef,
} from "./types.js";

// extract_test_conditions 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順（または明示したソートキー）で決定的。

export const DEFAULT_CONDITION_ID_PREFIX = "TC-";

export const testConditionSources: TestConditionSource[] = [
  "testbase",
  "stakeholder",
  "risk",
  "guideword",
];

export const testConditionSourceLabels: { source: TestConditionSource; nameJa: string; description: string }[] = [
  {
    source: "testbase",
    nameJa: "テストベース由来",
    description: "要件・仕様の記述そのものから導出した条件。derivedFrom には要件IDを書く。",
  },
  {
    source: "stakeholder",
    nameJa: "ステークホルダー由来",
    description: "利用者・運用者などの関心事から導出した条件。derivedFrom にはペルソナIDを書く。",
  },
  {
    source: "risk",
    nameJa: "リスク由来",
    description: "洗い出したリスクから導出した条件。derivedFrom にはリスクIDを書く。",
  },
  {
    source: "guideword",
    nameJa: "ガイドワード由来",
    description:
      "着目点×ガイドワードの掛け合わせで見つけた条件。derivedFrom には着想元の要件ID/リスクID/ペルソナIDを書く。複数系統にまたがる場合は `{kind, id}` 形式で種別を明示できる。",
  },
];

export function buildRequirementCoverageMatrix(
  requirementIds: string[],
  conditions: TestConditionInput[]
): RequirementCoverageRow[] {
  return requirementIds.map((requirementId) => ({
    requirementId,
    conditionIds: conditions
      .filter((c) => hasDerivedFromRef(c.derivedFrom, requirementId, "requirement"))
      .map((c) => c.id),
  }));
}

export function findUncoveredRequirementIds(
  requirementIds: string[],
  conditions: TestConditionInput[]
): string[] {
  return buildRequirementCoverageMatrix(requirementIds, conditions)
    .filter((row) => row.conditionIds.length === 0)
    .map((row) => row.requirementId);
}

export function findUnusedPerspectiveCategories(
  conditions: TestConditionInput[],
  catalog: TestPerspectiveCatalog = testPerspectiveCatalog,
  categoryIds?: string[]
): { id: string; nameJa: string }[] {
  const used = new Set(conditions.map((c) => c.perspectiveCategoryId));
  const targets =
    categoryIds && categoryIds.length > 0
      ? catalog.categories.filter((c) => categoryIds.includes(c.id))
      : catalog.categories;
  return targets
    .filter((c) => !used.has(c.id))
    .map((c) => ({ id: c.id, nameJa: c.nameJa }));
}

export function findDuplicateConditionIds(conditions: TestConditionInput[]): TestConditionDuplicateId[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const c of conditions) {
    if (!counts.has(c.id)) order.push(c.id);
    counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  }
  return order
    .filter((id) => (counts.get(id) ?? 0) > 1)
    .map((id) => ({ id, count: counts.get(id) as number }));
}

function parseNumberPart(id: string, idPrefix: string): { raw: string; value: number } | undefined {
  if (!id.startsWith(idPrefix)) return undefined;
  const rest = id.slice(idPrefix.length);
  if (!/^\d+$/.test(rest)) return undefined;
  return { raw: rest, value: Number(rest) };
}

export function findPrefixMismatchConditionIds(
  conditions: TestConditionInput[],
  idPrefix: string = DEFAULT_CONDITION_ID_PREFIX
): string[] {
  const result: string[] = [];
  for (const c of conditions) {
    if (!parseNumberPart(c.id, idPrefix) && !result.includes(c.id)) result.push(c.id);
  }
  return result;
}

export function findMissingConditionNumbers(
  conditions: TestConditionInput[],
  idPrefix: string = DEFAULT_CONDITION_ID_PREFIX
): string[] {
  const parsed = conditions
    .map((c) => parseNumberPart(c.id, idPrefix))
    .filter((p): p is { raw: string; value: number } => p !== undefined);
  if (parsed.length === 0) return [];

  const widthCounts = new Map<number, number>();
  for (const p of parsed) {
    widthCounts.set(p.raw.length, (widthCounts.get(p.raw.length) ?? 0) + 1);
  }
  let width = 0;
  let bestCount = -1;
  for (const [w, count] of [...widthCounts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > bestCount || (count === bestCount && w > width)) {
      width = w;
      bestCount = count;
    }
  }

  const present = new Set(parsed.map((p) => p.value));
  const min = Math.min(...parsed.map((p) => p.value));
  const max = Math.max(...parsed.map((p) => p.value));
  const missing: string[] = [];
  for (let n = min; n <= max; n++) {
    if (!present.has(n)) missing.push(`${idPrefix}${String(n).padStart(width, "0")}`);
  }
  return missing;
}

export function findConditionsWithoutPriority(conditions: TestConditionInput[]): TestConditionInput[] {
  return conditions.filter((c) => !c.priority);
}

/** ペルソナ4象限の列定義（表の列順・未記入検査の列挙順の正本） */
export const personaQuadrantColumns: {
  key: "demographics" | "saysAndThinks" | "goals" | "painPoints";
  nameJa: string;
}[] = [
  { key: "demographics", nameJa: "属性" },
  { key: "saysAndThinks", nameJa: "発言・思考" },
  { key: "goals", nameJa: "目標" },
  { key: "painPoints", nameJa: "不満点" },
];

export const PERSONA_QUADRANT_UNFILLED = "未記入(要確認)";

/**
 * ペルソナ4象限のセル値を表示用に整形する。
 * 配列は "; " で連結し、未記入は "未記入(要確認)" を返す。
 * painPoints が空の場合は旧フィールド concerns をフォールバックとして使う。
 */
export function formatPersonaQuadrantCell(
  persona: TestConditionPersonaInput,
  key: "demographics" | "saysAndThinks" | "goals" | "painPoints"
): string {
  const values = persona[key];
  if (values && values.length > 0) return values.join("; ");
  if (key === "painPoints" && persona.concerns && persona.concerns.trim() !== "") {
    return persona.concerns;
  }
  return PERSONA_QUADRANT_UNFILLED;
}

/**
 * 4象限（属性 / 発言・思考 / 目標 / 不満点）のうち未指定または空配列の象限名を列挙する。
 * painPoints は旧フィールド concerns があれば充足扱い。出力順は入力順で決定的。
 */
export function findIncompletePersonaQuadrants(
  personas: TestConditionPersonaInput[] = []
): PersonaQuadrantCompleteness[] {
  const result: PersonaQuadrantCompleteness[] = [];
  for (const persona of personas) {
    const missingQuadrants: string[] = [];
    for (const column of personaQuadrantColumns) {
      if (formatPersonaQuadrantCell(persona, column.key) === PERSONA_QUADRANT_UNFILLED) {
        missingQuadrants.push(column.nameJa);
      }
    }
    if (missingQuadrants.length > 0) result.push({ personaId: persona.id, missingQuadrants });
  }
  return result;
}

export function findUnresolvedDerivedFromRefs(
  input: ExtractTestConditionsInput,
  dictionary: GuidewordDictionary = guidewordDictionary
): TestConditionUnresolvedRef[] {
  const requirementIds = input.requirementIds ?? [];
  const personaIds = (input.personas ?? []).map((p) => p.id);
  const riskIds = (input.risks ?? []).map((r) => r.id);
  const guidewordIds = [
    ...dictionary.focusPoints.map((f) => f.id),
    ...dictionary.guidewords.map((g) => g.id),
  ];

  const result: TestConditionUnresolvedRef[] = [];
  for (const condition of input.testConditions) {
    let pool: string[];
    let expectedKind: string;
    switch (condition.source) {
      case "testbase":
        pool = requirementIds;
        expectedKind = "requirementIds";
        break;
      case "stakeholder":
        pool = personaIds;
        expectedKind = "personas[].id";
        break;
      case "risk":
        pool = riskIds;
        expectedKind = "risks[].id";
        break;
      case "guideword":
      default:
        pool = [...requirementIds, ...riskIds, ...personaIds];
        expectedKind = "requirementIds / risks[].id / personas[].id";
        break;
    }

    for (const entry of condition.derivedFrom) {
      const parsed = toDerivedFromRef(entry);
      if (parsed.kind !== undefined) {
        // 種別明示エントリ: kind に対応する母集団のみと照合する（source の影響を受けない）。
        let kindPool: string[];
        let kindExpectedKind: string;
        switch (parsed.kind) {
          case "requirement":
            kindPool = requirementIds;
            kindExpectedKind = "requirementIds";
            break;
          case "stakeholder":
            kindPool = personaIds;
            kindExpectedKind = "personas[].id";
            break;
          case "risk":
            kindPool = riskIds;
            kindExpectedKind = "risks[].id";
            break;
          case "guideword":
            kindPool = guidewordIds;
            kindExpectedKind = "guidewordDictionary focusPoints[].id / guidewords[].id";
            break;
        }
        if (parsed.kind !== "guideword" && kindPool.length === 0) continue;
        if (!kindPool.includes(parsed.id)) {
          result.push({ conditionId: condition.id, ref: parsed.id, expectedKind: kindExpectedKind, kind: parsed.kind });
        }
        continue;
      }

      // 種別未指定エントリ（文字列）: 現行ロジックを維持する。
      if (pool.length === 0) continue;
      if (!pool.includes(parsed.id)) {
        result.push({ conditionId: condition.id, ref: parsed.id, expectedKind });
      }
    }
  }
  return result;
}

/**
 * テスト条件（またはテストケース）の根拠位置を解決する。
 * owner.sourceRefs が明示されていればそれを優先し、無ければ derivedFrom を
 * requirementSources で引き当てて連結する（同一 document/startLine/endLine は重複排除）。
 * 入力は破壊しない・出力順は決定的な純関数。
 */
export function resolveSourceRefs(
  owner: { derivedFrom: DerivedFromEntry[]; sourceRefs?: TestBasisSourceRef[] },
  requirementSources: RequirementSourceRef[] = []
): TestBasisSourceRef[] {
  if (owner.sourceRefs && owner.sourceRefs.length > 0) {
    return owner.sourceRefs.map((r) => ({ ...r }));
  }

  const result: TestBasisSourceRef[] = [];
  const seen = new Set<string>();
  for (const src of requirementSources) {
    if (!hasDerivedFromRef(owner.derivedFrom, src.requirementId, "requirement")) continue;
    const key = `${src.document}|${src.startLine}|${src.endLine ?? src.startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { requirementId: _requirementId, ...ref } = src;
    result.push(ref);
  }
  return result;
}

/**
 * requirementSources が指定されているにもかかわらず根拠位置を解決できないテスト条件を検出する。
 * requirementSources が未指定/空なら検出をスキップし空配列を返す（既存の未解決参照検査と同じ方針）。
 */
export function findConditionsWithoutSourceRefs(
  input: ExtractTestConditionsInput
): { conditionId: string; source: TestConditionSource }[] {
  if (!input.requirementSources || input.requirementSources.length === 0) return [];
  const result: { conditionId: string; source: TestConditionSource }[] = [];
  for (const c of input.testConditions) {
    const refs = resolveSourceRefs(c, input.requirementSources);
    if (refs.length === 0) {
      result.push({ conditionId: c.id, source: c.source });
    }
  }
  return result;
}

export function buildSourceDistribution(
  conditions: TestConditionInput[]
): TestConditionSourceDistributionRow[] {
  return testConditionSources.map((source) => {
    const conditionIds = conditions.filter((c) => c.source === source).map((c) => c.id);
    return { source, count: conditionIds.length, conditionIds };
  });
}

function changeWeight(
  changeCategory: RequirementsChangeCategory | undefined,
  frame: RiskAnalysisFrame
): number {
  if (!changeCategory) return 2;
  const level = frame.changeAxis.levels.find((l) => l.label.startsWith(changeCategory));
  return level ? level.value : 2;
}

export function computeRiskScore(
  impact: number,
  likelihood: number,
  changeCategory?: RequirementsChangeCategory,
  frame: RiskAnalysisFrame = riskAnalysisFrame
): number {
  return impact * likelihood * changeWeight(changeCategory, frame);
}

export function mapRiskScoreToBand(
  score: number,
  frame: RiskAnalysisFrame = riskAnalysisFrame
): RiskLevelBand | undefined {
  return frame.bands.find((b) => score >= b.minScore && score <= b.maxScore);
}

/**
 * 記入済み重篤度サブ軸（RA-SEV-01..04）の最大値を重篤度として返す。全て未記入なら undefined。
 * 入力は破壊しない純関数。
 */
export function deriveSeverity(severity?: RiskSeverityInput): number | undefined {
  if (!severity) return undefined;
  const values = [severity.direct, severity.ripple, severity.shortTermFinancial, severity.longTermFinancial].filter(
    (v): v is number => typeof v === "number"
  );
  if (values.length === 0) return undefined;
  return Math.max(...values);
}

/** 重篤度の値が属する重篤度区分（S/A/B）を返す。 */
export function mapSeverityToGrade(
  severity: number,
  frame: RiskAnalysisFrame = riskAnalysisFrame
): RiskSeverityGrade | undefined {
  return frame.severityGrades.find((g) => severity >= g.minSeverity && severity <= g.maxSeverity);
}

/**
 * 利用頻度と発生しやすさ係数の幾何平均を切り上げ、1..5 に丸めて発生可能性を導出する。
 * 片方のみの記入では undefined を返す。
 */
export function deriveLikelihoodFromDetail(detail?: RiskLikelihoodDetailInput): number | undefined {
  if (!detail) return undefined;
  const { usageFrequency, defectProneness } = detail;
  if (typeof usageFrequency !== "number" || typeof defectProneness !== "number") return undefined;
  return Math.min(5, Math.max(1, Math.ceil(Math.sqrt(usageFrequency * defectProneness))));
}

/**
 * 影響度・発生可能性の実効値を、宣言値優先で任意軸(重篤度サブ軸・発生頻度サブ軸)から解決する。
 * 宣言値と導出値が両方存在し不一致のときはスコア算出には宣言値を用い、不整合フラグを立てる。
 */
export function resolveEffectiveRiskAxes(
  item: {
    impact?: number;
    likelihood?: number;
    severity?: RiskSeverityInput;
    likelihoodDetail?: RiskLikelihoodDetailInput;
  },
  frame: RiskAnalysisFrame = riskAnalysisFrame
): {
  impact?: number;
  impactSource?: "declared" | "derived";
  likelihood?: number;
  likelihoodSource?: "declared" | "derived";
  severity?: number;
  severityGradeId?: string;
  impactSeverityConflict: boolean;
  likelihoodDetailConflict: boolean;
  missingPronenessRationale: boolean;
} {
  const derivedSeverity = deriveSeverity(item.severity);
  const severityGradeId =
    derivedSeverity !== undefined ? mapSeverityToGrade(derivedSeverity, frame)?.id : undefined;
  const derivedLikelihood = deriveLikelihoodFromDetail(item.likelihoodDetail);

  const declaredImpact = typeof item.impact === "number" ? item.impact : undefined;
  const impact = declaredImpact ?? derivedSeverity;
  const impactSource: "declared" | "derived" | undefined =
    declaredImpact !== undefined ? "declared" : derivedSeverity !== undefined ? "derived" : undefined;

  const declaredLikelihood = typeof item.likelihood === "number" ? item.likelihood : undefined;
  const likelihood = declaredLikelihood ?? derivedLikelihood;
  const likelihoodSource: "declared" | "derived" | undefined =
    declaredLikelihood !== undefined ? "declared" : derivedLikelihood !== undefined ? "derived" : undefined;

  const impactSeverityConflict =
    declaredImpact !== undefined && derivedSeverity !== undefined && declaredImpact !== derivedSeverity;
  const likelihoodDetailConflict =
    declaredLikelihood !== undefined && derivedLikelihood !== undefined && declaredLikelihood !== derivedLikelihood;

  const defectProneness = item.likelihoodDetail?.defectProneness;
  const hasPronenessRationale = Boolean(item.likelihoodDetail?.pronenessRationale?.trim());
  const hasPronenessFactorIds = Boolean(item.likelihoodDetail?.pronenessFactorIds?.length);
  const missingPronenessRationale =
    typeof defectProneness === "number" &&
    defectProneness !== 3 &&
    !hasPronenessRationale &&
    !hasPronenessFactorIds;

  return {
    impact,
    impactSource,
    likelihood,
    likelihoodSource,
    severity: derivedSeverity,
    severityGradeId,
    impactSeverityConflict,
    likelihoodDetailConflict,
    missingPronenessRationale,
  };
}

export function evaluateRisks(
  conditions: TestConditionInput[],
  frame: RiskAnalysisFrame = riskAnalysisFrame
): TestConditionRiskEvaluation[] {
  return conditions.map((c) => {
    const effective = resolveEffectiveRiskAxes(c, frame);
    const hasBoth = typeof effective.impact === "number" && typeof effective.likelihood === "number";
    const declaredPriority = c.priority;

    const optionalFields: Partial<TestConditionRiskEvaluation> = {};
    if (effective.severity !== undefined) optionalFields.severity = effective.severity;
    if (effective.severityGradeId !== undefined) optionalFields.severityGradeId = effective.severityGradeId;
    if (effective.impactSource !== undefined) optionalFields.impactSource = effective.impactSource;
    if (effective.likelihoodSource !== undefined) optionalFields.likelihoodSource = effective.likelihoodSource;
    if (effective.impactSeverityConflict) optionalFields.impactSeverityConflict = true;
    if (effective.likelihoodDetailConflict) optionalFields.likelihoodDetailConflict = true;
    if (effective.missingPronenessRationale) optionalFields.missingPronenessRationale = true;

    if (!hasBoth) {
      return {
        conditionId: c.id,
        declaredPriority,
        deviates: false,
        incomplete: true,
        ...optionalFields,
      };
    }
    const score = computeRiskScore(effective.impact as number, effective.likelihood as number, c.changeCategory, frame);
    const band = mapRiskScoreToBand(score, frame);
    const derivedPriority: TestConditionPriority | undefined = band?.priority;
    const severityEscalation = effective.severityGradeId === "S" && derivedPriority === "低";
    if (severityEscalation) optionalFields.severityEscalation = true;
    return {
      conditionId: c.id,
      score,
      bandId: band?.id,
      derivedPriority,
      declaredPriority,
      deviates: Boolean(derivedPriority && declaredPriority && derivedPriority !== declaredPriority),
      incomplete: false,
      ...optionalFields,
    };
  });
}

export function buildRiskCategoryDistribution(
  risks: TestConditionRiskInput[],
  conditions: TestConditionInput[],
  frame: RiskAnalysisFrame = riskAnalysisFrame
): RiskCategoryDistributionRow[] {
  return frame.riskCategories.map((rc) => {
    const riskIds = risks.filter((r) => r.riskCategoryId === rc.id).map((r) => r.id);
    const conditionIds = conditions.filter((c) => c.riskCategoryId === rc.id).map((c) => c.id);
    return {
      categoryId: rc.id,
      nameJa: rc.nameJa,
      riskIds,
      conditionIds,
      count: riskIds.length + conditionIds.length,
    };
  });
}

export function findUnusedRiskCategories(
  risks: TestConditionRiskInput[],
  conditions: TestConditionInput[],
  frame: RiskAnalysisFrame = riskAnalysisFrame
): { id: string; nameJa: string }[] {
  return buildRiskCategoryDistribution(risks, conditions, frame)
    .filter((row) => row.count === 0)
    .map((row) => ({ id: row.categoryId, nameJa: row.nameJa }));
}

/**
 * リスク×ステークホルダ影響行列を構築する。列は frame の stakeholderFrames を先頭固定(fromFrame=true)とし、
 * stakeholderFrameId を持たず stakeholderLabel のみを持つセルのラベルを出現順で追加列(fromFrame=false)にする。
 * 行は risks の入力順。stakeholderImpacts 未指定のリスクも行として出し、全セル未記入とする。
 */
export function buildRiskStakeholderImpactMatrix(
  risks: TestConditionRiskInput[],
  frame: RiskAnalysisFrame = riskAnalysisFrame
): RiskStakeholderImpactMatrix {
  const frameColumns = frame.stakeholderFrames.map((sf) => ({ key: sf.id, label: sf.nameJa, fromFrame: true }));
  const extraColumns: { key: string; label: string; fromFrame: boolean }[] = [];
  const seenExtraKeys = new Set<string>();
  for (const r of risks) {
    for (const si of r.stakeholderImpacts ?? []) {
      if (si.stakeholderFrameId) continue;
      const label = si.stakeholderLabel ?? "";
      if (label === "" || seenExtraKeys.has(label)) continue;
      seenExtraKeys.add(label);
      extraColumns.push({ key: label, label, fromFrame: false });
    }
  }
  const columns = [...frameColumns, ...extraColumns];

  const rows: RiskStakeholderImpactMatrix["rows"] = risks.map((r) => {
    const impacts = r.stakeholderImpacts ?? [];
    const cells = columns.map((col) => {
      const match = impacts.find((si) =>
        col.fromFrame ? si.stakeholderFrameId === col.key : !si.stakeholderFrameId && si.stakeholderLabel === col.key
      );
      return {
        stakeholderKey: col.key,
        label: col.label,
        level: match?.level,
        note: match?.note,
      };
    });
    const missingStakeholderKeys = columns.filter((c) => c.fromFrame).filter((col) => {
      const cell = cells.find((c) => c.stakeholderKey === col.key);
      return cell?.level === undefined;
    }).map((c) => c.key);
    const levels = cells.map((c) => c.level).filter((v): v is number => typeof v === "number");
    const maxLevel = levels.length > 0 ? Math.max(...levels) : undefined;
    const effectiveImpact = resolveEffectiveRiskAxes(r, frame).impact;
    const exceedsEffectiveImpact =
      maxLevel !== undefined && effectiveImpact !== undefined && maxLevel > effectiveImpact;
    return { riskId: r.id, cells, missingStakeholderKeys, maxLevel, effectiveImpact, exceedsEffectiveImpact };
  });

  return { columns, rows };
}

/** stakeholderFrameId が frame に存在しないリスクを列挙する(入力順)。 */
export function findUnknownRiskStakeholderFrameIds(
  risks: TestConditionRiskInput[],
  frame: RiskAnalysisFrame = riskAnalysisFrame
): UnknownRiskStakeholderFrameRef[] {
  const known = new Set(frame.stakeholderFrames.map((sf) => sf.id));
  const result: UnknownRiskStakeholderFrameRef[] = [];
  for (const r of risks) {
    for (const si of r.stakeholderImpacts ?? []) {
      if (si.stakeholderFrameId && !known.has(si.stakeholderFrameId)) {
        result.push({ riskId: r.id, stakeholderFrameId: si.stakeholderFrameId });
      }
    }
  }
  return result;
}

/** pronenessFactorIds が frame の pronenessFactors に存在しない参照を、リスク→条件の順に列挙する。 */
export function findUnknownRiskPronenessFactorIds(
  risks: TestConditionRiskInput[],
  conditions: TestConditionInput[],
  frame: RiskAnalysisFrame = riskAnalysisFrame
): UnknownRiskPronenessFactorRef[] {
  const known = new Set(frame.pronenessFactors.map((f) => f.id));
  const result: UnknownRiskPronenessFactorRef[] = [];
  for (const r of risks) {
    for (const id of r.likelihoodDetail?.pronenessFactorIds ?? []) {
      if (!known.has(id)) result.push({ ownerKind: "risk", ownerId: r.id, factorId: id });
    }
  }
  for (const c of conditions) {
    for (const id of c.likelihoodDetail?.pronenessFactorIds ?? []) {
      if (!known.has(id)) result.push({ ownerKind: "condition", ownerId: c.id, factorId: id });
    }
  }
  return result;
}

/** sourceRefs も targetIds も空のリスクIDを入力順で返す。 */
export function findRisksWithoutBasis(risks: TestConditionRiskInput[]): string[] {
  return risks
    .filter((r) => (r.sourceRefs?.length ?? 0) === 0 && (r.targetIds?.length ?? 0) === 0)
    .map((r) => r.id);
}

export function findUnknownRiskCategoryIds(
  risks: TestConditionRiskInput[],
  conditions: TestConditionInput[],
  frame: RiskAnalysisFrame = riskAnalysisFrame
): UnknownRiskCategoryRef[] {
  const knownIds = new Set(frame.riskCategories.map((rc) => rc.id));
  const result: UnknownRiskCategoryRef[] = [];
  for (const r of risks) {
    if (r.riskCategoryId && !knownIds.has(r.riskCategoryId)) {
      result.push({ ownerKind: "risk", ownerId: r.id, riskCategoryId: r.riskCategoryId });
    }
  }
  for (const c of conditions) {
    if (c.riskCategoryId && !knownIds.has(c.riskCategoryId)) {
      result.push({ ownerKind: "condition", ownerId: c.id, riskCategoryId: c.riskCategoryId });
    }
  }
  return result;
}
