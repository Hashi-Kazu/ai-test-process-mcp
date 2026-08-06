import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  BoundaryValueMode,
  CompletedToolDeclaration,
  BoundaryValueRow,
  BoundaryVariableSpec,
} from "../types.js";

export const designBoundaryValuesInputShape = {
  ...completedToolsInputShape,
  variables: z
    .array(
      z.object({
        name: z.string().describe("変数・パラメータ名"),
        min: z.number().describe("有効範囲の下限（境界値）"),
        max: z.number().describe("有効範囲の上限（境界値）"),
        valueType: z.enum(["int", "decimal"]).optional().describe("既定 int"),
        step: z.number().positive().optional().describe("刻み幅。既定 int=1 / decimal=0.1"),
      })
    )
    .min(1)
    .describe("境界値分析の対象変数"),
  mode: z.enum(["two", "three"]).optional().describe("2値/3値。既定 three"),
} as const;

const designBoundaryValuesInputSchema = z.object(designBoundaryValuesInputShape);
export type DesignBoundaryValuesInput = z.infer<typeof designBoundaryValuesInputSchema>;

function decimalPlaces(value: number): number {
  const str = value.toString();
  if (str.includes("e") || str.includes("E")) {
    // Fallback for exponential notation; unlikely for step values in practice.
    const match = /e-(\d+)/i.exec(str);
    return match ? parseInt(match[1], 10) : 0;
  }
  const dotIndex = str.indexOf(".");
  return dotIndex === -1 ? 0 : str.length - dotIndex - 1;
}

function roundTo(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function formatValue(value: number, valueType: "int" | "decimal", digits: number): string {
  if (valueType === "decimal") return value.toFixed(digits);
  return String(value);
}

interface VariableResult {
  name: string;
  valueType: "int" | "decimal";
  min: number;
  max: number;
  step: number;
  error?: string;
  rows: BoundaryValueRow[];
}

function computeVariable(spec: BoundaryVariableSpec, mode: BoundaryValueMode): VariableResult {
  const valueType = spec.valueType ?? "int";
  const step = spec.step ?? (valueType === "decimal" ? 0.1 : 1);
  const digits = valueType === "decimal" ? decimalPlaces(step) : 0;

  if (spec.min > spec.max) {
    return {
      name: spec.name,
      valueType,
      min: spec.min,
      max: spec.max,
      step,
      error: `${spec.name}: min が max を上回るため境界を列挙できません`,
      rows: [],
    };
  }

  const round = (v: number) => (valueType === "decimal" ? roundTo(v, digits) : v);

  const candidates: { value: number; label: string }[] =
    mode === "three"
      ? [
          { value: round(spec.min - step), label: "下限-刻み" },
          { value: round(spec.min), label: "下限" },
          { value: round(spec.min + step), label: "下限+刻み" },
          { value: round(spec.max - step), label: "上限-刻み" },
          { value: round(spec.max), label: "上限" },
          { value: round(spec.max + step), label: "上限+刻み" },
        ]
      : [
          { value: round(spec.min - step), label: "下限-刻み" },
          { value: round(spec.min), label: "下限" },
          { value: round(spec.max), label: "上限" },
          { value: round(spec.max + step), label: "上限+刻み" },
        ];

  const seen = new Set<number>();
  const rows: BoundaryValueRow[] = [];
  for (const c of candidates) {
    if (seen.has(c.value)) continue;
    seen.add(c.value);
    const validity: "valid" | "invalid" = c.value >= spec.min && c.value <= spec.max ? "valid" : "invalid";
    rows.push({ variable: spec.name, value: c.value, label: c.label, validity });
  }

  return { name: spec.name, valueType, min: spec.min, max: spec.max, step, rows };
}

export interface BoundaryVariableComputedRows {
  name: string;
  valueType: "int" | "decimal";
  min: number;
  max: number;
  step: number;
  error?: string;
  rows: BoundaryValueRow[];
}

// designBoundaryValues 以外（testCaseAnalysis 等）から境界値の行を再利用するための export。
// 境界の刻み・丸め・ラベル決定ロジックはここに閉じ込め、他モジュールでは再実装しない。
export function computeBoundaryRows(
  variables: BoundaryVariableSpec[],
  mode: BoundaryValueMode = "three"
): BoundaryVariableComputedRows[] {
  return variables.map((v) => computeVariable(v, mode));
}

export function renderBoundaryValues(input: {
  variables: BoundaryVariableSpec[];
  mode?: BoundaryValueMode;
  completedTools?: CompletedToolDeclaration[];
}): string {
  const mode = input.mode ?? "three";
  const results = input.variables.map((v) => computeVariable(v, mode));

  const lines: string[] = [];
  lines.push("# 境界値分析結果");
  lines.push("");
  lines.push(
    `- 方式: ${mode === "three" ? "3値境界（各境界の内側/境界/外側）" : "2値境界（境界/外側）"}`
  );
  lines.push("");

  let totalValid = 0;
  let totalInvalid = 0;
  let totalCases = 0;

  for (const result of results) {
    const digits = result.valueType === "decimal" ? decimalPlaces(result.step) : 0;
    lines.push(
      `## ${result.name}（型: ${result.valueType}, 範囲: ${result.min}〜${result.max}, 刻み: ${result.step}）`
    );
    lines.push("");

    if (result.error) {
      lines.push(`- ${result.error}`);
      lines.push("");
      continue;
    }

    lines.push("| 値 | 種別 | 有効/無効 |");
    lines.push("| --- | --- | --- |");
    for (const row of result.rows) {
      const valueText = formatValue(row.value, result.valueType, digits);
      const validityText = row.validity === "valid" ? "有効" : "無効";
      lines.push(`| ${valueText} | ${row.label} | ${validityText} |`);
      totalCases += 1;
      if (row.validity === "valid") totalValid += 1;
      else totalInvalid += 1;
    }
    lines.push("");
  }

  lines.push("## サマリ");
  lines.push("");
  lines.push(`- 総ケース数: ${totalCases}`);
  lines.push(`- 有効: ${totalValid} 件 / 無効: ${totalInvalid} 件`);

  const boundaryValueSignals: string[] = [];
  if (results.some((r) => r.error)) {
    boundaryValueSignals.push("has-invalid-variables");
  }
  lines.push(
    ...renderNextToolsSection(
      "design_boundary_values",
      boundaryValueSignals,
      input.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

export function registerDesignBoundaryValuesTool(server: McpServer): void {
  server.registerTool(
    "design_boundary_values",
    {
      title: "Design Boundary Values",
      description:
        "変数の有効範囲（下限・上限・刻み・型）から2値/3値の境界値を決定的に列挙し、有効/無効判定付きのMarkdown表で返す。既存の変数定義を variables に渡せば、既存テストケースが境界値を網羅しているかのレビューにも使える。",
      inputSchema: designBoundaryValuesInputShape,
    },
    async (input) => {
      const text = renderBoundaryValues(input as DesignBoundaryValuesInput);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
