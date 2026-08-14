import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import { catalogIdsRequiring, renderInspectabilitySection } from "../inspectabilityAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { basisContradictionCriteria } from "../resources/basisContradictionCriteria.js";
import {
  buildBasisLines,
  buildContradictionCandidates,
  buildDeclarationReconciliation,
  buildRevisionReconciliation,
  extractEntityOccurrencesWithQuality,
  extractParameterValues,
  extractRevisionClaims,
  extractTransitions,
  extractUiElements,
  summarizeContradictions,
} from "../basisContradictionAnalysis.js";
import { sanitizeTestBasisDocuments } from "../documentDigest.js";
import {
  distinctInOrder,
  isSectionResolved,
  renderFindingPrioritySection,
  type FindingPriorityInput,
  type FindingPrioritySeverity,
} from "../findingPriority.js";
import type {
  AuditBasisContradictionsInput,
  BasisContradictionCandidate,
  BasisContradictionCriteria,
  ContradictionCheckId,
  ContradictionConfidence,
  ContradictionPlace,
} from "../types.js";

/** 既定表示（verbose=false）で2.1〜2.10各節に列挙する候補行の上限。 */
export const MAX_CANDIDATE_LINES_PER_CHECK = 15;
/** 既定表示（verbose=false）で1候補あたりに表示する根拠位置の上限。 */
export const MAX_PLACES_PER_CANDIDATE = 5;
/** 既定表示（verbose=false）で1.3宣言カタログ突合表に表示する行数の上限。 */
export const MAX_RECONCILIATION_ROWS = 20;
/** 既定表示（verbose=false）で1.4改訂宣言反映状況表に表示する行数の上限。 */
export const MAX_REVISION_ROWS = 20;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function confidenceRank(c: ContradictionConfidence): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1;
}

function formatPlaces(places: ContradictionPlace[], maxPlaces: number): string {
  const shown = places.slice(0, maxPlaces);
  const rest = places.length - shown.length;
  const base = shown.map((p) => `${p.document}:${p.lineIndex + 1}`).join(" / ");
  return rest > 0 ? `${base} / ほか${rest}箇所` : base;
}

function formatCandidateLine(c: BasisContradictionCandidate, maxPlaces: number): string {
  return `- [${c.confidence}] ${c.no} ${escapeCell(c.subject)}(${escapeCell(
    formatPlaces(c.places, maxPlaces)
  )}): ${escapeCell(c.summary)}`;
}

const CHECK_IDS: ContradictionCheckId[] = [
  "BC-01",
  "BC-02",
  "BC-03",
  "BC-04",
  "BC-05",
  "BC-06",
  "BC-07",
  "BC-08",
  "BC-09",
  "BC-10",
];

const CHECK_TITLES: Record<ContradictionCheckId, string> = {
  "BC-01": "同一IDの名称不一致",
  "BC-02": "構成要素ラベルの表記不一致",
  "BC-03": "構成要素の片側欠落",
  "BC-04": "同一トリガの遷移先不一致",
  "BC-05": "未定義の遷移先・表示先",
  "BC-06": "振る舞い未記述の操作要素",
  "BC-07": "一覧宣言と本文実体の主題不一致",
  "BC-08": "同一パラメータの値不一致",
  "BC-09": "改訂宣言の旧値が本文に残存",
  "BC-10": "少数派の遷移先(参考)",
};

export function renderBasisContradictionAudit(
  input: AuditBasisContradictionsInput,
  criteria: BasisContradictionCriteria = basisContradictionCriteria
): string {
  const { declaredEntities, knownResolved, idPatterns, relativeTargetTerms, minConfidence } = input;
  const verbose = input.verbose ?? false;
  const documents = sanitizeTestBasisDocuments(input.documents);
  const options = { idPatterns, relativeTargetTerms };

  const lines = buildBasisLines(documents, options);
  const { occurrences, excluded } = extractEntityOccurrencesWithQuality(lines, options);
  const uiElements = extractUiElements(lines);
  const transitions = extractTransitions(lines, options);
  const parameters = extractParameterValues(documents, lines);
  const revisionClaims = extractRevisionClaims(lines);
  const revisionRows = buildRevisionReconciliation(revisionClaims, lines);
  const reconciliationRows = buildDeclarationReconciliation(declaredEntities, occurrences);

  const allCandidates = buildContradictionCandidates(documents, { ...options, declaredEntities });

  const resolvedSubjects = new Set((knownResolved ?? []).map((k) => k.subject));
  const remaining = allCandidates.filter((c) => !resolvedSubjects.has(c.subject));
  const resolvedCandidates = allCandidates.filter((c) => resolvedSubjects.has(c.subject));

  const minRank = confidenceRank(minConfidence ?? "low");
  const visible = remaining.filter((c) => confidenceRank(c.confidence) >= minRank);
  const suppressedByConfidence = remaining.length - visible.length;

  const summary = summarizeContradictions(visible);

  const lineOut: string[] = [];
  lineOut.push("# テストベース仕様矛盾監査結果");
  lineOut.push("");
  if (!verbose) {
    lineOut.push(
      "既定(verbose未指定/false)は要約表示。1.3/1.4の表と2章の各検査節・2.12の優先度一覧に件数上限を適用し、打ち切った箇所には全件数と省略件数を併記する。全件は verbose: true で取得できる。"
    );
    lineOut.push("");
  }

  lineOut.push("## 1. 監査対象");
  lineOut.push("");
  lineOut.push("### 1.1 投入されたテストベース文書");
  lineOut.push("");
  for (const doc of documents) {
    lineOut.push(`- ${escapeCell(doc.name)}`);
  }
  lineOut.push("");

  lineOut.push("### 1.2 抽出サマリ");
  lineOut.push("");
  lineOut.push("| 文書 | ID出現数 | UI要素数 | 遷移数 | 数量表現数 | 改訂宣言数 |");
  lineOut.push("| --- | --- | --- | --- | --- | --- |");
  for (const doc of documents) {
    const idCount = occurrences.filter((o) => o.document === doc.name).length;
    const uiCount = uiElements.filter((e) => e.document === doc.name).length;
    const transitionCount = transitions.filter((t) => t.document === doc.name).length;
    const paramCount = parameters.filter((p) => p.document === doc.name).length;
    const revisionCount = revisionClaims.filter((r) => r.document === doc.name).length;
    lineOut.push(
      `| ${escapeCell(doc.name)} | ${idCount} | ${uiCount} | ${transitionCount} | ${paramCount} | ${revisionCount} |`
    );
  }
  lineOut.push("");

  lineOut.push("### 1.3 宣言カタログとの突合");
  lineOut.push("");
  if (reconciliationRows.length === 0) {
    lineOut.push("- declaredEntities が未指定のため、宣言カタログとの突合は本文の一覧表行からの自前抽出のみに基づく(照合対象なし)。");
  } else {
    const RECONCILIATION_STATUSES = ["matched", "declared-only", "actual-only", "name-mismatch"] as const;
    const reconciliationStatusCounts = RECONCILIATION_STATUSES.map(
      (s) => [s, reconciliationRows.filter((r) => r.status === s).length] as const
    );
    lineOut.push(
      `- 突合結果: 全${reconciliationRows.length}件（${reconciliationStatusCounts
        .map(([s, n]) => `${s}:${n}`)
        .join(" / ")}）`
    );
    const reconciliationRowsToShow = verbose
      ? reconciliationRows
      : reconciliationRows.slice(0, MAX_RECONCILIATION_ROWS);
    lineOut.push("| ID | 宣言名 | 実体名 | 状態 | 確信度 |");
    lineOut.push("| --- | --- | --- | --- | --- |");
    for (const row of reconciliationRowsToShow) {
      lineOut.push(
        `| ${escapeCell(row.id)} | ${escapeCell(row.declaredName ?? "-")} | ${escapeCell(
          row.actualName ?? "-"
        )} | ${row.status} | ${row.confidence} |`
      );
    }
    const reconciliationOmitted = reconciliationRows.length - reconciliationRowsToShow.length;
    if (reconciliationOmitted > 0) {
      lineOut.push(
        `- 宣言カタログとの突合: 全${reconciliationRows.length}件中 ${reconciliationRowsToShow.length}件を表示（${reconciliationOmitted}件を省略）。全件は verbose: true で取得できる。`
      );
    }
  }
  lineOut.push("");
  if ((knownResolved ?? []).length > 0) {
    lineOut.push("既知解消済み対象(knownResolved。候補からは除外し、理由のみここに記録する):");
    lineOut.push("");
    for (const k of knownResolved ?? []) {
      const count = resolvedCandidates.filter((c) => c.subject === k.subject).length;
      lineOut.push(`- ${escapeCell(k.subject)}(除外件数:${count}): ${escapeCell(k.reason)}`);
    }
    lineOut.push("");
  }

  lineOut.push("### 1.4 改訂宣言の反映状況");
  lineOut.push("");
  if (revisionRows.length === 0) {
    lineOut.push("- 改訂宣言(旧値→新値の変更宣言)は検出されなかった。");
  } else {
    const REVISION_STATUSES = ["residual", "resolved"] as const;
    const revisionStatusCounts = REVISION_STATUSES.map(
      (s) => [s, revisionRows.filter((r) => r.status === s).length] as const
    );
    lineOut.push(
      `- 改訂反映状況: 全${revisionRows.length}件（${revisionStatusCounts
        .map(([s, n]) => `${s}:${n}`)
        .join(" / ")}）`
    );
    const revisionRowsToShow = verbose ? revisionRows : revisionRows.slice(0, MAX_REVISION_ROWS);
    lineOut.push("| 文書 | 行 | 版 | 日付 | 旧値 | 新値 | 状態 |");
    lineOut.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of revisionRowsToShow) {
      lineOut.push(
        `| ${escapeCell(row.document)} | ${row.lineIndex + 1} | ${escapeCell(row.version)} | ${escapeCell(
          row.date
        )} | ${escapeCell(row.beforeValue)} | ${escapeCell(row.afterValue)} | ${row.status} |`
      );
    }
    const revisionOmitted = revisionRows.length - revisionRowsToShow.length;
    if (revisionOmitted > 0) {
      lineOut.push(
        `- 改訂宣言の反映状況: 全${revisionRows.length}件中 ${revisionRowsToShow.length}件を表示（${revisionOmitted}件を省略）。全件は verbose: true で取得できる。`
      );
    }
  }
  lineOut.push("");

  lineOut.push("## 2. 決定的検査(自動)");
  lineOut.push("");

  const bySection = new Map<ContradictionCheckId, BasisContradictionCandidate[]>();
  for (const id of CHECK_IDS) bySection.set(id, []);
  for (const c of visible) bySection.get(c.checkId)!.push(c);

  CHECK_IDS.forEach((id, i) => {
    lineOut.push(`### 2.${i + 1} ${CHECK_TITLES[id]}`);
    lineOut.push("");
    const list = bySection.get(id)!;
    if (list.length === 0) {
      lineOut.push("- なし");
    } else {
      const h = list.filter((c) => c.confidence === "high").length;
      const m = list.filter((c) => c.confidence === "medium").length;
      const l = list.filter((c) => c.confidence === "low").length;
      lineOut.push(`- 該当 ${list.length}件（high:${h} / medium:${m} / low:${l}）`);

      let shown: BasisContradictionCandidate[];
      if (verbose || list.length <= MAX_CANDIDATE_LINES_PER_CHECK) {
        shown = list;
      } else {
        const byConfidenceDesc = list
          .map((c, idx) => ({ c, idx }))
          .sort((a, b) => confidenceRank(b.c.confidence) - confidenceRank(a.c.confidence) || a.idx - b.idx)
          .slice(0, MAX_CANDIDATE_LINES_PER_CHECK)
          .sort((a, b) => a.idx - b.idx);
        shown = byConfidenceDesc.map((e) => e.c);
      }
      const maxPlaces = verbose ? Infinity : MAX_PLACES_PER_CANDIDATE;
      for (const c of shown) lineOut.push(formatCandidateLine(c, maxPlaces));
      if (shown.length < list.length) {
        lineOut.push(
          `- ${CHECK_TITLES[id]}: 全${list.length}件中 ${shown.length}件を表示（${
            list.length - shown.length
          }件を省略）。全件は verbose: true で取得できる。`
        );
      }
    }
    lineOut.push("");
  });

  lineOut.push("### 2.11 サマリ");
  lineOut.push("");
  const checkIdSummary = CHECK_IDS.map((id) => `${id}:${summary.byCheckId[id] ?? 0}`).join(", ");
  const excludedByRule = { "NF-01": 0, "NF-02": 0, "NF-03": 0, "NF-04": 0 } as Record<string, number>;
  for (const e of excluded) excludedByRule[e.ruleId] = (excludedByRule[e.ruleId] ?? 0) + 1;
  lineOut.push(
    `- 総候補数: ${summary.totalCandidates}(high:${summary.byConfidence.high ?? 0} / medium:${
      summary.byConfidence.medium ?? 0
    } / low:${summary.byConfidence.low ?? 0}) / 検査別: ${checkIdSummary} / 対象文書数: ${
      summary.documentCount
    } / 確信度抑制件数: ${suppressedByConfidence} / 既知解消除外件数: ${resolvedCandidates.length} / 抽出品質により除外: ${
      excluded.length
    }件(NF-01:${excludedByRule["NF-01"]} / NF-02:${excludedByRule["NF-02"]} / NF-03:${excludedByRule["NF-03"]} / NF-04:${excludedByRule["NF-04"]})`
  );

  // 前提ごとの依存区分は検査実行状況カタログ（単一の真実源）から導出する。
  // カタログの定義順が CHECK_IDS の順と一致しているため、既存の出力順・文言は変わらない。
  const ID_DEPENDENT_CHECKS = catalogIdsRequiring(
    "audit_basis_contradictions",
    "id-occurrence"
  ) as ContradictionCheckId[];
  const UI_DEPENDENT_CHECKS = catalogIdsRequiring(
    "audit_basis_contradictions",
    "ui-element"
  ) as ContradictionCheckId[];
  const TRANSITION_DEPENDENT_CHECKS = catalogIdsRequiring(
    "audit_basis_contradictions",
    "transition"
  ) as ContradictionCheckId[];

  const idCount = occurrences.length;
  const uiCount = uiElements.length;
  const transitionCount = transitions.length;

  if (idCount === 0 && uiCount === 0 && transitionCount === 0) {
    lineOut.push(
      `- 検査不能(要確認)の区分: ${CHECK_IDS.join(
        ", "
      )}（ID出現・UI要素・遷移がいずれも0件のため。未指摘は合格を意味しない）`
    );
  } else {
    const unavailable: ContradictionCheckId[] = [];
    const reasons: string[] = [];
    if (idCount === 0) {
      unavailable.push(...ID_DEPENDENT_CHECKS);
      reasons.push("ID出現");
    }
    if (uiCount === 0) {
      unavailable.push(...UI_DEPENDENT_CHECKS);
      reasons.push("UI要素");
    }
    if (transitionCount === 0) {
      unavailable.push(...TRANSITION_DEPENDENT_CHECKS);
      reasons.push("遷移");
    }
    if (unavailable.length > 0) {
      const unavailableSet = new Set(unavailable);
      const orderedUnavailable = CHECK_IDS.filter((id) => unavailableSet.has(id));
      lineOut.push(
        `- 検査不能(要確認)の区分: ${orderedUnavailable.join(", ")}（${reasons.join(
          "・"
        )}が0件のため。未指摘は合格を意味しない）`
      );
    }
  }
  lineOut.push("");

  // --- 2.12 対処優先度順の候補一覧 ---
  // 章節は places[].heading ではなく buildBasisLines の実体行から引く。
  // BC-02/03/05/06/09/10 は候補構築時に heading="" を渡しており、実体を表さないため。
  const headingByLineKey = new Map<string, string>();
  for (const l of lines) headingByLineKey.set(`${l.document}\n${l.lineIndex}`, l.heading);

  const severityByCheckId = new Map<string, FindingPrioritySeverity>(
    criteria.categories.map((c) => [c.id, c.severity as FindingPrioritySeverity])
  );
  const priorityInputs: FindingPriorityInput[] = visible.map((c) => ({
    id: c.no,
    categoryId: c.checkId,
    place: c.places[0]
      ? `${c.places[0].document}:${c.places[0].lineIndex + 1} ${
          headingByLineKey.get(`${c.places[0].document}\n${c.places[0].lineIndex}`) ?? ""
        }`.trimEnd()
      : "-",
    severity: severityByCheckId.get(c.checkId) ?? "medium",
    impactedIds: c.impactedIds ?? [],
    documents: distinctInOrder(c.places.map((p) => p.document)),
    sectionResolved: isSectionResolved(
      c.places.map((p) => headingByLineKey.get(`${p.document}\n${p.lineIndex}`))
    ),
  }));

  const prioritySection = renderFindingPrioritySection(
    "2.12 対処優先度順の候補一覧",
    "対処優先度順の候補一覧",
    priorityInputs,
    verbose
  );
  // 表の前に断定でないことの明示を1行入れる（見出し + 空行の直後）。
  prioritySection.splice(2, 0, "- 本表は矛盾の断定ではなく、確認着手順の提示である。");
  lineOut.push(...prioritySection);

  lineOut.push("## 3. 判定区分と対処指針");
  lineOut.push("");
  lineOut.push("| 区分ID | 区分 | 重大度 | 定義 | 対処 |");
  lineOut.push("| --- | --- | --- | --- | --- |");
  for (const c of criteria.categories) {
    lineOut.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.nameJa)} | ${c.severity} | ${escapeCell(c.definition)} | ${escapeCell(
        c.recommendedAction
      )} |`
    );
  }
  lineOut.push("");
  for (const note of criteria.notes) {
    lineOut.push(`- ${escapeCell(note)}`);
  }
  lineOut.push("");

  lineOut.push("## 4. 意味的確認の指示(意味的層)");
  lineOut.push("");
  lineOut.push("- 本節(2章)の候補はいずれも矛盾と断定されていない。決定的層は差分候補・確信度・根拠位置の提示までを担う。");
  lineOut.push("- 差分の正誤は本文の意図・図表・依頼元回答で判断すること。表記のどちらかが誤りとは限らない。");
  lineOut.push("- BC-10 は矛盾ではなく不揃いの可能性提示である。少数派だからといって誤りと決めつけないこと。");
  lineOut.push("- minConfidence で抑制された候補、knownResolved で除外された対象も、判断が変われば再度確認対象になり得る。");
  lineOut.push("");

  lineOut.push("## 5. 決定的層で検出できない矛盾の型");
  lineOut.push("");
  lineOut.push(
    "- (a) 図・画像中の記述と本文の不一致: 画面キャプチャや図表内の文言・数値が本文と食い違っていても、本検査はテキストしか扱わないため検出できない。"
  );
  lineOut.push(
    "- (b) 記載そのものが存在しない欠落: 導線・タイミング・上限値などが本文のどこにも記載されていない欠落は、矛盾する記述同士の突き合わせでは検出できない。"
  );
  lineOut.push(
    "- (c) 記述はあるが業務的に不適切な操作の許可: 記述として矛盾なく整合していても、業務要件やリスクの観点で許可すべきでない操作を許可している場合は検出できない。"
  );
  lineOut.push("- 上記の型は候補が0件であっても存在し得る。候補0件は「これらの矛盾が無いこと」を意味しない。");
  lineOut.push(
    `- (d) 抽出品質フィルタによる除外: 表セル連結由来の断片として ${excluded.length} 件の名称候補を母集団から除外している。除外は矛盾が無いことの証明ではなく、除外された断片の裏に真の矛盾が隠れていないかは原本で確認すること。`
  );
  lineOut.push("");

  // 入力ダイジェストを持たないツールのため、原文入力の実測値は documents と自前抽出結果から直接算出する。
  const charTotal = documents.reduce((sum, d) => sum + d.content.length, 0);
  lineOut.push(
    ...renderInspectabilitySection("audit_basis_contradictions", [
      {
        id: "documents-supplied",
        satisfied: documents.length >= 1,
        measured: `投入文書${documents.length}件・${charTotal}字`,
      },
      {
        id: "multiple-documents",
        satisfied: documents.length >= 2,
        measured: `投入文書${documents.length}件`,
      },
      { id: "id-occurrence", satisfied: idCount >= 1, measured: `ID出現${idCount}件` },
      { id: "ui-element", satisfied: uiCount >= 1, measured: `UI要素${uiCount}件` },
      { id: "transition", satisfied: transitionCount >= 1, measured: `遷移${transitionCount}件` },
      {
        id: "parameter-value",
        satisfied: parameters.length >= 1,
        measured: `数量パラメータ${parameters.length}件`,
      },
      {
        id: "revision-claim",
        satisfied: revisionClaims.length >= 1,
        measured: `改訂宣言${revisionClaims.length}件`,
      },
    ]).split("\n")
  );
  lineOut.push("");

  lineOut.push(
    ...renderNextToolsSection(
      "audit_basis_contradictions",
      visible.length > 0 ? ["has-contradictions"] : [],
      input.completedTools
    ).split("\n")
  );

  return lineOut.join("\n").trimEnd() + "\n";
}

export const auditBasisContradictionsInputShape = {
  ...completedToolsInputShape,
  documents: z
    .array(
      z.object({
        name: z.string().describe("Test basis document name"),
        content: z.string().describe("Free-text document content (Markdown / plain text, format agnostic)"),
      })
    )
    .min(1)
    .describe("Test basis documents to extract IDs, UI elements, transitions, parameters and revision claims from"),
  declaredEntities: z
    .array(
      z.object({
        id: z.string().describe("Entity id, e.g. a screen or feature id"),
        name: z.string().describe("Name declared by the caller for this id"),
        kind: z.string().optional().describe("Optional entity kind, e.g. screen / feature"),
        sourceDocument: z.string().optional().describe("Optional document name this declaration came from"),
      })
    )
    .optional()
    .describe(
      "Caller-declared id-to-name catalog. If omitted, list-row declarations extracted from the documents are treated as the declared side"
    ),
  knownResolved: z
    .array(
      z.object({
        subject: z.string().describe("Candidate subject already judged resolved or intentional"),
        reason: z.string().describe("Reason why this subject is already resolved or intentional"),
      })
    )
    .optional()
    .describe("Subjects already judged resolved/intentional, excluded from candidates and listed with reasons in 1.3"),
  idPatterns: z
    .array(z.string())
    .optional()
    .describe(
      "Extra regular expression sources for requirement/feature IDs, added to the default pattern. Capture group count decides how the ID is built: 1 group = group 1 is used as the whole ID as-is (no hyphen joining), 2 groups = reconstructed as `${group1}-${group2}` (default pattern behavior), 0 groups = the whole match is used. Use a 1-group pattern for numeric-only IDs (031), dot-separated IDs (3.1.2) and underscore IDs (REQ_001) so the reported ID matches the notation in the source document. If a given pattern matches nothing, a [high] finding is emitted in the input digest."
    ),
  relativeTargetTerms: z
    .array(z.string())
    .optional()
    .describe("Additional relative transition-target terms, appended to the default list"),
  minConfidence: z
    .enum(["high", "medium", "low"])
    .optional()
    .describe("Minimum confidence of candidates to include in the output (default: low, i.e. all candidates)"),
  verbose: z
    .boolean()
    .optional()
    .describe(
      "If false/omitted (default), sections 1.3/1.4, each check section in chapter 2 and the 2.12 priority list are truncated to a fixed number of rows with total/omitted counts noted. If true, lists every row in full (as in previous versions)."
    ),
} as const;

export function registerAuditBasisContradictionsTool(server: McpServer): void {
  server.registerTool(
    "audit_basis_contradictions",
    {
      title: "Audit Basis Contradictions",
      description:
        "テストベース文書群からID・画面要素・遷移・数量パラメータ・改訂宣言を自前抽出し、同一対象について複数箇所が異なることを言っている差分候補を決定的に列挙する。矛盾か否かの判定は行わず、候補・確信度・根拠位置の提示までを担う。",
      inputSchema: auditBasisContradictionsInputShape,
    },
    async (input) => {
      const markdown = renderBasisContradictionAudit(input as AuditBasisContradictionsInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
