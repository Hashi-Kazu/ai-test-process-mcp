import { describe, expect, it } from "vitest";
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
    expect(result.untestedLevels).toEqual([]);
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

  it("covers every reachable level pair and reaches 100% pair coverage with coveragePolicy 'pairwise'", () => {
    const result = computeConfigMatrixRows({ ...baseSpec(), coveragePolicy: "pairwise" });
    expect(result.generated).toBe(true);
    expect(result.pairCoverageRatioPercent).toBe(100);
    expect(result.pairs.every((p) => p.status === "reachable" && p.coveredByRowNos.length > 0)).toBe(true);
    expect(result.untestedLevels).toEqual([]);
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
    expect(result.levelCoverageRatioPercent).toBe(100);
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
    expect(computeConfigMatrixRows(excludedSpec())).toEqual(computeConfigMatrixRows(excludedSpec()));
    const spec = excludedSpec();
    const snapshot = JSON.stringify(spec);
    computeConfigMatrixRows(spec);
    expect(JSON.stringify(spec)).toBe(snapshot);
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
  it("renders all seven sections", () => {
    const md = renderConfigMatrix(excludedSpec());
    expect(md).toContain("# 構成・環境マトリクス設計結果");
    expect(md).toContain("## 1. 構成因子・水準一覧");
    expect(md).toContain("## 2. 除外組合せ一覧");
    expect(md).toContain("## 3. 到達不能な水準・ペアの一覧");
    expect(md).toContain("## 4. 生成した構成表");
    expect(md).toContain("## 5. 決定的検査");
    expect(md).toContain("## 6. 網羅対象一覧(generate_test_cases 引き渡し)");
    expect(md).toContain("## 7. サマリ");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("marks a missing exclusion reason explicitly as (未記入)", () => {
    const md = renderConfigMatrix({
      ...baseSpec(),
      excludedCombinations: [{ id: "EX1", when: { F1: "Windows11" }, reason: "" }],
    });
    expect(md).toContain("(未記入)");
  });

  it("is deterministic", () => {
    expect(renderConfigMatrix(excludedSpec())).toBe(renderConfigMatrix(excludedSpec()));
  });
});
