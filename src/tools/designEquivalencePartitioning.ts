import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EquivalencePartitioningVariableSpec } from "../types.js";

const classShape = z.object({
  label: z.string().describe("クラス名"),
  representative: z.string().describe("代表値"),
  description: z.string().optional(),
});

export const designEquivalencePartitioningInputShape = {
  variables: z
    .array(
      z.object({
        name: z.string(),
        validClasses: z.array(classShape).min(1).describe("有効同値クラス"),
        invalidClasses: z.array(classShape).optional().describe("無効同値クラス"),
      })
    )
    .min(1),
} as const;

const designEquivalencePartitioningInputSchema = z.object(designEquivalencePartitioningInputShape);
export type DesignEquivalencePartitioningInput = z.infer<
  typeof designEquivalencePartitioningInputSchema
>;

export interface EquivalenceClassEntry {
  variable: string;
  kind: "valid" | "invalid";
  label: string;
  representative: string;
}

// designEquivalencePartitioning 以外（testCaseAnalysis 等）から同値クラス一覧を
// 再利用するための export。クラス列挙ロジックはここに閉じ込め、他モジュールでは再実装しない。
export function listEquivalenceClasses(
  variables: EquivalencePartitioningVariableSpec[]
): EquivalenceClassEntry[] {
  const result: EquivalenceClassEntry[] = [];
  for (const v of variables) {
    for (const cls of v.validClasses) {
      result.push({ variable: v.name, kind: "valid", label: cls.label, representative: cls.representative });
    }
    for (const cls of v.invalidClasses ?? []) {
      result.push({ variable: v.name, kind: "invalid", label: cls.label, representative: cls.representative });
    }
  }
  return result;
}

export function renderEquivalencePartitioning(input: {
  variables: EquivalencePartitioningVariableSpec[];
}): string {
  const { variables } = input;

  const lines: string[] = [];
  lines.push("# 同値分割結果");
  lines.push("");

  // --- 1. 同値クラス一覧 ---
  lines.push("## 1. 同値クラス一覧");
  lines.push("");
  lines.push("| 変数 | 区分 | クラス | 代表値 | 説明 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const v of variables) {
    for (const cls of v.validClasses) {
      lines.push(`| ${v.name} | 有効 | ${cls.label} | ${cls.representative} | ${cls.description ?? "-"} |`);
    }
    for (const cls of v.invalidClasses ?? []) {
      lines.push(`| ${v.name} | 無効 | ${cls.label} | ${cls.representative} | ${cls.description ?? "-"} |`);
    }
  }
  lines.push("");

  // --- 2. テストケース生成 ---
  const usedValid = new Map<string, Set<number>>(); // variable name -> set of used valid class indices
  const usedInvalid = new Map<string, Set<number>>();
  for (const v of variables) {
    usedValid.set(v.name, new Set());
    usedInvalid.set(v.name, new Set());
  }

  const n = Math.max(...variables.map((v) => v.validClasses.length));
  interface CaseRow {
    values: string[];
    expected: string;
  }
  const validCases: CaseRow[] = [];
  for (let i = 0; i < n; i++) {
    const values: string[] = [];
    for (const v of variables) {
      const idx = Math.min(i, v.validClasses.length - 1);
      usedValid.get(v.name)!.add(idx);
      values.push(v.validClasses[idx].representative);
    }
    validCases.push({ values, expected: "有効（正常系）" });
  }

  const invalidCases: CaseRow[] = [];
  for (const target of variables) {
    for (let idx = 0; idx < (target.invalidClasses ?? []).length; idx++) {
      const invalidClass = (target.invalidClasses ?? [])[idx];
      usedInvalid.get(target.name)!.add(idx);
      const values = variables.map((v) =>
        v.name === target.name ? invalidClass.representative : v.validClasses[0].representative
      );
      invalidCases.push({ values, expected: `無効（${target.name} が ${invalidClass.label}）` });
    }
  }

  lines.push("## 2. テストケース");
  lines.push("");
  const header = ["#", ...variables.map((v) => v.name), "期待結果"];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  let caseNo = 1;
  for (const c of [...validCases, ...invalidCases]) {
    lines.push(`| ${caseNo} | ${c.values.join(" | ")} | ${c.expected} |`);
    caseNo += 1;
  }
  lines.push("");

  // --- 3. 被覆状況 ---
  let totalValid = 0;
  let totalInvalid = 0;
  let coveredValid = 0;
  let coveredInvalid = 0;
  const uncovered: string[] = [];
  for (const v of variables) {
    totalValid += v.validClasses.length;
    const usedV = usedValid.get(v.name)!;
    coveredValid += usedV.size;
    v.validClasses.forEach((cls, idx) => {
      if (!usedV.has(idx)) uncovered.push(`${v.name} / 有効 / ${cls.label}`);
    });

    const invalidClasses = v.invalidClasses ?? [];
    totalInvalid += invalidClasses.length;
    const usedI = usedInvalid.get(v.name)!;
    coveredInvalid += usedI.size;
    invalidClasses.forEach((cls, idx) => {
      if (!usedI.has(idx)) uncovered.push(`${v.name} / 無効 / ${cls.label}`);
    });
  }

  const totalClasses = totalValid + totalInvalid;
  const coveredClasses = coveredValid + coveredInvalid;
  const uncoveredCount = totalClasses - coveredClasses;

  lines.push("## 3. 被覆状況");
  lines.push("");
  lines.push(`- 総クラス数: ${totalClasses}（有効 ${totalValid} / 無効 ${totalInvalid}）`);
  lines.push(`- 被覆済み: ${coveredClasses}`);
  lines.push(`- 未被覆: ${uncoveredCount}`);
  if (uncoveredCount > 0) {
    for (const u of uncovered) {
      lines.push(`  - ${u}`);
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function registerDesignEquivalencePartitioningTool(server: McpServer): void {
  server.registerTool(
    "design_equivalence_partitioning",
    {
      title: "Design Equivalence Partitioning",
      description:
        "変数ごとの有効/無効同値クラスから代表値ベースのテストケースを決定的に生成し、全クラス被覆チェック付きのMarkdown表で返す。",
      inputSchema: designEquivalencePartitioningInputShape,
    },
    async (input) => {
      const text = renderEquivalencePartitioning(input as DesignEquivalencePartitioningInput);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
