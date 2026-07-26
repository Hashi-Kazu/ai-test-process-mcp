import { describe, expect, it } from "vitest";
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
