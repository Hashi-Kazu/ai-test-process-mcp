import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderBoundaryValues } from "../src/tools/designBoundaryValues.js";

describe("renderBoundaryValues", () => {
  it("enumerates three-value int boundaries with default mode/type/step", () => {
    const md = renderBoundaryValues({ variables: [{ name: "x", min: 1, max: 10 }] });

    expect(md).toContain("# 境界値分析結果");
    for (const v of [0, 1, 2, 9, 10, 11]) {
      expect(md).toContain(`| ${v} |`);
    }
    expect(md).toContain("| 0 | 下限-刻み | 無効 |");
    expect(md).toContain("| 11 | 上限+刻み | 無効 |");
    expect(md).toContain("| 1 | 下限 | 有効 |");
    expect(md).toContain("| 2 | 下限+刻み | 有効 |");
    expect(md).toContain("| 9 | 上限-刻み | 有効 |");
    expect(md).toContain("| 10 | 上限 | 有効 |");
    expect(md).toContain("- 総ケース数: 6");
    expect(md).toContain("- 有効: 4 件 / 無効: 2 件");
  });

  it("enumerates two-value int boundaries", () => {
    const md = renderBoundaryValues({
      variables: [{ name: "x", min: 1, max: 10, step: 1 }],
      mode: "two",
    });

    expect(md).toContain("- 方式: 2値境界（境界/外側）");
    expect(md).toContain("| 0 | 下限-刻み | 無効 |");
    expect(md).toContain("| 1 | 下限 | 有効 |");
    expect(md).toContain("| 10 | 上限 | 有効 |");
    expect(md).toContain("| 11 | 上限+刻み | 無効 |");
    expect(md).not.toContain("| 2 |");
    expect(md).not.toContain("| 9 |");
    expect(md).toContain("- 総ケース数: 4");
  });

  it("handles decimal boundaries without floating point artifacts", () => {
    const md = renderBoundaryValues({
      variables: [{ name: "rate", min: 0, max: 1, valueType: "decimal", step: 0.1 }],
    });

    expect(md).toContain("| -0.1 | 下限-刻み | 無効 |");
    expect(md).toContain("| 0.0 | 下限 | 有効 |");
    expect(md).toContain("| 0.1 | 下限+刻み | 有効 |");
    expect(md).toContain("| 0.9 | 上限-刻み | 有効 |");
    expect(md).toContain("| 1.0 | 上限 | 有効 |");
    expect(md).toContain("| 1.1 | 上限+刻み | 無効 |");
  });

  it("dedups values that collapse together in a narrow range", () => {
    const md = renderBoundaryValues({ variables: [{ name: "x", min: 5, max: 6 }] });

    // min+step (6) and max-step (5) both collide with existing boundary values.
    // 末尾の「次に実行すべきツール」節は境界値表ではないため対象外にする。
    const body = md.split("## 次に実行すべきツール")[0];
    const rows = body.split("\n").filter((l) => l.startsWith("| ") && l.includes("|", 2));
    const values = rows
      .map((l) => l.split("|")[1]?.trim())
      .filter((v): v is string => !!v && v !== "値");
    expect(new Set(values).size).toBe(values.length);
  });

  it("reports an error note when min exceeds max without throwing", () => {
    const md = renderBoundaryValues({
      variables: [
        { name: "bad", min: 10, max: 1 },
        { name: "ok", min: 1, max: 5 },
      ],
    });

    expect(md).toContain("- bad: min が max を上回るため境界を列挙できません");
    expect(md).toContain("## ok（型: int, 範囲: 1〜5, 刻み: 1）");
  });
});

describe("renderBoundaryValues 因子引き渡し検査(FHO-01)", () => {
  it("factorInventory 未指定なら未算出1行のみで、既存の出力は変わらない", () => {
    const base = renderBoundaryValues({ variables: [{ name: "x", min: 1, max: 10 }] });

    expect(base).toContain("## 因子引き渡し検査(FHO-01)");
    const section = base.split("## 因子引き渡し検査(FHO-01)")[1].split("## ")[0];
    expect(section.trim()).toBe(
      "- 未算出(理由: factorInventory が未宣言のため因子引き渡し検査を行わなかった)"
    );
    // 既存節（境界値表・サマリ）は追加節の影響を受けない。
    expect(base).toContain("- 総ケース数: 6");
    expect(base).toContain("- 有効: 4 件 / 無効: 2 件");
    expect(base).toContain("| 0 | 下限-刻み | 無効 |");
  });

  it("sourceFactorId を足しても境界値の列挙結果は変わらない", () => {
    const withoutId = renderBoundaryValues({ variables: [{ name: "x", min: 1, max: 10 }] });
    const withId = renderBoundaryValues({
      variables: [{ name: "x", min: 1, max: 10, sourceFactorId: "FCT-01" }],
    });
    const bodyOf = (md: string) => md.split("## 因子引き渡し検査(FHO-01)")[0];
    expect(bodyOf(withId)).toBe(bodyOf(withoutId));
  });

  it("因子ID併記違反(FHC-06)と min > max(FHC-08) を指摘する", () => {
    const md = renderBoundaryValues({
      variables: [{ name: "入場制限人数", min: 10, max: 1, sourceFactorId: "FCT-01" }],
      factorInventory: [
        {
          id: "FCT-01",
          name: "入場制限人数",
          categoryKey: "control",
          handoverTargetIds: ["FHO-01"],
        },
      ],
    });

    const section = md.split("## 因子引き渡し検査(FHO-01)")[1].split("## ")[0];
    expect(section).toContain("| FCT-01 | 入場制限人数 | 制御因子 | FHO-01(design_boundary_values) |");
    expect(section).toContain("FHC-06");
    expect(section).toContain("因子ID「FCT-01」");
    expect(section).toContain("FHC-08");
    expect(section).toContain("min が max を上回っており");
    expect(section).toContain("実体照合済み: 0");
    // 既存の min > max のメッセージは従来どおり残る。
    expect(md).toContain("- 入場制限人数: min が max を上回るため境界を列挙できません");
  });
});

describe("renderBoundaryValues 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderBoundaryValues({ variables: [{ name: "x", min: 1, max: 10 }] }));
  });
});
