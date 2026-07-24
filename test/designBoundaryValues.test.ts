import { describe, expect, it } from "vitest";
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
    const rows = md.split("\n").filter((l) => l.startsWith("| ") && l.includes("|", 2));
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
