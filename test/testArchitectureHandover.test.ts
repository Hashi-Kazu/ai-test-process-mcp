import { describe, expect, it } from "vitest";
import { z } from "zod";
import { analyzeExecutionOrderInputShape, computeExecutionOrder } from "../src/tools/analyzeExecutionOrder.js";
import { auditCrossMatrixInputShape } from "../src/tools/auditCrossMatrix.js";
import {
  computeTestArchitecture,
  renderTestArchitecture,
} from "../src/tools/designTestArchitecture.js";
import {
  buildArchitectureCrossMatrixPayload,
  buildArchitectureCrossMatrixRender,
  buildExecutionOrderHandoverPayload,
  buildExecutionOrderHandoverRender,
} from "../src/testArchitectureHandover.js";
import type { ExecutionOrderSpec, TestArchitectureSpec } from "../src/types.js";

// コンテナ3件・テスト条件4件の正常系フィクスチャ。決定的検査の指摘が出ないようにしてある。
function baseSpec(): TestArchitectureSpec {
  return {
    title: "予約システム 回帰テスト",
    scope: {
      inScope: [{ item: "予約", reason: "今回の変更範囲" }],
      outOfScope: [{ item: "帳票出力", reason: "今回変更が無く、前回リリースで確認済み" }],
    },
    containers: [
      {
        id: "TCN-01",
        nameJa: "予約システム全体",
        responsibility: "予約から決済までの業務が最後まで通ることを保証する",
        objective: "リリース可否判断の材料にする",
        testLevel: "system-testing",
        testTypes: ["機能テスト"],
        priorityClass: "must",
        perspectiveCategoryIds: ["TPC-01"],
        targets: ["予約システム"],
        environment: "検証環境",
      },
      {
        id: "TCN-02",
        nameJa: "予約入力",
        parentId: "TCN-01",
        responsibility: "予約入力画面の入力値検証が仕様どおり行われることを保証する",
        objective: "入力検証の不具合を早期に見つける",
        testLevel: "system-testing",
        testTypes: ["機能テスト"],
        priorityClass: "must",
        perspectiveCategoryIds: ["TPC-01"],
        targets: ["予約入力画面"],
        environment: "検証環境",
      },
      {
        id: "TCN-03",
        nameJa: "決済",
        parentId: "TCN-01",
        responsibility: "決済の成功・失敗が予約状態へ正しく反映されることを保証する",
        objective: "決済連携の不整合を検知する",
        testLevel: "system-testing",
        testTypes: ["性能テスト"],
        priorityClass: "conditional",
        perspectiveCategoryIds: ["TPC-01"],
        targets: ["決済連携"],
        environment: "検証環境",
      },
    ],
    testConditions: [
      { id: "TC-01", statement: "予約人数が下限のとき登録できる", perspectiveCategoryId: "TPC-01", priority: "高", containerIds: ["TCN-02"] },
      { id: "TC-02", statement: "予約人数が上限のとき登録できる", perspectiveCategoryId: "TPC-01", priority: "高", containerIds: ["TCN-02"] },
      { id: "TC-03", statement: "決済成功で予約が確定状態になる", perspectiveCategoryId: "TPC-01", priority: "高", containerIds: ["TCN-03"] },
      { id: "TC-04", statement: "決済失敗で予約が保留状態になる", perspectiveCategoryId: "TPC-01", priority: "中", containerIds: ["TCN-03"] },
    ],
  };
}

describe("buildExecutionOrderHandoverPayload", () => {
  it("parses against analyzeExecutionOrderInputShape as-is", () => {
    const payload = buildExecutionOrderHandoverPayload(baseSpec());
    expect(payload).toBeDefined();
    const parsed = z.object(analyzeExecutionOrderInputShape).parse(payload);
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.architectureContainerIds).toEqual(["TCN-01", "TCN-02", "TCN-03"]);
  });

  it("builds nodes from the computed container entities, not from the raw declaration", () => {
    const payload = buildExecutionOrderHandoverPayload(baseSpec());
    expect(payload?.nodes).toEqual([
      { id: "TCN-01", nameJa: "予約システム全体", kind: "container", priorityClass: "must" },
      { id: "TCN-02", nameJa: "予約入力", kind: "container", priorityClass: "must" },
      { id: "TCN-03", nameJa: "決済", kind: "container", priorityClass: "conditional" },
    ]);
    expect(payload?.title).toBe("予約システム 回帰テスト");
    const result = computeTestArchitecture(baseSpec());
    expect(payload?.architectureContainerIds).toEqual(result.containers.map((c) => c.containerId));
  });

  it("does not emit dependsOn / durationHours and says so in the manual field list", () => {
    const payload = buildExecutionOrderHandoverPayload(baseSpec());
    expect(JSON.stringify(payload)).not.toContain("dependsOn");
    expect(JSON.stringify(payload)).not.toContain("durationHours");
    const render = buildExecutionOrderHandoverRender(baseSpec(), "### 10.1 x");
    expect(render.manualFieldLines.join("\n")).toContain("dependsOn");
    expect(render.manualFieldLines.join("\n")).toContain("durationHours");
    expect(render.manualFieldLines.join("\n")).toContain("resources");
    expect(render.manualFieldLines.join("\n")).toContain("slos");
  });

  it("round-trips through computeExecutionOrder with full plan coverage and no mismatch", () => {
    const payload = buildExecutionOrderHandoverPayload(baseSpec()) as unknown as ExecutionOrderSpec;
    const result = computeExecutionOrder(payload);
    expect(result.unplannedContainerIds).toEqual([]);
    expect(result.coverage.basis).toBe("computed");
    expect(result.coverage.percent).toBe(100);

    const render = buildExecutionOrderHandoverRender(baseSpec(), "### 10.1 x");
    expect(render.findings.filter((f) => f.categoryId !== "HPO-05")).toEqual([]);
    expect(render.roundTripLines.join("\n")).toContain("未計画コンテナ 0 件");
    expect(render.roundTripLines.join("\n")).toContain("計画被覆率 100%");
  });

  it("matches the EOC-05 count against the node count and surfaces it as HPO-05", () => {
    const payload = buildExecutionOrderHandoverPayload(baseSpec()) as unknown as ExecutionOrderSpec;
    const result = computeExecutionOrder(payload);
    const eoc05 = result.findings.filter((f) => f.categoryId === "EOC-05");
    expect(eoc05).toHaveLength(payload.nodes.length);

    const render = buildExecutionOrderHandoverRender(baseSpec(), "### 10.1 x");
    const advisory = render.findings.find((f) => f.categoryId === "HPO-05");
    expect(advisory).toBeDefined();
    expect(advisory?.detail).toContain("dependsOn 未宣言 3 件");
    expect(advisory?.detail).toContain("EOC-05");
  });

  it("reproduces the priorityClass distribution reported in section 5", () => {
    const render = buildExecutionOrderHandoverRender(baseSpec(), "### 10.1 x");
    expect(render.findings.filter((f) => f.categoryId === "HPO-02")).toEqual([]);
    expect(render.countLines.join("\n")).toContain("must 2/2");
    expect(render.countLines.join("\n")).toContain("conditional 1/1");
  });

  it("returns undefined and renders 未算出 when the architecture could not be computed", () => {
    const spec = { ...baseSpec(), maxContainers: 1 };
    expect(computeTestArchitecture(spec).generated).toBe(false);
    expect(buildExecutionOrderHandoverPayload(spec)).toBeUndefined();

    const markdown = renderTestArchitecture({ ...spec, emitHandoverPayload: true });
    const section = markdown.slice(markdown.indexOf("### 10.1 analyze_execution_order 入力(JSON)"));
    const subsection = section.slice(0, section.indexOf("### 10.2"));
    expect(subsection).toContain("未算出（理由:");
    expect(subsection).not.toContain("```json");
  });
});

describe("buildArchitectureCrossMatrixPayload", () => {
  it("parses against auditCrossMatrixInputShape with a container axis and a condition axis", () => {
    const payload = buildArchitectureCrossMatrixPayload(baseSpec());
    const parsed = z.object(auditCrossMatrixInputShape).parse(payload);
    expect(parsed.axes.map((a) => a.axisId)).toEqual(["CONTAINER", "TESTCONDITION"]);
    expect(parsed.axes[1].items.map((i) => i.id)).toEqual(["TC-01", "TC-02", "TC-03", "TC-04"]);
  });

  it("agrees with unassignedConditionIds on isolated conditions", () => {
    const render = buildArchitectureCrossMatrixRender(baseSpec(), "### 10.2 x");
    expect(render.findings.filter((f) => f.categoryId !== "HPO-05")).toEqual([]);
    expect(render.roundTripLines.join("\n")).toContain("受け側再計算 0 件 / 4節の未帰属条件 0 件");
  });

  it("emits no payload when a condition is left unassigned, since TAC-01 blocks the architecture", () => {
    const spec = baseSpec();
    spec.testConditions.push({
      id: "TC-05",
      statement: "未帰属の条件",
      perspectiveCategoryId: "TPC-01",
      priority: "低",
      containerIds: [],
    });
    const result = computeTestArchitecture(spec);
    expect(result.unassignedConditionIds).toEqual(["TC-05"]);
    expect(result.generated).toBe(false);
    expect(buildArchitectureCrossMatrixPayload(spec)).toBeUndefined();

    const render = buildArchitectureCrossMatrixRender(spec, "### 10.2 x");
    expect(render.findings).toEqual([]);
    expect(render.unavailableReason).toContain("TAC-01");
  });

  it("carries the container responsibility into the link evidence", () => {
    const payload = buildArchitectureCrossMatrixPayload(baseSpec());
    const containerAxis = payload?.axes[0];
    const links = containerAxis?.items.find((i) => i.id === "TCN-02")?.links ?? [];
    expect(links).toEqual([
      {
        targetId: "TC-01",
        evidenceSource: "design_test_architecture",
        evidence: "予約入力画面の入力値検証が仕様どおり行われることを保証する",
      },
      {
        targetId: "TC-02",
        evidenceSource: "design_test_architecture",
        evidence: "予約入力画面の入力値検証が仕様どおり行われることを保証する",
      },
    ]);
    const render = buildArchitectureCrossMatrixRender(baseSpec(), "### 10.2 x");
    expect(render.findings.filter((f) => f.categoryId === "HPO-05")).toEqual([]);
  });

  it("returns undefined when the architecture could not be computed", () => {
    expect(buildArchitectureCrossMatrixPayload({ ...baseSpec(), maxContainers: 1 })).toBeUndefined();
  });
});

describe("renderTestArchitecture section 10", () => {
  it("renders section 10 with both downstream subsections", () => {
    const markdown = renderTestArchitecture(baseSpec());
    expect(markdown).toContain("## 10. 下流ツール引き渡しJSON");
    expect(markdown).toContain("### 10.1 analyze_execution_order 入力(JSON)");
    expect(markdown).toContain("### 10.2 audit_cross_matrix 入力(JSON)");
  });

  it("omits every payload json body when emitHandoverPayload is not given", () => {
    const markdown = renderTestArchitecture(baseSpec());
    const section = markdown.slice(markdown.indexOf("## 10. "));
    expect(section).not.toContain("```json");
    expect(section).toContain("emitHandoverPayload: true を指定すると");
  });

  it("emits an analyze_execution_order payload that parses with the receiving zod shape", () => {
    const markdown = renderTestArchitecture({ ...baseSpec(), emitHandoverPayload: true });
    const idx = markdown.indexOf("### 10.1 analyze_execution_order 入力(JSON)");
    const match = /```json\n([\s\S]*?)\n```/.exec(markdown.slice(idx));
    expect(match).not.toBeNull();
    const payload = JSON.parse((match as RegExpExecArray)[1]);
    expect(() => z.object(analyzeExecutionOrderInputShape).parse(payload)).not.toThrow();
    expect(payload).toEqual(buildExecutionOrderHandoverPayload(baseSpec()));
  });

  it("is deterministic across repeated renders", () => {
    const first = renderTestArchitecture({ ...baseSpec(), emitHandoverPayload: true });
    const second = renderTestArchitecture({ ...baseSpec(), emitHandoverPayload: true });
    expect(second).toBe(first);
  });
});
