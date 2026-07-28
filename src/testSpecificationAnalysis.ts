import { extractIdOccurrences, type TestBasisAnalysisOptions } from "./testBasisAnalysis.js";
import { escapeRegExp } from "./tools/reviewTestPlan.js";
import { derivedFromIds, toDerivedFromRef } from "./derivedFromRefs.js";
import type {
  TestBasisDocument,
  TestCaseSourceCondition,
  TestCaseSpec,
  TestSpecificationCoverageRow,
  TestSpecificationDeclarationCheck,
  TestSpecificationIdSyncMismatch,
  TestSpecificationPreconditionFinding,
  TestSpecificationPriorityCount,
  TestSpecificationRisk,
  TestSpecificationStepBalanceFinding,
  TestSpecificationUnfoundedCase,
} from "./types.js";

// review_test_specification 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順で決定的。
// 曖昧語辞書・主観語辞書・要件IDパターンは testBasisAnalysis / testCaseAnalysis の定義を再利用し、
// 本ファイルでは重複定義しない。

/** 前提条件が実質未記入とみなすプレースホルダー語 */
export const PRECONDITION_PLACEHOLDER_VALUES: string[] = ["特になし", "なし", "-", "N/A", ""];

/** 手順数がこの値以上のケースを「検証点不足」検査の対象にする */
export const DEFAULT_STEP_BALANCE_THRESHOLD = 5;

/** 優先度の判定基準が宣言されているかを探すキーワード */
export const PRIORITY_CRITERIA_KEYWORDS: string[] = [
  "優先度の基準",
  "優先度は次の基準",
  "優先度の判定基準",
  "優先度判定基準",
  "優先度付けの基準",
  "priority criteria",
];

/** 網羅基準が宣言されているかを探すキーワード */
export const COVERAGE_CRITERIA_KEYWORDS: string[] = [
  "網羅基準",
  "カバレッジ基準",
  "終了基準",
  "完了基準",
  "coverage criteria",
];

const PRIORITY_LEVELS: string[] = ["高", "中", "低"];

// --- 要件IDの母集合 ---

/** テストベース文書の定義行（role === "definition"）から要件IDを重複排除して抽出する。 */
export function extractRequirementIdsFromDocuments(
  documents: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): string[] {
  const ids: string[] = [];
  for (const occ of extractIdOccurrences(documents, options)) {
    if (occ.role !== "definition") continue;
    if (!ids.includes(occ.id)) ids.push(occ.id);
  }
  return ids;
}

/** テストベース文書に現れる全ID（定義・参照の双方）を重複排除して返す。ID表記同期の照合母集合。 */
export function extractAllBasisIds(
  documents: TestBasisDocument[],
  options: TestBasisAnalysisOptions = {}
): string[] {
  const ids: string[] = [];
  for (const occ of extractIdOccurrences(documents, options)) {
    if (!ids.includes(occ.id)) ids.push(occ.id);
  }
  return ids;
}

// --- 双方向カバレッジ（要件ID / リスクID: derivedFrom 経由） ---

/** derivedFrom を辿って ID → ケースID の順方向カバレッジ表を作る。 */
export function buildDerivedFromCoverage(
  ids: string[],
  testCases: TestCaseSpec[]
): TestSpecificationCoverageRow[] {
  return ids.map((id) => ({
    id,
    caseIds: testCases.filter((c) => derivedFromIds(c.derivedFrom).includes(id)).map((c) => c.caseId),
  }));
}

/** カバレッジ表から、紐づくケースが0件のIDを列挙する。 */
export function findUncoveredIds(rows: TestSpecificationCoverageRow[]): string[] {
  return rows.filter((row) => row.caseIds.length === 0).map((row) => row.id);
}

/** derivedFrom が既知IDに一件も一致しないケース（根拠不明・過剰テスト候補）を列挙する。 */
export function findUnfoundedCases(
  knownIds: string[],
  testCases: TestCaseSpec[],
  expectedKind = "requirementIds[]"
): TestSpecificationUnfoundedCase[] {
  if (knownIds.length === 0) return [];
  const known = new Set(knownIds);
  const result: TestSpecificationUnfoundedCase[] = [];
  for (const c of testCases) {
    const ids = derivedFromIds(c.derivedFrom);
    if (ids.some((ref) => known.has(ref))) continue;
    result.push({ caseId: c.caseId, refs: ids, expectedKind });
  }
  return result;
}

// --- 双方向カバレッジ（テスト条件ID: testConditionId 経由） ---

/** testConditionId が testConditions[].id に存在しないケースを列挙する。 */
export function findUnknownConditionRefs(
  conditions: TestCaseSourceCondition[],
  testCases: TestCaseSpec[]
): TestSpecificationUnfoundedCase[] {
  const known = new Set(conditions.map((c) => c.id));
  const result: TestSpecificationUnfoundedCase[] = [];
  for (const c of testCases) {
    if (known.has(c.testConditionId)) continue;
    result.push({
      caseId: c.caseId,
      refs: [c.testConditionId],
      expectedKind: "testConditions[].id",
    });
  }
  return result;
}

// --- 双方向カバレッジ（リスクID: derivedFrom 直接参照 + テスト条件経由の間接参照） ---

/**
 * リスクIDごとに、そのリスクをカバーするケースIDを集める。
 * 「ケースの derivedFrom がリスクIDを直接参照」と
 * 「リスクを derivedFrom に持つテスト条件を、ケースが testConditionId で参照」の
 * 2系統を合算する（推移的カバレッジ: リスク → テスト条件 → テストケース）。
 * testConditions 省略時は直接参照のみで判定する（従来動作）。
 */
export function buildRiskCoverage(
  risks: TestSpecificationRisk[],
  testConditions: TestCaseSourceCondition[] | undefined,
  testCases: TestCaseSpec[]
): TestSpecificationCoverageRow[] {
  const conditionIdsByRisk = new Map<string, Set<string>>();
  for (const condition of testConditions ?? []) {
    for (const riskId of derivedFromIds(condition.derivedFrom)) {
      if (!conditionIdsByRisk.has(riskId)) conditionIdsByRisk.set(riskId, new Set());
      conditionIdsByRisk.get(riskId)!.add(condition.id);
    }
  }

  return risks.map((risk) => {
    const conditionIds = conditionIdsByRisk.get(risk.id);
    const caseIds: string[] = [];
    for (const c of testCases) {
      const isDirect = derivedFromIds(c.derivedFrom).includes(risk.id);
      const isIndirect = conditionIds !== undefined && conditionIds.has(c.testConditionId);
      if (isDirect || isIndirect) caseIds.push(c.caseId);
    }
    return { id: risk.id, caseIds };
  });
}

function riskPrefixOf(id: string): string {
  const idx = id.indexOf("-");
  return idx > 0 ? id.slice(0, idx) : id;
}

/**
 * derivedFrom 中でリスクIDのプレフィックスに一致するが risks[].id に存在しない参照を列挙する。
 * リスクIDパターンは risks[].id のプレフィックス（先頭ハイフンまで）から決定的に導出する。
 */
export function findUnknownRiskRefs(
  risks: TestSpecificationRisk[],
  testCases: TestCaseSpec[]
): TestSpecificationUnfoundedCase[] {
  if (risks.length === 0) return [];
  const known = new Set(risks.map((r) => r.id));
  const prefixes = new Set(risks.map((r) => riskPrefixOf(r.id)));
  const result: TestSpecificationUnfoundedCase[] = [];
  for (const c of testCases) {
    const refs: string[] = [];
    for (const entry of c.derivedFrom) {
      const parsed = toDerivedFromRef(entry);
      if (known.has(parsed.id)) continue;
      const isExplicitRisk = parsed.kind === "risk";
      const isPrefixMatch = prefixes.has(riskPrefixOf(parsed.id));
      if (isExplicitRisk || isPrefixMatch) refs.push(parsed.id);
    }
    if (refs.length === 0) continue;
    result.push({ caseId: c.caseId, refs, expectedKind: "risks[].id" });
  }
  return result;
}

// --- ID表記の同期 ---

/** ID参照値を正規化する（大文字化・ハイフン/アンダースコア除去）。 */
export function normalizeIdRef(ref: string): string {
  return ref.toUpperCase().replace(/[-_]/g, "");
}

/**
 * ケース側のID参照が、テストベース定義IDと完全一致しないものの
 * 正規化後には一致する（例: EH100 と EH-100）表記ゆれを列挙する。
 */
export function findIdNotationMismatches(
  basisIds: string[],
  testCases: TestCaseSpec[]
): TestSpecificationIdSyncMismatch[] {
  const exact = new Set(basisIds);
  const byNormalized = new Map<string, string>();
  for (const id of basisIds) {
    const key = normalizeIdRef(id);
    if (!byNormalized.has(key)) byNormalized.set(key, id);
  }

  const result: TestSpecificationIdSyncMismatch[] = [];
  const push = (caseId: string, field: TestSpecificationIdSyncMismatch["field"], ref: string) => {
    if (exact.has(ref)) return;
    const normalized = normalizeIdRef(ref);
    const matchedId = byNormalized.get(normalized);
    if (!matchedId || matchedId === ref) return;
    result.push({ caseId, field, ref, normalized, matchedId });
  };

  for (const c of testCases) {
    for (const ref of derivedFromIds(c.derivedFrom)) push(c.caseId, "derivedFrom", ref);
    push(c.caseId, "testConditionId", c.testConditionId);
  }
  return result;
}

// --- 優先度 ---

/** 優先度が未設定のケースIDを列挙する。 */
export function findCasesWithoutPriority(testCases: TestCaseSpec[]): string[] {
  return testCases.filter((c) => c.priority === undefined).map((c) => c.caseId);
}

/** 高/中/低/未設定 の件数分布を返す。 */
export function buildPriorityDistribution(testCases: TestCaseSpec[]): TestSpecificationPriorityCount[] {
  const rows: TestSpecificationPriorityCount[] = PRIORITY_LEVELS.map((level) => ({
    level,
    count: testCases.filter((c) => c.priority === level).length,
  }));
  rows.push({ level: "未設定", count: findCasesWithoutPriority(testCases).length });
  return rows;
}

// --- 前提条件・状態変数の記述状況 ---

function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim();
  return PRECONDITION_PLACEHOLDER_VALUES.some((p) => p.trim() === trimmed);
}

/** preconditions が空、または全要素の値がプレースホルダーのみのケースを列挙する。 */
export function findPlaceholderPreconditions(
  testCases: TestCaseSpec[]
): TestSpecificationPreconditionFinding[] {
  const findings: TestSpecificationPreconditionFinding[] = [];
  for (const c of testCases) {
    if (c.preconditions.length === 0) {
      findings.push({
        caseId: c.caseId,
        kind: "empty",
        detail: "前提条件が未記入である。再現に必要な状態変数と値を列挙すること。",
      });
      continue;
    }
    if (c.preconditions.every((v) => isPlaceholderValue(v.value))) {
      findings.push({
        caseId: c.caseId,
        kind: "placeholder-only",
        detail:
          "前提条件の値がプレースホルダー（特になし/なし/- 等）のみである。開始状態が一意に定まる値を記述すること。",
      });
    }
  }
  return findings;
}

// --- 手順数と期待結果数のバランス ---

/**
 * 手順数が閾値以上でありながら、期待結果のユニーク値が1件以下のケースを
 * 「検証点不足」として列挙する。
 */
export function findStepBalanceIssues(
  testCases: TestCaseSpec[],
  threshold: number = DEFAULT_STEP_BALANCE_THRESHOLD
): TestSpecificationStepBalanceFinding[] {
  const findings: TestSpecificationStepBalanceFinding[] = [];
  for (const c of testCases) {
    if (c.steps.length < threshold) continue;
    const unique = new Set(c.steps.map((s) => s.expected.trim()));
    if (unique.size > 1) continue;
    findings.push({
      caseId: c.caseId,
      stepCount: c.steps.length,
      uniqueExpectedCount: unique.size,
      detail: `手順が${c.steps.length}件あるのに対し期待結果のユニーク値が${unique.size}件しかない。手順ごとに観測可能な検証点を書き分けるか、ケースを分割すること。`,
    });
  }
  return findings;
}

// --- 宣言有無のキーワード検査 ---

/**
 * テキスト中のキーワード出現を検査する。該当箇所は "document:lineIndex" 形式（lineIndex は1-based）。
 */
export function findDeclarationKeywords(
  text: string,
  keywords: string[],
  documentName = "testSpecificationText"
): TestSpecificationDeclarationCheck {
  const matches: TestSpecificationDeclarationCheck["matches"] = [];
  const lines = text.split("\n");
  lines.forEach((line, lineIndex) => {
    for (const keyword of keywords) {
      if (!new RegExp(escapeRegExp(keyword), "i").test(line)) continue;
      matches.push({
        keyword,
        place: `${documentName}:${lineIndex + 1}`,
        lineText: line.trim(),
      });
    }
  });
  return { found: matches.length > 0, matches };
}
