import { z } from "zod";
import { nextToolCatalog, registeredToolNames } from "./resources/nextToolCatalog.js";
import { toolOutputSignatures, type ToolOutputSignature } from "./resources/toolOutputSignatures.js";
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
          .describe(
            "Evidence of execution: an output file path (e.g. docs/test-cases.md) or an output heading line starting with '#'"
          ),
        outputExcerpt: z
          .string()
          .optional()
          .describe(
            "Excerpt of the declared tool's actual output text. Must contain that tool's own H1 heading line; otherwise the declaration is reported as evidence-unverified and still counted as not executed"
          ),
      })
    )
    .optional()
    .describe("Already executed tools; entries without evidence are treated as not executed"),
} as const;

const EVIDENCE_PATH_RE = /^[^\s]+\.(md|markdown|txt|json|ya?ml|csv)$/i;
const EVIDENCE_HEADING_RE = /^#{1,6}\s*\S/;

function hasSignatureHeading(excerpt: string, sig: ToolOutputSignature): boolean {
  for (const raw of excerpt.split("\n")) {
    const line = raw.trim();
    if (sig.prefix ? line.startsWith(sig.heading) : line === sig.heading) return true;
  }
  return false;
}

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
  const verifiedEvidence = new Map<string, string>();
  const unverifiedEvidence = new Map<string, string>();
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
    const isReferenceForm =
      EVIDENCE_HEADING_RE.test(evidence) ||
      EVIDENCE_PATH_RE.test(evidence) ||
      (/[/\\]/.test(evidence) && !/\s/.test(evidence));
    if (!isReferenceForm) {
      warnings.push(
        `[high] 実施済み申告の証跡がファイルパスまたは見出しの形式でないため未実施として扱う: ${toolName}（証跡: ${evidence}）`
      );
      continue;
    }
    if (!candidateNames.has(toolName)) {
      warnings.push(`[info] 実施済み申告のツールは本ツールの後続候補ではない: ${toolName}`);
      continue;
    }
    const sig = toolOutputSignatures[toolName];
    const excerpt = (declaration.outputExcerpt ?? "").trim();
    if (sig !== undefined && excerpt !== "" && hasSignatureHeading(excerpt, sig)) {
      verifiedEvidence.set(toolName, evidence);
    } else {
      unverifiedEvidence.set(toolName, evidence);
      warnings.push(
        `[medium] 実施済み申告の証跡を成果物本文と照合できないため未実施として扱う: ${toolName}` +
          `（outputExcerpt に見出し行「${sig?.heading ?? "(署名未定義)"}」が必要）`
      );
    }
  }

  const pending: NextToolRow[] = [];
  const unverified: NextToolRow[] = [];
  const done: NextToolRow[] = [];
  for (const toolName of order) {
    const entry = merged.get(toolName)!;
    const verified = verifiedEvidence.get(toolName);
    if (verified !== undefined) {
      done.push({ status: "実施済み", toolName, reason: `実施済み申告（証跡: ${verified}）` });
      continue;
    }
    const unverifiedEv = unverifiedEvidence.get(toolName);
    if (unverifiedEv !== undefined) {
      unverified.push({
        status: "実施済み(証跡未照合)",
        toolName,
        reason: `実施済み申告（証跡: ${unverifiedEv}）だが成果物本文と照合できないため未実施として扱う`,
      });
      continue;
    }
    const reason =
      entry.extras.length > 0 ? `${entry.reason}（${entry.extras.join(" / ")}）` : entry.reason;
    pending.push({ status: "未実施", toolName, reason });
  }

  return { rows: [...pending, ...unverified, ...done], warnings };
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
  const unverifiedCount = rows.filter((r) => r.status === "実施済み(証跡未照合)").length;
  const doneCount = rows.filter((r) => r.status === "実施済み").length;
  const pendingCount = rows.length - doneCount;
  lines.push(
    `- 未実施: ${pendingCount}件（うち実施済み申告だが証跡未照合: ${unverifiedCount}件） / 実施済み: ${doneCount}件`
  );
  for (const w of warnings) lines.push(`- ${w}`);
  if (signals.length > 0) {
    lines.push(
      `- 未実施の後続ツールが残ったまま成果物を確定しないこと。この節は本ツールが静的に保持する後続表と、生成物から機械的に導いたシグナル（${signals.join(", ")}）から生成している。`
    );
  } else {
    lines.push(
      "- 未実施の後続ツールが残ったまま成果物を確定しないこと。この節は本ツールが静的に保持する後続表のみから生成しており、生成物の内容に依存する後続提示はない。"
    );
  }
  return lines.join("\n");
}
