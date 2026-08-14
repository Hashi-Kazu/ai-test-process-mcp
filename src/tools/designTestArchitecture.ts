import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import { renderInspectabilitySection } from "../inspectabilityAnalysis.js";
import {
  buildTestBasisCorpus,
  renderTestBasisGroundingLines,
  sanitizeTestBasisDocuments,
  testBasisDocumentsInputShape,
  testBasisGroundingSignal,
  testBasisGroundingSummaryLine,
} from "../testBasisGrounding.js";
import { normalizeForGrounding } from "../groundingNormalization.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildConditionTraceability, findUncoveredConditionIds } from "../testCaseAnalysis.js";
import {
  buildTestLevelDistribution,
  buildTestSizeDistribution,
  classifyTestSizes,
  testLevelLabel,
} from "../testSizeAnalysis.js";
import { testPerspectiveCatalog } from "../resources/testPerspectiveCatalog.js";
import { testArchitectureDesignPrinciples } from "../resources/testArchitectureDesignPrinciples.js";
import { testCaseSpecShape } from "./generateTestCases.js";
import {
  emitHandoverPayloadInputShape,
  renderHandoverPayloadSection,
} from "../handoverPayload.js";
import {
  buildArchitectureCrossMatrixRender,
  buildExecutionOrderHandoverRender,
} from "../testArchitectureHandover.js";
import type {
  TestArchitectureConditionInput,
  TestBasisGroundingSubject,
  TestArchitectureDistributionRow,
  TestArchitectureFinding,
  TestArchitectureResult,
  TestArchitectureSpec,
  TestCaseSourceCondition,
  TestContainerPriorityClass,
  TestContainerRow,
  TestContainerSpec,
  TestLevelId,
} from "../types.js";

// design_test_architecture 固有の決定的エンジン。
// 純関数群で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。

export const DEFAULT_MAX_CONTAINERS = 200;
export const DEFAULT_MAX_DEPTH = 5;

/** 決定的検査の Markdown 出力で指摘を丸める件数。findings 配列自体は全件保持する。 */
const FINDING_RENDER_LIMIT = 50;
/** 表の表示上限。結果オブジェクト自体は全件保持する。 */
const ROW_RENDER_LIMIT = 200;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
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

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

function round1(value: number): number {
  return Math.round(value * 1000) / 10;
}

/** 優先度クラスの日本語ラベル。ラベル文字列はツール側でハードコードせず resource から引く。 */
export function priorityClassLabel(classId: TestContainerPriorityClass): string {
  const found = testArchitectureDesignPrinciples.priorityClasses.find((p) => p.classId === classId);
  return found ? found.nameJa : classId;
}

function allowedConditionPrioritiesOf(classId: TestContainerPriorityClass): string[] {
  const found = testArchitectureDesignPrinciples.priorityClasses.find((p) => p.classId === classId);
  return found ? [...found.allowedConditionPriorities] : [];
}

/**
 * TestArchitectureConditionInput を testCaseAnalysis の TestCaseSourceCondition へ寄せるローカルアダプタ。
 * トレーサビリティのロジックは testCaseAnalysis 側を再利用し、ここでは再実装しない。
 */
function toSourceConditions(conditions: TestArchitectureConditionInput[]): TestCaseSourceCondition[] {
  return conditions.map((c) => ({
    id: c.id,
    target: c.target ?? "",
    statement: c.statement ?? "",
    derivedFrom: [],
  }));
}

// --- メインエンジン ---

export function computeTestArchitecture(spec: TestArchitectureSpec): TestArchitectureResult {
  const containers = spec.containers ?? [];
  const testConditions = spec.testConditions ?? [];
  const testCases = spec.testCases;
  const maxContainers = spec.maxContainers ?? DEFAULT_MAX_CONTAINERS;
  const maxDepth = spec.maxDepth ?? DEFAULT_MAX_DEPTH;

  const findings: TestArchitectureFinding[] = [];

  // --- 1. コンテナID の重複と索引 ---
  const byId = new Map<string, TestContainerSpec>();
  for (const c of containers) {
    if (byId.has(c.id)) {
      findings.push({
        categoryId: "TAC-03",
        severity: "high",
        target: c.id,
        detail: `コンテナID「${c.id}」が重複して宣言されている。`,
      });
      continue;
    }
    byId.set(c.id, c);
  }
  const knownIds = new Set(byId.keys());

  // --- 2. 親子関係 ---
  const cyclicIds = new Set<string>();
  for (const c of containers) {
    if (c.parentId === undefined) continue;
    if (c.parentId === c.id) {
      cyclicIds.add(c.id);
      findings.push({
        categoryId: "TAC-04",
        severity: "high",
        target: c.id,
        detail: `コンテナ「${c.id}」が自分自身を親に指定している。`,
      });
      continue;
    }
    if (!knownIds.has(c.parentId)) {
      findings.push({
        categoryId: "TAC-04",
        severity: "high",
        target: c.id,
        detail: `コンテナ「${c.id}」が未知の親コンテナID「${c.parentId}」を参照している。`,
      });
      continue;
    }
    const visited = new Set<string>([c.id]);
    let cursor: string | undefined = c.parentId;
    while (cursor !== undefined) {
      if (visited.has(cursor)) {
        cyclicIds.add(c.id);
        findings.push({
          categoryId: "TAC-04",
          severity: "high",
          target: c.id,
          detail: `コンテナ「${c.id}」の親子関係が循環している（${[...visited].join(" → ")} → ${cursor}）。`,
        });
        break;
      }
      visited.add(cursor);
      cursor = byId.get(cursor)?.parentId;
    }
  }

  const pathOf = (id: string): string[] => {
    const path: string[] = [id];
    const visited = new Set<string>([id]);
    let cursor = byId.get(id)?.parentId;
    while (cursor !== undefined && knownIds.has(cursor) && !visited.has(cursor)) {
      path.unshift(cursor);
      visited.add(cursor);
      cursor = byId.get(cursor)?.parentId;
    }
    return path;
  };

  const childIds = new Set<string>();
  for (const c of containers) {
    if (c.parentId !== undefined && knownIds.has(c.parentId) && c.parentId !== c.id) {
      childIds.add(c.parentId);
    }
  }

  // --- 3. 責務・目的・テストタイプ ---
  for (const c of byId.values()) {
    if (isBlank(c.responsibility)) {
      findings.push({
        categoryId: "TAC-05",
        severity: "high",
        target: c.id,
        detail: `コンテナ「${c.nameJa}」に責務が記入されていない。何が成り立つことを保証するかを一文で記入すること。`,
      });
    }
  }

  // --- 4. テスト条件の帰属 ---
  const assignedByCondition = new Map<string, string[]>();
  for (const condition of testConditions) {
    const refs = condition.containerIds ?? [];
    for (const ref of refs) {
      if (knownIds.has(ref)) continue;
      findings.push({
        categoryId: "TAC-02",
        severity: "high",
        target: condition.id,
        detail: `テスト条件「${condition.id}」が未知のコンテナID「${ref}」へ帰属している。`,
      });
    }
    const known = dedupe(refs.filter((ref) => knownIds.has(ref)));
    assignedByCondition.set(condition.id, known);
  }

  const unassignedConditionIds: string[] = [];
  for (const condition of testConditions) {
    const known = assignedByCondition.get(condition.id) ?? [];
    if (known.length > 0) continue;
    unassignedConditionIds.push(condition.id);
    findings.push({
      categoryId: "TAC-01",
      severity: "high",
      target: condition.id,
      detail: `テスト条件「${condition.id}」がどのテストコンテナにも帰属していない。実施の担い手が決まっていない。`,
    });
  }

  const totalConditionCount = testConditions.length;
  const assignedConditionCount = totalConditionCount - unassignedConditionIds.length;
  const assignmentRatioPercent =
    totalConditionCount === 0 ? 0 : round1(assignedConditionCount / totalConditionCount);

  const multiAssignedConditions = testConditions
    .filter((c) => (assignedByCondition.get(c.id) ?? []).length >= 2)
    .map((c) => ({ conditionId: c.id, containerIds: [...(assignedByCondition.get(c.id) as string[])] }));

  const skipResult = (skipReason: string): TestArchitectureResult => ({
    generated: false,
    skipReason,
    containers: [],
    unassignedConditionIds,
    multiAssignedConditions,
    assignedConditionCount,
    totalConditionCount,
    assignmentRatioPercent,
    levelDistribution: [],
    typeDistribution: [],
    priorityClassDistribution: [],
    findings,
  });

  // --- 5. 上限超過（TAC-16） ---
  if (containers.length > maxContainers) {
    findings.push({
      categoryId: "TAC-16",
      severity: "info",
      target: "containers",
      detail: `コンテナ数 ${containers.length} 件が上限 ${maxContainers} 件を超えるため構造の算出を行わなかった。`,
    });
    return skipResult(
      `コンテナ数 ${containers.length} 件が上限 ${maxContainers} 件を超えるため構造の算出を行わなかった`
    );
  }
  const deepest = containers.reduce((n, c) => Math.max(n, pathOf(c.id).length - 1), 0);
  if (deepest > maxDepth) {
    findings.push({
      categoryId: "TAC-16",
      severity: "info",
      target: "containers",
      detail: `階層の深さ ${deepest} が上限 ${maxDepth} を超えるため構造の算出を行わなかった。`,
    });
    return skipResult(`階層の深さ ${deepest} が上限 ${maxDepth} を超えるため構造の算出を行わなかった`);
  }

  // --- 6. 致命的な指摘があれば構造を算出しない ---
  const BLOCKING_CATEGORIES = ["TAC-01", "TAC-02", "TAC-03", "TAC-04", "TAC-05"];
  const blocking = findings.filter((f) => BLOCKING_CATEGORIES.includes(f.categoryId));
  if (blocking.length > 0) {
    const categories = [...new Set(blocking.map((f) => f.categoryId))].sort().join(", ");
    return skipResult(`入力に致命的な指摘(${categories})があるため生成をスキップした`);
  }

  // --- 7. コンテナ行の構築 ---
  const directConditionIds = new Map<string, string[]>();
  for (const id of knownIds) directConditionIds.set(id, []);
  for (const condition of testConditions) {
    for (const containerId of assignedByCondition.get(condition.id) ?? []) {
      (directConditionIds.get(containerId) as string[]).push(condition.id);
    }
  }

  const descendantsOf = (id: string): string[] => {
    const out: string[] = [];
    for (const c of containers) {
      if (c.id === id) continue;
      if (pathOf(c.id).includes(id)) out.push(c.id);
    }
    return out;
  };

  const containerRows: TestContainerRow[] = containers.map((c) => {
    const path = pathOf(c.id);
    const own = directConditionIds.get(c.id) as string[];
    const subtree = new Set<string>([c.id, ...descendantsOf(c.id)]);
    const rolledUp = testConditions
      .filter((cond) => (assignedByCondition.get(cond.id) ?? []).some((cid) => subtree.has(cid)))
      .map((cond) => cond.id);
    const caseIds =
      testCases === undefined
        ? []
        : testCases.filter((tc) => own.includes(tc.testConditionId)).map((tc) => tc.caseId);
    return {
      containerId: c.id,
      depth: path.length - 1,
      path,
      isLeaf: !childIds.has(c.id),
      conditionIds: [...own],
      rolledUpConditionIds: dedupe(rolledUp),
      caseIds,
    };
  });
  const rowById = new Map(containerRows.map((r) => [r.containerId, r]));

  const conditionById = new Map(testConditions.map((c) => [c.id, c]));

  // --- 8. TAC-06 テスト目的の未記入 ---
  for (const c of containers) {
    if (!isBlank(c.objective)) continue;
    findings.push({
      categoryId: "TAC-06",
      severity: "medium",
      target: c.id,
      detail: `コンテナ「${c.nameJa}」にテスト目的が記入されていない。結果を誰がどの判断に使うのかを記入すること。`,
    });
  }

  // --- 9. TAC-07 重複帰属 ---
  for (const entry of multiAssignedConditions) {
    findings.push({
      categoryId: "TAC-07",
      severity: "medium",
      target: entry.conditionId,
      detail: `テスト条件「${entry.conditionId}」が ${entry.containerIds.join(
        ", "
      )} の ${entry.containerIds.length} コンテナへ重複して帰属している。実施責任を持つコンテナを1つに決めること。`,
    });
  }

  // --- 10. TAC-08 テスト条件が空の葉コンテナ ---
  for (const row of containerRows) {
    if (!row.isLeaf || row.conditionIds.length > 0) continue;
    const c = byId.get(row.containerId) as TestContainerSpec;
    findings.push({
      categoryId: "TAC-08",
      severity: "medium",
      target: row.containerId,
      detail: `葉コンテナ「${c.nameJa}」にテスト条件が1件も帰属しておらず、宣言だけで実体が無い。`,
    });
  }

  // --- 11. TAC-09 テストタイプの未宣言 ---
  for (const c of containers) {
    if ((c.testTypes ?? []).length > 0) continue;
    findings.push({
      categoryId: "TAC-09",
      severity: "medium",
      target: c.id,
      detail: `コンテナ「${c.nameJa}」にテストタイプが1件も宣言されていない。`,
    });
  }

  // --- 12. TAC-10 優先度クラスと帰属条件の優先度 ---
  for (const c of containers) {
    const allowed = allowedConditionPrioritiesOf(c.priorityClass);
    const row = rowById.get(c.id) as TestContainerRow;
    for (const conditionId of row.conditionIds) {
      const condition = conditionById.get(conditionId);
      if (!condition || condition.priority === undefined) continue;
      if (allowed.includes(condition.priority)) continue;
      findings.push({
        categoryId: "TAC-10",
        severity: "medium",
        target: c.id,
        detail:
          `優先度クラス「${priorityClassLabel(c.priorityClass)}」のコンテナに、優先度「${condition.priority}」の` +
          `テスト条件「${conditionId}」が帰属している（このクラスで許容する条件優先度: ${allowed.join(
            " / "
          )}）。`,
      });
    }
  }

  // --- 13. TAC-11 担当観点カテゴリの宣言と実体の双方向照合 ---
  for (const c of containers) {
    if (c.perspectiveCategoryIds === undefined) continue;
    const declared = c.perspectiveCategoryIds;
    const row = rowById.get(c.id) as TestContainerRow;
    const actual = dedupe(
      row.rolledUpConditionIds
        .map((id) => conditionById.get(id)?.perspectiveCategoryId)
        .filter((v): v is string => v !== undefined)
    );
    for (const categoryId of declared) {
      if (actual.includes(categoryId)) continue;
      findings.push({
        categoryId: "TAC-11",
        severity: "medium",
        target: c.id,
        detail: `コンテナ「${c.nameJa}」が担当を宣言した観点カテゴリ「${categoryId}」に該当するテスト条件が1件も帰属していない（宣言のみで実体が無い）。`,
      });
    }
    for (const categoryId of actual) {
      if (declared.includes(categoryId)) continue;
      const owners = row.rolledUpConditionIds.filter(
        (id) => conditionById.get(id)?.perspectiveCategoryId === categoryId
      );
      findings.push({
        categoryId: "TAC-11",
        severity: "medium",
        target: c.id,
        detail: `コンテナ「${c.nameJa}」に、担当宣言に無い観点カテゴリ「${categoryId}」のテスト条件(${owners.join(
          ", "
        )})が帰属している（実体のみで宣言が無い）。`,
      });
    }
  }

  // --- 14. TAC-12 未知の観点カテゴリIDの参照 ---
  const knownPerspectiveIds = new Set(testPerspectiveCatalog.categories.map((c) => c.id));
  for (const c of containers) {
    for (const categoryId of c.perspectiveCategoryIds ?? []) {
      if (knownPerspectiveIds.has(categoryId)) continue;
      findings.push({
        categoryId: "TAC-12",
        severity: "medium",
        target: c.id,
        detail: `コンテナ「${c.nameJa}」が観点カタログに存在しない観点カテゴリID「${categoryId}」を参照している。`,
      });
    }
  }
  for (const condition of testConditions) {
    const categoryId = condition.perspectiveCategoryId;
    if (categoryId === undefined || knownPerspectiveIds.has(categoryId)) continue;
    findings.push({
      categoryId: "TAC-12",
      severity: "medium",
      target: condition.id,
      detail: `テスト条件「${condition.id}」が観点カタログに存在しない観点カテゴリID「${categoryId}」を参照している。`,
    });
  }

  // --- 15. TAC-13 宣言テストレベルと帰属ケースの実レベル ---
  if (testCases !== undefined) {
    const caseById = new Map(testCases.map((tc) => [tc.caseId, tc]));
    for (const c of containers) {
      const row = rowById.get(c.id) as TestContainerRow;
      const mismatched = row.caseIds.filter((caseId) => {
        const tc = caseById.get(caseId);
        return tc !== undefined && tc.testLevel !== undefined && tc.testLevel !== c.testLevel;
      });
      if (mismatched.length === 0) continue;
      findings.push({
        categoryId: "TAC-13",
        severity: "medium",
        target: c.id,
        detail:
          `コンテナ「${c.nameJa}」の宣言テストレベル「${testLevelLabel(c.testLevel)}」に対し、` +
          `異なるテストレベルを宣言したテストケース(${mismatched.join(", ")})が帰属している。`,
      });
    }
  }

  // --- 16. TAC-14 テストスコープの宣言と実体 ---
  const scope = spec.scope;
  if (scope === undefined || scope.inScope.length === 0) {
    findings.push({
      categoryId: "TAC-14",
      severity: "medium",
      target: "scope",
      detail:
        "テストスコープが未宣言、または対象に含めるものが1件も宣言されていない。何を確認し何を確認しないのかが暗黙のまま残る。",
    });
  }
  for (const item of scope?.outOfScope ?? []) {
    if (!isBlank(item.reason)) continue;
    findings.push({
      categoryId: "TAC-14",
      severity: "medium",
      target: "scope",
      detail: `対象外として宣言した「${item.item}」に対象外判断の根拠が記入されていない。`,
    });
  }
  if (spec.testBasisDocuments !== undefined && spec.testBasisDocuments.length > 0) {
    const basis = buildTestBasisCorpus(sanitizeTestBasisDocuments(spec.testBasisDocuments));
    for (const item of scope?.outOfScope ?? []) {
      if (item.reasonKind !== "not-in-basis") continue;
      const needle = normalizeForGrounding(item.item);
      if (needle.length === 0 || !basis.corpus.includes(needle)) continue;
      findings.push({
        categoryId: "TAC-14",
        severity: "medium",
        target: "scope",
        detail:
          `対象外項目「${item.item}」は「本文に記述が無いこと」を根拠にしているが、` +
          `テストベース本文に実際には言及が見つかった。宣言と実体が矛盾している。`,
      });
    }
  }
  for (const entry of scope?.inScope ?? []) {
    const needle = entry.item.trim();
    if (needle.length === 0) continue;
    const hit = containers.some(
      (c) =>
        c.nameJa.includes(needle) ||
        c.responsibility.includes(needle) ||
        (c.targets ?? []).some((t) => t.trim().includes(needle))
    );
    if (hit) continue;
    findings.push({
      categoryId: "TAC-14",
      severity: "medium",
      target: "scope",
      detail: `対象に含めると宣言した「${entry.item}」を引き受けるコンテナが無い（いずれのコンテナの名称・テスト対象・責務にも現れない）。`,
    });
  }

  // --- 17. TAC-15 テストケースまで到達していないテスト条件 ---
  let uncoveredConditionIds: string[] | undefined;
  if (testCases !== undefined) {
    uncoveredConditionIds = findUncoveredConditionIds(toSourceConditions(testConditions), testCases);
    for (const row of containerRows) {
      const uncovered = row.conditionIds.filter((id) =>
        (uncoveredConditionIds as string[]).includes(id)
      );
      if (uncovered.length === 0) continue;
      const c = byId.get(row.containerId) as TestContainerSpec;
      findings.push({
        categoryId: "TAC-15",
        severity: "medium",
        target: row.containerId,
        detail: `コンテナ「${c.nameJa}」に帰属するテスト条件(${uncovered.join(
          ", "
        )})に紐づくテストケースが1件も無く、テストの意図がケースまで途切れている。`,
      });
    }
  }

  // --- 18. TAC-17 分割軸の宣言と実体 ---
  const declaredAxisIds = spec.decompositionAxisIds;
  if (declaredAxisIds !== undefined && declaredAxisIds.length > 0) {
    const knownAxisIds = new Set(testArchitectureDesignPrinciples.decompositionAxes.map((a) => a.id));
    for (const axisId of declaredAxisIds) {
      if (knownAxisIds.has(axisId)) continue;
      findings.push({
        categoryId: "TAC-17",
        severity: "medium",
        target: axisId,
        detail: `分割軸カタログに存在しない分割軸ID「${axisId}」を参照している。`,
      });
    }
    const levelKinds = dedupe(containers.map((c) => c.testLevel));
    const typeKinds = dedupe(containers.flatMap((c) => c.testTypes ?? []));
    const priorityKinds = dedupe(containers.map((c) => c.priorityClass));
    if (declaredAxisIds.includes("TAX-01") && levelKinds.length <= 1) {
      findings.push({
        categoryId: "TAC-17",
        severity: "medium",
        target: "TAX-01",
        detail: `分割軸「テストレベル別」を宣言しているが、コンテナのテストレベルが ${levelKinds.length} 種類しかなく、その軸で分かれていない。`,
      });
    }
    if (declaredAxisIds.includes("TAX-03") && typeKinds.length <= 1) {
      findings.push({
        categoryId: "TAC-17",
        severity: "medium",
        target: "TAX-03",
        detail: `分割軸「テストタイプ別」を宣言しているが、全コンテナのテストタイプの和集合が ${typeKinds.length} 件しかなく、その軸で分かれていない。`,
      });
    }
    if (declaredAxisIds.includes("TAX-05") && priorityKinds.length <= 1) {
      findings.push({
        categoryId: "TAC-17",
        severity: "medium",
        target: "TAX-05",
        detail: `分割軸「リスク強度別」を宣言しているが、コンテナの優先度クラスが ${priorityKinds.length} 種類しかなく、その軸で分かれていない。`,
      });
    }
  }

  // --- 19. 分布（分母は帰属済み条件数） ---
  const distributionRow = (
    key: string,
    label: string,
    members: TestContainerSpec[]
  ): TestArchitectureDistributionRow => {
    const containerIds = members.map((m) => m.id);
    const conditionIds = dedupe(containerIds.flatMap((id) => directConditionIds.get(id) ?? []));
    return {
      key,
      label,
      containerIds,
      containerCount: containerIds.length,
      conditionCount: conditionIds.length,
      conditionSharePercent:
        assignedConditionCount === 0 ? 0 : round1(conditionIds.length / assignedConditionCount),
    };
  };

  const levelDistribution = dedupe(containers.map((c) => c.testLevel)).map((level) =>
    distributionRow(
      level,
      testLevelLabel(level as TestLevelId),
      containers.filter((c) => c.testLevel === level)
    )
  );
  const typeDistribution = dedupe(containers.flatMap((c) => c.testTypes ?? [])).map((type) =>
    distributionRow(type, type, containers.filter((c) => (c.testTypes ?? []).includes(type)))
  );
  const priorityClassDistribution = testArchitectureDesignPrinciples.priorityClasses.map((p) =>
    distributionRow(
      p.classId,
      p.nameJa,
      containers.filter((c) => c.priorityClass === p.classId)
    )
  );

  // --- 20. コンテナ別テストサイズ・テストレベル分布（testCases 指定時のみ） ---
  let containerSizeRows: TestArchitectureResult["containerSizeRows"];
  if (testCases !== undefined) {
    containerSizeRows = containerRows.map((row) => {
      const cases = testCases.filter((tc) => row.conditionIds.includes(tc.testConditionId));
      return {
        containerId: row.containerId,
        caseCount: cases.length,
        sizeDistribution: buildTestSizeDistribution(classifyTestSizes(cases)),
        levelDistribution: buildTestLevelDistribution(cases),
      };
    });
  }

  return {
    generated: true,
    containers: containerRows,
    unassignedConditionIds,
    multiAssignedConditions,
    assignedConditionCount,
    totalConditionCount,
    assignmentRatioPercent,
    levelDistribution,
    typeDistribution,
    priorityClassDistribution,
    containerSizeRows,
    uncoveredConditionIds,
    findings,
  };
}

// --- Markdown レンダリング ---

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, info: 2 };

function mermaidNodeId(containerId: string): string {
  return `N_${containerId.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function mermaidLabel(value: string): string {
  return value.replace(/"/g, "'").replace(/[[\]]/g, " ");
}

/**
 * テストベース実在照合の対象を組み立てる。
 * コンテナID・テスト条件ID・観点カテゴリID(TPC-xx)・分割軸ID(TAX-xx)、
 * および testTypes（「機能テスト」等の一般語）は対象にしない。
 */
export function collectTestArchitectureGroundingSubjects(
  spec: TestArchitectureSpec
): TestBasisGroundingSubject[] {
  const subjects: TestBasisGroundingSubject[] = [];
  (spec.scope?.inScope ?? []).forEach((item, i) => {
    subjects.push({
      kind: "label",
      place: `scope.inScope[${i}].item`,
      target: "scope.inScope",
      fieldLabel: "スコープ項目",
      text: item.item,
    });
    if (item.reason !== undefined) {
      subjects.push({
        kind: "quotation",
        place: `scope.inScope[${i}].reason`,
        target: "scope.inScope",
        fieldLabel: "スコープ理由",
        text: item.reason,
      });
    }
  });
  (spec.scope?.outOfScope ?? []).forEach((item, i) => {
    if (item.reasonKind !== "not-in-basis") {
      subjects.push({
        kind: "label",
        place: `scope.outOfScope[${i}].item`,
        target: "scope.outOfScope",
        fieldLabel: "スコープ項目",
        text: item.item,
      });
    }
    if (item.reason !== undefined) {
      subjects.push({
        kind: "quotation",
        place: `scope.outOfScope[${i}].reason`,
        target: "scope.outOfScope",
        fieldLabel: "スコープ理由",
        text: item.reason,
      });
    }
  });
  (spec.containers ?? []).forEach((c, i) => {
    subjects.push({
      kind: "label",
      place: `containers[${i}].nameJa`,
      target: c.id,
      fieldLabel: "コンテナ名",
      text: c.nameJa,
    });
    (c.targets ?? []).forEach((t, j) => {
      subjects.push({
        kind: "label",
        place: `containers[${i}].targets[${j}]`,
        target: c.id,
        fieldLabel: "コンテナ対象",
        text: t,
      });
    });
    if (c.environment !== undefined) {
      subjects.push({
        kind: "label",
        place: `containers[${i}].environment`,
        target: c.id,
        fieldLabel: "テスト環境",
        text: c.environment,
      });
    }
    subjects.push({
      kind: "quotation",
      place: `containers[${i}].responsibility`,
      target: c.id,
      fieldLabel: "コンテナ責務",
      text: c.responsibility,
    });
    if (c.objective !== undefined) {
      subjects.push({
        kind: "quotation",
        place: `containers[${i}].objective`,
        target: c.id,
        fieldLabel: "コンテナ目的",
        text: c.objective,
      });
    }
    if (c.note !== undefined) {
      subjects.push({
        kind: "quotation",
        place: `containers[${i}].note`,
        target: c.id,
        fieldLabel: "コンテナ注記",
        text: c.note,
      });
    }
    (c.entryCriteria ?? []).forEach((text, j) => {
      subjects.push({
        kind: "quotation",
        place: `containers[${i}].entryCriteria[${j}]`,
        target: c.id,
        fieldLabel: "開始基準",
        text,
      });
    });
    (c.exitCriteria ?? []).forEach((text, j) => {
      subjects.push({
        kind: "quotation",
        place: `containers[${i}].exitCriteria[${j}]`,
        target: c.id,
        fieldLabel: "終了基準",
        text,
      });
    });
  });
  (spec.testConditions ?? []).forEach((tc, i) => {
    if (tc.target !== undefined) {
      subjects.push({
        kind: "label",
        place: `testConditions[${i}].target`,
        target: tc.id,
        fieldLabel: "テスト対象",
        text: tc.target,
      });
    }
    if (tc.statement !== undefined) {
      subjects.push({
        kind: "quotation",
        place: `testConditions[${i}].statement`,
        target: tc.id,
        fieldLabel: "テスト条件文",
        text: tc.statement,
      });
    }
  });
  return subjects;
}

export function renderTestArchitecture(spec: TestArchitectureSpec): string {
  const basisDocuments =
    spec.testBasisDocuments === undefined
      ? undefined
      : sanitizeTestBasisDocuments(spec.testBasisDocuments);
  const groundingSubjects = collectTestArchitectureGroundingSubjects(spec);
  const result = computeTestArchitecture(spec);
  const containers = spec.containers ?? [];
  const testConditions = spec.testConditions ?? [];
  const testCases = spec.testCases;
  const byId = new Map<string, TestContainerSpec>();
  for (const c of containers) {
    if (!byId.has(c.id)) byId.set(c.id, c);
  }

  const lines: string[] = [];
  lines.push("# テストアーキテクチャ（テストコンテナ）設計結果");
  lines.push("");
  if (spec.title) {
    lines.push(`- 対象: ${spec.title}`);
    lines.push("");
  }

  const skipLine = (): void => {
    lines.push(`- 未算出(理由: ${escapeCell(result.skipReason ?? "")})`);
    lines.push("");
  };

  // --- 1. テストスコープ ---
  lines.push("## 1. テストスコープ");
  lines.push("");
  if (spec.scope === undefined) {
    lines.push("- 宣言なし（何を確認し何を確認しないのかが宣言されていない）");
    lines.push("");
  } else {
    lines.push("| 区分 | 項目 | 理由 |");
    lines.push("| --- | --- | --- |");
    if (spec.scope.inScope.length === 0) {
      lines.push("| 対象 | 宣言なし | - |");
    }
    for (const item of spec.scope.inScope) {
      lines.push(`| 対象 | ${escapeCell(item.item)} | ${escapeCell(item.reason ?? "-")} |`);
    }
    if (spec.scope.outOfScope.length === 0) {
      lines.push("| 対象外 | 宣言なし | - |");
    }
    for (const item of spec.scope.outOfScope) {
      lines.push(`| 対象外 | ${escapeCell(item.item)} | ${escapeCell(item.reason ?? "未記入")} |`);
    }
    lines.push("");
  }

  // --- 2. テストコンテナ一覧 ---
  lines.push("## 2. テストコンテナ一覧");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    lines.push(
      "| コンテナID | 階層 | 名称 | 責務 | テスト目的 | テストレベル | テストタイプ | 優先度クラス | 担当観点カテゴリ | 実行環境 | 帰属条件数 |"
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of result.containers.slice(0, ROW_RENDER_LIMIT)) {
      const c = byId.get(row.containerId) as TestContainerSpec;
      lines.push(
        `| ${escapeCell(row.containerId)} | ${row.depth} | ${escapeCell(c.nameJa)} | ${escapeCell(
          c.responsibility
        )} | ${escapeCell(c.objective ?? "-")} | ${escapeCell(testLevelLabel(c.testLevel))} | ${escapeCell(
          (c.testTypes ?? []).length === 0 ? "-" : (c.testTypes ?? []).join(", ")
        )} | ${escapeCell(priorityClassLabel(c.priorityClass))} | ${escapeCell(
          (c.perspectiveCategoryIds ?? []).length === 0 ? "-" : (c.perspectiveCategoryIds ?? []).join(", ")
        )} | ${escapeCell(c.environment ?? "-")} | ${row.conditionIds.length} |`
      );
    }
    lines.push("");
    if (result.containers.length > ROW_RENDER_LIMIT) {
      lines.push(`- 他 ${result.containers.length - ROW_RENDER_LIMIT} 件（表示を ${ROW_RENDER_LIMIT} 件に丸めた）`);
      lines.push("");
    }
  }

  // --- 3. コンテナ階層図 ---
  lines.push("## 3. コンテナ階層図");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    lines.push("```mermaid");
    lines.push("flowchart TD");
    for (const c of containers) {
      lines.push(`  ${mermaidNodeId(c.id)}["${mermaidLabel(c.id)}<br/>${mermaidLabel(c.nameJa)}"]`);
    }
    for (const c of containers) {
      if (c.parentId === undefined) continue;
      lines.push(`  ${mermaidNodeId(c.parentId)} --> ${mermaidNodeId(c.id)}`);
    }
    lines.push("```");
    lines.push("");
  }

  // --- 4. テスト条件のコンテナ帰属 ---
  lines.push("## 4. テスト条件のコンテナ帰属");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else {
    lines.push("| 条件ID | 条件文 | 帰属コンテナID | 帰属数 |");
    lines.push("| --- | --- | --- | --- |");
    for (const condition of testConditions.slice(0, ROW_RENDER_LIMIT)) {
      const owners = result.containers
        .filter((r) => r.conditionIds.includes(condition.id))
        .map((r) => r.containerId);
      lines.push(
        `| ${escapeCell(condition.id)} | ${escapeCell(condition.statement ?? "-")} | ${escapeCell(
          owners.length === 0 ? "なし" : owners.join(", ")
        )} | ${owners.length} |`
      );
    }
    lines.push("");
    if (testConditions.length > ROW_RENDER_LIMIT) {
      lines.push(`- 他 ${testConditions.length - ROW_RENDER_LIMIT} 件（表示を ${ROW_RENDER_LIMIT} 件に丸めた）`);
      lines.push("");
    }
    lines.push(
      `- 帰属率: ${result.assignmentRatioPercent.toFixed(1)}%（分母: 入力テスト条件 ${
        result.totalConditionCount
      } 件、分子: 既知コンテナへ1件以上帰属した条件 ${result.assignedConditionCount} 件）`
    );
    lines.push(
      `- 未帰属(${result.unassignedConditionIds.length}件): ${
        result.unassignedConditionIds.length === 0 ? "なし" : result.unassignedConditionIds.join(", ")
      }`
    );
    lines.push(
      `- 重複帰属(${result.multiAssignedConditions.length}件): ${
        result.multiAssignedConditions.length === 0
          ? "なし"
          : result.multiAssignedConditions
              .map((m) => `${m.conditionId}→${m.containerIds.join("/")}`)
              .join(", ")
      }`
    );
    lines.push("");
  }

  // --- 5. 分布 ---
  lines.push("## 5. 分布");
  lines.push("");
  const distributionTable = (
    heading: string,
    keyHeader: string,
    rows: TestArchitectureDistributionRow[]
  ): void => {
    lines.push(heading);
    lines.push("");
    if (!result.generated) {
      skipLine();
      return;
    }
    lines.push(`| ${keyHeader} | コンテナ数 | コンテナID | 帰属条件数 | 構成比 |`);
    lines.push("| --- | --- | --- | --- | --- |");
    if (rows.length === 0) {
      lines.push("| - | 0 | - | 0 | 0.0% |");
    }
    for (const row of rows) {
      lines.push(
        `| ${escapeCell(row.label)} | ${row.containerCount} | ${escapeCell(
          row.containerIds.length === 0 ? "-" : row.containerIds.join(", ")
        )} | ${row.conditionCount} | ${row.conditionSharePercent.toFixed(1)}% |`
      );
    }
    lines.push("");
    lines.push(
      `- 構成比の分母は帰属済み条件数 ${result.assignedConditionCount} 件（入力テスト条件 ${result.totalConditionCount} 件のうち未帰属 ${result.unassignedConditionIds.length} 件は分母から除かず別掲している）。`
    );
    lines.push("");
  };
  distributionTable("### 5.1 コンテナ×テストレベル", "テストレベル", result.levelDistribution);
  distributionTable("### 5.2 コンテナ×テストタイプ", "テストタイプ", result.typeDistribution);
  distributionTable("### 5.3 優先度クラス", "優先度クラス", result.priorityClassDistribution);

  // --- 6. コンテナ別テストサイズ・テストレベル分布 ---
  lines.push("## 6. コンテナ別テストサイズ・テストレベル分布");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else if (result.containerSizeRows === undefined) {
    lines.push("- 未算出(理由: テストケースが渡されていない)");
    lines.push("");
  } else {
    lines.push("| コンテナID | ケース数 | small | medium | large | テストレベル分布 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const row of result.containerSizeRows.slice(0, ROW_RENDER_LIMIT)) {
      const sizeOf = (sizeId: string): string => {
        const found = row.sizeDistribution.find((s) => s.sizeId === sizeId);
        return found ? `${found.count}件 (${found.sharePercent.toFixed(1)}%)` : "-";
      };
      const levels = row.levelDistribution
        .filter((l) => l.count > 0)
        .map((l) => `${testLevelLabel(l.testLevel)} ${l.count}件`);
      lines.push(
        `| ${escapeCell(row.containerId)} | ${row.caseCount} | ${sizeOf("small")} | ${sizeOf(
          "medium"
        )} | ${sizeOf("large")} | ${escapeCell(levels.length === 0 ? "-" : levels.join(" / "))} |`
      );
    }
    lines.push("");
    lines.push(
      "- テストサイズ構成比の分母は、そのコンテナのケースのうち外部依存または想定実行時間が申告され分類が成立したケース数である。"
    );
    lines.push("");
  }

  // --- 7. 条件→ケースのトレーサビリティ ---
  lines.push("## 7. 条件→ケースのトレーサビリティ");
  lines.push("");
  if (!result.generated) {
    skipLine();
  } else if (testCases === undefined) {
    lines.push("- 未算出(理由: テストケースが渡されていない)");
    lines.push("");
  } else {
    const traceRows = buildConditionTraceability(toSourceConditions(testConditions), testCases);
    const traceById = new Map(traceRows.map((r) => [r.conditionId, r]));
    lines.push("| コンテナID | 条件ID | テストケースID | ケース数 |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of result.containers) {
      for (const conditionId of row.conditionIds) {
        const trace = traceById.get(conditionId);
        const caseIds = trace ? trace.caseIds : [];
        lines.push(
          `| ${escapeCell(row.containerId)} | ${escapeCell(conditionId)} | ${escapeCell(
            caseIds.length === 0 ? "なし（ケース未作成）" : caseIds.join(", ")
          )} | ${caseIds.length} |`
        );
      }
    }
    lines.push("");
    lines.push(
      `- ケースが1件も無い帰属条件(${(result.uncoveredConditionIds ?? []).filter((id) =>
        result.containers.some((r) => r.conditionIds.includes(id))
      ).length}件): ${
        (result.uncoveredConditionIds ?? []).filter((id) =>
          result.containers.some((r) => r.conditionIds.includes(id))
        ).join(", ") || "なし"
      }`
    );
    lines.push("");
  }

  // --- 8. 決定的検査 ---
  lines.push("## 8. 決定的検査");
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("- 指摘なし");
    lines.push("");
  } else {
    const sorted = result.findings
      .map((f, i) => ({ f, i }))
      .sort((a, b) => {
        const s = SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity];
        if (s !== 0) return s;
        const c = a.f.categoryId.localeCompare(b.f.categoryId);
        if (c !== 0) return c;
        return a.i - b.i;
      })
      .map((e) => e.f);
    for (const f of sorted.slice(0, FINDING_RENDER_LIMIT)) {
      lines.push(`- [${f.severity}] ${f.categoryId} ${escapeCell(f.target)}: ${escapeCell(f.detail)}`);
    }
    if (sorted.length > FINDING_RENDER_LIMIT) {
      lines.push(
        `- 他 ${sorted.length - FINDING_RENDER_LIMIT} 件（表示を ${FINDING_RENDER_LIMIT} 件に丸めた）`
      );
    }
    lines.push("");
  }

  // --- 9. サマリ ---
  lines.push("## 9. サマリ");
  lines.push("");
  if (!result.generated) {
    lines.push(`- 入力に致命的な指摘があるため生成をスキップした（理由: ${result.skipReason ?? ""}）。`);
    lines.push(
      `- 帰属率: ${result.assignmentRatioPercent.toFixed(1)}%（分母: 入力テスト条件 ${
        result.totalConditionCount
      } 件、分子: 既知コンテナへ1件以上帰属した条件 ${result.assignedConditionCount} 件）`
    );
    lines.push(
      `- 未帰属(${result.unassignedConditionIds.length}件): ${
        result.unassignedConditionIds.length === 0 ? "なし" : result.unassignedConditionIds.join(", ")
      }`
    );
    lines.push(`- 指摘: ${result.findings.length} 件`);
  } else {
    const leafCount = result.containers.filter((r) => r.isLeaf).length;
    lines.push(
      `- コンテナ数: ${result.containers.length} / 葉コンテナ数: ${leafCount} / テスト条件総数: ${
        result.totalConditionCount
      } / 帰属済み条件数: ${result.assignedConditionCount} / 未帰属件数: ${
        result.unassignedConditionIds.length
      } / 帰属率: ${result.assignmentRatioPercent.toFixed(1)}%（分母: 入力テスト条件 ${
        result.totalConditionCount
      } 件） / 重複帰属件数: ${result.multiAssignedConditions.length} / 指摘: ${result.findings.length} 件`
    );
  }
  lines.push(
    "- 判定区分・分割軸・責務定義項目・優先度クラスの定義は `testarch://container/design-principles` を参照すること。"
  );
  lines.push(
    "- 本検査は渡されたコンテナ・テスト条件に対してのみ成立し、そもそも洗い出されていない観点の取りこぼしは検出できない。"
  );

  lines.push(testBasisGroundingSummaryLine(groundingSubjects, basisDocuments));

  // --- 10. 下流ツール引き渡しJSON ---
  lines.push("");
  lines.push("## 10. 下流ツール引き渡しJSON");
  lines.push("");
  lines.push(
    "本節のJSONは上流の宣言をそのまま写したものではなく、本ツールが算出したコンテナ実体から組み立て、受け側ツールの算出ロジックへ通し直して突き合わせた結果である。判定区分は HPO-01〜HPO-05。"
  );
  lines.push("");
  const emitHandover = spec.emitHandoverPayload === true;
  lines.push(
    ...renderHandoverPayloadSection(
      buildExecutionOrderHandoverRender(spec, "### 10.1 analyze_execution_order 入力(JSON)"),
      emitHandover
    ).split("\n")
  );
  lines.push(
    ...renderHandoverPayloadSection(
      buildArchitectureCrossMatrixRender(spec, "### 10.2 audit_cross_matrix 入力(JSON)"),
      emitHandover
    ).split("\n")
  );

  lines.push(
    ...renderTestBasisGroundingLines(
      "## 11. テストベースとの実在照合",
      groundingSubjects,
      basisDocuments
    )
  );

  lines.push(
    ...renderInspectabilitySection("design_test_architecture", [
      testBasisGroundingSignal(basisDocuments),
    ]).split("\n")
  );
  lines.push("");

  const testArchitectureSignals: string[] = [];
  if (result.findings.some((f) => f.severity === "high")) {
    testArchitectureSignals.push("has-high-findings");
  }
  if (result.unassignedConditionIds.length > 0) {
    testArchitectureSignals.push("has-unassigned-conditions");
  }
  lines.push(
    ...renderNextToolsSection(
      "design_test_architecture",
      testArchitectureSignals,
      spec.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

// --- MCP 登録 ---

const testLevelEnum = z.enum([
  "component-testing",
  "integration-testing",
  "system-testing",
  "acceptance-testing",
]);

export const designTestArchitectureInputShape = {
  ...completedToolsInputShape,
  ...testBasisDocumentsInputShape,
  title: z.string().optional(),
  scope: z
    .object({
      inScope: z.array(z.object({ item: z.string(), reason: z.string().optional() })),
      outOfScope: z.array(
        z.object({
          item: z.string(),
          reason: z.string().optional(),
          reasonKind: z
            .enum(["not-in-basis"])
            .optional()
            .describe(
              "Set to \"not-in-basis\" when the out-of-scope reason itself is " +
                "\"this item has no description in the test basis\" (e.g. excluding screens " +
                "because the basis documents contain no UI description). " +
                "When set, TBG-01 label grounding is skipped for this item, and instead " +
                "TAC-14 verifies the reverse: that the item text truly does not appear in the basis."
            ),
        })
      ),
    })
    .optional()
    .describe("Declared test scope; out-of-scope items require a reason"),
  decompositionAxisIds: z
    .array(z.string())
    .optional()
    .describe("Declared container decomposition axis ids (TAX-xx); reconciled against the actual containers"),
  containers: z
    .array(
      z.object({
        id: z.string().describe("Container id, unique across the spec, e.g. TCN-01"),
        nameJa: z.string(),
        parentId: z.string().optional().describe("Parent container id; omit for a root container"),
        responsibility: z.string().describe("What this container guarantees (required)"),
        objective: z.string().optional(),
        testLevel: testLevelEnum,
        testTypes: z.array(z.string()).min(1),
        priorityClass: z
          .enum(["must", "conditional", "optional"])
          .describe("Execution necessity class; see testarch://container/design-principles"),
        perspectiveCategoryIds: z
          .array(z.string())
          .optional()
          .describe("Test perspective category ids (TPC-xx) this container declares responsibility for"),
        targets: z.array(z.string()).optional(),
        environment: z.string().optional(),
        entryCriteria: z.array(z.string()).optional(),
        exitCriteria: z.array(z.string()).optional(),
        note: z.string().optional(),
      })
    )
    .min(1)
    .describe("Test containers to organize the test conditions into"),
  testConditions: z
    .array(
      z.object({
        id: z.string(),
        statement: z.string().optional(),
        target: z.string().optional(),
        perspectiveCategoryId: z.string().optional(),
        priority: z.enum(["高", "中", "低"]).optional(),
        containerIds: z.array(z.string()).describe("Container ids this condition belongs to"),
      })
    )
    .min(1)
    .describe("Test conditions from extract_test_conditions, with their container assignment"),
  testCases: z
    .array(testCaseSpecShape)
    .optional()
    .describe(
      "Test cases; when given, per-container test size distribution and condition-to-case traceability are computed"
    ),
  maxContainers: z.number().int().positive().optional().describe("Container count cap (default 200)"),
  maxDepth: z.number().int().positive().optional().describe("Hierarchy depth cap (default 5)"),
  ...emitHandoverPayloadInputShape,
} as const;

const designTestArchitectureInputSchema = z.object(designTestArchitectureInputShape);
export type DesignTestArchitectureInput = z.infer<typeof designTestArchitectureInputSchema>;

export function registerDesignTestArchitectureTool(server: McpServer): void {
  server.registerTool(
    "design_test_architecture",
    {
      title: "Design Test Architecture",
      description:
        "テスト条件群をテストコンテナへ束ね、各コンテナの責務・テストレベル・テストタイプ・優先度クラス・担当観点カテゴリと、テストスコープの宣言を、" +
        "実際に帰属したテスト条件・テストケースの実体と決定的に照合してMarkdownで返す。" +
        "テストスコープ、コンテナ一覧、階層図、条件のコンテナ帰属、レベル/タイプ/優先度クラスの分布、コンテナ別テストサイズ分布、条件→ケースのトレーサビリティ、決定的検査、サマリの9節を出力する。" +
        "帰属率・構成比は必ず分母と未帰属条件IDの全列挙を併記し、テストケース未指定時はコンテナ別サイズ分布を数値で出さず未算出（理由）と明記する。" +
        "コンテナ間の実行順序・依存関係・クリティカルパスは対象外。判定区分と対処指針は testarch://container/design-principles を参照する。" +
        "下流ツールの入力形式そのままの引き渡しJSONを `emitHandoverPayload: true` で出力し、受け側の算出ロジックで往復照合した結果を併記する。",
      inputSchema: designTestArchitectureInputShape,
    },
    async (input) => {
      const text = renderTestArchitecture(input as unknown as TestArchitectureSpec);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
