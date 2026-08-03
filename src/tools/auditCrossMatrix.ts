import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { crossMatrixAuditCriteria } from "../resources/crossMatrixAuditCriteria.js";
import { analyzeCrossMatrix, itemLabel } from "../crossMatrixAnalysis.js";
import {
  buildDocumentDigests,
  findDocumentDigestFindings,
  renderDocumentDigestLines,
} from "../documentDigest.js";
import type {
  AuditCrossMatrixInput,
  CrossMatrixAuditCriteria,
  CrossMatrixAxisItem,
  CrossMatrixAxisSpec,
  CrossMatrixCell,
  CrossMatrixEmptyLine,
  CrossMatrixPairResult,
} from "../types.js";

const MATRIX_ROW_RENDER_LIMIT = 50;
const MATRIX_COLUMN_RENDER_LIMIT = 30;
const EMPTY_LINE_RENDER_LIMIT = 50;
const FINDING_RENDER_LIMIT = 50;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function cellMark(cell: CrossMatrixCell | undefined): string {
  if (cell === undefined) return "";
  if (cell.state !== "filled") return "";
  return cell.direction === "both" ? "○" : "△";
}

function findAxis(axes: CrossMatrixAxisSpec[], axisId: string): CrossMatrixAxisSpec | undefined {
  return axes.find((axis) => axis.axisId === axisId);
}

function renderPairMatrix(
  lines: string[],
  pair: CrossMatrixPairResult,
  axes: CrossMatrixAxisSpec[]
): void {
  if (!pair.generated) {
    lines.push(`- ${pair.skipReason ?? "この軸ペアの直積表を生成しなかった。"}`);
    return;
  }

  const rows: CrossMatrixAxisItem[] = findAxis(axes, pair.axisA)?.items ?? [];
  const columns: CrossMatrixAxisItem[] = findAxis(axes, pair.axisB)?.items ?? [];
  if (rows.length === 0 || columns.length === 0) {
    lines.push("- 行要素または列要素が0件のため、直積表を描画できない。");
    return;
  }

  const cellByKey = new Map<string, CrossMatrixCell>();
  for (const cell of pair.cells) {
    cellByKey.set(`${cell.rowItemId}::${cell.columnItemId}`, cell);
  }

  const shownRows = rows.slice(0, MATRIX_ROW_RENDER_LIMIT);
  const shownColumns = columns.slice(0, MATRIX_COLUMN_RENDER_LIMIT);

  lines.push(
    `| ${escapeCell(pair.axisAName)} \\ ${escapeCell(pair.axisBName)} | ${shownColumns
      .map((col) => escapeCell(itemLabel(col)))
      .join(" | ")} |`
  );
  lines.push(`| --- | ${shownColumns.map(() => "---").join(" | ")} |`);
  for (const row of shownRows) {
    const cells = shownColumns.map((col) =>
      cellMark(cellByKey.get(`${row.id}::${col.id}`))
    );
    lines.push(`| ${escapeCell(itemLabel(row))} | ${cells.join(" | ")} |`);
  }
  if (rows.length > shownRows.length || columns.length > shownColumns.length) {
    lines.push("");
    lines.push(
      `- 表示は先頭 ${shownRows.length} 行 × ${shownColumns.length} 列の抜粋(全 ${rows.length} 行 × ${columns.length} 列)`
    );
  }
}

function renderEmptyLines(lines: string[], entries: CrossMatrixEmptyLine[], kind: "row" | "column"): void {
  const targets = entries.filter((entry) => !entry.excluded);
  if (targets.length === 0) {
    lines.push("- なし");
    return;
  }
  const suffix = kind === "row" ? "のどの要素とも紐づいていない(空行)。" : "のどの要素とも紐づいていない(空列)。";
  for (const entry of targets.slice(0, EMPTY_LINE_RENDER_LIMIT)) {
    lines.push(
      `- [high] ${escapeCell(entry.axisId)} ${escapeCell(entry.itemId)}(${escapeCell(
        entry.label
      )}) : ${escapeCell(entry.pairedAxisId)} ${suffix}`
    );
  }
  if (targets.length > EMPTY_LINE_RENDER_LIMIT) {
    lines.push(`- 他 ${targets.length - EMPTY_LINE_RENDER_LIMIT} 件`);
  }
}

export function renderCrossMatrixAudit(
  input: AuditCrossMatrixInput,
  criteria: CrossMatrixAuditCriteria = crossMatrixAuditCriteria
): string {
  const result = analyzeCrossMatrix(input);
  const { axes, pairs, isolatedItems, findings, summary } = result;

  const lines: string[] = [];
  lines.push("# 多軸マトリクス監査結果");
  lines.push("");

  lines.push("## 1. 監査対象");
  lines.push("");
  lines.push("### 1.1 投入された軸");
  lines.push("");
  lines.push("| 軸ID | 軸名 | 要素数 |");
  lines.push("| --- | --- | --- |");
  for (const axis of axes) {
    lines.push(`| ${escapeCell(axis.axisId)} | ${escapeCell(axis.axisName)} | ${axis.items.length} |`);
  }
  lines.push("");

  if (input.documents && input.documents.length > 0) {
    const digestRows = buildDocumentDigests(input.documents, { idPatterns: input.idPatterns });
    const digestFindings = findDocumentDigestFindings(digestRows);
    lines.push("### 1.2 投入されたテストベース文書");
    lines.push("");
    for (const l of renderDocumentDigestLines(digestRows, digestFindings)) lines.push(l);
    lines.push("");
  }

  lines.push("### 1.3 監査対象の軸ペア");
  lines.push("");
  lines.push("| No | 行軸 | 列軸 | セル数 | 生成 |");
  lines.push("| --- | --- | --- | --- | --- |");
  if (pairs.length === 0) {
    lines.push("| - | - | - | - | - |");
  }
  pairs.forEach((pair, index) => {
    lines.push(
      `| ${index + 1} | ${escapeCell(pair.axisAName)}(${escapeCell(pair.axisA)}) | ${escapeCell(
        pair.axisBName
      )}(${escapeCell(pair.axisB)}) | ${pair.totalCellCount} | ${pair.generated ? "生成" : "スキップ"} |`
    );
  });
  lines.push("");

  lines.push("## 2. 決定的検査(自動)");
  lines.push("");

  lines.push("### 2.1 軸ペアごとの直積表");
  lines.push("");
  if (pairs.length === 0) {
    lines.push("- なし");
    lines.push("");
  }
  pairs.forEach((pair, index) => {
    lines.push(`#### 2.1.${index + 1} ${escapeCell(pair.axisAName)} × ${escapeCell(pair.axisBName)}`);
    lines.push("");
    renderPairMatrix(lines, pair, axes);
    lines.push("");
  });

  lines.push("### 2.2 空行一覧");
  lines.push("");
  {
    const allEmptyRows: CrossMatrixEmptyLine[] = [];
    for (const pair of pairs) allEmptyRows.push(...pair.emptyRows);
    renderEmptyLines(lines, allEmptyRows, "row");
  }
  lines.push("");

  lines.push("### 2.3 空列一覧");
  lines.push("");
  {
    const allEmptyColumns: CrossMatrixEmptyLine[] = [];
    for (const pair of pairs) allEmptyColumns.push(...pair.emptyColumns);
    renderEmptyLines(lines, allEmptyColumns, "column");
  }
  lines.push("");

  lines.push("### 2.4 片方向のみの紐づけ");
  lines.push("");
  {
    const asymmetric = findings.filter((f) => f.categoryId === "CMX-06");
    if (asymmetric.length === 0) {
      lines.push("- なし");
    } else {
      for (const f of asymmetric.slice(0, FINDING_RENDER_LIMIT)) {
        lines.push(`- [${f.severity}] ${escapeCell(f.target)} : ${escapeCell(f.detail)}`);
      }
      if (asymmetric.length > FINDING_RENDER_LIMIT) {
        lines.push(`- 他 ${asymmetric.length - FINDING_RENDER_LIMIT} 件`);
      }
    }
  }
  lines.push("");

  lines.push("### 2.5 除外宣言された空行・空列");
  lines.push("");
  {
    const excludedLines: CrossMatrixEmptyLine[] = [];
    for (const pair of pairs) {
      for (const line of pair.emptyRows) if (line.excluded) excludedLines.push(line);
      for (const line of pair.emptyColumns) if (line.excluded) excludedLines.push(line);
    }
    if (excludedLines.length === 0) {
      lines.push("- なし");
    } else {
      for (const line of excludedLines.slice(0, EMPTY_LINE_RENDER_LIMIT)) {
        lines.push(
          `- [info] ${escapeCell(line.axisId)} ${escapeCell(line.itemId)}(${escapeCell(
            line.label
          )}) × ${escapeCell(line.pairedAxisId)} : ${escapeCell(
            line.exclusionReason !== undefined && line.exclusionReason !== ""
              ? line.exclusionReason
              : "(理由未記入)"
          )}`
        );
      }
      if (excludedLines.length > EMPTY_LINE_RENDER_LIMIT) {
        lines.push(`- 他 ${excludedLines.length - EMPTY_LINE_RENDER_LIMIT} 件`);
      }
    }
  }
  lines.push("");

  lines.push("### 2.6 軸ペアごとの充填率");
  lines.push("");
  lines.push(
    "| 行軸 | 列軸 | 行数 | 列数 | 全セル数 | 充填セル数 | 充填率(%) | 対象行数 | 空行数 | 行被覆率(%) | 対象列数 | 空列数 | 列被覆率(%) |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const pair of pairs) {
    const emptyRowCount = pair.emptyRows.filter((line) => !line.excluded).length;
    const emptyColumnCount = pair.emptyColumns.filter((line) => !line.excluded).length;
    lines.push(
      `| ${escapeCell(pair.axisAName)} | ${escapeCell(pair.axisBName)} | ${pair.rowCount} | ${
        pair.columnCount
      } | ${pair.totalCellCount} | ${pair.filledCellCount} | ${pair.cellFillRatePercent} | ${
        pair.targetRowCount
      } | ${emptyRowCount} | ${pair.rowCoverageRatePercent} | ${pair.targetColumnCount} | ${emptyColumnCount} | ${
        pair.columnCoverageRatePercent
      } |`
    );
  }
  lines.push("");
  lines.push(
    "- 充填率の分母は 行数 × 列数(意味的に成立し得ないセルを含む)。行被覆率・列被覆率の分母は除外宣言された要素を除いた対象要素数であり、全要素数ではない。"
  );
  lines.push("");

  lines.push("### 2.7 宣言充填率との照合");
  lines.push("");
  {
    const mismatches = findings.filter((f) => f.categoryId === "CMX-08");
    if (!input.declaredCoverage || input.declaredCoverage.length === 0) {
      lines.push("- declaredCoverage が未指定のため宣言値との照合を行えない(要確認)");
    } else if (mismatches.length === 0) {
      lines.push("- なし");
    } else {
      for (const f of mismatches.slice(0, FINDING_RENDER_LIMIT)) {
        lines.push(`- [${f.severity}] ${escapeCell(f.target)} : ${escapeCell(f.detail)}`);
      }
      if (mismatches.length > FINDING_RENDER_LIMIT) {
        lines.push(`- 他 ${mismatches.length - FINDING_RENDER_LIMIT} 件`);
      }
    }
  }
  lines.push("");

  lines.push("### 2.8 軸母集団の裏付け");
  lines.push("");
  {
    const shrinkage = findings.filter((f) => f.categoryId === "CMX-09");
    if (!input.expectedAxisPopulations || input.expectedAxisPopulations.length === 0) {
      lines.push("- expectedAxisPopulations が未指定のため母集団縮退を検出できない(要確認)");
    } else if (shrinkage.length === 0) {
      lines.push("- 母集団の差分なし");
    } else {
      for (const f of shrinkage.slice(0, FINDING_RENDER_LIMIT)) {
        lines.push(`- [${f.severity}] ${escapeCell(f.target)} : ${escapeCell(f.detail)}`);
      }
      if (shrinkage.length > FINDING_RENDER_LIMIT) {
        lines.push(`- 他 ${shrinkage.length - FINDING_RENDER_LIMIT} 件`);
      }
    }

    const grounding = findings.filter((f) => f.categoryId === "CMX-10" || f.categoryId === "CMX-11");
    if (!input.documents || input.documents.length === 0) {
      lines.push("- documents が未指定のためテストベース本文との裏付け照合を行えない(要確認)");
    } else if (grounding.length === 0) {
      lines.push("- 本文裏付けの欠落なし");
    } else {
      for (const f of grounding.slice(0, FINDING_RENDER_LIMIT)) {
        lines.push(`- [${f.severity}] ${escapeCell(f.categoryId)} ${escapeCell(f.target)} : ${escapeCell(f.detail)}`);
      }
      if (grounding.length > FINDING_RENDER_LIMIT) {
        lines.push(`- 他 ${grounding.length - FINDING_RENDER_LIMIT} 件`);
      }
    }
  }
  lines.push("");

  lines.push("### 2.9 完全孤立要素");
  lines.push("");
  if (isolatedItems.length === 0) {
    lines.push("- なし");
  } else {
    for (const item of isolatedItems.slice(0, EMPTY_LINE_RENDER_LIMIT)) {
      lines.push(
        `- [high] ${escapeCell(item.axisId)} ${escapeCell(item.itemId)}(${escapeCell(
          item.label
        )}) : 他のどの軸の要素とも1件も紐づいていない。`
      );
    }
    if (isolatedItems.length > EMPTY_LINE_RENDER_LIMIT) {
      lines.push(`- 他 ${isolatedItems.length - EMPTY_LINE_RENDER_LIMIT} 件`);
    }
  }
  lines.push("");

  lines.push("### 2.10 検出事項一覧");
  lines.push("");
  if (findings.length === 0) {
    lines.push("- なし");
  } else {
    lines.push("| 区分ID | 重大度 | 対象 | 内容 |");
    lines.push("| --- | --- | --- | --- |");
    for (const f of findings.slice(0, FINDING_RENDER_LIMIT)) {
      lines.push(
        `| ${escapeCell(f.categoryId)} | ${f.severity} | ${escapeCell(f.target)} | ${escapeCell(f.detail)} |`
      );
    }
    if (findings.length > FINDING_RENDER_LIMIT) {
      lines.push("");
      lines.push(`- 他 ${findings.length - FINDING_RENDER_LIMIT} 件`);
    }
  }
  lines.push("");

  lines.push("### 2.11 サマリ");
  lines.push("");
  lines.push(
    `- 軸数: ${summary.axisCount} / 軸ペア数: ${summary.pairCount} / 生成済みペア数: ${summary.generatedPairCount} / 要素総数: ${summary.totalItemCount} / 完全孤立要素数: ${summary.isolatedItemCount} / 空行数: ${summary.emptyRowTotal} / 空列数: ${summary.emptyColumnTotal} / 除外宣言数: ${summary.excludedLineTotal} / 全体充填率: ${summary.overallCellFillRatePercent}% / 検出事項数: ${summary.findingTotal}(うち high ${summary.highFindingTotal})`
  );
  lines.push("");

  lines.push("## 3. 判定区分と対処指針");
  lines.push("");
  lines.push("| 区分ID | 区分 | 重大度 | 説明 | 対処 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const c of criteria.categories) {
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.nameJa)} | ${c.severity} | ${escapeCell(
        c.definition
      )} | ${escapeCell(c.recommendedAction)} |`
    );
  }
  lines.push("");
  for (const note of criteria.notes) {
    lines.push(`- ${escapeCell(note)}`);
  }
  lines.push("");

  lines.push("## 4. 意味的確認の指示(意味的層)");
  lines.push("");
  lines.push(
    "- 2.2/2.3 の空行・空列が、実際に関係が存在しない正当な空白なのか、テスト分析の抜けなのかを判断すること。"
  );
  lines.push(
    "- 抜けであればテスト分析を再実施して不足要素を追加し、正当な空白であれば exclusions に理由を明記して再実行すること。"
  );
  lines.push(
    "- 2.6 の充填率は意味的に成立し得ないセルを分母に含む。率の絶対値ではなく、空行・空列の有無で判断すること。"
  );
  lines.push(
    "- 2.8 で母集団の縮退が検出された場合、充填率は見かけの値である。欠落IDを軸へ戻して再監査すること。"
  );
  lines.push(
    "- 2.9 の完全孤立要素は、他のどの軸ともつながらない要素である。上流の分析成果物に立ち戻って所属を確認すること。"
  );
  lines.push("");

  lines.push(
    ...renderNextToolsSection(
      "audit_cross_matrix",
      summary.emptyRowTotal > 0 || summary.emptyColumnTotal > 0 ? ["has-empty-cells"] : [],
      input.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

export const auditCrossMatrixInputShape = {
  ...completedToolsInputShape,
  axes: z
    .array(
      z.object({
        axisId: z.string().describe("Axis id, unique across axes, e.g. RISK / PERSPECTIVE / PERSONA"),
        axisName: z.string().describe("Axis display name, e.g. プロダクトリスク"),
        items: z
          .array(
            z.object({
              id: z.string().describe("Item id, unique across all axes"),
              label: z.string().optional().describe("Display label; defaults to id"),
              links: z
                .array(z.string())
                .optional()
                .describe(
                  "Ids of items on other axes this item is linked to; links are treated as undirected"
                ),
            })
          )
          .describe("Items on this axis"),
      })
    )
    .min(2)
    .describe("Two or more axes to be crossed; axes are plain input data, no axis-kind specific behavior"),
  axisPairs: z
    .array(z.object({ axisA: z.string(), axisB: z.string() }))
    .optional()
    .describe("Axis pairs to audit; when omitted, all i<j combinations of axes are audited"),
  declaredCoverage: z
    .array(
      z.object({
        axisA: z.string(),
        axisB: z.string(),
        claimedFillRatePercent: z.number().optional(),
        claimedRowCoveragePercent: z.number().optional(),
        claimedColumnCoveragePercent: z.number().optional(),
        claimedNoEmptyCells: z.boolean().optional(),
        note: z.string().optional(),
      })
    )
    .optional()
    .describe("Coverage figures already claimed in the deliverable, cross-checked against the computed values"),
  exclusions: z
    .array(
      z.object({
        axisId: z.string(),
        itemId: z.string(),
        pairedAxisId: z
          .string()
          .optional()
          .describe("Limit the exclusion to the pair with this axis; omit to apply to all pairs"),
        reason: z
          .string()
          .optional()
          .describe(
            "Why this item is intentionally allowed to be an empty row/column; leaving it empty is flagged as CMX-07[high]"
          ),
      })
    )
    .optional(),
  expectedAxisPopulations: z
    .array(z.object({ axisId: z.string(), ids: z.array(z.string()) }))
    .optional()
    .describe("Full expected id population per axis, used to detect axis shrinkage that inflates fill rates"),
  documents: z
    .array(z.object({ name: z.string(), content: z.string() }))
    .optional()
    .describe(
      "Test basis documents used to substantiate axis items and to detect defined ids missing from every axis"
    ),
  idPatterns: z
    .array(z.string())
    .optional()
    .describe("Additional ID regular expression patterns, appended to the default pattern"),
  maxCellCount: z.number().int().positive().optional().describe("Per-pair cell count cap (default 20000)"),
} as const;

export function registerAuditCrossMatrixTool(server: McpServer): void {
  server.registerTool(
    "audit_cross_matrix",
    {
      title: "Audit Cross Matrix",
      description:
        "任意の2軸以上(プロダクトリスク／テスト観点カテゴリ／ペルソナ／機能ID／シナリオ／テストコンテナ／パラメータ／テストタイプなど)を汎用の軸データとして受け取り、" +
        "軸ペアの直積表を決定的に生成して、空行・空列(片側にしかない要素)を列挙する。3軸以上なら全組合せの軸ペアを一括で回す。" +
        "充填率は分母を明示して算出し、軸母集団の縮退とテストベース本文の裏付けまで併せて照合するため、見かけの高充填率を検出できる。",
      inputSchema: auditCrossMatrixInputShape,
    },
    async (input) => {
      const markdown = renderCrossMatrixAudit(input as AuditCrossMatrixInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
