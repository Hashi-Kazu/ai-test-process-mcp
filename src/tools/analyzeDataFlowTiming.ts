import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DEFAULT_MAX_DATA_FLOW_COMMUNICATIONS,
  DEFAULT_MAX_DATA_FLOW_PATHS_PER_PAIR,
  computeDataFlowTiming,
  delayWindowId,
  roundSeconds,
  skewWindowId,
} from "../dataFlowTimingAnalysis.js";
import { dataFlowTimingAnalysisCriteria } from "../resources/dataFlowTimingCriteria.js";
import type {
  DataFlowCommunicationInput,
  DataFlowTimingSpec,
} from "../types.js";

// analyze_data_flow_timing のレンダリング層。決定的エンジン(src/dataFlowTimingAnalysis.ts)の
// 出力をMarkdownへ落とすだけの純関数で、乱数・現在時刻は一切使わない。

/** 決定的検査の Markdown 出力で、同一区分の指摘を丸める件数。findings 配列自体は全件保持する。 */
const FINDING_RENDER_LIMIT = 50;

const EPS = 1e-9;

const PERIODIC_KINDS = new Set(["periodic", "batch", "on-demand"]);

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function fmtSeconds(value: number | undefined): string {
  return value === undefined ? "-" : String(value);
}

/** mermaid の本文でパースを壊す文字を無害化する。 */
function mermaidText(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/;/g, ",").replace(/:/g, "：");
}

/** timing.kind に対応する mermaid の矢印記法。 */
export function mermaidArrow(comm: DataFlowCommunicationInput): string {
  const kind = comm.timing?.kind;
  if (kind === "event") {
    return comm.ackKind === "application-ack" || comm.ackKind === "transport-ack" ? "->>" : "-)";
  }
  if (kind !== undefined && PERIODIC_KINDS.has(kind)) return "--)";
  return "-x";
}

/** 通信のタイミング表記（2節の表と4節の mermaid 本文で共用する）。 */
export function timingLabel(comm: DataFlowCommunicationInput): string {
  const kind = comm.timing?.kind;
  if (kind !== undefined && PERIODIC_KINDS.has(kind)) {
    return comm.timing.intervalSeconds === undefined
      ? "タイミング未定義"
      : `周期: ${comm.timing.intervalSeconds}秒`;
  }
  if (kind === "event") {
    const trigger = (comm.timing.trigger ?? "").trim();
    return trigger === "" ? "タイミング未定義" : `契機: ${trigger}`;
  }
  return "タイミング未定義";
}

/** components の入力順に、英数字・アンダースコア以外を `_` へ置換した mermaid alias を割り当てる。 */
export function buildMermaidAliases(componentIds: readonly string[]): Map<string, string> {
  const aliases = new Map<string, string>();
  const used = new Map<string, number>();
  for (const id of componentIds) {
    if (aliases.has(id)) continue;
    const base = id.replace(/[^A-Za-z0-9_]/g, "_");
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    aliases.set(id, count === 1 ? base : `${base}_${count}`);
  }
  return aliases;
}

export function renderDataFlowTiming(spec: DataFlowTimingSpec): string {
  const result = computeDataFlowTiming(spec);
  const components = spec.components;
  const dataItems = spec.dataItems;
  const communications = spec.communications;

  const componentById = new Map(components.map((c) => [c.id, c]));
  const dataItemById = new Map(dataItems.map((d) => [d.id, d]));
  const nameOf = (id: string): string => componentById.get(id)?.nameJa ?? id;
  const dataNameOf = (id: string): string => dataItemById.get(id)?.nameJa ?? id;
  const latencyById = new Map(result.edgeLatencies.map((e) => [e.communicationId, e]));

  const lines: string[] = [];
  lines.push("# データフロー・タイミング分析結果");
  lines.push("");
  if (spec.title) {
    lines.push(`- 対象: ${escapeCell(spec.title)}`);
    lines.push("");
  }

  const skipLine = (reason: string): void => {
    lines.push(`- 未算出(理由: ${escapeCell(reason)})`);
    lines.push("");
  };

  // --- 1. 構成要素・データ項目 ---
  lines.push("## 1. 構成要素・データ項目");
  lines.push("");
  lines.push("### 1.1 構成要素一覧");
  lines.push("");
  lines.push("| 構成要素ID | 名称 | 種別 | 備考 |");
  lines.push("| --- | --- | --- | --- |");
  for (const c of components) {
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.nameJa)} | ${escapeCell(c.kind ?? "-")} | ${escapeCell(c.note ?? "-")} |`
    );
  }
  lines.push("");
  lines.push("### 1.2 データ項目一覧");
  lines.push("");
  lines.push("| データ項目ID | 名称 | 備考 |");
  lines.push("| --- | --- | --- |");
  for (const d of dataItems) {
    lines.push(`| ${escapeCell(d.id)} | ${escapeCell(d.nameJa)} | ${escapeCell(d.note ?? "-")} |`);
  }
  lines.push("");

  // --- 2. 通信一覧 ---
  lines.push("## 2. 通信一覧");
  lines.push("");
  lines.push(
    "| 通信ID | 送信元 | 宛先 | 方向 | データ項目 | タイミング | 最大遅延(秒) | 最小遅延(秒) | ACK | タイムアウト(秒) | 根拠位置 |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const comm of communications) {
    const latency = latencyById.get(comm.id);
    const items = (comm.dataItemIds ?? []).map((id) => `${dataNameOf(id)}(${id})`).join("、");
    const ref = comm.sourceRef;
    const refText =
      ref === undefined
        ? "未特定"
        : [ref.document, ref.startLine !== undefined ? `L${ref.startLine}` : undefined, ref.heading, ref.label]
            .filter((v) => v !== undefined && v !== "")
            .join(" / ");
    lines.push(
      `| ${escapeCell(comm.id)} | ${escapeCell(`${nameOf(comm.fromId)}(${comm.fromId})`)} | ${escapeCell(
        `${nameOf(comm.toId)}(${comm.toId})`
      )} | ${escapeCell(mermaidArrow(comm))} | ${escapeCell(items || "-")} | ${escapeCell(
        timingLabel(comm)
      )} | ${fmtSeconds(latency?.maxSeconds)} | ${fmtSeconds(latency?.minSeconds)} | ${escapeCell(
        comm.ackKind ?? "未指定"
      )} | ${fmtSeconds(comm.timeoutSeconds)} | ${escapeCell(refText)} |`
    );
  }
  lines.push("");
  lines.push(
    "- 辺の最大遅延 = 送信待ち(周期系は intervalSeconds、event は0) + 伝送時間(transmissionLatencySeconds) + タイムアウト×再送回数。最小遅延 = 伝送時間。"
  );
  lines.push("- タイミングが確定しない通信は latency 不定として扱い、0秒で代替しない(`-` で表示)。");
  lines.push("");

  // --- 3. 伝播遅延の算出 ---
  lines.push("## 3. 伝播遅延の算出");
  lines.push("");
  lines.push("### 3.1 最大伝播遅延（遅延窓）");
  lines.push("");
  if (!result.generated) {
    skipLine(result.skipReason ?? "");
  } else if (result.delayWindows.length === 0) {
    lines.push("- 対象なし");
    lines.push("");
  } else {
    lines.push(
      "| 遅延窓ID | データ項目 | 起点 | 終端 | 最大伝播遅延(秒) | 最小伝播遅延(秒) | クリティカル経路 | 状態 |"
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const w of result.delayWindows) {
      const status = w.computed ? "算出済" : `未算出(理由: ${w.skipReason ?? ""})`;
      lines.push(
        `| ${escapeCell(w.windowId)} | ${escapeCell(`${dataNameOf(w.dataItemId)}(${w.dataItemId})`)} | ${escapeCell(
          `${nameOf(w.originId)}(${w.originId})`
        )} | ${escapeCell(`${nameOf(w.terminalId)}(${w.terminalId})`)} | ${fmtSeconds(
          w.maxLatencySeconds
        )} | ${fmtSeconds(w.minLatencySeconds)} | ${escapeCell(
          w.criticalPathCommunicationIds.join(" → ") || "-"
        )} | ${escapeCell(status)} |`
      );
    }
    lines.push("");
  }

  lines.push("### 3.2 最大乖離時間（乖離窓）");
  lines.push("");
  if (!result.generated) {
    skipLine(result.skipReason ?? "");
  } else if (result.skewWindows.length === 0) {
    lines.push("- 対象なし");
    lines.push("");
  } else {
    lines.push(
      "| 乖離窓ID | データ項目 | 起点 | 観測点数 | 最大乖離時間(秒) | 最遅観測点(経路) | 最速観測点(経路) | 状態 |"
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const w of result.skewWindows) {
      const status = w.computed ? "算出済" : `未算出(理由: ${w.skipReason ?? ""})`;
      const slowest = w.computed
        ? `${nameOf(w.slowestTerminalId ?? "")}(${w.slowestPathCommunicationIds.join(" → ")})`
        : "-";
      const fastest = w.computed
        ? `${nameOf(w.fastestTerminalId ?? "")}(${w.fastestPathCommunicationIds.join(" → ")})`
        : "-";
      lines.push(
        `| ${escapeCell(w.windowId)} | ${escapeCell(`${dataNameOf(w.dataItemId)}(${w.dataItemId})`)} | ${escapeCell(
          `${nameOf(w.originId)}(${w.originId})`
        )} | ${w.observerCount} | ${fmtSeconds(w.maxSkewSeconds)} | ${escapeCell(slowest)} | ${escapeCell(
          fastest
        )} | ${escapeCell(status)} |`
      );
    }
    lines.push("");
    lines.push(
      "- 最大乖離時間 = 最も遅い観測点の最悪値 − 最も速い観測点の最良値。周期差そのものと一致するとは限らない。"
    );
    lines.push("");
  }

  lines.push("### 3.3 宣言値との照合");
  lines.push("");
  const propagationTargets = spec.propagationTargets ?? [];
  const claimedSkews = spec.claimedMaxSkewSeconds ?? [];
  if (propagationTargets.length === 0 && claimedSkews.length === 0) {
    lines.push("- 宣言なし");
    lines.push("");
  } else {
    const delayWindowById = new Map(result.delayWindows.map((w) => [w.windowId, w]));
    const skewWindowById = new Map(result.skewWindows.map((w) => [w.windowId, w]));
    lines.push("| 宣言種別 | 宣言ID | 対象窓ID | 宣言値(秒) | 算出値(秒) | 判定 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const pt of propagationTargets) {
      const windowIds = pt.terminalComponentIds.map((t) => delayWindowId(pt.dataItemId, pt.originComponentId, t));
      const rows = windowIds.map((wid) => delayWindowById.get(wid));
      const unresolved = rows.some((r) => r === undefined || !r.computed);
      const computedMax = unresolved
        ? undefined
        : roundSeconds(Math.max(...rows.map((r) => r?.maxLatencySeconds ?? 0)));
      let verdict: string;
      if (pt.claimedMaxLatencySeconds === undefined) {
        verdict = "宣言値なし(到達性のみ照合)";
      } else if (unresolved) {
        verdict = "算出不能(裏付け不可)";
      } else {
        verdict = Math.abs((computedMax ?? 0) - pt.claimedMaxLatencySeconds) < EPS ? "一致" : "不一致";
      }
      lines.push(
        `| 最大伝播遅延 | ${escapeCell(pt.id)} | ${escapeCell(windowIds.join(", "))} | ${fmtSeconds(
          pt.claimedMaxLatencySeconds
        )} | ${fmtSeconds(computedMax)} | ${escapeCell(verdict)} |`
      );
    }
    for (const claim of claimedSkews) {
      const wid = skewWindowId(claim.dataItemId, claim.originComponentId);
      const row = skewWindowById.get(wid);
      const computed = row !== undefined && row.computed;
      const verdict = !computed
        ? "算出不能(裏付け不可)"
        : Math.abs((row?.maxSkewSeconds ?? 0) - claim.seconds) < EPS
          ? "一致"
          : "不一致";
      lines.push(
        `| 最大乖離時間 | ${escapeCell(`${claim.dataItemId}@${claim.originComponentId}`)} | ${escapeCell(
          wid
        )} | ${claim.seconds} | ${fmtSeconds(computed ? row?.maxSkewSeconds : undefined)} | ${escapeCell(verdict)} |`
      );
    }
    lines.push("");
  }

  // --- 4. シーケンス図(mermaid) ---
  lines.push("## 4. シーケンス図(mermaid)");
  lines.push("");
  const aliases = buildMermaidAliases(components.map((c) => c.id));
  const aliasOf = (id: string): string => aliases.get(id) ?? id.replace(/[^A-Za-z0-9_]/g, "_");
  lines.push("```mermaid");
  lines.push("sequenceDiagram");
  for (const c of components) {
    lines.push(`participant ${aliasOf(c.id)} as ${mermaidText(c.nameJa)}`);
  }
  for (const comm of communications) {
    const items = (comm.dataItemIds ?? []).map((id) => dataNameOf(id)).join("、");
    const body = mermaidText(`${comm.id} ${items}（${timingLabel(comm)}）`);
    lines.push(`${aliasOf(comm.fromId)}${mermaidArrow(comm)}${aliasOf(comm.toId)}: ${body}`);
  }
  const noteWindows = result.delayWindows
    .filter((w) => w.computed && (w.maxLatencySeconds ?? 0) > 0)
    .sort((a, b) => (a.windowId < b.windowId ? -1 : a.windowId > b.windowId ? 1 : 0));
  for (const w of noteWindows) {
    lines.push(
      `Note over ${aliasOf(w.originId)},${aliasOf(w.terminalId)}: 最大伝播遅延 ${w.maxLatencySeconds}秒 (${w.windowId})`
    );
  }
  lines.push("```");
  lines.push("");

  // --- 5. テスト条件との突合 ---
  lines.push("## 5. テスト条件との突合");
  lines.push("");
  lines.push("### 5.1 遅延窓・乖離窓の被覆");
  lines.push("");
  const testConditions = spec.testConditions ?? [];
  const referencedBy = new Map<string, string[]>();
  for (const tc of testConditions) {
    for (const wid of tc.coveredDelayWindowIds ?? []) {
      const arr = referencedBy.get(wid) ?? [];
      if (!arr.includes(tc.id)) arr.push(tc.id);
      referencedBy.set(wid, arr);
    }
  }
  const targetWindows = [
    ...result.delayWindows
      .filter((w) => w.computed && (w.maxLatencySeconds ?? 0) > 0)
      .map((w) => ({ windowId: w.windowId, kind: "遅延窓", seconds: w.maxLatencySeconds ?? 0 })),
    ...result.skewWindows
      .filter((w) => w.computed && (w.maxSkewSeconds ?? 0) > 0)
      .map((w) => ({ windowId: w.windowId, kind: "乖離窓", seconds: w.maxSkewSeconds ?? 0 })),
  ];
  if (targetWindows.length === 0) {
    lines.push("- 0秒超で算出済みの窓が無いため、突合対象がない。");
    lines.push("");
  } else {
    lines.push("| 窓ID | 種別 | 秒数 | 参照テスト条件ID | 状態 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const w of targetWindows) {
      const refs = referencedBy.get(w.windowId) ?? [];
      lines.push(
        `| ${escapeCell(w.windowId)} | ${escapeCell(w.kind)} | ${w.seconds} | ${escapeCell(
          refs.join(", ") || "-"
        )} | ${refs.length > 0 ? "被覆" : "未被覆"} |`
      );
    }
    lines.push("");
  }
  const knownWindowIds = new Set([
    ...result.delayWindows.map((w) => w.windowId),
    ...result.skewWindows.map((w) => w.windowId),
  ]);
  const danglingRefs = [...referencedBy.entries()].filter(([wid]) => !knownWindowIds.has(wid));
  if (danglingRefs.length > 0) {
    lines.push("**実体に存在しない窓IDを参照しているテスト条件:**");
    lines.push("");
    for (const [wid, ids] of danglingRefs) {
      lines.push(`- ${escapeCell(wid)} ← ${escapeCell(ids.join(", "))}`);
    }
    lines.push("");
  }

  lines.push("### 5.2 遅延窓被覆率");
  lines.push("");
  if (result.coverage.basis === "unavailable") {
    lines.push(`- 遅延窓被覆率: 未算出(理由: ${escapeCell(result.coverage.reason ?? "")})`);
  } else {
    lines.push(
      `- 分母(0秒超かつ算出済みの遅延窓＋乖離窓の件数): ${result.coverage.denominator} 件`
    );
    lines.push(
      `- 分子(実在するテスト条件の coveredDelayWindowIds から実際に参照されている件数): ${result.coverage.numerator} 件`
    );
    lines.push(`- 遅延窓被覆率: ${result.coverage.percent}%`);
  }
  if (result.coverage.claimedPercent !== undefined) {
    lines.push(
      `- 宣言値(${result.coverage.claimedPercent}%)との照合: ${result.coverage.claimMismatch ? "不一致" : "一致"}`
    );
  }
  lines.push("");

  // --- 6. 決定的検査 ---
  lines.push("## 6. 決定的検査");
  lines.push("");
  if (result.findings.length === 0) {
    lines.push("- 指摘なし");
    lines.push("");
  } else {
    const sorted = [...result.findings].sort((a, b) => a.categoryId.localeCompare(b.categoryId));
    let i = 0;
    while (i < sorted.length) {
      const catId = sorted[i].categoryId;
      let j = i;
      while (j < sorted.length && sorted[j].categoryId === catId) j++;
      const group = sorted.slice(i, j);
      for (const f of group.slice(0, FINDING_RENDER_LIMIT)) {
        lines.push(`- [${f.severity}] ${f.categoryId} ${escapeCell(f.target)}: ${escapeCell(f.detail)}`);
      }
      if (group.length > FINDING_RENDER_LIMIT) {
        lines.push(`- 他 ${group.length - FINDING_RENDER_LIMIT} 件（表示を ${FINDING_RENDER_LIMIT} 件に丸めた）`);
      }
      i = j;
    }
    lines.push("");
  }
  lines.push("**判定区分カタログの注記(testdesign://data-flow-timing/analysis-criteria):**");
  lines.push("");
  for (const note of dataFlowTimingAnalysisCriteria.notes) {
    lines.push(`- ${escapeCell(note)}`);
  }
  lines.push("");

  // --- 7. extract_test_conditions 引き渡し ---
  lines.push("## 7. extract_test_conditions 引き渡し");
  lines.push("");
  if (result.handoverRows.length === 0) {
    lines.push("- 0秒超の遅延窓・乖離窓が無いため、引き渡し候補は生成していない(0秒の窓は生成対象外)。");
    lines.push("");
  } else {
    lines.push("| 提案条件ID | target | 条件文(雛形) | source | derivedFrom | recommendedTechniques | 対応窓ID |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of result.handoverRows) {
      const derived =
        row.derivedFrom.length === 0
          ? "未確定"
          : row.derivedFrom.map((r) => `${r.kind}:${r.id}`).join(", ");
      lines.push(
        `| ${escapeCell(row.proposedConditionId)} | ${escapeCell(row.target)} | ${escapeCell(
          row.statement
        )} | ${escapeCell(row.source)} | ${escapeCell(derived)} | ${escapeCell(
          row.recommendedTechniques.join(", ")
        )} | ${escapeCell(row.windowId)} |`
      );
    }
    lines.push("");
    lines.push("- `derivedFrom` セルは `kind:id` 形式で表示している。投入時は `{ kind: \"requirement\", id: \"...\" }` へ写すこと。");
    const undetermined = result.handoverRows.filter((r) => r.derivedFrom.length === 0);
    if (undetermined.length > 0) {
      lines.push("");
      lines.push("**`derivedFrom` を確定できない候補:**");
      lines.push("");
      for (const row of undetermined) {
        lines.push(
          `- [medium] ${escapeCell(row.proposedConditionId)}: 経路上の通信に requirementIds が1件も無く、\`derivedFrom\` を確定できない。\`extract_test_conditions\` の \`derivedFrom\` は1件以上必須のため、このままでは投入できない。通信の根拠要件IDを補うこと。`
        );
      }
    }
    lines.push("");
    lines.push(
      "- `extract_test_conditions` 実行後に本ツールを再実行するときは、`対応窓ID` を `testConditions[].coveredDelayWindowIds` へ入れて突合すること。"
    );
    lines.push(
      "- 観点カテゴリは本ツールでは決め打ちしない。`testcondition://perspectives/catalog` の `TPC-08`(タイミング・順序) を第一候補として呼び出し側が選ぶこと。"
    );
    lines.push("");
  }

  // --- 8. サマリ ---
  lines.push("## 8. サマリ");
  lines.push("");
  if (!result.generated) {
    skipLine(result.skipReason ?? "");
  } else {
    const computedDelay = result.delayWindows.filter((w) => w.computed).length;
    const computedSkew = result.skewWindows.filter((w) => w.computed).length;
    lines.push(
      `構成要素 ${components.length} / データ項目 ${dataItems.length} / 通信 ${communications.length} / ` +
        `遅延窓 ${result.delayWindows.length}件(算出済 ${computedDelay}件) / ` +
        `乖離窓 ${result.skewWindows.length}件(算出済 ${computedSkew}件) / 指摘件数 ${result.findings.length}`
    );
    lines.push("");
  }

  const signals: string[] = [];
  if (
    result.delayWindows.some((w) => w.computed && (w.maxLatencySeconds ?? 0) > 0) ||
    result.skewWindows.some((w) => w.computed && (w.maxSkewSeconds ?? 0) > 0)
  ) {
    signals.push("has-delay-windows");
  }
  if (result.findings.some((f) => f.categoryId === "DFT-10" || f.categoryId === "DFT-11")) {
    signals.push("has-uncovered-delay-windows");
  }
  if (result.findings.some((f) => f.categoryId === "DFT-04")) {
    signals.push("has-undefined-timing");
  }

  lines.push(...renderNextToolsSection("analyze_data_flow_timing", signals, spec.completedTools).split("\n"));

  return lines.join("\n").trimEnd() + "\n";
}

// --- MCP 登録 ---

const dataFlowComponentKindEnum = z.enum(["device", "service", "hub", "cloud", "store", "actor", "other"]);
const dataFlowTimingKindEnum = z.enum(["periodic", "event", "on-demand", "batch", "undefined"]);
const dataFlowAckKindEnum = z.enum(["none", "application-ack", "transport-ack", "undeclared"]);

export const analyzeDataFlowTimingInputShape = {
  ...completedToolsInputShape,
  title: z.string().optional(),
  components: z
    .array(
      z.object({
        id: z.string(),
        nameJa: z.string(),
        kind: dataFlowComponentKindEnum.optional(),
        note: z.string().optional(),
      })
    )
    .min(1)
    .describe("System components (devices / services / clouds / stores / actors) exchanging data"),
  dataItems: z
    .array(
      z.object({
        id: z.string(),
        nameJa: z.string(),
        note: z.string().optional(),
      })
    )
    .min(1)
    .describe("Logical data items carried by the communications"),
  communications: z
    .array(
      z.object({
        id: z.string(),
        fromId: z.string(),
        toId: z.string(),
        dataItemIds: z.array(z.string()).min(1),
        timing: z.object({
          kind: dataFlowTimingKindEnum,
          intervalSeconds: z.number().nonnegative().optional(),
          trigger: z.string().optional(),
        }),
        transmissionLatencySeconds: z.number().nonnegative().optional(),
        ackKind: dataFlowAckKindEnum.optional(),
        timeoutSeconds: z.number().nonnegative().optional(),
        retry: z
          .object({
            maxCount: z.number().int().nonnegative(),
            intervalSeconds: z.number().nonnegative().optional(),
          })
          .optional(),
        requirementIds: z.array(z.string()).optional(),
        sourceRef: z
          .object({
            document: z.string(),
            startLine: z.number().int().nonnegative().optional(),
            heading: z.string().optional(),
            label: z.string().optional(),
          })
          .optional(),
        note: z.string().optional(),
      })
    )
    .min(1)
    .describe("Directed communications between components, with the timing declared in the test basis"),
  propagationTargets: z
    .array(
      z.object({
        id: z.string(),
        dataItemId: z.string(),
        originComponentId: z.string(),
        terminalComponentIds: z.array(z.string()),
        claimedMaxLatencySeconds: z.number().nonnegative().optional(),
      })
    )
    .optional()
    .describe("Declared propagation endpoints, checked against reachability and computed latency"),
  claimedMaxSkewSeconds: z
    .array(
      z.object({
        dataItemId: z.string(),
        originComponentId: z.string(),
        seconds: z.number().nonnegative(),
      })
    )
    .optional(),
  testConditions: z
    .array(
      z.object({
        id: z.string(),
        statement: z.string().optional(),
        dataItemIds: z.array(z.string()).optional(),
        communicationIds: z.array(z.string()).optional(),
        coveredDelayWindowIds: z.array(z.string()).optional(),
        expectsImmediate: z.boolean().optional(),
      })
    )
    .optional(),
  claimedDelayWindowCoveragePercent: z.number().min(0).max(100).optional(),
  maxCommunications: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`Communication population cap (default ${DEFAULT_MAX_DATA_FLOW_COMMUNICATIONS})`),
  maxPathsPerPair: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(`Simple path enumeration cap per data item and origin (default ${DEFAULT_MAX_DATA_FLOW_PATHS_PER_PAIR})`),
} as const;

const analyzeDataFlowTimingInputSchema = z.object(analyzeDataFlowTimingInputShape);
export type AnalyzeDataFlowTimingInput = z.infer<typeof analyzeDataFlowTimingInputSchema>;

export function registerAnalyzeDataFlowTimingTool(server: McpServer): void {
  server.registerTool(
    "analyze_data_flow_timing",
    {
      title: "Analyze Data Flow Timing",
      description:
        "システム構成要素間のデータフローとタイミング(送信周期・送信契機・伝送時間・ACK・タイムアウト・再送)から、" +
        "同一データが末端へ到達するまでの最大伝播遅延(遅延窓)と、複数経路で伝播したときの最大乖離時間(乖離窓)を" +
        "決定的に算出してMarkdownで返す。データ項目ごとの部分グラフ上の単純パス全列挙による最大／最小伝播遅延の算出、" +
        "タイミングが未定義の通信の検出とその経路の算出不能扱い(0秒での代替をしない)、宣言された伝播先の到達性照合、" +
        "宣言値(最大伝播遅延・最大乖離時間・遅延窓被覆率)と算出値の照合、即時反映を期待するテスト条件と算出遅延の矛盾検出、" +
        "mermaid シーケンス図の決定的生成、extract_test_conditions へのテスト条件候補の引き渡しを、" +
        "判定区分 DFT-01〜DFT-20 で決定的に検査する。本ツールが扱うのはSUT内部の通信タイミングであり、" +
        "テスト作業そのものの実行順序を扱う analyze_execution_order とは別概念である。判定区分と対処指針は " +
        "testdesign://data-flow-timing/analysis-criteria を参照する。",
      inputSchema: analyzeDataFlowTimingInputShape,
    },
    async (input) => {
      const text = renderDataFlowTiming(input as unknown as DataFlowTimingSpec);
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
