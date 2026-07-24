import { describe, expect, it } from "vitest";
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
