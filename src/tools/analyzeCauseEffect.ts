import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { causeEffectAnalysisCriteria } from "../resources/causeEffectCriteria.js";
import {
  buildCauseEffectFindings,
  buildCauseEffectGraph,
  buildDecisionTableHandover,
  buildStructuralBlockingFindings,
  constraintTypeLabel,
  enumerateCauseEffect,
  renderCauseEffectMermaid,
  splitSpecSentences,
  summarizeCauseEffect,
} from "../causeEffectAnalysis.js";
import { findAmbiguousTerms } from "../testBasisAnalysis.js";
import type {
  AnalyzeCauseEffectInput,
  CauseEffectAnalysisCriteria,
  CauseEffectFinding,
} from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function findingsByCategory(findings: CauseEffectFinding[], categoryId: string): CauseEffectFinding[] {
  return findings.filter((f) => f.categoryId === categoryId);
}

function pushFindingLines(lines: string[], findings: CauseEffectFinding[], emptyLabel = "- なし"): void {
  if (findings.length === 0) {
    lines.push(emptyLabel);
    return;
  }
  for (const f of findings) {
    lines.push(`- [${f.severity}] ${f.categoryId} ${f.targetId ?? "-"}: ${escapeCell(f.detail)}`);
  }
}

export function renderCauseEffectAnalysis(
  input: AnalyzeCauseEffectInput,
  criteria: CauseEffectAnalysisCriteria = causeEffectAnalysisCriteria
): string {
  const intermediateNodes = input.intermediateNodes ?? [];
  const constraints = input.constraints ?? [];

  const graph = buildCauseEffectGraph(input);
  const blockingFindings = buildStructuralBlockingFindings(input, graph);
  const enumeration = enumerateCauseEffect(input, graph, blockingFindings);
  const sentences = splitSpecSentences(input.specText);
  const findings = buildCauseEffectFindings(input, graph, enumeration, sentences);
  const summary = summarizeCauseEffect(input, graph, enumeration, sentences, findings);
  const handover = buildDecisionTableHandover(input, graph, enumeration);
  const ambiguousTerms = findAmbiguousTerms(
    [{ name: input.sectionId, content: input.specText }],
    { additionalAmbiguousTerms: input.additionalAmbiguousTerms }
  );

  const ungroundedIds = new Set(findingsByCategory(findings, "CEG-14").map((f) => f.targetId));
  const missingQuoteIds = new Set(findingsByCategory(findings, "CEG-15").map((f) => f.targetId));
  const groundingLabel = (id: string): string => {
    if (ungroundedIds.has(id)) return "仕様文に不在";
    if (missingQuoteIds.has(id)) return "引用未指定";
    return "仕様文に実在";
  };

  const lines: string[] = [];
  lines.push("# 原因結果グラフ分析結果");
  lines.push("");

  // --- 1. 前提と宣言 ---
  lines.push("## 1. 前提と宣言");
  lines.push("");
  lines.push("### 1.1 対象セクション");
  lines.push("");
  lines.push(`- セクションID: ${escapeCell(input.sectionId)}`);
  lines.push(`- セクション名: ${escapeCell(input.sectionTitle ?? "(未指定)")}`);
  lines.push(`- 仕様文: ${input.specText.length} 文字 / ${sentences.length} 文（検査対象として分割した文数）`);
  lines.push("");

  lines.push("### 1.2 原因一覧");
  lines.push("");
  lines.push("| ID | 命題 | 引用 | 裏付け |");
  lines.push("| --- | --- | --- | --- |");
  for (const cause of input.causes) {
    lines.push(
      `| ${escapeCell(cause.id)} | ${escapeCell(cause.statement)} | ${escapeCell(
        cause.quote ?? "-"
      )} | ${groundingLabel(cause.id)} |`
    );
  }
  lines.push("");

  lines.push("### 1.3 結果一覧");
  lines.push("");
  lines.push("| ID | 命題 | 論理 | 引用 | 裏付け |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const effect of input.effects) {
    lines.push(
      `| ${escapeCell(effect.id)} | ${escapeCell(effect.statement)} | ${effect.logic ?? "and"} | ${escapeCell(
        effect.quote ?? "-"
      )} | ${groundingLabel(effect.id)} |`
    );
  }
  lines.push("");

  lines.push("### 1.4 中間ノード");
  lines.push("");
  if (intermediateNodes.length === 0) {
    lines.push("- 対象なし");
  } else {
    lines.push("| ID | 命題 | 論理 |");
    lines.push("| --- | --- | --- |");
    for (const node of intermediateNodes) {
      lines.push(`| ${escapeCell(node.id)} | ${escapeCell(node.statement)} | ${node.logic ?? "and"} |`);
    }
  }
  lines.push("");

  lines.push("### 1.5 制約一覧");
  lines.push("");
  if (constraints.length === 0) {
    lines.push("- 対象なし");
  } else {
    lines.push("| 制約ID | 種別 | 対象ノード | 意味 |");
    lines.push("| --- | --- | --- | --- |");
    for (const constraint of constraints) {
      lines.push(
        `| ${escapeCell(constraint.id)} | ${constraint.type} | ${escapeCell(
          constraint.nodeIds.join(", ")
        )} | ${escapeCell(constraintTypeLabel(constraint.type))} |`
      );
    }
  }
  lines.push("");

  // --- 2. 原因結果グラフ ---
  lines.push("## 2. 原因結果グラフ");
  lines.push("");
  lines.push("### 2.1 mermaid 図");
  lines.push("");
  lines.push("```mermaid");
  lines.push(renderCauseEffectMermaid(graph, constraints));
  lines.push("```");
  lines.push("");

  lines.push("### 2.2 辺一覧");
  lines.push("");
  lines.push("| From | To | 種別 |");
  lines.push("| --- | --- | --- |");
  for (const edge of graph.edges) {
    lines.push(`| ${escapeCell(edge.from)} | ${escapeCell(edge.to)} | ${edge.kind} |`);
  }
  lines.push("");

  // --- 3. 決定的検査(自動) ---
  lines.push("## 3. 決定的検査(自動)");
  lines.push("");

  lines.push("### 3.1 グラフ構造検査");
  lines.push("");
  pushFindingLines(lines, [
    ...findingsByCategory(findings, "CEG-01"),
    ...findingsByCategory(findings, "CEG-02"),
    ...findingsByCategory(findings, "CEG-03"),
    ...findingsByCategory(findings, "CEG-07"),
  ]);
  lines.push("");

  lines.push("### 3.2 孤立原因");
  lines.push("");
  pushFindingLines(lines, findingsByCategory(findings, "CEG-04"));
  lines.push("");

  lines.push("### 3.3 導出されない結果");
  lines.push("");
  pushFindingLines(lines, findingsByCategory(findings, "CEG-05"));
  lines.push("");

  lines.push("### 3.4 中間ノードの片側未接続");
  lines.push("");
  if (intermediateNodes.length === 0) {
    lines.push("- 対象なし");
  } else {
    pushFindingLines(lines, findingsByCategory(findings, "CEG-06"));
  }
  lines.push("");

  lines.push("### 3.5 制約の整合性");
  lines.push("");
  if (constraints.length === 0) {
    lines.push("- 対象なし");
  } else {
    pushFindingLines(lines, [
      ...findingsByCategory(findings, "CEG-08"),
      ...findingsByCategory(findings, "CEG-09"),
      ...findingsByCategory(findings, "CEG-10"),
      ...findingsByCategory(findings, "CEG-11"),
    ]);
  }
  lines.push("");

  lines.push("### 3.6 組合せ数とデシジョンテーブル列数");
  lines.push("");
  lines.push(
    `- 原因数: ${enumeration.causeCount} / 理論上限の組合せ数: 2^${enumeration.causeCount} = ${enumeration.theoreticalCombinationCount}`
  );
  if (enumeration.enumerated) {
    lines.push(
      `- 制約充足後の組合せ数(=デシジョンテーブル列数): ${enumeration.validCombinationCount} / 圧縮後の列数: ${enumeration.compressedRules.length}`
    );
    lines.push(
      `- 上記 ${enumeration.validCombinationCount} / ${enumeration.compressedRules.length} の根拠は 5.2 節のルール表本文（圧縮後 ${enumeration.compressedRules.length} 行）に一致する。`
    );
  } else {
    lines.push(`- 制約充足後の組合せ数: 未算出（理由: ${escapeCell(enumeration.skipReason ?? "不明")}）`);
  }
  if (input.expectedRuleCount !== undefined) {
    if (enumeration.enumerated) {
      lines.push(
        `- 宣言列数: ${input.expectedRuleCount} / 算出列数: ${enumeration.validCombinationCount} / 判定: ${
          input.expectedRuleCount === enumeration.validCombinationCount ? "一致" : "不一致"
        }`
      );
    } else {
      lines.push(`- 宣言列数: ${input.expectedRuleCount} / 算出列数: 未算出のため未照合`);
    }
  }
  const ceg19 = findingsByCategory(findings, "CEG-19");
  if (ceg19.length > 0) {
    pushFindingLines(lines, ceg19);
  }
  lines.push("");

  lines.push("### 3.7 結果の可変性検査");
  lines.push("");
  if (!enumeration.enumerated) {
    lines.push(`- 対象なし（理由: ${escapeCell(enumeration.skipReason ?? "不明")}）`);
  } else {
    pushFindingLines(lines, [
      ...findingsByCategory(findings, "CEG-12"),
      ...findingsByCategory(findings, "CEG-13"),
    ]);
  }
  lines.push("");

  lines.push("### 3.8 引用の仕様文実在照合");
  lines.push("");
  pushFindingLines(lines, [
    ...findingsByCategory(findings, "CEG-14"),
    ...findingsByCategory(findings, "CEG-15"),
  ]);
  lines.push("");

  lines.push("### 3.9 仕様文のモデル化網羅");
  lines.push("");
  if (summary.totalSentenceCount === 0) {
    lines.push("- 対象なし");
  } else {
    lines.push(
      `- モデル化率: ${summary.modeledSentenceCount}/${summary.totalSentenceCount} (${summary.modeledSentenceRatioPercent.toFixed(
        1
      )}%)`
    );
    const unmodeled = sentences.filter((s) => !s.modeled);
    if (unmodeled.length === 0) {
      lines.push("- 未モデル化の文: なし");
    } else {
      for (const sentence of unmodeled) {
        lines.push(`- [medium] CEG-16 文${sentence.no}: 「${escapeCell(sentence.text)}」`);
      }
    }
  }
  lines.push("");

  lines.push("### 3.10 論理接続語のモデル反映検査");
  lines.push("");
  pushFindingLines(lines, findingsByCategory(findings, "CEG-17"));
  lines.push("");

  lines.push("### 3.11 曖昧語(参考)");
  lines.push("");
  if (ambiguousTerms.length === 0) {
    lines.push("- なし");
  } else {
    for (const term of ambiguousTerms) {
      lines.push(`- [info] CEG-18 ${escapeCell(term.term)}: ${term.category} / 出現 ${term.total} 件`);
    }
  }
  lines.push("");

  lines.push("### 3.12 サマリ");
  lines.push("");
  lines.push(
    `- 原因数: ${summary.causeCount} / 結果数: ${summary.effectCount} / 中間ノード数: ${summary.intermediateCount} / 辺数: ${summary.edgeCount} / 制約数: ${summary.constraintCount}`
  );
  lines.push(
    `- 全列挙: ${summary.enumerated ? "実施" : "未実施"} / 理論上限: ${summary.theoreticalCombinationCount} / 制約充足後: ${
      summary.enumerated ? summary.validCombinationCount : "未算出"
    } / 圧縮後: ${summary.enumerated ? summary.compressedRuleCount : "未算出"}`
  );
  lines.push(
    `- モデル化文数: ${summary.modeledSentenceCount}/${summary.totalSentenceCount} (${summary.modeledSentenceRatioPercent.toFixed(
      1
    )}%)`
  );
  lines.push(
    `- 指摘件数: high ${summary.highCount} 件 / medium ${summary.mediumCount} 件 / info ${summary.infoCount} 件`
  );
  lines.push("");

  // --- 4. 判定区分と対処指針(カタログ) ---
  lines.push("## 4. 判定区分と対処指針(カタログ)");
  lines.push("");
  lines.push("| 区分ID | 区分 | 重大度 | 説明 | 対処 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const c of criteria.categories) {
    lines.push(
      `| ${escapeCell(c.id)} | ${escapeCell(c.nameJa)} | ${c.severity} | ${escapeCell(c.description)} | ${escapeCell(
        c.action
      )} |`
    );
  }
  lines.push("");
  for (const note of criteria.notes) {
    lines.push(`- ${escapeCell(note)}`);
  }
  lines.push("");

  // --- 5. デシジョンテーブルへの引き渡し ---
  lines.push("## 5. デシジョンテーブルへの引き渡し");
  lines.push("");
  lines.push("### 5.1 条件項目・動作項目");
  lines.push("");
  lines.push("| 区分 | ID | 内容 |");
  lines.push("| --- | --- | --- |");
  for (const cause of input.causes) {
    lines.push(`| 条件項目 | ${escapeCell(cause.id)} | ${escapeCell(cause.statement)} |`);
  }
  for (const effect of input.effects) {
    lines.push(`| 動作項目 | ${escapeCell(effect.id)} | ${escapeCell(effect.statement)} |`);
  }
  lines.push("");

  lines.push("### 5.2 ルール表(圧縮後)");
  lines.push("");
  if (!enumeration.enumerated) {
    lines.push(`- 未算出（理由: ${escapeCell(enumeration.skipReason ?? "不明")}）`);
  } else if (enumeration.compressedRules.length === 0) {
    lines.push("- 対象なし（制約を同時に満たす原因の真偽組合せが0件）");
  } else {
    const headerIds = [...graph.causeIds, ...graph.effectIds];
    lines.push(`| No | ${headerIds.map((id) => escapeCell(id)).join(" | ")} |`);
    lines.push(`| --- | ${headerIds.map(() => "---").join(" | ")} |`);
    for (const rule of enumeration.compressedRules) {
      const cells = [
        ...graph.causeIds.map((id) => rule.causeValues[id] ?? "-"),
        ...graph.effectIds.map((id) => rule.effectValues[id] ?? "-"),
      ];
      lines.push(`| ${rule.no} | ${cells.join(" | ")} |`);
    }
  }
  lines.push("");

  lines.push("### 5.3 design_decision_table 入力(JSON)");
  lines.push("");
  if (handover === undefined) {
    lines.push(`- 未算出（理由: ${escapeCell(enumeration.skipReason ?? "不明")}）`);
  } else {
    lines.push("```json");
    lines.push(JSON.stringify(handover, null, 2));
    lines.push("```");
  }
  lines.push(
    "- design_decision_table（Issue #77 / 旧 #23）は未実装。実装時に本 JSON をそのまま入力として受け取れる形式とする。"
  );
  lines.push("");

  // --- 6. 追加モデリング指示(意味的層) ---
  lines.push("## 6. 追加モデリング指示(意味的層)");
  lines.push("");

  const instructions: { categoryId: string; instruction: string }[] = [
    {
      categoryId: "CEG-04",
      instruction: "以下の原因が影響する結果を仕様文から特定して辺を追加するか、原因として不要なら削除すること:",
    },
    {
      categoryId: "CEG-05",
      instruction: "以下の結果を導く条件を仕様文から特定して辺を追加するか、結果として不要なら削除すること:",
    },
    {
      categoryId: "CEG-06",
      instruction: "以下の中間ノードに入辺と出辺の両方を与えるか、論理合流点として不要なら削除すること:",
    },
    {
      categoryId: "CEG-08",
      instruction: "以下の制約の対象ノード種別・要素数・重複を制約種別の要求に合わせて修正すること:",
    },
    {
      categoryId: "CEG-09",
      instruction: "以下の矛盾する制約について、仕様文に沿う指定を残して他方を除去すること:",
    },
    {
      categoryId: "CEG-10",
      instruction: "以下の値が固定される原因について、制約を見直すか固定の前提条件として扱うこと:",
    },
    {
      categoryId: "CEG-12",
      instruction: "以下の常に偽になる結果について、辺の向き・論理（and/or）・not 指定・制約を見直すこと:",
    },
    {
      categoryId: "CEG-14",
      instruction: "以下の引用を仕様文本文からそのまま切り出した文言へ差し替えること:",
    },
    {
      categoryId: "CEG-15",
      instruction: "以下のノードに、根拠となる仕様文の一文を quote として追加すること:",
    },
    {
      categoryId: "CEG-16",
      instruction:
        "以下の未モデル化の仕様文について、条件・動作を述べているなら原因／結果としてモデル化し、対象外なら理由を note に明記すること:",
    },
    {
      categoryId: "CEG-17",
      instruction:
        "以下の文が含む論理接続語を、中間ノードの and/or・not 辺・制約のいずれかとして明示的にモデル化すること:",
    },
    {
      categoryId: "CEG-19",
      instruction: "以下の宣言列数の不一致について、モデル側の誤りか宣言値側の誤りかを切り分けること:",
    },
  ];

  let anyInstruction = false;
  for (const { categoryId, instruction } of instructions) {
    const targetFindings = findingsByCategory(findings, categoryId);
    if (targetFindings.length === 0) continue;
    anyInstruction = true;
    lines.push(instruction);
    lines.push("");
    for (const f of targetFindings) {
      lines.push(`- ${f.targetId ?? "-"}: ${escapeCell(f.suggestion ?? f.detail)}`);
    }
    lines.push("");
  }

  if (!anyInstruction) {
    lines.push("- 追加の対応指示なし。本モデルを design_decision_table の入力として引き渡せる。");
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export const analyzeCauseEffectInputShape = {
  sectionId: z.string().min(1).describe("Identifier of the specification section being modeled"),
  sectionTitle: z.string().optional().describe("Human readable title of the specification section"),
  specText: z
    .string()
    .min(1)
    .describe("Verbatim specification text of the section; quotations are grounded against this text"),
  causes: z
    .array(
      z.object({
        id: z.string().min(1).describe("Cause node id (default prefix C)"),
        statement: z.string().min(1).describe("Cause proposition that evaluates to true or false"),
        quote: z.string().optional().describe("Verbatim excerpt from specText backing this cause"),
        note: z.string().optional(),
      })
    )
    .min(1)
    .describe("Cause nodes: independent input conditions of the section"),
  effects: z
    .array(
      z.object({
        id: z.string().min(1).describe("Effect node id (default prefix E)"),
        statement: z.string().min(1).describe("Observable system behaviour derived from the causes"),
        logic: z.enum(["and", "or"]).optional().describe("How incoming edges combine; defaults to and"),
        quote: z.string().optional().describe("Verbatim excerpt from specText backing this effect"),
        note: z.string().optional(),
      })
    )
    .min(1)
    .describe("Effect nodes: outputs / actions of the section"),
  intermediateNodes: z
    .array(
      z.object({
        id: z.string().min(1).describe("Intermediate node id (default prefix N)"),
        statement: z.string().min(1).describe("What this logical junction represents"),
        logic: z.enum(["and", "or"]).optional().describe("How incoming edges combine; defaults to and"),
        note: z.string().optional(),
      })
    )
    .optional()
    .describe("Intermediate logical junction nodes between causes and effects"),
  edges: z
    .array(
      z.object({
        from: z.string().min(1).describe("Source node id"),
        to: z.string().min(1).describe("Target node id"),
        kind: z.enum(["identity", "not"]).optional().describe("identity passes the value, not negates it"),
        note: z.string().optional(),
      })
    )
    .min(1)
    .describe("Directed edges of the cause-effect graph; must be acyclic"),
  constraints: z
    .array(
      z.object({
        id: z.string().min(1).describe("Constraint id (default prefix CN)"),
        type: z
          .enum(["exclusive", "inclusive", "onlyOne", "requires", "masks"])
          .describe(
            "exclusive/inclusive/onlyOne target 2+ causes; requires targets exactly 2 causes [a,b] meaning a implies b; masks targets exactly 2 effects [masking, masked]"
          ),
        nodeIds: z.array(z.string().min(1)).min(1).describe("Target node ids, order significant for requires/masks"),
        note: z.string().optional(),
      })
    )
    .optional()
    .describe("Constraints among causes (or among effects for masks)"),
  expectedRuleCount: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Declared decision table rule count, cross-checked against the enumerated count"),
  maxEnumerationCauses: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Upper bound of causes for full enumeration; defaults to 12"),
  causeIdPrefix: z.string().optional().describe("Expected cause id prefix; defaults to C, empty string disables the check"),
  effectIdPrefix: z.string().optional().describe("Expected effect id prefix; defaults to E, empty string disables the check"),
  intermediateIdPrefix: z
    .string()
    .optional()
    .describe("Expected intermediate node id prefix; defaults to N, empty string disables the check"),
  constraintIdPrefix: z
    .string()
    .optional()
    .describe("Expected constraint id prefix; defaults to CN, empty string disables the check"),
  additionalAmbiguousTerms: z
    .array(z.string())
    .optional()
    .describe("Extra ambiguous terms to detect in specText in addition to the built-in lexicon"),
} as const;

export function registerAnalyzeCauseEffectTool(server: McpServer): void {
  server.registerTool(
    "analyze_cause_effect",
    {
      title: "Analyze Cause Effect",
      description:
        "セクション単位の仕様文と、呼び出し側が構造化した原因・結果・制約を受け取り、原因結果グラフとしての整合性を決定的に検査する。" +
        "どの結果にも接続しない原因、どの原因からも導かれない結果、中間ノードの片側未接続、グラフの循環、制約の指定不正と矛盾、" +
        "制約による原因値の固定、冗長な制約、常に偽の結果、原因の真偽組合せ数とデシジョンテーブル列数（制約充足後・圧縮後）を算出し、" +
        "引用の仕様文実在照合と未モデル化仕様文・未反映の論理接続語の全件列挙まで行う。" +
        "モデル化そのものは呼び出し側LLMの責務とし、mermaid の原因結果グラフと design_decision_table 向けの引き渡し JSON を返す。" +
        "全列挙を行えなかった場合は制約充足後の列数を推測せず「未算出（理由）」として返す。",
      inputSchema: analyzeCauseEffectInputShape,
    },
    async (input) => ({
      content: [{ type: "text" as const, text: renderCauseEffectAnalysis(input as AnalyzeCauseEffectInput) }],
    })
  );
}
