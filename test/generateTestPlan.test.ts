import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import { renderTestPlan } from "../src/tools/generateTestPlan.js";
import { testPlanTemplate } from "../src/resources/testPlanTemplate.js";
import type { TestPlanInput, TestPlanTemplateSection } from "../src/types.js";

describe("renderTestPlan", () => {
  it("includes every template section heading with the correct level", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    for (const section of testPlanTemplate.sections) {
      const prefix = section.level === 1 ? "##" : "###";
      expect(markdown).toContain(`${prefix} ${section.no} ${section.titleJa}`);
    }
  });

  it("renders the document title and revision history", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain("# テスト計画書: Sample");
    expect(markdown).toContain("## 改訂履歴");
    expect(markdown).toContain(testPlanTemplate.templateName);
  });

  it("marks omitted optional fields as 未記入 and required fields as 未記入（必須）", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain("_未記入_");
    expect(markdown).toContain("_未記入（必須）_");
  });

  it("always outputs fixed boilerplate references regardless of input", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain("移植性テスト");
    expect(markdown).toContain("ランクA");
    expect(markdown).toContain("インシデント曲線");
    expect(markdown).toContain("OK");
  });

  it("marks selected test types with 〇 in the test type catalog", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Login and checkout flows",
      selectedTestTypes: ["機能テスト", "性能テスト"],
    };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain("| 〇 | 機能テスト |");
    expect(markdown).toContain("| 〇 | 性能テスト |");
  });

  it("marks the test type table with 未記入（必須） when no test type is selected", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("### 5.2 テストタイプ");
    const sectionEnd = markdown.indexOf("### 5.3", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("_未記入（必須）_");
    // full catalog table should still be rendered
    expect(section).toContain("機能テスト");
    expect(section).toContain("移植性テスト");
  });

  it("does not mark the test type table as 未記入（必須） when at least one test type is selected", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Login and checkout flows",
      selectedTestTypes: ["機能テスト"],
    };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("### 5.2 テストタイプ");
    const sectionEnd = markdown.indexOf("### 5.3", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).not.toContain("_未記入（必須）_");
  });

  it("interpolates provided fields instead of 未記入", () => {
    const input: TestPlanInput = {
      projectName: "Full Project",
      scope: "Full scope",
      objectives: ["Verify payment flow"],
      featuresToTest: ["Checkout"],
      featuresNotToTest: ["Admin dashboard"],
      risks: [{ description: "Third-party API instability", impact: "high", mitigation: "Add retries" }],
      scheduleConstraints: {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        milestones: [{ name: "Test design complete", date: "2026-08-10" }],
      },
      team: [{ role: "Test Lead", name: "Alice", responsibilities: "Overall test coordination" }],
      environment: "Staging environment with production-like data",
      deliverables: ["Test summary report"],
      passFailCriteria: "All critical test cases pass",
      suspensionCriteria: "Blocker defect in checkout",
      approvers: ["QA Manager"],
      testLevels: ["System test"],
      testPeriod: "2026-08-01 - 2026-08-31",
      completionCriteria: ["All planned cases executed"],
      stakeholders: [{ role: "Product Owner", name: "Bob" }],
      glossary: [{ term: "SUT", definition: "System Under Test" }],
      notes: "Special handling for payment gateway",
    };

    const markdown = renderTestPlan(input);

    expect(markdown).toContain("Verify payment flow");
    expect(markdown).toContain("Checkout");
    expect(markdown).toContain("Admin dashboard");
    expect(markdown).toContain("Third-party API instability");
    expect(markdown).toContain("2026-08-01");
    expect(markdown).toContain("Test design complete");
    expect(markdown).toContain("Test Lead");
    expect(markdown).toContain("Staging environment with production-like data");
    expect(markdown).toContain("Test summary report");
    expect(markdown).toContain("All critical test cases pass");
    expect(markdown).toContain("Blocker defect in checkout");
    expect(markdown).toContain("QA Manager");
    expect(markdown).toContain("System test");
    expect(markdown).toContain("All planned cases executed");
    expect(markdown).toContain("Product Owner");
    expect(markdown).toContain("SUT");
    expect(markdown).toContain("Special handling for payment gateway");
  });
});

describe("HSKZ-103: testingTasksFlow / staffingAndTraining / projectRisks / revisions", () => {
  it("renders testingTasksFlow as a bulleted list in section 9.1", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Scope",
      testingTasksFlow: ["テスト計画レビュー", "テスト設計", "テスト実行", "完了報告"],
    };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("### 9.1 テスト作業の流れ");
    const sectionEnd = markdown.indexOf("### 9.2", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("- テスト計画レビュー");
    expect(section).toContain("- テスト設計");
    expect(section).toContain("- テスト実行");
    expect(section).toContain("- 完了報告");
    expect(section).not.toContain("_未記入_");
  });

  it("renders staffingAndTraining with both fields present in section 12", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Scope",
      staffingAndTraining: {
        additionalStaffing: "テスト実行要員を2名追加",
        trainingItems: ["テスト管理ツールの使い方研修", "業務知識研修"],
      },
    };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("## 12 要員・教育");
    const sectionEnd = markdown.indexOf("## 13", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("テスト実行要員を2名追加");
    expect(section).toContain("- テスト管理ツールの使い方研修");
    expect(section).toContain("- 業務知識研修");
    expect(section).not.toContain("_未記入_");
  });

  it("renders staffingAndTraining with only additionalStaffing present", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Scope",
      staffingAndTraining: { additionalStaffing: "外部ベンダーへ委託" },
    };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("## 12 要員・教育");
    const sectionEnd = markdown.indexOf("## 13", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("外部ベンダーへ委託");
    expect(section).not.toContain("_未記入_");
  });

  it("renders staffingAndTraining with only trainingItems present", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Scope",
      staffingAndTraining: { trainingItems: ["新人研修"] },
    };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("## 12 要員・教育");
    const sectionEnd = markdown.indexOf("## 13", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("- 新人研修");
    expect(section).not.toContain("_未記入_");
  });

  it("renders projectRisks in section 14.2 consistent with the existing risk rendering format", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Scope",
      projectRisks: [
        { description: "要員の急な離脱", impact: "medium", mitigation: "バックアップ要員を確保" },
      ],
    };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("### 14.2 プロジェクトリスク");
    const sectionEnd = markdown.indexOf("## 15", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("- 要員の急な離脱 (影響: medium) — 対策: バックアップ要員を確保");
    expect(section).not.toContain("_未記入_");
  });

  it("renders each revisions row with omitted columns falling back to 未記入", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Scope",
      revisions: [
        {
          version: "1.0",
          date: "2026-01-10",
          author: "田中",
          approver: "佐藤",
          changeContent: "初版作成",
        },
        {
          version: "1.1",
          date: "2026-02-01",
          changeContent: "レビュー指摘反映",
        },
      ],
    };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain(
      "| 2026-01-10 | 1.0 | 田中 | 佐藤 | 初版作成 |"
    );
    expect(markdown).toContain(
      "| 2026-02-01 | 1.1 | _未記入_ | _未記入_ | レビュー指摘反映 |"
    );
  });

  it("keeps the legacy single-row revision history output when revisions is omitted (regression)", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Scope",
      approvers: ["QA Manager"],
      revisionContent: ["初版作成"],
    };
    const markdown = renderTestPlan(input);

    expect(markdown).toContain("| _未記入_ | _未記入_ | _未記入_ | QA Manager | 初版作成 |");
  });
});

describe("HSKZ-127: sloTargets / monitoringPlan / executionOrderPlan (sections 6.6 / 9.4 / 13.3)", () => {
  it("renders sloTargets as a table in section 6.6", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Scope",
      sloTargets: [{ metric: "Defect escape rate", comparator: "<=", threshold: "1", unit: "% per release" }],
    };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("### 6.6 品質目標(SLO)・実施前合格基準");
    const sectionEnd = markdown.indexOf("## 7", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("Defect escape rate");
    expect(section).toContain("<=");
    expect(section).not.toContain("_未記入_");
  });

  it("marks section 6.6 as 未記入 when sloTargets is omitted", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Scope" };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("### 6.6 品質目標(SLO)・実施前合格基準");
    const sectionEnd = markdown.indexOf("## 7", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("_未記入_");
  });

  it("renders monitoringPlan as a bulleted list with items and participants in section 9.4", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Scope",
      monitoringPlan: [{ timing: "Daily standup", reviewItems: ["Progress", "Blockers"], participants: ["Test Lead"] }],
    };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("### 9.4 モニタリング計画");
    const sectionEnd = markdown.indexOf("## 10", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("Daily standup");
    expect(section).toContain("Progress");
    expect(section).toContain("Test Lead");
    expect(section).not.toContain("_未記入_");
  });

  it("marks section 9.4 as 未記入 when monitoringPlan is omitted", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Scope" };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("### 9.4 モニタリング計画");
    const sectionEnd = markdown.indexOf("## 10", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("_未記入_");
  });

  it("renders executionOrderPlan as a table in section 13.3", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Scope",
      executionOrderPlan: [
        { nodeId: "TCN-01", nameJa: "Checkout container", dependsOn: [], durationHours: 4, isCritical: true },
      ],
    };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("### 13.3 実行順序・依存関係");
    const sectionEnd = markdown.indexOf("## 14", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("TCN-01");
    expect(section).toContain("Checkout container");
    expect(section).not.toContain("_未記入_");
  });

  it("marks section 13.3 as 未記入 when executionOrderPlan is omitted", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Scope" };
    const markdown = renderTestPlan(input);

    const sectionStart = markdown.indexOf("### 13.3 実行順序・依存関係");
    const sectionEnd = markdown.indexOf("## 14", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);

    expect(section).toContain("_未記入_");
  });
});

describe("sectionContent coverage (issue #17 / HSKZ-84)", () => {
  // renderTestPlan() 内の hasChildren 判定と同一ロジック。
  // level 1 の章に子(level 2)がある場合のみ見出しのみで本文なし＝非leaf。
  function isLeafSection(
    section: TestPlanTemplateSection,
    index: number,
    sections: TestPlanTemplateSection[]
  ): boolean {
    const next = sections[index + 1];
    const hasChildren = section.level === 1 && next?.level === 2;
    return !hasChildren;
  }

  const sections = testPlanTemplate.sections;
  const leafSections = sections.filter((section, index) => isLeafSection(section, index, sections));

  // fieldKey なし・switch の case で固定定型文（入力に依存しない共通リファレンス）を出力する section。
  const FIXED_BOILERPLATE_SECTION_IDS = ["incident-criteria", "question-priority", "execution-record"];

  // fieldKey なし・switch に case がなく、意図的に default（汎用「未記入」）に落ちてよい section。
  // - testing-tasks-flow (9.1): テスト作業の流れは対応する入力フィールドを持たない
  // - staffing-and-training-needs (12): 要員・教育は対応する入力フィールドを持たない
  // - project-risk (14.2): プロジェクトリスクは対応する入力フィールドを持たない（14.1 product-risk のみ入力対応）
  const INTENTIONAL_DEFAULT_SECTION_IDS = ["testing-tasks-flow", "staffing-and-training-needs", "project-risk"];

  const fieldKeySectionIds = leafSections.filter((s) => !!s.fieldKey).map((s) => s.id);

  it("classifies every leaf section into exactly one bucket (fieldKey / fixed boilerplate / intentional default)", () => {
    const accountedIds = new Set([
      ...fieldKeySectionIds,
      ...FIXED_BOILERPLATE_SECTION_IDS,
      ...INTENTIONAL_DEFAULT_SECTION_IDS,
    ]);

    for (const section of leafSections) {
      expect(accountedIds.has(section.id)).toBe(true);
    }
    // 重複や、存在しない section id が紛れ込んでいないことも保証する。
    expect(accountedIds.size).toBe(leafSections.length);
  });

  function extractSectionBlock(markdown: string, index: number): string {
    const section = sections[index];
    const prefix = section.level === 1 ? "##" : "###";
    const headingLine = `${prefix} ${section.no} ${section.titleJa}`;
    const start = markdown.indexOf(headingLine);
    if (start === -1) {
      throw new Error(`heading not found in markdown: ${headingLine}`);
    }
    const rest = markdown.slice(start + headingLine.length);
    const nextHeadingOffset = rest.search(/\n#{2,3} /);
    const body = nextHeadingOffset === -1 ? rest : rest.slice(0, nextHeadingOffset);
    return body.trim();
  }

  // 既存テスト "interpolates provided fields instead of 未記入" のフィクスチャを拡張し、
  // fieldKey を持つ全 leaf section の入力が埋まった「全フィールド入力済み」の TestPlanInput を作る。
  // 現行フィクスチャに不足していた testTechniques, testDataRequirements に加え、
  // background / references / assumptions / testItems / selectedTestTypes / startCriteria・endCriteria /
  // metricsNote も同様に不足していたため合わせて追加している。
  const fullyFilledInput: TestPlanInput = {
    projectName: "Full Project",
    scope: "Full scope",
    objectives: ["Verify payment flow"],
    featuresToTest: ["Checkout"],
    featuresNotToTest: ["Admin dashboard"],
    risks: [{ description: "Third-party API instability", impact: "high", mitigation: "Add retries" }],
    scheduleConstraints: {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      milestones: [{ name: "Test design complete", date: "2026-08-10" }],
    },
    team: [{ role: "Test Lead", name: "Alice", responsibilities: "Overall test coordination" }],
    environment: "Staging environment with production-like data",
    deliverables: ["Test summary report"],
    passFailCriteria: "All critical test cases pass",
    suspensionCriteria: "Blocker defect in checkout",
    approvers: ["QA Manager"],
    testLevels: ["System test"],
    testPeriod: "2026-08-01 - 2026-08-31",
    completionCriteria: ["All planned cases executed"],
    stakeholders: [{ role: "Product Owner", name: "Bob" }],
    glossary: [{ term: "SUT", definition: "System Under Test" }],
    notes: "Special handling for payment gateway",
    background: {
      current: "Legacy system replaced by new platform",
      concerns: "Data migration accuracy",
    },
    references: [
      { name: "Requirements spec v1.2", author: "PM Office", version: "1.2", receivedDate: "2026-07-01" },
    ],
    assumptions: ["Staging mirrors production configuration"],
    constraints: ["Limited to a two week test window"],
    testItems: [{ name: "Payment API", summary: "Handles checkout payment processing" }],
    selectedTestTypes: ["機能テスト"],
    testTechniques: [{ testType: "機能テスト", approach: "同値分割", technique: "境界値分析" }],
    startCriteria: "Test environment provisioned and smoke test passed",
    endCriteria: "All planned test cases executed with no open blocker",
    metricsNote: "Track defect discovery rate weekly",
    testDataRequirements: [
      { description: "Valid and invalid payment card data set", owner: "QA Team", period: "Prepared before test start" },
    ],
    sloTargets: [
      { metric: "Defect escape rate", comparator: "<=", threshold: "1", unit: "% per release" },
    ],
    monitoringPlan: [
      { timing: "Daily standup", reviewItems: ["Progress", "Blockers"], participants: ["Test Lead"] },
    ],
    executionOrderPlan: [
      { nodeId: "TCN-01", nameJa: "Checkout container", dependsOn: [], durationHours: 4, isCritical: true },
    ],
  };

  it("does not fall back to the generic 未記入 placeholder for any fieldKey section when all fields are filled", () => {
    const markdown = renderTestPlan(fullyFilledInput);

    for (const id of fieldKeySectionIds) {
      const index = sections.findIndex((s) => s.id === id);
      const block = extractSectionBlock(markdown, index);
      expect(block).not.toBe("_未記入_");
      expect(block).not.toBe("_未記入（必須）_");
    }
  });

  it("renders the intentional-default sections as 未記入 when no corresponding input is given", () => {
    const emptyInput: TestPlanInput = { projectName: "Empty", scope: "Empty scope" };
    const markdown = renderTestPlan(emptyInput);

    for (const id of INTENTIONAL_DEFAULT_SECTION_IDS) {
      const index = sections.findIndex((s) => s.id === id);
      const block = extractSectionBlock(markdown, index);
      expect(block).toBe("_未記入_");
    }
  });
});

describe("HSKZ-129: testPurposes / testTypeSelections (sections 1.1 / 5.2)", () => {
  it("renders the 3-column test type table when testTypeSelections is not specified (backward compatible)", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Login and checkout flows",
      selectedTestTypes: ["機能テスト"],
    };
    const markdown = renderTestPlan(input);
    expect(markdown).toContain("| 対象 | テストタイプ | 説明 |");
    expect(markdown).not.toContain("紐づくテスト目的ID");
  });

  it("switches to the 5-column test type table when testTypeSelections is specified", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Login and checkout flows",
      testTypeSelections: [
        { name: "機能テスト", selected: true, purposeIds: ["TP-01"], reason: "主要業務フローの確認のため" },
        { name: "性能テスト", selected: false },
      ],
    };
    const markdown = renderTestPlan(input);
    expect(markdown).toContain("| 対象 | テストタイプ | 説明 | 紐づくテスト目的ID | 選定理由 |");
    expect(markdown).toContain("| 〇 | 機能テスト | 機能が期待どおりの結果を返すか確かめる | TP-01 | 主要業務フローの確認のため |");
  });

  it("marks the reason cell as 未記入(必須) when purposeIds or reason is missing", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Login and checkout flows",
      testTypeSelections: [{ name: "機能テスト", selected: true }],
    };
    const markdown = renderTestPlan(input);
    const row = markdown.split("\n").find((l) => l.startsWith("| 〇 | 機能テスト |"));
    expect(row).toContain("未記入(必須)");
  });

  it("renders a test purpose table in section 1.1 when testPurposes is specified", () => {
    const input: TestPlanInput = {
      projectName: "Sample",
      scope: "Login and checkout flows",
      testPurposes: [{ id: "TP-01", statement: "主要業務フローが達成できる", priorityRank: 1 }],
    };
    const markdown = renderTestPlan(input);
    const sectionStart = markdown.indexOf("### 1.1 スコープ・目的");
    const sectionEnd = markdown.indexOf("### 1.2", sectionStart);
    const section = markdown.slice(sectionStart, sectionEnd);
    expect(section).toContain("**テスト目的:**");
    expect(section).toContain("| 目的ID | テスト目的 | 優先順位 |");
    expect(section).toContain("| TP-01 | 主要業務フローが達成できる | 1 |");
  });

  it("does not render a test purpose table when testPurposes is not specified", () => {
    const input: TestPlanInput = { projectName: "Sample", scope: "Login and checkout flows" };
    const markdown = renderTestPlan(input);
    expect(markdown).not.toContain("**テスト目的:**");
  });
});

describe("renderTestPlan 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderTestPlan({ projectName: "Sample", scope: "Login and checkout flows" }));
  });
});

describe("renderTestPlan 次に実行すべきツール節の内容", () => {
  it("未記入を含むドラフトで revise_test_plan 行が出る", () => {
    const markdown = renderTestPlan({ projectName: "Sample", scope: "Login and checkout flows" });
    expect(markdown).toContain("未記入");
    const section = markdown.split("## 次に実行すべきツール")[1];
    expect(section).toContain("| 未実施 | revise_test_plan |");
  });
});
