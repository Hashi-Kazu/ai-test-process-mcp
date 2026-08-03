import { z } from "zod";
import { nextToolCatalog, registeredToolNames } from "./resources/nextToolCatalog.js";
import type { CompletedToolDeclaration, NextToolCatalogEntry, NextToolRow } from "./types.js";

export type { CompletedToolDeclaration, NextToolCatalogEntry, NextToolRow };

export interface NextToolResolution {
  rows: NextToolRow[];
  warnings: string[];
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** 全ツール共通で inputShape へ展開する `completedTools` 定義。 */
export const completedToolsInputShape = {
  completedTools: z
    .array(
      z.object({
        toolName: z.string().describe("Name of an already executed tool in this workflow"),
        evidence: z
          .string()
          .describe("Evidence of execution, e.g. output file path or heading"),
      })
    )
    .optional()
    .describe("Already executed tools; entries without evidence are treated as not executed"),
} as const;

/**
 * 実行元ツールの静的な後続表と、生成物から機械的に導いたシグナルから、後続ツール行を決定的に解決する。
 * 例外は投げない。
 */
export function resolveNextTools(
  sourceToolName: string,
  signals: readonly string[],
  completedTools?: readonly CompletedToolDeclaration[],
  extraEntries?: readonly NextToolCatalogEntry[]
): NextToolResolution {
  const warnings: string[] = [];
  const catalogEntries = nextToolCatalog[sourceToolName] ?? [];
  const allEntries: NextToolCatalogEntry[] = [...catalogEntries, ...(extraEntries ?? [])];

  const signalSet = new Set(signals);
  const applicable = allEntries.filter((e) => e.when === "always" || signalSet.has(e.when));

  // 重複排除（先勝ち。後続の重複エントリの理由は丸括弧で統合）
  const order: string[] = [];
  const merged = new Map<string, { toolName: string; reason: string; extras: string[] }>();
  for (const entry of applicable) {
    const found = merged.get(entry.toolName);
    if (found === undefined) {
      order.push(entry.toolName);
      merged.set(entry.toolName, { toolName: entry.toolName, reason: entry.reason, extras: [] });
      continue;
    }
    if (entry.reason !== found.reason && !found.extras.includes(entry.reason)) {
      found.extras.push(entry.reason);
    }
  }

  const candidateNames = new Set(order);

  // 実施済み申告の照合（宣言と実体の照合）
  const acceptedEvidence = new Map<string, string>();
  for (const declaration of completedTools ?? []) {
    const toolName = declaration.toolName;
    if (!registeredToolNames.includes(toolName)) {
      warnings.push(`[high] 実施済み申告のツール名が本MCPに存在しない: ${toolName}`);
      continue;
    }
    const evidence = (declaration.evidence ?? "").trim();
    if (evidence === "") {
      warnings.push(`[high] 実施済み申告に証跡(evidence)がないため未実施として扱う: ${toolName}`);
      continue;
    }
    if (!candidateNames.has(toolName)) {
      warnings.push(`[info] 実施済み申告のツールは本ツールの後続候補ではない: ${toolName}`);
      continue;
    }
    acceptedEvidence.set(toolName, evidence);
  }

  const pending: NextToolRow[] = [];
  const done: NextToolRow[] = [];
  for (const toolName of order) {
    const entry = merged.get(toolName)!;
    const evidence = acceptedEvidence.get(toolName);
    if (evidence !== undefined) {
      done.push({ status: "実施済み", toolName, reason: `実施済み申告（証跡: ${evidence}）` });
      continue;
    }
    const reason =
      entry.extras.length > 0 ? `${entry.reason}（${entry.extras.join(" / ")}）` : entry.reason;
    pending.push({ status: "未実施", toolName, reason });
  }

  return { rows: [...pending, ...done], warnings };
}

/** 「次に実行すべきツール」節を行群として描画する（末尾に改行は含まない）。 */
export function renderNextToolsSection(
  sourceToolName: string,
  signals: readonly string[],
  completedTools?: readonly CompletedToolDeclaration[],
  extraEntries?: readonly NextToolCatalogEntry[]
): string {
  const { rows, warnings } = resolveNextTools(sourceToolName, signals, completedTools, extraEntries);
  const lines: string[] = [];
  lines.push("## 次に実行すべきツール");
  lines.push("");
  if (rows.length === 0) {
    lines.push("- 提示対象の後続ツールはない。");
    for (const w of warnings) lines.push(`- ${w}`);
    return lines.join("\n");
  }
  lines.push("| 実行状態 | ツール名 | 提示理由 |");
  lines.push("| --- | --- | --- |");
  for (const row of rows) {
    lines.push(`| ${row.status} | ${escapeCell(row.toolName)} | ${escapeCell(row.reason)} |`);
  }
  lines.push("");
  const pendingCount = rows.filter((r) => r.status === "未実施").length;
  lines.push(`- 未実施: ${pendingCount}件 / 実施済み: ${rows.length - pendingCount}件`);
  for (const w of warnings) lines.push(`- ${w}`);
  lines.push(
    "- 未実施の後続ツールが残ったまま成果物を確定しないこと。この節は本ツールが静的に保持する後続表と生成物の内容から機械的に生成している。"
  );
  return lines.join("\n");
}
