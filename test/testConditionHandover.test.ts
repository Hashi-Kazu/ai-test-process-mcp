import { describe, expect, it } from "vitest";
import { z } from "zod";
import { analyzeCrossMatrix } from "../src/crossMatrixAnalysis.js";
import { auditCrossMatrixInputShape } from "../src/tools/auditCrossMatrix.js";
import { designTestArchitectureInputShape } from "../src/tools/designTestArchitecture.js";
import { generateTestCasesInputShape } from "../src/tools/generateTestCases.js";
import { renderTestConditions } from "../src/tools/extractTestConditions.js";
import { findUncoveredRequirementIds } from "../src/testConditionAnalysis.js";
import {
  buildCrossMatrixHandoverPayload,
  buildCrossMatrixHandoverRender,
  buildTestArchitectureHandoverPayload,
  buildTestArchitectureHandoverRender,
  buildTestCaseHandoverPayload,
  buildTestCaseHandoverRender,
} from "../src/testConditionHandover.js";
import type { AuditCrossMatrixInput, ExtractTestConditionsInput } from "../src/types.js";

// 正常系フィクスチャ: 全要件がカバーされ、derivedFrom も全て解決し、rationale が全条件に付いている。
function baseInput(): ExtractTestConditionsInput {
  return {
    requirementIds: ["R-001", "R-002"],
    perspectiveCategoryIds: ["TPC-01", "TPC-03"],
    personas: [{ id: "P-001", role: "来園者" }],
    risks: [{ id: "RK-001", description: "二重課金", impact: 4, likelihood: 3 }],
    requirementSources: [{ requirementId: "R-001", document: "spec", startLine: 10 }],
    testConditions: [
      {
        id: "TC-001",
        target: "F-001",
        perspectiveCategoryId: "TPC-01",
        statement: "チケット購入が完了する",
        source: "testbase",
        derivedFrom: ["R-001"],
        priority: "高",
        impact: 5,
        likelihood: 5,
        rationale: "仕様書 3.1 の購入完了条件による",
        recommendedTechniques: ["equivalence-partitioning"],
      },
      {
        id: "TC-002",
        target: "F-002",
        perspectiveCategoryId: "TPC-03",
        statement: "二重課金が起きない",
        source: "risk",
        derivedFrom: [{ kind: "risk", id: "RK-001" }, { kind: "requirement", id: "R-002" }],
        priority: "高",
        impact: 5,
        likelihood: 5,
        rationale: "リスク RK-001 の影響度による",
        sourceRefs: [{ document: "spec", startLine: 42, endLine: 45 }],
      },
      {
        id: "TC-003",
        target: "F-003",
        perspectiveCategoryId: "TPC-01",
        statement: "来園者が並ばずに入場できる",
        source: "stakeholder",
        derivedFrom: [{ kind: "stakeholder", id: "P-001" }],
        priority: "中",
        impact: 3,
        likelihood: 3,
        rationale: "ペルソナ P-001 の関心事による",
      },
    ],
  };
}

describe("buildTestArchitectureHandoverPayload", () => {
  it("parses against designTestArchitectureInputShape once containers are added", () => {
    const payload = buildTestArchitectureHandoverPayload(baseInput());
    const parsed = z.object(designTestArchitectureInputShape).parse({
      containers: [
        {
          id: "TCN-01",
          nameJa: "予約",
          responsibility: "予約が最後まで通ることを保証する",
          testLevel: "system-testing",
          testTypes: ["機能テスト"],
          priorityClass: "must",
        },
      ],
      ...payload,
    });
    expect(parsed.testConditions).toHaveLength(3);
  });

  it("emits containerIds as an empty array and keeps the declared priority as-is", () => {
    const payload = buildTestArchitectureHandoverPayload(baseInput());
    expect(payload.testConditions.map((c) => c.containerIds)).toEqual([[], [], []]);
    expect(payload.testConditions.map((c) => c.priority)).toEqual(["高", "高", "中"]);
  });

  it("omits the priority key entirely when the upstream condition declares none", () => {
    const input = baseInput();
    delete input.testConditions[2].priority;
    const payload = buildTestArchitectureHandoverPayload(input);
    expect(Object.keys(payload.testConditions[2])).not.toContain("priority");
  });

  it("reports no reconciliation finding for the base input", () => {
    const render = buildTestArchitectureHandoverRender(baseInput(), "### 10.1 x");
    expect(render.findings.filter((f) => f.categoryId !== "HPO-05")).toEqual([]);
    expect(render.manualFieldLines.join("\n")).toContain("containerIds");
    expect(render.manualFieldLines.join("\n")).toContain("containers[]");
  });

  it("flags a HPO-05 advisory when the declared priority deviates from the derived one", () => {
    const input = baseInput();
    // impact/likelihood から導出される優先度は「高」だが、宣言は「低」。
    input.testConditions[0].priority = "低";
    const render = buildTestArchitectureHandoverRender(input, "### 10.1 x");
    const advisory = render.findings.find((f) => f.categoryId === "HPO-05");
    expect(advisory).toBeDefined();
    expect(advisory?.detail).toContain("逸脱 1 件");
    expect(advisory?.detail).toContain("逸脱理由未記入 1 件");
    // 是正はしない。宣言値のまま引き渡す。
    expect(buildTestArchitectureHandoverPayload(input).testConditions[0].priority).toBe("低");
  });
});

describe("buildTestCaseHandoverPayload", () => {
  it("parses against generateTestCasesInputShape as-is", () => {
    const parsed = z.object(generateTestCasesInputShape).parse(buildTestCaseHandoverPayload(baseInput()));
    expect(parsed.testConditions).toHaveLength(3);
    expect(parsed.requirementIds).toEqual(["R-001", "R-002"]);
    expect(parsed.riskIds).toEqual(["RK-001"]);
    expect(parsed.personaIds).toEqual(["P-001"]);
  });

  it("omits optional keys instead of emitting undefined values", () => {
    const payload = buildTestCaseHandoverPayload(baseInput());
    expect(Object.keys(payload.testConditions[0])).not.toContain("sourceRefs");
    expect(Object.keys(payload.testConditions[2])).not.toContain("recommendedTechniques");
    expect(JSON.stringify(payload)).not.toContain("undefined");
  });

  it("omits riskIds / personaIds / requirementSources when the upstream has none", () => {
    const input = baseInput();
    delete input.risks;
    delete input.personas;
    delete input.requirementSources;
    input.testConditions[1].derivedFrom = [{ kind: "requirement", id: "R-002" }];
    input.testConditions[1].source = "testbase";
    input.testConditions[2].derivedFrom = ["R-001"];
    input.testConditions[2].source = "testbase";
    const payload = buildTestCaseHandoverPayload(input);
    expect(Object.keys(payload)).toEqual(["testConditions", "requirementIds"]);
  });

  it("does not generate additionalCoverageTargets and says so in the manual field list", () => {
    const payload = buildTestCaseHandoverPayload(baseInput());
    expect(Object.keys(payload)).not.toContain("additionalCoverageTargets");
    const render = buildTestCaseHandoverRender(baseInput(), "### 10.2 x");
    expect(render.manualFieldLines.join("\n")).toContain("additionalCoverageTargets");
    expect(render.manualFieldLines.join("\n")).toContain("coverageCriteriaDeclaration");
  });

  it("reports no reconciliation finding for the base input", () => {
    const render = buildTestCaseHandoverRender(baseInput(), "### 10.2 x");
    expect(render.findings).toEqual([]);
  });

  it("does not raise HPO-04 when derivedFrom contains an unresolved reference", () => {
    const input = baseInput();
    input.testConditions[2].derivedFrom = [{ kind: "stakeholder", id: "P-999" }];
    const render = buildTestCaseHandoverRender(input, "### 10.2 x");
    // 上流と受け側が同数の未解決参照を検出するため一致（引き渡しは忠実）。
    expect(render.findings.filter((f) => f.categoryId === "HPO-04")).toEqual([]);
    expect(render.roundTripLines.join("\n")).toContain("ペイロード再実行 1 件 / 上流入力 1 件");
  });
});

describe("buildCrossMatrixHandoverPayload", () => {
  it("parses against auditCrossMatrixInputShape as-is", () => {
    const parsed = z.object(auditCrossMatrixInputShape).parse(buildCrossMatrixHandoverPayload(baseInput()));
    expect(parsed.axes.map((a) => a.axisId)).toEqual([
      "TESTCONDITION",
      "REQUIREMENT",
      "PERSPECTIVE",
      "RISK",
    ]);
    expect(parsed.axes.length).toBeGreaterThanOrEqual(2);
  });

  it("drops the RISK axis when no risk is declared", () => {
    const input = baseInput();
    delete input.risks;
    input.testConditions[1].derivedFrom = [{ kind: "requirement", id: "R-002" }];
    input.testConditions[1].source = "testbase";
    const payload = buildCrossMatrixHandoverPayload(input);
    expect(payload.axes.map((a) => a.axisId)).toEqual(["TESTCONDITION", "REQUIREMENT", "PERSPECTIVE"]);
  });

  it("declares the requirement and perspective populations in expectedAxisPopulations", () => {
    const payload = buildCrossMatrixHandoverPayload(baseInput());
    expect(payload.expectedAxisPopulations).toEqual([
      { axisId: "REQUIREMENT", ids: ["R-001", "R-002"] },
      { axisId: "PERSPECTIVE", ids: ["TPC-01", "TPC-03"] },
    ]);
  });

  it("agrees with findUncoveredRequirementIds on the empty requirement lines", () => {
    const input = baseInput();
    const payload = buildCrossMatrixHandoverPayload(input) as AuditCrossMatrixInput;
    const result = analyzeCrossMatrix(payload);
    const pair = result.pairs.find((p) => p.axisA === "TESTCONDITION" && p.axisB === "REQUIREMENT");
    expect(pair).toBeDefined();
    const emptyRequirementIds = [...(pair?.emptyRows ?? []), ...(pair?.emptyColumns ?? [])]
      .filter((line) => line.axisId === "REQUIREMENT")
      .map((line) => line.itemId);
    expect(emptyRequirementIds).toEqual(findUncoveredRequirementIds(input.requirementIds, input.testConditions));

    const render = buildCrossMatrixHandoverRender(input, "### 10.3 x");
    expect(render.findings).toEqual([]);
  });

  it("still agrees when one requirement is deliberately left uncovered", () => {
    const input = baseInput();
    input.requirementIds = ["R-001", "R-002", "R-900"];
    const upstreamUncovered = findUncoveredRequirementIds(input.requirementIds, input.testConditions);
    expect(upstreamUncovered).toEqual(["R-900"]);

    const result = analyzeCrossMatrix(buildCrossMatrixHandoverPayload(input) as AuditCrossMatrixInput);
    const pair = result.pairs.find((p) => p.axisA === "TESTCONDITION" && p.axisB === "REQUIREMENT");
    const emptyRequirementIds = [...(pair?.emptyRows ?? []), ...(pair?.emptyColumns ?? [])]
      .filter((line) => line.axisId === "REQUIREMENT")
      .map((line) => line.itemId);
    expect(emptyRequirementIds).toEqual(upstreamUncovered);

    const render = buildCrossMatrixHandoverRender(input, "### 10.3 x");
    expect(render.findings.filter((f) => f.categoryId === "HPO-04")).toEqual([]);
    expect(render.roundTripLines.join("\n")).toContain("受け側再計算 1 件 / 3.2節の提示値 1 件");
  });

  it("raises HPO-05 with the missing-evidence link count when rationale is absent", () => {
    const input = baseInput();
    delete input.testConditions[0].rationale;
    const render = buildCrossMatrixHandoverRender(input, "### 10.3 x");
    const advisory = render.findings.find((f) => f.categoryId === "HPO-05");
    expect(advisory).toBeDefined();
    expect(advisory?.detail).toContain("evidence 未記入リンク 2 件");
    expect(advisory?.detail).toContain("CMX-16[high]");
    expect(render.countLines.join("\n")).toContain("未記入 2 件");
  });
});

describe("renderTestConditions section 10", () => {
  it("renders section 10 with the three downstream subsections", () => {
    const markdown = renderTestConditions(baseInput());
    expect(markdown).toContain("## 10. 下流ツール引き渡しJSON");
    expect(markdown).toContain("### 10.1 design_test_architecture 入力(JSON)");
    expect(markdown).toContain("### 10.2 generate_test_cases 入力(JSON)");
    expect(markdown).toContain("### 10.3 audit_cross_matrix 入力(JSON)");
  });

  it("omits every payload json body when emitHandoverPayload is not given", () => {
    const markdown = renderTestConditions(baseInput());
    const section = markdown.slice(markdown.indexOf("## 10. "));
    expect(section).not.toContain("```json");
    expect(section).toContain("emitHandoverPayload: true を指定すると");
  });

  it("emits a generate_test_cases payload that parses with the receiving zod shape", () => {
    const markdown = renderTestConditions({ ...baseInput(), emitHandoverPayload: true });
    const idx = markdown.indexOf("### 10.2 generate_test_cases 入力(JSON)");
    const match = /```json\n([\s\S]*?)\n```/.exec(markdown.slice(idx));
    expect(match).not.toBeNull();
    const payload = JSON.parse((match as RegExpExecArray)[1]);
    expect(() => z.object(generateTestCasesInputShape).parse(payload)).not.toThrow();
    expect(payload).toEqual(buildTestCaseHandoverPayload(baseInput()));
  });

  it("emits a design_test_architecture payload that parses once containers are added", () => {
    const markdown = renderTestConditions({ ...baseInput(), emitHandoverPayload: true });
    const idx = markdown.indexOf("### 10.1 design_test_architecture 入力(JSON)");
    const match = /```json\n([\s\S]*?)\n```/.exec(markdown.slice(idx));
    const payload = JSON.parse((match as RegExpExecArray)[1]);
    expect(() =>
      z.object(designTestArchitectureInputShape).parse({
        containers: [
          {
            id: "TCN-01",
            nameJa: "予約",
            responsibility: "予約が最後まで通ることを保証する",
            testLevel: "system-testing",
            testTypes: ["機能テスト"],
            priorityClass: "must",
          },
        ],
        ...payload,
      })
    ).not.toThrow();
  });

  it("emits an audit_cross_matrix payload that parses with the receiving zod shape", () => {
    const markdown = renderTestConditions({ ...baseInput(), emitHandoverPayload: true });
    const idx = markdown.indexOf("### 10.3 audit_cross_matrix 入力(JSON)");
    const match = /```json\n([\s\S]*?)\n```/.exec(markdown.slice(idx));
    const payload = JSON.parse((match as RegExpExecArray)[1]);
    expect(() => z.object(auditCrossMatrixInputShape).parse(payload)).not.toThrow();
  });

  it("is deterministic across repeated renders", () => {
    const first = renderTestConditions({ ...baseInput(), emitHandoverPayload: true });
    const second = renderTestConditions({ ...baseInput(), emitHandoverPayload: true });
    expect(second).toBe(first);
  });
});
