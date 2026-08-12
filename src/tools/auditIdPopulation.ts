import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import { buildDigestSignals, renderInspectabilitySection } from "../inspectabilityAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { idPopulationAuditCriteria } from "../resources/idPopulationAuditCriteria.js";
import {
  buildDefinedIdIndex,
  buildDocumentPopulationStats,
  buildIdPopulationMatrix,
  buildPopulationDiff,
  findExcludedIds,
  findMissingDocuments,
  findNeverDeclaredIds,
  findUndefinedPopulationIds,
  summarizeIdPopulation,
} from "../idPopulationAnalysis.js";
import { splitIdIntoPrefixAndNumber } from "../testBasisAnalysis.js";
import {
  buildDocumentDigests,
  findDocumentDigestFindings,
  findUnmatchedIdPatterns,
  renderDocumentDigestLines,
  sanitizeTestBasisDocuments,
} from "../documentDigest.js";
import {
  isSectionResolved,
  renderFindingPrioritySection,
  type FindingPriorityInput,
  type FindingPrioritySeverity,
} from "../findingPriority.js";
import type {
  AuditIdPopulationInput,
  IdPopulationAuditCriteria,
  IdPopulationRow,
  PopulationDiffRow,
  UndefinedPopulationId,
} from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/**
 * 2.9節（対処優先度順の指摘一覧）の入力を、2.2/2.3/2.4/2.6/2.7 の決定的判定から作る。
 * severity は判定区分カタログ（idPopulationAuditCriteria）の宣言値をそのまま使う。
 * PAC-06（文書単位の反映率低下）はフラグ化された決定的判定が無いため対象外。
 */
export function buildIdPopulationPriorityInputs(args: {
  neverDeclared: readonly IdPopulationRow[];
  excluded: readonly IdPopulationRow[];
  undefinedIds: readonly UndefinedPopulationId[];
  missingDocuments: readonly string[];
  populationDiff: readonly PopulationDiffRow[];
  criteria: IdPopulationAuditCriteria;
}): FindingPriorityInput[] {
  const severityOf = (categoryId: string): FindingPrioritySeverity =>
    (args.criteria.categories.find((c) => c.id === categoryId)?.severity as
      | FindingPrioritySeverity
      | undefined) ?? "medium";

  const inputs: FindingPriorityInput[] = [];
  const counters = new Map<string, number>();
  const nextId = (categoryId: string) => {
    const n = (counters.get(categoryId) ?? 0) + 1;
    counters.set(categoryId, n);
    return `${categoryId}#${n}`;
  };

  for (const row of args.neverDeclared) {
    inputs.push({
      id: nextId("PAC-01"),
      categoryId: "PAC-01",
      place: `${row.document}:${row.lineIndex + 1} ${row.heading}`,
      severity: severityOf("PAC-01"),
      impactedIds: [row.id],
      documents: [row.document],
      sectionResolved: isSectionResolved([row.heading]),
    });
  }
  for (const row of args.excluded) {
    inputs.push({
      id: nextId("PAC-02"),
      categoryId: "PAC-02",
      place: `${row.document}:${row.lineIndex + 1} ${row.heading}`,
      severity: severityOf("PAC-02"),
      impactedIds: [row.id],
      documents: [row.document],
      sectionResolved: isSectionResolved([row.heading]),
    });
  }
  for (const u of args.undefinedIds) {
    inputs.push({
      id: nextId("PAC-03"),
      categoryId: "PAC-03",
      place: `${u.populations.join(", ")} / (テストベース外)`,
      severity: severityOf("PAC-03"),
      impactedIds: [u.id],
      // 母集団は文書ではないため文書横断は0点。
      documents: [],
      sectionResolved: false,
    });
  }
  for (const name of args.missingDocuments) {
    inputs.push({
      id: nextId("PAC-04"),
      categoryId: "PAC-04",
      place: `${name} / (未投入)`,
      severity: severityOf("PAC-04"),
      impactedIds: [],
      documents: [name],
      sectionResolved: false,
    });
  }
  for (const row of args.populationDiff) {
    if (row.missingIds.length === 0) continue;
    inputs.push({
      id: nextId("PAC-05"),
      categoryId: "PAC-05",
      place: `${row.population} / (母集団差分)`,
      severity: severityOf("PAC-05"),
      impactedIds: row.missingIds,
      documents: [],
      sectionResolved: false,
    });
  }
  return inputs;
}

export function renderIdPopulationAudit(
  input: AuditIdPopulationInput,
  criteria: IdPopulationAuditCriteria = idPopulationAuditCriteria
): string {
  const { declaredPopulations, exclusions, expectedDocumentNames, idPatterns } = input;
  const documents = sanitizeTestBasisDocuments(input.documents);
  const includeCoverageTargetIds = input.includeCoverageTargetIds ?? true;
  const verbose = input.verbose ?? false;

  const defined = buildDefinedIdIndex(documents, { idPatterns, includeCoverageTargetIds });
  const rows = buildIdPopulationMatrix(defined, declaredPopulations, exclusions);
  const neverDeclared = findNeverDeclaredIds(rows);
  const excluded = findExcludedIds(rows);
  const undefinedIds = findUndefinedPopulationIds(defined, declaredPopulations);
  const documentStats = buildDocumentPopulationStats(rows, documents);
  const missingDocuments = findMissingDocuments(documents, expectedDocumentNames);
  const populationDiff = buildPopulationDiff(declaredPopulations);
  const summary = summarizeIdPopulation(rows, undefinedIds, missingDocuments);

  const digestRows = buildDocumentDigests(documents, { idPatterns });
  const digestFindings = findDocumentDigestFindings(digestRows);
  const unmatchedIdPatterns = findUnmatchedIdPatterns(documents, { idPatterns });

  const lines: string[] = [];
  lines.push("# ID母集団監査結果");
  lines.push("");
  lines.push(
    "既定(verbose未指定/false)は要約表示。2.1節は判定フラグ(never-declared/excluded)付きの行のみ表示する。全件が必要な場合は `verbose: true` を指定すること。"
  );
  if (!verbose) {
    lines.push(
      "既定では 2.9節の対処優先度順の指摘一覧に件数上限を適用し、打ち切った箇所には全件数と省略件数を併記する。"
    );
  }
  lines.push("");

  lines.push("## 1. 監査対象");
  lines.push("");
  lines.push("### 1.1 投入されたテストベース文書");
  lines.push("");
  for (const doc of documents) {
    lines.push(`- ${escapeCell(doc.name)}`);
  }
  lines.push("");
  for (const l of renderDocumentDigestLines(digestRows, digestFindings, unmatchedIdPatterns)) lines.push(l);
  lines.push("");
  lines.push("### 1.2 宣言された母集団");
  lines.push("");
  lines.push("| 母集団 | ID件数 |");
  lines.push("| --- | --- |");
  for (const p of declaredPopulations) {
    const label = p.label ? `${p.toolName}(${p.label})` : p.toolName;
    lines.push(`| ${escapeCell(label)} | ${p.ids.length} |`);
  }
  lines.push("");

  lines.push("## 2. 決定的検査(自動)");
  lines.push("");

  lines.push("### 2.1 定義済みID × 母集団 突き合わせ表");
  lines.push("");
  const prefixRowStats = new Map<
    string,
    { total: number; declared: number; excluded: number; neverDeclared: number }
  >();
  for (const row of rows) {
    const { prefix } = splitIdIntoPrefixAndNumber(row.id);
    const stat = prefixRowStats.get(prefix) ?? {
      total: 0,
      declared: 0,
      excluded: 0,
      neverDeclared: 0,
    };
    stat.total += 1;
    if (row.status === "declared") stat.declared += 1;
    else if (row.status === "excluded") stat.excluded += 1;
    else if (row.status === "never-declared") stat.neverDeclared += 1;
    prefixRowStats.set(prefix, stat);
  }
  lines.push("| プレフィックス | 定義ID数 | declared | excluded | never-declared |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const [prefix, stat] of prefixRowStats) {
    lines.push(
      `| ${escapeCell(prefix)} | ${stat.total} | ${stat.declared} | ${stat.excluded} | ${stat.neverDeclared} |`
    );
  }
  lines.push("");

  const rowsToShow = verbose ? rows : rows.filter((r) => r.status !== "declared");
  lines.push("| ID | 定義文書 | 行 | 章節 | 宣言された母集団 | 状態 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of rowsToShow) {
    lines.push(
      `| ${escapeCell(row.id)} | ${escapeCell(row.document)} | ${row.lineIndex + 1} | ${escapeCell(
        row.heading
      )} | ${escapeCell(row.declaredIn.length > 0 ? row.declaredIn.join(", ") : "-")} | ${row.status} |`
    );
  }
  if (rowsToShow.length === 0 && rows.length > 0) {
    lines.push("");
    lines.push("- フラグ対象の行なし（全IDが declared）。全件を見るには verbose: true を指定。");
  }
  lines.push("");

  lines.push("### 2.2 未宣言ID一覧");
  lines.push("");
  if (neverDeclared.length === 0) {
    lines.push("- 未宣言IDなし");
  } else {
    for (const row of neverDeclared) {
      lines.push(
        `- [high] ${row.id}(${row.document}:${row.lineIndex + 1} ${escapeCell(
          row.heading
        )}): どの母集団にも渡されていない。母集団に追加するか、exclusions に除外理由を明記すること。`
      );
    }
  }
  lines.push("");

  lines.push("### 2.3 除外宣言されたID");
  lines.push("");
  if (excluded.length === 0) {
    lines.push("- なし");
  } else {
    for (const row of excluded) {
      lines.push(
        `- [info] ${row.id}(${row.document}:${row.lineIndex + 1} ${escapeCell(row.heading)}): ${escapeCell(
          row.exclusionReason ?? ""
        )}`
      );
    }
  }
  lines.push("");

  lines.push("### 2.4 テストベースに定義が無い母集団ID");
  lines.push("");
  if (undefinedIds.length === 0) {
    lines.push("- なし");
  } else {
    for (const u of undefinedIds) {
      lines.push(
        `- [high] ${u.id}: ${escapeCell(u.populations.join(", "))} に含まれるが、テストベースの定義行に存在しない。`
      );
    }
  }
  lines.push("");

  lines.push("### 2.5 文書別の母集団反映率");
  lines.push("");
  lines.push("| 文書 | 定義ID数 | 宣言済み数 | 反映率(%) | 未宣言ID |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const stat of documentStats) {
    lines.push(
      `| ${escapeCell(stat.document)} | ${stat.definedCount} | ${stat.declaredCount} | ${
        stat.declarationRate
      } | ${escapeCell(stat.neverDeclaredIds.length > 0 ? stat.neverDeclaredIds.join(", ") : "-")} |`
    );
  }
  lines.push("");

  lines.push("### 2.6 未投入のテストベース文書");
  lines.push("");
  if (!expectedDocumentNames || expectedDocumentNames.length === 0) {
    lines.push("- expectedDocumentNames が未指定のため未投入文書を検出できない(要確認)");
  } else if (missingDocuments.length === 0) {
    lines.push("- なし");
  } else {
    for (const name of missingDocuments) {
      lines.push(
        `- [high] ${escapeCell(name)}: expectedDocumentNames に指定されているが documents に含まれていない。全文を投入して再実行すること。`
      );
    }
  }
  lines.push("");

  lines.push("### 2.7 母集団間の差分(工程間の縮退)");
  lines.push("");
  lines.push("| 母集団 | ID件数 | 最大母集団に対する欠落ID |");
  lines.push("| --- | --- | --- |");
  for (const row of populationDiff) {
    lines.push(
      `| ${escapeCell(row.population)} | ${row.idCount} | ${escapeCell(
        row.missingIds.length > 0 ? row.missingIds.join(", ") : "-"
      )} |`
    );
  }
  lines.push("");

  lines.push("### 2.8 サマリ");
  lines.push("");
  lines.push(
    `- 定義ID総数: ${summary.definedTotal} / 宣言済み: ${summary.declaredTotal} / 除外宣言: ${summary.excludedTotal} / 未宣言: ${summary.neverDeclaredTotal} / 母集団反映率: ${summary.declarationRate}% / テストベース未定義ID数: ${summary.undefinedPopulationIdTotal} / 未投入文書数: ${summary.missingDocumentTotal} / ダイジェスト指摘数: ${digestFindings.length}`
  );
  lines.push("");

  lines.push(
    ...renderFindingPrioritySection(
      "2.9 対処優先度順の指摘一覧",
      "対処優先度順の指摘一覧",
      buildIdPopulationPriorityInputs({
        neverDeclared,
        excluded,
        undefinedIds,
        missingDocuments,
        populationDiff,
        criteria,
      }),
      verbose
    )
  );

  lines.push("## 3. 判定区分と対処指針");
  lines.push("");
  lines.push("| 区分ID | 区分 | 重大度 | 説明 | 対処 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const c of criteria.categories) {
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.nameJa)} | ${c.severity} | ${escapeCell(
        c.description
      )} | ${escapeCell(c.action)} |`
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
    "- 2.2 の未宣言IDについて、実際にスコープ外なのか、単に対象のツール呼び出しへの投入漏れなのかを判断すること。"
  );
  lines.push("- 2.3 の除外宣言について、除外理由がスコープ外・対象外の説明として妥当かを確認すること。");
  lines.push("- 2.6 で未投入文書が検出された場合、該当文書の全文を投入して再監査すること。");
  lines.push(
    "- 2.7 で欠落IDがある場合、どの工程（ツール呼び出し）でIDが失われたかを特定し、意図的な絞り込みか見落としかを確認すること。"
  );
  lines.push("");

  const declaredIdTotal = declaredPopulations.reduce((sum, p) => sum + p.ids.length, 0);
  lines.push(
    ...renderInspectabilitySection("audit_id_population", [
      ...buildDigestSignals(digestRows),
      {
        id: "population-declared",
        satisfied: declaredIdTotal >= 1,
        measured: `宣言母集団${declaredPopulations.length}件・宣言ID${declaredIdTotal}件`,
      },
      {
        id: "exclusions-declared",
        satisfied: (exclusions ?? []).length >= 1,
        measured: `除外宣言${(exclusions ?? []).length}件`,
      },
      {
        id: "expected-documents",
        satisfied: (expectedDocumentNames ?? []).length >= 1,
        measured: `期待文書名${(expectedDocumentNames ?? []).length}件`,
      },
      {
        id: "multiple-populations",
        satisfied: declaredPopulations.length >= 2,
        measured: `宣言母集団${declaredPopulations.length}件`,
      },
    ]).split("\n")
  );
  lines.push("");

  lines.push(
    ...renderNextToolsSection(
      "audit_id_population",
      [
        ...(neverDeclared.length > 0 ? ["has-never-declared-ids"] : []),
        ...(undefinedIds.length > 0 || missingDocuments.length > 0 ? ["has-undefined-population-ids"] : []),
      ],
      input.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

export const auditIdPopulationInputShape = {
  ...completedToolsInputShape,
  documents: z
    .array(
      z.object({
        name: z.string().describe("Test basis document name"),
        content: z.string().describe("Free-text document content (Markdown / plain text, format agnostic)"),
      })
    )
    .min(1)
    .describe("Test basis documents to extract defined IDs from"),
  declaredPopulations: z
    .array(
      z.object({
        toolName: z.string().describe("Name of the tool the population was passed to, e.g. extract_test_conditions"),
        label: z.string().optional().describe("Optional label to disambiguate multiple calls to the same tool"),
        ids: z.array(z.string()).describe("IDs actually declared/passed to this tool call"),
      })
    )
    .min(1)
    .describe("Declared ID populations actually passed to each tool call, to be cross-checked against the test basis"),
  exclusions: z
    .array(
      z.object({
        id: z.string().describe("ID to exclude from the never-declared judgment"),
        reason: z.string().describe("Reason why this ID is intentionally out of scope"),
      })
    )
    .optional()
    .describe("IDs intentionally excluded from population coverage, with reasons"),
  expectedDocumentNames: z
    .array(z.string())
    .optional()
    .describe("Full list of test basis document names expected to be audited, used to detect missing documents"),
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
  verbose: z
    .boolean()
    .optional()
    .describe(
      "If false/omitted (default), section 2.1 shows a per-prefix count summary and lists rows only for IDs with status 'never-declared' or 'excluded', and section 2.9's remediation-priority list is capped at a fixed row limit with total/omitted counts noted. If true, lists every defined-ID row and every priority row in full (as in previous versions)."
    ),
} as const;

export function registerAuditIdPopulationTool(server: McpServer): void {
  server.registerTool(
    "audit_id_population",
    {
      title: "Audit ID Population",
      description:
        "テストベース文書から抽出した定義済みID全量と、各ツール呼び出しに実際に渡された母集団を突き合わせ、どの母集団にも渡されていないIDを決定的に検出する。網羅率100%が母集団の縮退による見かけの値でないことを検証する。" +
        "design_* 系エンジンが発行するコロン区切りの網羅対象ID（BV:/EP:/ST:/DT:/PW:/SC:/UC:/DL:/CFG:）も既定でID索引に含める。",
      inputSchema: auditIdPopulationInputShape,
    },
    async (input) => {
      const markdown = renderIdPopulationAudit(input as AuditIdPopulationInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
