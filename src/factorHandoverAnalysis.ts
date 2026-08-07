import { z } from "zod";
import { factorRalphFrame } from "./resources/factorRalphFrame.js";
import type {
  FactorHandoverEntryEvaluation,
  FactorHandoverEvaluation,
  FactorHandoverFinding,
  FactorHandoverItem,
  FactorHandoverVerdict,
  FactorInventoryEntry,
  FactorRalphFrame,
  FactorHandoverConvention,
  FactorCategoryDefinition,
} from "./types.js";

// 因子分解フレーム（testcondition://factor/ralph-frame）の引き渡し規約 FHO-01〜FHO-04 について、
// 「どの因子をどの技法へ渡したか」という宣言（factorInventory）と、
// 実際に design_* ツールへ投入された項目（実体）を決定的に照合する。
//
// 判定根拠は全て frame から引く。分類キー・分類名・引き渡し先ID・適用分類・記法要求は
// このモジュール内にハードコードしない（テストで別の frame を渡すと判定・表示が変わる）。
// 純関数のみ。乱数・現在時刻は使わない。

const UNAVAILABLE_REASON =
  "factorInventory が未宣言のため因子引き渡し検査を行わなかった";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** 各 design_* ツールのトップレベルに追加する因子表の入力スキーマ。 */
export const factorInventoryShape = z
  .array(
    z.object({
      id: z.string().describe("Factor id from the factor table, e.g. FCT-01"),
      name: z.string().describe("Factor name as written in the factor table"),
      categoryKey: z
        .string()
        .describe(
          "Factor category key (signal/noise/state/control); validated against testcondition://factor/ralph-frame"
        ),
      levels: z.array(z.string()).optional().describe("Levels declared in the factor table"),
      handoverTargetIds: z
        .array(z.string())
        .optional()
        .describe("Handover targets (FHO-01..FHO-04 or the target tool name)"),
      droppedReason: z
        .string()
        .optional()
        .describe("Why this factor is not handed over to any technique"),
      fixedCondition: z
        .boolean()
        .optional()
        .describe("Whether this factor was separated as a fixed condition"),
    })
  )
  .optional()
  .describe(
    "Factor table declared in the factor decomposition frame; enables the factor handover check"
  );

/** 各投入項目に追加する由来因子IDの入力スキーマ。 */
export const sourceFactorIdShape = z
  .string()
  .optional()
  .describe("Source factor id from factorInventory (e.g. FCT-01); enables the factor handover check");

export interface FactorHandoverInput {
  conventionId: string;
  factorInventory?: FactorInventoryEntry[];
  items: FactorHandoverItem[];
}

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function findConvention(
  frame: FactorRalphFrame,
  conventionId: string
): FactorHandoverConvention | undefined {
  return frame.handoverConventions.find((c) => c.id === conventionId);
}

/** 宣言された引き渡し先文字列（ID または targetTool）を frame の規約へ解決する。 */
function resolveTarget(
  frame: FactorRalphFrame,
  raw: string
): FactorHandoverConvention | undefined {
  return frame.handoverConventions.find((c) => c.id === raw || c.targetTool === raw);
}

function findCategory(
  frame: FactorRalphFrame,
  key: string
): FactorCategoryDefinition | undefined {
  return frame.categories.find((c) => c.key === key);
}

function categoryLabel(frame: FactorRalphFrame, key: string): string {
  return findCategory(frame, key)?.nameJa ?? key;
}

function conventionLabel(convention: FactorHandoverConvention): string {
  return `${convention.id}(${convention.targetTool})`;
}

function handoverIdRangeLabel(frame: FactorRalphFrame): string {
  const ids = frame.handoverConventions.map((c) => c.id);
  if (ids.length === 0) return "引き渡し規約";
  if (ids.length === 1) return ids[0];
  return `${ids[0]}〜${ids[ids.length - 1]}`;
}

/**
 * 「因子IDを名称に併記する」記法を要求する規約か。
 * 規約IDを埋め込まず、frame の notation 本文から判定する。
 */
function requiresFactorIdInName(convention: FactorHandoverConvention | undefined): boolean {
  return (convention?.notation ?? []).some((n) => n.includes("因子ID") && n.includes("併記"));
}

/** 規約の notation が参照している水準ヒューリスティックID（例 FLH-01）を frame から拾う。 */
function rangeHeuristicId(convention: FactorHandoverConvention | undefined): string | undefined {
  for (const line of convention?.notation ?? []) {
    const match = /FLH-\d+/.exec(line);
    if (match) return match[0];
  }
  return undefined;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    result.push(v);
  }
  return result;
}

/** categoryId 昇順の安定ソート（同一 categoryId 内は生成順を保つ）。 */
function sortFindings(findings: FactorHandoverFinding[]): FactorHandoverFinding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.categoryId.localeCompare(b.f.categoryId) || a.i - b.i)
    .map((x) => x.f);
}

export function evaluateFactorHandover(
  input: FactorHandoverInput,
  frame: FactorRalphFrame = factorRalphFrame
): FactorHandoverEvaluation {
  const convention = findConvention(frame, input.conventionId);
  const targetTool = convention?.targetTool ?? input.conventionId;
  const items = input.items ?? [];
  const findings: FactorHandoverFinding[] = [];

  // --- factorInventory 未宣言（後方互換の既定経路） ---
  if (input.factorInventory === undefined) {
    if (items.some((it) => hasText(it.sourceFactorId))) {
      findings.push({
        categoryId: "FHC-12",
        severity: "medium",
        target: input.conventionId,
        detail:
          "sourceFactorId が指定されているが factorInventory が未宣言のため、因子IDの実在と引き渡し先を照合できない。",
      });
    }
    return {
      conventionId: input.conventionId,
      targetTool,
      available: false,
      unavailableReason: UNAVAILABLE_REASON,
      entries: [],
      assignedFactorCount: 0,
      verifiedFactorCount: 0,
      verifiedRatioPercent: 0,
      ratioBasis: "unavailable",
      otherToolFactorCount: 0,
      unassignedFactorCount: 0,
      droppedFactorCount: 0,
      findings: sortFindings(findings),
    };
  }

  const inventory = input.factorInventory;

  // --- 因子ID重複の検出（照合には最初の宣言を使う） ---
  const seenIds = new Set<string>();
  for (const entry of inventory) {
    if (seenIds.has(entry.id)) {
      findings.push({
        categoryId: "FHC-02",
        severity: "high",
        target: entry.id,
        detail: `因子ID「${entry.id}」が重複して宣言されている。`,
      });
      continue;
    }
    seenIds.add(entry.id);
  }

  const categoryKeys = frame.categories.map((c) => c.key);
  const idRange = handoverIdRangeLabel(frame);
  const requireIdInName = requiresFactorIdInName(convention);
  const heuristicId = rangeHeuristicId(convention);

  const entries: FactorHandoverEntryEvaluation[] = [];
  // 指摘ありのため verifiedFactorCount に数えない因子ID
  const entryFindingFactorIds = new Set<string>();

  for (const entry of inventory) {
    const label = hasText(entry.name) ? `${entry.id} ${entry.name}` : entry.id;
    const declaredTargets = entry.handoverTargetIds ?? [];
    const category = findCategory(frame, entry.categoryKey);
    const catLabel = categoryLabel(frame, entry.categoryKey);

    if (category === undefined) {
      findings.push({
        categoryId: "FHC-02",
        severity: "high",
        target: entry.id,
        detail: `因子「${entry.id}」の分類キー「${entry.categoryKey}」は因子分解フレームの分類(${categoryKeys.join(
          ", "
        )})に存在しない。`,
      });
    }

    const resolvedTargets: FactorHandoverConvention[] = [];
    for (const raw of declaredTargets) {
      const resolved = resolveTarget(frame, raw);
      if (resolved === undefined) {
        findings.push({
          categoryId: "FHC-02",
          severity: "high",
          target: entry.id,
          detail: `因子「${entry.id}」の引き渡し先「${raw}」は因子分解フレームの引き渡し規約に存在しない。`,
        });
        continue;
      }
      resolvedTargets.push(resolved);
    }

    const droppedDeclared = hasText(entry.droppedReason);

    if (declaredTargets.length === 0 && !droppedDeclared) {
      findings.push({
        categoryId: "FHC-01",
        severity: "high",
        target: entry.id,
        detail: `因子「${label}」が${idRange}のいずれの引き渡し先にも割り当てられておらず、除外理由(droppedReason)も記入されていない。`,
      });
    }

    if (declaredTargets.length > 0 && droppedDeclared) {
      findings.push({
        categoryId: "FHC-09",
        severity: "medium",
        target: entry.id,
        detail: `因子「${label}」は引き渡し先が宣言されているのに除外理由も記入されており、扱いが確定しない。`,
      });
    }
    if (declaredTargets.length > 0 && entry.fixedCondition === true) {
      findings.push({
        categoryId: "FHC-09",
        severity: "medium",
        target: entry.id,
        detail: `因子「${label}」は固定条件として分離されているのに ${declaredTargets.join(
          ", "
        )} への引き渡しが宣言されている。`,
      });
    }

    // --- 適用分類の違反（分類キーが既知のときだけ判定する） ---
    if (category !== undefined) {
      for (const target of resolvedTargets) {
        if (target.applicableCategoryKeys.includes(category.key)) continue;
        findings.push({
          categoryId: "FHC-03",
          severity: "high",
          target: entry.id,
          detail: `因子「${label}」の分類「${catLabel}」は ${conventionLabel(
            target
          )} の適用分類(${target.applicableCategoryKeys
            .map((k) => categoryLabel(frame, k))
            .join(", ")})に含まれていない。`,
        });
        entryFindingFactorIds.add(entry.id);
      }
    }

    const assignedToThisTool = resolvedTargets.some((t) => t.id === input.conventionId);
    const matchedItems = items.filter((it) => it.sourceFactorId === entry.id);

    let verdict: FactorHandoverVerdict;
    if (assignedToThisTool) {
      if (matchedItems.length === 0) {
        verdict = "no-entity";
        findings.push({
          categoryId: "FHC-04",
          severity: "high",
          target: entry.id,
          detail: `因子「${label}」は ${input.conventionId}(${targetTool}) への引き渡しが宣言されているが、投入項目に sourceFactorId=${entry.id} のものが無く、実体を確認できない。`,
        });
      } else {
        verdict = "verified";
        for (const item of matchedItems) {
          // --- FHC-06: 因子名・因子IDの記法 ---
          if (hasText(entry.name) && !item.displayName.includes(entry.name)) {
            findings.push({
              categoryId: "FHC-06",
              severity: "medium",
              target: item.itemLabel,
              detail: `${item.itemLabel}「${item.displayName}」に因子名「${entry.name}」が現れておらず、因子表の因子名と対応が取れない。`,
            });
            entryFindingFactorIds.add(entry.id);
          }
          if (requireIdInName && !item.displayName.includes(entry.id)) {
            findings.push({
              categoryId: "FHC-06",
              severity: "medium",
              target: item.itemLabel,
              detail: `${item.itemLabel}「${item.displayName}」に因子ID「${entry.id}」が併記されておらず、${input.conventionId} の記法(因子IDを名称に併記)を満たしていない。`,
            });
            entryFindingFactorIds.add(entry.id);
          }

          // --- FHC-07 / FHC-10: 水準の照合 ---
          if (item.levelBasis === "levels") {
            const actual = item.levelLabels ?? [];
            if (entry.levels !== undefined) {
              for (const level of uniqueStrings(entry.levels)) {
                if (actual.includes(level)) continue;
                findings.push({
                  categoryId: "FHC-07",
                  severity: "medium",
                  target: entry.id,
                  detail: `因子「${label}」の水準「${level}」が投入した水準一覧に現れておらず、引き渡し時に落ちている。`,
                });
                entryFindingFactorIds.add(entry.id);
              }
              for (const level of uniqueStrings(actual)) {
                if (entry.levels.includes(level)) continue;
                findings.push({
                  categoryId: "FHC-07",
                  severity: "medium",
                  target: item.itemLabel,
                  detail: `${item.itemLabel} の水準「${level}」が因子表の水準一覧に無い。`,
                });
                entryFindingFactorIds.add(entry.id);
              }
            }
            const declaredTooFew = entry.levels !== undefined && entry.levels.length <= 1;
            if (declaredTooFew || actual.length <= 1) {
              findings.push({
                categoryId: "FHC-10",
                severity: "medium",
                target: entry.id,
                detail: `因子「${label}」は水準が1件しかなく、固定条件として分離すべきものが引き渡されている。`,
              });
              entryFindingFactorIds.add(entry.id);
            }
          }

          // --- FHC-08: 範囲型の有効範囲 ---
          if (item.levelBasis === "range" && item.rangeDeclared === false) {
            const heuristic = heuristicId === undefined ? "" : `(${heuristicId})`;
            findings.push({
              categoryId: "FHC-08",
              severity: "medium",
              target: item.itemLabel,
              detail: `${item.itemLabel} は min が max を上回っており、${input.conventionId} が対象とする範囲型${heuristic}の因子として有効範囲を確定できない。`,
            });
            entryFindingFactorIds.add(entry.id);
          }
        }
      }
    } else if (resolvedTargets.length > 0) {
      verdict = "other-tool";
    } else if (droppedDeclared) {
      verdict = "dropped";
    } else {
      verdict = "unassigned";
    }

    entries.push({
      factorId: entry.id,
      name: entry.name,
      categoryKey: entry.categoryKey,
      categoryNameJa: category?.nameJa,
      handoverTargetIds: declaredTargets,
      matchedItemLabels: matchedItems.map((it) => it.itemLabel),
      verdict,
      verifiedByEntity: verdict === "verified" && !entryFindingFactorIds.has(entry.id),
    });
  }

  // 実体照合の指摘が1件でも残る因子は「検証済み」に数えない（全因子の走査後に確定させる）。
  for (const entry of entries) {
    entry.verifiedByEntity = entry.verdict === "verified" && !entryFindingFactorIds.has(entry.factorId);
  }

  // --- 実体側（items）の検査 ---
  const knownIds = new Set(inventory.map((e) => e.id));
  let missingSourceCount = 0;
  for (const item of items) {
    if (!hasText(item.sourceFactorId)) {
      missingSourceCount += 1;
      continue;
    }
    const sourceFactorId = item.sourceFactorId as string;
    if (knownIds.has(sourceFactorId)) continue;
    findings.push({
      categoryId: "FHC-05",
      severity: "high",
      target: item.itemLabel,
      detail: `${item.itemLabel} が factorInventory に存在しない因子ID「${sourceFactorId}」を参照している。`,
    });
  }
  if (missingSourceCount > 0) {
    findings.push({
      categoryId: "FHC-11",
      severity: "info",
      target: input.conventionId,
      detail: `sourceFactorId が未指定の投入項目が ${missingSourceCount} 件あり、引き渡し検査の対象外になっている。`,
    });
  }

  const assignedEntries = entries.filter(
    (e) => e.verdict === "verified" || e.verdict === "no-entity"
  );
  const verifiedEntries = assignedEntries.filter((e) => e.verifiedByEntity);
  const assignedFactorCount = assignedEntries.length;
  const verifiedFactorCount = verifiedEntries.length;

  return {
    conventionId: input.conventionId,
    targetTool,
    available: true,
    entries,
    assignedFactorCount,
    verifiedFactorCount,
    verifiedRatioPercent:
      assignedFactorCount === 0
        ? 0
        : Math.round((verifiedFactorCount / assignedFactorCount) * 1000) / 10,
    ratioBasis: "verified",
    otherToolFactorCount: entries.filter((e) => e.verdict === "other-tool").length,
    unassignedFactorCount: entries.filter((e) => e.verdict === "unassigned").length,
    droppedFactorCount: entries.filter((e) => e.verdict === "dropped").length,
    findings: sortFindings(findings),
  };
}

/** 表示用の判定文言。実体はあるが指摘が残っている因子は「検証済み」と表示しない。 */
function verdictLabel(entry: FactorHandoverEntryEvaluation): string {
  switch (entry.verdict) {
    case "verified":
      return entry.verifiedByEntity ? "検証済み" : "実体あり(指摘あり)";
    case "no-entity":
      return "実体なし";
    case "other-tool":
      return "他ツール担当";
    case "unassigned":
      return "引き渡し先未宣言";
    case "dropped":
      return "除外(理由あり)";
  }
}

function targetsCell(evaluationTargets: string[], frame: FactorRalphFrame): string {
  if (evaluationTargets.length === 0) return "-";
  return evaluationTargets
    .map((raw) => {
      const resolved = resolveTarget(frame, raw);
      return resolved === undefined ? raw : conventionLabel(resolved);
    })
    .join(", ");
}

/**
 * 因子引き渡し検査の Markdown 節を返す。
 * heading は見出し行そのもの（例 "## 4. 因子引き渡し検査(FHO-02)"）を受け取る。
 */
export function renderFactorHandoverSection(
  heading: string,
  input: FactorHandoverInput,
  frame: FactorRalphFrame = factorRalphFrame
): string {
  const result = evaluateFactorHandover(input, frame);
  const lines: string[] = [];
  lines.push(heading);
  lines.push("");

  const findingLines = result.findings.map(
    (f) => `- [${f.severity}] ${f.categoryId} ${escapeCell(f.target)}: ${escapeCell(f.detail)}`
  );

  if (!result.available) {
    lines.push(`- 未算出(理由: ${escapeCell(result.unavailableReason ?? UNAVAILABLE_REASON)})`);
    lines.push(...findingLines);
    lines.push("");
    return lines.join("\n");
  }

  lines.push("| 因子ID | 因子名 | 分類 | 引き渡し先 | 本ツールでの実体 | 判定 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const entry of result.entries) {
    const cells = [
      entry.factorId,
      entry.name,
      entry.categoryNameJa ?? entry.categoryKey,
      targetsCell(entry.handoverTargetIds, frame),
      entry.matchedItemLabels.length === 0 ? "-" : entry.matchedItemLabels.join(", "),
      verdictLabel(entry),
    ];
    lines.push(`| ${cells.map((c) => escapeCell(String(c))).join(" | ")} |`);
  }
  lines.push("");

  if (findingLines.length === 0) {
    lines.push("- 指摘なし");
  } else {
    lines.push(...findingLines);
  }

  const ratioText =
    result.assignedFactorCount === 0
      ? "引き渡し検証率: 未算出(理由: 本ツールへ引き渡された因子が0件のため分母を取れない)"
      : `引き渡し検証率: ${result.verifiedRatioPercent.toFixed(1)}%（分母: 本ツール担当因子数 ${
          result.assignedFactorCount
        }、根拠: 本呼び出しの投入項目との照合）`;
  lines.push(
    `- 因子数: ${result.entries.length} / 本ツール担当: ${result.assignedFactorCount} / 実体照合済み: ${result.verifiedFactorCount} / ${ratioText} / 他ツール担当: ${result.otherToolFactorCount} / 引き渡し先未宣言: ${result.unassignedFactorCount} / 除外(理由記入済み): ${result.droppedFactorCount}`
  );
  lines.push("");

  return lines.join("\n");
}
