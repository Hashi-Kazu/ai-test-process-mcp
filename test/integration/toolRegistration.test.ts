import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registeredToolNames } from "../../src/resources/nextToolCatalog.js";
import { toolOutputSignatures } from "../../src/resources/toolOutputSignatures.js";
import { createMcpTestClient, type McpTestClient } from "./mcpTestClient.js";

let testClient: McpTestClient;
let runtimeToolNames: string[];
let runtimeTools: { name: string; inputSchema: { properties?: Record<string, unknown> } }[];

beforeAll(async () => {
  testClient = await createMcpTestClient();
  const { tools } = await testClient.client.listTools();
  runtimeTools = tools as typeof runtimeTools;
  runtimeToolNames = tools.map((t) => t.name).sort();
});

afterAll(async () => {
  await testClient.close();
});

describe("declared vs. runtime tool registration (3-way match)", () => {
  it("tools/list matches registeredToolNames", () => {
    expect(runtimeToolNames).toEqual([...registeredToolNames].sort());
  });

  it("tools/list matches toolOutputSignatures keys", () => {
    expect(runtimeToolNames).toEqual(Object.keys(toolOutputSignatures).sort());
  });

  it("all three sources agree on the count (31)", () => {
    expect(runtimeToolNames.length).toBe(31);
    expect(registeredToolNames.length).toBe(31);
    expect(Object.keys(toolOutputSignatures).length).toBe(31);
  });

  // 原文（テストベース全文・成果物全文）を受け取れる入力口を持つツールを tools/list の
  // inputSchema から機械的に数える。宣言表ではなく実際の公開スキーマから数えるため、
  // 入力口を追加し忘れた／取り違えたときに件数で検出できる。
  // 成果物本文を受け取る `deliverables`（create_test_plan / audit_coverage_balance /
  // audit_deliverable_consistency）はテストベース原文の投入口ではないため対象に含めない。
  const RAW_TEXT_INPUT_KEYS = [
    "documents",
    "testBasisDocuments",
    "requestDocuments",
    "documentsBefore",
  ];

  it("原文入力口を持つツールが18/31である", () => {
    const withRawTextInput = runtimeTools
      .filter((tool) => {
        const properties = tool.inputSchema?.properties ?? {};
        return RAW_TEXT_INPUT_KEYS.some((key) => properties[key] !== undefined);
      })
      .map((tool) => tool.name)
      .sort();
    expect(withRawTextInput).toEqual(
      [
        "analyze_data_flow_timing",
        "analyze_requirements",
        "audit_basis_contradictions",
        "audit_cross_matrix",
        "audit_id_population",
        "audit_test_design_notations",
        "derive_test_purposes",
        "design_config_matrix",
        "design_decision_table",
        "design_pairwise",
        "design_scenario_flows",
        "design_test_architecture",
        "design_test_data",
        "generate_test_cases",
        "reexpand_threshold_changes",
        "review_test_basis",
        "review_test_specification",
        "select_regression_suite",
      ].sort()
    );
    expect(withRawTextInput.length).toBe(18);
    expect(runtimeToolNames.length).toBe(31);
  });
});
