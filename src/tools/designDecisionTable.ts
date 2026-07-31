import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  DecisionTableActionValue,
  DecisionTableCombination,
  DecisionTableCompressedRule,
  DecisionTableConditionSpec,
  DecisionTableFinding,
  DecisionTableResult,
  DecisionTableRuleSpec,
  DecisionTableSelector,
  DecisionTableSpec,
  TestCaseCoverageTarget,
} from "../types.js";

// design_decision_table 固有の決定的エンジン。
// 純関数群で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。

export const DEFAULT_DECISION_TABLE_ID = "MAIN";
export const DEFAULT_MAX_DECISION_TABLE_COMBINATIONS = 4096;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** 網羅対象ID・description の中で使うため export する（testCaseAnalysis 等での文字列連結の再実装を防ぐ）。 */
export function decisionTableTargetId(tableId: string, ruleNo: number): string {
  return `DT:${tableId}:R${ruleNo}`;
}

function selectorValues(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function selectorMatches(when: DecisionTableSelector, values: Record<string, string>): boolean {
  for (const [conditionId, raw] of Object.entries(when)) {
    const candidates = selectorValues(raw);
    if (!candidates.includes(values[conditionId])) return false;
  }
  return true;
}

function describeComboValues(
  values: Record<string, string>,
  conditions: DecisionTableConditionSpec[]
): string {
  return conditions.map((c) => `${c.statement}=${values[c.id]}`).join(", ");
}

// --- 圧縮（don't care 導出）用の作業表現 ---

interface WorkingRule {
  conditionLevels: Record<string, string[]>; // conditionId -> 採用水準（宣言順に正規化済み）
  combinationIndexes: number[];
  actions: Record<string, DecisionTableActionValue>;
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((v) => setB.has(v));
}

function orderByLevels(values: Iterable<string>, levels: string[]): string[] {
  const set = new Set(values);
  return levels.filter((l) => set.has(l));
}

/**
 * 貪欲な最初一致・変更あれば先頭から再走査の反復で、ちょうど1条件だけ水準集合が異なる
 * 2ルールを1本へ融合する（compressCauseEffectRules と同じ形の、多水準版）。
 *
 * 健全性: マージするのは「他の全条件の採用水準集合が完全一致し、かつ動作ベクトルが一致する」
 * ペアに限る。マージ後ルールの直積は、マージ対象となった2ルールそれぞれの直積（＝いずれも
 * 有効組合せの部分集合）の和集合と一致する（他条件が固定されているため）。したがって
 * マージによって無効組合せを新たに取り込むことはない。最小被覆を保証するものではなく、
 * 貪欲・決定的な圧縮である。
 */
function compressGroup(
  group: WorkingRule[],
  conditions: DecisionTableConditionSpec[]
): WorkingRule[] {
  const working: WorkingRule[] = group.map((r) => ({
    conditionLevels: { ...r.conditionLevels },
    combinationIndexes: [...r.combinationIndexes],
    actions: { ...r.actions },
  }));

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < working.length && !changed; i++) {
      for (let j = i + 1; j < working.length && !changed; j++) {
        const diffConditionIds = conditions
          .map((c) => c.id)
          .filter((id) => !setsEqual(working[i].conditionLevels[id], working[j].conditionLevels[id]));
        if (diffConditionIds.length !== 1) continue;

        const diffId = diffConditionIds[0];
        const conditionSpec = conditions.find((c) => c.id === diffId) as DecisionTableConditionSpec;
        const unionLevels = orderByLevels(
          [...working[i].conditionLevels[diffId], ...working[j].conditionLevels[diffId]],
          conditionSpec.levels
        );

        const merged: WorkingRule = {
          conditionLevels: { ...working[i].conditionLevels, [diffId]: unionLevels },
          combinationIndexes: [...working[i].combinationIndexes, ...working[j].combinationIndexes].sort(
            (a, b) => a - b
          ),
          actions: { ...working[i].actions },
        };
        working.splice(j, 1);
        working.splice(i, 1, merged);
        changed = true;
      }
    }
  }

  return working;
}

// --- メインエンジン ---

export function computeDecisionTableRows(spec: DecisionTableSpec): DecisionTableResult {
  const tableId = spec.tableId ?? DEFAULT_DECISION_TABLE_ID;
  const conditions = spec.conditions;
  const actions = spec.actions;
  const invalidCombinations = spec.invalidCombinations ?? [];
  const rules = spec.rules ?? [];
  const maxCombinations = spec.maxCombinations ?? DEFAULT_MAX_DECISION_TABLE_COMBINATIONS;

  const findings: DecisionTableFinding[] = [];
  const conditionIds = new Set<string>();
  const conditionById = new Map<string, DecisionTableConditionSpec>();

  for (const c of conditions) {
    if (conditionIds.has(c.id)) {
      findings.push({
        categoryId: "DTC-04",
        severity: "high",
        target: c.id,
        detail: `条件ID「${c.id}」が重複して宣言されている。`,
      });
    } else {
      conditionIds.add(c.id);
      conditionById.set(c.id, c);
    }
    const levelSeen = new Set<string>();
    for (const lv of c.levels) {
      if (levelSeen.has(lv)) {
        findings.push({
          categoryId: "DTC-04",
          severity: "high",
          target: c.id,
          detail: `条件「${c.id}」の水準「${lv}」が重複して宣言されている。`,
        });
      }
      levelSeen.add(lv);
    }
    if (c.levels.length <= 1) {
      findings.push({
        categoryId: "DTC-05",
        severity: "medium",
        target: c.id,
        detail: `条件「${c.id}」の取り得る水準が${c.levels.length}件しかなく、組合せに寄与しない。`,
      });
    }
  }

  const actionIds = new Set<string>();
  for (const a of actions) {
    if (actionIds.has(a.id)) {
      findings.push({
        categoryId: "DTC-04",
        severity: "high",
        target: a.id,
        detail: `動作ID「${a.id}」が重複して宣言されている。`,
      });
    } else {
      actionIds.add(a.id);
    }
  }

  const checkSelector = (label: string, when: DecisionTableSelector): void => {
    for (const [conditionId, raw] of Object.entries(when)) {
      if (!conditionIds.has(conditionId)) {
        findings.push({
          categoryId: "DTC-01",
          severity: "high",
          target: label,
          detail: `「${label}」が未宣言の条件ID「${conditionId}」を参照している。`,
        });
        continue;
      }
      const condition = conditionById.get(conditionId) as DecisionTableConditionSpec;
      for (const v of selectorValues(raw)) {
        if (!condition.levels.includes(v)) {
          findings.push({
            categoryId: "DTC-02",
            severity: "high",
            target: label,
            detail: `「${label}」が条件「${conditionId}」に存在しない水準「${v}」を参照している。`,
          });
        }
      }
    }
  };

  invalidCombinations.forEach((ic, i) => checkSelector(ic.id ?? `invalidCombinations[${i}]`, ic.when));
  rules.forEach((r, i) => checkSelector(r.id ?? `rules[${i}]`, r.when));

  rules.forEach((r, i) => {
    const label = r.id ?? `rules[${i}]`;
    for (const actionId of Object.keys(r.actions)) {
      if (!actionIds.has(actionId)) {
        findings.push({
          categoryId: "DTC-03",
          severity: "high",
          target: label,
          detail: `「${label}」が未宣言の動作ID「${actionId}」を参照している。`,
        });
      }
    }
  });

  const totalCombinationCount = conditions.reduce((n, c) => n * c.levels.length, 1);

  const blocking = findings.filter((f) => f.severity === "high");
  if (blocking.length > 0) {
    const categories = [...new Set(blocking.map((f) => f.categoryId))].join(", ");
    return {
      tableId,
      enumerated: false,
      skipReason: `入力の構造に致命的な指摘(${categories})があるため全列挙を行わなかった`,
      conditionCount: conditions.length,
      totalCombinationCount,
      invalidCombinationCount: 0,
      validCombinationCount: 0,
      definedCombinationCount: 0,
      undefinedCombinationIndexes: [],
      conflictingCombinationIndexes: [],
      combinations: [],
      compressedRules: [],
      compressionRatioPercent: 0,
      findings,
    };
  }

  if (totalCombinationCount > maxCombinations) {
    findings.push({
      categoryId: "DTC-10",
      severity: "info",
      target: tableId,
      detail: `全組合せ数 ${totalCombinationCount} 件が上限 ${maxCombinations} 件を超えるため全列挙を行わなかった。`,
    });
    return {
      tableId,
      enumerated: false,
      skipReason: `全組合せ数 ${totalCombinationCount} 件が上限 ${maxCombinations} 件を超えるため全列挙を行わなかった`,
      conditionCount: conditions.length,
      totalCombinationCount,
      invalidCombinationCount: 0,
      validCombinationCount: 0,
      definedCombinationCount: 0,
      undefinedCombinationIndexes: [],
      conflictingCombinationIndexes: [],
      combinations: [],
      compressedRules: [],
      compressionRatioPercent: 0,
      findings,
    };
  }

  // --- 全組合せ生成（宣言順の最後の条件が最も速く回る） ---
  const combos: Record<string, string>[] = [];
  const build = (idx: number, current: Record<string, string>): void => {
    if (idx === conditions.length) {
      combos.push({ ...current });
      return;
    }
    const cond = conditions[idx];
    for (const lv of cond.levels) {
      current[cond.id] = lv;
      build(idx + 1, current);
    }
  };
  if (conditions.length > 0) build(0, {});

  const combinations: DecisionTableCombination[] = combos.map((values, i) => ({
    index: i + 1,
    values,
    status: "valid",
    matchedRuleIndexes: [],
  }));

  // --- 無効組合せ除外 ---
  for (const combo of combinations) {
    for (const ic of invalidCombinations) {
      if (selectorMatches(ic.when, combo.values)) {
        combo.status = "invalid";
        combo.invalidReason = ic.reason;
        break;
      }
    }
  }

  const validCombinations = combinations.filter((c) => c.status === "valid");
  const invalidCombinationCount = combinations.length - validCombinations.length;
  const validCombinationCount = validCombinations.length;

  if (validCombinationCount === 0) {
    findings.push({
      categoryId: "DTC-09",
      severity: "high",
      target: tableId,
      detail: "無効組合せ指定によって全ての組合せが除外され、有効な組合せが0件である。",
    });
  }

  // --- ルール引き当て ---
  const actionIdList = actions.map((a) => a.id);
  const normalizeActions = (
    raw: Record<string, DecisionTableActionValue>
  ): Record<string, DecisionTableActionValue> => {
    const out: Record<string, DecisionTableActionValue> = {};
    for (const id of actionIdList) out[id] = raw[id] ?? "N";
    return out;
  };

  const undefinedCombinationIndexes: number[] = [];
  const conflictingCombinationIndexes: number[] = [];
  const ruleHitCount = new Array(rules.length).fill(0) as number[];

  for (const combo of validCombinations) {
    const matched: number[] = [];
    rules.forEach((r, ri) => {
      if (selectorMatches(r.when, combo.values)) matched.push(ri);
    });
    combo.matchedRuleIndexes = matched;

    if (matched.length === 0) {
      undefinedCombinationIndexes.push(combo.index);
      findings.push({
        categoryId: "DTC-06",
        severity: "high",
        target: `組合せ#${combo.index}`,
        detail: `組合せ #${combo.index}（${describeComboValues(combo.values, conditions)}）に一致するルールが無く、動作が未定義である。`,
      });
      continue;
    }

    matched.forEach((ri) => (ruleHitCount[ri] += 1));
    const normalized = matched.map((ri) => normalizeActions((rules[ri] as DecisionTableRuleSpec).actions));
    const firstKey = JSON.stringify(normalized[0]);
    const allSame = normalized.every((n) => JSON.stringify(n) === firstKey);

    if (!allSame) {
      conflictingCombinationIndexes.push(combo.index);
      const ruleLabels = matched.map((ri) => (rules[ri] as DecisionTableRuleSpec).id ?? `rules[${ri}]`);
      findings.push({
        categoryId: "DTC-07",
        severity: "high",
        target: `組合せ#${combo.index}`,
        detail: `組合せ #${combo.index}（${describeComboValues(combo.values, conditions)}）に一致する複数ルール（${ruleLabels.join(
          ", "
        )}）の動作が食い違っている。`,
      });
      continue;
    }

    combo.actions = normalized[0];
  }

  rules.forEach((r, i) => {
    if (ruleHitCount[i] > 0) return;
    findings.push({
      categoryId: "DTC-08",
      severity: "medium",
      target: r.id ?? `rules[${i}]`,
      detail: `ルール「${r.id ?? `rules[${i}]`}」が有効な組合せを1件も引き当てておらず、冗長または到達不能である。`,
    });
  });

  const definedCombinations = validCombinations.filter((c) => c.actions !== undefined);
  const definedCombinationCount = definedCombinations.length;

  // --- 圧縮（don't care 導出） ---
  const groupOrder: string[] = [];
  const groups = new Map<string, WorkingRule[]>();
  for (const combo of definedCombinations) {
    const actionsRecord = combo.actions as Record<string, DecisionTableActionValue>;
    const key = JSON.stringify(actionsRecord);
    const initial: WorkingRule = {
      conditionLevels: Object.fromEntries(conditions.map((c) => [c.id, [combo.values[c.id]]])),
      combinationIndexes: [combo.index],
      actions: actionsRecord,
    };
    const group = groups.get(key);
    if (group) {
      group.push(initial);
    } else {
      groupOrder.push(key);
      groups.set(key, [initial]);
    }
  }

  const mergedAll: WorkingRule[] = [];
  for (const key of groupOrder) {
    mergedAll.push(...compressGroup(groups.get(key) as WorkingRule[], conditions));
  }
  mergedAll.sort((a, b) => a.combinationIndexes[0] - b.combinationIndexes[0]);

  const compressedRules: DecisionTableCompressedRule[] = mergedAll.map((rule, index) => {
    const dontCareConditionIds = conditions
      .filter((c) => rule.conditionLevels[c.id].length === c.levels.length)
      .map((c) => c.id);
    return {
      no: index + 1,
      conditionLevels: { ...rule.conditionLevels },
      dontCareConditionIds,
      actions: { ...rule.actions },
      combinationIndexes: [...rule.combinationIndexes],
    };
  });

  const compressionRatioPercent =
    definedCombinationCount === 0
      ? 0
      : Math.round((1 - compressedRules.length / definedCombinationCount) * 1000) / 10;

  return {
    tableId,
    enumerated: true,
    conditionCount: conditions.length,
    totalCombinationCount,
    invalidCombinationCount,
    validCombinationCount,
    definedCombinationCount,
    undefinedCombinationIndexes,
    conflictingCombinationIndexes,
    combinations,
    compressedRules,
    compressionRatioPercent,
    findings,
  };
}

export function buildDecisionTableCoverageTargets(spec: DecisionTableSpec): TestCaseCoverageTarget[] {
  const tableId = spec.tableId ?? DEFAULT_DECISION_TABLE_ID;
  const result = computeDecisionTableRows(spec);
  if (!result.enumerated) return [];

  return result.compressedRules.map((rule) => {
    const conditionText = spec.conditions
      .map((c) =>
        rule.dontCareConditionIds.includes(c.id)
          ? `${c.statement}=-`
          : `${c.statement}=${rule.conditionLevels[c.id].join("/")}`
      )
      .join(" / ");
    const actionText = spec.actions
      .map((a) => `${a.statement}=${rule.actions[a.id]}`)
      .join(" , ");
    return {
      id: decisionTableTargetId(tableId, rule.no),
      techniqueId: "decision-table",
      description: `${conditionText} → ${actionText}`,
      origin: tableId,
    };
  });
}

export function renderDecisionTable(spec: DecisionTableSpec): string {
  const tableId = spec.tableId ?? DEFAULT_DECISION_TABLE_ID;
  const result = computeDecisionTableRows(spec);

  const lines: string[] = [];
  lines.push("# デシジョンテーブル設計結果");
  lines.push("");
  if (spec.title) {
    lines.push(`- 対象: ${spec.title}`);
    lines.push("");
  }

  lines.push("## 1. 条件項目・動作項目");
  lines.push("");
  lines.push("| 区分 | ID | 内容 | 水準 |");
  lines.push("| --- | --- | --- | --- |");
  for (const c of spec.conditions) {
    lines.push(`| 条件 | ${escapeCell(c.id)} | ${escapeCell(c.statement)} | ${escapeCell(c.levels.join(", "))} |`);
  }
  for (const a of spec.actions) {
    lines.push(`| 動作 | ${escapeCell(a.id)} | ${escapeCell(a.statement)} | - |`);
  }
  lines.push("");

  const skipLine = (): void => {
    lines.push(`- 未算出(理由: ${escapeCell(result.skipReason ?? "")})`);
    lines.push("");
  };

  lines.push("## 2. 組合せの列挙");
  lines.push("");
  if (!result.enumerated) {
    skipLine();
  } else {
    lines.push(`- 全組合せ数: ${result.totalCombinationCount}`);
    lines.push(`- 無効組合せ数: ${result.invalidCombinationCount}`);
    lines.push(`- 有効組合せ数: ${result.validCombinationCount}`);
    lines.push("");
    const invalidCombos = result.combinations.filter((c) => c.status === "invalid");
    if (invalidCombos.length > 0) {
      lines.push("| 組合せ# | 条件値 | 無効理由 |");
      lines.push("| --- | --- | --- |");
      for (const combo of invalidCombos) {
        lines.push(
          `| ${combo.index} | ${escapeCell(describeComboValues(combo.values, spec.conditions))} | ${escapeCell(
            combo.invalidReason ?? ""
          )} |`
        );
      }
      lines.push("");
    }
  }

  lines.push("## 3. デシジョンテーブル(圧縮前)");
  lines.push("");
  if (!result.enumerated) {
    skipLine();
  } else {
    const definedCombos = result.combinations.filter((c) => c.actions !== undefined);
    if (definedCombos.length > 64) {
      lines.push(`- 圧縮前の有効組合せは ${definedCombos.length} 件（64件超のため表は省略）。`);
      lines.push("");
    } else {
      const header = ["組合せ#", ...spec.conditions.map((c) => c.statement), ...spec.actions.map((a) => a.statement)];
      lines.push(`| ${header.map(escapeCell).join(" | ")} |`);
      lines.push(`| ${header.map(() => "---").join(" | ")} |`);
      for (const combo of definedCombos) {
        const row = [
          String(combo.index),
          ...spec.conditions.map((c) => combo.values[c.id]),
          ...spec.actions.map((a) => (combo.actions as Record<string, DecisionTableActionValue>)[a.id]),
        ];
        lines.push(`| ${row.map((v) => escapeCell(String(v))).join(" | ")} |`);
      }
      lines.push("");
    }
  }

  lines.push("## 4. デシジョンテーブル(圧縮後)");
  lines.push("");
  if (!result.enumerated) {
    skipLine();
  } else {
    const header = [
      "No",
      ...spec.conditions.map((c) => c.statement),
      ...spec.actions.map((a) => a.statement),
      "束ねた組合せ数",
    ];
    lines.push(`| ${header.map(escapeCell).join(" | ")} |`);
    lines.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (const rule of result.compressedRules) {
      const conditionCells = spec.conditions.map((c) =>
        rule.dontCareConditionIds.includes(c.id) ? "-" : rule.conditionLevels[c.id].join("/")
      );
      const actionCells = spec.actions.map((a) => rule.actions[a.id]);
      const row = [String(rule.no), ...conditionCells, ...actionCells, String(rule.combinationIndexes.length)];
      lines.push(`| ${row.map((v) => escapeCell(String(v))).join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push("## 5. 決定的検査");
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("- 指摘なし");
  } else {
    const sorted = [...result.findings].sort((a, b) => a.categoryId.localeCompare(b.categoryId));
    const dtc06Total = sorted.filter((f) => f.categoryId === "DTC-06").length;
    let dtc06Seen = 0;
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      if (f.categoryId === "DTC-06") {
        dtc06Seen += 1;
        if (dtc06Seen > 50) continue;
      }
      lines.push(`- [${f.severity}] ${f.categoryId} ${escapeCell(f.target)}: ${escapeCell(f.detail)}`);
      const isLastDtc06 = f.categoryId === "DTC-06" && (i + 1 >= sorted.length || sorted[i + 1].categoryId !== "DTC-06");
      if (isLastDtc06 && dtc06Total > 50) {
        lines.push(`- 他 ${dtc06Total - 50} 件`);
      }
    }
  }
  lines.push("");

  lines.push("## 6. 網羅対象一覧(generate_test_cases 引き渡し)");
  lines.push("");
  if (!result.enumerated) {
    skipLine();
  } else {
    const targets = buildDecisionTableCoverageTargets(spec);
    lines.push("| 網羅対象ID | 内容 |");
    lines.push("| --- | --- |");
    for (const t of targets) {
      lines.push(`| ${escapeCell(t.id)} | ${escapeCell(t.description)} |`);
    }
    lines.push("");
  }

  lines.push("## 7. サマリ");
  lines.push("");
  lines.push(
    `- 条件数: ${result.conditionCount} / 全組合せ数: ${result.totalCombinationCount} / 無効: ${result.invalidCombinationCount} / 有効: ${result.validCombinationCount} / 動作定義済み: ${result.definedCombinationCount} / 未定義: ${result.undefinedCombinationIndexes.length} / 矛盾: ${result.conflictingCombinationIndexes.length} / 圧縮後列数: ${result.compressedRules.length} / 削減率: ${result.compressionRatioPercent.toFixed(1)}%`
  );

  return lines.join("\n").trimEnd() + "\n";
}

const decisionTableSelectorSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));

export const designDecisionTableInputShape = {
  tableId: z.string().optional().describe("Table id used to build coverage target ids (default MAIN)"),
  title: z.string().optional(),
  conditions: z
    .array(
      z.object({
        id: z.string().describe("Condition id, unique within the table, e.g. C1"),
        statement: z.string().describe("Condition description"),
        levels: z.array(z.string()).min(1).describe("Possible levels for this condition; 2 or more expected"),
      })
    )
    .min(1)
    .describe("Condition items (causes)"),
  actions: z
    .array(
      z.object({
        id: z.string().describe("Action id, unique within the table, e.g. A1"),
        statement: z.string().describe("Action description"),
      })
    )
    .min(1)
    .describe("Action items (effects)"),
  invalidCombinations: z
    .array(
      z.object({
        id: z.string().optional(),
        when: decisionTableSelectorSchema,
        reason: z.string().describe("Why this combination is impossible (required)"),
      })
    )
    .optional()
    .describe("Combinations that can never occur, excluded before rule matching"),
  rules: z
    .array(
      z.object({
        id: z.string().optional(),
        when: decisionTableSelectorSchema,
        actions: z.record(z.string(), z.enum(["Y", "N", "-"])),
        note: z.string().optional(),
      })
    )
    .optional()
    .describe("Rules mapping condition selectors to actions; unspecified action ids default to N"),
  maxCombinations: z.number().int().positive().optional().describe("Enumeration cap (default 4096)"),
} as const;

const designDecisionTableInputSchema = z.object(designDecisionTableInputShape);
export type DesignDecisionTableInput = z.infer<typeof designDecisionTableInputSchema>;

export function registerDesignDecisionTableTool(server: McpServer): void {
  server.registerTool(
    "design_decision_table",
    {
      title: "Design Decision Table",
      description:
        "条件項目と水準・無効組合せ・ルールから全組合せを決定的に列挙し、無効組合せの除外・同一動作列の圧縮(don't care導出)・条件組合せ被覆・動作未定義組合せの検出・圧縮前後の列数と削減率をMarkdownで返す。" +
        "圧縮後ルールは DT: プレフィックスの網羅対象IDとして generate_test_cases の decisionTable へそのまま渡せる。" +
        "analyze_cause_effect の「5. デシジョンテーブルへの引き渡し」の条件項目・動作項目を、水準を [\"T\",\"F\"] として投入することもできる。",
      inputSchema: designDecisionTableInputShape,
    },
    async (input) => {
      const text = renderDecisionTable(input as DecisionTableSpec);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
