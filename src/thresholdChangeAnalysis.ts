import { computeBoundaryRows } from "./tools/designBoundaryValues.js";
import { listEquivalenceClasses } from "./tools/designEquivalencePartitioning.js";
import { matchesParameterLiteral } from "./testCaseAnalysis.js";
import type {
  BoundaryValueMode,
  EquivalenceClassSpec,
  EquivalencePartitioningVariableSpec,
  ReexpandThresholdChangesInput,
  TestCaseParameter,
  ThresholdArtifactVerdict,
  ThresholdBindingIssue,
  ThresholdBoundaryBinding,
  ThresholdBoundaryReexpansionRow,
  ThresholdChangeFinding,
  ThresholdChangeSummary,
  ThresholdChangeTestCase,
  ThresholdEquivalenceBinding,
  ThresholdEquivalenceReexpansionRow,
  ThresholdImpactedArtifactRow,
  ThresholdParameterDiffRow,
  ThresholdReexpansionVerdict,
  ThresholdReferenceRow,
} from "./types.js";

// reexpand_threshold_changes 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順（または明示したソートキー）で決定的。

function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    result.push(item);
  }
  return result;
}

// --- 1. パラメータ差分 ---

export function diffThresholdParameters(
  before: TestCaseParameter[],
  after: TestCaseParameter[]
): ThresholdParameterDiffRow[] {
  const beforeList = dedupeByName(before);
  const afterList = dedupeByName(after);
  const beforeMap = new Map(beforeList.map((p) => [p.name, p]));
  const afterNames = new Set(afterList.map((p) => p.name));

  const rows: ThresholdParameterDiffRow[] = [];

  for (const afterParam of afterList) {
    const beforeParam = beforeMap.get(afterParam.name);
    if (!beforeParam) {
      rows.push({
        name: afterParam.name,
        kind: "added",
        afterValue: afterParam.value,
        afterUnit: afterParam.unit,
        source: afterParam.source,
      });
      continue;
    }

    const valueChanged = beforeParam.value.trim() !== afterParam.value.trim();
    const beforeUnit = beforeParam.unit ?? "";
    const afterUnit = afterParam.unit ?? "";
    const unitChanged = beforeUnit !== afterUnit;

    const kind = valueChanged && unitChanged
      ? "value-unit-changed"
      : valueChanged
        ? "value-changed"
        : unitChanged
          ? "unit-changed"
          : "unchanged";

    rows.push({
      name: afterParam.name,
      kind,
      beforeValue: beforeParam.value,
      afterValue: afterParam.value,
      beforeUnit: beforeParam.unit,
      afterUnit: afterParam.unit,
      source: afterParam.source ?? beforeParam.source,
    });
  }

  for (const beforeParam of beforeList) {
    if (afterNames.has(beforeParam.name)) continue;
    rows.push({
      name: beforeParam.name,
      kind: "removed",
      beforeValue: beforeParam.value,
      beforeUnit: beforeParam.unit,
      source: beforeParam.source,
    });
  }

  return rows;
}

// --- 2. 境界値変数の束縛解決 ---

interface ResolvedBoundaryVariable {
  name: string;
  min: number;
  max: number;
  valueType?: "int" | "decimal";
  step?: number;
}

function parseNumericParameterValue(value: string): number | undefined {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolveBoundaryVariables(
  bindings: ThresholdBoundaryBinding[],
  parameters: TestCaseParameter[],
  snapshot: "before" | "after"
): { variables: ResolvedBoundaryVariable[]; issues: ThresholdBindingIssue[] } {
  const issues: ThresholdBindingIssue[] = [];
  const variables: ResolvedBoundaryVariable[] = [];
  const paramMap = new Map(dedupeByName(parameters).map((p) => [p.name, p]));

  const resolveBound = (
    binding: ThresholdBoundaryBinding,
    bound: "min" | "max"
  ): number | undefined => {
    const parameterName = bound === "min" ? binding.minParameterName : binding.maxParameterName;
    const literal = bound === "min" ? binding.min : binding.max;

    if (parameterName !== undefined) {
      const param = paramMap.get(parameterName);
      if (!param) {
        issues.push({
          snapshot,
          variable: binding.name,
          bound,
          parameterName,
          kind: "parameter-not-found",
          detail: `${binding.name}: 束縛先パラメータ「${parameterName}」が${
            snapshot === "before" ? "変更前" : "変更後"
          }のパラメータ表に見つからない。`,
        });
        return undefined;
      }
      const numeric = parseNumericParameterValue(param.value);
      if (numeric === undefined) {
        issues.push({
          snapshot,
          variable: binding.name,
          bound,
          parameterName,
          kind: "non-numeric-parameter",
          detail: `${binding.name}: 束縛先パラメータ「${parameterName}」の値「${param.value}」が数値として解釈できない。`,
        });
        return undefined;
      }
      return numeric;
    }

    if (literal !== undefined) return literal;

    issues.push({
      snapshot,
      variable: binding.name,
      bound,
      kind: "missing-bound",
      detail: `${binding.name}: ${bound === "min" ? "下限" : "上限"}の束縛（${
        bound === "min" ? "minParameterName / min" : "maxParameterName / max"
      }）が指定されていない。`,
    });
    return undefined;
  };

  for (const binding of bindings) {
    const min = resolveBound(binding, "min");
    const max = resolveBound(binding, "max");
    if (min === undefined || max === undefined) continue;
    variables.push({
      name: binding.name,
      min,
      max,
      valueType: binding.valueType,
      step: binding.step,
    });
  }

  return { variables, issues };
}

// --- 3. 境界値の再展開差分 ---

export function buildBoundaryReexpansion(
  bindings: ThresholdBoundaryBinding[],
  before: TestCaseParameter[],
  after: TestCaseParameter[],
  mode: BoundaryValueMode = "three"
): { rows: ThresholdBoundaryReexpansionRow[]; issues: ThresholdBindingIssue[] } {
  const beforeResolved = resolveBoundaryVariables(bindings, before, "before");
  const afterResolved = resolveBoundaryVariables(bindings, after, "after");
  const issues = [...beforeResolved.issues, ...afterResolved.issues];

  const beforeResults = computeBoundaryRows(beforeResolved.variables, mode);
  const afterResults = computeBoundaryRows(afterResolved.variables, mode);
  const beforeByVar = new Map(beforeResults.map((r) => [r.name, r]));
  const afterByVar = new Map(afterResults.map((r) => [r.name, r]));

  const rows: ThresholdBoundaryReexpansionRow[] = [];

  for (const binding of bindings) {
    const beforeRes = beforeByVar.get(binding.name);
    const afterRes = afterByVar.get(binding.name);
    if (!beforeRes && !afterRes) continue;

    const beforeRows = beforeRes?.rows ?? [];
    const afterRows = afterRes?.rows ?? [];
    const beforeMap = new Map(beforeRows.map((r) => [r.label, r]));
    const afterMap = new Map(afterRows.map((r) => [r.label, r]));

    const labelOrder: string[] = [];
    for (const r of beforeRows) labelOrder.push(r.label);
    for (const r of afterRows) if (!beforeMap.has(r.label)) labelOrder.push(r.label);

    for (const label of labelOrder) {
      const b = beforeMap.get(label);
      const a = afterMap.get(label);
      const validity = a?.validity ?? b?.validity ?? "valid";
      let verdict: ThresholdReexpansionVerdict;
      if (b && a) verdict = b.value === a.value ? "unchanged" : "changed";
      else if (b && !a) verdict = "removed";
      else verdict = "added";

      rows.push({
        variable: binding.name,
        label,
        validity,
        beforeValue: b?.value,
        afterValue: a?.value,
        beforeTargetId: b ? `BV:${binding.name}:${b.value}` : undefined,
        afterTargetId: a ? `BV:${binding.name}:${a.value}` : undefined,
        verdict,
      });
    }
  }

  return { rows, issues };
}

// --- 4. 同値クラス代表値の再展開差分 ---

function resolveEquivalenceVariables(
  bindings: ThresholdEquivalenceBinding[],
  parameters: TestCaseParameter[],
  snapshot: "before" | "after"
): { variables: EquivalencePartitioningVariableSpec[]; issues: ThresholdBindingIssue[] } {
  const issues: ThresholdBindingIssue[] = [];
  const variables: EquivalencePartitioningVariableSpec[] = [];
  const paramMap = new Map(dedupeByName(parameters).map((p) => [p.name, p]));

  for (const binding of bindings) {
    const validClasses: EquivalenceClassSpec[] = [];
    const invalidClasses: EquivalenceClassSpec[] = [];

    for (const cls of binding.classes) {
      let representative: string | undefined;
      if (cls.representativeParameterName !== undefined) {
        const param = paramMap.get(cls.representativeParameterName);
        if (!param) {
          issues.push({
            snapshot,
            variable: binding.name,
            bound: "representative",
            parameterName: cls.representativeParameterName,
            kind: "parameter-not-found",
            detail: `${binding.name}/${cls.label}: 束縛先パラメータ「${cls.representativeParameterName}」が${
              snapshot === "before" ? "変更前" : "変更後"
            }のパラメータ表に見つからない。`,
          });
          continue;
        }
        representative = param.value;
      } else {
        representative = cls.representative;
      }

      const spec: EquivalenceClassSpec = {
        label: cls.label,
        representative: representative ?? "",
        description: cls.description,
      };
      if (cls.kind === "valid") validClasses.push(spec);
      else invalidClasses.push(spec);
    }

    if (validClasses.length === 0 && invalidClasses.length === 0) continue;
    variables.push({
      name: binding.name,
      validClasses,
      invalidClasses: invalidClasses.length > 0 ? invalidClasses : undefined,
    });
  }

  return { variables, issues };
}

export function buildEquivalenceReexpansion(
  bindings: ThresholdEquivalenceBinding[],
  before: TestCaseParameter[],
  after: TestCaseParameter[]
): { rows: ThresholdEquivalenceReexpansionRow[]; issues: ThresholdBindingIssue[] } {
  const beforeResolved = resolveEquivalenceVariables(bindings, before, "before");
  const afterResolved = resolveEquivalenceVariables(bindings, after, "after");
  const issues = [...beforeResolved.issues, ...afterResolved.issues];

  const beforeClasses = listEquivalenceClasses(beforeResolved.variables);
  const afterClasses = listEquivalenceClasses(afterResolved.variables);

  const groupByVar = <T extends { variable: string }>(items: T[]): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const list = map.get(item.variable);
      if (list) list.push(item);
      else map.set(item.variable, [item]);
    }
    return map;
  };
  const beforeByVar = groupByVar(beforeClasses);
  const afterByVar = groupByVar(afterClasses);

  const rows: ThresholdEquivalenceReexpansionRow[] = [];

  for (const binding of bindings) {
    const bList = beforeByVar.get(binding.name) ?? [];
    const aList = afterByVar.get(binding.name) ?? [];
    if (bList.length === 0 && aList.length === 0) continue;

    const bMap = new Map(bList.map((c) => [c.label, c]));
    const aMap = new Map(aList.map((c) => [c.label, c]));

    const labelOrder: string[] = [];
    for (const c of bList) labelOrder.push(c.label);
    for (const c of aList) if (!bMap.has(c.label)) labelOrder.push(c.label);

    for (const label of labelOrder) {
      const b = bMap.get(label);
      const a = aMap.get(label);
      const kind = (a ?? b)!.kind;
      let verdict: ThresholdReexpansionVerdict;
      if (b && a) verdict = b.representative === a.representative ? "unchanged" : "changed";
      else if (b && !a) verdict = "removed";
      else verdict = "added";

      rows.push({
        variable: binding.name,
        label,
        kind,
        targetId: `EP:${binding.name}:${label}`,
        beforeRepresentative: b?.representative,
        afterRepresentative: a?.representative,
        verdict,
      });
    }
  }

  return { rows, issues };
}

// --- 5. パラメータ参照インデックス ---

interface ReferenceScanTarget {
  ownerKind: "testCondition" | "testCase";
  ownerId: string;
  place: string;
  text: string | undefined;
}

function collectReferenceScanTargets(
  input: ReexpandThresholdChangesInput
): ReferenceScanTarget[] {
  const targets: ReferenceScanTarget[] = [];

  for (const condition of input.testConditions ?? []) {
    targets.push({ ownerKind: "testCondition", ownerId: condition.id, place: "statement", text: condition.statement });
    targets.push({ ownerKind: "testCondition", ownerId: condition.id, place: "target", text: condition.target });
  }

  for (const testCase of input.testCases ?? []) {
    targets.push({ ownerKind: "testCase", ownerId: testCase.caseId, place: "title", text: testCase.title });
    (testCase.preconditions ?? []).forEach((v, i) => {
      targets.push({
        ownerKind: "testCase",
        ownerId: testCase.caseId,
        place: `preconditions[${i}].value`,
        text: v.value,
      });
    });
    (testCase.postconditions ?? []).forEach((v, i) => {
      targets.push({
        ownerKind: "testCase",
        ownerId: testCase.caseId,
        place: `postconditions[${i}].value`,
        text: v.value,
      });
    });
    (testCase.steps ?? []).forEach((s, i) => {
      targets.push({ ownerKind: "testCase", ownerId: testCase.caseId, place: `steps[${i}].action`, text: s.action });
      targets.push({
        ownerKind: "testCase",
        ownerId: testCase.caseId,
        place: `steps[${i}].expected`,
        text: s.expected,
      });
    });
    targets.push({ ownerKind: "testCase", ownerId: testCase.caseId, place: "note", text: testCase.note });
  }

  return targets;
}

export function buildParameterReferenceIndex(
  input: ReexpandThresholdChangesInput,
  diffRows: ThresholdParameterDiffRow[]
): ThresholdReferenceRow[] {
  const targets = collectReferenceScanTargets(input);
  const changedRows = diffRows.filter((d) => d.kind !== "unchanged");

  const rows: ThresholdReferenceRow[] = [];
  for (const target of targets) {
    if (!target.text) continue;
    for (const diffRow of changedRows) {
      if (target.text.includes(diffRow.name)) {
        rows.push({
          parameterName: diffRow.name,
          ownerKind: target.ownerKind,
          ownerId: target.ownerId,
          place: target.place,
          form: "name",
        });
        continue;
      }
      if (
        diffRow.beforeValue !== undefined &&
        diffRow.beforeValue.trim().length > 1 &&
        matchesParameterLiteral(target.text, { value: diffRow.beforeValue, unit: diffRow.beforeUnit })
      ) {
        rows.push({
          parameterName: diffRow.name,
          ownerKind: target.ownerKind,
          ownerId: target.ownerId,
          place: target.place,
          form: "stale-literal",
          matchedText: diffRow.beforeValue,
        });
        continue;
      }
      if (
        diffRow.afterValue !== undefined &&
        diffRow.afterValue.trim().length > 1 &&
        matchesParameterLiteral(target.text, { value: diffRow.afterValue, unit: diffRow.afterUnit })
      ) {
        rows.push({
          parameterName: diffRow.name,
          ownerKind: target.ownerKind,
          ownerId: target.ownerId,
          place: target.place,
          form: "current-literal",
          matchedText: diffRow.afterValue,
        });
      }
    }
  }

  return rows;
}

// --- 6. 失効した網羅対象ID参照 ---

export function findDanglingCoverageTargetRefs(
  testCases: ThresholdChangeTestCase[],
  boundaryRows: ThresholdBoundaryReexpansionRow[]
): ThresholdChangeFinding[] {
  const staleTargets = new Map<string, ThresholdBoundaryReexpansionRow>();
  for (const row of boundaryRows) {
    if (row.verdict === "changed" || row.verdict === "removed") {
      if (row.beforeTargetId) staleTargets.set(row.beforeTargetId, row);
    }
  }

  const findings: ThresholdChangeFinding[] = [];
  for (const testCase of testCases) {
    (testCase.coverageTargets ?? []).forEach((targetId, idx) => {
      const staleRow = staleTargets.get(targetId);
      if (!staleRow) return;
      findings.push({
        categoryId: "TCI-02",
        severity: "high",
        ownerKind: "testCase",
        ownerId: testCase.caseId,
        places: [`coverageTargets[${idx}]`],
        detail: `coverageTargets が再展開後に存在しない網羅対象ID「${targetId}」を参照している。`,
        suggestion:
          staleRow.verdict === "changed" && staleRow.afterTargetId
            ? `${staleRow.beforeTargetId} → ${staleRow.afterTargetId}`
            : undefined,
      });
    });
  }
  return findings;
}

// --- 7. 判定区分ごとの指摘 ---

function mergeByOwnerParam(
  rows: { ownerKind: "testCondition" | "testCase"; ownerId: string; parameterName: string; place: string }[],
  categoryId: string,
  severity: "high" | "medium" | "info",
  detailFor: (row: {
    ownerKind: "testCondition" | "testCase";
    ownerId: string;
    parameterName: string;
    place: string;
  }) => string
): ThresholdChangeFinding[] {
  const map = new Map<string, ThresholdChangeFinding>();
  for (const row of rows) {
    const key = `${row.ownerKind}::${row.ownerId}::${row.parameterName}`;
    const existing = map.get(key);
    if (existing) {
      existing.places.push(row.place);
    } else {
      map.set(key, {
        categoryId,
        severity,
        parameterName: row.parameterName,
        ownerKind: row.ownerKind,
        ownerId: row.ownerId,
        places: [row.place],
        detail: detailFor(row),
      });
    }
  }
  return [...map.values()];
}

export function buildThresholdChangeFindings(
  input: ReexpandThresholdChangesInput,
  diffRows: ThresholdParameterDiffRow[],
  references: ThresholdReferenceRow[],
  boundaryRows: ThresholdBoundaryReexpansionRow[],
  equivalenceRows: ThresholdEquivalenceReexpansionRow[],
  bindingIssues: ThresholdBindingIssue[]
): ThresholdChangeFinding[] {
  const staleRefs = references.filter((r) => r.form === "stale-literal");
  const tci01 = mergeByOwnerParam(
    staleRefs,
    "TCI-01",
    "high",
    (row) => {
      const ref = staleRefs.find((r) => r.ownerKind === row.ownerKind && r.ownerId === row.ownerId && r.parameterName === row.parameterName);
      return `旧値の直値「${ref?.matchedText ?? ""}」が本文に残っている。パラメータ名参照へ置き換えること。`;
    }
  );

  const tci02 = findDanglingCoverageTargetRefs(input.testCases ?? [], boundaryRows);

  const changedRowNames = new Set(
    diffRows.filter((d) => d.kind === "value-changed" || d.kind === "value-unit-changed").map((d) => d.name)
  );
  const nameRefs = references.filter((r) => r.form === "name" && changedRowNames.has(r.parameterName));
  const tci03 = mergeByOwnerParam(
    nameRefs,
    "TCI-03",
    "medium",
    (row) =>
      `パラメータ「${row.parameterName}」は名前参照のため本文修正は不要だが、期待結果・前提条件の数値記述が変更後の値と整合するか確認すること。`
  );

  const tci04: ThresholdChangeFinding[] = diffRows
    .filter((d) => d.kind === "unit-changed" || d.kind === "value-unit-changed")
    .map((d) => ({
      categoryId: "TCI-04",
      severity: "high" as const,
      parameterName: d.name,
      places: [],
      detail: `単位が変更された（${d.beforeUnit ?? "-"} → ${d.afterUnit ?? "-"}）。値が同じでも意味が変わる可能性がある。`,
    }));

  const tci05: ThresholdChangeFinding[] = [];
  for (const d of diffRows) {
    if (d.kind !== "removed") continue;
    const owners = new Map<string, { ownerKind: "testCondition" | "testCase"; ownerId: string; places: string[] }>();
    for (const ref of references) {
      if (ref.parameterName !== d.name) continue;
      const key = `${ref.ownerKind}::${ref.ownerId}`;
      const existing = owners.get(key);
      if (existing) existing.places.push(ref.place);
      else owners.set(key, { ownerKind: ref.ownerKind, ownerId: ref.ownerId, places: [ref.place] });
    }
    for (const owner of owners.values()) {
      tci05.push({
        categoryId: "TCI-05",
        severity: "high",
        parameterName: d.name,
        ownerKind: owner.ownerKind,
        ownerId: owner.ownerId,
        places: owner.places,
        detail: `削除されたパラメータ「${d.name}」を参照している。参照元を見直すこと。`,
      });
    }
  }

  const tci06: ThresholdChangeFinding[] = diffRows
    .filter((d) => d.kind === "value-changed" || d.kind === "value-unit-changed" || d.kind === "unit-changed")
    .filter((d) => !references.some((r) => r.parameterName === d.name))
    .map((d) => ({
      categoryId: "TCI-06",
      severity: "medium" as const,
      parameterName: d.name,
      places: [],
      detail: `値を変更したパラメータ「${d.name}」への参照が成果物側に見つからない（未反映または追跡不能）。`,
    }));

  const tci07: ThresholdChangeFinding[] = diffRows
    .filter((d) => d.kind === "added")
    .filter((d) => !references.some((r) => r.parameterName === d.name))
    .map((d) => ({
      categoryId: "TCI-07",
      severity: "info" as const,
      parameterName: d.name,
      places: [],
      detail: `追加したパラメータ「${d.name}」が成果物側で未使用である。`,
    }));

  const tci08: ThresholdChangeFinding[] = bindingIssues.map((issue) => ({
    categoryId: "TCI-08",
    severity: "high" as const,
    parameterName: issue.parameterName,
    places: [],
    detail: issue.detail,
  }));

  // equivalenceRows は指摘生成には使わない（3.2節の差分表示のみで使用）が、
  // シグネチャの一貫性のために受け取っておく。
  void equivalenceRows;

  return [...tci01, ...tci02, ...tci03, ...tci04, ...tci05, ...tci06, ...tci07, ...tci08];
}

// --- 8. 成果物別の影響判定 ---

function verdictForSeverity(severity: "high" | "medium" | "info" | undefined): ThresholdArtifactVerdict {
  if (severity === "high") return "要修正";
  if (severity === "medium") return "要再確認";
  return "影響なし";
}

export function buildImpactedArtifacts(
  input: ReexpandThresholdChangesInput,
  findings: ThresholdChangeFinding[]
): ThresholdImpactedArtifactRow[] {
  const byOwner = new Map<
    string,
    { parameterNames: string[]; categoryIds: string[]; maxSeverity?: "high" | "medium" | "info" }
  >();

  for (const f of findings) {
    if (!f.ownerKind || !f.ownerId) continue;
    const key = `${f.ownerKind}::${f.ownerId}`;
    let entry = byOwner.get(key);
    if (!entry) {
      entry = { parameterNames: [], categoryIds: [] };
      byOwner.set(key, entry);
    }
    if (f.parameterName && !entry.parameterNames.includes(f.parameterName)) entry.parameterNames.push(f.parameterName);
    if (!entry.categoryIds.includes(f.categoryId)) entry.categoryIds.push(f.categoryId);
    if (f.severity === "high") entry.maxSeverity = "high";
    else if (f.severity === "medium" && entry.maxSeverity !== "high") entry.maxSeverity = "medium";
    else if (!entry.maxSeverity) entry.maxSeverity = f.severity;
  }

  const rows: ThresholdImpactedArtifactRow[] = [];
  for (const c of input.testConditions ?? []) {
    const entry = byOwner.get(`testCondition::${c.id}`);
    rows.push({
      ownerKind: "testCondition",
      ownerId: c.id,
      title: c.statement,
      parameterNames: entry?.parameterNames ?? [],
      categoryIds: entry?.categoryIds ?? [],
      verdict: verdictForSeverity(entry?.maxSeverity),
    });
  }
  for (const c of input.testCases ?? []) {
    const entry = byOwner.get(`testCase::${c.caseId}`);
    rows.push({
      ownerKind: "testCase",
      ownerId: c.caseId,
      title: c.title,
      parameterNames: entry?.parameterNames ?? [],
      categoryIds: entry?.categoryIds ?? [],
      verdict: verdictForSeverity(entry?.maxSeverity),
    });
  }
  return rows;
}

// --- 9. サマリ ---

export function summarizeThresholdChange(
  diffRows: ThresholdParameterDiffRow[],
  boundaryRows: ThresholdBoundaryReexpansionRow[],
  equivalenceRows: ThresholdEquivalenceReexpansionRow[],
  findings: ThresholdChangeFinding[],
  impacted: ThresholdImpactedArtifactRow[]
): ThresholdChangeSummary {
  const changedParameterCount = diffRows.filter(
    (d) => d.kind === "value-changed" || d.kind === "unit-changed" || d.kind === "value-unit-changed"
  ).length;
  const addedParameterCount = diffRows.filter((d) => d.kind === "added").length;
  const removedParameterCount = diffRows.filter((d) => d.kind === "removed").length;
  const reexpandedTargetCount =
    boundaryRows.filter((r) => r.verdict !== "unchanged").length +
    equivalenceRows.filter((r) => r.verdict !== "unchanged").length;
  const staleLiteralCount = findings.filter((f) => f.categoryId === "TCI-01").length;
  const danglingTargetRefCount = findings.filter((f) => f.categoryId === "TCI-02").length;
  const mustFixArtifactCount = impacted.filter((r) => r.verdict === "要修正").length;
  const recheckArtifactCount = impacted.filter((r) => r.verdict === "要再確認").length;
  const bindingIssueCount = findings.filter((f) => f.categoryId === "TCI-08").length;

  return {
    changedParameterCount,
    addedParameterCount,
    removedParameterCount,
    reexpandedTargetCount,
    staleLiteralCount,
    danglingTargetRefCount,
    mustFixArtifactCount,
    recheckArtifactCount,
    bindingIssueCount,
  };
}
