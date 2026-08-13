import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildTestCaseHandoverPayload } from "../src/testConditionHandover.js";
import type { ExtractTestConditionsInput } from "../src/types.js";

// 実務サンプル（sample/non_contest_testbase/payloads）に対する機械生成率の測定。
// payloads/*.json は測定の正本であり、本テストは読み取りのみを行う。
//
// 2026-08 時点の実測値（本テストが assert する数値の根拠）:
//   - generate-test-cases.json 全体             : 30,679 文字
//   - 上流から機械生成できる5フィールドの合計    : 21,972 文字
//   - 機械生成文字数比                          : 0.716（下限 0.40 に対して十分な余裕がある）
//   - 一致検査                                  : testConditions 46 件すべてでフィールド射影が完全一致（不一致 0 件）

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const payloadsDir = path.join(repoRoot, "sample", "non_contest_testbase", "payloads");

function readPayload(name: string): any {
  return JSON.parse(readFileSync(path.join(payloadsDir, name), "utf8"));
}

const extractInput = readPayload("extract-test-conditions.json") as ExtractTestConditionsInput;
const committed = readPayload("generate-test-cases.json");
const generated = buildTestCaseHandoverPayload(extractInput);

describe("extract_test_conditions -> generate_test_cases handover, measured on the practice sample", () => {
  it("reproduces the committed testConditions exactly", () => {
    expect(generated.testConditions).toEqual(committed.testConditions);
    expect(generated.testConditions).toHaveLength(46);
  });

  it("reproduces requirementIds / riskIds / personaIds / requirementSources exactly", () => {
    expect(generated.requirementIds).toEqual(committed.requirementIds);
    expect(generated.riskIds).toEqual(committed.riskIds);
    expect(generated.personaIds).toEqual(committed.personaIds);
    expect(generated.requirementSources).toEqual(committed.requirementSources);
  });

  it("machine-generates at least 40% of the hand-written generate_test_cases payload", () => {
    const generatedChars = JSON.stringify(generated).length;
    const committedChars = JSON.stringify(committed).length;
    const ratio = generatedChars / committedChars;
    // 実測: 21,972 / 30,679 = 0.716
    expect(generatedChars).toBeGreaterThan(0);
    expect(ratio).toBeGreaterThanOrEqual(0.4);
  });

  it("machine-generates the committed subset byte-for-byte", () => {
    const committedSubset = {
      testConditions: committed.testConditions,
      requirementIds: committed.requirementIds,
      riskIds: committed.riskIds,
      personaIds: committed.personaIds,
      requirementSources: committed.requirementSources,
    };
    expect(JSON.stringify(generated)).toBe(JSON.stringify(committedSubset));
  });

  it("leaves only the non-generatable fields to the user", () => {
    const remaining = Object.keys(committed).filter((key) => !(key in generated));
    expect(remaining.sort()).toEqual([
      "additionalCoverageTargets",
      "coverageCriteriaDeclaration",
      "idPatterns",
      "idPrefix",
      "parameters",
    ]);
  });
});

describe("design_test_architecture -> analyze_execution_order handover, sanity floor", () => {
  it("keeps the committed nodes aligned with architectureContainerIds", () => {
    const executionOrder = readPayload("analyze-execution-order.json");
    const nodeIds = executionOrder.nodes.map((n: { id: string }) => n.id);
    expect(nodeIds).toEqual(executionOrder.architectureContainerIds);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
  });
});
