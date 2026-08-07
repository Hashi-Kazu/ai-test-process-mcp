import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import {
  DEFAULT_PAIRWISE_SET_ID,
  buildPairwiseCoverageTargets,
  computePairwiseRows,
  pairwiseTargetId,
  renderPairwise,
} from "../src/tools/designPairwise.js";
import type { PairwiseSpec } from "../src/types.js";

// 券売機ドメイン: 因子4件・水準2〜3件。
// 全ペア数 = 2*3 + 2*2 + 2*2 + 3*2 + 3*2 + 2*2 = 30、全組合せ数 = 2*3*2*2 = 24。
function baseSpec(): PairwiseSpec {
  return {
    title: "券売機の購入操作",
    factors: [
      { id: "F1", name: "券種", levels: ["おとな", "こども"] },
      { id: "F2", name: "支払い方法", levels: ["現金", "IC", "クレカ"] },
      { id: "F3", name: "枚数区分", levels: ["1-9", "10以上"] },
      { id: "F4", name: "発券場所", levels: ["駅券売機", "オンライン"] },
    ],
  };
}

/** 禁則1件: オンラインでは現金決済ができない。 */
function forbiddenSpec(): PairwiseSpec {
  return {
    ...baseSpec(),
    forbiddenCombinations: [
      {
        id: "FB1",
        when: { F2: "現金", F4: "オンライン" },
        reason: "オンライン購入では現金決済を受け付けない",
      },
    ],
  };
}

function violatesForbidden(values: Record<string, string>): boolean {
  return values.F2 === "現金" && values.F4 === "オンライン";
}

describe("computePairwiseRows", () => {
  it("numbers pairs in canonical order (factor index i<j, level declaration order)", () => {
    const result = computePairwiseRows(baseSpec());
    expect(result.generated).toBe(true);
    expect(result.factorCount).toBe(4);
    expect(result.pairs).toHaveLength(30);
    expect(result.pairs.map((p) => p.index)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1)
    );
    expect(result.pairs[0]).toMatchObject({
      index: 1,
      factorIdA: "F1",
      levelA: "おとな",
      factorIdB: "F2",
      levelB: "現金",
    });
    expect(result.pairs[1]).toMatchObject({ factorIdA: "F1", levelA: "おとな", factorIdB: "F2", levelB: "IC" });
    // F1×F2 が6件、続いて F1×F3
    expect(result.pairs[6]).toMatchObject({ factorIdA: "F1", levelA: "おとな", factorIdB: "F3", levelB: "1-9" });
    expect(result.pairs[29]).toMatchObject({ factorIdA: "F3", levelA: "10以上", factorIdB: "F4", levelB: "オンライン" });
  });

  it("computes totalPairCount as the sum of |Li|*|Lj| over all factor pairs", () => {
    const spec = baseSpec();
    let expected = 0;
    for (let i = 0; i < spec.factors.length; i++) {
      for (let j = i + 1; j < spec.factors.length; j++) {
        expected += spec.factors[i].levels.length * spec.factors[j].levels.length;
      }
    }
    expect(expected).toBe(30);
    expect(computePairwiseRows(spec).totalPairCount).toBe(expected);
  });

  it("marks every pair reachable and reaches 100% coverage without forbidden combinations", () => {
    const result = computePairwiseRows(baseSpec());
    expect(result.pairs.every((p) => p.status === "reachable")).toBe(true);
    expect(result.unreachablePairCount).toBe(0);
    expect(result.undeterminedPairCount).toBe(0);
    expect(result.targetPairCount).toBe(30);
    expect(result.coveredPairCount).toBe(30);
    expect(result.pairCoverageRatioPercent).toBe(100);
    expect(result.findings).toHaveLength(0);
  });

  it("generates fewer rows than the full product but not fewer than the theoretical minimum", () => {
    const result = computePairwiseRows(baseSpec());
    expect(result.theoreticalMinimumRowCount).toBe(6); // 水準数上位2因子 = 3*2
    expect(result.rows.length).toBeGreaterThanOrEqual(result.theoreticalMinimumRowCount);
    expect(result.rows.length).toBeLessThan(24);
    expect(result.rows.every((r) => r.source === "generated")).toBe(true);
  });

  it("assigns every factor in every generated row and violates no forbidden combination", () => {
    const spec = forbiddenSpec();
    const result = computePairwiseRows(spec);
    for (const row of result.rows) {
      for (const f of spec.factors) {
        expect(f.levels).toContain(row.values[f.id]);
      }
      expect(violatesForbidden(row.values)).toBe(false);
    }
  });

  it("marks pairs that no valid combination can reach as unreachable with PWC-06", () => {
    const result = computePairwiseRows(forbiddenSpec());
    const unreachable = result.pairs.filter((p) => p.status === "unreachable");
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0]).toMatchObject({
      factorIdA: "F2",
      levelA: "現金",
      factorIdB: "F4",
      levelB: "オンライン",
    });
    expect(unreachable[0].unreachableReason).toContain("オンライン購入では現金決済を受け付けない");

    const pwc06 = result.findings.filter((f) => f.categoryId === "PWC-06");
    expect(pwc06).toHaveLength(1);
    expect(pwc06[0].severity).toBe("medium");
    expect(pwc06[0].target).toBe(pairwiseTargetId(DEFAULT_PAIRWISE_SET_ID, unreachable[0].index));
  });

  it("excludes unreachable pairs from the coverage denominator and still covers the rest fully", () => {
    const result = computePairwiseRows(forbiddenSpec());
    expect(result.totalPairCount).toBe(30);
    expect(result.unreachablePairCount).toBe(1);
    expect(result.undeterminedPairCount).toBe(0);
    expect(result.targetPairCount).toBe(29);
    expect(result.coveredPairCount).toBe(29);
    expect(result.pairCoverageRatioPercent).toBe(100);
    // 到達不能ペアは1行にも現れない
    const unreachable = result.pairs.find((p) => p.status === "unreachable");
    expect(unreachable?.coveredByRowNos).toEqual([]);
  });

  it("keeps pair indexes stable regardless of forbidden combinations", () => {
    const withoutForbidden = computePairwiseRows(baseSpec());
    const withForbidden = computePairwiseRows(forbiddenSpec());
    const key = (p: { index: number; factorIdA: string; levelA: string; factorIdB: string; levelB: string }) =>
      `${p.index}|${p.factorIdA}=${p.levelA}|${p.factorIdB}=${p.levelB}`;
    expect(withForbidden.pairs.map(key)).toEqual(withoutForbidden.pairs.map(key));
  });

  it("places seed rows first with source seed and reduces the number of generated rows", () => {
    const seedValues = { F1: "こども", F2: "クレカ", F3: "1-9", F4: "オンライン" };
    const withoutSeed = computePairwiseRows(forbiddenSpec());
    const withSeed = computePairwiseRows({
      ...forbiddenSpec(),
      seedRows: [{ id: "SD1", values: seedValues }],
    });

    expect(withSeed.rows[0].no).toBe(1);
    expect(withSeed.rows[0].source).toBe("seed");
    expect(withSeed.rows[0].values).toEqual(seedValues);
    expect(withSeed.rows.slice(1).every((r) => r.source === "generated")).toBe(true);
    expect(withSeed.pairCoverageRatioPercent).toBe(100);

    const generatedWithSeed = withSeed.rows.filter((r) => r.source === "generated").length;
    // seed行が被覆した分だけ生成行が減る（seed行は6ペアを新規被覆する）
    expect(withSeed.rows[0].newlyCoveredPairIndexes.length).toBeGreaterThan(0);
    expect(generatedWithSeed).toBeLessThan(withoutSeed.rows.length);
  });

  it("reports PWC-09 and skips generation when a seed row is incomplete", () => {
    const result = computePairwiseRows({
      ...baseSpec(),
      seedRows: [{ id: "SD1", values: { F1: "こども" } }],
    });
    expect(result.generated).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.pairs).toEqual([]);
    const pwc09 = result.findings.filter((f) => f.categoryId === "PWC-09");
    expect(pwc09).toHaveLength(1);
    expect(pwc09[0].severity).toBe("high");
    expect(pwc09[0].detail).toContain("F2");
  });

  it("reports PWC-09 and skips generation when a seed row violates a forbidden combination", () => {
    const result = computePairwiseRows({
      ...forbiddenSpec(),
      seedRows: [{ id: "SD1", values: { F1: "こども", F2: "現金", F3: "10以上", F4: "オンライン" } }],
    });
    expect(result.generated).toBe(false);
    const pwc09 = result.findings.filter((f) => f.categoryId === "PWC-09");
    expect(pwc09).toHaveLength(1);
    expect(pwc09[0].detail).toContain("FB1");
  });

  it("reports PWC-01 and skips generation when an undeclared factor id is referenced", () => {
    const result = computePairwiseRows({
      ...baseSpec(),
      forbiddenCombinations: [{ when: { F9: "x" }, reason: "存在しない因子" }],
    });
    expect(result.generated).toBe(false);
    expect(result.skipReason).toContain("PWC-01");
    expect(result.findings.map((f) => f.categoryId)).toContain("PWC-01");
  });

  it("reports PWC-02 and skips generation when an undeclared level is referenced", () => {
    const result = computePairwiseRows({
      ...baseSpec(),
      forbiddenCombinations: [{ when: { F2: "PayPay" }, reason: "存在しない水準" }],
    });
    expect(result.generated).toBe(false);
    expect(result.skipReason).toContain("PWC-02");
    const pwc02 = result.findings.filter((f) => f.categoryId === "PWC-02");
    expect(pwc02).toHaveLength(1);
    expect(pwc02[0].detail).toContain("PayPay");
  });

  it("reports PWC-05 and PWC-04 for a single factor with a single level", () => {
    const result = computePairwiseRows({
      factors: [{ id: "F1", name: "券種", levels: ["おとな"] }],
    } as PairwiseSpec);
    expect(result.generated).toBe(false);
    expect(result.factorCount).toBe(1);
    expect(result.totalPairCount).toBe(0);
    expect(result.theoreticalMinimumRowCount).toBe(0);
    const ids = result.findings.map((f) => f.categoryId);
    expect(ids).toContain("PWC-04");
    expect(ids).toContain("PWC-05");
  });

  it("reports PWC-10 and skips generation when the pair count cap is exceeded, still computing totalPairCount", () => {
    const result = computePairwiseRows({ ...baseSpec(), maxPairCount: 5 });
    expect(result.generated).toBe(false);
    expect(result.totalPairCount).toBe(30); // 上限超過でも全ペア数は算出する
    expect(result.rows).toEqual([]);
    expect(result.pairs).toEqual([]);
    expect(result.reductionBasis).toBe("unavailable");
    const pwc10 = result.findings.filter((f) => f.categoryId === "PWC-10");
    expect(pwc10).toHaveLength(1);
    expect(pwc10[0].severity).toBe("info");
    expect(result.skipReason).toContain("上限 5 件");
  });

  it("uses the valid-enumerated reduction basis when the full product can be enumerated", () => {
    const result = computePairwiseRows(forbiddenSpec());
    expect(result.reductionBasis).toBe("valid-enumerated");
    expect(result.fullCombinationCount).toBe(24);
    expect(result.validCombinationCount).toBe(20); // 24 - (2*1*2*1)
    expect(result.reductionRatioPercent).toBeCloseTo(
      Math.round((1 - result.rows.length / 20) * 1000) / 10,
      5
    );
  });

  it("falls back to the full-product reduction basis when enumeration is capped", () => {
    const result = computePairwiseRows({ ...baseSpec(), maxEnumerationCombinations: 1 });
    expect(result.reductionBasis).toBe("full-product");
    expect(result.fullCombinationCount).toBe(24);
    expect(result.validCombinationCount).toBeUndefined();
    expect(result.reductionRatioPercent).toBeCloseTo(
      Math.round((1 - result.rows.length / 24) * 1000) / 10,
      5
    );
  });

  it("is deterministic: the same input yields a deeply equal result", () => {
    expect(computePairwiseRows(forbiddenSpec())).toEqual(computePairwiseRows(forbiddenSpec()));
    expect(computePairwiseRows(baseSpec())).toEqual(computePairwiseRows(baseSpec()));
  });

  it("does not mutate the input spec", () => {
    const spec = forbiddenSpec();
    const snapshot = JSON.stringify(spec);
    computePairwiseRows(spec);
    expect(JSON.stringify(spec)).toBe(snapshot);
  });
});

describe("buildPairwiseCoverageTargets", () => {
  it("emits PW:<setId>:P<n> ids for reachable pairs only", () => {
    const targets = buildPairwiseCoverageTargets(forbiddenSpec());
    expect(targets).toHaveLength(29); // 30 - 到達不能1件
    for (const t of targets) {
      expect(t.id).toMatch(/^PW:MAIN:P\d+$/);
      expect(t.techniqueId).toBe("pairwise");
      expect(t.origin).toBe("MAIN");
      expect(t.description.length).toBeGreaterThan(0);
    }
    expect(targets[0]).toEqual({
      id: "PW:MAIN:P1",
      techniqueId: "pairwise",
      description: "券種=おとな × 支払い方法=現金",
      origin: "MAIN",
    });
    // 到達不能ペア(P22)は universe に入らない
    const unreachableIndex = computePairwiseRows(forbiddenSpec()).pairs.find(
      (p) => p.status === "unreachable"
    )?.index as number;
    expect(targets.map((t) => t.id)).not.toContain(`PW:MAIN:P${unreachableIndex}`);
  });

  it("honours a custom setId", () => {
    const targets = buildPairwiseCoverageTargets({ ...baseSpec(), setId: "ENV" });
    expect(targets[0].id).toBe("PW:ENV:P1");
    expect(targets.every((t) => t.origin === "ENV")).toBe(true);
  });

  it("returns an empty array when generation was skipped", () => {
    expect(buildPairwiseCoverageTargets({ ...baseSpec(), maxPairCount: 5 })).toEqual([]);
    expect(
      buildPairwiseCoverageTargets({
        ...baseSpec(),
        forbiddenCombinations: [{ when: { F9: "x" }, reason: "存在しない因子" }],
      })
    ).toEqual([]);
  });
});

describe("renderPairwise", () => {
  it("renders all eight sections", () => {
    const md = renderPairwise(forbiddenSpec());
    expect(md).toContain("# ペアワイズ設計結果");
    expect(md).toContain("## 1. 因子・水準");
    expect(md).toContain("## 2. 禁則");
    expect(md).toContain("## 3. ペアの到達可否");
    expect(md).toContain("## 4. 生成した組合せ表");
    expect(md).toContain("## 5. 行別の新規被覆ペア");
    expect(md).toContain("## 6. 決定的検査");
    expect(md).toContain("## 7. 網羅対象一覧(generate_test_cases 引き渡し)");
    expect(md).toContain("## 8. サマリ");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("renders factors, forbidden combinations and unreachable pairs with their reason", () => {
    const md = renderPairwise(forbiddenSpec());
    expect(md).toContain("| F2 | 支払い方法 | 3 | 現金, IC, クレカ |");
    expect(md).toContain("| FB1 | 支払い方法=現金, 発券場所=オンライン | オンライン購入では現金決済を受け付けない |");
    expect(md).toContain("到達不能");
    expect(md).toContain("PWC-06");
  });

  it("states 未算出 for every computed section when generation was skipped", () => {
    const md = renderPairwise({ ...baseSpec(), maxPairCount: 5 });
    expect(md).toContain("未算出(理由: 全ペア数 30 件が上限 5 件を超えるため組合せ生成を行わなかった)");
    expect(md).not.toContain("| No | 由来 |");
    // 因子・水準と禁則の節は入力そのものなので出力される
    expect(md).toContain("| F1 | 券種 | 2 | おとな, こども |");
  });

  it("states the denominator of the reduction ratio explicitly", () => {
    const enumerated = renderPairwise(forbiddenSpec());
    expect(enumerated).toContain("削減率: 65.0%（分母: 禁則適用後の有効組合せ数 20）");

    const fullProduct = renderPairwise({ ...baseSpec(), maxEnumerationCombinations: 1 });
    expect(fullProduct).toContain("分母: 禁則適用前の全組合せ数 24");
    expect(fullProduct).toContain("禁則適用後の有効組合せ数は未列挙");
  });

  it("states 削減率: 未算出 when the full combination count exceeds the safe integer range", () => {
    // 2水準×60因子 = 2^60 は安全整数を超えるため、削減率は数値を出さない。
    const spec: PairwiseSpec = {
      factors: Array.from({ length: 60 }, (_, i) => ({
        id: `F${i + 1}`,
        name: `因子${i + 1}`,
        levels: ["A", "B"],
      })),
      maxPairCount: 20000,
    };
    const result = computePairwiseRows(spec);
    expect(result.generated).toBe(true);
    expect(result.reductionBasis).toBe("unavailable");
    expect(result.fullCombinationCount).toBeUndefined();

    const md = renderPairwise(spec);
    expect(md).toContain("削減率: 未算出(理由: 全組合せ数が安全整数を超える)");
    expect(md).toContain("全網羅組合せ数: 未算出");
  });

  it("notes that the coverage target table is an excerpt and reports the full count", () => {
    const md = renderPairwise(forbiddenSpec());
    expect(md).toContain("| PW:MAIN:P1 | 券種=おとな × 支払い方法=現金 |");
    expect(md).toContain("29 件全てが universe の対象になる");
  });

  it("reports no findings for a clean spec", () => {
    expect(renderPairwise(baseSpec())).toContain("- 指摘なし");
  });

  it("is deterministic", () => {
    expect(renderPairwise(forbiddenSpec())).toBe(renderPairwise(forbiddenSpec()));
  });
});

describe("renderPairwise 因子引き渡し検査(FHO-04)", () => {
  function inventorySpec(): PairwiseSpec {
    const spec = baseSpec();
    return {
      ...spec,
      factors: spec.factors.map((f, i) => ({ ...f, sourceFactorId: `FCT-0${i + 1}` })),
      factorInventory: spec.factors.map((f, i) => ({
        id: `FCT-0${i + 1}`,
        name: f.name,
        categoryKey: "control",
        levels: f.levels,
        handoverTargetIds: ["FHO-04"],
      })),
    };
  }

  it("factorInventory 未指定なら未算出1行のみで、既存の出力は変わらない", () => {
    const md = renderPairwise(baseSpec());
    expect(md).toContain("## 9. 因子引き渡し検査(FHO-04)");
    const section = md.split("## 9. 因子引き渡し検査(FHO-04)")[1].split("## ")[0];
    expect(section.trim()).toBe(
      "- 未算出(理由: factorInventory が未宣言のため因子引き渡し検査を行わなかった)"
    );
    expect(md).toContain("## 8. サマリ");
    expect(md).toContain("ペア被覆率: 100.0%");
  });

  it("factorInventory / sourceFactorId を足しても行生成・被覆率・findings は変わらない", () => {
    const base = computePairwiseRows(baseSpec());
    const withInventory = computePairwiseRows(inventorySpec());
    expect(withInventory.rows).toEqual(base.rows);
    expect(withInventory.pairCoverageRatioPercent).toBe(base.pairCoverageRatioPercent);
    expect(withInventory.findings).toEqual(base.findings);

    const bodyOf = (md: string) => md.split("## 9. 因子引き渡し検査(FHO-04)")[0];
    expect(bodyOf(renderPairwise(inventorySpec()))).toBe(bodyOf(renderPairwise(baseSpec())));
  });

  it("宣言と実体が一致していれば指摘なしで検証率を出す", () => {
    const md = renderPairwise(inventorySpec());
    const section = md.split("## 9. 因子引き渡し検査(FHO-04)")[1].split("## ")[0];
    expect(section).toContain("| FCT-01 | 券種 | 制御因子 | FHO-04(design_pairwise) | F1 | 検証済み |");
    expect(section).toContain("- 指摘なし");
    expect(section).toContain("引き渡し検証率: 100.0%（分母: 本ツール担当因子数 4");
  });
});

describe("renderPairwise 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderPairwise(baseSpec()));
  });
});
