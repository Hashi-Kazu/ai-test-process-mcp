import { z } from "zod";
import { completedToolsInputShape, renderNextToolsSection } from "../nextToolAnalysis.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { thresholdChangeImpactCriteria } from "../resources/thresholdChangeImpactCriteria.js";
import { thresholdExtractionCriteria } from "../resources/thresholdExtractionCriteria.js";
import {
  buildBoundaryReexpansion,
  buildEquivalenceReexpansion,
  buildImpactedArtifacts,
  buildParameterReferenceIndex,
  buildThresholdChangeFindings,
  diffThresholdParameters,
  summarizeThresholdChange,
} from "../thresholdChangeAnalysis.js";
import {
  analyzeThresholdExtraction,
  renderThresholdExtractionLines,
} from "../thresholdExtraction.js";
import {
  buildDocumentDigests,
  findDocumentDigestFindings,
  renderDocumentDigestLines,
  sanitizeTestBasisDocuments,
} from "../documentDigest.js";
import type {
  ReexpandThresholdChangesInput,
  ThresholdChangeFinding,
  ThresholdChangeImpactCriteria,
  ThresholdExtractionCriteria,
  ThresholdExtractionFinding,
} from "../types.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function findingsByCategory(findings: ThresholdChangeFinding[], categoryId: string): ThresholdChangeFinding[] {
  return findings.filter((f) => f.categoryId === categoryId);
}

function extractionFindingsByCategory(
  findings: ThresholdExtractionFinding[],
  categoryId: string
): ThresholdExtractionFinding[] {
  return findings.filter((f) => f.categoryId === categoryId);
}

export function renderThresholdChangeReexpansion(
  input: ReexpandThresholdChangesInput,
  criteria: ThresholdChangeImpactCriteria = thresholdChangeImpactCriteria,
  extractionCriteria: ThresholdExtractionCriteria = thresholdExtractionCriteria
): string {
  const testConditions = input.testConditions ?? [];
  const testCases = input.testCases ?? [];
  const boundaryBindings = input.boundaryBindings ?? [];
  const equivalenceBindings = input.equivalenceBindings ?? [];

  const documentsBefore = input.documentsBefore
    ? sanitizeTestBasisDocuments(input.documentsBefore)
    : input.documentsBefore;
  const documentsAfter = input.documentsAfter
    ? sanitizeTestBasisDocuments(input.documentsAfter)
    : input.documentsAfter;

  // 1. documents があれば候補抽出・突合・候補差分・承認検証を行う
  const extraction = analyzeThresholdExtraction({
    parametersBefore: input.parametersBefore,
    parametersAfter: input.parametersAfter,
    documentsBefore,
    documentsAfter,
    approvedExtractions: input.approvedExtractions,
  });

  // 2. 実効パラメータ表（承認された候補のみが追記される。宣言値は上書きしない）
  const effectiveBefore = extraction.effectiveBefore;
  const effectiveAfter = extraction.effectiveAfter;
  const effectiveInput: ReexpandThresholdChangesInput = {
    ...input,
    parametersBefore: effectiveBefore,
    parametersAfter: effectiveAfter,
  };

  // 3. 既存の決定的層は実効パラメータ表に対して実行する
  const diffRows = diffThresholdParameters(effectiveBefore, effectiveAfter);
  const references = buildParameterReferenceIndex(effectiveInput, diffRows);
  const { rows: boundaryRows, issues: boundaryIssues } = buildBoundaryReexpansion(
    boundaryBindings,
    effectiveBefore,
    effectiveAfter,
    input.boundaryMode ?? "three"
  );
  const { rows: equivalenceRows, issues: equivalenceIssues } = buildEquivalenceReexpansion(
    equivalenceBindings,
    effectiveBefore,
    effectiveAfter
  );
  const bindingIssues = [...boundaryIssues, ...equivalenceIssues];
  const findings = buildThresholdChangeFindings(
    effectiveInput,
    diffRows,
    references,
    boundaryRows,
    equivalenceRows,
    bindingIssues
  );
  const impacted = buildImpactedArtifacts(effectiveInput, findings);
  const summary = summarizeThresholdChange(diffRows, boundaryRows, equivalenceRows, findings, impacted);

  const lines: string[] = [];
  lines.push("# 閾値変更の影響再展開結果");
  lines.push("");

  // --- 0. 投入文書と閾値の自前抽出（documents 指定時のみ） ---
  if (extraction.enabled) {
    const digestFor = (documents: ReexpandThresholdChangesInput["documentsBefore"]): string[] => {
      if (!documents) return [];
      const rows = buildDocumentDigests(documents);
      return renderDocumentDigestLines(rows, findDocumentDigestFindings(rows));
    };
    for (const l of renderThresholdExtractionLines(extraction, extractionCriteria, {
      before: digestFor(documentsBefore),
      after: digestFor(documentsAfter),
    })) {
      lines.push(l);
    }
  }

  // --- 1. パラメータ差分 ---
  lines.push("## 1. パラメータ差分");
  lines.push("");
  lines.push("### 1.1 差分表");
  lines.push("");
  if (diffRows.length === 0) {
    lines.push("- 対象なし");
  } else {
    lines.push("| パラメータ名 | 変更区分 | 変更前 | 変更後 | 単位(前→後) | 出典 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const row of diffRows) {
      lines.push(
        `| ${escapeCell(row.name)} | ${row.kind} | ${escapeCell(row.beforeValue ?? "-")} | ${escapeCell(
          row.afterValue ?? "-"
        )} | ${escapeCell(row.beforeUnit ?? "-")}→${escapeCell(row.afterUnit ?? "-")} | ${escapeCell(
          row.source ?? "-"
        )} |`
      );
    }
  }
  lines.push("");

  lines.push("### 1.2 変更区分の内訳");
  lines.push("");
  const kindOrder = ["added", "removed", "value-changed", "unit-changed", "value-unit-changed", "unchanged"] as const;
  for (const kind of kindOrder) {
    const count = diffRows.filter((r) => r.kind === kind).length;
    lines.push(`- ${kind}: ${count} 件`);
  }
  lines.push("");

  // --- 2. 参照インデックス(決定的層) ---
  lines.push("## 2. 参照インデックス(決定的層)");
  lines.push("");
  lines.push("### 2.1 パラメータ × 参照箇所");
  lines.push("");
  if (references.length === 0) {
    lines.push("- 対象なし");
  } else {
    lines.push("| パラメータ名 | 参照元 | ID | 参照箇所 | 参照形式 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const ref of references) {
      lines.push(
        `| ${escapeCell(ref.parameterName)} | ${ref.ownerKind} | ${escapeCell(ref.ownerId)} | ${escapeCell(
          ref.place
        )} | ${ref.form} |`
      );
    }
  }
  lines.push("");

  lines.push("### 2.2 参照が見つからない変更パラメータ");
  lines.push("");
  const tci06Findings = findingsByCategory(findings, "TCI-06");
  if (tci06Findings.length === 0) {
    lines.push("- 対象なし");
  } else {
    for (const f of tci06Findings) {
      lines.push(`- [${f.severity}] ${f.parameterName}: ${f.detail}`);
    }
  }
  lines.push("");

  // --- 3. 再展開結果(決定的層) ---
  lines.push("## 3. 再展開結果(決定的層)");
  lines.push("");
  lines.push("### 3.1 境界値の再展開差分");
  lines.push("");
  if (boundaryRows.length === 0) {
    lines.push("- 対象なし");
  } else {
    lines.push("| 変数 | 区分 | 変更前値 | 変更後値 | 変更前網羅対象ID | 変更後網羅対象ID | 判定 |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of boundaryRows) {
      lines.push(
        `| ${escapeCell(row.variable)} | ${escapeCell(row.label)} | ${
          row.beforeValue ?? "-"
        } | ${row.afterValue ?? "-"} | ${escapeCell(row.beforeTargetId ?? "-")} | ${escapeCell(
          row.afterTargetId ?? "-"
        )} | ${row.verdict} |`
      );
    }
  }
  lines.push("");

  lines.push("### 3.2 同値クラス代表値の再展開差分");
  lines.push("");
  if (equivalenceRows.length === 0) {
    lines.push("- 対象なし");
  } else {
    lines.push("| 変数 | クラス | 種別 | 網羅対象ID | 変更前代表値 | 変更後代表値 | 判定 |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const row of equivalenceRows) {
      lines.push(
        `| ${escapeCell(row.variable)} | ${escapeCell(row.label)} | ${row.kind} | ${escapeCell(
          row.targetId
        )} | ${escapeCell(row.beforeRepresentative ?? "-")} | ${escapeCell(
          row.afterRepresentative ?? "-"
        )} | ${row.verdict} |`
      );
    }
  }
  lines.push("");

  lines.push("### 3.3 解決できなかった束縛");
  lines.push("");
  if (bindingIssues.length === 0) {
    lines.push("- 対象なし");
  } else {
    for (const issue of bindingIssues) {
      lines.push(
        `- [${issue.snapshot}] ${issue.variable}(${issue.bound}, ${issue.kind}): ${escapeCell(issue.detail)}`
      );
    }
  }
  lines.push("");

  // --- 4. 影響と要対応(決定的層) ---
  lines.push("## 4. 影響と要対応(決定的層)");
  lines.push("");
  lines.push("### 4.1 指摘一覧");
  lines.push("");
  if (findings.length === 0) {
    lines.push("- 指摘なし");
  } else {
    for (const f of findings) {
      const owner = f.ownerId ? f.ownerId : "-";
      lines.push(`- [${f.severity}] ${f.categoryId} ${owner}: ${escapeCell(f.detail)}（${f.places.join(", ") || "-"}）`);
    }
  }
  lines.push("");

  lines.push("### 4.2 成果物別の影響判定");
  lines.push("");
  if (impacted.length === 0) {
    lines.push("- 対象なし");
  } else {
    lines.push("| 種別 | ID | 内容 | 影響パラメータ | 該当区分 | 判定 |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const row of impacted) {
      lines.push(
        `| ${row.ownerKind} | ${escapeCell(row.ownerId)} | ${escapeCell(row.title)} | ${escapeCell(
          row.parameterNames.length > 0 ? row.parameterNames.join(", ") : "-"
        )} | ${escapeCell(row.categoryIds.length > 0 ? row.categoryIds.join(", ") : "-")} | ${row.verdict} |`
      );
    }
  }
  lines.push("");

  lines.push("### 4.3 サマリ");
  lines.push("");
  lines.push(
    `- 変更パラメータ数: ${summary.changedParameterCount} / 追加: ${summary.addedParameterCount} / 削除: ${summary.removedParameterCount} / 再展開で変化した網羅対象数: ${summary.reexpandedTargetCount} / 旧値直値残存件数: ${summary.staleLiteralCount} / 失効網羅対象参照件数: ${summary.danglingTargetRefCount} / 要修正成果物数: ${summary.mustFixArtifactCount} / 要再確認成果物数: ${summary.recheckArtifactCount} / 束縛解決不能件数: ${summary.bindingIssueCount}`
  );
  lines.push("");

  // --- 5. 判定区分と対処指針(カタログ) ---
  lines.push("## 5. 判定区分と対処指針(カタログ)");
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

  // --- 6. 再生成指示(意味的層) ---
  lines.push("## 6. 再生成指示(意味的層)");
  lines.push("");

  const tci01 = findingsByCategory(findings, "TCI-01");
  const tci02 = findingsByCategory(findings, "TCI-02");
  const tci03 = findingsByCategory(findings, "TCI-03");
  const tci04 = findingsByCategory(findings, "TCI-04");
  const tci05 = findingsByCategory(findings, "TCI-05");
  const tci06 = findingsByCategory(findings, "TCI-06");
  const tci08 = findingsByCategory(findings, "TCI-08");

  let anyInstruction = false;

  if (tci01.length > 0) {
    anyInstruction = true;
    lines.push("以下の旧値の直値をパラメータ名参照へ置き換え、期待結果の数値を変更後の値で再計算すること:");
    lines.push("");
    for (const f of tci01) {
      lines.push(`- ${f.ownerId}(${f.places.join(", ")}): ${escapeCell(f.detail)}`);
    }
    lines.push("");
  }

  if (tci02.length > 0) {
    anyInstruction = true;
    lines.push("以下のケースの coverageTargets を再展開後の網羅対象IDへ差し替え、期待結果の境界値を再計算すること:");
    lines.push("");
    for (const f of tci02) {
      lines.push(`- ${f.ownerId}: ${f.suggestion ? escapeCell(f.suggestion) : escapeCell(f.detail)}`);
    }
    lines.push("");
  }

  if (tci03.length > 0) {
    anyInstruction = true;
    lines.push("以下のケースは名前参照のため本文修正は不要だが、期待結果・前提条件の数値記述が変更後の値と整合するか確認すること:");
    lines.push("");
    for (const f of tci03) {
      lines.push(`- ${f.ownerId}(${f.places.join(", ")}): ${escapeCell(f.detail)}`);
    }
    lines.push("");
  }

  if (tci04.length > 0) {
    anyInstruction = true;
    lines.push("以下の単位変更を前提条件・期待結果の記述へ反映し、換算の要否を確認すること:");
    lines.push("");
    for (const f of tci04) {
      lines.push(`- ${f.parameterName}: ${escapeCell(f.detail)}`);
    }
    lines.push("");
  }

  if (tci05.length > 0) {
    anyInstruction = true;
    lines.push("以下の削除されたパラメータへの参照を見直し、代替パラメータへの置換または該当箇所の削除を検討すること:");
    lines.push("");
    for (const f of tci05) {
      lines.push(`- ${f.ownerId}(${f.places.join(", ")}): ${escapeCell(f.detail)}`);
    }
    lines.push("");
  }

  if (tci06.length > 0) {
    anyInstruction = true;
    lines.push("以下の値を変更したが参照が見つからないパラメータについて、参照元の有無を確認すること:");
    lines.push("");
    for (const f of tci06) {
      lines.push(`- ${f.parameterName}: ${escapeCell(f.detail)}`);
    }
    lines.push("");
  }

  if (tci08.length > 0) {
    anyInstruction = true;
    lines.push("以下の解決できなかった束縛について、束縛先パラメータ名・値の指定を見直すこと:");
    lines.push("");
    for (const f of tci08) {
      lines.push(`- ${f.parameterName ?? "-"}: ${escapeCell(f.detail)}`);
    }
    lines.push("");
  }

  if (extraction.enabled) {
    const extractionBlocks: { categoryId: string; heading: string }[] = [
      {
        categoryId: "TCE-01",
        heading:
          "以下の文書中の閾値がパラメータ表に宣言されていない。宣言漏れか対象外かを判断し、対象なら parametersBefore/parametersAfter へ追加して再実行すること:",
      },
      {
        categoryId: "TCE-02",
        heading:
          "以下は宣言値と仕様書記載値が食い違っている。どちらが正かを確定してから再展開すること:",
      },
      {
        categoryId: "TCE-04",
        heading:
          "以下は文書差分と宣言差分が一致していない。反映漏れか抽出の取りこぼしかを確認すること:",
      },
      {
        categoryId: "TCE-07",
        heading:
          "以下の抽出候補は未承認のため再展開に反映していない。新旧対照表を確認し、承認するものを approvedExtractions へ渡して再実行すること:",
      },
    ];
    for (const block of extractionBlocks) {
      const items = extractionFindingsByCategory(extraction.findings, block.categoryId);
      if (items.length === 0) continue;
      anyInstruction = true;
      lines.push(block.heading);
      lines.push("");
      for (const f of items) {
        lines.push(`- ${escapeCell(f.name)}: ${escapeCell(f.detail)}`);
      }
      lines.push("");
    }
  }

  if (!anyInstruction) {
    lines.push(
      "- 追加の対応指示なし。再展開後の網羅対象IDで generate_test_cases を再実行し、網羅率が維持されていることを確認すること。"
    );
    lines.push("");
  }

  lines.push(
    ...renderNextToolsSection(
      "reexpand_threshold_changes",
      [],
      input.completedTools
    ).split("\n")
  );

  return lines.join("\n").trimEnd() + "\n";
}

const parameterShape = z.object({
  name: z.string().describe("Parameter name referenced from case bodies"),
  value: z.string().describe("Literal value"),
  unit: z.string().optional(),
  source: z.string().optional().describe("Origin (requirement id / spec location)"),
  note: z.string().optional(),
});

const testCaseStepShape = z.object({
  no: z.number().int().describe("1-based sequential step number"),
  action: z.string().describe("A single operation for this step"),
  expected: z.string().describe("Observable expected result for this step"),
});

const stateVariableShape = z.object({
  name: z.string().describe("State variable name"),
  value: z.string().describe("State variable value"),
});

export const reexpandThresholdChangesInputShape = {
  ...completedToolsInputShape,
  parametersBefore: z
    .array(parameterShape)
    .describe("Threshold parameter table snapshot before the change; empty array means all parameters are additions"),
  parametersAfter: z
    .array(parameterShape)
    .describe("Threshold parameter table snapshot after the change"),
  documentsBefore: z
    .array(
      z.object({
        name: z.string().describe("Document name shown in the digest and in extraction sources"),
        content: z
          .string()
          .describe("Full raw text of the specification before the change; free text, format agnostic"),
      })
    )
    .optional()
    .describe(
      "Specification texts before the change. Threshold parameter candidates are extracted from them and cross-checked against parametersBefore"
    ),
  documentsAfter: z
    .array(
      z.object({
        name: z.string().describe("Document name shown in the digest and in extraction sources"),
        content: z
          .string()
          .describe("Full raw text of the specification after the change; free text, format agnostic"),
      })
    )
    .optional()
    .describe(
      "Specification texts after the change. Threshold parameter candidates are extracted from them and cross-checked against parametersAfter"
    ),
  approvedExtractions: z
    .array(
      z.object({
        name: z.string().describe("Extracted candidate name being approved"),
        beforeValue: z.string().optional().describe("Approved before-snapshot value, must equal the extracted value"),
        afterValue: z.string().optional().describe("Approved after-snapshot value, must equal the extracted value"),
        unit: z.string().optional(),
        note: z.string().optional(),
      })
    )
    .optional()
    .describe(
      "Human approvals for extracted threshold candidates. Only approved candidates are merged into the effective parameter tables; unapproved candidates stay proposals and never affect the re-expansion. Declared parameter values are never overwritten"
    ),
  testConditions: z
    .array(
      z.object({
        id: z.string().describe("Test condition id"),
        statement: z.string().describe("The test condition statement"),
        target: z.string().optional().describe("Target of the condition"),
      })
    )
    .optional()
    .describe("Existing test conditions to check for threshold change impact"),
  testCases: z
    .array(
      z.object({
        caseId: z.string().describe("Test case id"),
        title: z.string().describe("Test case title"),
        testConditionId: z.string().optional(),
        coverageTargets: z.array(z.string()).optional().describe("Coverage target ids this case satisfies"),
        preconditions: z.array(stateVariableShape).optional(),
        steps: z.array(testCaseStepShape).optional(),
        postconditions: z.array(stateVariableShape).optional(),
        note: z.string().optional(),
      })
    )
    .optional()
    .describe("Existing test cases to check for threshold change impact"),
  boundaryBindings: z
    .array(
      z.object({
        name: z.string().describe("Boundary variable name"),
        minParameterName: z.string().optional().describe("Parameter name bound to the lower bound"),
        min: z.number().optional().describe("Literal lower bound, used when minParameterName is not given"),
        maxParameterName: z.string().optional().describe("Parameter name bound to the upper bound"),
        max: z.number().optional().describe("Literal upper bound, used when maxParameterName is not given"),
        valueType: z.enum(["int", "decimal"]).optional(),
        step: z.number().positive().optional(),
      })
    )
    .optional()
    .describe("Boundary value variables bound to parameter names, re-expanded for before/after snapshots"),
  boundaryMode: z.enum(["two", "three"]).optional(),
  equivalenceBindings: z
    .array(
      z.object({
        name: z.string().describe("Equivalence variable name"),
        classes: z
          .array(
            z.object({
              label: z.string(),
              kind: z.enum(["valid", "invalid"]),
              representativeParameterName: z.string().optional(),
              representative: z.string().optional(),
              description: z.string().optional(),
            })
          )
          .describe("Equivalence classes for this variable"),
      })
    )
    .optional()
    .describe("Equivalence partitioning variables bound to parameter names, re-expanded for before/after snapshots"),
} as const;

export function registerReexpandThresholdChangesTool(server: McpServer): void {
  server.registerTool(
    "reexpand_threshold_changes",
    {
      title: "Reexpand Threshold Changes",
      description:
        "閾値パラメータ表の変更前後2スナップショットを突き合わせ、変更が既存のテスト条件・テストケース・網羅対象へ与える影響を決定的に洗い出す。" +
        "パラメータ名に束縛した境界値変数・同値クラスは新旧それぞれで再展開し、網羅対象ID（BV:/EP:）の変化・失効を差分表として提示する。" +
        "旧値の直値残存、失効した網羅対象ID参照、名前参照経由で再確認が必要なケースを区分付きで列挙し、成果物の再生成指示を返す。" +
        "変更前後の仕様書テキストを渡すと閾値パラメータを文書から自前抽出して宣言表と突合し、新旧対照表を提案として提示する（承認された候補のみが再展開へ反映される二段構成）。",
      inputSchema: reexpandThresholdChangesInputShape,
    },
    async (input) => ({
      content: [
        { type: "text" as const, text: renderThresholdChangeReexpansion(input as ReexpandThresholdChangesInput) },
      ],
    })
  );
}
