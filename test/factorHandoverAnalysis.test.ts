import { describe, expect, it } from "vitest";
import {
  evaluateFactorHandover,
  renderFactorHandoverSection,
} from "../src/factorHandoverAnalysis.js";
import { renderPairwise } from "../src/tools/designPairwise.js";
import { factorRalphFrame } from "../src/resources/factorRalphFrame.js";
import type {
  FactorHandoverItem,
  FactorInventoryEntry,
  FactorRalphFrame,
  PairwiseSpec,
} from "../src/types.js";

// 遊園地の入場ゲート（券売機・入場制限）ドメインの因子表を共通題材にする。
function baseInventory(): FactorInventoryEntry[] {
  return [
    {
      id: "FCT-01",
      name: "端末種別",
      categoryKey: "control",
      levels: ["自動改札", "有人窓口"],
      handoverTargetIds: ["FHO-04"],
    },
    {
      id: "FCT-02",
      name: "通信品質",
      categoryKey: "noise",
      levels: ["通常", "劣化"],
      handoverTargetIds: ["FHO-04"],
    },
    {
      id: "FCT-03",
      name: "混雑度",
      categoryKey: "noise",
    },
    {
      id: "FCT-04",
      name: "券種",
      categoryKey: "state",
      levels: ["おとな", "こども"],
      handoverTargetIds: ["FHO-03"],
    },
  ];
}

function pairwiseItems(): FactorHandoverItem[] {
  return [
    {
      itemLabel: "F1",
      displayName: "端末種別",
      sourceFactorId: "FCT-01",
      levelBasis: "levels",
      levelLabels: ["自動改札", "有人窓口"],
    },
    {
      itemLabel: "F2",
      displayName: "通信品質",
      sourceFactorId: "FCT-02",
      levelBasis: "levels",
      levelLabels: ["通常", "劣化"],
    },
  ];
}

function findingsOf(categoryId: string, findings: { categoryId: string }[]) {
  return findings.filter((f) => f.categoryId === categoryId);
}

describe("evaluateFactorHandover", () => {
  it("flags a factor that is not handed over to any technique", () => {
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: baseInventory(),
      items: pairwiseItems(),
    });

    const fhc01 = findingsOf("FHC-01", result.findings);
    expect(fhc01).toHaveLength(1);
    expect(fhc01[0].severity).toBe("high");
    expect(fhc01[0].target).toContain("FCT-03");
    expect(fhc01[0].detail).toContain("FCT-03");
    expect(result.unassignedFactorCount).toBe(1);
    expect(result.entries.find((e) => e.factorId === "FCT-03")?.verdict).toBe("unassigned");

    // 引き渡し済みの2件は実体照合を通り、他ツール担当は分母に入らない。
    expect(result.assignedFactorCount).toBe(2);
    expect(result.verifiedFactorCount).toBe(2);
    expect(result.otherToolFactorCount).toBe(1);

    const spec: PairwiseSpec = {
      factors: [
        {
          id: "F1",
          name: "端末種別",
          levels: ["自動改札", "有人窓口"],
          sourceFactorId: "FCT-01",
        },
        { id: "F2", name: "通信品質", levels: ["通常", "劣化"], sourceFactorId: "FCT-02" },
      ],
      factorInventory: baseInventory(),
    };
    const markdown = renderPairwise(spec);
    expect(markdown).toContain("## 9. 因子引き渡し検査(FHO-04)");
    const findingLine = markdown
      .split("\n")
      .find((l) => l.includes("FHC-01") && l.includes("FCT-03"));
    expect(findingLine).toBeDefined();
    expect(markdown).toContain("引き渡し先未宣言: 1");
  });

  it("treats a dropped factor with a reason as excluded, not unassigned", () => {
    const inventory = baseInventory();
    inventory[2].droppedReason = "本リリースでは計測手段が無く、観測できないため対象外とした";
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: inventory,
      items: pairwiseItems(),
    });
    expect(findingsOf("FHC-01", result.findings)).toHaveLength(0);
    expect(result.droppedFactorCount).toBe(1);
    expect(result.unassignedFactorCount).toBe(0);
    expect(result.entries.find((e) => e.factorId === "FCT-03")?.verdict).toBe("dropped");
  });

  it("FHC-02: flags unknown category keys, unknown handover targets and duplicated ids", () => {
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: [
        {
          id: "FCT-01",
          name: "端末種別",
          categoryKey: "env",
          levels: ["自動改札", "有人窓口"],
          handoverTargetIds: ["FHO-09"],
        },
        {
          id: "FCT-01",
          name: "端末種別(再掲)",
          categoryKey: "control",
          handoverTargetIds: ["FHO-04"],
        },
      ],
      items: [],
    });
    const fhc02 = findingsOf("FHC-02", result.findings);
    expect(fhc02).toHaveLength(3);
    expect(fhc02.every((f) => f.severity === "high")).toBe(true);
    expect(fhc02.some((f) => f.detail.includes("分類キー「env」"))).toBe(true);
    expect(fhc02.some((f) => f.detail.includes("引き渡し先「FHO-09」"))).toBe(true);
    expect(fhc02.some((f) => f.detail.includes("重複して宣言されている"))).toBe(true);
    // 未知の分類キーでは適用分類の判定を行わない（FHC-02 と二重指摘しない）。
    expect(findingsOf("FHC-03", result.findings)).toHaveLength(0);
  });

  it("FHC-03: flags a factor whose category is outside the applicable categories of the target", () => {
    const result = evaluateFactorHandover({
      conventionId: "FHO-01",
      factorInventory: [
        {
          id: "FCT-02",
          name: "通信品質",
          categoryKey: "noise",
          handoverTargetIds: ["FHO-01"],
        },
      ],
      items: [
        {
          itemLabel: "variables[0]",
          displayName: "FCT-02 通信品質",
          sourceFactorId: "FCT-02",
          levelBasis: "range",
          rangeDeclared: true,
        },
      ],
    });
    const fhc03 = findingsOf("FHC-03", result.findings);
    expect(fhc03).toHaveLength(1);
    expect(fhc03[0].severity).toBe("high");
    expect(fhc03[0].detail).toContain("誤差因子");
    expect(fhc03[0].detail).toContain("FHO-01(design_boundary_values)");
    expect(fhc03[0].detail).toContain("信号因子, 制御因子");
    // 実体はあるが指摘が残るため「検証済み」には数えない。
    expect(result.assignedFactorCount).toBe(1);
    expect(result.verifiedFactorCount).toBe(0);
    expect(result.entries[0].verifiedByEntity).toBe(false);
  });

  it("FHC-04: flags an assigned factor without any matching item", () => {
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: baseInventory(),
      items: [pairwiseItems()[0]],
    });
    const fhc04 = findingsOf("FHC-04", result.findings);
    expect(fhc04).toHaveLength(1);
    expect(fhc04[0].severity).toBe("high");
    expect(fhc04[0].detail).toContain("sourceFactorId=FCT-02");
    expect(result.entries.find((e) => e.factorId === "FCT-02")?.verdict).toBe("no-entity");
    expect(result.assignedFactorCount).toBe(2);
    expect(result.verifiedFactorCount).toBe(1);
    expect(result.verifiedRatioPercent).toBe(50);
  });

  it("FHC-05: flags an item referencing a factor id absent from the inventory", () => {
    const items = pairwiseItems();
    items[1] = { ...items[1], sourceFactorId: "FCT-99" };
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: baseInventory(),
      items,
    });
    const fhc05 = findingsOf("FHC-05", result.findings);
    expect(fhc05).toHaveLength(1);
    expect(fhc05[0].severity).toBe("high");
    expect(fhc05[0].target).toBe("F2");
    expect(fhc05[0].detail).toContain("FCT-99");
  });

  it("FHC-06: flags a missing factor name and a missing factor id notation", () => {
    const inventory: FactorInventoryEntry[] = [
      {
        id: "FCT-01",
        name: "入場制限人数",
        categoryKey: "control",
        handoverTargetIds: ["FHO-01"],
      },
    ];
    const missingId = evaluateFactorHandover({
      conventionId: "FHO-01",
      factorInventory: inventory,
      items: [
        {
          itemLabel: "variables[0]",
          displayName: "入場制限人数",
          sourceFactorId: "FCT-01",
          levelBasis: "range",
          rangeDeclared: true,
        },
      ],
    });
    const idFindings = findingsOf("FHC-06", missingId.findings);
    expect(idFindings).toHaveLength(1);
    expect(idFindings[0].severity).toBe("medium");
    expect(idFindings[0].detail).toContain("因子ID「FCT-01」");
    expect(idFindings[0].detail).toContain("併記");

    const missingName = evaluateFactorHandover({
      conventionId: "FHO-01",
      factorInventory: inventory,
      items: [
        {
          itemLabel: "variables[0]",
          displayName: "FCT-01 入場者数",
          sourceFactorId: "FCT-01",
          levelBasis: "range",
          rangeDeclared: true,
        },
      ],
    });
    const nameFindings = findingsOf("FHC-06", missingName.findings);
    expect(nameFindings).toHaveLength(1);
    expect(nameFindings[0].detail).toContain("因子名「入場制限人数」");

    // 因子ID併記を要求しない規約（FHO-04）では因子IDの指摘を出さない。
    const pairwise = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: baseInventory(),
      items: pairwiseItems(),
    });
    expect(findingsOf("FHC-06", pairwise.findings)).toHaveLength(0);
  });

  it("FHC-07: flags declared levels dropped on handover and levels absent from the factor table", () => {
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: [
        {
          id: "FCT-05",
          name: "座席区分",
          categoryKey: "control",
          levels: ["指定席", "自由席", "立見"],
          handoverTargetIds: ["FHO-04"],
        },
      ],
      items: [
        {
          itemLabel: "F3",
          displayName: "座席区分",
          sourceFactorId: "FCT-05",
          levelBasis: "levels",
          levelLabels: ["指定席", "自由席", "立見(要確認)"],
        },
      ],
    });
    const fhc07 = findingsOf("FHC-07", result.findings);
    expect(fhc07).toHaveLength(2);
    expect(fhc07.every((f) => f.severity === "medium")).toBe(true);
    expect(fhc07.some((f) => f.detail.includes("水準「立見」が投入した水準一覧に現れておらず"))).toBe(
      true
    );
    expect(fhc07.some((f) => f.detail.includes("水準「立見(要確認)」が因子表の水準一覧に無い"))).toBe(
      true
    );
    expect(result.verifiedFactorCount).toBe(0);
  });

  it("FHC-08: flags a range declaration whose min exceeds max", () => {
    const result = evaluateFactorHandover({
      conventionId: "FHO-01",
      factorInventory: [
        {
          id: "FCT-01",
          name: "入場制限人数",
          categoryKey: "control",
          handoverTargetIds: ["FHO-01"],
        },
      ],
      items: [
        {
          itemLabel: "variables[0]",
          displayName: "FCT-01 入場制限人数",
          sourceFactorId: "FCT-01",
          levelBasis: "range",
          rangeDeclared: false,
        },
      ],
    });
    const fhc08 = findingsOf("FHC-08", result.findings);
    expect(fhc08).toHaveLength(1);
    expect(fhc08[0].severity).toBe("medium");
    expect(fhc08[0].target).toBe("variables[0]");
    expect(fhc08[0].detail).toContain("min が max を上回っており");
    // 範囲型の水準ヒューリスティックIDは frame の記法から解決する。
    expect(fhc08[0].detail).toContain("FLH-01");
  });

  it("FHC-09: flags a factor declared both as handed over and as dropped or fixed", () => {
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: [
        {
          id: "FCT-06",
          name: "営業モード",
          categoryKey: "control",
          levels: ["通常営業", "短縮営業"],
          handoverTargetIds: ["FHO-04"],
          droppedReason: "運用上ほぼ固定であるため対象外",
          fixedCondition: true,
        },
      ],
      items: [
        {
          itemLabel: "F1",
          displayName: "営業モード",
          sourceFactorId: "FCT-06",
          levelBasis: "levels",
          levelLabels: ["通常営業", "短縮営業"],
        },
      ],
    });
    const fhc09 = findingsOf("FHC-09", result.findings);
    expect(fhc09).toHaveLength(2);
    expect(fhc09.some((f) => f.detail.includes("除外理由も記入されており"))).toBe(true);
    expect(fhc09.some((f) => f.detail.includes("固定条件として分離されている"))).toBe(true);
  });

  it("FHC-10: flags a single-level factor handed over to a level based technique", () => {
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: [
        {
          id: "FCT-07",
          name: "会員区分",
          categoryKey: "control",
          levels: ["一般"],
          handoverTargetIds: ["FHO-04"],
        },
      ],
      items: [
        {
          itemLabel: "F1",
          displayName: "会員区分",
          sourceFactorId: "FCT-07",
          levelBasis: "levels",
          levelLabels: ["一般"],
        },
      ],
    });
    const fhc10 = findingsOf("FHC-10", result.findings);
    expect(fhc10).toHaveLength(1);
    expect(fhc10[0].severity).toBe("medium");
    expect(fhc10[0].detail).toContain("水準が1件しかなく");
    expect(result.verifiedFactorCount).toBe(0);
  });

  it("FHC-11: reports the number of items without sourceFactorId", () => {
    const items = pairwiseItems().map((it) => ({ ...it, sourceFactorId: undefined }));
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: baseInventory(),
      items,
    });
    const fhc11 = findingsOf("FHC-11", result.findings);
    expect(fhc11).toHaveLength(1);
    expect(fhc11[0].severity).toBe("info");
    expect(fhc11[0].detail).toContain("2 件");
  });

  it("FHC-12: flags sourceFactorId given while factorInventory is undeclared", () => {
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      items: pairwiseItems(),
    });
    expect(result.available).toBe(false);
    expect(result.ratioBasis).toBe("unavailable");
    const fhc12 = findingsOf("FHC-12", result.findings);
    expect(fhc12).toHaveLength(1);
    expect(fhc12[0].severity).toBe("medium");
    expect(fhc12[0].detail).toContain("factorInventory が未宣言");
  });

  it("keeps the verified ratio denominator limited to factors assigned to this tool", () => {
    const inventory = baseInventory();
    // FHO-04 担当は FCT-01 / FCT-02 の2件のみ。FCT-03(未宣言)・FCT-04(他ツール)は分母に入れない。
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: inventory,
      items: [pairwiseItems()[0]],
    });
    expect(result.entries).toHaveLength(4);
    expect(result.assignedFactorCount).toBe(2);
    expect(result.verifiedFactorCount).toBe(1);
    expect(result.verifiedRatioPercent).toBe(50);
    expect(result.ratioBasis).toBe("verified");

    const section = renderFactorHandoverSection("## 9. 因子引き渡し検査(FHO-04)", {
      conventionId: "FHO-04",
      factorInventory: inventory,
      items: [pairwiseItems()[0]],
    });
    expect(section).toContain("引き渡し検証率: 50.0%（分母: 本ツール担当因子数 2");
  });

  it("does not print a ratio when factorInventory is undeclared", () => {
    const section = renderFactorHandoverSection("## 9. 因子引き渡し検査(FHO-04)", {
      conventionId: "FHO-04",
      items: [],
    });
    expect(section).toContain(
      "- 未算出(理由: factorInventory が未宣言のため因子引き渡し検査を行わなかった)"
    );
    expect(section).not.toContain("引き渡し検証率");
    expect(section).not.toContain("%");
  });

  it("does not print a ratio when no factor is assigned to this tool", () => {
    const section = renderFactorHandoverSection("## 9. 因子引き渡し検査(FHO-04)", {
      conventionId: "FHO-04",
      factorInventory: [
        { id: "FCT-04", name: "券種", categoryKey: "state", handoverTargetIds: ["FHO-03"] },
      ],
      items: [],
    });
    expect(section).toContain("引き渡し検証率: 未算出(理由: 本ツールへ引き渡された因子が0件");
    expect(section).toContain("他ツール担当: 1");
  });

  it("escapes pipe characters in table cells", () => {
    const section = renderFactorHandoverSection("## 9. 因子引き渡し検査(FHO-04)", {
      conventionId: "FHO-04",
      factorInventory: [
        {
          id: "FCT-08",
          name: "経路|区分",
          categoryKey: "control",
          levels: ["A", "B"],
          handoverTargetIds: ["FHO-04"],
        },
      ],
      items: [
        {
          itemLabel: "F1",
          displayName: "経路|区分",
          sourceFactorId: "FCT-08",
          levelBasis: "levels",
          levelLabels: ["A", "B"],
        },
      ],
    });
    expect(section).toContain("経路\\|区分");
  });

  it("is deterministic for the same input, including array order", () => {
    const input = {
      conventionId: "FHO-04",
      factorInventory: baseInventory(),
      items: pairwiseItems(),
    };
    const a = evaluateFactorHandover(input);
    const b = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: baseInventory(),
      items: pairwiseItems(),
    });
    expect(b).toEqual(a);
    expect(b.findings.map((f) => f.categoryId)).toEqual(a.findings.map((f) => f.categoryId));
    expect(
      renderFactorHandoverSection("## 9. 因子引き渡し検査(FHO-04)", input)
    ).toBe(renderFactorHandoverSection("## 9. 因子引き渡し検査(FHO-04)", input));
  });

  it("sorts findings by category id", () => {
    const inventory = baseInventory();
    inventory[0].handoverTargetIds = ["FHO-99"];
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: inventory,
      items: pairwiseItems(),
    });
    const ids = result.findings.map((f) => f.categoryId);
    expect([...ids].sort((a, b) => a.localeCompare(b))).toEqual(ids);
  });

  it("does not mutate the input", () => {
    const inventory = baseInventory();
    const items = pairwiseItems();
    const inventorySnapshot = JSON.stringify(inventory);
    const itemsSnapshot = JSON.stringify(items);
    evaluateFactorHandover({ conventionId: "FHO-04", factorInventory: inventory, items });
    expect(JSON.stringify(inventory)).toBe(inventorySnapshot);
    expect(JSON.stringify(items)).toBe(itemsSnapshot);
  });

  it("derives category labels and applicable categories from the given frame", () => {
    // 分類名・適用分類・記法要求を差し替えた frame では、判定と表示がその frame に従う。
    const customFrame: FactorRalphFrame = {
      ...factorRalphFrame,
      categories: factorRalphFrame.categories.map((c) =>
        c.key === "noise" ? { ...c, nameJa: "外乱因子(差し替え)" } : c
      ),
      handoverConventions: factorRalphFrame.handoverConventions.map((c) =>
        c.id === "FHO-04" ? { ...c, applicableCategoryKeys: ["control"] } : c
      ),
    };
    const input = {
      conventionId: "FHO-04",
      factorInventory: baseInventory(),
      items: pairwiseItems(),
    };

    const withDefault = evaluateFactorHandover(input);
    expect(findingsOf("FHC-03", withDefault.findings)).toHaveLength(0);

    const withCustom = evaluateFactorHandover(input, customFrame);
    const fhc03 = findingsOf("FHC-03", withCustom.findings);
    expect(fhc03).toHaveLength(1);
    expect(fhc03[0].target).toBe("FCT-02");
    expect(fhc03[0].detail).toContain("外乱因子(差し替え)");

    const section = renderFactorHandoverSection(
      "## 9. 因子引き渡し検査(FHO-04)",
      input,
      customFrame
    );
    expect(section).toContain("外乱因子(差し替え)");
    expect(renderFactorHandoverSection("## 9. 因子引き渡し検査(FHO-04)", input)).toContain(
      "誤差因子"
    );
  });

  it("accepts the target tool name as a handover target", () => {
    const result = evaluateFactorHandover({
      conventionId: "FHO-04",
      factorInventory: [
        {
          id: "FCT-01",
          name: "端末種別",
          categoryKey: "control",
          levels: ["自動改札", "有人窓口"],
          handoverTargetIds: ["design_pairwise"],
        },
      ],
      items: [pairwiseItems()[0]],
    });
    expect(result.findings).toHaveLength(0);
    expect(result.assignedFactorCount).toBe(1);
    expect(result.verifiedFactorCount).toBe(1);
    expect(result.verifiedRatioPercent).toBe(100);
  });
});
