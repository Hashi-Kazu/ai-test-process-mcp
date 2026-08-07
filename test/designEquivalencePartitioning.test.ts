import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderEquivalencePartitioning } from "../src/tools/designEquivalencePartitioning.js";

describe("renderEquivalencePartitioning", () => {
  it("covers all classes for a single variable with 2 valid + 2 invalid classes", () => {
    const md = renderEquivalencePartitioning({
      variables: [
        {
          name: "age",
          validClasses: [
            { label: "成人", representative: "30" },
            { label: "未成年", representative: "10" },
          ],
          invalidClasses: [
            { label: "負数", representative: "-1" },
            { label: "上限超過", representative: "200" },
          ],
        },
      ],
    });

    expect(md).toContain("# 同値分割結果");
    expect(md).toContain("## 1. 同値クラス一覧");
    expect(md).toContain("## 2. テストケース");
    expect(md).toContain("## 3. 被覆状況");

    for (const rep of ["30", "10", "-1", "200"]) {
      expect(md).toContain(`| ${rep} |`);
    }

    const caseSection = md.split("## 2. テストケース")[1].split("## 3. 被覆状況")[0];
    const validCaseLines = caseSection
      .split("\n")
      .filter((l) => l.includes("有効（正常系）"));
    const invalidCaseLines = caseSection
      .split("\n")
      .filter((l) => l.includes("無効（"));
    expect(validCaseLines).toHaveLength(2);
    expect(invalidCaseLines).toHaveLength(2);

    expect(md).toContain("- 未被覆: 0");
  });

  it("uses the max valid-class count across variables and fixes others at their first valid representative for invalid cases", () => {
    const md = renderEquivalencePartitioning({
      variables: [
        {
          name: "a",
          validClasses: [
            { label: "A1", representative: "a1" },
            { label: "A2", representative: "a2" },
            { label: "A3", representative: "a3" },
          ],
          invalidClasses: [{ label: "Abad", representative: "abad" }],
        },
        {
          name: "b",
          validClasses: [{ label: "B1", representative: "b1" }],
          invalidClasses: [{ label: "Bbad", representative: "bbad" }],
        },
      ],
    });

    const caseSection = md.split("## 2. テストケース")[1].split("## 3. 被覆状況")[0];
    const validCaseLines = caseSection
      .split("\n")
      .filter((l) => l.includes("有効（正常系）"));
    expect(validCaseLines).toHaveLength(3);
    // b only has one valid class, so it should reuse "b1" across all 3 valid cases.
    for (const line of validCaseLines) {
      expect(line).toContain("| b1 |");
    }

    // Invalid case for "a" should fix "b" at its first valid representative "b1".
    const invalidLineForA = caseSection
      .split("\n")
      .find((l) => l.includes("無効（a が Abad）"));
    expect(invalidLineForA).toContain("| abad | b1 |");

    // Invalid case for "b" should fix "a" at its first valid representative "a1".
    const invalidLineForB = caseSection
      .split("\n")
      .find((l) => l.includes("無効（b が Bbad）"));
    expect(invalidLineForB).toContain("| a1 | bbad |");

    expect(md).toContain("- 未被覆: 0");
  });
});

describe("renderEquivalencePartitioning 因子引き渡し検査(FHO-02)", () => {
  const variables = [
    {
      name: "券種",
      validClasses: [
        { label: "おとな", representative: "adult" },
        { label: "こども", representative: "child" },
      ],
      invalidClasses: [{ label: "未設定", representative: "" }],
    },
  ];

  it("factorInventory 未指定なら未算出1行のみで、既存の出力は変わらない", () => {
    const md = renderEquivalencePartitioning({ variables });

    expect(md).toContain("## 4. 因子引き渡し検査(FHO-02)");
    const section = md.split("## 4. 因子引き渡し検査(FHO-02)")[1].split("## ")[0];
    expect(section.trim()).toBe(
      "- 未算出(理由: factorInventory が未宣言のため因子引き渡し検査を行わなかった)"
    );
    expect(md).toContain("## 1. 同値クラス一覧");
    expect(md).toContain("## 3. 被覆状況");
    expect(md).toContain("- 未被覆: 0");
  });

  it("sourceFactorId を足してもクラス一覧・ケース生成は変わらない", () => {
    const withId = renderEquivalencePartitioning({
      variables: [{ ...variables[0], sourceFactorId: "FCT-04" }],
    });
    const bodyOf = (md: string) => md.split("## 4. 因子引き渡し検査(FHO-02)")[0];
    expect(bodyOf(withId)).toBe(bodyOf(renderEquivalencePartitioning({ variables })));
  });

  it("validClasses と invalidClasses のラベルをまとめて実体水準として照合する", () => {
    const md = renderEquivalencePartitioning({
      variables: [{ ...variables[0], sourceFactorId: "FCT-04" }],
      factorInventory: [
        {
          id: "FCT-04",
          name: "券種",
          categoryKey: "state",
          levels: ["おとな", "こども", "未設定"],
          handoverTargetIds: ["FHO-02"],
        },
      ],
    });

    const section = md.split("## 4. 因子引き渡し検査(FHO-02)")[1].split("## ")[0];
    expect(section).toContain("| FCT-04 | 券種 | 状態因子 | FHO-02(design_equivalence_partitioning) | variables[0] | 検証済み |");
    expect(section).toContain("- 指摘なし");
    expect(section).toContain("引き渡し検証率: 100.0%（分母: 本ツール担当因子数 1");
  });

  it("因子表にある水準が投入されていない場合は FHC-07 を指摘する", () => {
    const md = renderEquivalencePartitioning({
      variables: [
        {
          name: "券種",
          validClasses: [{ label: "おとな", representative: "adult" }],
          sourceFactorId: "FCT-04",
        },
      ],
      factorInventory: [
        {
          id: "FCT-04",
          name: "券種",
          categoryKey: "state",
          levels: ["おとな", "こども"],
          handoverTargetIds: ["FHO-02"],
        },
      ],
    });

    const section = md.split("## 4. 因子引き渡し検査(FHO-02)")[1].split("## ")[0];
    expect(section).toContain("FHC-07");
    expect(section).toContain("水準「こども」");
    expect(section).toContain("実体照合済み: 0");
  });
});

describe("renderEquivalencePartitioning 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderEquivalencePartitioning({
      variables: [{ name: "age", validClasses: [{ label: "成人", representative: "30" }] }],
    }));
  });
});
