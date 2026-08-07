import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderTestDesignNotationAudit } from "../src/tools/auditTestDesignNotations.js";
import { analyzeTestDesignNotations } from "../src/testDesignNotationAnalysis.js";
import { testPerspectiveCatalog } from "../src/resources/testPerspectiveCatalog.js";
import type { AuditTestDesignNotationsInput } from "../src/types.js";

const CATEGORY_COUNT = testPerspectiveCatalog.categories.length;
const BRANCH_COUNT = 3;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 3記法が互いに整合したクリーン入力。
 * NGT: ルート1 + 枝3 + 葉(観点カテゴリ数) の3階層。葉の深さは全て2で揃える。
 * FV表 / ゆもつよマトリクスは、その葉と1対1で対応させる。
 */
function cleanInput(): AuditTestDesignNotationsInput {
  const rootId = "NG-01";
  const branchIds = Array.from({ length: BRANCH_COUNT }, (_, i) => `NG-${pad(i + 2)}`);
  const leafIds = Array.from({ length: CATEGORY_COUNT }, (_, i) => `NG-${pad(i + 2 + BRANCH_COUNT)}`);
  const perBranch = Math.ceil(CATEGORY_COUNT / BRANCH_COUNT);

  const nodes = [
    { id: rootId, label: "本システムのテスト観点" },
    ...branchIds.map((id, i) => ({ id, label: `観点グループ${i + 1}`, parentId: rootId })),
    ...leafIds.map((id, i) => ({
      id,
      label: testPerspectiveCatalog.categories[i].nameJa,
      parentId: branchIds[Math.min(Math.floor(i / perBranch), BRANCH_COUNT - 1)],
      perspectiveCategoryId: testPerspectiveCatalog.categories[i].id,
      testConditionIds: [`TC-${pad(i + 1)}`],
    })),
  ];

  const verifications = Array.from(
    { length: CATEGORY_COUNT },
    (_, i) => `機能${pad(i + 1)}の入力値が上限を超えた場合に登録が拒否されること`
  );

  const fvRows = Array.from({ length: CATEGORY_COUNT }, (_, i) => ({
    id: `FV-${pad(i + 1)}`,
    functionId: `F-${pad(i + 1)}`,
    functionName: `機能${pad(i + 1)}`,
    verification: verifications[i],
    requirementIds: [`REQ-${pad(i + 1)}`],
    ngtNodeId: leafIds[i],
    testConditionIds: [`TC-${pad(i + 1)}`],
  }));

  const matrixRows = leafIds.map((leafId, i) => ({
    id: `MR-${pad(i + 1)}`,
    label: testPerspectiveCatalog.categories[i].nameJa,
    ngtNodeId: leafId,
  }));
  const matrixColumns = [
    { id: "MC-01", label: "機能テスト" },
    { id: "MC-02", label: "性能テスト" },
  ];
  const cells = matrixRows.map((row, i) => ({
    rowId: row.id,
    columnId: "MC-01",
    testConditionIds: [`TC-${pad(i + 1)}`],
  }));
  const exclusions = matrixRows.map((row) => ({
    rowId: row.id,
    columnId: "MC-02",
    reason: "本観点は応答時間の要求が定義されていないため性能テストの対象外とする。",
  }));

  return {
    fvTable: {
      rows: fvRows,
      expectedFunctionIds: Array.from({ length: CATEGORY_COUNT }, (_, i) => `F-${pad(i + 1)}`),
      claimedFunctionCoveragePercent: 100,
    },
    ngt: {
      nodes,
      relations: [{ fromId: leafIds[0], toId: leafIds[CATEGORY_COUNT - 1], kind: "参照" }],
      claimedLeafCount: CATEGORY_COUNT,
    },
    yumotsuyoMatrix: {
      rows: matrixRows,
      columns: matrixColumns,
      cells,
      exclusions,
      claimedFillRatePercent: 100,
    },
    testConditionIds: Array.from({ length: CATEGORY_COUNT }, (_, i) => `TC-${pad(i + 1)}`),
    documents: [{ name: "要件定義書.md", content: verifications.join("\n") }],
  };
}

function categoryIds(input: AuditTestDesignNotationsInput): string[] {
  return analyzeTestDesignNotations(input).findings.map((f) => f.categoryId);
}

/** 変異させたクリーン入力で、当該判定区分IDが検出され、かつ指摘一覧へ描画されることを確かめる。 */
function expectCategoryDetected(
  categoryId: string,
  mutate: (input: AuditTestDesignNotationsInput) => void
): void {
  const input = cleanInput();
  mutate(input);
  const result = analyzeTestDesignNotations(input);
  const detected = result.findings.filter((f) => f.categoryId === categoryId);
  expect(detected.length, `${categoryId} が検出されていない`).toBeGreaterThan(0);

  const markdown = renderTestDesignNotationAudit(input);
  const severities = new Set(detected.map((f) => f.severity));
  const rendered = [...severities].some((severity) => markdown.includes(`| ${categoryId} | ${severity} |`));
  expect(rendered, `${categoryId} が指摘一覧へ描画されていない`).toBe(true);
}

describe("renderTestDesignNotationAudit / analyzeTestDesignNotations", () => {
  it("3記法を整合させたクリーン入力では TDN- の指摘が0件になる", () => {
    const result = analyzeTestDesignNotations(cleanInput());
    expect(result.findings).toEqual([]);
    expect(result.summary.findingTotal).toBe(0);
    expect(result.summary.suppliedNotationCount).toBe(3);

    const markdown = renderTestDesignNotationAudit(cleanInput());
    expect(markdown.startsWith("# テスト設計記法監査結果\n")).toBe(true);
    expect(markdown).toContain("## 6. 指摘一覧");
    // 6.1 検出事項は「なし」
    const findingSection = markdown.split("### 6.1 検出事項")[1].split("### 6.2")[0];
    expect(findingSection).toContain("- なし");
    expect(findingSection).not.toContain("| TDN-");
  });

  it("クリーン入力で FV表・NGT階層・ゆもつよマトリクスの3描画がすべて出力に含まれる", () => {
    const markdown = renderTestDesignNotationAudit(cleanInput());
    // FV表（リスト）
    expect(markdown).toContain("| 行ID | 機能ID | 機能 | 検証内容 | 由来 | NGTノード | テスト条件ID |");
    expect(markdown).toContain("| FV-01 |");
    // NGT（インデント階層）
    expect(markdown).toContain("- 本システムのテスト観点(NG-01)");
    expect(markdown).toContain("  - 観点グループ1(NG-02)");
    expect(markdown).toContain("(葉)");
    // ゆもつよマトリクス（○/空欄/- のマトリクス）
    expect(markdown).toContain("| テスト観点 \\ テストタイプ | 機能テスト | 性能テスト |");
    expect(markdown).toContain("| ○ | - |");
  });

  it("次に実行すべきツール節が末尾に1回だけ現れる", () => {
    expectNextToolsSection(renderTestDesignNotationAudit(cleanInput()));
    const markdown = renderTestDesignNotationAudit(cleanInput());
    expect(markdown).toContain("generate_test_cases");
    expect(markdown).toContain("audit_cross_matrix");
  });

  // ---- FV表 ----
  it("TDN-01: 行IDの接頭辞不一致・欠番を検出する", () => {
    expectCategoryDetected("TDN-01", (input) => {
      input.fvTable!.rows[0].id = "XX-99";
    });
  });

  it("TDN-02: 検証内容の未記入を検出する", () => {
    expectCategoryDetected("TDN-02", (input) => {
      input.fvTable!.rows[0].verification = "   ";
    });
  });

  it("TDN-03: 定型語のみの検証内容を検出する", () => {
    expectCategoryDetected("TDN-03", (input) => {
      input.fvTable!.rows[0].verification = "正常に動作すること";
    });
  });

  it("TDN-04: 検証内容ゼロの機能を検出する", () => {
    expectCategoryDetected("TDN-04", (input) => {
      input.fvTable!.expectedFunctionIds!.push("F-99");
      input.fvTable!.claimedFunctionCoveragePercent = undefined;
    });
  });

  it("TDN-05: 母集団外の機能IDを参照する行を検出する", () => {
    expectCategoryDetected("TDN-05", (input) => {
      input.fvTable!.rows[0].functionId = "F-999";
      input.fvTable!.claimedFunctionCoveragePercent = undefined;
    });
  });

  it("TDN-06: テストベース本文に裏付けの無い検証内容を検出する", () => {
    expectCategoryDetected("TDN-06", (input) => {
      input.fvTable!.rows[0].verification = "テストベース本文のどこにも書かれていない検証内容である";
    });
  });

  it("TDN-07: 宣言した機能被覆率と実測値の不一致を検出する", () => {
    expectCategoryDetected("TDN-07", (input) => {
      input.fvTable!.claimedFunctionCoveragePercent = 50;
    });
  });

  // ---- NGT ----
  it("TDN-08: 未宣言の親参照を検出する", () => {
    expectCategoryDetected("TDN-08", (input) => {
      input.ngt!.nodes.push({ id: "NG-90", label: "親が未宣言のノード", parentId: "NG-999" });
    });
  });

  it("TDN-09: 親子関係の循環を検出する", () => {
    expectCategoryDetected("TDN-09", (input) => {
      const leaf = input.ngt!.nodes[input.ngt!.nodes.length - 1];
      input.ngt!.nodes[0].parentId = leaf.id;
    });
  });

  it("TDN-10: ルートノードが2件以上ある状態を検出する", () => {
    expectCategoryDetected("TDN-10", (input) => {
      input.ngt!.nodes.push({ id: "NG-90", label: "もう1つのルート" });
    });
  });

  it("TDN-11: テスト条件へ落ちない葉ノードを検出する", () => {
    expectCategoryDetected("TDN-11", (input) => {
      input.ngt!.nodes.push({ id: "NG-90", label: "条件に落ちない観点", parentId: "NG-02" });
    });
  });

  it("TDN-12: 子が1件しかない縮退枝を検出する", () => {
    expectCategoryDetected("TDN-12", (input) => {
      const leaf = input.ngt!.nodes[input.ngt!.nodes.length - 1];
      input.ngt!.nodes.push({ id: "NG-90", label: "唯一の子", parentId: leaf.id });
    });
  });

  it("TDN-13: 葉の深さの偏りを検出する", () => {
    expectCategoryDetected("TDN-13", (input) => {
      const leaf = input.ngt!.nodes[input.ngt!.nodes.length - 1];
      input.ngt!.nodes.push({ id: "NG-90", label: "深い中間ノード", parentId: leaf.id });
      input.ngt!.nodes.push({ id: "NG-91", label: "深い葉1", parentId: "NG-90" });
      input.ngt!.nodes.push({ id: "NG-92", label: "深い葉2", parentId: "NG-90" });
    });
  });

  it("TDN-14: relations の未宣言ID参照を検出する", () => {
    expectCategoryDetected("TDN-14", (input) => {
      input.ngt!.relations!.push({ fromId: "NG-999", toId: "NG-05" });
    });
  });

  it("TDN-15: カタログに存在しない観点カテゴリIDを検出する", () => {
    expectCategoryDetected("TDN-15", (input) => {
      const leaf = input.ngt!.nodes[input.ngt!.nodes.length - 1];
      leaf.perspectiveCategoryId = "TPC-99";
    });
  });

  it("TDN-16: 宣言した葉ノード数と実測値の不一致を検出する", () => {
    expectCategoryDetected("TDN-16", (input) => {
      input.ngt!.claimedLeafCount = 5;
    });
  });

  // ---- ゆもつよマトリクス ----
  it("TDN-17: 列IDの重複を検出する", () => {
    expectCategoryDetected("TDN-17", (input) => {
      input.yumotsuyoMatrix!.columns.push({ id: "MC-01", label: "重複した列" });
    });
  });

  it("TDN-18: 除外宣言のない空セルを検出する", () => {
    expectCategoryDetected("TDN-18", (input) => {
      input.yumotsuyoMatrix!.exclusions = input.yumotsuyoMatrix!.exclusions!.slice(1);
      input.yumotsuyoMatrix!.claimedFillRatePercent = undefined;
    });
  });

  it("TDN-19: 空列を検出する", () => {
    expectCategoryDetected("TDN-19", (input) => {
      input.yumotsuyoMatrix!.columns.push({ id: "MC-03", label: "誰も使わない列" });
      input.yumotsuyoMatrix!.claimedFillRatePercent = undefined;
    });
  });

  it("TDN-20: 除外理由の未記入を検出する", () => {
    expectCategoryDetected("TDN-20", (input) => {
      input.yumotsuyoMatrix!.exclusions![0].reason = "";
    });
  });

  it("TDN-21: セルのテスト条件IDが母集団に存在しない状態を検出する", () => {
    expectCategoryDetected("TDN-21", (input) => {
      input.yumotsuyoMatrix!.cells[0].testConditionIds = ["TC-999"];
    });
  });

  it("TDN-22: 宣言した充填率と実測値の不一致を検出する", () => {
    expectCategoryDetected("TDN-22", (input) => {
      input.yumotsuyoMatrix!.claimedFillRatePercent = 42;
    });
  });

  it("TDN-22: セル数が maxCellCount を超えるとき直積を展開せずスキップ理由を出力する", () => {
    const input = cleanInput();
    input.maxCellCount = 4;
    const result = analyzeTestDesignNotations(input);
    expect(result.yumotsuyoMatrix.expanded).toBe(false);
    expect(result.yumotsuyoMatrix.fillRate.basis).toBe("skipped");
    expect(result.findings.some((f) => f.categoryId === "TDN-22" && f.severity === "info")).toBe(true);
    expect(renderTestDesignNotationAudit(input)).toContain("上限 4 を超えるため");
  });

  // ---- 記法間 ----
  it("TDN-23: FV表の行が参照するNGTノードが存在しない状態を検出する", () => {
    expectCategoryDetected("TDN-23", (input) => {
      input.fvTable!.rows[0].ngtNodeId = "NG-999";
    });
  });

  it("TDN-24: マトリクスの行が参照するNGTノードが存在しない状態を検出する", () => {
    expectCategoryDetected("TDN-24", (input) => {
      input.yumotsuyoMatrix!.rows[0].ngtNodeId = "NG-999";
    });
  });

  it("TDN-25: どの記法からも参照されないテスト条件IDを検出する", () => {
    expectCategoryDetected("TDN-25", (input) => {
      input.testConditionIds!.push("TC-999");
    });
  });

  // ---- 宣言値と実測値・分母の明示 ----
  it("機能被覆率の宣言値・実測値・分母を出力に明示する", () => {
    const input = cleanInput();
    input.fvTable!.claimedFunctionCoveragePercent = 50;
    const markdown = renderTestDesignNotationAudit(input);
    expect(markdown).toContain(`宣言値 50 / 実測値 100 （分子 ${CATEGORY_COUNT} / 分母 ${CATEGORY_COUNT}`);
    expect(markdown).toContain(
      `宣言値 50% に対し実測値は 100%（分子 ${CATEGORY_COUNT} / 分母 ${CATEGORY_COUNT}）`
    );
  });

  it("葉ノード数の宣言値・実測値・分母を出力に明示する", () => {
    const input = cleanInput();
    input.ngt!.claimedLeafCount = 5;
    const markdown = renderTestDesignNotationAudit(input);
    expect(markdown).toContain(`宣言値 5 / 実測値 ${CATEGORY_COUNT}`);
    expect(markdown).toContain(`宣言値 5件 に対し実測の葉ノード数は ${CATEGORY_COUNT}件`);
    expect(markdown).toContain("分母となるノード総数");
  });

  it("充填率の宣言値・実測値・分母を出力に明示する", () => {
    const input = cleanInput();
    input.yumotsuyoMatrix!.claimedFillRatePercent = 42;
    const markdown = renderTestDesignNotationAudit(input);
    const denominator = CATEGORY_COUNT * 2 - CATEGORY_COUNT;
    expect(markdown).toContain(`宣言値 42 / 実測値 100 （分子 ${CATEGORY_COUNT} / 分母 ${denominator}`);
    expect(markdown).toContain(
      `宣言値 42% に対し実測値は 100%（分子 ${CATEGORY_COUNT} / 分母 ${denominator} = ${CATEGORY_COUNT} 行 × 2 列 − 除外 ${CATEGORY_COUNT}）`
    );
  });

  // ---- 母集団未宣言（裏付け不能） ----
  it("機能ID母集団が未宣言で宣言値だけがある場合、被覆率を算出せず high の裏付け不能指摘を出す", () => {
    const input = cleanInput();
    input.fvTable!.expectedFunctionIds = undefined;
    const result = analyzeTestDesignNotations(input);
    expect(result.fvTable.coverage.basis).toBe("unavailable");
    expect(result.fvTable.coverage.actual).toBeUndefined();
    const finding = result.findings.find((f) => f.categoryId === "TDN-07");
    expect(finding?.severity).toBe("high");
    expect(finding?.detail).toContain("裏付け不能");

    const markdown = renderTestDesignNotationAudit(input);
    expect(markdown).toContain("実測値 算出不能");
  });

  it("テスト条件ID母集団が未宣言のとき、双方向照合を実施しない旨を明示する", () => {
    const input = cleanInput();
    input.testConditionIds = undefined;
    const result = analyzeTestDesignNotations(input);
    expect(result.findings.some((f) => f.categoryId === "TDN-21")).toBe(false);
    expect(result.findings.some((f) => f.categoryId === "TDN-25")).toBe(false);
    expect(renderTestDesignNotationAudit(input)).toContain(
      "testConditionIds が未宣言のため、記法が参照するテスト条件IDとの双方向照合(TDN-21 / TDN-25)を実施していない"
    );
  });

  // ---- 未投入時の生成指示 ----
  it("FV表が未投入のときは生成指示のみを返し、FV表の検査を実施しない", () => {
    const input = cleanInput();
    input.fvTable = undefined;
    const result = analyzeTestDesignNotations(input);
    expect(result.fvTable.supplied).toBe(false);
    expect(result.findings.some((f) => ["TDN-01", "TDN-02", "TDN-03"].includes(f.categoryId))).toBe(
      false
    );

    const markdown = renderTestDesignNotationAudit(input);
    expect(markdown).toContain("FV表 が未投入のため、検査を実施していない。以下の要素を揃えて再実行すること。");
    expect(markdown).toContain("| FV-EL-01 | 機能 | 必須 |");
    expect(markdown).toContain("- FV表が未投入のため、TDN-01〜TDN-07 の検査を実施していない。");
    expectNextToolsSection(markdown);
  });

  it("NGTが未投入のときは生成指示のみを返し、NGTの検査を実施しない", () => {
    const input = cleanInput();
    input.ngt = undefined;
    const result = analyzeTestDesignNotations(input);
    expect(result.ngt.supplied).toBe(false);
    expect(result.findings.some((f) => f.categoryId.startsWith("TDN-1"))).toBe(false);

    const markdown = renderTestDesignNotationAudit(input);
    expect(markdown).toContain("NGT が未投入のため、検査を実施していない。");
    expect(markdown).toContain("| NGT-EL-01 | ノードラベル | 必須 |");
    expect(markdown).toContain("- NGT が未投入のため、TDN-08〜TDN-16 の検査を実施していない。");
    expectNextToolsSection(markdown);
  });

  it("ゆもつよマトリクスが未投入のときは生成指示のみを返し、マトリクスの検査を実施しない", () => {
    const input = cleanInput();
    input.yumotsuyoMatrix = undefined;
    const result = analyzeTestDesignNotations(input);
    expect(result.yumotsuyoMatrix.supplied).toBe(false);
    expect(
      result.findings.some((f) => ["TDN-17", "TDN-18", "TDN-19", "TDN-20", "TDN-22"].includes(f.categoryId))
    ).toBe(false);

    const markdown = renderTestDesignNotationAudit(input);
    expect(markdown).toContain("ゆもつよマトリクス が未投入のため、検査を実施していない。");
    expect(markdown).toContain("| YMX-EL-01 | 行（テスト観点・機能分類） | 必須 |");
    expect(markdown).toContain("- ゆもつよマトリクスが未投入のため、TDN-17〜TDN-22 の検査を実施していない。");
    expectNextToolsSection(markdown);
  });

  it("3記法すべてが未投入でも例外を投げず、記法間照合が成立しない旨を返す", () => {
    const markdown = renderTestDesignNotationAudit({});
    expect(markdown.startsWith("# テスト設計記法監査結果\n")).toBe(true);
    expect(markdown).toContain(
      "記法間照合の対象となる組合せが成立していない。"
    );
    expectNextToolsSection(markdown);
  });
});
