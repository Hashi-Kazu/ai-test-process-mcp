import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { coverageBalanceCriteria } from "../resources/coverageBalanceCriteria.js";
import { analyzeCoverageBalance, hasGlossarySection } from "../coverageBalanceAnalysis.js";
import { buildDigestSignals, renderInspectabilitySection } from "../inspectabilityAnalysis.js";
import {
  buildDocumentDigests,
  findDocumentDigestFindings,
  renderDocumentDigestLines,
} from "../documentDigest.js";
import type {
  AuditCoverageBalanceInput,
  CoverageBalanceCheckId,
  CoverageBalanceCriteria,
  CoverageBalanceDistributionRow,
  CoverageBalanceFinding,
} from "../types.js";

const FINDING_RENDER_LIMIT = 50;
const DISTRIBUTION_ROW_RENDER_LIMIT = 60;
const TERM_ROW_RENDER_LIMIT = 40;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function renderFindings(
  lines: string[],
  findings: CoverageBalanceFinding[],
  checkIds: CoverageBalanceCheckId[]
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

function renderDistributionTable(lines: string[], rows: CoverageBalanceDistributionRow[]): void {
  lines.push("| 区分ID | 区分名 | ケース数 | 構成比(%) | 代表ケースID |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of rows.slice(0, DISTRIBUTION_ROW_RENDER_LIMIT)) {
    lines.push(
      `| ${escapeCell(row.id)} | ${escapeCell(row.label)} | ${row.caseCount} | ${
        row.sharePercent
      } | ${escapeCell(row.sampleCaseIds.join(", "))} |`
    );
  }
  if (rows.length > DISTRIBUTION_ROW_RENDER_LIMIT) {
    lines.push("");
    lines.push(`- 他 ${rows.length - DISTRIBUTION_ROW_RENDER_LIMIT} 区分`);
  }
}

export function renderCoverageBalanceAudit(
  input: AuditCoverageBalanceInput,
  criteria: CoverageBalanceCriteria = coverageBalanceCriteria
): string {
  const result = analyzeCoverageBalance(input, criteria);
  const { findings, summary } = result;
  const deliverables = input.deliverables ?? [];
  const hasDeliverables = deliverables.length > 0;
  const hasDeclared =
    input.declaredDistributions !== undefined && input.declaredDistributions.length > 0;

  const lines: string[] = [];
  lines.push("# 網羅バランス・用語定義監査結果");
  lines.push("");

  lines.push("## 1. 監査対象");
  lines.push("");
  lines.push("### 1.1 投入されたテストケース・成果物");
  lines.push("");
  lines.push(
    `- テストケース数: ${summary.caseCount} / 成果物数: ${summary.deliverableCount} / 分布件数宣言: ${
      input.declaredDistributions?.length ?? 0
    } 件`
  );
  lines.push(
    `- 独自用語候補の最小出現回数: ${input.minTermOccurrences ?? 2} 回 / 追加既知用語: ${
      input.additionalKnownTerms?.length ?? 0
    } 件`
  );
  if (hasDeliverables) {
    lines.push(`- 投入成果物: ${deliverables.map((d) => escapeCell(d.name)).join(", ")}`);
  } else {
    lines.push("- deliverables が未指定のため、成果物本文を根拠とする実体照合はすべて検査不能(要確認)");
  }
  lines.push("");

  if (hasDeliverables) {
    lines.push("### 1.2 入力ダイジェスト");
    lines.push("");
    const digestRows = buildDocumentDigests(
      deliverables.map((d) => ({ name: d.name, content: d.content }))
    );
    const digestFindings = findDocumentDigestFindings(digestRows);
    for (const l of renderDocumentDigestLines(digestRows, digestFindings)) lines.push(l);
    lines.push("");
  }

  lines.push("## 2. 決定的検査(自動)");
  lines.push("");

  lines.push("### 2.1 観点カテゴリ別ケース数分布");
  lines.push("");
  renderDistributionTable(lines, result.perspectiveRows);
  lines.push("");

  lines.push("### 2.2 技法別ケース数分布");
  lines.push("");
  renderDistributionTable(lines, result.techniqueRows);
  lines.push("");

  lines.push("### 2.3 テストレベル別ケース数分布");
  lines.push("");
  renderDistributionTable(lines, result.levelRows);
  lines.push("");

  lines.push("### 2.4 観点カテゴリ × テストレベル クロス表");
  lines.push("");
  lines.push(
    `| 観点カテゴリ | ${result.crossTable.levelLabels.map((l) => escapeCell(l)).join(" | ")} | 計 |`
  );
  lines.push(`| --- | ${result.crossTable.levelLabels.map(() => "---").join(" | ")} | --- |`);
  for (const row of result.crossTable.rows.slice(0, DISTRIBUTION_ROW_RENDER_LIMIT)) {
    lines.push(
      `| ${escapeCell(row.id)}(${escapeCell(row.label)}) | ${row.counts.join(" | ")} | ${row.total} |`
    );
  }
  lines.push("");

  lines.push("### 2.5 分布の宣言と実体の照合");
  lines.push("");
  renderFindings(lines, findings, ["CBC-01", "CBC-02", "CBC-03"]);
  if (hasDeclared) {
    renderFindings(lines, findings, ["CBC-04", "CBC-14"]);
  } else {
    lines.push("- declaredDistributions が未指定のため宣言件数と実集計の照合ができない(要確認)");
  }
  if (hasDeliverables) {
    renderFindings(lines, findings, ["CBC-05", "CBC-06"]);
  } else {
    lines.push(
      "- deliverables が未指定のため実体照合ができない(要確認)。計上ケースIDの本文実在性(CBC-05)と本文側の未投入ケースID(CBC-06)はいずれも未検査であり、合格ではない。"
    );
  }
  lines.push("");

  lines.push("### 2.6 分布の偏りの観測値");
  lines.push("");
  lines.push(
    `- 観点カテゴリ軸: 割り当て済み ${result.concentration.assignedCaseCount} 件 / 最大区分の占有率 ${result.concentration.topShare}% / 上位2区分の合計 ${result.concentration.topTwoShare}% / 0件区分 ${result.concentration.zeroBucketCount} 区分`
  );
  lines.push(
    "- 本ツールは望ましい分布の基準を持たない。偏りの是非は意味的層で判断すること。構成比(%)は観測値であり達成度ではない。"
  );
  renderFindings(lines, findings, ["CBC-07", "CBC-08"]);
  lines.push("");

  lines.push("### 2.7 独自用語候補と定義の突き合わせ");
  lines.push("");
  if (!hasDeliverables) {
    lines.push(
      "- deliverables が未指定のため実体照合ができない(要確認)。用語集の有無(CBC-09)・定義欠落(CBC-10)・未使用定義(CBC-11)・重複定義(CBC-12)・表記ゆれ(CBC-13)はいずれも未検査であり、合格ではない。"
    );
  } else {
    lines.push(
      `- 独自用語候補: ${summary.termCandidateCount} 件 / 抽出できた用語定義: ${summary.termDefinitionCount} 件`
    );
    lines.push("");
    if (result.termCandidates.length === 0) {
      lines.push("- 独自用語候補は検出されなかった。候補0件は用語定義が十分であることを意味しない。");
    } else {
      lines.push("| 用語 | 抽出規則 | 出現回数 | 定義 | 初出箇所 |");
      lines.push("| --- | --- | --- | --- | --- |");
      const definedTerms = new Set(result.termDefinitions.map((d) => d.term));
      for (const c of result.termCandidates.slice(0, TERM_ROW_RENDER_LIMIT)) {
        const kind = criteria.termCandidateKinds.find((k) => k.id === c.kindId);
        const place = c.places[0];
        lines.push(
          `| ${escapeCell(c.term)} | ${escapeCell(
            kind === undefined ? c.kindId : `${kind.id}(${kind.label})`
          )} | ${c.occurrences} | ${definedTerms.has(c.term) ? "あり" : "なし"} | ${escapeCell(
            place === undefined ? "-" : `${place.deliverable}:${place.lineIndex + 1}`
          )} |`
        );
      }
      if (result.termCandidates.length > TERM_ROW_RENDER_LIMIT) {
        lines.push("");
        lines.push(`- 他 ${result.termCandidates.length - TERM_ROW_RENDER_LIMIT} 件`);
      }
    }
    lines.push("");
    renderFindings(lines, findings, ["CBC-09", "CBC-10", "CBC-11", "CBC-12", "CBC-13"]);
  }
  lines.push("");

  lines.push("### 2.8 指摘一覧");
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

  lines.push("### 2.9 サマリ");
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
  if (!hasDeliverables || !hasDeclared) {
    const unchecked: string[] = [];
    if (!hasDeclared) unchecked.push("CBC-04");
    if (!hasDeliverables) {
      unchecked.push("CBC-05", "CBC-06", "CBC-09", "CBC-10", "CBC-11", "CBC-12", "CBC-13");
    }
    lines.push(`- 検査不能(要確認)の区分: ${unchecked.join(", ")}（未指摘は合格を意味しない）`);
  }
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
    "- 2.1〜2.4 の分布は観測値である。偏りが対象システムのリスク構造・テストベースの記述量から説明できるかを判断し、説明を成果物に書くこと。"
  );
  lines.push(
    "- 2.5 の未知ID・未宣言軸は、カタログの選び直しかカタログ外運用の明文化のどちらで解決するかを決めること。"
  );
  lines.push(
    "- 2.6 の0件区分は、対象外なのか設計漏れなのかを区分ごとに判断し、対象外であれば理由を明記すること。"
  );
  lines.push(
    "- 2.7 の独自用語候補は機械的抽出であり、固有名詞・製品名も含まれる。定義が必要な語かどうかを人が選別すること。"
  );
  lines.push(
    "- 構成比(%)を達成度として提示する場合は、audit_deliverable_consistency の網羅率検査で分母が母集団実数であることまで裏付けること。"
  );
  lines.push("");

  lines.push("## 5. 決定的層で検出できない型");
  lines.push("");
  lines.push(
    "- 分布の妥当性そのもの。件数が揃っていても、各ケースの内容が観点を実際に検証しているかは判定できない。"
  );
  lines.push(
    "- 同一区分内でのケースの重複・冗長。同じ確認を繰り返すケースが多数あっても件数としては均等に見える。"
  );
  lines.push(
    "- 定義が存在しても、その定義が誤っている・曖昧である場合。定義の有無しか検査できない。"
  );
  lines.push(
    "- 投入していない成果物・テストケースに関する事実。検査は投入された入力の範囲でしか成立しない。"
  );
  lines.push("");

  const signals: string[] = [];
  if (findings.some((f) => f.checkId === "CBC-05" || f.checkId === "CBC-06")) {
    signals.push("has-ungrounded-case-ids");
  }
  if (findings.some((f) => f.checkId === "CBC-09" || f.checkId === "CBC-10")) {
    signals.push("has-undefined-custom-terms");
  }
  if (findings.some((f) => f.checkId === "CBC-07")) signals.push("has-zero-count-buckets");

  const glossarySection = hasGlossarySection(deliverables, criteria);
  lines.push(
    ...renderInspectabilitySection("audit_coverage_balance", [
      ...buildDigestSignals(
        hasDeliverables
          ? buildDocumentDigests(deliverables.map((d) => ({ name: d.name, content: d.content })))
          : []
      ),
      // 原文が未投入のときも「未計測」にせず、0件であることを明示的な実測値として供給する。
      {
        id: "documents-supplied",
        satisfied: hasDeliverables,
        measured: hasDeliverables
          ? `原文文書${deliverables.length}件・${deliverables.reduce(
              (sum, d) => sum + d.content.length,
              0
            )}字`
          : "原文文書 0件",
      },
      {
        id: "declared-distribution",
        satisfied: hasDeclared,
        measured: `分布件数宣言${input.declaredDistributions?.length ?? 0}件`,
      },
      {
        id: "tabulated-cases",
        satisfied: summary.caseCount >= 1,
        measured: `集計対象テストケース${summary.caseCount}件`,
      },
      {
        id: "glossary-section",
        satisfied: glossarySection,
        measured: `用語集セクション${glossarySection ? "あり" : "なし"}・抽出できた用語定義${
          summary.termDefinitionCount
        }件`,
      },
      {
        id: "custom-term-candidate",
        satisfied: summary.termCandidateCount >= 1,
        measured: `独自用語候補${summary.termCandidateCount}件`,
      },
    ]).split("\n")
  );
  lines.push("");

  lines.push(
    ...renderNextToolsSection("audit_coverage_balance", signals, input.completedTools).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

export const auditCoverageBalanceInputShape = {
  ...completedToolsInputShape,
  testCases: z
    .array(
      z.object({
        caseId: z.string().describe("Test case id, e.g. TCS-001"),
        title: z.string().optional().describe("Test case title"),
        perspectiveCategoryId: z
          .string()
          .optional()
          .describe("Perspective category id (TPC-01..) or perspective id (TPC-01-01..)"),
        techniqueId: z.string().optional().describe("Applied technique id from the technique catalog"),
        testLevel: z
          .enum(["component-testing", "integration-testing", "system-testing", "acceptance-testing"])
          .optional()
          .describe("Declared test level for this case"),
        testType: z.string().optional().describe("Test type label"),
      })
    )
    .min(1)
    .describe(
      "Generated test cases to tabulate; accepts the same field names as generate_test_cases testCases"
    ),
  deliverables: z
    .array(
      z.object({
        name: z.string().describe("Deliverable document name"),
        content: z.string().describe("Full deliverable content (Markdown / plain text)"),
      })
    )
    .optional()
    .describe(
      "Deliverables whose body text substantiates the tabulated case ids and defines the custom terms"
    ),
  declaredDistributions: z
    .array(
      z.object({
        axis: z.enum(["perspective", "technique", "test-level"]),
        label: z.string().describe("Bucket id on the axis, e.g. TPC-01 / boundary-value-analysis"),
        declaredCount: z.number().int().nonnegative(),
      })
    )
    .optional()
    .describe("Declared per-bucket case counts, reconciled against the actual tabulation"),
  additionalKnownTerms: z
    .array(z.string())
    .optional()
    .describe("Extra terms treated as already known, excluded from custom term candidates"),
  minTermOccurrences: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Minimum body occurrences for a custom term candidate. Defaults to 2"),
  caseIdPatterns: z
    .array(z.string())
    .optional()
    .describe("Additional case id regular expression patterns, appended to the default pattern"),
} as const;

export function registerAuditCoverageBalanceTool(server: McpServer): void {
  server.registerTool(
    "audit_coverage_balance",
    {
      title: "Audit Coverage Balance and Term Definitions",
      description:
        "生成済みテストケース群の観点カテゴリ別・技法別・テストレベル別のケース数分布を決定的に集計し、" +
        "観点カテゴリ×テストレベルのクロス表と偏りの観測値を提示する。分布は観測値として示すのみで望ましい分布の基準は持たず、" +
        "合否は宣言と実体の食い違い（未知の区分ID・宣言件数と実集計の不一致・分布に計上したケースIDが成果物本文に実在しない・" +
        "本文にあるのに集計対象へ投入されていない）に対してのみ付ける。" +
        "あわせて成果物中の独自用語候補を機械的に抽出し、成果物内に定義があるか・定義だけで未使用でないか・重複定義がないかを検査する。",
      inputSchema: auditCoverageBalanceInputShape,
    },
    async (input) => {
      const markdown = renderCoverageBalanceAudit(input as AuditCoverageBalanceInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
