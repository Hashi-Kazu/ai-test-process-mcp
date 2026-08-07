import { normalizeForGrounding } from "./groundingNormalization.js";
import { testPerspectiveCatalog } from "./resources/testPerspectiveCatalog.js";
import type {
  AuditTestDesignNotationsInput,
  FvTableAnalysis,
  NgtAnalysis,
  NgtNodeDepth,
  TestDesignNotationAnalysisResult,
  TestDesignNotationClaimCheck,
  TestDesignNotationFinding,
  YumotsuyoAnalysis,
} from "./types.js";

// audit_test_design_notations 固有の決定的検査ロジック。
// すべて純関数で、入力を破壊せず、出力順は入力順で決定的。乱数・現在時刻・環境依存の値は使わない。
// 判定区分IDは TDN-01..TDN-25。

export const DEFAULT_FV_ID_PREFIX = "FV-";
export const DEFAULT_NGT_ID_PREFIX = "NG-";
export const DEFAULT_MAX_CELL_COUNT = 20000;
/** 検証内容が実質未記入とみなされる正規化後の文字数下限（TDN-03）。 */
export const MIN_VERIFICATION_LENGTH = 8;
/** 葉の深さの最大差がこの値以上なら偏りとみなす（TDN-13）。 */
export const LEAF_DEPTH_SPREAD_LIMIT = 2;

/** 検証内容として中身が無い定型語の辞書（正規化後の完全一致で判定する）。 */
export const BOILERPLATE_VERIFICATION_PHRASES: readonly string[] = [
  "正常に動作すること",
  "正常に動作する",
  "正しく動作すること",
  "正しく動作する",
  "問題なく動作すること",
  "問題ないこと",
  "問題がないこと",
  "正しく表示されること",
  "正しく表示される",
  "期待通りに動作すること",
  "期待どおりに動作すること",
  "正常であること",
  "正しいこと",
  "エラーにならないこと",
  "エラーが出ないこと",
  "動作確認",
  "確認する",
];

const BOILERPLATE_NORMALIZED = new Set(
  BOILERPLATE_VERIFICATION_PHRASES.map((p) => normalizeForGrounding(p))
);

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function duplicatedIds(ids: readonly string[]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const id of ids) {
    if (!counts.has(id)) order.push(id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return order
    .filter((id) => (counts.get(id) as number) > 1)
    .map((id) => ({ id, count: counts.get(id) as number }));
}

function parseNumberPart(id: string, prefix: string): { raw: string; value: number } | undefined {
  if (!id.startsWith(prefix)) return undefined;
  const rest = id.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return undefined;
  return { raw: rest, value: Number(rest) };
}

/** 接頭辞＋連番の欠番を、最頻の桁幅で復元して返す。 */
export function findMissingSequenceIds(ids: readonly string[], prefix: string): string[] {
  const parsed = ids
    .map((id) => parseNumberPart(id, prefix))
    .filter((p): p is { raw: string; value: number } => p !== undefined);
  if (parsed.length === 0) return [];

  const widthCounts = new Map<number, number>();
  for (const p of parsed) widthCounts.set(p.raw.length, (widthCounts.get(p.raw.length) ?? 0) + 1);
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
  const out: string[] = [];
  for (let n = min; n <= max; n++) {
    if (!present.has(n)) out.push(`${prefix}${String(n).padStart(width, "0")}`);
  }
  return out;
}

/** テスト観点カタログの既知ID（カテゴリID TPC-xx と観点ID TPC-xx-xx の両方）。 */
export function knownPerspectiveIds(): Set<string> {
  const out = new Set<string>();
  for (const category of testPerspectiveCatalog.categories) {
    out.add(category.id);
    for (const perspective of category.perspectives) out.add(perspective.id);
  }
  return out;
}

/** 観点ID・カテゴリIDから所属カテゴリIDを引く索引。 */
export function perspectiveCategoryIndex(): Map<string, string> {
  const out = new Map<string, string>();
  for (const category of testPerspectiveCatalog.categories) {
    out.set(category.id, category.id);
    for (const perspective of category.perspectives) out.set(perspective.id, category.id);
  }
  return out;
}

function unavailableClaim(
  claimed: number | undefined,
  denominatorNote: string
): TestDesignNotationClaimCheck {
  return { basis: "unavailable", claimed, denominatorNote };
}

interface NgtStructure {
  nodeIds: string[];
  childrenByParent: Map<string, string[]>;
  labelById: Map<string, string>;
  rootIds: string[];
  leafIds: string[];
  depths: NgtNodeDepth[];
  renderOrder: NgtNodeDepth[];
  unreachableIds: string[];
  cycles: string[][];
}

/** 親子関係からNGTの構造（ルート・葉・深さ・循環）を決定的に導く。 */
export function buildNgtStructure(
  nodes: readonly { id: string; label: string; parentId?: string }[]
): NgtStructure {
  const nodeIds = unique(nodes.map((n) => n.id));
  const idSet = new Set(nodeIds);
  const labelById = new Map<string, string>();
  const parentById = new Map<string, string>();
  for (const node of nodes) {
    if (!labelById.has(node.id)) labelById.set(node.id, node.label);
    if (!parentById.has(node.id) && !isBlank(node.parentId) && node.parentId !== node.id) {
      parentById.set(node.id, node.parentId as string);
    }
  }

  const childrenByParent = new Map<string, string[]>();
  for (const id of nodeIds) {
    const parent = parentById.get(id);
    if (parent === undefined || !idSet.has(parent)) continue;
    const list = childrenByParent.get(parent) ?? [];
    list.push(id);
    childrenByParent.set(parent, list);
  }

  // parentId 未宣言のノードをルートとする（未解決の親を持つノードは TDN-08 側で報告する）。
  const rootIds = nodeIds.filter((id) => parentById.get(id) === undefined);
  const leafIds = nodeIds.filter((id) => (childrenByParent.get(id) ?? []).length === 0);

  // 循環検出（親ポインタをたどる）
  const cycleKeys = new Set<string>();
  const cycles: string[][] = [];
  for (const start of nodeIds) {
    const path: string[] = [];
    const seen = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined && idSet.has(current)) {
      if (seen.has(current)) {
        const cycle = path.slice(path.indexOf(current));
        const key = [...cycle].sort().join(",");
        if (!cycleKeys.has(key)) {
          cycleKeys.add(key);
          cycles.push(cycle);
        }
        break;
      }
      seen.add(current);
      path.push(current);
      current = parentById.get(current);
    }
  }

  // ルートからの深さ優先走査（到達できたノードのみ深さを持つ）
  const depths: NgtNodeDepth[] = [];
  const renderOrder: NgtNodeDepth[] = [];
  const visited = new Set<string>();
  const walk = (id: string, depth: number): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const entry: NgtNodeDepth = { id, label: labelById.get(id) ?? id, depth };
    depths.push(entry);
    renderOrder.push(entry);
    for (const child of childrenByParent.get(id) ?? []) walk(child, depth + 1);
  };
  for (const root of rootIds) walk(root, 0);

  const unreachableIds = nodeIds.filter((id) => !visited.has(id));

  return {
    nodeIds,
    childrenByParent,
    labelById,
    rootIds,
    leafIds,
    depths,
    renderOrder,
    unreachableIds,
    cycles,
  };
}

export function analyzeTestDesignNotations(
  input: AuditTestDesignNotationsInput
): TestDesignNotationAnalysisResult {
  const findings: TestDesignNotationFinding[] = [];
  const push = (
    categoryId: string,
    severity: "high" | "medium" | "info",
    target: string,
    detail: string
  ): void => {
    findings.push({ categoryId, severity, target, detail });
  };

  const fvRows = input.fvTable?.rows ?? [];
  const ngtNodes = input.ngt?.nodes ?? [];
  const matrixRows = input.yumotsuyoMatrix?.rows ?? [];
  const matrixColumns = input.yumotsuyoMatrix?.columns ?? [];
  const matrixCells = input.yumotsuyoMatrix?.cells ?? [];
  const matrixExclusions = input.yumotsuyoMatrix?.exclusions ?? [];

  const fvSupplied = input.fvTable !== undefined && fvRows.length > 0;
  const ngtSupplied = input.ngt !== undefined && ngtNodes.length > 0;
  const matrixSupplied =
    input.yumotsuyoMatrix !== undefined && (matrixRows.length > 0 || matrixColumns.length > 0);

  const population = unique(input.testConditionIds ?? []);
  const populationDeclared = population.length > 0;
  const populationSet = new Set(population);

  const normalizedDocuments = (input.documents ?? []).map((doc) => normalizeForGrounding(doc.content));
  const documentsSupplied = normalizedDocuments.length > 0;
  const groundedInDocuments = (text: string): boolean => {
    const normalized = normalizeForGrounding(text);
    if (normalized === "") return false;
    return normalizedDocuments.some((content) => content.includes(normalized));
  };

  const structure = buildNgtStructure(ngtNodes);
  const ngtIdSet = new Set(structure.nodeIds);
  const ngtLeafSet = new Set(structure.leafIds);

  // ============ FV表 ============
  const fvPrefix = input.fvTable?.idPrefix ?? DEFAULT_FV_ID_PREFIX;
  const expectedFunctionIds = unique(input.fvTable?.expectedFunctionIds ?? []);
  const expectedFunctionDeclared = expectedFunctionIds.length > 0;
  let fvCoverage: TestDesignNotationClaimCheck = unavailableClaim(
    input.fvTable?.claimedFunctionCoveragePercent,
    "機能ID母集団（expectedFunctionIds）の件数"
  );

  if (fvSupplied) {
    // TDN-01
    for (const dup of duplicatedIds(fvRows.map((r) => r.id))) {
      push("TDN-01", "high", dup.id, `FV表の行IDが${dup.count}件重複している。`);
    }
    for (const row of fvRows) {
      if (parseNumberPart(row.id, fvPrefix) === undefined) {
        push(
          "TDN-01",
          "high",
          row.id,
          `FV表の行IDが接頭辞「${fvPrefix}」+ 連番の形式になっていない。`
        );
      }
    }
    for (const missing of findMissingSequenceIds(fvRows.map((r) => r.id), fvPrefix)) {
      push("TDN-01", "high", missing, "FV表の行IDの連番に欠番がある。");
    }

    for (const row of fvRows) {
      // TDN-02
      if (isBlank(row.functionName)) {
        push("TDN-02", "high", row.id, "FV表の行の機能名（functionName）が未記入である。");
      }
      if (isBlank(row.verification)) {
        push("TDN-02", "high", row.id, "FV表の行の検証内容（verification）が未記入である。");
        continue;
      }
      // TDN-03
      const normalizedVerification = normalizeForGrounding(row.verification);
      if (BOILERPLATE_NORMALIZED.has(normalizedVerification)) {
        push(
          "TDN-03",
          "medium",
          row.id,
          `検証内容が定型語「${row.verification.trim()}」のみで、何を確かめるのかを特定できない。`
        );
      } else if (normalizedVerification.length < MIN_VERIFICATION_LENGTH) {
        push(
          "TDN-03",
          "medium",
          row.id,
          `検証内容が正規化後${normalizedVerification.length}文字で、下限${MIN_VERIFICATION_LENGTH}文字を下回る（実質未記入）。`
        );
      }
    }

    // TDN-05（母集団外の機能ID参照）
    if (expectedFunctionDeclared) {
      const expectedSet = new Set(expectedFunctionIds);
      for (const row of fvRows) {
        if (isBlank(row.functionId)) continue;
        if (expectedSet.has(row.functionId as string)) continue;
        push(
          "TDN-05",
          "high",
          row.id,
          `機能ID ${row.functionId} が expectedFunctionIds の母集団に存在しない。`
        );
      }
    }

    // TDN-06（本文裏付け）
    if (documentsSupplied) {
      for (const row of fvRows) {
        const text = !isBlank(row.evidence) ? (row.evidence as string) : row.verification;
        if (isBlank(text)) continue;
        if (groundedInDocuments(text)) continue;
        push(
          "TDN-06",
          "medium",
          row.id,
          `${isBlank(row.evidence) ? "検証内容" : "根拠(evidence)"}「${text.trim()}」がテストベース本文のどこにも出現しない。`
        );
      }
    }
  }

  // TDN-04 / TDN-07（機能被覆率。分母は expectedFunctionIds）
  if (expectedFunctionDeclared) {
    const coveredFunctionIds = new Set<string>();
    for (const row of fvRows) {
      if (isBlank(row.functionId) || isBlank(row.verification)) continue;
      coveredFunctionIds.add(row.functionId as string);
    }
    for (const functionId of expectedFunctionIds) {
      if (coveredFunctionIds.has(functionId)) continue;
      push(
        "TDN-04",
        "high",
        functionId,
        "検証内容を持つFV表の行が1件も存在しない（検証内容ゼロの機能）。"
      );
    }
    const covered = expectedFunctionIds.filter((id) => coveredFunctionIds.has(id)).length;
    const actual = round1((covered / expectedFunctionIds.length) * 100);
    fvCoverage = {
      basis: "computed",
      claimed: input.fvTable?.claimedFunctionCoveragePercent,
      actual,
      numerator: covered,
      denominator: expectedFunctionIds.length,
      denominatorNote: "分母は expectedFunctionIds の件数、分子は検証内容を1件以上持つ機能ID数",
    };
    if (
      input.fvTable?.claimedFunctionCoveragePercent !== undefined &&
      round1(input.fvTable.claimedFunctionCoveragePercent) !== actual
    ) {
      push(
        "TDN-07",
        "high",
        "fvTable.claimedFunctionCoveragePercent",
        `宣言値 ${input.fvTable.claimedFunctionCoveragePercent}% に対し実測値は ${actual}%（分子 ${covered} / 分母 ${expectedFunctionIds.length}）。`
      );
    }
  } else if (input.fvTable?.claimedFunctionCoveragePercent !== undefined) {
    push(
      "TDN-07",
      "high",
      "fvTable.claimedFunctionCoveragePercent",
      `機能ID母集団（expectedFunctionIds）が未宣言のため実測値を算出できず、宣言値 ${input.fvTable.claimedFunctionCoveragePercent}% は裏付け不能である。分母を宣言して再監査すること。`
    );
  }

  // ============ NGT ============
  const ngtPrefix = input.ngt?.idPrefix ?? DEFAULT_NGT_ID_PREFIX;
  let ngtLeafCountCheck: TestDesignNotationClaimCheck = unavailableClaim(
    input.ngt?.claimedLeafCount,
    "分母を持たない件数の照合"
  );

  if (ngtSupplied) {
    // TDN-08
    for (const dup of duplicatedIds(ngtNodes.map((n) => n.id))) {
      push("TDN-08", "high", dup.id, `NGTのノードIDが${dup.count}件重複している。`);
    }
    for (const node of ngtNodes) {
      if (parseNumberPart(node.id, ngtPrefix) === undefined) {
        push(
          "TDN-08",
          "high",
          node.id,
          `NGTのノードIDが接頭辞「${ngtPrefix}」+ 連番の形式になっていない。`
        );
      }
      if (!isBlank(node.parentId) && !ngtIdSet.has(node.parentId as string)) {
        push(
          "TDN-08",
          "high",
          node.id,
          `parentId ${node.parentId} が宣言済みのノードIDに存在しない。`
        );
      }
    }

    // TDN-09
    for (const cycle of structure.cycles) {
      push("TDN-09", "high", cycle.join(" -> "), "親子関係が循環しており階層として成立していない。");
    }

    // TDN-10
    if (structure.rootIds.length === 0) {
      push("TDN-10", "medium", "ngt.nodes", "parentId を持たないルートノードが1件も存在しない。");
    } else if (structure.rootIds.length >= 2) {
      push(
        "TDN-10",
        "medium",
        structure.rootIds.join(", "),
        `ルートノードが${structure.rootIds.length}件あり、観点の全体像が1つの図として閉じていない。`
      );
    }

    // TDN-11
    const fvReferencedNgtNodeIds = new Set(
      fvRows.map((r) => r.ngtNodeId).filter((v): v is string => !isBlank(v))
    );
    const nodeById = new Map(ngtNodes.map((n) => [n.id, n] as const));
    for (const leafId of structure.leafIds) {
      const node = nodeById.get(leafId);
      const hasConditions = (node?.testConditionIds ?? []).length > 0;
      if (hasConditions || fvReferencedNgtNodeIds.has(leafId)) continue;
      push(
        "TDN-11",
        "high",
        leafId,
        "葉ノードが testConditionIds にもFV表の行(ngtNodeId)にも紐づいておらず、テスト条件へ落ちていない。"
      );
    }

    // TDN-12
    for (const parentId of structure.nodeIds) {
      const children = structure.childrenByParent.get(parentId) ?? [];
      if (children.length === 1) {
        push(
          "TDN-12",
          "medium",
          parentId,
          `子ノードが1件（${children[0]}）しかなく、分解になっていない縮退枝である。`
        );
        continue;
      }
      if (children.length === 0) continue;
      const leafChildren = children.filter((id) => ngtLeafSet.has(id));
      const branchChildren = children.filter((id) => !ngtLeafSet.has(id));
      if (leafChildren.length > 0 && branchChildren.length > 0) {
        push(
          "TDN-12",
          "medium",
          parentId,
          `直下に葉(${leafChildren.join(", ")})と枝(${branchChildren.join(", ")})が混在しており、分解の粒度が揃っていない。`
        );
      }
    }

    // TDN-13
    const leafDepths = structure.depths.filter((d) => ngtLeafSet.has(d.id));
    if (leafDepths.length >= 2) {
      const values = leafDepths.map((d) => d.depth);
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (max - min >= LEAF_DEPTH_SPREAD_LIMIT) {
        push(
          "TDN-13",
          "medium",
          "ngt.nodes",
          `葉ノードの深さが最小${min}・最大${max}で差が${max - min}あり、枝ごとの掘り下げ方が揃っていない。`
        );
      }
    }

    // TDN-14
    const parentChildKeys = new Set<string>();
    for (const [parentId, children] of structure.childrenByParent) {
      for (const childId of children) {
        parentChildKeys.add(`${parentId}::${childId}`);
        parentChildKeys.add(`${childId}::${parentId}`);
      }
    }
    for (const relation of input.ngt?.relations ?? []) {
      const label = `${relation.fromId} -> ${relation.toId}`;
      if (relation.fromId === relation.toId) {
        push("TDN-14", "medium", label, "relations が自己参照になっている。");
        continue;
      }
      let unresolved = false;
      if (!ngtIdSet.has(relation.fromId)) {
        push("TDN-14", "medium", label, `relations の fromId ${relation.fromId} が未宣言のノードIDである。`);
        unresolved = true;
      }
      if (!ngtIdSet.has(relation.toId)) {
        push("TDN-14", "medium", label, `relations の toId ${relation.toId} が未宣言のノードIDである。`);
        unresolved = true;
      }
      if (unresolved) continue;
      if (parentChildKeys.has(`${relation.fromId}::${relation.toId}`)) {
        push("TDN-14", "medium", label, "既に親子関係にある対を relations で重複表現している。");
      }
    }

    // TDN-15
    const knownIds = knownPerspectiveIds();
    const categoryIndex = perspectiveCategoryIndex();
    const referencedCategoryIds = new Set<string>();
    for (const node of ngtNodes) {
      const ref = node.perspectiveCategoryId;
      if (isBlank(ref)) continue;
      if (!knownIds.has(ref as string)) {
        push(
          "TDN-15",
          "medium",
          node.id,
          `perspectiveCategoryId ${ref} がテスト観点カタログ（testcondition://perspectives/catalog）に存在しない。`
        );
        continue;
      }
      referencedCategoryIds.add(categoryIndex.get(ref as string) as string);
    }
    for (const category of testPerspectiveCatalog.categories) {
      if (referencedCategoryIds.has(category.id)) continue;
      push(
        "TDN-15",
        "medium",
        category.id,
        `観点カテゴリ「${category.nameJa}」がどのNGTノードからも参照されていない（未検討のカテゴリである可能性がある）。`
      );
    }

    // TDN-16
    const actualLeafCount = structure.leafIds.length;
    ngtLeafCountCheck = {
      basis: "computed",
      claimed: input.ngt?.claimedLeafCount,
      actual: actualLeafCount,
      numerator: actualLeafCount,
      denominator: structure.nodeIds.length,
      denominatorNote: "分母は宣言されたノード総数、分子は子を持たないノード数",
    };
    if (
      input.ngt?.claimedLeafCount !== undefined &&
      input.ngt.claimedLeafCount !== actualLeafCount
    ) {
      push(
        "TDN-16",
        "high",
        "ngt.claimedLeafCount",
        `宣言値 ${input.ngt.claimedLeafCount}件 に対し実測の葉ノード数は ${actualLeafCount}件（分母となるノード総数 ${structure.nodeIds.length}件）。`
      );
    }
  }

  // ============ ゆもつよマトリクス ============
  const maxCellCount = input.maxCellCount ?? DEFAULT_MAX_CELL_COUNT;
  const rowIds = matrixRows.map((r) => r.id);
  const columnIds = matrixColumns.map((c) => c.id);
  const rowIdSet = new Set(rowIds);
  const columnIdSet = new Set(columnIds);
  const totalCellCount = matrixRows.length * matrixColumns.length;
  let expanded = false;
  let excludedCellCount = 0;
  let filledCellCount = 0;
  let matrixFillRate: TestDesignNotationClaimCheck = unavailableClaim(
    input.yumotsuyoMatrix?.claimedFillRatePercent,
    "分母は 行数 × 列数 − 除外セル数"
  );

  if (matrixSupplied) {
    // TDN-17
    for (const dup of duplicatedIds(rowIds)) {
      push("TDN-17", "high", dup.id, `マトリクスの行IDが${dup.count}件重複している。`);
    }
    for (const dup of duplicatedIds(columnIds)) {
      push("TDN-17", "high", dup.id, `マトリクスの列IDが${dup.count}件重複している。`);
    }
    for (const cell of matrixCells) {
      if (!rowIdSet.has(cell.rowId)) {
        push("TDN-17", "high", `${cell.rowId} × ${cell.columnId}`, `cells が未宣言の行ID ${cell.rowId} を参照している。`);
      }
      if (!columnIdSet.has(cell.columnId)) {
        push("TDN-17", "high", `${cell.rowId} × ${cell.columnId}`, `cells が未宣言の列ID ${cell.columnId} を参照している。`);
      }
    }
    for (const exclusion of matrixExclusions) {
      if (!rowIdSet.has(exclusion.rowId)) {
        push(
          "TDN-17",
          "high",
          `${exclusion.rowId} × ${exclusion.columnId}`,
          `exclusions が未宣言の行ID ${exclusion.rowId} を参照している。`
        );
      }
      if (!columnIdSet.has(exclusion.columnId)) {
        push(
          "TDN-17",
          "high",
          `${exclusion.rowId} × ${exclusion.columnId}`,
          `exclusions が未宣言の列ID ${exclusion.columnId} を参照している。`
        );
      }
    }

    // TDN-20
    for (const exclusion of matrixExclusions) {
      if (!isBlank(exclusion.reason)) continue;
      push(
        "TDN-20",
        "medium",
        `${exclusion.rowId} × ${exclusion.columnId}`,
        "除外宣言の理由(reason)が未記入であり、実施しない根拠が記録されていない。"
      );
    }

    const excludedKeys = new Set<string>();
    for (const exclusion of matrixExclusions) {
      if (!rowIdSet.has(exclusion.rowId) || !columnIdSet.has(exclusion.columnId)) continue;
      excludedKeys.add(`${exclusion.rowId}::${exclusion.columnId}`);
    }
    const filledKeys = new Set<string>();
    for (const cell of matrixCells) {
      if (!rowIdSet.has(cell.rowId) || !columnIdSet.has(cell.columnId)) continue;
      if ((cell.testConditionIds ?? []).length === 0) continue;
      filledKeys.add(`${cell.rowId}::${cell.columnId}`);
    }
    excludedCellCount = excludedKeys.size;
    filledCellCount = filledKeys.size;

    if (totalCellCount > maxCellCount || !Number.isSafeInteger(totalCellCount)) {
      const skipReason = `セル数(${matrixRows.length} 行 × ${matrixColumns.length} 列 = ${totalCellCount})が上限 ${maxCellCount} を超えるため、直積を展開せず空セル・空行空列・充填率を算出しなかった。`;
      matrixFillRate = {
        basis: "skipped",
        claimed: input.yumotsuyoMatrix?.claimedFillRatePercent,
        denominatorNote: "分母は 行数 × 列数 − 除外セル数",
        skipReason,
      };
      push("TDN-22", "info", "yumotsuyoMatrix", skipReason);
    } else {
      expanded = true;
      // TDN-18
      for (const row of matrixRows) {
        for (const column of matrixColumns) {
          const key = `${row.id}::${column.id}`;
          if (filledKeys.has(key) || excludedKeys.has(key)) continue;
          push(
            "TDN-18",
            "high",
            `${row.id} × ${column.id}`,
            "交点にテスト条件が1件も無く、除外宣言も無い（実施しない判断なのか検討漏れなのか区別できない）。"
          );
        }
      }

      // TDN-19
      for (const row of matrixRows) {
        const hasFilled = matrixColumns.some((c) => filledKeys.has(`${row.id}::${c.id}`));
        if (hasFilled) continue;
        const allExcluded =
          matrixColumns.length > 0 &&
          matrixColumns.every((c) => excludedKeys.has(`${row.id}::${c.id}`));
        if (allExcluded) continue;
        push("TDN-19", "high", row.id, `行「${row.label}」はどの列とも交点が埋まっていない（空行）。`);
      }
      for (const column of matrixColumns) {
        const hasFilled = matrixRows.some((r) => filledKeys.has(`${r.id}::${column.id}`));
        if (hasFilled) continue;
        const allExcluded =
          matrixRows.length > 0 && matrixRows.every((r) => excludedKeys.has(`${r.id}::${column.id}`));
        if (allExcluded) continue;
        push("TDN-19", "high", column.id, `列「${column.label}」はどの行とも交点が埋まっていない（空列）。`);
      }

      // TDN-22
      const denominator = totalCellCount - excludedCellCount;
      if (denominator <= 0) {
        matrixFillRate = {
          basis: "unavailable",
          claimed: input.yumotsuyoMatrix?.claimedFillRatePercent,
          numerator: filledCellCount,
          denominator,
          denominatorNote: "分母は 行数 × 列数 − 除外セル数",
        };
        if (input.yumotsuyoMatrix?.claimedFillRatePercent !== undefined) {
          push(
            "TDN-22",
            "high",
            "yumotsuyoMatrix.claimedFillRatePercent",
            `分母(行数 × 列数 − 除外セル数)が ${denominator} のため充填率を算出できず、宣言値 ${input.yumotsuyoMatrix.claimedFillRatePercent}% は裏付け不能である。`
          );
        }
      } else {
        const actual = round1((filledCellCount / denominator) * 100);
        matrixFillRate = {
          basis: "computed",
          claimed: input.yumotsuyoMatrix?.claimedFillRatePercent,
          actual,
          numerator: filledCellCount,
          denominator,
          denominatorNote: "分母は 行数 × 列数 − 除外セル数、分子は充填セル数",
        };
        if (
          input.yumotsuyoMatrix?.claimedFillRatePercent !== undefined &&
          round1(input.yumotsuyoMatrix.claimedFillRatePercent) !== actual
        ) {
          push(
            "TDN-22",
            "high",
            "yumotsuyoMatrix.claimedFillRatePercent",
            `宣言値 ${input.yumotsuyoMatrix.claimedFillRatePercent}% に対し実測値は ${actual}%（分子 ${filledCellCount} / 分母 ${denominator} = ${matrixRows.length} 行 × ${matrixColumns.length} 列 − 除外 ${excludedCellCount}）。`
          );
        }
      }
    }

    // TDN-21
    if (populationDeclared) {
      const cellConditionIds = new Set<string>();
      for (const cell of matrixCells) {
        for (const conditionId of cell.testConditionIds ?? []) cellConditionIds.add(conditionId);
      }
      for (const cell of matrixCells) {
        for (const conditionId of unique(cell.testConditionIds ?? [])) {
          if (populationSet.has(conditionId)) continue;
          push(
            "TDN-21",
            "high",
            `${cell.rowId} × ${cell.columnId}`,
            `セルのテスト条件ID ${conditionId} が testConditionIds 母集団に存在しない。`
          );
        }
      }
      for (const conditionId of population) {
        if (cellConditionIds.has(conditionId)) continue;
        push(
          "TDN-21",
          "high",
          conditionId,
          "テスト条件ID母集団にあるが、マトリクスのどのセルにも現れない。"
        );
      }
    }
  }

  // ============ 記法間整合 ============
  // TDN-23
  if (fvSupplied && ngtSupplied) {
    const referencedLeafIds = new Set<string>();
    for (const row of fvRows) {
      if (isBlank(row.ngtNodeId)) continue;
      const ref = row.ngtNodeId as string;
      if (!ngtIdSet.has(ref)) {
        push("TDN-23", "high", row.id, `FV表の行が参照する ngtNodeId ${ref} がNGTに存在しない。`);
        continue;
      }
      referencedLeafIds.add(ref);
    }
    for (const leafId of structure.leafIds) {
      if (referencedLeafIds.has(leafId)) continue;
      push(
        "TDN-23",
        "high",
        leafId,
        "NGTの葉ノードがどのFV表の行からも参照されていない（機能と検証内容へ落ちていない観点）。"
      );
    }
  }

  // TDN-24
  if (matrixSupplied && ngtSupplied) {
    const referencedLeafIds = new Set<string>();
    const axisEntries = [
      ...matrixRows.map((r) => ({ kind: "行", item: r })),
      ...matrixColumns.map((c) => ({ kind: "列", item: c })),
    ];
    for (const entry of axisEntries) {
      if (isBlank(entry.item.ngtNodeId)) continue;
      const ref = entry.item.ngtNodeId as string;
      if (!ngtIdSet.has(ref)) {
        push(
          "TDN-24",
          "high",
          entry.item.id,
          `マトリクスの${entry.kind}が参照する ngtNodeId ${ref} がNGTに存在しない。`
        );
        continue;
      }
      referencedLeafIds.add(ref);
    }
    for (const leafId of structure.leafIds) {
      if (referencedLeafIds.has(leafId)) continue;
      push(
        "TDN-24",
        "high",
        leafId,
        "NGTの葉ノードがマトリクスのどの行・列にも現れない（どのテストタイプで確かめるのかが未決）。"
      );
    }
  }

  // TDN-25
  if (populationDeclared) {
    const referencedByNotation = new Map<string, Set<string>>();
    const addRef = (conditionId: string, notation: string): void => {
      const set = referencedByNotation.get(conditionId) ?? new Set<string>();
      set.add(notation);
      referencedByNotation.set(conditionId, set);
    };
    if (fvSupplied) {
      for (const row of fvRows) {
        for (const conditionId of row.testConditionIds ?? []) addRef(conditionId, "FV表");
      }
    }
    if (ngtSupplied) {
      for (const node of ngtNodes) {
        for (const conditionId of node.testConditionIds ?? []) addRef(conditionId, "NGT");
      }
    }
    if (matrixSupplied) {
      for (const cell of matrixCells) {
        for (const conditionId of cell.testConditionIds ?? []) addRef(conditionId, "ゆもつよマトリクス");
      }
    }
    for (const conditionId of population) {
      if (referencedByNotation.has(conditionId)) continue;
      push(
        "TDN-25",
        "medium",
        conditionId,
        "テスト条件ID母集団にあるが、FV表・NGT・ゆもつよマトリクスのどの記法からも参照されていない。"
      );
    }
    for (const [conditionId, notations] of referencedByNotation) {
      if (populationSet.has(conditionId)) continue;
      push(
        "TDN-25",
        "medium",
        conditionId,
        `${[...notations].join(" / ")} が参照しているが、testConditionIds 母集団に存在しない。`
      );
    }
  }

  const fvTable: FvTableAnalysis = {
    supplied: fvSupplied,
    rowCount: fvRows.length,
    coverage: fvCoverage,
  };
  const ngt: NgtAnalysis = {
    supplied: ngtSupplied,
    nodeCount: structure.nodeIds.length,
    rootIds: structure.rootIds,
    leafIds: structure.leafIds,
    depths: structure.depths,
    renderOrder: structure.renderOrder,
    unreachableIds: structure.unreachableIds,
    leafCount: ngtLeafCountCheck,
  };
  const yumotsuyoMatrix: YumotsuyoAnalysis = {
    supplied: matrixSupplied,
    rowCount: matrixRows.length,
    columnCount: matrixColumns.length,
    totalCellCount,
    excludedCellCount,
    filledCellCount,
    expanded,
    fillRate: matrixFillRate,
  };

  return {
    fvTable,
    ngt,
    yumotsuyoMatrix,
    findings,
    summary: {
      suppliedNotationCount: [fvSupplied, ngtSupplied, matrixSupplied].filter(Boolean).length,
      fvRowCount: fvRows.length,
      ngtNodeCount: structure.nodeIds.length,
      ngtLeafCount: structure.leafIds.length,
      matrixRowCount: matrixRows.length,
      matrixColumnCount: matrixColumns.length,
      testConditionPopulationCount: population.length,
      findingTotal: findings.length,
      highFindingTotal: findings.filter((f) => f.severity === "high").length,
      mediumFindingTotal: findings.filter((f) => f.severity === "medium").length,
    },
  };
}
