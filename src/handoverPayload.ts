import { z } from "zod";
import type { HandoverPayloadCriterion } from "./types.js";

// 下流ツール引き渡しJSONの共通基盤。
// すべて純関数で、入力を破壊せず、同一入力に対して常に同一出力（配列順まで）を返す。
// 乱数・現在時刻は一切使わない。
//
// 設計方針（analyze_cause_effect → design_decision_table の正本パターンに合わせる）:
//  - 上流の「宣言」ではなく「算出済み実体」から受け側の入力型そのものを組み立てる。
//  - 組み立てたペイロードを受け側の算出ロジックへ通し直し、上流の算出結果と突き合わせる。
//  - 上流が算出不能なときは推測値を出さず、`未算出（理由: ...）` だけを出す。

export const emitHandoverPayloadInputShape = {
  emitHandoverPayload: z
    .boolean()
    .optional()
    .describe(
      "If true, emits the full downstream-ready payload JSON. Default false: only the reconciliation summary, counts and the non-generatable field list are emitted."
    ),
} as const;

/**
 * 引き渡しJSONの判定区分カタログ。
 * MCP resource としては公開せず、本モジュールの定数として保持する。
 */
export const handoverPayloadCriteria: readonly HandoverPayloadCriterion[] = [
  {
    id: "HPO-01",
    nameJa: "項目ID集合の不一致",
    severity: "high",
    definition: "生成した引き渡しペイロードの項目ID集合が、上流の算出実体のID集合と一致しない。",
    recommendedAction:
      "ペイロード生成が上流実体を取りこぼしていないか確認する。引き渡しJSONをそのまま下流へ渡してはならない。",
  },
  {
    id: "HPO-02",
    nameJa: "再集計値の不一致",
    severity: "high",
    definition: "生成した引き渡しペイロードから再集計した値が、上流が自節で提示している算出値と一致しない。",
    recommendedAction: "上流の提示値とペイロードのどちらが誤っているかを特定してから引き渡すこと。",
  },
  {
    id: "HPO-03",
    nameJa: "受け側必須フィールドの欠落",
    severity: "high",
    definition: "受け側ツールの必須フィールドを、上流の算出実体から埋められなかった項目がある。",
    recommendedAction: "当該フィールドを上流入力へ補ってから再実行する。推測値で埋めてはならない。",
  },
  {
    id: "HPO-04",
    nameJa: "往復照合の不一致",
    severity: "high",
    definition: "生成した引き渡しペイロードを受け側の算出ロジックへ通した結果が、上流の算出結果と一致しない。",
    recommendedAction:
      "上流の算出ロジックと受け側の算出ロジックのどちらの前提が崩れているかを特定する。一致するまで引き渡さない。",
  },
  {
    id: "HPO-05",
    nameJa: "受け側で指摘になる未記入項目の同梱",
    severity: "medium",
    definition:
      "受け側で指摘になることが確定している未記入項目を含んだまま引き渡している（link の evidence 未記入、dependsOn 未宣言など）。",
    recommendedAction: "引き渡し先で指摘として出る前提で、当該項目を利用者が記入すること。上流側で推測補完してはならない。",
  },
] as const;

export interface HandoverPayloadFinding {
  categoryId: string;
  severity: "high" | "medium" | "info";
  target: string;
  detail: string;
}

export interface HandoverPayloadRender {
  /** 出力する見出し行。例 `### 10.2 generate_test_cases 入力(JSON)` */
  heading: string;
  /** 受け側ツール名。例 `generate_test_cases` */
  targetTool: string;
  /** 生成した引き渡しペイロード。上流が算出不能なら undefined */
  payload: unknown | undefined;
  /** payload が undefined のときの理由 */
  unavailableReason?: string;
  /** 生成件数・文字数などの実測行 */
  countLines: string[];
  /** 機械生成できず利用者が記入するフィールドの全列挙 */
  manualFieldLines: string[];
  /** 往復照合の結果行 */
  roundTripLines: string[];
  findings: HandoverPayloadFinding[];
}

/** categoryId 昇順・同一 categoryId 内は生成順の安定ソート。 */
export function sortHandoverPayloadFindings(findings: HandoverPayloadFinding[]): HandoverPayloadFinding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => {
      if (a.finding.categoryId < b.finding.categoryId) return -1;
      if (a.finding.categoryId > b.finding.categoryId) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.finding);
}

/**
 * 往復照合の不一致（HPO-01..HPO-04）だけを数える。
 * HPO-05 は「受け側で指摘になる未記入項目を同梱している」という助言であり、
 * 上流と受け側の算出結果の一致・不一致とは独立に出る。
 */
export function countHandoverMismatchFindings(findings: HandoverPayloadFinding[]): number {
  return findings.filter((f) => f.categoryId !== "HPO-05").length;
}

/** JSON文字列としてのバイト量ではなく文字数。countLines の実測値に使う。 */
export function handoverPayloadCharCount(payload: unknown): number {
  return JSON.stringify(payload).length;
}

export function renderHandoverPayloadSection(render: HandoverPayloadRender, emit: boolean): string {
  const lines: string[] = [];
  lines.push(render.heading);
  lines.push("");

  if (render.payload === undefined) {
    lines.push(`- 未算出（理由: ${render.unavailableReason ?? "不明"}）`);
    lines.push("");
    return lines.join("\n");
  }

  if (emit) {
    lines.push("```json");
    lines.push(JSON.stringify(render.payload, null, 2));
    lines.push("```");
    lines.push(`- 上記JSONは ${render.targetTool} の入力としてそのまま渡せる形式である。`);
  } else {
    lines.push(
      `- 本文未出力（emitHandoverPayload: true を指定すると ${render.targetTool} 入力JSONの全文を出力する）`
    );
  }

  for (const line of render.countLines) lines.push(`- ${line}`);
  for (const line of render.manualFieldLines) lines.push(`- 利用者が記入する項目: ${line}`);
  for (const line of render.roundTripLines) lines.push(`- ${line}`);

  const sorted = sortHandoverPayloadFindings(render.findings);
  if (countHandoverMismatchFindings(sorted) === 0) {
    lines.push(
      `- 突き合わせ結果: 一致（${render.targetTool} の算出ロジックで再計算した値が上流の算出結果と一致）`
    );
  } else {
    lines.push("- 突き合わせ結果: 不一致（HPO-01〜HPO-04 を参照）");
  }
  for (const finding of sorted) {
    lines.push(`- [${finding.severity}] ${finding.categoryId} ${finding.target}: ${finding.detail}`);
  }

  lines.push("");
  return lines.join("\n");
}
