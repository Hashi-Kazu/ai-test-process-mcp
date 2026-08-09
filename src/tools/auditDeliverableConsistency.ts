import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deliverableConsistencyCriteria } from "../resources/deliverableConsistencyCriteria.js";
import { analyzeDeliverableConsistency } from "../deliverableConsistencyAnalysis.js";
import {
  buildDocumentDigests,
  findDocumentDigestFindings,
  findUnmatchedIdPatterns,
  renderDocumentDigestLines,
} from "../documentDigest.js";
import type {
  AuditDeliverableConsistencyInput,
  DeliverableConsistencyCheckId,
  DeliverableConsistencyCriteria,
  DeliverableConsistencyFinding,
} from "../types.js";

const FINDING_RENDER_LIMIT = 50;
const MATRIX_ROW_RENDER_LIMIT = 60;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function stateMark(state: string): string {
  if (state === "read") return "読了";
  if (state === "unread") return "未読";
  if (state === "both") return "読了+未読";
  return "-";
}

function renderFindings(
  lines: string[],
  findings: DeliverableConsistencyFinding[],
  checkIds: DeliverableConsistencyCheckId[]
): void {
  const targets = findings.filter((f) => checkIds.includes(f.checkId));
  if (targets.length === 0) {
    lines.push("- なし");
    return;
  }
  for (const f of targets.slice(0, FINDING_RENDER_LIMIT)) {
    const places = f.places
      .slice(0, 4)
      .map((p) => `${p.deliverable}:${p.lineIndex + 1}`)
      .join(", ");
    lines.push(
      `- [${f.severity}] ${escapeCell(f.no)} ${escapeCell(f.checkId)} ${escapeCell(
        f.subject
      )} : ${escapeCell(f.summary)}${places === "" ? "" : `（${escapeCell(places)}）`}`
    );
  }
  if (targets.length > FINDING_RENDER_LIMIT) {
    lines.push(`- 他 ${targets.length - FINDING_RENDER_LIMIT} 件`);
  }
}

export function renderDeliverableConsistencyAudit(
  input: AuditDeliverableConsistencyInput,
  criteria: DeliverableConsistencyCriteria = deliverableConsistencyCriteria
): string {
  const result = analyzeDeliverableConsistency(
    { ...input, includeCoverageTargetIds: input.includeCoverageTargetIds ?? true },
    criteria
  );
  const { findings, summary, referencedRows } = result;
  const deliverables = input.deliverables;

  const lines: string[] = [];
  lines.push("# 成果物間整合性監査結果");
  lines.push("");

  lines.push("## 1. 監査対象");
  lines.push("");
  lines.push("### 1.1 投入された成果物");
  lines.push("");
  lines.push("| No | 成果物 | 種別 | 呼称 | 番号付き見出し数 |");
  lines.push("| --- | --- | --- | --- | --- |");
  result.deliverableIndex.forEach((entry, i) => {
    lines.push(
      `| ${i + 1} | ${escapeCell(entry.name)} | ${escapeCell(entry.kind)} | ${escapeCell(
        entry.aliases.join(" / ")
      )} | ${entry.headingNos.size} |`
    );
  });
  lines.push("");

  lines.push("### 1.2 入力ダイジェスト");
  lines.push("");
  {
    const digestDocuments = deliverables.map((d) => ({ name: d.name, content: d.content }));
    const digestRows = buildDocumentDigests(digestDocuments, { idPatterns: input.idPatterns });
    const digestFindings = findDocumentDigestFindings(digestRows);
    const unmatchedIdPatterns = findUnmatchedIdPatterns(digestDocuments, { idPatterns: input.idPatterns });
    for (const l of renderDocumentDigestLines(digestRows, digestFindings, unmatchedIdPatterns)) lines.push(l);
  }
  lines.push("");

  lines.push("### 1.3 抽出サマリ");
  lines.push("");
  lines.push(
    `- 成果物数: ${summary.deliverableCount} / 参照テストベース文書数: ${summary.referencedDocumentCount} / 検出ID数: ${summary.crossRefIdCount} / 章節参照数: ${summary.sectionReferenceCount} / 対応主張数: ${result.correspondenceClaims.length} / 件数・網羅率宣言数: ${result.countClaims.length} / 共通項目列挙数: ${result.sharedItems.length}`
  );
  lines.push(
    `- 検査対象IDプレフィックス: ${
      result.crossRefPrefixes.length === 0 ? "(なし)" : result.crossRefPrefixes.join(", ")
    }`
  );
  lines.push("");

  lines.push("## 2. 決定的検査(自動)");
  lines.push("");

  lines.push("### 2.1 参照テストベース文書リストの突き合わせ");
  lines.push("");
  if (referencedRows.length === 0) {
    lines.push("- 参照テストベース文書の言及を検出できなかった。");
  } else {
    lines.push(
      `| 文書 | ラベル | ${deliverables.map((d) => escapeCell(d.name)).join(" | ")} |`
    );
    lines.push(`| --- | --- | ${deliverables.map(() => "---").join(" | ")} |`);
    for (const row of referencedRows.slice(0, MATRIX_ROW_RENDER_LIMIT)) {
      const cells = deliverables.map((d) =>
        stateMark(row.states.find((s) => s.deliverable === d.name)?.state ?? "absent")
      );
      lines.push(
        `| ${escapeCell(row.documentKey)} | ${escapeCell(row.documentLabel)} | ${cells.join(" | ")} |`
      );
    }
    if (referencedRows.length > MATRIX_ROW_RENDER_LIMIT) {
      lines.push("");
      lines.push(`- 他 ${referencedRows.length - MATRIX_ROW_RENDER_LIMIT} 件`);
    }
  }
  lines.push("");
  renderFindings(lines, findings, ["DCC-01", "DCC-02", "DCC-03"]);
  if (input.declaredReferencedDocuments === undefined || input.declaredReferencedDocuments.length === 0) {
    lines.push("- declaredReferencedDocuments が未指定のため宣言と実体の照合ができない(要確認)");
  } else {
    renderFindings(lines, findings, ["DCC-04"]);
  }
  if (input.idPrefixOwners === undefined || input.idPrefixOwners.length === 0) {
    lines.push("- idPrefixOwners が未指定のため未読宣言文書由来IDの実参照を検査できない(要確認)");
  } else {
    renderFindings(lines, findings, ["DCC-05"]);
  }
  lines.push("");

  lines.push("### 2.2 IDの成果物間相互参照");
  lines.push("");
  renderFindings(lines, findings, ["DCC-06", "DCC-07", "DCC-08"]);
  lines.push("");

  lines.push("### 2.3 章節参照の実在性");
  lines.push("");
  renderFindings(lines, findings, ["DCC-09", "DCC-10", "DCC-11"]);
  lines.push("");

  lines.push("### 2.4 同一項目・同一IDの記述差分");
  lines.push("");
  renderFindings(lines, findings, ["DCC-12", "DCC-13", "DCC-14"]);
  lines.push("");

  lines.push("### 2.5 件数・網羅率宣言と本文実体の照合");
  lines.push("");
  renderFindings(lines, findings, ["DCC-15", "DCC-16", "DCC-17"]);
  if (input.countClaimSubjects === undefined || input.countClaimSubjects.length === 0) {
    lines.push("- countClaimSubjects が未指定のため件数宣言の実体照合ができない(要確認)");
  }
  {
    const ratioClaims = result.countClaims.filter((c) => c.kind === "ratio");
    const unresolvedRatioCount = ratioClaims.filter((c) => {
      const candidates = c.subjectPrefixCandidates ?? [];
      if (candidates.length === 0) return true;
      const matched = candidates.filter(
        (candidate) =>
          result.crossRefIndex.filter(
            (e) => e.owner !== undefined && e.prefix.toUpperCase() === candidate.toUpperCase()
          ).length > 0
      );
      return matched.length !== 1;
    }).length;
    if (unresolvedRatioCount > 0) {
      lines.push(
        `- 網羅率宣言 ${ratioClaims.length} 件のうち ${unresolvedRatioCount} 件は母集団の主語またはIDプレフィックスを解決できないため母集団照合ができない(要確認)`
      );
    }
  }
  lines.push("");

  lines.push("### 2.6 指摘一覧");
  lines.push("");
  if (findings.length === 0) {
    lines.push("- なし");
  } else {
    lines.push("| No | 区分ID | 重大度 | 対象 | 内容 | 箇所 | 確認依頼 | 暫定的な扱い |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const f of findings.slice(0, FINDING_RENDER_LIMIT)) {
      const places = f.places
        .slice(0, 4)
        .map((p) => `${p.deliverable}:${p.lineIndex + 1}`)
        .join(", ");
      lines.push(
        `| ${escapeCell(f.no)} | ${escapeCell(f.checkId)} | ${f.severity} | ${escapeCell(
          f.subject
        )} | ${escapeCell(f.summary)} | ${escapeCell(places)} | ${escapeCell(
          f.question
        )} | ${escapeCell(f.assumption)} |`
      );
    }
    if (findings.length > FINDING_RENDER_LIMIT) {
      lines.push("");
      lines.push(`- 他 ${findings.length - FINDING_RENDER_LIMIT} 件`);
    }
  }
  lines.push("");

  lines.push("### 2.7 サマリ");
  lines.push("");
  lines.push(
    `- 総指摘数: ${summary.totalFindings}(うち high ${summary.highFindings}) / 区分別: ${
      Object.keys(summary.byCheckId).length === 0
        ? "なし"
        : Object.keys(summary.byCheckId)
            .sort()
            .map((k) => `${k}=${summary.byCheckId[k]}`)
            .join(" / ")
    }`
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
    "- 2.1 の読了状態の食い違いについて、実際に読解した文書と読解範囲を確定し、未読宣言と参考文献一覧のどちらを修正するかを決めること。"
  );
  lines.push(
    "- 2.2 の対応主張は言葉だけの整合宣言である可能性がある。参照先成果物に対応表・ID列を追加して裏付けを与えること。"
  );
  lines.push(
    "- 2.3 の章節参照は、参照先の改番で壊れる。番号での参照を見出し名での参照へ置き換える方針も検討すること。"
  );
  lines.push(
    "- 2.4 の記述差分は表記ゆれと実質的な相違を機械的に区別できない。同一IDが同じ対象を指しているかを人が判断すること。"
  );
  lines.push(
    "- 2.5 の件数・網羅率は本文の列挙で裏付けられていない限り達成度として使わないこと。"
  );
  lines.push(
    "- 2.5 の網羅率は分母が母集団の全件であることまで確認すること。分母を縮めた率、分子分母を伴わない%表記は達成度の根拠にならない。"
  );
  lines.push("");

  lines.push("## 5. 決定的層で検出できない不整合の型");
  lines.push("");
  lines.push(
    "- IDや文書番号を伴わない記述だけの不整合（同じ対象を別の言葉で書いている、方針が実質的に変わっている等）。"
  );
  lines.push(
    "- 投入していない成果物・文書との不整合。検査は投入されたテキストの範囲でしか成立しない。"
  );
  lines.push(
    "- 任意入力（declaredReferencedDocuments / idPrefixOwners / countClaimSubjects）を指定しなかった検査。未指定は合格ではなく検査不能である。"
  );
  lines.push(
    "- 上流成果物そのものが誤っている場合の整合（成果物間で整合していても、テストベースに対して誤っていることは検出できない）。"
  );
  lines.push("");

  const signals: string[] = [];
  if (
    findings.some(
      (f) =>
        f.checkId === "DCC-01" ||
        f.checkId === "DCC-02" ||
        f.checkId === "DCC-04" ||
        f.checkId === "DCC-05"
    )
  ) {
    signals.push("has-referenced-document-conflicts");
  }
  if (summary.highFindings > 0) signals.push("has-consistency-findings");

  lines.push(
    ...renderNextToolsSection(
      "audit_deliverable_consistency",
      signals,
      input.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

export const auditDeliverableConsistencyInputShape = {
  ...completedToolsInputShape,
  deliverables: z
    .array(
      z.object({
        name: z.string().describe("Deliverable document name"),
        kind: z
          .enum(["test-plan", "test-analysis", "test-design", "test-report", "other"])
          .describe("Deliverable kind, used to resolve default aliases in cross-references"),
        aliases: z
          .array(z.string())
          .optional()
          .describe("Additional names used to refer to this deliverable from other deliverables"),
        content: z.string().describe("Full deliverable content (Markdown / plain text)"),
      })
    )
    .min(2)
    .describe("Deliverables to cross-check (test plan / test analysis / test design ...)"),
  declaredReferencedDocuments: z
    .array(
      z.object({
        deliverable: z.string(),
        readDocuments: z.array(z.string()),
        unreadDocuments: z.array(z.string()).optional(),
      })
    )
    .optional()
    .describe(
      "Declared per-deliverable read / unread test basis document lists, reconciled against the text"
    ),
  idPrefixOwners: z
    .array(
      z.object({
        documentKey: z.string(),
        prefixes: z.array(z.string()),
      })
    )
    .optional()
    .describe(
      "Which test basis document defines which ID prefixes, used to detect IDs sourced from documents declared unread"
    ),
  crossRefIdPrefixes: z
    .array(z.string())
    .optional()
    .describe("ID prefixes to cross-check; defaults to prefixes that have at least one definition"),
  countClaimSubjects: z
    .array(z.object({ keyword: z.string(), idPrefix: z.string() }))
    .optional()
    .describe("Count claim keywords and the ID prefix whose defined ids substantiate the claim"),
  sharedItemKindIds: z
    .array(z.string())
    .optional()
    .describe("Shared item kind ids (DSI-01..DSI-06) to compare; defaults to all"),
  idPatterns: z
    .array(z.string())
    .optional()
    .describe(
      "Extra regular expression sources for requirement/feature IDs, added to the default pattern. Capture group count decides how the ID is built: 1 group = group 1 is used as the whole ID as-is (no hyphen joining), 2 groups = reconstructed as `${group1}-${group2}` (default pattern behavior), 0 groups = the whole match is used. Use a 1-group pattern for numeric-only IDs (031), dot-separated IDs (3.1.2) and underscore IDs (REQ_001) so the reported ID matches the notation in the source document. If a given pattern matches nothing, a [high] finding is emitted in the input digest."
    ),
  includeCoverageTargetIds: z
    .boolean()
    .optional()
    .describe(
      "Include colon-separated coverage target IDs (BV:/EP:/ST:/DT:/PW:/SC:/UC:/DL:/CFG:) emitted by design_* tools in the ID index. Defaults to true."
    ),
} as const;

export function registerAuditDeliverableConsistencyTool(server: McpServer): void {
  server.registerTool(
    "audit_deliverable_consistency",
    {
      title: "Audit Deliverable Consistency",
      description:
        "複数成果物を突き合わせ、参照テストベース文書リストの差分・IDの成果物間相互参照の解決性・章節参照の実在性・" +
        "同一項目の記述差分を決定的に検出する。件数・網羅率の宣言は本文の列挙実体と照合し、網羅率の分母は本文で定義されたIDの実数と照合する。" +
        "分子分母を伴わない達成度%の主張も別途検出する。" +
        "design_* 系エンジンが発行するコロン区切りの網羅対象ID（BV:/EP:/ST:/DT:/PW:/SC:/UC:/DL:/CFG:）も既定でID索引に含める。",
      inputSchema: auditDeliverableConsistencyInputShape,
    },
    async (input) => {
      const markdown = renderDeliverableConsistencyAudit(input as AuditDeliverableConsistencyInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
