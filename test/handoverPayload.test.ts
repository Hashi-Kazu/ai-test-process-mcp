import { describe, expect, it } from "vitest";
import {
  countHandoverMismatchFindings,
  handoverPayloadCriteria,
  renderHandoverPayloadSection,
  sortHandoverPayloadFindings,
  type HandoverPayloadFinding,
  type HandoverPayloadRender,
} from "../src/handoverPayload.js";

function baseRender(overrides: Partial<HandoverPayloadRender> = {}): HandoverPayloadRender {
  return {
    heading: "### 10.1 generate_test_cases 入力(JSON)",
    targetTool: "generate_test_cases",
    payload: { testConditions: [{ id: "TC-001" }], requirementIds: ["R-001"] },
    countLines: ["テスト条件 1 件 / 生成JSON 52 文字"],
    manualFieldLines: ["`testCases` は利用者が用意する"],
    roundTripLines: ["derivedFrom 未解決参照: ペイロード再実行 0 件 / 上流入力 0 件"],
    findings: [],
    ...overrides,
  };
}

describe("handoverPayloadCriteria", () => {
  it("declares HPO-01 to HPO-05 with unique ids", () => {
    expect(handoverPayloadCriteria.map((c) => c.id)).toEqual([
      "HPO-01",
      "HPO-02",
      "HPO-03",
      "HPO-04",
      "HPO-05",
    ]);
  });

  it("marks HPO-01..HPO-04 as high and HPO-05 as medium", () => {
    const byId = new Map(handoverPayloadCriteria.map((c) => [c.id, c]));
    for (const id of ["HPO-01", "HPO-02", "HPO-03", "HPO-04"]) {
      expect(byId.get(id)?.severity, id).toBe("high");
    }
    expect(byId.get("HPO-05")?.severity).toBe("medium");
  });

  it("gives every category a definition and a recommended action", () => {
    for (const criterion of handoverPayloadCriteria) {
      expect(criterion.definition.length, criterion.id).toBeGreaterThan(0);
      expect(criterion.recommendedAction.length, criterion.id).toBeGreaterThan(0);
      expect(criterion.nameJa.length, criterion.id).toBeGreaterThan(0);
    }
  });
});

describe("renderHandoverPayloadSection", () => {
  it("omits the json block and points at the opt-in flag when emit is false", () => {
    const text = renderHandoverPayloadSection(baseRender(), false);
    expect(text).not.toContain("```json");
    expect(text).toContain("emitHandoverPayload: true を指定すると");
    expect(text).toContain("generate_test_cases 入力JSONの全文を出力する");
  });

  it("emits a parseable json block when emit is true", () => {
    const text = renderHandoverPayloadSection(baseRender(), true);
    expect(text).toContain("```json");
    const match = /```json\n([\s\S]*?)\n```/.exec(text);
    expect(match).not.toBeNull();
    expect(JSON.parse((match as RegExpExecArray)[1])).toEqual({
      testConditions: [{ id: "TC-001" }],
      requirementIds: ["R-001"],
    });
    expect(text).toContain("上記JSONは generate_test_cases の入力としてそのまま渡せる形式である。");
  });

  it("always emits counts, manual fields and round trip lines", () => {
    for (const emit of [false, true]) {
      const text = renderHandoverPayloadSection(baseRender(), emit);
      expect(text).toContain("- テスト条件 1 件 / 生成JSON 52 文字");
      expect(text).toContain("- 利用者が記入する項目: `testCases` は利用者が用意する");
      expect(text).toContain("- derivedFrom 未解決参照: ペイロード再実行 0 件 / 上流入力 0 件");
    }
  });

  it("emits only the unavailable reason when the payload could not be built", () => {
    const text = renderHandoverPayloadSection(
      baseRender({ payload: undefined, unavailableReason: "コンテナ数が上限を超えた" }),
      true
    );
    expect(text).toContain("- 未算出（理由: コンテナ数が上限を超えた）");
    expect(text).not.toContain("```json");
    expect(text).not.toContain("テスト条件 1 件");
    expect(text).not.toContain("突き合わせ結果");
  });

  it("reports a match when there is no reconciliation finding", () => {
    const text = renderHandoverPayloadSection(baseRender(), false);
    expect(text).toContain(
      "- 突き合わせ結果: 一致（generate_test_cases の算出ロジックで再計算した値が上流の算出結果と一致）"
    );
  });

  it("still reports a match when only HPO-05 advisories are present", () => {
    const findings: HandoverPayloadFinding[] = [
      { categoryId: "HPO-05", severity: "medium", target: "links", detail: "evidence 未記入 3 件" },
    ];
    const text = renderHandoverPayloadSection(baseRender({ findings }), false);
    expect(text).toContain("- 突き合わせ結果: 一致");
    expect(text).toContain("- [medium] HPO-05 links: evidence 未記入 3 件");
  });

  it("reports a mismatch when a HPO-01..HPO-04 finding is present", () => {
    const findings: HandoverPayloadFinding[] = [
      { categoryId: "HPO-04", severity: "high", target: "nodes", detail: "被覆率が 100% でない" },
    ];
    const text = renderHandoverPayloadSection(baseRender({ findings }), false);
    expect(text).toContain("- 突き合わせ結果: 不一致（HPO-01〜HPO-04 を参照）");
    expect(text).toContain("- [high] HPO-04 nodes: 被覆率が 100% でない");
  });

  it("sorts findings by categoryId ascending and keeps generation order within a category", () => {
    const findings: HandoverPayloadFinding[] = [
      { categoryId: "HPO-05", severity: "medium", target: "b1", detail: "d1" },
      { categoryId: "HPO-01", severity: "high", target: "a1", detail: "d2" },
      { categoryId: "HPO-05", severity: "medium", target: "b2", detail: "d3" },
      { categoryId: "HPO-01", severity: "high", target: "a2", detail: "d4" },
    ];
    expect(sortHandoverPayloadFindings(findings).map((f) => f.target)).toEqual(["a1", "a2", "b1", "b2"]);

    const text = renderHandoverPayloadSection(baseRender({ findings }), false);
    const order = ["a1", "a2", "b1", "b2"].map((t) => text.indexOf(`${t}: `));
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it("counts only HPO-01..HPO-04 as reconciliation mismatches", () => {
    const findings: HandoverPayloadFinding[] = [
      { categoryId: "HPO-05", severity: "medium", target: "b1", detail: "d1" },
      { categoryId: "HPO-02", severity: "high", target: "a1", detail: "d2" },
    ];
    expect(countHandoverMismatchFindings(findings)).toBe(1);
  });

  it("is deterministic: the same input renders the exact same string", () => {
    const findings: HandoverPayloadFinding[] = [
      { categoryId: "HPO-05", severity: "medium", target: "b1", detail: "d1" },
      { categoryId: "HPO-01", severity: "high", target: "a1", detail: "d2" },
    ];
    for (const emit of [false, true]) {
      const first = renderHandoverPayloadSection(baseRender({ findings }), emit);
      const second = renderHandoverPayloadSection(baseRender({ findings }), emit);
      expect(second).toBe(first);
    }
  });
});
