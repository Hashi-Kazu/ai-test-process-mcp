import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import {
  DEFAULT_DECISION_TABLE_ID,
  buildDecisionTableCoverageTargets,
  computeDecisionTableRows,
  decisionTableTargetId,
  renderDecisionTable,
} from "../src/tools/designDecisionTable.js";
import type { DecisionTableSpec } from "../src/types.js";

function baseSpec(): DecisionTableSpec {
  return {
    conditions: [
      { id: "C1", statement: "券種", levels: ["おとな", "こども"] },
      { id: "C2", statement: "支払い方法", levels: ["現金", "IC", "クレカ"] },
      { id: "C3", statement: "枚数区分", levels: ["1-9", "0または10以上"] },
    ],
    actions: [
      { id: "A1", statement: "入場可否" },
      { id: "A2", statement: "追加確認" },
    ],
    invalidCombinations: [
      {
        id: "IC1",
        when: { C1: ["おとな", "こども"], C2: "現金", C3: "0または10以上" },
        reason: "現金決済で0枚または10枚以上の同時購入は受け付けない",
      },
    ],
    rules: [
      { id: "R1", when: { C3: "1-9" }, actions: { A1: "Y", A2: "N" } },
      {
        id: "R2",
        when: { C2: ["IC", "クレカ"], C3: "0または10以上" },
        actions: { A1: "Y", A2: "Y" },
      },
    ],
  };
}

describe("computeDecisionTableRows", () => {
  it("enumerates all combinations with the last condition varying fastest", () => {
    const result = computeDecisionTableRows(baseSpec());
    expect(result.enumerated).toBe(true);
    expect(result.totalCombinationCount).toBe(12);
    expect(result.combinations).toHaveLength(12);
    expect(result.combinations[0].values).toEqual({ C1: "おとな", C2: "現金", C3: "1-9" });
    expect(result.combinations[1].values).toEqual({ C1: "おとな", C2: "現金", C3: "0または10以上" });
    expect(result.combinations[2].values).toEqual({ C1: "おとな", C2: "IC", C3: "1-9" });
    expect(result.combinations[11].values).toEqual({ C1: "こども", C2: "クレカ", C3: "0または10以上" });
  });

  it("excludes invalid combinations and records the reason", () => {
    const result = computeDecisionTableRows(baseSpec());
    expect(result.invalidCombinationCount).toBe(2);
    expect(result.validCombinationCount).toBe(10);
    const invalid = result.combinations.filter((c) => c.status === "invalid");
    expect(invalid).toHaveLength(2);
    for (const combo of invalid) {
      expect(combo.invalidReason).toBe("現金決済で0枚または10枚以上の同時購入は受け付けない");
    }
  });

  it("compresses same-action combinations, deriving don't-care conditions", () => {
    const result = computeDecisionTableRows(baseSpec());
    expect(result.definedCombinationCount).toBe(10);
    expect(result.compressedRules.length).toBeLessThan(result.definedCombinationCount);
    expect(result.compressionRatioPercent).toBeCloseTo(80, 5);

    const icCreditRule = result.compressedRules.find(
      (r) => JSON.stringify(r.conditionLevels.C2) === JSON.stringify(["IC", "クレカ"])
    );
    expect(icCreditRule).toBeDefined();
    expect(icCreditRule?.dontCareConditionIds).toContain("C1");
    expect(icCreditRule?.dontCareConditionIds).not.toContain("C2");
  });

  it("does not fold excluded levels into don't-care conditions (compression soundness)", () => {
    const result = computeDecisionTableRows(baseSpec());
    const icCreditRule = result.compressedRules.find(
      (r) => (r.conditionLevels.C2 ?? []).length === 2 && r.conditionLevels.C2.includes("IC")
    );
    expect(icCreditRule).toBeDefined();
    // 現金 は当該ルールの直積に含まれてはならない（無効組合せのため）。
    expect(icCreditRule?.conditionLevels.C2).not.toContain("現金");
    // 直積が valid 組合せのみで構成されることの確認（束ねた件数 = 直積のサイズ）。
    const productSize =
      (icCreditRule?.conditionLevels.C1.length ?? 0) *
      (icCreditRule?.conditionLevels.C2.length ?? 0) *
      (icCreditRule?.conditionLevels.C3.length ?? 0);
    expect(icCreditRule?.combinationIndexes.length).toBe(productSize);
  });

  it("reports DTC-06 for combinations with no matching rule, and nothing when fully covered", () => {
    const fullyCovered = computeDecisionTableRows(baseSpec());
    expect(fullyCovered.undefinedCombinationIndexes).toHaveLength(0);
    expect(fullyCovered.findings.filter((f) => f.categoryId === "DTC-06")).toHaveLength(0);

    const partial: DecisionTableSpec = {
      ...baseSpec(),
      rules: [
        { id: "R1", when: { C2: ["現金", "IC"], C3: "1-9" }, actions: { A1: "Y", A2: "N" } },
        {
          id: "R2",
          when: { C2: ["IC", "クレカ"], C3: "0または10以上" },
          actions: { A1: "Y", A2: "Y" },
        },
      ],
    };
    const result = computeDecisionTableRows(partial);
    expect(result.undefinedCombinationIndexes.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.categoryId === "DTC-06" && f.severity === "high")).toBe(true);
  });

  it("reports DTC-07 for conflicting rule matches and excludes them from compression", () => {
    const spec: DecisionTableSpec = {
      ...baseSpec(),
      rules: [
        { id: "R1", when: { C3: "1-9" }, actions: { A1: "Y", A2: "N" } },
        { id: "R2", when: { C2: ["IC", "クレカ"], C3: "0または10以上" }, actions: { A1: "Y", A2: "Y" } },
        // R3 は R1 と同じ組合せに一致しつつ動作が食い違う。
        { id: "R3", when: { C1: "おとな", C2: "現金", C3: "1-9" }, actions: { A1: "N", A2: "Y" } },
      ],
    };
    const result = computeDecisionTableRows(spec);
    expect(result.conflictingCombinationIndexes.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.categoryId === "DTC-07" && f.severity === "high")).toBe(true);
    const conflictingIndex = result.conflictingCombinationIndexes[0];
    for (const rule of result.compressedRules) {
      expect(rule.combinationIndexes).not.toContain(conflictingIndex);
    }
  });

  it("reports DTC-01..DTC-04 as high and stops enumeration", () => {
    const unknownConditionRef = computeDecisionTableRows({
      conditions: [{ id: "C1", statement: "券種", levels: ["おとな", "こども"] }],
      actions: [{ id: "A1", statement: "入場可否" }],
      rules: [{ when: { CX: "おとな" }, actions: { A1: "Y" } }],
    });
    expect(unknownConditionRef.enumerated).toBe(false);
    expect(unknownConditionRef.skipReason).toContain("DTC-01");
    expect(unknownConditionRef.combinations).toHaveLength(0);
    expect(unknownConditionRef.compressedRules).toHaveLength(0);

    const unknownLevelRef = computeDecisionTableRows({
      conditions: [{ id: "C1", statement: "券種", levels: ["おとな", "こども"] }],
      actions: [{ id: "A1", statement: "入場可否" }],
      rules: [{ when: { C1: "シニア" }, actions: { A1: "Y" } }],
    });
    expect(unknownLevelRef.enumerated).toBe(false);
    expect(unknownLevelRef.findings.some((f) => f.categoryId === "DTC-02" && f.severity === "high")).toBe(true);

    const unknownActionRef = computeDecisionTableRows({
      conditions: [{ id: "C1", statement: "券種", levels: ["おとな", "こども"] }],
      actions: [{ id: "A1", statement: "入場可否" }],
      rules: [{ when: { C1: "おとな" }, actions: { AX: "Y" } }],
    });
    expect(unknownActionRef.enumerated).toBe(false);
    expect(unknownActionRef.findings.some((f) => f.categoryId === "DTC-03" && f.severity === "high")).toBe(true);

    const duplicateId = computeDecisionTableRows({
      conditions: [
        { id: "C1", statement: "券種", levels: ["おとな", "こども"] },
        { id: "C1", statement: "重複条件", levels: ["a", "b"] },
      ],
      actions: [{ id: "A1", statement: "入場可否" }],
    });
    expect(duplicateId.enumerated).toBe(false);
    expect(duplicateId.findings.some((f) => f.categoryId === "DTC-04" && f.severity === "high")).toBe(true);
  });

  it("reports DTC-10 and skips enumeration when combinations exceed maxCombinations", () => {
    const result = computeDecisionTableRows({
      conditions: [
        { id: "C1", statement: "A", levels: ["1", "2", "3"] },
        { id: "C2", statement: "B", levels: ["1", "2", "3"] },
        { id: "C3", statement: "C", levels: ["1", "2", "3"] },
      ],
      actions: [{ id: "A1", statement: "動作" }],
      maxCombinations: 10,
    });
    expect(result.enumerated).toBe(false);
    expect(result.totalCombinationCount).toBe(27);
    expect(result.findings.some((f) => f.categoryId === "DTC-10" && f.severity === "info")).toBe(true);
  });

  it("does not mutate the input spec", () => {
    const spec = baseSpec();
    const before = JSON.stringify(spec);
    computeDecisionTableRows(spec);
    expect(JSON.stringify(spec)).toBe(before);
  });
});

describe("buildDecisionTableCoverageTargets / decisionTableTargetId", () => {
  it("builds DT:MAIN:R<no> ids for each compressed rule", () => {
    const spec = baseSpec();
    const targets = buildDecisionTableCoverageTargets(spec);
    const result = computeDecisionTableRows(spec);
    expect(targets).toHaveLength(result.compressedRules.length);
    expect(targets[0].id).toBe(decisionTableTargetId(DEFAULT_DECISION_TABLE_ID, 1));
    expect(targets.every((t) => t.techniqueId === "decision-table")).toBe(true);
  });

  it("uses the declared tableId", () => {
    const spec: DecisionTableSpec = { ...baseSpec(), tableId: "TBL1" };
    const targets = buildDecisionTableCoverageTargets(spec);
    expect(targets[0].id).toBe("DT:TBL1:R1");
  });

  it("returns an empty array when enumeration was skipped", () => {
    const targets = buildDecisionTableCoverageTargets({
      conditions: [{ id: "C1", statement: "券種", levels: ["おとな", "こども"] }],
      actions: [{ id: "A1", statement: "入場可否" }],
      rules: [{ when: { CX: "おとな" }, actions: { A1: "Y" } }],
    });
    expect(targets).toHaveLength(0);
  });
});

describe("renderDecisionTable", () => {
  it("renders the report sections for an enumerated table", () => {
    const md = renderDecisionTable(baseSpec());
    expect(md).toContain("# デシジョンテーブル設計結果");
    expect(md).toContain("## 4. デシジョンテーブル(圧縮後)");
    expect(md).toContain("削減率:");
  });

  it("renders a skip line when enumeration was not performed", () => {
    const md = renderDecisionTable({
      conditions: [{ id: "C1", statement: "券種", levels: ["おとな", "こども"] }],
      actions: [{ id: "A1", statement: "入場可否" }],
      rules: [{ when: { CX: "おとな" }, actions: { A1: "Y" } }],
    });
    expect(md).toContain("- 未算出(理由:");
  });
});

describe("renderDecisionTable 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderDecisionTable(baseSpec()));
  });
});
