import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import {
  DEFAULT_CONFIG_MATRIX_ID,
  buildConfigMatrixCoverageTargets,
  computeConfigMatrixRows,
  configMatrixTargetId,
  renderConfigMatrix,
} from "../src/tools/designConfigMatrix.js";
import type { ConfigMatrixSpec } from "../src/types.js";

// 環境マトリクスドメイン: 因子3件・水準2〜3件。
function baseSpec(): ConfigMatrixSpec {
  return {
    title: "決済画面の表示確認",
    factors: [
      { id: "F1", name: "OS", levels: ["Windows11", "macOS"] },
      { id: "F2", name: "ブラウザ", levels: ["Chrome", "Safari", "Edge"] },
      { id: "F3", name: "解像度", levels: ["1920x1080", "1366x768"] },
    ],
  };
}

/** 除外1件: SafariはWindows11では動かない。 */
function excludedSpec(): ConfigMatrixSpec {
  return {
    ...baseSpec(),
    excludedCombinations: [
      {
        id: "EX1",
        when: { F1: "Windows11", F2: "Safari" },
        reason: "SafariはWindows版が提供されていない",
      },
    ],
  };
}

describe("configMatrixTargetId", () => {
  it("formats ids as CFG:<matrixId>:R<n>", () => {
    expect(configMatrixTargetId("MAIN", 1)).toBe("CFG:MAIN:R1");
    expect(configMatrixTargetId("ENV", 12)).toBe("CFG:ENV:R12");
  });
});

describe("computeConfigMatrixRows", () => {
  it("covers every factor and level at least once with coveragePolicy 'single'", () => {
    const result = computeConfigMatrixRows({ ...baseSpec(), coveragePolicy: "single" });
    expect(result.generated).toBe(true);
    expect(result.coveragePolicy).toBe("single");
    expect(result.coverageBasis).toBe("unavailable");
    expect(result.uncoveredLevels).toEqual([]);
    for (const f of baseSpec().factors) {
      for (const lv of f.levels) {
        const present = result.rows.some((r) => r.values[f.id] === lv);
        expect(present).toBe(true);
      }
    }
    // 全行が全因子を埋めている
    for (const row of result.rows) {
      for (const f of baseSpec().factors) {
        expect(f.levels).toContain(row.values[f.id]);
      }
    }
  });

  it("covers every reachable level pair and reaches 100% pair realization (a structural tautology) with coveragePolicy 'pairwise'", () => {
    const result = computeConfigMatrixRows({ ...baseSpec(), coveragePolicy: "pairwise" });
    expect(result.generated).toBe(true);
    expect(result.pairRealizationRatioPercent).toBe(100);
    expect(result.pairs.every((p) => p.status === "reachable" && p.generatedRowNos.length > 0)).toBe(true);
    expect(result.uncoveredLevels).toEqual([]);
  });

  it("matches rows.length to the full product minus excluded combinations with coveragePolicy 'full'", () => {
    const spec = excludedSpec();
    const result = computeConfigMatrixRows({ ...spec, coveragePolicy: "full" });
    expect(result.generated).toBe(true);
    const fullProduct = spec.factors.reduce((n, f) => n * f.levels.length, 1);
    // 除外1件はF1=Windows11,F2=Safariに一致する組合せ(解像度2水準分)を除外する
    const excludedCount = 2;
    expect(result.rows.length).toBe(fullProduct - excludedCount);
  });

  it("excludes unreachable levels and pairs from the coverage denominator", () => {
    // F2=Safariの全ての値がF1=Windows11との組合せでは到達不能というわけではないため、
    // 完全に潰れる水準を作るため、macOSも除外して Safari を全滅させる。
    const spec: ConfigMatrixSpec = {
      factors: [
        { id: "F1", name: "OS", levels: ["Windows11", "macOS"] },
        { id: "F2", name: "ブラウザ", levels: ["Chrome", "Safari"] },
      ],
      excludedCombinations: [
        { id: "EX1", when: { F1: "Windows11", F2: "Safari" }, reason: "非対応" },
        { id: "EX2", when: { F1: "macOS", F2: "Safari" }, reason: "テスト対象外" },
      ],
    };
    const result = computeConfigMatrixRows(spec);
    const safariLevel = result.levels.find((l) => l.factorId === "F2" && l.level === "Safari");
    expect(safariLevel?.status).toBe("unreachable");
    expect(result.unreachableLevelCount).toBe(1);
    expect(result.targetLevelCount).toBe(result.totalLevelCount - 1);
    expect(result.levelRealizationRatioPercent).toBe(100);
  });

  it("reports CMC-06[high] when an excluded combination reason is missing or blank, and not when it is present", () => {
    const missing = computeConfigMatrixRows({
      ...baseSpec(),
      excludedCombinations: [{ id: "EX1", when: { F1: "Windows11" } }],
    });
    expect(missing.generated).toBe(false);
    const cmc06Missing = missing.findings.filter((f) => f.categoryId === "CMC-06");
    expect(cmc06Missing).toHaveLength(1);
    expect(cmc06Missing[0].severity).toBe("high");

    const blank = computeConfigMatrixRows({
      ...baseSpec(),
      excludedCombinations: [{ id: "EX1", when: { F1: "Windows11" }, reason: "   " }],
    });
    expect(blank.generated).toBe(false);
    expect(blank.findings.some((f) => f.categoryId === "CMC-06")).toBe(true);

    const present = computeConfigMatrixRows({
      ...baseSpec(),
      excludedCombinations: [{ id: "EX1", when: { F1: "Windows11" }, reason: "対応対象外" }],
    });
    expect(present.findings.some((f) => f.categoryId === "CMC-06")).toBe(false);
  });

  it("marks a level unreachable and reports CMC-07 when every combination through it is excluded", () => {
    const spec: ConfigMatrixSpec = {
      factors: [
        { id: "F1", name: "OS", levels: ["Windows11", "macOS"] },
        { id: "F2", name: "ブラウザ", levels: ["Chrome", "Safari"] },
      ],
      excludedCombinations: [
        { id: "EX1", when: { F1: "Windows11", F2: "Safari" }, reason: "非対応" },
        { id: "EX2", when: { F1: "macOS", F2: "Safari" }, reason: "テスト対象外" },
      ],
    };
    const result = computeConfigMatrixRows(spec);
    const safariLevel = result.levels.find((l) => l.factorId === "F2" && l.level === "Safari");
    expect(safariLevel?.status).toBe("unreachable");
    const unreachablePairs = result.pairs.filter((p) => p.status === "unreachable");
    expect(unreachablePairs.length).toBeGreaterThan(0);
    expect(unreachablePairs.every((p) => p.levelA === "Safari" || p.levelB === "Safari")).toBe(true);
    const cmc07 = result.findings.filter((f) => f.categoryId === "CMC-07");
    expect(cmc07.length).toBeGreaterThan(0);
    expect(cmc07[0].severity).toBe("medium");
  });

  it("reports CMC-03 for duplicate factor ids/levels, CMC-01/02 for undeclared references", () => {
    const dupFactor = computeConfigMatrixRows({
      factors: [
        { id: "F1", name: "OS", levels: ["Windows11", "macOS"] },
        { id: "F1", name: "OS2", levels: ["Linux"] },
      ],
    });
    expect(dupFactor.findings.some((f) => f.categoryId === "CMC-03")).toBe(true);

    const dupLevel = computeConfigMatrixRows({
      factors: [{ id: "F1", name: "OS", levels: ["Windows11", "Windows11"] }],
    });
    expect(dupLevel.findings.some((f) => f.categoryId === "CMC-03")).toBe(true);

    const undeclaredFactor = computeConfigMatrixRows({
      ...baseSpec(),
      excludedCombinations: [{ when: { F9: "x" }, reason: "存在しない因子" }],
    });
    expect(undeclaredFactor.generated).toBe(false);
    expect(undeclaredFactor.findings.some((f) => f.categoryId === "CMC-01")).toBe(true);

    const undeclaredLevel = computeConfigMatrixRows({
      ...baseSpec(),
      excludedCombinations: [{ when: { F1: "Linux" }, reason: "存在しない水準" }],
    });
    expect(undeclaredLevel.generated).toBe(false);
    expect(undeclaredLevel.findings.some((f) => f.categoryId === "CMC-02")).toBe(true);
  });

  it("reports CMC-04 for single-level factors and CMC-05 for zero factors", () => {
    const singleLevel = computeConfigMatrixRows({
      factors: [{ id: "F1", name: "OS", levels: ["Windows11"] }],
    });
    expect(singleLevel.findings.some((f) => f.categoryId === "CMC-04")).toBe(true);

    const zeroFactors = computeConfigMatrixRows({ factors: [] });
    expect(zeroFactors.generated).toBe(false);
    expect(zeroFactors.findings.some((f) => f.categoryId === "CMC-05")).toBe(true);
  });

  it("reports CMC-09 and skips generation when the combination count cap is exceeded", () => {
    const result = computeConfigMatrixRows({ ...baseSpec(), maxCombinationCount: 2 });
    expect(result.generated).toBe(false);
    expect(result.rows).toEqual([]);
    const cmc09 = result.findings.filter((f) => f.categoryId === "CMC-09");
    expect(cmc09).toHaveLength(1);
    expect(cmc09[0].severity).toBe("info");
  });

  it("is deterministic and does not mutate the input spec", () => {
    const withActualRows = (): ConfigMatrixSpec => ({
      ...excludedSpec(),
      actualRows: [{ id: "A1", values: { F1: "Windows11", F2: "Chrome", F3: "1920x1080" } }],
    });
    expect(computeConfigMatrixRows(withActualRows())).toEqual(computeConfigMatrixRows(withActualRows()));
    const spec = withActualRows();
    const snapshot = JSON.stringify(spec);
    computeConfigMatrixRows(spec);
    expect(JSON.stringify(spec)).toBe(snapshot);
  });
});

describe("computeConfigMatrixRows actualRows(実構成表)に対する被覆", () => {
  it("actualRows 未指定なら coverageBasis が unavailable になり、実被覆率は未算出", () => {
    const result = computeConfigMatrixRows(baseSpec());
    expect(result.coverageBasis).toBe("unavailable");
    expect(result.levelCoverageRatioPercent).toBeUndefined();
    expect(result.pairCoverageRatioPercent).toBeUndefined();
    expect(result.actualCoveredLevelCount).toBeUndefined();
    expect(result.actualCoveredPairCount).toBeUndefined();
    expect(result.uncoveredLevels).toEqual([]);
    expect(result.uncoveredPairs).toEqual([]);
  });

  it("actualRows が対象水準・ペアの一部しか踏んでいない場合、実被覆率は100%未満になる", () => {
    const spec: ConfigMatrixSpec = {
      ...baseSpec(),
      actualRows: [{ id: "A1", values: { F1: "Windows11", F2: "Chrome", F3: "1920x1080" } }],
    };
    const result = computeConfigMatrixRows(spec);
    expect(result.targetLevelCount).toBe(7);
    expect(result.targetPairCount).toBe(16);
    expect(result.coverageBasis).toBe("actual-rows");
    expect(result.actualCoveredLevelCount).toBe(3);
    expect(result.levelCoverageRatioPercent).toBe(42.9);
    expect(result.actualCoveredPairCount).toBe(3);
    expect(result.pairCoverageRatioPercent).toBe(18.8);
    // 構造値である実体化率は生成方針にかかわらず変わらない
    expect(result.levelRealizationRatioPercent).toBe(100);
  });

  it("CMC-10: 実構成表で踏まれていない到達可能な水準を medium で指摘する", () => {
    const spec: ConfigMatrixSpec = {
      ...baseSpec(),
      actualRows: [{ id: "A1", values: { F1: "Windows11", F2: "Chrome", F3: "1920x1080" } }],
    };
    const result = computeConfigMatrixRows(spec);
    const cmc10 = result.findings.filter((f) => f.categoryId === "CMC-10");
    expect(cmc10).toHaveLength(1);
    expect(cmc10[0].severity).toBe("medium");
    expect(cmc10[0].detail).toContain("macOS");
    expect(cmc10[0].detail).toContain("7");
    expect(result.uncoveredLevels.some((l) => l.factorId === "F1" && l.level === "macOS")).toBe(true);
  });

  it("CMC-13: 実構成表で踏まれていない到達可能な水準ペアを medium で指摘する", () => {
    const spec: ConfigMatrixSpec = {
      ...baseSpec(),
      actualRows: [{ id: "A1", values: { F1: "Windows11", F2: "Chrome", F3: "1920x1080" } }],
    };
    const result = computeConfigMatrixRows(spec);
    const cmc13 = result.findings.filter((f) => f.categoryId === "CMC-13");
    expect(cmc13).toHaveLength(1);
    expect(cmc13[0].severity).toBe("medium");
    expect(result.uncoveredPairs.length).toBeGreaterThan(0);
  });

  it("actualRows が全対象水準・ペアを踏めば実被覆率100%になり CMC-10/CMC-13 は出ない", () => {
    const full = computeConfigMatrixRows({ ...baseSpec(), coveragePolicy: "full" });
    const spec: ConfigMatrixSpec = {
      ...baseSpec(),
      actualRows: full.rows.map((row) => ({ id: `R${row.no}`, values: row.values })),
    };
    const result = computeConfigMatrixRows(spec);
    expect(result.levelCoverageRatioPercent).toBe(100);
    expect(result.pairCoverageRatioPercent).toBe(100);
    expect(result.findings.filter((f) => f.categoryId === "CMC-10")).toHaveLength(0);
    expect(result.findings.filter((f) => f.categoryId === "CMC-13")).toHaveLength(0);
  });

  it("CMC-11: actualRows の宣言不整合(未宣言因子・未宣言水準・割当欠落)を high で検出し生成をスキップする", () => {
    const undeclaredFactor = computeConfigMatrixRows({
      ...baseSpec(),
      actualRows: [{ id: "A1", values: { F1: "Windows11", F2: "Chrome", F3: "1920x1080", F9: "x" } }],
    });
    expect(undeclaredFactor.generated).toBe(false);
    const findingsA = undeclaredFactor.findings.filter((f) => f.categoryId === "CMC-11");
    expect(findingsA.length).toBeGreaterThan(0);
    expect(findingsA[0].severity).toBe("high");

    const undeclaredLevel = computeConfigMatrixRows({
      ...baseSpec(),
      actualRows: [{ id: "A1", values: { F1: "Linux", F2: "Chrome", F3: "1920x1080" } }],
    });
    expect(undeclaredLevel.generated).toBe(false);
    expect(undeclaredLevel.findings.some((f) => f.categoryId === "CMC-11")).toBe(true);

    const missingAssignment = computeConfigMatrixRows({
      ...baseSpec(),
      actualRows: [{ id: "A1", values: { F1: "Windows11", F2: "Chrome" } }],
    });
    expect(missingAssignment.generated).toBe(false);
    expect(missingAssignment.findings.some((f) => f.categoryId === "CMC-11")).toBe(true);
  });

  it("CMC-12: 除外組合せに一致する actualRows の行を medium で検出する", () => {
    const spec: ConfigMatrixSpec = {
      ...excludedSpec(),
      actualRows: [{ id: "A1", values: { F1: "Windows11", F2: "Safari", F3: "1920x1080" } }],
    };
    const result = computeConfigMatrixRows(spec);
    const cmc12 = result.findings.filter((f) => f.categoryId === "CMC-12");
    expect(cmc12).toHaveLength(1);
    expect(cmc12[0].severity).toBe("medium");
    expect(cmc12[0].detail).toContain("EX1");
  });
});

describe("buildConfigMatrixCoverageTargets", () => {
  it("emits CFG:<matrixId>:R<n> ids for every generated row", () => {
    const targets = buildConfigMatrixCoverageTargets(baseSpec());
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      expect(t.id).toMatch(/^CFG:MAIN:R\d+$/);
      expect(t.techniqueId).toBe("config-matrix");
      expect(t.origin).toBe(DEFAULT_CONFIG_MATRIX_ID);
      expect(t.description).toContain("=");
    }
  });

  it("returns an empty array when generation was skipped", () => {
    expect(buildConfigMatrixCoverageTargets({ ...baseSpec(), maxCombinationCount: 1 })).toEqual([]);
  });
});

describe("renderConfigMatrix", () => {
  it("renders all eight sections", () => {
    const md = renderConfigMatrix(excludedSpec());
    expect(md).toContain("# 構成・環境マトリクス設計結果");
    expect(md).toContain("## 1. 構成因子・水準一覧");
    expect(md).toContain("## 2. 除外組合せ一覧");
    expect(md).toContain("## 3. 到達不能な水準・ペアの一覧");
    expect(md).toContain("## 4. 生成した構成表");
    expect(md).toContain("## 5. 実構成表");
    expect(md).toContain("## 6. 決定的検査");
    expect(md).toContain("## 7. 網羅対象一覧(generate_test_cases 引き渡し)");
    expect(md).toContain("## 8. サマリ");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("marks a missing exclusion reason explicitly as (未記入)", () => {
    const md = renderConfigMatrix({
      ...baseSpec(),
      excludedCombinations: [{ id: "EX1", when: { F1: "Windows11" }, reason: "" }],
    });
    expect(md).toContain("(未記入)");
  });

  it("actualRows 未指定なら実構成表節に未算出と出る", () => {
    const md = renderConfigMatrix(baseSpec());
    const section5 = md.split("## 5. 実構成表")[1].split("## 6.")[0];
    expect(section5).toContain("未算出");
  });

  it("actualRows 指定時は分母・分子つきの被覆率が出る", () => {
    const md = renderConfigMatrix({
      ...baseSpec(),
      actualRows: [{ id: "A1", values: { F1: "Windows11", F2: "Chrome", F3: "1920x1080" } }],
    });
    const section5 = md.split("## 5. 実構成表")[1].split("## 6.")[0];
    expect(section5).toContain("分母");
    expect(section5).toContain("分子");
  });

  it("実体化率が構造上の恒真値であるという但し書きが出る", () => {
    const md = renderConfigMatrix(baseSpec());
    expect(md).toContain("テストの達成度ではない");
  });

  it("is deterministic", () => {
    expect(renderConfigMatrix(excludedSpec())).toBe(renderConfigMatrix(excludedSpec()));
  });
});

describe("renderConfigMatrix 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderConfigMatrix(baseSpec()));
  });

  it("actualRows 未指定(被覆率未算出)では締めの注意書きにシグナルが含まれる", () => {
    const md = renderConfigMatrix(baseSpec());
    expect(md).toContain("生成物から機械的に導いたシグナル（has-unmeasured-coverage");
  });

  it("high指摘(reason未記入の除外)があると has-high-findings シグナルが含まれる", () => {
    const spec: ConfigMatrixSpec = {
      ...baseSpec(),
      excludedCombinations: [{ id: "EX1", when: { F1: "Windows11", F2: "Safari" } }],
    };
    const md = renderConfigMatrix(spec);
    expect(md).toContain("has-high-findings");
  });

  it("actualRows が全水準・全ペアを踏んでいれば has-uncovered-combinations は含まれない", () => {
    const spec: ConfigMatrixSpec = {
      ...baseSpec(),
      actualRows: [
        { values: { F1: "Windows11", F2: "Chrome", F3: "1920x1080" } },
        { values: { F1: "Windows11", F2: "Safari", F3: "1920x1080" } },
        { values: { F1: "Windows11", F2: "Edge", F3: "1920x1080" } },
        { values: { F1: "macOS", F2: "Chrome", F3: "1366x768" } },
        { values: { F1: "macOS", F2: "Safari", F3: "1366x768" } },
        { values: { F1: "macOS", F2: "Edge", F3: "1366x768" } },
        { values: { F1: "Windows11", F2: "Chrome", F3: "1366x768" } },
        { values: { F1: "macOS", F2: "Chrome", F3: "1920x1080" } },
      ],
    };
    const md = renderConfigMatrix(spec);
    expect(md).not.toContain("has-uncovered-combinations");
  });

  it("actualRows が一部水準しか踏んでいなければ has-uncovered-combinations が含まれる", () => {
    const spec: ConfigMatrixSpec = {
      ...baseSpec(),
      actualRows: [{ values: { F1: "Windows11", F2: "Chrome", F3: "1920x1080" } }],
    };
    const md = renderConfigMatrix(spec);
    expect(md).toContain("has-uncovered-combinations");
  });
});
