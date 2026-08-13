import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildScenarioFlowCoverageTargets,
  computeScenarioFlows,
  renderScenarioFlows,
} from "../src/tools/designScenarioFlows.js";
import { generateTestCasesInputShape } from "../src/tools/generateTestCases.js";
import {
  buildScenarioFlowsTestCasePayload,
  buildScenarioFlowsTestCaseRender,
} from "../src/scenarioFlowHandover.js";
import type { ScenarioFlowSpec } from "../src/types.js";

// 動物園入場ドメイン: 購入 → 発券 → 入場。主フロー5ステップ、代替1件、例外1件。
function baseSpec(): ScenarioFlowSpec {
  return {
    title: "入場券の購入から入場まで",
    actors: [
      { id: "A-USER", nameJa: "来園者", kind: "human" },
      { id: "A-SYS", nameJa: "発券システム", kind: "system" },
    ],
    featureIds: ["F-PURCHASE", "F-ISSUE", "F-ENTRY"],
    testConditions: [
      { id: "TC-01", statement: "入場券が購入できる", featureIds: ["F-PURCHASE"] },
      { id: "TC-02", statement: "入場できる", featureIds: ["F-ENTRY"] },
    ],
    useCases: [
      {
        id: "UC-01",
        nameJa: "入場券を購入して入場する",
        primaryActor: "A-USER",
        supportingActors: ["A-SYS"],
        preconditions: ["券売機が稼働している"],
        postconditions: ["入場者数が1件加算される"],
        mainFlow: [
          { no: 1, actor: "A-USER", action: "券売機で入場券を購入する", featureIds: ["F-PURCHASE"] },
          { no: 2, actor: "A-SYS", action: "決済を確定する", featureIds: ["F-PURCHASE"] },
          { no: 3, actor: "A-SYS", action: "入場券を発券する", featureIds: ["F-ISSUE"] },
          { no: 4, actor: "A-USER", action: "入場ゲートに入場券をかざす", featureIds: ["F-ENTRY"] },
          { no: 5, actor: "A-SYS", action: "入場を許可しゲートを開く", featureIds: ["F-ENTRY"] },
        ],
        branches: [
          {
            id: "AF-01",
            kind: "alternate",
            nameJa: "電子マネーで支払う",
            fromStepNo: 1,
            trigger: "来園者が電子マネー払いを選ぶ",
            steps: [
              { no: 1, actor: "A-SYS", action: "電子マネー残高から引き落とす", featureIds: ["F-PURCHASE"] },
            ],
            rejoinStepNo: 3,
            outcome: "goal-achieved",
          },
          {
            id: "EF-01",
            kind: "exception",
            nameJa: "決済失敗で購入を中止する",
            fromStepNo: 2,
            trigger: "決済が承認されない",
            steps: [
              { no: 1, actor: "A-SYS", action: "決済失敗を表示し購入を取り消す", featureIds: ["F-PURCHASE"] },
            ],
            outcome: "aborted",
          },
        ],
      },
    ],
  };
}

describe("buildScenarioFlowsTestCasePayload", () => {
  it("parses against generateTestCasesInputShape once testConditions are added", () => {
    const payload = buildScenarioFlowsTestCasePayload(baseSpec());
    expect(payload).toBeDefined();
    const parsed = z.object(generateTestCasesInputShape).parse({
      testConditions: [
        {
          id: "TC-01",
          target: "F-PURCHASE",
          statement: "入場券が購入できる",
          derivedFrom: ["R-001"],
        },
      ],
      ...payload,
    });
    expect(parsed.scenarioFlows?.useCases).toHaveLength(1);
  });

  it("carries only the keys present upstream and never completedTools", () => {
    const payload = buildScenarioFlowsTestCasePayload(baseSpec());
    expect(Object.keys(payload?.scenarioFlows ?? {}).sort()).toEqual([
      "actors",
      "featureIds",
      "testConditions",
      "title",
      "useCases",
    ]);
    expect(JSON.stringify(payload)).not.toContain("completedTools");

    const spec = baseSpec();
    delete spec.title;
    delete spec.featureIds;
    delete spec.testConditions;
    spec.completedTools = [{ toolName: "extract_test_conditions" }];
    const lean = buildScenarioFlowsTestCasePayload(spec);
    expect(Object.keys(lean?.scenarioFlows ?? {}).sort()).toEqual(["actors", "useCases"]);
    expect(JSON.stringify(lean)).not.toContain("completedTools");
  });

  it("keeps maxScenariosPerUseCase when the upstream declares it", () => {
    const payload = buildScenarioFlowsTestCasePayload({ ...baseSpec(), maxScenariosPerUseCase: 7 });
    expect(payload?.scenarioFlows.maxScenariosPerUseCase).toBe(7);
  });

  it("round-trips through buildScenarioFlowCoverageTargets with the same id sequence", () => {
    const spec = baseSpec();
    const payload = buildScenarioFlowsTestCasePayload(spec);
    const payloadTargets = buildScenarioFlowCoverageTargets(payload?.scenarioFlows as ScenarioFlowSpec);
    const upstreamTargets = buildScenarioFlowCoverageTargets(spec);
    expect(payloadTargets.map((t) => t.id)).toEqual(upstreamTargets.map((t) => t.id));
    expect(payloadTargets).toHaveLength(upstreamTargets.length);
  });

  it("matches the coverage target ids shown in section 8 of renderScenarioFlows, in order", () => {
    const spec = baseSpec();
    const markdown = renderScenarioFlows(spec);
    const section8 = markdown.slice(
      markdown.indexOf("## 8. 網羅対象一覧(generate_test_cases 引き渡し)"),
      markdown.indexOf("## 9. サマリ")
    );
    const renderedIds: string[] = [];
    for (const match of section8.matchAll(/^\| ((?:UC|SC):[^ |]+) \| /gm)) {
      renderedIds.push(match[1]);
    }
    expect(renderedIds.length).toBeGreaterThan(0);

    const payload = buildScenarioFlowsTestCasePayload(spec);
    const payloadIds = buildScenarioFlowCoverageTargets(payload?.scenarioFlows as ScenarioFlowSpec).map(
      (t) => t.id
    );
    // 8節は UC: 節と SC: 節に分けて表示するため、種別ごとに順序込みで一致することを見る。
    expect(payloadIds.filter((id) => id.startsWith("UC:"))).toEqual(
      renderedIds.filter((id) => id.startsWith("UC:"))
    );
    expect(payloadIds.filter((id) => id.startsWith("SC:"))).toEqual(
      renderedIds.filter((id) => id.startsWith("SC:"))
    );
    expect(payloadIds).toHaveLength(renderedIds.length);
  });

  it("reports no reconciliation finding for the base spec", () => {
    const render = buildScenarioFlowsTestCaseRender(baseSpec(), "### 10.1 x");
    expect(render.findings).toEqual([]);
    expect(render.roundTripLines.join("\n")).toContain("ペイロード再生成 6 件 / 8節の提示 6 件");
    expect(render.manualFieldLines.join("\n")).toContain("testCases");
    expect(render.manualFieldLines.join("\n")).toContain("parameters");
  });

  it("returns undefined when the scenarios could not be generated", () => {
    const spec = { ...baseSpec(), maxScenariosPerUseCase: 1 };
    expect(computeScenarioFlows(spec).generated).toBe(false);
    expect(buildScenarioFlowsTestCasePayload(spec)).toBeUndefined();

    const render = buildScenarioFlowsTestCaseRender(spec, "### 10.1 x");
    expect(render.payload).toBeUndefined();
    expect((render.unavailableReason ?? "").length).toBeGreaterThan(0);
  });
});

describe("renderScenarioFlows section 10", () => {
  it("renders section 10 with the generate_test_cases subsection", () => {
    const markdown = renderScenarioFlows(baseSpec());
    expect(markdown).toContain("## 10. 下流ツール引き渡しJSON");
    expect(markdown).toContain("### 10.1 generate_test_cases 入力(JSON)");
  });

  it("omits the payload json body when emitHandoverPayload is not given", () => {
    const section = renderScenarioFlows(baseSpec());
    const tail = section.slice(section.indexOf("## 10. "));
    expect(tail).not.toContain("```json");
    expect(tail).toContain("emitHandoverPayload: true を指定すると");
  });

  it("emits a payload that parses with the receiving zod shape once testConditions are added", () => {
    const markdown = renderScenarioFlows({ ...baseSpec(), emitHandoverPayload: true });
    const idx = markdown.indexOf("### 10.1 generate_test_cases 入力(JSON)");
    const match = /```json\n([\s\S]*?)\n```/.exec(markdown.slice(idx));
    expect(match).not.toBeNull();
    const payload = JSON.parse((match as RegExpExecArray)[1]);
    expect(() =>
      z.object(generateTestCasesInputShape).parse({
        testConditions: [
          { id: "TC-01", target: "F-PURCHASE", statement: "入場券が購入できる", derivedFrom: ["R-001"] },
        ],
        ...payload,
      })
    ).not.toThrow();
    expect(payload).toEqual(buildScenarioFlowsTestCasePayload(baseSpec()));
  });

  it("renders 未算出 without a json block when the scenarios could not be generated", () => {
    const markdown = renderScenarioFlows({
      ...baseSpec(),
      maxScenariosPerUseCase: 1,
      emitHandoverPayload: true,
    });
    const tail = markdown.slice(markdown.indexOf("### 10.1 generate_test_cases 入力(JSON)"));
    expect(tail).toContain("未算出（理由:");
    expect(tail).not.toContain("```json");
  });

  it("is deterministic across repeated renders", () => {
    const first = renderScenarioFlows({ ...baseSpec(), emitHandoverPayload: true });
    const second = renderScenarioFlows({ ...baseSpec(), emitHandoverPayload: true });
    expect(second).toBe(first);
  });
});
