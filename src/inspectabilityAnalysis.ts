import { formatCount } from "./documentDigest.js";
import {
  inspectabilityCatalog,
  inspectabilityCatalogIdNames,
  inspectabilityDigestChecks,
  inspectabilityPreconditionById,
} from "./resources/inspectabilityCatalog.js";
import {
  IQC_MIN_TABLE_CELLS,
  IQC_NO_HEADING_MIN_CHARS,
  IQC_NO_HEADING_MIN_LINES,
} from "./resources/inputQualityCriteria.js";
import type {
  DocumentDigestRow,
  InspectabilityCheckEntry,
  InspectabilityRow,
  InspectabilitySignalValue,
} from "./types.js";

export type { InspectabilityRow, InspectabilitySignalValue };

// 「本入力で実際に実行された決定的検査 / 検査不能だった決定的検査」の対照表。
// 指摘0件が「合格」ではなく「検査していない」ことを意味する場合を、入力から算出した実測値付きで判別可能にする。
// すべて純関数で例外を投げない。判定に使う数値はすべて呼び出し側が入力から算出した実測値である。

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** 前提が未計測（シグナル未供給）であることを示す実測値。 */
export const INSPECTABILITY_UNMEASURED = "(未計測)";

/** 入力ダイジェストの行群から、ダイジェスト由来の共通8シグナルを算出する。 */
export function buildDigestSignals(
  rows: readonly DocumentDigestRow[]
): InspectabilitySignalValue[] {
  const docCount = rows.length;
  const charTotal = rows.reduce((sum, r) => sum + r.charCount, 0);
  const definedIdTotal = rows.reduce((sum, r) => sum + r.definedIdCount, 0);
  const idTotal = rows.reduce((sum, r) => sum + r.idCount, 0);
  const quantityTotal = rows.reduce((sum, r) => sum + r.quantityCount, 0);
  const anchorDocs = rows.filter((r) => r.sectionAnchor.mode !== "none");
  const headingAnchorDocs = anchorDocs.filter((r) => r.sectionAnchor.mode === "heading").length;
  const altAnchorDocs = anchorDocs.filter((r) => r.sectionAnchor.mode === "alternative").length;
  const tableCellTotal = rows.reduce((sum, r) => sum + r.inputQuality.tableCellCount, 0);
  const tableCellDocs = rows.filter(
    (r) => r.inputQuality.tableCellCount >= IQC_MIN_TABLE_CELLS
  ).length;
  const sizedDocs = rows.filter(
    (r) => r.charCount >= IQC_NO_HEADING_MIN_CHARS && r.lineCount >= IQC_NO_HEADING_MIN_LINES
  ).length;

  return [
    {
      id: "documents-supplied",
      satisfied: docCount >= 1,
      measured: `投入文書${formatCount(docCount)}件・${formatCount(charTotal)}字`,
    },
    {
      id: "multiple-documents",
      satisfied: docCount >= 2,
      measured: `投入文書${formatCount(docCount)}件`,
    },
    {
      id: "defined-id",
      satisfied: definedIdTotal >= 1,
      measured: `定義ID${formatCount(definedIdTotal)}件`,
    },
    {
      id: "id-occurrence",
      satisfied: idTotal >= 1,
      measured: `検出ID${formatCount(idTotal)}件`,
    },
    {
      id: "quantity-expression",
      satisfied: quantityTotal >= 1,
      measured: `数量表現${formatCount(quantityTotal)}件`,
    },
    {
      id: "section-anchor",
      satisfied: anchorDocs.length >= 1,
      measured: `章節アンカー解決可の文書${formatCount(anchorDocs.length)}件(見出し${formatCount(
        headingAnchorDocs
      )}件・代替アンカー${formatCount(altAnchorDocs)}件) / 全${formatCount(docCount)}件`,
    },
    {
      id: "table-cells",
      satisfied: tableCellDocs >= 1,
      measured: `表セル${formatCount(IQC_MIN_TABLE_CELLS)}件以上の文書${formatCount(
        tableCellDocs
      )}件 / 表セル総数${formatCount(tableCellTotal)}件`,
    },
    {
      id: "digest-min-size",
      satisfied: sizedDocs >= 1,
      measured: `${formatCount(IQC_NO_HEADING_MIN_CHARS)}字かつ${formatCount(
        IQC_NO_HEADING_MIN_LINES
      )}行以上の文書${formatCount(sizedDocs)}件 / 全${formatCount(docCount)}件`,
    },
  ];
}

/**
 * 対象ツールで判定対象となる検査の一覧（ダイジェスト由来の共通検査が先、次にツール固有検査）。
 * ダイジェスト検査の節ラベルは、そのツールが実際にダイジェストを載せている節見出しへ差し替える。
 */
export function inspectabilityChecksFor(toolName: string): InspectabilityCheckEntry[] {
  const entry = inspectabilityCatalog[toolName];
  if (entry === undefined) return [];
  const digestChecks = entry.includesDigestChecks
    ? inspectabilityDigestChecks.map((check) => ({
        ...check,
        sectionLabel: entry.digestSectionLabel ?? check.sectionLabel,
      }))
    : [];
  return [...digestChecks, ...entry.checks];
}

/**
 * `inspectabilityCatalog[toolName].checks` のうち、指定した前提IDを要求する検査の `catalogId` を
 * カタログ定義順に返す。判定区分の依存関係を各ツールで再宣言せず単一の真実源から導くためのヘルパ。
 */
export function catalogIdsRequiring(toolName: string, preconditionId: string): string[] {
  const entry = inspectabilityCatalog[toolName];
  if (entry === undefined) return [];
  return entry.checks
    .filter((check) => check.requires.includes(preconditionId))
    .map((check) => check.catalogId)
    .filter((id): id is string => id !== undefined);
}

export interface InspectabilityResolution {
  rows: InspectabilityRow[];
  warnings: string[];
}

/**
 * 静的な検査カタログと、入力から機械的に算出した前提の実測値から、
 * 「実行された検査 / 検査不能な検査」を決定的に解決する。例外は投げない。
 * 同一前提IDが複数供給された場合は後から供給された値を採用する（ツール固有シグナルで上書きできる）。
 */
export function resolveInspectability(
  toolName: string,
  signals: readonly InspectabilitySignalValue[]
): InspectabilityResolution {
  const warnings: string[] = [];
  const entry = inspectabilityCatalog[toolName];
  if (entry === undefined) {
    return {
      rows: [],
      warnings: [`[high] 本ツールは検査実行状況カタログに未登録: ${toolName}`],
    };
  }

  const signalById = new Map<string, InspectabilitySignalValue>();
  for (const signal of signals) signalById.set(signal.id, signal);

  const executed: InspectabilityRow[] = [];
  const unavailable: InspectabilityRow[] = [];

  for (const check of inspectabilityChecksFor(toolName)) {
    const catalogId = check.catalogId ?? "-";
    // 判定区分IDを持つ検査は既存カタログの日本語名称をそのまま使い、持たない検査は出力節ラベルを使う。
    const checkLabel =
      check.catalogId === undefined
        ? check.sectionLabel
        : inspectabilityCatalogIdNames[check.catalogId] ?? check.sectionLabel;
    const conditionParts: string[] = [];
    const satisfiedMeasured: string[] = [];
    const unsatisfiedMeasured: string[] = [];

    for (const requiredId of check.requires) {
      const precondition = inspectabilityPreconditionById[requiredId];
      const nameJa = precondition?.nameJa ?? requiredId;
      conditionParts.push(nameJa);
      const signal = signalById.get(requiredId);
      if (signal === undefined) {
        unsatisfiedMeasured.push(INSPECTABILITY_UNMEASURED);
        warnings.push(
          `[high] 前提「${nameJa}」の実測値が算出されていない: ${toolName}/${check.checkKey}`
        );
        continue;
      }
      if (signal.satisfied) {
        satisfiedMeasured.push(signal.measured);
      } else {
        unsatisfiedMeasured.push(signal.measured);
      }
    }

    const condition = conditionParts.join("・");
    if (unsatisfiedMeasured.length === 0) {
      executed.push({
        status: "実行",
        checkLabel,
        catalogId,
        condition,
        measured: satisfiedMeasured.join(" / "),
      });
    } else {
      unavailable.push({
        status: "検査不能",
        checkLabel,
        catalogId,
        condition,
        measured: unsatisfiedMeasured.join(" / "),
      });
    }
  }

  return { rows: [...unavailable, ...executed], warnings };
}

/** 「検査実行状況」節を行群として描画する（末尾に改行は含まない）。 */
export function renderInspectabilitySection(
  toolName: string,
  signals: readonly InspectabilitySignalValue[]
): string {
  const { rows, warnings } = resolveInspectability(toolName, signals);
  const lines: string[] = [];
  lines.push("## 検査実行状況(実行された検査 / 検査不能な検査)");
  lines.push("");
  if (rows.length === 0) {
    for (const w of warnings) lines.push(`- ${w}`);
    return lines.join("\n");
  }

  lines.push("| 状態 | 検査 | 区分ID | 成立条件 | 実測値 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of rows) {
    lines.push(
      `| ${row.status} | ${escapeCell(row.checkLabel)} | ${escapeCell(row.catalogId)} | ${escapeCell(
        row.condition
      )} | ${escapeCell(row.measured)} |`
    );
  }
  lines.push("");

  const unavailableRows = rows.filter((r) => r.status === "検査不能");
  const executedCount = rows.length - unavailableRows.length;
  lines.push(`- 実行: ${executedCount}区分 / 検査不能: ${unavailableRows.length}区分`);
  lines.push(
    "- 「検査不能」は指摘0件ではなく検査そのものが成立していないことを意味し、合格の根拠にならない。"
  );

  if (unavailableRows.length > 0) {
    const signalById = new Map<string, InspectabilitySignalValue>();
    for (const signal of signals) signalById.set(signal.id, signal);
    const remedies: string[] = [];
    for (const check of inspectabilityChecksFor(toolName)) {
      for (const requiredId of check.requires) {
        const signal = signalById.get(requiredId);
        if (signal !== undefined && signal.satisfied) continue;
        const precondition = inspectabilityPreconditionById[requiredId];
        if (precondition === undefined) continue;
        const text = `${precondition.nameJa} → ${precondition.remedy}`;
        if (!remedies.includes(text)) remedies.push(text);
      }
    }
    if (remedies.length > 0) {
      lines.push(`- 検査不能を解消する入力: ${escapeCell(remedies.join(" / "))}`);
    }
  }

  for (const w of warnings) lines.push(`- ${w}`);
  const entry = inspectabilityCatalog[toolName];
  if (entry !== undefined) lines.push(entry.outOfScopeNote);
  return lines.join("\n");
}
