import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { classifyTestSize, classifyTestSizes, buildTestSizeDistribution } from "../testSizeAnalysis.js";
import { computeRiskScore, mapRiskScoreToBand } from "../testConditionAnalysis.js";
import { riskAnalysisFrame } from "../resources/riskAnalysisFrame.js";
import { testSizeClassificationCriteria } from "../resources/testSizeClassificationCriteria.js";
import { regressionSelectionAnalysisCriteria } from "../resources/regressionSelectionCriteria.js";
import type {
  RegressionItemKind,
  RegressionSelectionSpec,
  RegressionSuiteDiffItem,
  RegressionSuiteFinding,
  RegressionSuiteItemRow,
  RegressionSuiteResult,
  RegressionSuiteTestCaseInput,
  RegressionSuiteTestConditionInput,
  TestCaseSpec,
  TestConditionPriority,
} from "../types.js";

// select_regression_suite 固有の決定的エンジン。
// 純関数群で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。他の design*.ts 同様に自己完結し、他ツールの内部関数は再実装せず import する。

export const DEFAULT_REGRESSION_SUITE_ID = "REG";
export const DEFAULT_MAX_REGRESSION_ITEMS = 2000;

const FINDING_RENDER_LIMIT = 50;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function itemKey(kind: RegressionItemKind, id: string): string {
  return `${kind}::${id}`;
}

function highRiskDefaultMinScore(): number {
  const r1 = riskAnalysisFrame.bands.find((b) => b.id === "R1");
  return r1 ? r1.minScore : 30;
}

// --- メインエンジン ---

export function computeRegressionSuite(spec: RegressionSelectionSpec): RegressionSuiteResult {
  const suiteId = spec.suiteId ?? DEFAULT_REGRESSION_SUITE_ID;
  const testConditions = spec.testConditions;
  const testCases = spec.testCases;
  const selections = spec.selections ?? [];
  const selectionCriteria = spec.selectionCriteria ?? [];
  const highRiskMinScore = spec.highRiskMinScore ?? highRiskDefaultMinScore();
  const maxItems = spec.maxItems ?? DEFAULT_MAX_REGRESSION_ITEMS;

  const findings: RegressionSuiteFinding[] = [];

  const populationCount = testConditions.length + (testCases?.length ?? 0);

  const skipResult = (skipReason: string): RegressionSuiteResult => ({
    suiteId,
    generated: false,
    skipReason,
    items: [],
    includedItems: [],
    excludedItems: [],
    excludedHighRiskItems: [],
    undecidedItems: [],
    sizeDistribution: [],
    unclassifiableSelectedCaseCount: 0,
    durationBasis: "unavailable",
    coverage: { basis: "unavailable", denominator: 0, reason: skipReason, claimMismatch: false },
    findings,
  });

  if (populationCount > maxItems) {
    const detail = `母集団件数(${populationCount}件)が上限 ${maxItems} 件を超えるためスイート構成・分布・差分の算出を打ち切った。`;
    findings.push({ categoryId: "RSC-20", severity: "info", target: suiteId, detail });
    return skipResult(detail);
  }

  const conditionById = new Map<string, RegressionSuiteTestConditionInput>();
  for (const c of testConditions) conditionById.set(c.id, c);
  const caseById = new Map<string, RegressionSuiteTestCaseInput>();
  for (const c of testCases ?? []) caseById.set(c.caseId, c);

  const populationHas = (kind: RegressionItemKind, id: string): boolean =>
    kind === "condition" ? conditionById.has(id) : caseById.has(id);

  const criterionIdSet = new Set(selectionCriteria.map((c) => c.id));

  // --- 1. 選択判定の入力検査(RSC-01 / RSC-16) ---
  type ValidSelection = (typeof selections)[number];
  const validSelectionsByKey = new Map<string, ValidSelection[]>();
  for (const sel of selections) {
    if (!populationHas(sel.itemKind, sel.itemId)) {
      findings.push({
        categoryId: "RSC-01",
        severity: "high",
        target: `${sel.itemKind}:${sel.itemId}`,
        detail: `選択判定が母集団に存在しない${sel.itemKind === "condition" ? "テスト条件" : "テストケース"}ID「${sel.itemId}」を参照している。`,
      });
      continue;
    }
    const key = itemKey(sel.itemKind, sel.itemId);
    const arr = validSelectionsByKey.get(key) ?? [];
    arr.push(sel);
    validSelectionsByKey.set(key, arr);

    for (const cid of sel.criterionIds ?? []) {
      if (!criterionIdSet.has(cid)) {
        findings.push({
          categoryId: "RSC-16",
          severity: "high",
          target: `${sel.itemKind}:${sel.itemId}`,
          detail: `選択判定が selectionCriteria に存在しない基準ID「${cid}」を参照している。`,
        });
      }
    }

    if (sel.reason === undefined || sel.reason.trim().length === 0) {
      findings.push({
        categoryId: "RSC-03",
        severity: "high",
        target: `${sel.itemKind}:${sel.itemId}`,
        detail: `項目「${sel.itemId}」の選択判定(${sel.decision})に理由(reason)が記入されていない。`,
      });
    }
  }

  for (const [key, arr] of validSelectionsByKey) {
    if (arr.length > 1) {
      findings.push({
        categoryId: "RSC-02",
        severity: "high",
        target: key,
        detail: `項目「${key}」に対する選択判定が${arr.length}件重複して宣言されている。最後に宣言された判定を有効とする。`,
      });
    }
  }

  const effectiveSelection = (kind: RegressionItemKind, id: string): ValidSelection | undefined => {
    const arr = validSelectionsByKey.get(itemKey(kind, id));
    return arr && arr.length > 0 ? arr[arr.length - 1] : undefined;
  };

  // --- 2. 母集団行の構築 ---
  const items: RegressionSuiteItemRow[] = [];

  for (const c of testConditions) {
    const hasBoth = typeof c.impact === "number" && typeof c.likelihood === "number";
    const riskScore = hasBoth ? computeRiskScore(c.impact as number, c.likelihood as number, c.changeCategory, riskAnalysisFrame) : undefined;
    const riskBandId = riskScore !== undefined ? mapRiskScoreToBand(riskScore, riskAnalysisFrame)?.id : undefined;
    const isHighRisk = (riskScore !== undefined && riskScore >= highRiskMinScore) || c.priority === "高";
    const sel = effectiveSelection("condition", c.id);
    items.push({
      itemKind: "condition",
      itemId: c.id,
      label: c.statement ?? c.target ?? c.id,
      changeCategory: c.changeCategory,
      riskScore,
      riskBandId,
      priority: c.priority,
      isHighRisk,
      decision: sel ? sel.decision : "undecided",
      reason: sel?.reason,
      criterionIds: sel?.criterionIds ?? [],
    });
  }

  for (const tc of testCases ?? []) {
    const parentCondition =
      tc.testConditionId !== undefined ? conditionById.get(tc.testConditionId) : undefined;
    const changeCategory = parentCondition?.changeCategory;
    const priority: TestConditionPriority | undefined = parentCondition?.priority;
    const hasBoth = parentCondition && typeof parentCondition.impact === "number" && typeof parentCondition.likelihood === "number";
    const riskScore = hasBoth
      ? computeRiskScore(parentCondition!.impact as number, parentCondition!.likelihood as number, parentCondition!.changeCategory, riskAnalysisFrame)
      : undefined;
    const riskBandId = riskScore !== undefined ? mapRiskScoreToBand(riskScore, riskAnalysisFrame)?.id : undefined;
    const isHighRisk = (riskScore !== undefined && riskScore >= highRiskMinScore) || priority === "高";
    const classification = classifyTestSize(tc as unknown as TestCaseSpec, testSizeClassificationCriteria);
    const sel = effectiveSelection("case", tc.caseId);
    items.push({
      itemKind: "case",
      itemId: tc.caseId,
      label: tc.title ?? tc.caseId,
      changeCategory,
      inheritedFrom: parentCondition ? parentCondition.id : undefined,
      riskScore,
      riskBandId,
      priority,
      classifiedSize: classification.classifiable ? classification.classifiedSize : undefined,
      decidingFactor: classification.decidingFactor,
      durationSeconds: classification.durationSeconds,
      isHighRisk,
      decision: sel ? sel.decision : "undecided",
      reason: sel?.reason,
      criterionIds: sel?.criterionIds ?? [],
    });
  }

  // --- 3. 項目単位の決定的検査 ---
  for (const row of items) {
    if (row.decision === "undecided") {
      findings.push({
        categoryId: "RSC-05",
        severity: "high",
        target: row.itemId,
        detail: `項目「${row.itemId}」が選択・非選択のいずれとも決まっていない。`,
      });
    }
    if (row.isHighRisk && row.decision === "exclude") {
      findings.push({
        categoryId: "RSC-04",
        severity: "high",
        target: row.itemId,
        detail: `高リスク項目「${row.itemId}」(${row.riskScore !== undefined ? `riskScore=${row.riskScore}` : "priority=高"})が非選択になっている。`,
      });
    }
    if (row.changeCategory === "existing-unaffected" && row.decision === "include") {
      findings.push({
        categoryId: "RSC-07",
        severity: "medium",
        target: row.itemId,
        detail: `影響を受けない(existing-unaffected)項目「${row.itemId}」が選択されている。`,
      });
    }
    if (row.itemKind === "condition" && row.changeCategory === undefined) {
      findings.push({
        categoryId: "RSC-06",
        severity: "high",
        target: row.itemId,
        detail: `テスト条件「${row.itemId}」に変更差分区分(changeCategory)が宣言されておらず、どの変更差分区分にも紐づかない。`,
      });
    }
    if (
      row.itemKind === "condition" &&
      row.changeCategory !== undefined &&
      row.changeCategory !== "existing-unaffected" &&
      row.decision !== "include"
    ) {
      findings.push({
        categoryId: "RSC-08",
        severity: "high",
        target: row.itemId,
        detail: `影響範囲(${row.changeCategory})の条件「${row.itemId}」が非選択または未判定である。`,
      });
    }
  }

  // --- 4. testCases 指定時の条件→ケース裏付け検査(RSC-17) ---
  const caseCountByConditionId = new Map<string, number>();
  if (testCases !== undefined) {
    for (const tc of testCases) {
      if (tc.testConditionId === undefined) continue;
      caseCountByConditionId.set(tc.testConditionId, (caseCountByConditionId.get(tc.testConditionId) ?? 0) + 1);
    }
    for (const row of items) {
      if (row.itemKind !== "condition" || row.decision !== "include") continue;
      if ((caseCountByConditionId.get(row.itemId) ?? 0) === 0) {
        findings.push({
          categoryId: "RSC-17",
          severity: "high",
          target: row.itemId,
          detail: `選択した条件「${row.itemId}」に対応するテストケースが1件も存在しない。`,
        });
      }
    }
  }

  // --- 5. 選択基準の宣言検査(RSC-18) ---
  if (selectionCriteria.length === 0) {
    findings.push({
      categoryId: "RSC-18",
      severity: "medium",
      target: suiteId,
      detail: "selectionCriteria が1件も宣言されておらず、追加・削減の基準が成果物に残っていない。",
    });
  }

  // --- 6. スイート構成の確定 ---
  const includedItems = items.filter((r) => r.decision === "include");
  const excludedItems = items.filter((r) => r.decision === "exclude");
  const undecidedItems = items.filter((r) => r.decision === "undecided");
  const excludedHighRiskItems = excludedItems.filter((r) => r.isHighRisk);

  // --- 7. テストサイズ分布と推定実行時間(選択された case が対象) ---
  const selectedCases = (testCases ?? []).filter(
    (tc) => effectiveSelection("case", tc.caseId)?.decision === "include"
  );
  const classificationRows = classifyTestSizes(selectedCases as unknown as TestCaseSpec[], testSizeClassificationCriteria);
  const sizeDistribution = buildTestSizeDistribution(classificationRows, testSizeClassificationCriteria);
  const unclassifiableSelectedCaseCount = classificationRows.filter((r) => !r.classifiable).length;

  const largeRow = sizeDistribution.find((r) => r.sizeId === "large");
  if (largeRow && largeRow.verdict === "above") {
    findings.push({
      categoryId: "RSC-12",
      severity: "medium",
      target: suiteId,
      detail: `選択したスイートのラージ構成比(${largeRow.sharePercent.toFixed(1)}%)が推奨上限(${largeRow.recommendedSharePercent.max}%)を超えている。`,
    });
  }

  for (const tc of selectedCases) {
    if ((tc.externalDependencyIds === undefined) && tc.estimatedDurationSeconds === undefined) {
      findings.push({
        categoryId: "RSC-14",
        severity: "medium",
        target: tc.caseId,
        detail: `選択した case「${tc.caseId}」に外部依存・実行時間のいずれの申告も無く、サイズ分布・推定実行時間の分母が縮んでいる。`,
      });
    }
  }

  const casesWithDuration = selectedCases.filter((tc) => tc.estimatedDurationSeconds !== undefined);
  let durationBasis: RegressionSuiteResult["durationBasis"];
  let estimatedTotalSeconds: number | undefined;
  if (casesWithDuration.length === 0) {
    durationBasis = "unavailable";
    estimatedTotalSeconds = undefined;
  } else if (casesWithDuration.length < selectedCases.length) {
    durationBasis = "partial";
    estimatedTotalSeconds = casesWithDuration.reduce((n, tc) => n + (tc.estimatedDurationSeconds as number), 0);
  } else {
    durationBasis = "computed";
    estimatedTotalSeconds = casesWithDuration.reduce((n, tc) => n + (tc.estimatedDurationSeconds as number), 0);
  }

  let budgetVerdict: RegressionSuiteResult["budgetVerdict"];
  if (spec.executionTimeBudgetSeconds !== undefined && durationBasis !== "unavailable" && estimatedTotalSeconds !== undefined) {
    budgetVerdict = estimatedTotalSeconds <= spec.executionTimeBudgetSeconds ? "within" : "over";
    if (budgetVerdict === "over") {
      findings.push({
        categoryId: "RSC-13",
        severity: "medium",
        target: suiteId,
        detail: `推定実行時間(${estimatedTotalSeconds}秒)が予算(${spec.executionTimeBudgetSeconds}秒)を超えている。`,
      });
    }
  }

  // --- 8. 前バージョンスイートとの差分 ---
  let diff: RegressionSuiteDiffItem[] | undefined;
  if (spec.previousSuite === undefined) {
    findings.push({
      categoryId: "RSC-19",
      severity: "info",
      target: suiteId,
      detail: "previousSuite が未指定のため、前バージョンとの追加・削除・維持の差分を算出していない。",
    });
  } else {
    const previousItems = spec.previousSuite.items;
    const previousKeySet = new Set(previousItems.map((p) => itemKey(p.itemKind, p.itemId)));
    const includedKeySet = new Set(includedItems.map((r) => itemKey(r.itemKind, r.itemId)));

    const removalReasons = spec.removalReasons ?? [];
    const removalReasonByKey = new Map<string, { reason: string; approvedBy?: string }>();
    for (const rr of removalReasons) {
      const key = itemKey(rr.itemKind, rr.itemId);
      if (!removalReasonByKey.has(key)) {
        removalReasonByKey.set(key, { reason: rr.reason, approvedBy: rr.approvedBy });
      }
    }

    const diffItems: RegressionSuiteDiffItem[] = [];
    const removedKeySet = new Set<string>();

    for (const row of items) {
      const key = itemKey(row.itemKind, row.itemId);
      const inPrev = previousKeySet.has(key);
      const inCur = includedKeySet.has(key);
      if (inCur && !inPrev) {
        diffItems.push({ itemKind: row.itemKind, itemId: row.itemId, kind: "added" });
      } else if (inPrev && inCur) {
        diffItems.push({ itemKind: row.itemKind, itemId: row.itemId, kind: "kept" });
      } else if (inPrev && !inCur) {
        removedKeySet.add(key);
        const rr = removalReasonByKey.get(key);
        diffItems.push({
          itemKind: row.itemKind,
          itemId: row.itemId,
          kind: "removed",
          removalReason: rr?.reason,
          approvedBy: rr?.approvedBy,
        });
      }
    }

    // previousSuite に母集団外の項目が含まれる場合(RSC-11)。これらは必ず「削除」扱いになる。
    const seenExternal = new Set<string>();
    for (const p of previousItems) {
      if (populationHas(p.itemKind, p.itemId)) continue;
      const key = itemKey(p.itemKind, p.itemId);
      findings.push({
        categoryId: "RSC-11",
        severity: "medium",
        target: `${p.itemKind}:${p.itemId}`,
        detail: `previousSuite が母集団に存在しない項目「${p.itemId}」を参照している。`,
      });
      if (seenExternal.has(key)) continue;
      seenExternal.add(key);
      removedKeySet.add(key);
      const rr = removalReasonByKey.get(key);
      diffItems.push({
        itemKind: p.itemKind,
        itemId: p.itemId,
        kind: "removed",
        removalReason: rr?.reason,
        approvedBy: rr?.approvedBy,
      });
    }

    diff = diffItems;

    for (const d of diffItems) {
      if (d.kind !== "removed") continue;
      if (d.removalReason === undefined || d.removalReason.trim().length === 0) {
        findings.push({
          categoryId: "RSC-09",
          severity: "high",
          target: d.itemId,
          detail: `前バージョンから削除された項目「${d.itemId}」に削除理由(removalReasons)が記入されていない。`,
        });
      }
    }

    for (const rr of removalReasons) {
      const key = itemKey(rr.itemKind, rr.itemId);
      if (!removedKeySet.has(key)) {
        findings.push({
          categoryId: "RSC-10",
          severity: "high",
          target: `${rr.itemKind}:${rr.itemId}`,
          detail: `項目「${rr.itemId}」は実際には削除されていないが、removalReasons が宣言されている。`,
        });
      }
    }
  }

  // --- 9. 影響範囲被覆(TTC-COV-18) ---
  const hasUndeclaredChangeCategory = testConditions.some((c) => c.changeCategory === undefined);
  const hasRsc01 = findings.some((f) => f.categoryId === "RSC-01");
  const impactConditions = testConditions.filter(
    (c) => c.changeCategory === "new" || c.changeCategory === "modified" || c.changeCategory === "existing-impacted"
  );
  const denominator = impactConditions.length;

  let coverage: RegressionSuiteResult["coverage"];
  if (hasUndeclaredChangeCategory || hasRsc01 || denominator === 0) {
    const reason = hasUndeclaredChangeCategory
      ? "changeCategory 未宣言の条件があり母集団が確定しないため算出不能"
      : hasRsc01
        ? "母集団外を参照する選択判定(RSC-01)があり宣言と実体が食い違うため算出不能"
        : "影響範囲(new/modified/existing-impacted)の条件が0件のため算出不能";
    coverage = { basis: "unavailable", denominator, reason, claimMismatch: false };
    if (spec.claimedImpactScopeCoveragePercent !== undefined) {
      coverage.claimedPercent = spec.claimedImpactScopeCoveragePercent;
      coverage.claimMismatch = true;
      findings.push({
        categoryId: "RSC-15",
        severity: "high",
        target: suiteId,
        detail: `宣言した影響範囲被覆率(${spec.claimedImpactScopeCoveragePercent}%)は算出不能(${reason})で裏付けられない。`,
      });
    }
  } else {
    const numerator = impactConditions.filter((c) => {
      const row = items.find((r) => r.itemKind === "condition" && r.itemId === c.id);
      if (!row || row.decision !== "include") return false;
      if (testCases === undefined) return true;
      return (caseCountByConditionId.get(c.id) ?? 0) > 0;
    }).length;
    const percent = Math.round((numerator / denominator) * 1000) / 10;
    coverage = { basis: "computed", denominator, numerator, percent, claimMismatch: false };
    if (spec.claimedImpactScopeCoveragePercent !== undefined) {
      coverage.claimedPercent = spec.claimedImpactScopeCoveragePercent;
      if (spec.claimedImpactScopeCoveragePercent !== percent) {
        coverage.claimMismatch = true;
        findings.push({
          categoryId: "RSC-15",
          severity: "high",
          target: suiteId,
          detail: `宣言した影響範囲被覆率(${spec.claimedImpactScopeCoveragePercent}%)が算出値(${percent}%)と一致しない。`,
        });
      }
    }
  }

  return {
    suiteId,
    generated: true,
    items,
    includedItems,
    excludedItems,
    excludedHighRiskItems,
    undecidedItems,
    sizeDistribution,
    unclassifiableSelectedCaseCount,
    estimatedTotalSeconds,
    durationBasis,
    budgetVerdict,
    diff,
    coverage,
    findings,
  };
}

// --- Markdown 出力 ---

const REGRESSION_ITEM_KIND_LABEL: Record<RegressionItemKind, string> = {
  condition: "条件",
  case: "ケース",
};

function fmtNum(value: number | undefined): string {
  return value === undefined ? "-" : String(value);
}

export function renderRegressionSuite(spec: RegressionSelectionSpec): string {
  const suiteId = spec.suiteId ?? DEFAULT_REGRESSION_SUITE_ID;
  const result = computeRegressionSuite(spec);
  const selectionCriteria = spec.selectionCriteria ?? [];

  const lines: string[] = [];
  lines.push("# リグレッションスイート選択結果");
  lines.push("");

  const skipLine = (): void => {
    lines.push(`- 未算出(理由: ${escapeCell(result.skipReason ?? "")})`);
    lines.push("");
  };

  // 1. 対象と選択基準
  lines.push("## 1. 対象と選択基準");
  lines.push("");
  lines.push(`- スイートID: ${escapeCell(suiteId)}`);
  if (spec.title) lines.push(`- 対象: ${escapeCell(spec.title)}`);
  lines.push(
    `- 実行時間予算: ${spec.executionTimeBudgetSeconds !== undefined ? `${spec.executionTimeBudgetSeconds}秒` : "未指定"}`
  );
  lines.push(`- 高リスク閾値(highRiskMinScore): ${spec.highRiskMinScore ?? highRiskDefaultMinScore()}`);
  lines.push("");
  if (selectionCriteria.length === 0) {
    lines.push("- 宣言なし");
  } else {
    lines.push("| 基準ID | 軸 | 基準 |");
    lines.push("| --- | --- | --- |");
    for (const c of selectionCriteria) {
      lines.push(`| ${escapeCell(c.id)} | ${escapeCell(c.axis ?? "-")} | ${escapeCell(c.statement)} |`);
    }
  }
  lines.push("");

  if (!result.generated) {
    // maxItems 超過時は以降の全節を未算出として出す
    for (const heading of [
      "## 2. 母集団と判定状況",
      "## 3. スイート構成(選択項目)",
      "## 4. 非選択項目と理由",
      "## 5. テストサイズ分布と推定実行時間",
      "## 6. 前バージョンとの差分",
      "## 7. 影響範囲被覆(TTC-COV-18)",
    ]) {
      lines.push(heading);
      lines.push("");
      skipLine();
    }
  } else {
    // 2. 母集団と判定状況
    lines.push("## 2. 母集団と判定状況");
    lines.push("");
    lines.push(`- 条件数: ${spec.testConditions.length} / ケース数: ${spec.testCases?.length ?? 0}`);
    lines.push(
      `- 選択: ${result.includedItems.length} / 非選択: ${result.excludedItems.length} / 未判定: ${result.undecidedItems.length}` +
        `(分母: ${result.items.length})`
    );
    const changeCategories: { key: string; label: string }[] = [
      { key: "new", label: "new(新規)" },
      { key: "modified", label: "modified(変更)" },
      { key: "existing-impacted", label: "existing-impacted(既存・影響あり)" },
      { key: "existing-unaffected", label: "existing-unaffected(既存・影響なし)" },
      { key: "undeclared", label: "未宣言" },
    ];
    lines.push("");
    lines.push("| 変更差分区分 | 条件数 |");
    lines.push("| --- | --- |");
    for (const cc of changeCategories) {
      const count = spec.testConditions.filter((c) =>
        cc.key === "undeclared" ? c.changeCategory === undefined : c.changeCategory === cc.key
      ).length;
      lines.push(`| ${escapeCell(cc.label)} | ${count} |`);
    }
    lines.push("");

    // 3. スイート構成(選択項目)
    lines.push("## 3. スイート構成(選択項目)");
    lines.push("");
    if (result.includedItems.length === 0) {
      lines.push("- 対象なし");
      lines.push("");
    } else {
      lines.push(
        "| 項目ID | 種別 | 変更差分区分 | リスクスコア | リスク帯 | 優先度 | テストサイズ | 推定時間(秒) | 適用基準ID | 選択理由 |"
      );
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const row of result.includedItems) {
        lines.push(
          `| ${escapeCell(row.itemId)} | ${REGRESSION_ITEM_KIND_LABEL[row.itemKind]} | ${escapeCell(
            row.changeCategory ?? "-"
          )} | ${fmtNum(row.riskScore)} | ${escapeCell(row.riskBandId ?? "-")} | ${escapeCell(
            row.priority ?? "-"
          )} | ${escapeCell(row.classifiedSize ?? "-")} | ${fmtNum(row.durationSeconds)} | ${escapeCell(
            row.criterionIds.join(", ") || "-"
          )} | ${escapeCell(row.reason ?? "-")} |`
        );
      }
      lines.push("");
    }

    // 4. 非選択項目と理由
    lines.push("## 4. 非選択項目と理由");
    lines.push("");
    if (result.excludedItems.length === 0) {
      lines.push("- 対象なし");
      lines.push("");
    } else {
      lines.push(
        "| 項目ID | 種別 | 変更差分区分 | リスクスコア | リスク帯 | 優先度 | テストサイズ | 推定時間(秒) | 適用基準ID | 選択理由 |"
      );
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const row of result.excludedItems) {
        lines.push(
          `| ${escapeCell(row.itemId)} | ${REGRESSION_ITEM_KIND_LABEL[row.itemKind]} | ${escapeCell(
            row.changeCategory ?? "-"
          )} | ${fmtNum(row.riskScore)} | ${escapeCell(row.riskBandId ?? "-")} | ${escapeCell(
            row.priority ?? "-"
          )} | ${escapeCell(row.classifiedSize ?? "-")} | ${fmtNum(row.durationSeconds)} | ${escapeCell(
            row.criterionIds.join(", ") || "-"
          )} | ${escapeCell(row.reason ?? "-")} |`
        );
      }
      lines.push("");
    }
    lines.push("### 4.1 非選択となった高リスク項目");
    lines.push("");
    if (result.excludedHighRiskItems.length === 0) {
      lines.push("- 対象なし");
    } else {
      for (const row of result.excludedHighRiskItems) {
        lines.push(
          `- [high] RSC-04 ${escapeCell(row.itemId)}: 高リスク項目(${
            row.riskScore !== undefined ? `riskScore=${row.riskScore}` : "priority=高"
          })が非選択になっている。`
        );
      }
    }
    lines.push("");

    // 5. テストサイズ分布と推定実行時間
    lines.push("## 5. テストサイズ分布と推定実行時間");
    lines.push("");
    lines.push("| サイズ | 件数 | 構成比 | 推奨構成比 | 判定 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of result.sizeDistribution) {
      lines.push(
        `| ${escapeCell(row.sizeId)} | ${row.count} | ${row.sharePercent.toFixed(1)}% | ${row.recommendedSharePercent.min}-${row.recommendedSharePercent.max}% | ${escapeCell(
          row.verdict
        )} |`
      );
    }
    lines.push("");
    lines.push(`- 分類不能件数: ${result.unclassifiableSelectedCaseCount}`);
    lines.push(`- 推定実行時間の算出根拠(durationBasis): ${result.durationBasis}`);
    if (result.durationBasis === "unavailable") {
      lines.push("- 推定実行時間: 未算出(理由: 選択した case に想定実行時間の申告が1件も無い)");
    } else {
      const partialNote = result.durationBasis === "partial" ? "(申告済み分のみでの下限値)" : "";
      lines.push(`- 推定実行時間: ${result.estimatedTotalSeconds}秒${partialNote}`);
      if (spec.executionTimeBudgetSeconds !== undefined) {
        lines.push(
          `- 予算(${spec.executionTimeBudgetSeconds}秒)との比較: ${result.budgetVerdict === "over" ? "予算超過" : "予算内"}`
        );
      } else {
        lines.push("- 予算(executionTimeBudgetSeconds)は未指定のため比較していない。");
      }
    }
    lines.push("");

    // 6. 前バージョンとの差分
    lines.push("## 6. 前バージョンとの差分");
    lines.push("");
    if (spec.previousSuite === undefined || result.diff === undefined) {
      lines.push("- 未算出(理由: previousSuite 未指定)");
      lines.push("");
    } else {
      const kindLabel: Record<string, string> = { added: "追加", removed: "削除", kept: "維持" };
      lines.push("| 区分(追加/削除/維持) | 項目ID | 種別 | 内容 |");
      lines.push("| --- | --- | --- | --- |");
      for (const d of result.diff) {
        lines.push(
          `| ${escapeCell(kindLabel[d.kind])} | ${escapeCell(d.itemId)} | ${REGRESSION_ITEM_KIND_LABEL[d.itemKind]} | ${
            d.kind === "removed" ? escapeCell(d.removalReason ?? "(未記入)") : "-"
          } |`
        );
      }
      lines.push("");
      lines.push("### 6.1 削除項目の理由");
      lines.push("");
      const removed = result.diff.filter((d) => d.kind === "removed");
      if (removed.length === 0) {
        lines.push("- 対象なし");
      } else {
        lines.push("| 項目ID | 削除理由 | 承認者 |");
        lines.push("| --- | --- | --- |");
        for (const d of removed) {
          lines.push(
            `| ${escapeCell(d.itemId)} | ${escapeCell(d.removalReason ?? "(未記入)")} | ${escapeCell(
              d.approvedBy ?? "(未記入)"
            )} |`
          );
        }
      }
      lines.push("");
    }

    // 7. 影響範囲被覆(TTC-COV-18)
    lines.push("## 7. 影響範囲被覆(TTC-COV-18)");
    lines.push("");
    if (result.coverage.basis === "unavailable") {
      lines.push(`- 未算出(理由: ${escapeCell(result.coverage.reason ?? "")})`);
    } else {
      lines.push(
        `- 分母: ${result.coverage.denominator} / 分子: ${result.coverage.numerator} / 被覆率: ${result.coverage.percent?.toFixed(1)}%`
      );
    }
    if (result.coverage.claimedPercent !== undefined) {
      lines.push(
        `- 宣言値(${result.coverage.claimedPercent}%)との照合: ${result.coverage.claimMismatch ? "不一致" : "一致"}`
      );
    }
    lines.push("");
  }

  // 8. 決定的検査
  lines.push("## 8. 決定的検査");
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("- 指摘なし");
    lines.push("");
  } else {
    const sorted = [...result.findings].sort((a, b) => a.categoryId.localeCompare(b.categoryId));
    let i = 0;
    while (i < sorted.length) {
      const catId = sorted[i].categoryId;
      let j = i;
      while (j < sorted.length && sorted[j].categoryId === catId) j++;
      const group = sorted.slice(i, j);
      const shown = group.slice(0, FINDING_RENDER_LIMIT);
      for (const f of shown) {
        lines.push(`- [${f.severity}] ${f.categoryId} ${escapeCell(f.target)}: ${escapeCell(f.detail)}`);
      }
      if (group.length > FINDING_RENDER_LIMIT) {
        lines.push(`- 他 ${group.length - FINDING_RENDER_LIMIT} 件（表示を ${FINDING_RENDER_LIMIT} 件に丸めた）`);
      }
      i = j;
    }
    lines.push("");
  }

  // 9. 判定区分と対処指針(カタログ)
  lines.push("## 9. 判定区分と対処指針(カタログ)");
  lines.push("");
  lines.push("| ID | 名称 | 重大度 | 定義 | 対処指針 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const c of regressionSelectionAnalysisCriteria.categories) {
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.nameJa)} | ${escapeCell(c.severity)} | ${escapeCell(
        c.definition
      )} | ${escapeCell(c.recommendedAction)} |`
    );
  }
  lines.push("");
  for (const note of regressionSelectionAnalysisCriteria.notes) {
    lines.push(`- ${escapeCell(note)}`);
  }
  lines.push("");

  // 10. サマリ
  lines.push("## 10. サマリ");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    const removedWithoutReasonCount =
      result.diff?.filter((d) => d.kind === "removed" && (d.removalReason === undefined || d.removalReason.trim().length === 0))
        .length ?? 0;
    const addedCount = result.diff?.filter((d) => d.kind === "added").length ?? 0;
    const removedCount = result.diff?.filter((d) => d.kind === "removed").length ?? 0;
    const keptCount = result.diff?.filter((d) => d.kind === "kept").length ?? 0;
    lines.push(
      `母集団件数 ${result.items.length} / 選択 ${result.includedItems.length} / 非選択 ${result.excludedItems.length} / ` +
        `未判定 ${result.undecidedItems.length} / 高リスク非選択 ${result.excludedHighRiskItems.length} / ` +
        `追加 ${addedCount} / 削除 ${removedCount} / 維持 ${keptCount} / 削除理由未記入 ${removedWithoutReasonCount} / ` +
        `推定実行時間 ${result.estimatedTotalSeconds !== undefined ? `${result.estimatedTotalSeconds}秒` : "未算出"} / ` +
        `指摘件数 ${result.findings.length}`
    );
  }
  lines.push("");

  // 11. 再検討指示(意味的層)
  lines.push("## 11. 再検討指示(意味的層)");
  lines.push("");
  const guidanceByCategory: Record<string, string> = {
    "RSC-04": "非選択の高リスク項目を残すか落とすか、関係者を交えて再判断すること。",
    "RSC-09": "前バージョンから削除された項目について、削除理由を removalReasons に記入すること。",
    "RSC-06": "変更差分区分(changeCategory)が未宣言の条件について、区分を宣言すること。",
    "RSC-12": "ラージ偏重を解消するため、ラージテストの一部をより小さいサイズへ分解できないか検討すること。",
    "RSC-17": "選択した条件のうちケースが無いものについて、ケース化するか条件そのものを除外するか判断すること。",
    "RSC-18": "リスク×テストサイズ等、追加・削減の基準を selectionCriteria として明文化すること。",
  };
  const presentCategoryIds = [...new Set(result.findings.map((f) => f.categoryId))].sort();
  const guidanceLines = presentCategoryIds
    .filter((id) => guidanceByCategory[id] !== undefined)
    .map((id) => `- ${id}: ${guidanceByCategory[id]}`);
  if (guidanceLines.length === 0) {
    lines.push(
      "- 追加の対応指示なし。閾値・パラメータ変更が発生した場合は reexpand_threshold_changes で再展開してから本ツールを再実行すること。"
    );
  } else {
    for (const line of guidanceLines) lines.push(line);
  }

  return lines.join("\n").trimEnd() + "\n";
}

// --- MCP 登録 ---

const regressionItemKindEnum = z.enum(["condition", "case"]);

export const selectRegressionSuiteInputShape = {
  suiteId: z.string().optional().describe("Suite id used in headings and summary (default REG)"),
  title: z.string().optional(),
  testConditions: z
    .array(
      z.object({
        id: z.string(),
        statement: z.string().optional(),
        target: z.string().optional(),
        perspectiveCategoryId: z.string().optional(),
        priority: z.enum(["高", "中", "低"]).optional(),
        impact: z.number().int().min(1).max(5).optional(),
        likelihood: z.number().int().min(1).max(5).optional(),
        changeCategory: z.enum(["new", "modified", "existing-impacted", "existing-unaffected"]).optional(),
        containerId: z.string().optional(),
      })
    )
    .min(1)
    .describe("Population of test conditions the regression suite is selected from"),
  testCases: z
    .array(
      z.object({
        caseId: z.string(),
        title: z.string().optional(),
        testConditionId: z.string().optional(),
        testLevel: z
          .enum(["component-testing", "integration-testing", "system-testing", "acceptance-testing"])
          .optional(),
        externalDependencyIds: z.array(z.string()).optional(),
        estimatedDurationSeconds: z.number().nonnegative().optional(),
        declaredTestSize: z.enum(["small", "medium", "large"]).optional(),
      })
    )
    .optional()
    .describe("Population of test cases the regression suite is selected from"),
  selectionCriteria: z
    .array(
      z.object({
        id: z.string(),
        statement: z.string(),
        axis: z.enum(["risk", "test-size", "change-diff", "other"]).optional(),
      })
    )
    .optional()
    .describe("Declared axes/criteria used to decide what to add or drop"),
  selections: z
    .array(
      z.object({
        itemKind: regressionItemKindEnum,
        itemId: z.string(),
        decision: z.enum(["include", "exclude"]),
        reason: z.string().optional(),
        criterionIds: z.array(z.string()).optional(),
        note: z.string().optional(),
      })
    )
    .optional()
    .describe("Selection decisions over the population; unlisted population items become undecided (RSC-05)"),
  previousSuite: z
    .object({
      suiteId: z.string().optional(),
      items: z.array(z.object({ itemKind: regressionItemKindEnum, itemId: z.string() })),
    })
    .optional()
    .describe("Previous version suite composition, used to compute added/removed/kept diff"),
  removalReasons: z
    .array(
      z.object({
        itemKind: regressionItemKindEnum,
        itemId: z.string(),
        reason: z.string(),
        approvedBy: z.string().optional(),
      })
    )
    .optional(),
  executionTimeBudgetSeconds: z.number().positive().optional(),
  claimedImpactScopeCoveragePercent: z.number().min(0).max(100).optional(),
  highRiskMinScore: z.number().int().positive().optional().describe("Default: riskAnalysisFrame R1.minScore"),
  maxItems: z.number().int().positive().optional().describe(`Population size cap (default ${DEFAULT_MAX_REGRESSION_ITEMS})`),
} as const;

const selectRegressionSuiteInputSchema = z.object(selectRegressionSuiteInputShape);
export type SelectRegressionSuiteInput = z.infer<typeof selectRegressionSuiteInputSchema>;

export function registerSelectRegressionSuiteTool(server: McpServer): void {
  server.registerTool(
    "select_regression_suite",
    {
      title: "Select Regression Suite",
      description:
        "テスト条件・テストケースの母集団と、それに対する選択(include/exclude)判定・前バージョンスイート・削除理由から、" +
        "リグレッションスイートとして何を残し何を落としたかを決定的に検査してMarkdownで返す。" +
        "選択・非選択の理由、非選択となった高リスク項目の全件列挙、選択されたケースのテストサイズ分布と推定実行時間、" +
        "前バージョンとの追加/削除/維持の差分と削除理由の突き合わせ、変更差分区分(RA-CHANGE)への未紐づけ検出、" +
        "影響範囲被覆率(TTC-COV-18)の宣言と算出値の照合を行う。閾値・パラメータ変更に伴う設計自体の再展開は" +
        "reexpand_threshold_changes の担当であり、本ツールは対象外。判定区分と対処指針は " +
        "testdesign://regression-selection/analysis-criteria を参照する。",
      inputSchema: selectRegressionSuiteInputShape,
    },
    async (input) => {
      const text = renderRegressionSuite(input as unknown as RegressionSelectionSpec);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
