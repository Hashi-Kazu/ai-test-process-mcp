import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { qualityCharacteristicModel } from "../resources/qualityCharacteristics.js";
import { qualityInUseCharacteristicModel } from "../resources/qualityInUseCharacteristics.js";
import { questionPriorityDefinitions } from "../resources/testPlanTemplate.js";
import {
  analyzePrefixes,
  buildRequirementSourceRefs,
  extractIdOccurrences,
  findAmbiguousTerms,
  findDuplicateIds,
  findUnresolvedReferences,
  splitIdIntoPrefixAndNumber,
} from "../testBasisAnalysis.js";
import {
  aggregateQuantitiesByUnit,
  analyzeTermUsage,
  buildBoundaryCandidates,
  buildDeterministicFindings,
  toBoundaryValuesToolInput,
} from "../requirementsAnalysis.js";
import {
  buildDocumentDigests,
  findDocumentDigestFindings,
  findUnmatchedIdPatterns,
  renderDocumentDigestLines,
  sanitizeTestBasisDocuments,
} from "../documentDigest.js";
import type { AnalyzeRequirementsInput, QualityCharacteristicModel } from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function listOrUnprovided(values: string[] | undefined): string[] {
  if (!values || values.length === 0) return ["- 未提供(要確認)"];
  return values.map((v) => `- ${v}`);
}

export function renderRequirementsAnalysis(
  input: AnalyzeRequirementsInput,
  model: QualityCharacteristicModel = qualityCharacteristicModel,
  inUseModel: QualityCharacteristicModel = qualityInUseCharacteristicModel
): string {
  const {
    idPatterns,
    additionalAmbiguousTerms,
    background,
    focusAreas,
    outOfScope,
    alreadyAssured,
    stakeholders,
    changeItems,
    qualityCharacteristicIds,
  } = input;
  const verbose = input.verbose ?? false;
  const documents = sanitizeTestBasisDocuments(input.documents);

  const options = { idPatterns, additionalAmbiguousTerms };

  const occurrences = extractIdOccurrences(documents, options);
  const duplicates = findDuplicateIds(occurrences);
  const unresolved = findUnresolvedReferences(occurrences);
  const { stats } = analyzePrefixes(occurrences);
  const definitionCount = occurrences.filter((o) => o.role === "definition").length;
  const referenceCount = occurrences.filter((o) => o.role === "reference").length;
  const tocCount = occurrences.filter((o) => o.role === "toc").length;

  const aggregates = aggregateQuantitiesByUnit(documents);
  const boundaryCandidates = buildBoundaryCandidates(aggregates);
  const boundaryToolInput = toBoundaryValuesToolInput(boundaryCandidates);

  const termFindings = analyzeTermUsage(documents);
  const ambiguousTerms = findAmbiguousTerms(documents, options);

  const findings = buildDeterministicFindings(documents, options);
  const requirementSources = buildRequirementSourceRefs(occurrences, documents);

  const digestRows = buildDocumentDigests(documents, options);
  const digestFindings = findDocumentDigestFindings(digestRows);
  const unmatchedIdPatterns = findUnmatchedIdPatterns(documents, options);

  const lines: string[] = [];
  lines.push("# 要件分析結果");
  lines.push("");
  lines.push(
    "既定(verbose未指定/false)は要約表示。2.6節は根拠位置を絞り込んで表示する。全件が必要な場合は `verbose: true` を指定すること。"
  );
  lines.push("");

  // --- 1. 対象文書 ---
  lines.push("## 1. 対象文書");
  lines.push("");
  for (const doc of documents) {
    const lineCount = doc.content.split("\n").length;
    lines.push(`- ${doc.name}(行数: ${lineCount})`);
  }
  lines.push("");
  lines.push("### 入力ダイジェスト");
  lines.push("");
  for (const l of renderDocumentDigestLines(digestRows, digestFindings, unmatchedIdPatterns)) lines.push(l);
  lines.push("");
  lines.push("### 開発背景");
  lines.push("");
  lines.push(background && background.trim() ? background.trim() : "未提供(要確認)");
  lines.push("");
  lines.push("### スコープ・重点項目");
  lines.push("");
  lines.push(...listOrUnprovided(focusAreas));
  lines.push("");
  lines.push("### スコープ外");
  lines.push("");
  lines.push(...listOrUnprovided(outOfScope));
  lines.push("");
  lines.push("### 既に保証済みの範囲");
  lines.push("");
  lines.push(...listOrUnprovided(alreadyAssured));
  lines.push("");

  // --- 2. 決定的分析(自動) ---
  lines.push("## 2. 決定的分析(自動)");
  lines.push("");

  lines.push("### 2.1 要件ID体系");
  lines.push("");
  lines.push("| プレフィックス | 定義数 | 連番桁数 | セグメント数 | 出現文書 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const stat of stats) {
    lines.push(
      `| ${escapeCell(stat.prefix)} | ${stat.definitionCount} | ${stat.digitWidths.join(", ")} | ${stat.segmentCounts.join(
        ", "
      )} | ${escapeCell(stat.documents.join(", "))} |`
    );
  }
  lines.push("");
  lines.push(`- 定義数: ${definitionCount} / 参照数: ${referenceCount} / 目次除外: ${tocCount}`);
  if (duplicates.length === 0) {
    lines.push("- ID重複: なし");
  } else {
    lines.push(`- ID重複: ${duplicates.length}件`);
    for (const dup of duplicates) {
      const placesText = dup.places
        .map((p) => `${p.document}:${p.lineIndex + 1} ${p.heading}`)
        .join(" / ");
      lines.push(`  - ${dup.id}(${dup.count}件): ${placesText}`);
    }
  }
  if (unresolved.length === 0) {
    lines.push("- 未解決参照: なし");
  } else {
    lines.push(`- 未解決参照: ${unresolved.length}件`);
    for (const ref of unresolved) {
      lines.push(`  - ${ref.id}(${ref.document}:${ref.lineIndex + 1} ${ref.heading})`);
    }
  }
  lines.push("");

  lines.push("### 2.2 数量表現の全文書横断集約");
  lines.push("");
  lines.push("| 単位 | 出現数 | 検出値 | 境界語 | 出現文書 | 矛盾候補 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const agg of aggregates) {
    lines.push(
      `| ${escapeCell(agg.unit)} | ${agg.occurrences.length} | ${agg.numbers.join(", ")} | ${escapeCell(
        agg.boundaryWords.join(", ")
      )} | ${escapeCell(agg.documents.join(", "))} | ${agg.crossDocumentVariance ? "要確認" : "-"} |`
    );
  }
  lines.push("");

  lines.push("### 2.3 境界値候補(design_boundary_values 連携)");
  lines.push("");
  lines.push("| 単位 | min | max | 型 | 刻み | 状態 | 根拠 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const c of boundaryCandidates) {
    lines.push(
      `| ${escapeCell(c.unit)} | ${c.variable.min} | ${c.variable.max} | ${c.variable.valueType ?? "int"} | ${
        c.variable.step ?? "-"
      } | ${c.incomplete ? "要確認" : "確定"} | ${escapeCell(c.basis.join(" / "))} |`
    );
  }
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(boundaryToolInput, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("このJSONをそのまま design_boundary_values の引数として渡せる。");
  lines.push("");
  const incompleteCandidates = boundaryCandidates.filter((c) => c.incomplete);
  if (incompleteCandidates.length > 0) {
    lines.push("未確定の候補(要確認):");
    lines.push("");
    for (const c of incompleteCandidates) {
      lines.push(`- ${c.unit}: ${c.note ?? "詳細不明"}`);
    }
    lines.push("");
  }

  lines.push("### 2.4 用語定義と本文使用の照合");
  lines.push("");
  lines.push("| 用語 | 定義箇所 | 完全一致使用数 | 正規化一致使用数 | 使用文書 | 状態 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const t of termFindings) {
    const defPlaces = t.definitions
      .map((d) => `${d.document}:${d.lineIndex + 1} ${d.heading}`)
      .join(" / ");
    lines.push(
      `| ${escapeCell(t.term)} | ${escapeCell(defPlaces)} | ${t.exactUsageCount} | ${t.normalizedUsageCount} | ${escapeCell(
        t.usageDocuments.join(", ")
      )} | ${t.status} |`
    );
  }
  lines.push("");

  lines.push("### 2.5 曖昧語・弱い語・未完成注記");
  lines.push("");
  if (ambiguousTerms.length === 0) {
    lines.push("- 該当なし");
  } else {
    for (const finding of ambiguousTerms) {
      const byHeadingText = finding.byHeading
        .map((h) => `${h.document} / ${h.heading}(${h.count}件)`)
        .join(", ");
      lines.push(`- 「${finding.term}」(${finding.category}) 計${finding.total}件: ${byHeadingText}`);
    }
  }
  lines.push("");

  lines.push("### 2.6 要件ID → テストベース根拠位置");
  lines.push("");
  const flaggedIds = new Set<string>([
    ...duplicates.map((d) => d.id),
    ...unresolved.map((u) => u.id),
  ]);
  const sourcesToShow = verbose
    ? requirementSources
    : requirementSources.filter((r) => flaggedIds.has(r.requirementId));

  const prefixSourceCounts = new Map<string, number>();
  for (const ref of requirementSources) {
    const { prefix } = splitIdIntoPrefixAndNumber(ref.requirementId);
    prefixSourceCounts.set(prefix, (prefixSourceCounts.get(prefix) ?? 0) + 1);
  }
  lines.push("| プレフィックス | 根拠位置数 |");
  lines.push("| --- | --- |");
  for (const [prefix, count] of prefixSourceCounts) {
    lines.push(`| ${escapeCell(prefix)} | ${count} |`);
  }
  lines.push("");

  if (sourcesToShow.length === 0) {
    if (requirementSources.length === 0) {
      lines.push("- 定義された要件IDが無い");
    } else {
      lines.push(
        "- フラグ対象の根拠位置なし（重複・未解決参照が無いため）。全件を見るには verbose: true を指定。"
      );
    }
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify({ requirementSources: sourcesToShow }, null, 2));
    lines.push("```");
  } else {
    lines.push("| 要件ID | 文書 | 行範囲 | 章節 | 引用ラベル |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const ref of sourcesToShow) {
      const lineRange =
        ref.endLine === undefined || ref.endLine === ref.startLine
          ? `${ref.startLine}`
          : `${ref.startLine}-${ref.endLine}`;
      lines.push(
        `| ${escapeCell(ref.requirementId)} | ${escapeCell(ref.document)} | ${lineRange} | ${escapeCell(
          ref.heading ?? "-"
        )} | ${escapeCell(ref.label ?? "-")} |`
      );
    }
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify({ requirementSources: sourcesToShow }, null, 2));
    lines.push("```");
  }
  lines.push("");
  lines.push(
    verbose
      ? "このJSONの requirementSources を extract_test_conditions / generate_test_cases にそのまま渡せる。"
      : "既定では絞り込み後のJSON。extract_test_conditions / generate_test_cases に全件を渡す必要がある場合は verbose: true で再実行すること。"
  );
  lines.push("");

  lines.push("### 2.7 サマリ");
  lines.push("");
  lines.push(
    `- 対象文書数: ${documents.length} / 抽出ID数(定義 ${definitionCount} / 参照 ${referenceCount} / 目次 ${tocCount}) / 重複ID数: ${duplicates.length} / 未解決参照数: ${unresolved.length} / 数量矛盾候補: ${aggregates.filter(
      (a) => a.crossDocumentVariance
    ).length} / 境界値候補: ${boundaryCandidates.length} / 用語照合数: ${termFindings.length} / 指摘件数: ${findings.length} / 根拠位置数: ${requirementSources.length} / ダイジェスト指摘数: ${digestFindings.length}`
  );
  lines.push("");

  // --- 3. 指摘表 ---
  lines.push("## 3. 指摘表");
  lines.push("");
  lines.push("| 重要度 | 説明 |");
  lines.push("| --- | --- |");
  for (const def of questionPriorityDefinitions) {
    lines.push(`| ${escapeCell(def.level)} | ${escapeCell(def.description)} |`);
  }
  lines.push("");
  lines.push("| 指摘ID | 種別 | 重大度 | 該当箇所 | 何が問題か | 確認質問文 | 暫定前提 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const f of findings) {
    lines.push(
      `| ${f.id} | ${f.kind} | ${f.severity} | ${escapeCell(f.place)} | ${escapeCell(f.problem)} | ${escapeCell(
        f.question
      )} | ${escapeCell(f.assumption)} |`
    );
  }
  lines.push("");
  lines.push(
    "以下に続けて意味的分析で見つかった指摘を同形式で F-XX として追記すること。該当箇所は文書名・章・機能ID・引用スニペットを必ず埋めること。"
  );
  lines.push("");

  // --- 4. 品質特性 × 要件のマッピング指示 ---
  lines.push("## 4. 品質特性 × 要件のマッピング指示");
  lines.push("");
  const characteristics =
    qualityCharacteristicIds && qualityCharacteristicIds.length > 0
      ? model.characteristics.filter((c) => qualityCharacteristicIds.includes(c.id))
      : model.characteristics;
  const inUseCharacteristics =
    qualityCharacteristicIds && qualityCharacteristicIds.length > 0
      ? inUseModel.characteristics.filter((c) => qualityCharacteristicIds.includes(c.id))
      : inUseModel.characteristics;
  lines.push("### 4.1 製品品質特性");
  lines.push("");
  for (const c of characteristics) {
    lines.push(`### ${c.id} ${c.nameJa}(${c.nameEn})`);
    lines.push("");
    lines.push(c.summary);
    lines.push("");
    for (const sub of c.subCharacteristics) {
      const related = sub.relatedTestTypes.length > 0 ? sub.relatedTestTypes.join(", ") : "-";
      lines.push(`- ${sub.id} ${sub.nameJa}: ${sub.focus.join(" / ")}(関連: ${related})`);
    }
    lines.push("");
  }
  lines.push("### 4.2 利用時品質特性");
  lines.push("");
  if (inUseCharacteristics.length === 0) {
    lines.push("該当なし（qualityCharacteristicIds で除外された）");
    lines.push("");
  } else {
    for (const c of inUseCharacteristics) {
      lines.push(`### ${c.id} ${c.nameJa}(${c.nameEn})`);
      lines.push("");
      lines.push(c.summary);
      lines.push("");
      for (const sub of c.subCharacteristics) {
        const related = sub.relatedTestTypes.length > 0 ? sub.relatedTestTypes.join(", ") : "-";
        lines.push(`- ${sub.id} ${sub.nameJa}: ${sub.focus.join(" / ")}(関連: ${related})`);
      }
      lines.push("");
    }
  }
  lines.push(
    "利用者由来のテスト条件（ペルソナ／ステークホルダー起点）は、まず本節の利用時品質特性(QU-XX)への対応を検討し、対応する製品品質特性(QC-XX)があれば併記すること。"
  );
  lines.push("");
  lines.push("| 品質特性 | 副特性 | 関連する要件ID/箇所 | 記述の有無 | 不足している事項 |");
  lines.push("| --- | --- | --- | --- | --- |");
  lines.push("");
  lines.push(
    "上記の副特性ごとに（製品品質QC-XX・利用時品質QU-XXの両方が対象）、対象文書中で対応する要件ID・章・記述箇所を特定し、記述の有無と不足事項を表に埋めること。"
  );
  lines.push("");

  // --- 5. ステークホルダー別影響の抽出指示 ---
  lines.push("## 5. ステークホルダー別影響の抽出指示");
  lines.push("");
  lines.push("| ステークホルダー | ニーズ・期待 | 懸念 | 導かれるテスト要求 |");
  lines.push("| --- | --- | --- | --- |");
  if (stakeholders && stakeholders.length > 0) {
    for (const s of stakeholders) {
      const label = s.name ? `${s.role}(${s.name})` : s.role;
      lines.push(`| ${escapeCell(label)} | 未記入(要確認) | ${escapeCell(s.concerns ?? "未記入(要確認)")} | 未記入 |`);
    }
  }
  lines.push("");
  lines.push(
    "ステークホルダーごとに、ニーズ・期待 → 懸念 → 導かれるテスト要求の順に埋めること。未指定のステークホルダーがいれば追加すること。"
  );
  lines.push("");

  // --- 6. 変更差分の4区分 ---
  lines.push("## 6. 変更差分の4区分");
  lines.push("");
  const categories: { key: "new" | "modified" | "existing-impacted" | "existing-unaffected"; label: string }[] = [
    { key: "new", label: "新規実装" },
    { key: "modified", label: "変更" },
    { key: "existing-impacted", label: "既存・影響あり" },
    { key: "existing-unaffected", label: "既存・影響なし" },
  ];
  lines.push("| 区分 | 対象 | 根拠箇所 | テストでの扱い |");
  lines.push("| --- | --- | --- | --- |");
  for (const cat of categories) {
    lines.push(`### ${cat.label}`);
    lines.push("");
    const items = (changeItems ?? []).filter((c) => c.category === cat.key);
    if (items.length === 0) {
      lines.push("- 該当なし");
    } else {
      for (const item of items) {
        lines.push(`- ${item.description}${item.note ? `(${item.note})` : ""}`);
      }
    }
    lines.push("");
  }
  const unclassified = (changeItems ?? []).filter((c) => !c.category);
  lines.push("### 未分類(LLM が分類する)");
  lines.push("");
  if (unclassified.length === 0) {
    lines.push("- 該当なし");
  } else {
    for (const item of unclassified) {
      lines.push(`- ${item.description}${item.note ? `(${item.note})` : ""}`);
    }
  }
  lines.push("");

  // --- 7. 意味的分析の観点 ---
  lines.push("## 7. 意味的分析の観点");
  lines.push("");
  lines.push(
    "- 品質特性の focus を横断し、機能要件だけでなく非機能要件（性能・信頼性・セキュリティ等）の記述漏れを確認すること。"
  );
  lines.push(
    "- 指摘表・境界値候補・用語照合の結果を踏まえ、extract_test_conditions でテスト条件を洗い出す前に曖昧な要件を確定させること。"
  );
  lines.push(
    "- 2.3 の境界値候補は design_boundary_values に、同値クラスが必要な項目は design_equivalence_partitioning に引き継ぐこと。"
  );
  lines.push("");

  lines.push(
    ...renderNextToolsSection(
      "analyze_requirements",
      duplicates.length > 0 || unresolved.length > 0 ? ["has-id-findings"] : [],
      input.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

export const analyzeRequirementsInputShape = {
  ...completedToolsInputShape,
  documents: z
    .array(
      z.object({
        name: z.string().describe("Document name or file name of the requirements document"),
        content: z.string().describe("Full text of the document (any format; caller converts binaries to text)"),
      })
    )
    .min(1)
    .describe("One or more test basis documents (requirements, specifications) to analyze"),
  idPatterns: z
    .array(z.string())
    .optional()
    .describe(
      "Extra regular expression sources for requirement/feature IDs, added to the default pattern. Capture group count decides how the ID is built: 1 group = group 1 is used as the whole ID as-is (no hyphen joining), 2 groups = reconstructed as `${group1}-${group2}` (default pattern behavior), 0 groups = the whole match is used. Use a 1-group pattern for numeric-only IDs (031), dot-separated IDs (3.1.2) and underscore IDs (REQ_001) so the reported ID matches the notation in the source document. If a given pattern matches nothing, a [high] finding is emitted in the input digest."
    ),
  additionalAmbiguousTerms: z
    .array(z.string())
    .optional()
    .describe("Extra ambiguous/weak words to count in addition to the built-in list"),
  background: z.string().optional().describe("Development background of the project"),
  focusAreas: z.array(z.string()).optional().describe("Scope / focus areas to prioritize"),
  outOfScope: z.array(z.string()).optional().describe("Explicitly out-of-scope areas"),
  alreadyAssured: z.array(z.string()).optional().describe("Areas already assured by other means"),
  stakeholders: z
    .array(
      z.object({
        role: z.string().describe("Stakeholder role"),
        name: z.string().optional().describe("Stakeholder name"),
        concerns: z.string().optional().describe("Known concerns of this stakeholder"),
      })
    )
    .optional()
    .describe("Stakeholders whose impact should be analyzed"),
  changeItems: z
    .array(
      z.object({
        description: z.string().describe("Change item description"),
        category: z
          .enum(["new", "modified", "existing-impacted", "existing-unaffected"])
          .optional()
          .describe("Change category; if omitted, the calling LLM should classify it"),
        note: z.string().optional().describe("Additional note"),
      })
    )
    .optional()
    .describe("Change items to classify into the 4 change categories"),
  qualityCharacteristicIds: z
    .array(z.string())
    .optional()
    .describe("If provided, restrict the quality characteristic mapping section to these characteristic ids"),
  verbose: z
    .boolean()
    .optional()
    .describe(
      "If false/omitted (default), section 2.6 shows a per-prefix count summary and lists source references only for requirement IDs flagged as duplicate or unresolved-reference. If true, lists every requirement-source reference in full (as in previous versions)."
    ),
} as const;

export function registerAnalyzeRequirementsTool(server: McpServer): void {
  server.registerTool(
    "analyze_requirements",
    {
      title: "Analyze Requirements",
      description:
        "複数のテストベース文書を横断分析し、要件ID体系・数量表現の矛盾・境界値候補・用語の表記ゆれを決定的に検出する。品質特性マッピングやステークホルダー影響・変更差分区分は呼び出し側LLMへの指示として返す。",
      inputSchema: analyzeRequirementsInputShape,
    },
    async (input) => {
      const markdown = renderRequirementsAnalysis(input as AnalyzeRequirementsInput);
      return { content: [{ type: "text" as const, text: markdown }] };
    }
  );
}
