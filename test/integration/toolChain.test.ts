import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toolOutputSignatures } from "../../src/resources/toolOutputSignatures.js";
import { nextToolCatalog } from "../../src/resources/nextToolCatalog.js";
import { expectNextToolsSection } from "../nextToolSectionHelper.js";
import { createMcpTestClient, type McpTestClient } from "./mcpTestClient.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sampleDir = path.join(repoRoot, "sample", "non_contest_testbase");
const payloadsDir = path.join(sampleDir, "payloads");
const FUBAN_BASENAME = "2026-08_digital-agency_atenabango-fuban-api_spec";
const ITEM_BASENAME = "2026-08_digital-agency_atenabango-kanri_item-definition";

function readPayload(name: string): any {
  return JSON.parse(readFileSync(path.join(payloadsDir, name), "utf8"));
}

const workDirs: string[] = [];

function extractToTemp(basename: string): string {
  const outDir = mkdtempSync(path.join(tmpdir(), "atenabango-chain-"));
  workDirs.push(outDir);
  const outPath = path.join(outDir, `${basename}.txt`);
  execFileSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts", "extract-testbase-xlsx.mjs"),
      path.join(sampleDir, `${basename}.xlsx`),
      "--out",
      outPath,
    ],
    { cwd: repoRoot, stdio: "pipe" }
  );
  return readFileSync(outPath, "utf8");
}

function jsonBlockAfter(markdown: string, heading: string): any {
  const idx = markdown.indexOf(heading);
  expect(idx, `heading not found: ${heading}`).toBeGreaterThanOrEqual(0);
  const m = /```json\n([\s\S]*?)\n```/.exec(markdown.slice(idx));
  expect(m, `json block not found after: ${heading}`).not.toBeNull();
  return JSON.parse(m![1]);
}

function firstHeading(markdown: string): string {
  return markdown.split("\n")[0];
}

function expectSignatureHeading(toolName: string, markdown: string): void {
  const sig = toolOutputSignatures[toolName];
  expect(sig, toolName).toBeDefined();
  const heading = firstHeading(markdown);
  if (sig.prefix) {
    expect(heading.startsWith(sig.heading), `${toolName}: ${heading}`).toBe(true);
  } else {
    expect(heading, toolName).toBe(sig.heading);
  }
}

function alwaysNextToolNames(toolName: string): string[] {
  return (nextToolCatalog[toolName] ?? [])
    .filter((e) => e.when === "always")
    .map((e) => e.toolName);
}

function extractNextToolsTableRows(markdown: string): string[] {
  const idx = markdown.indexOf("## 次に実行すべきツール");
  expect(idx, "next tools section not found").toBeGreaterThanOrEqual(0);
  const section = markdown.slice(idx);
  const rows: string[] = [];
  for (const line of section.split("\n")) {
    const m = /^\|\s*[^|]+\s*\|\s*([a-z0-9_]+)\s*\|/.exec(line);
    if (m) rows.push(m[1]);
  }
  return rows;
}

/**
 * design_boundary_values の出力から、変数名ごとの境界値表を抽出する。
 * 出力は `## <変数名>（...）` の節ごとに `| 値 | 種別 | 有効/無効 |` 表を持つ。
 */
function extractBvValuesByVariable(markdown: string, variableNames: string[]): Map<string, Set<string>> {
  const byVariable = new Map<string, Set<string>>();
  const sections = markdown.split(/^## /m).slice(1);
  for (const section of sections) {
    const heading = section.split("\n")[0];
    const name = variableNames.find((n) => heading.startsWith(`${n}（`));
    if (name === undefined) continue;
    const values = new Set<string>();
    for (const m of section.matchAll(/^\| (-?\d+(?:\.\d+)?) \| /gm)) {
      values.add(m[1]);
    }
    byVariable.set(name, values);
  }
  return byVariable;
}

function extractBvCoverageIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  for (const m of markdown.matchAll(/BV:[^\s|`]+/g)) {
    ids.add(m[0].replace(/:$/, ""));
  }
  return ids;
}

let testClient: McpTestClient;

beforeAll(async () => {
  testClient = await createMcpTestClient();
});

afterAll(async () => {
  await testClient.close();
  for (const dir of workDirs) rmSync(dir, { recursive: true, force: true });
});

describe("tool chain: plan -> analysis -> design -> cases -> audit", () => {
  it("runs the full chain and cross-validates handoff points", async () => {
    // #1 計画
    const planPayload = readPayload("test-plan-draft.json");
    const planOutput = await testClient.callTool("create_test_plan", planPayload);
    expectSignatureHeading("create_test_plan", planOutput);

    // #2 計画レビュー
    const reviewOutput = await testClient.callTool("review_test_plan", {
      planMarkdown: planOutput,
    });
    expectSignatureHeading("review_test_plan", reviewOutput);

    // #3 分析
    const documents = [
      { name: FUBAN_BASENAME, content: extractToTemp(FUBAN_BASENAME) },
      { name: ITEM_BASENAME, content: extractToTemp(ITEM_BASENAME) },
    ];
    const analyzePayload = readPayload("analyze-requirements.json");
    const analyzeOutput = await testClient.callTool("analyze_requirements", {
      ...analyzePayload,
      documents,
      verbose: true,
    });
    expectSignatureHeading("analyze_requirements", analyzeOutput);

    // #3 -> #4 橋渡し
    const boundaryInput = jsonBlockAfter(analyzeOutput, "### 2.3 境界値候補");
    expect(Array.isArray(boundaryInput.variables)).toBe(true);
    expect(boundaryInput.variables.length).toBeGreaterThan(0);
    expect(typeof boundaryInput.mode).toBe("string");

    // #4 設計
    const boundaryOutput = await testClient.callTool("design_boundary_values", boundaryInput);
    expectSignatureHeading("design_boundary_values", boundaryOutput);

    // #3 -> #5 requirementSources 橋渡し
    const requirementSourcesBlock = jsonBlockAfter(analyzeOutput, "### 2.6 要件ID");
    expect(Array.isArray(requirementSourcesBlock.requirementSources)).toBe(true);
    expect(requirementSourcesBlock.requirementSources.length).toBeGreaterThan(0);

    // #5 ケース生成
    const casesPayload = readPayload("generate-test-cases.json");
    const testCases = readPayload("test-cases.json");
    const generateOutput = await testClient.callTool("generate_test_cases", {
      ...casesPayload,
      requirementSources: requirementSourcesBlock.requirementSources,
      boundaryVariables: boundaryInput.variables,
      boundaryMode: boundaryInput.mode,
      testCases,
      testBasisDocuments: documents,
    });
    expectSignatureHeading("generate_test_cases", generateOutput);

    // #4 -> #5 境界値網羅対象ID の入力独立再計算による照合
    const variableNames = boundaryInput.variables.map((v: { name: string }) => v.name);
    const boundaryValuesByVariable = extractBvValuesByVariable(boundaryOutput, variableNames);
    const coverageIds = extractBvCoverageIds(generateOutput);
    const expectedCoverageIds = new Set<string>();
    for (const [name, values] of boundaryValuesByVariable) {
      for (const value of values) expectedCoverageIds.add(`BV:${name}:${value}`);
    }
    expect(expectedCoverageIds.size).toBeGreaterThan(0);
    expect(coverageIds).toEqual(expectedCoverageIds);

    // #6 監査
    const auditOutput = await testClient.callTool("audit_deliverable_consistency", {
      deliverables: [
        { name: "テスト計画書", kind: "test-plan", content: planOutput },
        { name: "要件分析結果", kind: "test-analysis", content: analyzeOutput },
        { name: "境界値分析結果", kind: "test-design", content: boundaryOutput },
        { name: "テストケース生成結果", kind: "test-design", content: generateOutput },
      ],
    });
    expectSignatureHeading("audit_deliverable_consistency", auditOutput);

    // nextToolCatalog の常時後続遷移が実出力の「次に実行すべきツール」表に現れること
    for (const [toolName, markdown] of [
      ["create_test_plan", planOutput],
      ["review_test_plan", reviewOutput],
      ["analyze_requirements", analyzeOutput],
      ["design_boundary_values", boundaryOutput],
      ["generate_test_cases", generateOutput],
      ["audit_deliverable_consistency", auditOutput],
    ] as const) {
      expectNextToolsSection(markdown);
      const tableRows = extractNextToolsTableRows(markdown);
      for (const alwaysNext of alwaysNextToolNames(toolName)) {
        expect(tableRows, `${toolName} -> ${alwaysNext}`).toContain(alwaysNext);
      }
    }

    // completedTools による実施済み照合
    const outputExcerpt = generateOutput.slice(0, 400);
    const boundaryWithCompleted = await testClient.callTool("design_boundary_values", {
      ...boundaryInput,
      completedTools: [
        {
          toolName: "generate_test_cases",
          evidence: "docs/cases.md",
          outputExcerpt,
        },
      ],
    });
    const completedRows = boundaryWithCompleted
      .split("\n")
      .filter((line) => /^\|\s*実施済み\s*\|\s*generate_test_cases\s*\|/.test(line));
    expect(completedRows.length).toBeGreaterThan(0);
    expect(boundaryWithCompleted).toContain("実施済み申告だが証跡未照合: 0件");
  }, 120000);
});
