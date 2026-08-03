import { businessRequirementFrame } from "./resources/businessRequirementFrame.js";
import type {
  BusinessRequirementDataTouchResult,
  BusinessRequirementDuplicateId,
  BusinessRequirementEntityKind,
  BusinessRequirementFeatureCoverage,
  BusinessRequirementFrame,
  BusinessRequirementIdIssue,
  BusinessRequirementIdPrefixes,
  BusinessRequirementIncompletePurpose,
  BusinessRequirementMissingRequiredAspect,
  BusinessRequirementOrphanPurpose,
  BusinessRequirementStateMismatch,
  BusinessRequirementUnresolvedRef,
  GenerateBusinessRequirementModelInput,
} from "./types.js";

// generate_business_requirement_model 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順で決定的。
// 判定区分IDは BRC-01..BRC-15。

export const DEFAULT_BUSINESS_REQUIREMENT_ID_PREFIXES: Record<BusinessRequirementEntityKind, string> = {
  purpose: "PUR-",
  businessUseCase: "BUC-",
  flowStep: "BFL-",
  drivingData: "BDT-",
};

export const businessRequirementEntityKinds: BusinessRequirementEntityKind[] = [
  "purpose",
  "businessUseCase",
  "flowStep",
  "drivingData",
];

export const businessRequirementEntityLabels: Record<BusinessRequirementEntityKind, string> = {
  purpose: "目的",
  businessUseCase: "業務ユースケース",
  flowStep: "業務フロー工程",
  drivingData: "駆動データ",
};

export function resolveBusinessRequirementIdPrefixes(
  idPrefixes?: BusinessRequirementIdPrefixes
): Record<BusinessRequirementEntityKind, string> {
  return {
    purpose: idPrefixes?.purpose ?? DEFAULT_BUSINESS_REQUIREMENT_ID_PREFIXES.purpose,
    businessUseCase:
      idPrefixes?.businessUseCase ?? DEFAULT_BUSINESS_REQUIREMENT_ID_PREFIXES.businessUseCase,
    flowStep: idPrefixes?.flowStep ?? DEFAULT_BUSINESS_REQUIREMENT_ID_PREFIXES.flowStep,
    drivingData: idPrefixes?.drivingData ?? DEFAULT_BUSINESS_REQUIREMENT_ID_PREFIXES.drivingData,
  };
}

function idsByKind(
  input: GenerateBusinessRequirementModelInput
): Record<BusinessRequirementEntityKind, string[]> {
  return {
    purpose: (input.purposes ?? []).map((p) => p.id),
    businessUseCase: (input.businessUseCases ?? []).map((u) => u.id),
    flowStep: (input.flowSteps ?? []).map((s) => s.id),
    drivingData: (input.drivingData ?? []).map((d) => d.id),
  };
}

// --- BRC-01: 未解決参照 ---
export function findUnresolvedBusinessRequirementRefs(
  input: GenerateBusinessRequirementModelInput
): BusinessRequirementUnresolvedRef[] {
  const purposeIds = new Set((input.purposes ?? []).map((p) => p.id));
  const useCaseIds = new Set((input.businessUseCases ?? []).map((u) => u.id));
  const roleIds = new Set((input.roles ?? []).map((r) => r.id));
  const dataIds = new Set((input.drivingData ?? []).map((d) => d.id));

  const result: BusinessRequirementUnresolvedRef[] = [];

  for (const useCase of input.businessUseCases ?? []) {
    for (const ref of useCase.purposeIds ?? []) {
      if (!purposeIds.has(ref)) {
        result.push({ ownerId: useCase.id, ref, expectedKind: "purposes[].id" });
      }
    }
    if (useCase.actorRoleId && !roleIds.has(useCase.actorRoleId)) {
      result.push({ ownerId: useCase.id, ref: useCase.actorRoleId, expectedKind: "roles[].id" });
    }
  }

  for (const step of input.flowSteps ?? []) {
    if (!useCaseIds.has(step.useCaseId)) {
      result.push({ ownerId: step.id, ref: step.useCaseId, expectedKind: "businessUseCases[].id" });
    }
    if (step.actorRoleId && !roleIds.has(step.actorRoleId)) {
      result.push({ ownerId: step.id, ref: step.actorRoleId, expectedKind: "roles[].id" });
    }
    for (const access of step.dataAccess ?? []) {
      if (!dataIds.has(access.dataId)) {
        result.push({ ownerId: step.id, ref: access.dataId, expectedKind: "drivingData[].id" });
      }
    }
  }

  for (const data of input.drivingData ?? []) {
    for (const ref of data.usedByUseCaseIds ?? []) {
      if (!useCaseIds.has(ref)) {
        result.push({ ownerId: data.id, ref, expectedKind: "businessUseCases[].id" });
      }
    }
  }

  return result;
}

// --- BRC-02: ID重複・欠番・プレフィックス不一致 ---
export function findDuplicateBusinessRequirementIds(
  input: GenerateBusinessRequirementModelInput
): BusinessRequirementDuplicateId[] {
  const all = idsByKind(input);
  const result: BusinessRequirementDuplicateId[] = [];
  for (const kind of businessRequirementEntityKinds) {
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const id of all[kind]) {
      if (!counts.has(id)) order.push(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const id of order) {
      const count = counts.get(id) as number;
      if (count > 1) result.push({ kind, id, count });
    }
  }
  return result;
}

function parseNumberPart(id: string, idPrefix: string): { raw: string; value: number } | undefined {
  if (!id.startsWith(idPrefix)) return undefined;
  const rest = id.slice(idPrefix.length);
  if (!/^\d+$/.test(rest)) return undefined;
  return { raw: rest, value: Number(rest) };
}

export function findPrefixMismatchBusinessRequirementIds(
  input: GenerateBusinessRequirementModelInput
): BusinessRequirementIdIssue[] {
  const all = idsByKind(input);
  const prefixes = resolveBusinessRequirementIdPrefixes(input.idPrefixes);
  const result: BusinessRequirementIdIssue[] = [];
  for (const kind of businessRequirementEntityKinds) {
    const expectedPrefix = prefixes[kind];
    for (const id of all[kind]) {
      if (parseNumberPart(id, expectedPrefix)) continue;
      if (result.some((r) => r.kind === kind && r.id === id)) continue;
      result.push({ kind, id, expectedPrefix });
    }
  }
  return result;
}

export function findMissingBusinessRequirementNumbers(
  input: GenerateBusinessRequirementModelInput
): BusinessRequirementIdIssue[] {
  const all = idsByKind(input);
  const prefixes = resolveBusinessRequirementIdPrefixes(input.idPrefixes);
  const result: BusinessRequirementIdIssue[] = [];
  for (const kind of businessRequirementEntityKinds) {
    const expectedPrefix = prefixes[kind];
    const parsed = all[kind]
      .map((id) => parseNumberPart(id, expectedPrefix))
      .filter((p): p is { raw: string; value: number } => p !== undefined);
    if (parsed.length === 0) continue;

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
    for (let n = min; n <= max; n++) {
      if (!present.has(n)) {
        result.push({ kind, id: `${expectedPrefix}${String(n).padStart(width, "0")}`, expectedPrefix });
      }
    }
  }
  return result;
}

// --- BRC-03 / BRC-04: 目的 <-> 業務ユースケース の相互紐づけ ---
export function findOrphanPurposes(
  input: GenerateBusinessRequirementModelInput
): BusinessRequirementOrphanPurpose[] {
  const referenced = new Set(
    (input.businessUseCases ?? []).flatMap((u) => u.purposeIds ?? [])
  );
  return (input.purposes ?? [])
    .filter((p) => !referenced.has(p.id))
    .map((p) => ({ id: p.id, statement: p.statement }));
}

export function findOrphanBusinessUseCases(input: GenerateBusinessRequirementModelInput): string[] {
  return (input.businessUseCases ?? [])
    .filter((u) => !u.purposeIds || u.purposeIds.length === 0)
    .map((u) => u.id);
}

// --- BRC-05: 機能IDが1件も紐づかない業務ユースケース ---
export function findFeatureLessBusinessUseCases(
  input: GenerateBusinessRequirementModelInput
): string[] {
  return (input.businessUseCases ?? [])
    .filter((u) => !u.featureIds || u.featureIds.length === 0)
    .map((u) => u.id);
}

function allReferencedFeatureIds(input: GenerateBusinessRequirementModelInput): Set<string> {
  const ids = new Set<string>();
  for (const u of input.businessUseCases ?? []) {
    for (const f of u.featureIds ?? []) ids.add(f);
  }
  for (const s of input.flowSteps ?? []) {
    for (const f of s.featureIds ?? []) ids.add(f);
  }
  return ids;
}

// --- BRC-06: 機能ID母集団のうち、どの業務ユースケースからも参照されない機能ID ---
export function findUnreferencedFeatureIds(input: GenerateBusinessRequirementModelInput): string[] {
  if (!input.featureIdPopulation || input.featureIdPopulation.length === 0) return [];
  const referenced = allReferencedFeatureIds(input);
  return input.featureIdPopulation.filter((f) => !referenced.has(f));
}

// --- BRC-07: 宣言した機能ID母集団に無い機能IDの参照 ---
export function findUndeclaredFeatureIdRefs(
  input: GenerateBusinessRequirementModelInput
): { ownerId: string; featureId: string }[] {
  if (!input.featureIdPopulation || input.featureIdPopulation.length === 0) return [];
  const population = new Set(input.featureIdPopulation);
  const result: { ownerId: string; featureId: string }[] = [];
  for (const u of input.businessUseCases ?? []) {
    for (const f of u.featureIds ?? []) {
      if (!population.has(f)) result.push({ ownerId: u.id, featureId: f });
    }
  }
  for (const s of input.flowSteps ?? []) {
    for (const f of s.featureIds ?? []) {
      if (!population.has(f)) result.push({ ownerId: s.id, featureId: f });
    }
  }
  return result;
}

// --- BRC-08: 業務フローの工程が0件の業務ユースケース ---
export function findFlowLessBusinessUseCases(input: GenerateBusinessRequirementModelInput): string[] {
  const stepUseCaseIds = new Set((input.flowSteps ?? []).map((s) => s.useCaseId));
  return (input.businessUseCases ?? []).filter((u) => !stepUseCaseIds.has(u.id)).map((u) => u.id);
}

// --- BRC-09: 工程の担い手が未記入 ---
export function findMissingStepActors(
  input: GenerateBusinessRequirementModelInput
): { stepId: string; useCaseId: string; no: number }[] {
  return (input.flowSteps ?? [])
    .filter((s) => !s.actorRoleId || s.actorRoleId.trim() === "")
    .map((s) => ({ stepId: s.id, useCaseId: s.useCaseId, no: s.no }));
}

// --- BRC-10: どの工程からも触れられない駆動データ／どの駆動データにも触れない業務ユースケース ---
export function findDataTouchGaps(
  input: GenerateBusinessRequirementModelInput
): BusinessRequirementDataTouchResult {
  const touchedDataIds = new Set<string>();
  const useCaseTouchCount = new Map<string, number>();
  for (const u of input.businessUseCases ?? []) useCaseTouchCount.set(u.id, 0);

  for (const step of input.flowSteps ?? []) {
    const accesses = step.dataAccess ?? [];
    if (accesses.length > 0) {
      useCaseTouchCount.set(step.useCaseId, (useCaseTouchCount.get(step.useCaseId) ?? 0) + accesses.length);
    }
    for (const access of accesses) touchedDataIds.add(access.dataId);
  }

  const untouchedDataIds = (input.drivingData ?? [])
    .filter((d) => !touchedDataIds.has(d.id))
    .map((d) => d.id);
  const dataLessUseCaseIds = (input.businessUseCases ?? [])
    .filter((u) => (useCaseTouchCount.get(u.id) ?? 0) === 0)
    .map((u) => u.id);

  return { untouchedDataIds, dataLessUseCaseIds };
}

// --- BRC-11: hasStates 宣言と states 実体の照合 ---
export function findStateDeclarationMismatches(
  input: GenerateBusinessRequirementModelInput
): BusinessRequirementStateMismatch[] {
  const result: BusinessRequirementStateMismatch[] = [];
  for (const data of input.drivingData ?? []) {
    const hasStatesEntries = (data.states ?? []).length > 0;
    if (data.hasStates === true && !hasStatesEntries) {
      result.push({ dataId: data.id, kind: "declared-but-no-states" });
    } else if (data.hasStates === false && hasStatesEntries) {
      result.push({ dataId: data.id, kind: "states-but-not-declared" });
    }
  }
  return result;
}

// --- BRC-12: 達成判定指標・測定方法の未記入 ---
export function findIncompletePurposes(
  input: GenerateBusinessRequirementModelInput
): BusinessRequirementIncompletePurpose[] {
  const result: BusinessRequirementIncompletePurpose[] = [];
  for (const purpose of input.purposes ?? []) {
    const missing: ("achievementMetric" | "measurementMethod")[] = [];
    if (!purpose.achievementMetric || purpose.achievementMetric.trim() === "") {
      missing.push("achievementMetric");
    }
    if (!purpose.measurementMethod || purpose.measurementMethod.trim() === "") {
      missing.push("measurementMethod");
    }
    if (missing.length > 0) result.push({ id: purpose.id, missing });
  }
  return result;
}

// --- BRC-13: 例外時の業務運用(BUC-06)未記入 ---
export function findMissingExceptionOperations(input: GenerateBusinessRequirementModelInput): string[] {
  return (input.businessUseCases ?? [])
    .filter((u) => !u.exceptionOperation || u.exceptionOperation.trim() === "")
    .map((u) => u.id);
}

// --- BRC-14: claimedFeatureCoveragePercent と実測値の突き合わせ ---
export function computeFeatureCoverage(
  input: GenerateBusinessRequirementModelInput
): BusinessRequirementFeatureCoverage {
  if (!input.featureIdPopulation || input.featureIdPopulation.length === 0) {
    return {
      basis: "unavailable",
      claimedPercent: input.claimedFeatureCoveragePercent,
      mismatch: input.claimedFeatureCoveragePercent !== undefined,
    };
  }
  const referenced = allReferencedFeatureIds(input);
  const population = input.featureIdPopulation;
  const covered = population.filter((f) => referenced.has(f)).length;
  const computedPercent =
    population.length === 0 ? 0 : Math.round((covered / population.length) * 1000) / 10;
  const claimedPercent = input.claimedFeatureCoveragePercent;
  const mismatch = claimedPercent !== undefined && Math.abs(claimedPercent - computedPercent) > 0.05;
  return { basis: "declared-population", computedPercent, claimedPercent, mismatch };
}

// --- BRC-15: useCaseAspects の required:true 項目が空欄 ---
function useCaseAspectFieldValue(
  useCase: NonNullable<GenerateBusinessRequirementModelInput["businessUseCases"]>[number],
  aspectId: string
): string | undefined {
  switch (aspectId) {
    case "BUC-01":
      return useCase.name;
    case "BUC-02":
      return useCase.actorRoleId;
    case "BUC-03":
      return useCase.trigger;
    case "BUC-04":
      return useCase.completionState;
    default:
      return undefined;
  }
}

export function findMissingRequiredUseCaseAspects(
  input: GenerateBusinessRequirementModelInput,
  frame: BusinessRequirementFrame = businessRequirementFrame
): BusinessRequirementMissingRequiredAspect[] {
  const requiredAspects = frame.useCaseAspects.filter((a) => a.required);
  const result: BusinessRequirementMissingRequiredAspect[] = [];
  for (const useCase of input.businessUseCases ?? []) {
    const missingAspectIds: string[] = [];
    for (const aspect of requiredAspects) {
      const value = useCaseAspectFieldValue(useCase, aspect.id);
      if (!value || value.trim() === "") missingAspectIds.push(aspect.id);
    }
    if (missingAspectIds.length > 0) result.push({ id: useCase.id, missingAspectIds });
  }
  return result;
}
