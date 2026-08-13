import { describe, expect, it } from "vitest";
import {
  INSPECTABILITY_UNMEASURED,
  buildDigestSignals,
  catalogIdsRequiring,
  renderInspectabilitySection,
  resolveInspectability,
} from "../src/inspectabilityAnalysis.js";
import {
  inspectabilityCatalog,
  inspectabilityCatalogIdNames,
  inspectabilityDigestChecks,
  inspectabilityPreconditions,
  inspectabilityToolNames,
} from "../src/resources/inspectabilityCatalog.js";
import { registeredToolNames } from "../src/resources/nextToolCatalog.js";
import { basisContradictionCriteria } from "../src/resources/basisContradictionCriteria.js";
import { coverageBalanceCriteria } from "../src/resources/coverageBalanceCriteria.js";
import { crossMatrixAuditCriteria } from "../src/resources/crossMatrixAuditCriteria.js";
import { deliverableConsistencyCriteria } from "../src/resources/deliverableConsistencyCriteria.js";
import { idPopulationAuditCriteria } from "../src/resources/idPopulationAuditCriteria.js";
import { inputQualityCriteria } from "../src/resources/inputQualityCriteria.js";
import { testDesignNotationCatalog } from "../src/resources/testDesignNotationCatalog.js";
import { thresholdExtractionCriteria } from "../src/resources/thresholdExtractionCriteria.js";
import { buildDocumentDigests } from "../src/documentDigest.js";
import { renderBasisContradictionAudit } from "../src/tools/auditBasisContradictions.js";
import type { DocumentDigestRow, InspectabilitySignalValue } from "../src/types.js";

const EXPECTED_TOOL_NAMES = [
  "review_test_basis",
  "analyze_requirements",
  "review_test_specification",
  "generate_test_cases",
  "audit_id_population",
  "audit_basis_contradictions",
  "audit_cross_matrix",
  "audit_test_design_notations",
  "audit_coverage_balance",
  "audit_deliverable_consistency",
  "reexpand_threshold_changes",
  "design_scenario_flows",
  "design_test_data",
  "design_config_matrix",
  "design_decision_table",
  "design_pairwise",
  "design_test_architecture",
  "analyze_data_flow_timing",
  "select_regression_suite",
];

/** 既存判定区分カタログが実際に持つID母集団（`catalogId` の照合先）。 */
const EXISTING_CATALOG_IDS = new Set<string>([
  ...inputQualityCriteria.criteria.map((c) => c.id),
  ...idPopulationAuditCriteria.categories.map((c) => c.id),
  ...basisContradictionCriteria.categories.map((c) => c.id),
  ...crossMatrixAuditCriteria.categories.map((c) => c.id),
  ...testDesignNotationCatalog.auditCategories.map((c) => c.id),
  ...coverageBalanceCriteria.categories.map((c) => c.id),
  ...deliverableConsistencyCriteria.categories.map((c) => c.id),
  ...thresholdExtractionCriteria.categories.map((c) => c.id),
]);

function allChecks() {
  return Object.values(inspectabilityCatalog).flatMap((entry) =>
    entry.checks.map((check) => ({ toolName: entry.toolName, check }))
  );
}

function tableRows(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| --- ") && !l.startsWith("| 状態 "));
}

describe("inspectabilityCatalog - 静的表の不変条件", () => {
  it("原文入力口を持つ19ツールを網羅し、いずれも実際の登録ツール名である", () => {
    expect(inspectabilityToolNames).toEqual(EXPECTED_TOOL_NAMES);
    for (const toolName of inspectabilityToolNames) {
      expect(registeredToolNames).toContain(toolName);
      expect(inspectabilityCatalog[toolName].toolName).toBe(toolName);
    }
  });

  it("catalogId は既存判定区分カタログのID一覧に実在する", () => {
    for (const { toolName, check } of allChecks()) {
      if (check.catalogId === undefined) continue;
      expect(EXISTING_CATALOG_IDS, `${toolName}/${check.checkKey}`).toContain(check.catalogId);
    }
    for (const check of inspectabilityDigestChecks) {
      expect(EXISTING_CATALOG_IDS).toContain(check.catalogId as string);
    }
  });

  it("catalogId の日本語名は既存カタログの nameJa をそのまま引いている（自作していない）", () => {
    expect(inspectabilityCatalogIdNames["BC-01"]).toBe(
      basisContradictionCriteria.categories[0].nameJa
    );
    expect(inspectabilityCatalogIdNames["PAC-01"]).toBe(
      idPopulationAuditCriteria.categories[0].nameJa
    );
    for (const { check } of allChecks()) {
      if (check.catalogId === undefined) continue;
      expect(inspectabilityCatalogIdNames[check.catalogId]).toBeDefined();
    }
  });

  it("未定義の前提IDが0件である", () => {
    const known = new Set(inspectabilityPreconditions.map((p) => p.id));
    const referenced = [
      ...allChecks().flatMap(({ check }) => check.requires),
      ...inspectabilityDigestChecks.flatMap((check) => check.requires),
    ];
    const undefinedIds = [...new Set(referenced)].filter((id) => !known.has(id));
    expect(undefinedIds).toEqual([]);
  });

  it("どの検査からも参照されない前提が0件である", () => {
    const referenced = new Set([
      ...allChecks().flatMap(({ check }) => check.requires),
      ...inspectabilityDigestChecks.flatMap((check) => check.requires),
    ]);
    const unused = inspectabilityPreconditions.map((p) => p.id).filter((id) => !referenced.has(id));
    expect(unused).toEqual([]);
  });

  it("前提IDの重複定義が0件で、measurement / source / remedy がすべて記入されている", () => {
    const ids = inspectabilityPreconditions.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of inspectabilityPreconditions) {
      expect(p.nameJa.length, p.id).toBeGreaterThan(0);
      expect(p.measurement.length, p.id).toBeGreaterThan(0);
      expect(p.source.length, p.id).toBeGreaterThan(0);
      expect(p.remedy.length, p.id).toBeGreaterThan(0);
    }
  });

  it("checkKey のツール内重複が0件である", () => {
    for (const entry of Object.values(inspectabilityCatalog)) {
      const keys = entry.checks.map((c) => c.checkKey);
      const digestKeys = entry.includesDigestChecks
        ? inspectabilityDigestChecks.map((c) => c.checkKey)
        : [];
      const all = [...digestKeys, ...keys];
      expect(new Set(all).size, entry.toolName).toBe(all.length);
    }
  });

  it("すべての検査が1件以上の前提を要求し、節ラベルが記入されている", () => {
    for (const { toolName, check } of allChecks()) {
      expect(check.requires.length, `${toolName}/${check.checkKey}`).toBeGreaterThan(0);
      expect(check.sectionLabel.length, `${toolName}/${check.checkKey}`).toBeGreaterThan(0);
    }
  });
});

describe("catalogIdsRequiring", () => {
  it("前提IDを要求する検査の区分IDをカタログ定義順で返す", () => {
    expect(catalogIdsRequiring("audit_basis_contradictions", "id-occurrence")).toEqual([
      "BC-01",
      "BC-07",
    ]);
    expect(catalogIdsRequiring("audit_basis_contradictions", "ui-element")).toEqual([
      "BC-02",
      "BC-03",
      "BC-06",
    ]);
    expect(catalogIdsRequiring("audit_basis_contradictions", "transition")).toEqual([
      "BC-04",
      "BC-05",
      "BC-10",
    ]);
  });

  it("未登録ツール・未使用前提は空配列を返す（例外を投げない）", () => {
    expect(catalogIdsRequiring("create_test_plan", "documents-supplied")).toEqual([]);
    expect(catalogIdsRequiring("review_test_basis", "ui-element")).toEqual([]);
  });
});

describe("buildDigestSignals", () => {
  const rows: DocumentDigestRow[] = buildDocumentDigests([
    {
      name: "spec.md",
      content: ["# 仕様", "REQ-001: ログイン", "上限は10件とする。", "REQ-002 を参照する。"].join("\n"),
    },
  ]);

  it("実測値は入力から算出した件数を先頭に置く", () => {
    const signals = buildDigestSignals(rows);
    const byId = new Map(signals.map((s) => [s.id, s]));
    expect(byId.get("documents-supplied")).toEqual({
      id: "documents-supplied",
      satisfied: true,
      measured: `投入文書1件・${rows[0].charCount}字`,
    });
    expect(byId.get("defined-id")!.measured).toBe(`定義ID${rows[0].definedIdCount}件`);
    expect(byId.get("id-occurrence")!.measured).toBe(`検出ID${rows[0].idCount}件`);
    expect(byId.get("quantity-expression")!.measured).toBe(`数量表現${rows[0].quantityCount}件`);
    expect(byId.get("multiple-documents")!.satisfied).toBe(false);
  });

  it("文書0件のときは共通8シグナルすべてが不成立で0件の実測値を持つ", () => {
    const signals = buildDigestSignals([]);
    expect(signals).toHaveLength(8);
    expect(signals.every((s) => !s.satisfied)).toBe(true);
    expect(signals.find((s) => s.id === "documents-supplied")!.measured).toBe("投入文書0件・0字");
  });

  it("表セル・規模のしきい値は実測値として文書件数で表現される", () => {
    const bigRows = buildDocumentDigests([
      { name: "big.md", content: `${"あ".repeat(2500)}\n`.repeat(1) + "x\n".repeat(60) },
    ]);
    const signals = buildDigestSignals(bigRows);
    expect(signals.find((s) => s.id === "digest-min-size")!.satisfied).toBe(true);
    expect(signals.find((s) => s.id === "table-cells")!.satisfied).toBe(false);
  });
});

describe("resolveInspectability", () => {
  it("カタログ未登録のツール名は行0件と [high] 警告になる", () => {
    const { rows, warnings } = resolveInspectability("create_test_plan", []);
    expect(rows).toEqual([]);
    expect(warnings).toEqual(["[high] 本ツールは検査実行状況カタログに未登録: create_test_plan"]);
  });

  it("検査不能行が先、実行行が後になり、各群はカタログ定義順（ダイジェストが先）である", () => {
    const { rows } = resolveInspectability("review_test_basis", [
      { id: "documents-supplied", satisfied: true, measured: "投入文書1件・100字" },
      { id: "defined-id", satisfied: false, measured: "定義ID0件" },
      { id: "id-occurrence", satisfied: true, measured: "検出ID3件" },
      { id: "table-cells", satisfied: false, measured: "表セル30件以上の文書0件 / 表セル総数0件" },
      { id: "digest-min-size", satisfied: false, measured: "2,000字かつ50行以上の文書0件 / 全1件" },
    ]);
    const statuses = rows.map((r) => r.status);
    expect(statuses.indexOf("実行")).toBeGreaterThan(statuses.lastIndexOf("検査不能"));
    expect(rows.filter((r) => r.status === "検査不能").map((r) => r.catalogId)).toEqual([
      "IQC-01",
      "IQC-03",
      "IQC-04",
      "-",
      "-",
    ]);
    // 区分IDを持つ検査は既存カタログの nameJa、持たない検査は出力節ラベルが「検査」列に出る。
    expect(rows.filter((r) => r.status === "実行").map((r) => r.checkLabel)).toEqual([
      inputQualityCriteria.criteria.find((c) => c.id === "IQC-02")!.nameJa,
      inputQualityCriteria.criteria.find((c) => c.id === "IQC-05")!.nameJa,
      "未解決参照",
      "曖昧語・弱い語",
      "数量表現",
    ]);
  });

  it("前提が1件でも不成立なら検査不能になり、実測値は不成立の前提だけを連結する", () => {
    const { rows } = resolveInspectability("review_test_specification", [
      { id: "documents-supplied", satisfied: true, measured: "投入文書1件・100字" },
      { id: "test-cases-supplied", satisfied: false, measured: "テストケース0件" },
    ]);
    const factCheck = rows.find((r) => r.checkLabel === "テストベースとの事実照合")!;
    expect(factCheck.status).toBe("検査不能");
    expect(factCheck.condition).toBe("原文投入あり・テストケース投入あり");
    expect(factCheck.measured).toBe("テストケース0件");
  });

  it("前提のシグナルが供給されていない検査は (未計測) と [high] 警告になる", () => {
    const { rows, warnings } = resolveInspectability("review_test_basis", []);
    expect(rows.every((r) => r.status === "検査不能")).toBe(true);
    expect(rows.every((r) => r.measured.includes(INSPECTABILITY_UNMEASURED))).toBe(true);
    expect(warnings).toContain(
      "[high] 前提「定義IDあり」の実測値が算出されていない: review_test_basis/id-duplicate"
    );
    expect(warnings.every((w) => w.startsWith("[high] "))).toBe(true);
  });

  it("同一前提IDが複数供給された場合は後から供給された値を採用する", () => {
    const { rows } = resolveInspectability("generate_test_cases", [
      { id: "documents-supplied", satisfied: false, measured: "投入文書0件・0字" },
      { id: "documents-supplied", satisfied: true, measured: "原文文書2件・500字" },
      { id: "coverage-target-declared", satisfied: true, measured: "網羅対象4件" },
      { id: "threshold-parameters", satisfied: true, measured: "閾値パラメータ1件" },
      { id: "test-size-input", satisfied: true, measured: "判定入力を持つケース2件 / 全2件" },
    ]);
    expect(rows.every((r) => r.status === "実行")).toBe(true);
    expect(rows.find((r) => r.checkLabel === "テストベースとの事実照合")!.measured).toBe(
      "原文文書2件・500字"
    );
  });
});

describe("renderInspectabilitySection", () => {
  const signals: InspectabilitySignalValue[] = [
    { id: "documents-supplied", satisfied: true, measured: "投入文書2件・32,676字" },
    { id: "defined-id", satisfied: false, measured: "定義ID0件" },
    { id: "id-occurrence", satisfied: true, measured: "検出ID3件" },
    { id: "quantity-expression", satisfied: true, measured: "数量表現4件" },
    { id: "table-cells", satisfied: true, measured: "表セル30件以上の文書2件 / 表セル総数313件" },
    { id: "digest-min-size", satisfied: true, measured: "2,000字かつ50行以上の文書1件 / 全2件" },
  ];

  it("無番号のH2見出しと5列の表を出す", () => {
    const md = renderInspectabilitySection("review_test_basis", signals);
    expect(md.split("\n")[0]).toBe("## 検査実行状況(実行された検査 / 検査不能な検査)");
    expect(md).toContain("| 状態 | 検査 | 区分ID | 成立条件 | 実測値 |");
    expect(md.endsWith("\n")).toBe(false);
    expect(md).toContain("| 検査不能 | ID重複 | - | 定義IDあり | 定義ID0件 |");
  });

  it("集計行の件数が表の行数と一致する", () => {
    const md = renderInspectabilitySection("review_test_basis", signals);
    const rows = tableRows(md);
    const executed = rows.filter((l) => l.startsWith("| 実行 |")).length;
    const unavailable = rows.filter((l) => l.startsWith("| 検査不能 |")).length;
    expect(md).toContain(`- 実行: ${executed}区分 / 検査不能: ${unavailable}区分`);
    expect(executed + unavailable).toBe(rows.length);
  });

  it("百分率（数値＋%）は出さない", () => {
    for (const toolName of inspectabilityToolNames) {
      const md = renderInspectabilitySection(toolName, signals);
      // DCC-17 の区分名称「分子分母の根拠を伴わない達成度%の主張」だけは既存カタログ由来の文言として現れる。
      expect(md, toolName).not.toMatch(/\d\s*%/);
    }
  });

  it("検査不能があるときだけ解消策の行を出す", () => {
    const withUnavailable = renderInspectabilitySection("review_test_basis", signals);
    expect(withUnavailable).toContain("- 検査不能を解消する入力: 定義IDあり → ");

    const allSatisfied = signals.map((s) => ({ ...s, satisfied: true }));
    const md = renderInspectabilitySection("review_test_basis", allSatisfied);
    expect(md).not.toContain("検査不能を解消する入力");
    expect(md).toContain("- 実行: 10区分 / 検査不能: 0区分");
  });

  it("対象外の注記行を必ず出す", () => {
    for (const toolName of inspectabilityToolNames) {
      const md = renderInspectabilitySection(toolName, signals);
      expect(md, toolName).toContain("本表は原文入力に依存する決定的検査のみを対象とする");
    }
  });

  it("行0件のときは表を出さず警告行だけを出す", () => {
    const md = renderInspectabilitySection("create_test_plan", []);
    expect(md).not.toContain("| 状態 |");
    expect(md).toContain("- [high] 本ツールは検査実行状況カタログに未登録: create_test_plan");
  });

  it("セル値の | はエスケープされる", () => {
    const md = renderInspectabilitySection("review_test_basis", [
      ...signals,
      { id: "documents-supplied", satisfied: true, measured: "投入文書 a|b 1件" },
    ]);
    expect(md).toContain("投入文書 a\\|b 1件");
  });
});

describe("audit_basis_contradictions の既存サマリ行と対照表の整合", () => {
  // UI要素0件・遷移0件・ID出現1件以上の入力。
  const markdown = renderBasisContradictionAudit({
    documents: [
      {
        name: "req-a.md",
        content: ["# 要件", "REQ-001: ログイン機能", "REQ-002: ログアウト機能"].join("\n"),
      },
      {
        name: "req-b.md",
        content: ["# 補足", "REQ-001 の詳細は別途定義する。"].join("\n"),
      },
    ],
  });

  it("既存の「検査不能(要確認)の区分:」行の文言が従来と同一である", () => {
    expect(markdown).toContain(
      "- 検査不能(要確認)の区分: BC-02, BC-03, BC-04, BC-05, BC-06, BC-10（UI要素・遷移が0件のため。未指摘は合格を意味しない）"
    );
  });

  it("既存サマリ行の区分集合と対照表の検査不能区分集合（BC-08/BC-09除く）が一致する", () => {
    const summaryLine = markdown
      .split("\n")
      .find((l) => l.startsWith("- 検査不能(要確認)の区分: "))!;
    const summarySet = new Set(
      (summaryLine.match(/BC-\d\d/g) ?? []).filter((id) => id !== "BC-08" && id !== "BC-09")
    );

    const section = markdown.split("## 検査実行状況")[1];
    const tableSet = new Set(
      tableRows(section)
        .filter((l) => l.startsWith("| 検査不能 |"))
        .map((l) => l.split("|")[3].trim())
        .filter((id) => id !== "BC-08" && id !== "BC-09")
    );

    expect(tableSet).toEqual(summarySet);
  });

  it("BC-08 / BC-09 は既存サマリ行には現れない", () => {
    const summaryLine = markdown
      .split("\n")
      .find((l) => l.startsWith("- 検査不能(要確認)の区分: "))!;
    expect(summaryLine).not.toContain("BC-08");
    expect(summaryLine).not.toContain("BC-09");
  });

  it("ID出現がある BC-01 / BC-07 は実行として出る", () => {
    const section = markdown.split("## 検査実行状況")[1];
    const executed = tableRows(section)
      .filter((l) => l.startsWith("| 実行 |"))
      .map((l) => l.split("|")[3].trim());
    expect(executed).toContain("BC-01");
    expect(executed).toContain("BC-07");
  });
});
