import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import { testDesignNotationCatalog } from "../resources/testDesignNotationCatalog.js";
import { analyzeTestDesignNotations, DEFAULT_MAX_CELL_COUNT } from "../testDesignNotationAnalysis.js";
import {
  buildDocumentDigests,
  findDocumentDigestFindings,
  renderDocumentDigestLines,
} from "../documentDigest.js";
import type {
  AuditTestDesignNotationsInput,
  TestDesignNotationCatalog,
  TestDesignNotationClaimCheck,
  TestDesignNotationFinding,
  TestDesignNotationSpec,
} from "../types.js";

const FV_ROW_RENDER_LIMIT = 100;
const NGT_NODE_RENDER_LIMIT = 200;
const MATRIX_ROW_RENDER_LIMIT = 50;
const MATRIX_COLUMN_RENDER_LIMIT = 30;
const FINDING_RENDER_LIMIT = 50;

const FV_CATEGORY_IDS = ["TDN-01", "TDN-02", "TDN-03", "TDN-04", "TDN-05", "TDN-06", "TDN-07"];
const NGT_CATEGORY_IDS = [
  "TDN-08",
  "TDN-09",
  "TDN-10",
  "TDN-11",
  "TDN-12",
  "TDN-13",
  "TDN-14",
  "TDN-15",
  "TDN-16",
];
const MATRIX_CATEGORY_IDS = ["TDN-17", "TDN-18", "TDN-19", "TDN-20", "TDN-21", "TDN-22"];
const CROSS_CATEGORY_IDS = ["TDN-23", "TDN-24", "TDN-25"];

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function renderFindingLines(
  lines: string[],
  findings: TestDesignNotationFinding[],
  categoryIds: readonly string[]
): void {
  const targets = findings.filter((f) => categoryIds.includes(f.categoryId));
  if (targets.length === 0) {
    lines.push("- 指摘なし");
    return;
  }
  for (const f of targets.slice(0, FINDING_RENDER_LIMIT)) {
    lines.push(`- [${f.severity}] ${escapeCell(f.categoryId)} ${escapeCell(f.target)} : ${escapeCell(f.detail)}`);
  }
  if (targets.length > FINDING_RENDER_LIMIT) {
    lines.push(`- 他 ${targets.length - FINDING_RENDER_LIMIT} 件`);
  }
}

function renderClaimCheck(lines: string[], label: string, check: TestDesignNotationClaimCheck): void {
  const claimed = check.claimed === undefined ? "未宣言" : String(check.claimed);
  if (check.basis === "computed") {
    lines.push(
      `- ${label}: 宣言値 ${claimed} / 実測値 ${check.actual} （分子 ${check.numerator} / 分母 ${check.denominator}。${check.denominatorNote}）`
    );
    return;
  }
  if (check.basis === "skipped") {
    lines.push(`- ${label}: 宣言値 ${claimed} / 実測値 算出せず（${check.skipReason ?? ""}）`);
    return;
  }
  lines.push(
    `- ${label}: 宣言値 ${claimed} / 実測値 算出不能（${check.denominatorNote}が未宣言のため分母を確定できない）`
  );
}

function renderGenerationInstruction(lines: string[], spec: TestDesignNotationSpec): void {
  lines.push(`- ${spec.nameJa} が未投入のため、検査を実施していない。以下の要素を揃えて再実行すること。`);
  lines.push("");
  lines.push("| 要素ID | 要素 | 必須 | 何を保持するか | 未記入だと何を主張できなくなるか |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const element of spec.elements) {
    lines.push(
      `| ${escapeCell(element.id)} | ${escapeCell(element.nameJa)} | ${
        element.required ? "必須" : "任意"
      } | ${escapeCell(element.definition)} | ${escapeCell(element.emptyMeaning)} |`
    );
  }
  lines.push("");
  lines.push(`- 表現するもの: ${spec.expresses}`);
  lines.push(`- 適する場面: ${spec.suitableWhen}`);
  lines.push(`- 注意: ${spec.caution}`);
  if (spec.relatedToolNames.length > 0) {
    lines.push(`- 素材を得られるツール: ${spec.relatedToolNames.join(" / ")}`);
  }
}

export function renderTestDesignNotationAudit(
  input: AuditTestDesignNotationsInput,
  catalog: TestDesignNotationCatalog = testDesignNotationCatalog
): string {
  const result = analyzeTestDesignNotations(input);
  const { fvTable, ngt, yumotsuyoMatrix, findings, summary } = result;

  const specById = new Map(catalog.notations.map((n) => [n.id, n] as const));
  const fvSpec = specById.get("NTN-FV") as TestDesignNotationSpec;
  const ngtSpec = specById.get("NTN-NGT") as TestDesignNotationSpec;
  const ymxSpec = specById.get("NTN-YMX") as TestDesignNotationSpec;

  const lines: string[] = [];
  lines.push("# テスト設計記法監査結果");
  lines.push("");

  // ---- 1. 入力サマリ ----
  lines.push("## 1. 入力サマリ");
  lines.push("");
  lines.push("### 1.1 投入された記法");
  lines.push("");
  lines.push("| 記法ID | 記法 | 構造 | 投入 | 規模 |");
  lines.push("| --- | --- | --- | --- | --- |");
  lines.push(
    `| ${escapeCell(fvSpec.id)} | ${escapeCell(fvSpec.nameJa)} | リスト | ${
      fvTable.supplied ? "投入あり" : "未投入"
    } | ${fvTable.rowCount} 行 |`
  );
  lines.push(
    `| ${escapeCell(ngtSpec.id)} | ${escapeCell(ngtSpec.nameJa)} | ダイアグラム | ${
      ngt.supplied ? "投入あり" : "未投入"
    } | ${ngt.nodeCount} ノード(うち葉 ${ngt.leafIds.length}) |`
  );
  lines.push(
    `| ${escapeCell(ymxSpec.id)} | ${escapeCell(ymxSpec.nameJa)} | マトリクス | ${
      yumotsuyoMatrix.supplied ? "投入あり" : "未投入"
    } | ${yumotsuyoMatrix.rowCount} 行 × ${yumotsuyoMatrix.columnCount} 列 |`
  );
  lines.push("");

  if (input.documents && input.documents.length > 0) {
    const digestRows = buildDocumentDigests(input.documents, { idPatterns: input.idPatterns });
    const digestFindings = findDocumentDigestFindings(digestRows);
    lines.push("### 1.2 投入されたテストベース文書");
    lines.push("");
    for (const l of renderDocumentDigestLines(digestRows, digestFindings)) lines.push(l);
    lines.push("");
  }

  lines.push("### 1.3 テスト条件ID母集団");
  lines.push("");
  if (summary.testConditionPopulationCount === 0) {
    lines.push(
      "- testConditionIds が未宣言のため、記法が参照するテスト条件IDとの双方向照合(TDN-21 / TDN-25)を実施していない(要確認)"
    );
  } else {
    lines.push(`- 母集団件数: ${summary.testConditionPopulationCount} 件`);
  }
  lines.push("");

  // ---- 2. FV表 ----
  lines.push("## 2. FV表(リスト)");
  lines.push("");
  lines.push("### 2.1 FV表");
  lines.push("");
  if (!fvTable.supplied) {
    renderGenerationInstruction(lines, fvSpec);
    lines.push("");
    lines.push("### 2.2 検査結果");
    lines.push("");
    lines.push("- FV表が未投入のため、TDN-01〜TDN-07 の検査を実施していない。");
  } else {
    const rows = input.fvTable?.rows ?? [];
    lines.push("| 行ID | 機能ID | 機能 | 検証内容 | 由来 | NGTノード | テスト条件ID |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of rows.slice(0, FV_ROW_RENDER_LIMIT)) {
      lines.push(
        `| ${escapeCell(row.id)} | ${escapeCell(row.functionId ?? "-")} | ${escapeCell(
          row.functionName
        )} | ${escapeCell(row.verification)} | ${escapeCell(
          (row.requirementIds ?? []).join(", ") || "-"
        )} | ${escapeCell(row.ngtNodeId ?? "-")} | ${escapeCell(
          (row.testConditionIds ?? []).join(", ") || "-"
        )} |`
      );
    }
    if (rows.length > FV_ROW_RENDER_LIMIT) {
      lines.push("");
      lines.push(`- 表示は先頭 ${FV_ROW_RENDER_LIMIT} 行の抜粋(全 ${rows.length} 行)`);
    }
    lines.push("");
    lines.push("### 2.2 検査結果");
    lines.push("");
    renderClaimCheck(lines, "機能被覆率(%)", fvTable.coverage);
    renderFindingLines(lines, findings, FV_CATEGORY_IDS);
  }
  lines.push("");

  // ---- 3. NGT ----
  lines.push("## 3. NGT(ダイアグラム)");
  lines.push("");
  lines.push("### 3.1 テスト観点の階層");
  lines.push("");
  if (!ngt.supplied) {
    renderGenerationInstruction(lines, ngtSpec);
    lines.push("");
    lines.push("### 3.2 検査結果");
    lines.push("");
    lines.push("- NGT が未投入のため、TDN-08〜TDN-16 の検査を実施していない。");
  } else {
    const leafSet = new Set(ngt.leafIds);
    for (const node of ngt.renderOrder.slice(0, NGT_NODE_RENDER_LIMIT)) {
      const indent = "  ".repeat(node.depth);
      const mark = leafSet.has(node.id) ? "(葉)" : "";
      lines.push(`${indent}- ${node.label}(${node.id})${mark}`);
    }
    if (ngt.renderOrder.length > NGT_NODE_RENDER_LIMIT) {
      lines.push("");
      lines.push(
        `- 表示は先頭 ${NGT_NODE_RENDER_LIMIT} ノードの抜粋(ルートから到達できたノード全 ${ngt.renderOrder.length} 件)`
      );
    }
    if (ngt.unreachableIds.length > 0) {
      lines.push("");
      lines.push(
        `- ルートから到達できないノード(未宣言の親参照または循環): ${ngt.unreachableIds.join(", ")}`
      );
    }
    lines.push("");
    lines.push("### 3.2 検査結果");
    lines.push("");
    lines.push(
      `- ルートノード: ${ngt.rootIds.length} 件(${ngt.rootIds.join(", ") || "なし"}) / 葉ノード: ${ngt.leafIds.length} 件`
    );
    renderClaimCheck(lines, "葉ノード数(件)", ngt.leafCount);
    renderFindingLines(lines, findings, NGT_CATEGORY_IDS);
  }
  lines.push("");

  // ---- 4. ゆもつよマトリクス ----
  lines.push("## 4. ゆもつよマトリクス(マトリクス)");
  lines.push("");
  lines.push("### 4.1 マトリクス");
  lines.push("");
  if (!yumotsuyoMatrix.supplied) {
    renderGenerationInstruction(lines, ymxSpec);
    lines.push("");
    lines.push("### 4.2 検査結果");
    lines.push("");
    lines.push("- ゆもつよマトリクスが未投入のため、TDN-17〜TDN-22 の検査を実施していない。");
  } else if (!yumotsuyoMatrix.expanded) {
    lines.push(`- ${yumotsuyoMatrix.fillRate.skipReason ?? "直積を展開しなかった。"}`);
    lines.push("");
    lines.push("### 4.2 検査結果");
    lines.push("");
    renderClaimCheck(lines, "充填率(%)", yumotsuyoMatrix.fillRate);
    renderFindingLines(lines, findings, MATRIX_CATEGORY_IDS);
  } else {
    const matrixRows = input.yumotsuyoMatrix?.rows ?? [];
    const matrixColumns = input.yumotsuyoMatrix?.columns ?? [];
    const filledKeys = new Set<string>();
    for (const cell of input.yumotsuyoMatrix?.cells ?? []) {
      if ((cell.testConditionIds ?? []).length === 0) continue;
      filledKeys.add(`${cell.rowId}::${cell.columnId}`);
    }
    const excludedKeys = new Set<string>();
    for (const exclusion of input.yumotsuyoMatrix?.exclusions ?? []) {
      excludedKeys.add(`${exclusion.rowId}::${exclusion.columnId}`);
    }
    const shownRows = matrixRows.slice(0, MATRIX_ROW_RENDER_LIMIT);
    const shownColumns = matrixColumns.slice(0, MATRIX_COLUMN_RENDER_LIMIT);
    lines.push(
      `| テスト観点 \\ テストタイプ | ${shownColumns.map((c) => escapeCell(c.label)).join(" | ")} |`
    );
    lines.push(`| --- | ${shownColumns.map(() => "---").join(" | ")} |`);
    for (const row of shownRows) {
      const cells = shownColumns.map((column) => {
        const key = `${row.id}::${column.id}`;
        if (filledKeys.has(key)) return "○";
        if (excludedKeys.has(key)) return "-";
        return "";
      });
      lines.push(`| ${escapeCell(row.label)} | ${cells.join(" | ")} |`);
    }
    lines.push("");
    lines.push("- ○ = テスト条件が割り付けられたセル / - = 除外宣言されたセル / 空欄 = 除外宣言のない空セル(TDN-18)");
    if (matrixRows.length > shownRows.length || matrixColumns.length > shownColumns.length) {
      lines.push(
        `- 表示は先頭 ${shownRows.length} 行 × ${shownColumns.length} 列の抜粋(全 ${matrixRows.length} 行 × ${matrixColumns.length} 列)`
      );
    }
    lines.push("");
    lines.push("### 4.2 検査結果");
    lines.push("");
    lines.push(
      `- 全セル数: ${yumotsuyoMatrix.totalCellCount} / 充填セル数: ${yumotsuyoMatrix.filledCellCount} / 除外セル数: ${yumotsuyoMatrix.excludedCellCount}`
    );
    renderClaimCheck(lines, "充填率(%)", yumotsuyoMatrix.fillRate);
    renderFindingLines(lines, findings, MATRIX_CATEGORY_IDS);
  }
  lines.push("");

  // ---- 5. 記法間整合 ----
  lines.push("## 5. 記法間整合");
  lines.push("");
  const suppliedPairs: string[] = [];
  if (fvTable.supplied && ngt.supplied) suppliedPairs.push("FV表 × NGT(TDN-23)");
  if (yumotsuyoMatrix.supplied && ngt.supplied) suppliedPairs.push("ゆもつよマトリクス × NGT(TDN-24)");
  if (summary.testConditionPopulationCount > 0) suppliedPairs.push("3記法 × テスト条件ID母集団(TDN-25)");
  if (suppliedPairs.length === 0) {
    lines.push(
      "- 記法間照合の対象となる組合せが成立していない。2記法以上、またはテスト条件ID母集団を併せて投入すること。"
    );
  } else {
    lines.push(`- 照合できた組合せ: ${suppliedPairs.join(" / ")}`);
  }
  renderFindingLines(lines, findings, CROSS_CATEGORY_IDS);
  lines.push("");

  // ---- 6. 指摘一覧 ----
  lines.push("## 6. 指摘一覧");
  lines.push("");
  lines.push("### 6.1 検出事項");
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
  lines.push(
    `- 投入記法数: ${summary.suppliedNotationCount} / 検出事項数: ${summary.findingTotal}(うち high ${summary.highFindingTotal} / medium ${summary.mediumFindingTotal})`
  );
  lines.push("");

  lines.push("### 6.2 判定区分と対処指針");
  lines.push("");
  lines.push("| 区分ID | 区分 | 対象記法 | 重大度 | 説明 | 対処 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const c of catalog.auditCategories) {
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.nameJa)} | ${escapeCell(c.appliesTo.join(", "))} | ${
        c.severity
      } | ${escapeCell(c.definition)} | ${escapeCell(c.recommendedAction)} |`
    );
  }
  lines.push("");
  for (const note of catalog.notes) {
    lines.push(`- ${escapeCell(note)}`);
  }
  lines.push("");

  lines.push("### 6.3 意味的確認の指示(意味的層)");
  lines.push("");
  lines.push(
    "- 4.1 の空欄セルが、実施しないという判断なのか検討漏れなのかを判断すること。判断であれば exclusions に理由を明記して再実行すること。"
  );
  lines.push(
    "- 3.1 の浅い枝が、それ以上分解できない観点なのか分解の検討が止まっているだけなのかを判断すること。"
  );
  lines.push(
    "- 網羅率・充填率は分母の取り方で値が変わる。除外セルを増やせば充填率は上がるため、率だけを成果物へ転記せず分母と除外理由を併せて示すこと。"
  );
  lines.push(
    "- TDN-15 で未参照となった観点カテゴリは、検討した上で対象外としたのか検討していないのかを区別し、対象外であればその判断を成果物へ記録すること。"
  );
  lines.push("");

  lines.push(...renderNextToolsSection("audit_test_design_notations", [], input.completedTools).split("\n"));

  return lines.join("\n").trimEnd() + "\n";
}

export const auditTestDesignNotationsInputShape = {
  ...completedToolsInputShape,
  fvTable: z
    .object({
      rows: z
        .array(
          z.object({
            id: z.string().describe("FV table row id; defaults to the 'FV-' + sequence number convention"),
            functionId: z.string().optional().describe("Feature id this row targets, matched against expectedFunctionIds"),
            functionName: z.string().describe("Function under test (the F of FV)"),
            verification: z.string().describe("What is verified about that function (the V of FV)"),
            requirementIds: z.array(z.string()).optional().describe("Requirement ids / sections this row derives from"),
            ngtNodeId: z.string().optional().describe("NGT node id this row corresponds to; cross-checked as TDN-23"),
            testConditionIds: z.array(z.string()).optional().describe("Test condition ids this row flows down into"),
            evidence: z
              .string()
              .optional()
              .describe("Verbatim quote from documents substantiating this row; falls back to verification when omitted"),
          })
        )
        .describe("FV table rows"),
      expectedFunctionIds: z
        .array(z.string())
        .optional()
        .describe("Full feature id population; without it the function coverage rate cannot be computed (TDN-07)"),
      claimedFunctionCoveragePercent: z
        .number()
        .optional()
        .describe("Function coverage rate already claimed in the deliverable, cross-checked against the computed value"),
      idPrefix: z.string().optional().describe("Row id prefix (default 'FV-')"),
    })
    .optional()
    .describe("FV table (list notation); when omitted the tool returns generation instructions only"),
  ngt: z
    .object({
      nodes: z
        .array(
          z.object({
            id: z.string().describe("NGT node id; defaults to the 'NG-' + sequence number convention"),
            label: z.string().describe("Test perspective this node represents"),
            parentId: z.string().optional().describe("Parent node id; omit for the root node"),
            perspectiveCategoryId: z
              .string()
              .optional()
              .describe("Test perspective catalog id (TPC-xx or TPC-xx-xx), cross-checked as TDN-15"),
            testConditionIds: z.array(z.string()).optional().describe("Test condition ids this node flows down into"),
            evidence: z.string().optional().describe("Verbatim quote from documents substantiating this node"),
          })
        )
        .describe("NGT nodes forming the perspective hierarchy"),
      relations: z
        .array(
          z.object({
            fromId: z.string(),
            toId: z.string(),
            kind: z.string().optional(),
            note: z.string().optional(),
          })
        )
        .optional()
        .describe("Non-hierarchical relations between nodes; parent-child pairs restated here are flagged as TDN-14"),
      claimedLeafCount: z
        .number()
        .int()
        .optional()
        .describe("Leaf node count already claimed in the deliverable, cross-checked against the computed value"),
      idPrefix: z.string().optional().describe("Node id prefix (default 'NG-')"),
    })
    .optional()
    .describe("NGT (diagram notation); when omitted the tool returns generation instructions only"),
  yumotsuyoMatrix: z
    .object({
      rows: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            ngtNodeId: z.string().optional().describe("NGT node id this row corresponds to; cross-checked as TDN-24"),
          })
        )
        .describe("Matrix rows (test perspectives / feature categories)"),
      columns: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            ngtNodeId: z.string().optional().describe("NGT node id this column corresponds to; cross-checked as TDN-24"),
          })
        )
        .describe("Matrix columns (test types)"),
      cells: z
        .array(
          z.object({
            rowId: z.string(),
            columnId: z.string(),
            testConditionIds: z
              .array(z.string())
              .optional()
              .describe("Test conditions executed at this intersection; a cell without them counts as empty"),
            note: z.string().optional(),
            evidence: z.string().optional(),
          })
        )
        .describe("Filled cells of the matrix"),
      exclusions: z
        .array(
          z.object({
            rowId: z.string(),
            columnId: z.string(),
            reason: z
              .string()
              .optional()
              .describe("Why this intersection is intentionally not executed; omitting it is flagged as TDN-20"),
          })
        )
        .optional()
        .describe("Intersections intentionally left empty; excluded cells are removed from the fill rate denominator"),
      claimedFillRatePercent: z
        .number()
        .optional()
        .describe("Fill rate already claimed in the deliverable, cross-checked against the computed value"),
    })
    .optional()
    .describe("Yumotsuyo matrix (matrix notation); when omitted the tool returns generation instructions only"),
  testConditionIds: z
    .array(z.string())
    .optional()
    .describe("Full test condition id population shared by the three notations, cross-checked in both directions"),
  documents: z
    .array(z.object({ name: z.string(), content: z.string() }))
    .optional()
    .describe("Test basis documents used to substantiate FV table verification statements"),
  idPatterns: z
    .array(z.string())
    .optional()
    .describe("Additional ID regular expression patterns, appended to the default pattern"),
  maxCellCount: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`Matrix cell count cap (default ${DEFAULT_MAX_CELL_COUNT})`),
} as const;

export function registerAuditTestDesignNotationsTool(server: McpServer): void {
  server.registerTool(
    "audit_test_design_notations",
    {
      title: "Audit Test Design Notations",
      description:
        "テスト設計の中間成果物としてよく使われる3記法(リスト=FV表 / ダイアグラム=NGT / マトリクス=ゆもつよマトリクス)を受け取り、" +
        "記法ごとの描画と決定的検査を1回の呼び出しで行う。各記法について宣言(記法上のラベル・網羅率宣言・記法間の対応宣言)と" +
        "実体(行・ノード・セル・テスト条件ID母集団)を双方向に照合し、機能被覆率・葉ノード数・充填率は分母を明示して実測と突き合わせる。" +
        "母集団が未宣言のときは率を算出せず、宣言値を裏付け不能として報告する。" +
        "NGTの葉↔FV表の行↔マトリクスの行列という記法をまたいだ対応の欠落まで検出する。" +
        "判定区分と対処指針は testdesign://notation/catalog を参照する。未投入の記法については生成指示のみを返す。",
      inputSchema: auditTestDesignNotationsInputShape,
    },
    async (input) => {
      const markdown = renderTestDesignNotationAudit(input as AuditTestDesignNotationsInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
