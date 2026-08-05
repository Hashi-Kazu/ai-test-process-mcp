import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderTestPurposeDerivation } from "../src/tools/deriveTestPurposes.js";
import type { DeriveTestPurposesInput } from "../src/types.js";

const cleanInput: DeriveTestPurposesInput = {
  expectations: [
    { id: "EXP-01", statement: "リリース判定に必要な品質情報がほしい", requesterRole: "発注者" },
    { id: "EXP-02", statement: "主要業務フローで重大な不具合が無いことを確認したい", requesterRole: "現場責任者" },
  ],
  testRequirements: [
    { id: "TR-01", line: "management", statement: "週次で進捗を報告してほしい", expectationIds: ["EXP-01"] },
    { id: "TR-02", line: "engineering", statement: "決済機能の異常系を確認してほしい", expectationIds: ["EXP-01"] },
    { id: "TR-03", line: "management", statement: "リリース判定会議に出席してほしい", expectationIds: ["EXP-02"] },
    { id: "TR-04", line: "engineering", statement: "主要業務フローの正常系を確認してほしい", expectationIds: ["EXP-02"] },
  ],
  strategyStatements: [{ id: "ST-01", statement: "決済まわりを重点的に確認する" }],
  purposes: [
    {
      id: "TP-01",
      statement: "決済機能の異常系で重大な不具合が無いことを確認する",
      testRequirementIds: ["TR-02"],
      strategyIds: ["ST-01"],
      successCriterion: "異常系ケースがすべてOKで完了する",
      priorityRank: 1,
      priorityRationale: "決済は依頼者の最重要関心事のため",
      relatedQualityCharacteristicIds: ["QC-01"],
    },
    {
      id: "TP-02",
      statement: "主要業務フローの正常系を確認する",
      testRequirementIds: ["TR-04"],
      successCriterion: "主要業務フローのケースがすべてOKで完了する",
      priorityRank: 2,
      priorityRationale: "現場責任者の期待に直結するため",
      relatedQualityCharacteristicIds: ["QC-05"],
    },
    {
      id: "TP-03",
      statement: "進捗報告・リリース判定に必要な情報を揃える",
      testRequirementIds: ["TR-01", "TR-03"],
      successCriterion: "週次報告とリリース判定資料が揃っている",
      priorityRank: 3,
      priorityRationale: "運営要求のため優先度は下げる",
      relatedQualityCharacteristicIds: ["QC-07"],
    },
  ],
  testConditions: [
    { id: "TC-01", statement: "決済失敗時にエラーメッセージが出る", purposeIds: ["TP-01"] },
    { id: "TC-02", statement: "決済タイムアウト時にロールバックされる", purposeIds: ["TP-01"] },
    { id: "TC-03", statement: "購入フローが正常に完了する", purposeIds: ["TP-02"] },
    { id: "TC-04", statement: "在庫が正しく減算される", purposeIds: ["TP-02"] },
    { id: "TC-05", statement: "週次報告資料が生成できる", purposeIds: ["TP-03"] },
    { id: "TC-06", statement: "リリース判定資料が生成できる", purposeIds: ["TP-03"] },
  ],
  testTypeSelections: [
    { name: "機能テスト", selected: true, purposeIds: ["TP-01", "TP-02"], reason: "TP-01/TP-02 の達成に必要" },
    { name: "信頼性テスト", selected: true, purposeIds: ["TP-01"], reason: "TP-01 の達成に必要" },
    { name: "保守性テスト", selected: true, purposeIds: ["TP-03"], reason: "TP-03 の達成に必要" },
  ],
};

describe("renderTestPurposeDerivation (clean input)", () => {
  const markdown = renderTestPurposeDerivation(cleanInput);

  it("reports no findings across all 17 PDC sections", () => {
    for (let n = 1; n <= 17; n++) {
      const heading = markdown
        .split("\n")
        .find((l) => l.startsWith(`### 3.${n} `));
      expect(heading, `section 3.${n} heading`).toBeDefined();
      const start = markdown.indexOf(heading as string);
      const nextHeadingIndex = markdown.indexOf(`### 3.${n + 1}`, start);
      const end = nextHeadingIndex === -1 ? markdown.indexOf("## 4.", start) : nextHeadingIndex;
      const section = markdown.slice(start, end);
      expect(section, `section 3.${n} body`).toContain("- なし");
    }
  });

  it("shows every purpose in the 4.1/4.2/4.3 matrices", () => {
    const section4 = markdown.split("## 4. 目的IDの貫通マトリクス")[1].split("## 5.")[0];
    for (const p of cleanInput.purposes) {
      expect(section4).toContain(p.id);
    }
  });

  it("reports all-zero counters in the 3.18 summary", () => {
    const summaryLine = markdown.split("\n").find((l) => l.startsWith("- 未解決参照数:"));
    expect(summaryLine).toBeDefined();
    for (const m of summaryLine!.matchAll(/: (\d+)/g)) {
      expect(m[1]).toBe("0");
    }
  });

  it("is deterministic and does not mutate the input", () => {
    const snapshot = JSON.stringify(cleanInput);
    expect(renderTestPurposeDerivation(cleanInput)).toBe(markdown);
    expect(JSON.stringify(cleanInput)).toBe(snapshot);
  });

  it("ends with exactly one trailing newline", () => {
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });

  it("shows a follow-up tools section", () => {
    expectNextToolsSection(markdown);
  });
});

describe("PDC-08 / PDC-09 (acceptance)", () => {
  const twoPurposeInput: DeriveTestPurposesInput = {
    expectations: [{ id: "EXP-01", statement: "期待" }],
    testRequirements: [
      { id: "TR-01", line: "management", statement: "要求1", expectationIds: ["EXP-01"] },
      { id: "TR-02", line: "engineering", statement: "要求2", expectationIds: ["EXP-01"] },
    ],
    purposes: [
      {
        id: "TP-01",
        statement: "目的1",
        testRequirementIds: ["TR-01"],
        successCriterion: "基準1",
        priorityRank: 1,
        priorityRationale: "根拠1",
      },
      {
        id: "TP-02",
        statement: "目的2",
        testRequirementIds: ["TR-02"],
        successCriterion: "基準2",
        priorityRank: 2,
        priorityRationale: "根拠2",
      },
    ],
  };

  it("flags test conditions linked to no test purpose (PDC-08)", () => {
    const input: DeriveTestPurposesInput = {
      ...twoPurposeInput,
      testConditions: [
        { id: "TC-01", purposeIds: ["TP-01"] },
        { id: "TC-02", purposeIds: ["TP-02"] },
        { id: "TC-03" }, // no purposeIds -> PDC-08
      ],
    };
    const markdown = renderTestPurposeDerivation(input);
    const section = markdown.split("### 3.8 ")[1].split("### 3.9")[0];
    expect(section).toContain("[high] TC-03");
    expect(section).not.toContain("TC-01");
    expect(section).not.toContain("TC-02");
  });

  it("flags test purposes referenced by no test condition (PDC-09)", () => {
    const input: DeriveTestPurposesInput = {
      ...twoPurposeInput,
      purposes: [
        ...twoPurposeInput.purposes,
        {
          id: "TP-03",
          statement: "どの条件からも参照されない目的",
          testRequirementIds: ["TR-01"],
          successCriterion: "基準3",
          priorityRank: 3,
          priorityRationale: "根拠3",
        },
      ],
      testConditions: [
        { id: "TC-01", purposeIds: ["TP-01"] },
        { id: "TC-02", purposeIds: ["TP-02"] },
      ],
    };
    const markdown = renderTestPurposeDerivation(input);
    const section = markdown.split("### 3.9 ")[1].split("### 3.10")[0];
    expect(section).toContain("[high] TP-03");
  });

  it("keeps 3.9 as なし when a purposeless condition exists but every purpose is still referenced elsewhere (PDC-08/09 asymmetry)", () => {
    const input: DeriveTestPurposesInput = {
      ...twoPurposeInput,
      testConditions: [
        { id: "TC-01", purposeIds: ["TP-01"] },
        { id: "TC-02", purposeIds: ["TP-02"] },
        { id: "TC-03" }, // triggers PDC-08 only
      ],
    };
    const markdown = renderTestPurposeDerivation(input);
    const section8 = markdown.split("### 3.8 ")[1].split("### 3.9")[0];
    const section9 = markdown
      .split("### 3.9 どのテスト条件からも参照されないテスト目的(PDC-09)")[1]
      .split("### 3.10")[0];
    expect(section8).toContain("[high] TC-03");
    expect(section9.trim()).toBe("- なし");
  });
});

describe("PDC-07: requirement line gaps", () => {
  it("flags the missing management line when only engineering requirements are declared", () => {
    const input: DeriveTestPurposesInput = {
      expectations: [{ id: "EXP-01", statement: "期待" }],
      testRequirements: [
        { id: "TR-01", line: "engineering", statement: "要求", expectationIds: ["EXP-01"] },
      ],
      purposes: [
        {
          id: "TP-01",
          statement: "目的",
          testRequirementIds: ["TR-01"],
          successCriterion: "基準",
          priorityRank: 1,
          priorityRationale: "根拠",
        },
      ],
    };
    const markdown = renderTestPurposeDerivation(input);
    const section = markdown.split("### 3.7 ")[1].split("### 3.8")[0];
    expect(section).toContain("[medium] management");
    expect(section).not.toContain("[medium] engineering");
  });
});

describe("PDC-10: test type selection / purpose inconsistency", () => {
  it("detects selected-without-purpose and unselected-with-purpose", () => {
    const input: DeriveTestPurposesInput = {
      expectations: [{ id: "EXP-01", statement: "期待" }],
      testRequirements: [
        { id: "TR-01", line: "management", statement: "要求", expectationIds: ["EXP-01"] },
      ],
      purposes: [
        {
          id: "TP-01",
          statement: "目的",
          testRequirementIds: ["TR-01"],
          successCriterion: "基準",
          priorityRank: 1,
          priorityRationale: "根拠",
        },
      ],
      testTypeSelections: [
        { name: "機能テスト", selected: true },
        { name: "性能テスト", selected: false, purposeIds: ["TP-01"] },
      ],
    };
    const markdown = renderTestPurposeDerivation(input);
    const section = markdown.split("### 3.10 ")[1].split("### 3.11")[0];
    expect(section).toContain("[high] 機能テスト");
    expect(section).toContain("[high] 性能テスト");
  });
});

describe("PDC-15: grounding against request documents", () => {
  const base: Omit<DeriveTestPurposesInput, "expectations" | "requestDocuments"> = {
    testRequirements: [
      { id: "TR-01", line: "management", statement: "要求", expectationIds: ["EXP-01"] },
    ],
    purposes: [
      {
        id: "TP-01",
        statement: "目的",
        testRequirementIds: ["TR-01"],
        successCriterion: "基準",
        priorityRank: 1,
        priorityRationale: "根拠",
      },
    ],
  };

  it("flags an expectation not backed by the request document body", () => {
    const input: DeriveTestPurposesInput = {
      ...base,
      requestDocuments: [{ name: "依頼書", content: "依頼書の本文には別のことが書かれている" }],
      expectations: [{ id: "EXP-01", statement: "本文には無い期待" }],
    };
    const markdown = renderTestPurposeDerivation(input);
    const section = markdown.split("### 3.15 ")[1].split("### 3.16")[0];
    expect(section).toContain("[high] EXP-01");
  });

  it("marks PDC-15 as not performed in section 1.3 and leaves section 3.15 as なし when requestDocuments is omitted", () => {
    const input: DeriveTestPurposesInput = { ...base, expectations: [{ id: "EXP-01", statement: "期待" }] };
    const markdown = renderTestPurposeDerivation(input);
    const section13 = markdown.split("### 1.3 ")[1].split("## 2.")[0];
    expect(section13).toContain("依頼書未指定のため PDC-15 は不実施。");
    const section315 = markdown.split("### 3.15 ")[1].split("### 3.16")[0];
    expect(section315.trim()).toContain("- なし");
  });
});

describe("PDC-16: claimed vs computed coverage mismatch", () => {
  it("flags a mismatch between claimed 100% and computed 66.7%", () => {
    const input: DeriveTestPurposesInput = {
      expectations: [{ id: "EXP-01", statement: "期待" }],
      testRequirements: [
        { id: "TR-01", line: "management", statement: "要求", expectationIds: ["EXP-01"] },
      ],
      purposes: [
        {
          id: "TP-01",
          statement: "目的",
          testRequirementIds: ["TR-01"],
          successCriterion: "基準",
          priorityRank: 1,
          priorityRationale: "根拠",
        },
      ],
      testConditions: [
        { id: "TC-01", purposeIds: ["TP-01"] },
        { id: "TC-02", purposeIds: ["TP-01"] },
        { id: "TC-03" },
      ],
      claimedPurposeCoveragePercent: 100,
    };
    const markdown = renderTestPurposeDerivation(input);
    const section = markdown.split("### 3.16 ")[1].split("### 3.17")[0];
    expect(section).toContain("[high]");
    expect(section).toContain("66.7");
  });
});

describe("table cell escaping and formatting", () => {
  it("escapes | characters inside table cells", () => {
    const input: DeriveTestPurposesInput = {
      expectations: [{ id: "EXP-01", statement: "期待A|期待B" }],
      testRequirements: [
        { id: "TR-01", line: "management", statement: "要求", expectationIds: ["EXP-01"] },
      ],
      purposes: [
        {
          id: "TP-01",
          statement: "目的",
          testRequirementIds: ["TR-01"],
          successCriterion: "基準",
          priorityRank: 1,
          priorityRationale: "根拠",
        },
      ],
    };
    const markdown = renderTestPurposeDerivation(input);
    expect(markdown).toContain("期待A\\|期待B");
  });
});
