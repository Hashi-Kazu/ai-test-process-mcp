import { describe, expect, it } from "vitest";
import {
  buildCauseEffectGraph,
  buildDecisionTableSpec,
  buildStructuralBlockingFindings,
  compressCauseEffectRules,
  enumerateCauseEffect,
  findConstraintConsistencyFindings,
  findConstraintShapeFindings,
  findCycleFindings,
  findDeclaredRuleCountFindings,
  findDecisionTableHandoverFindings,
  findEffectVariabilityFindings,
  findGraphCycles,
  findIsolatedCauses,
  findUngroundedNodeQuotes,
  findUnmodeledConnectives,
  findUnmodeledSentences,
  findUnreachableEffects,
  findViolatedCauseConstraintIds,
  renderCauseEffectMermaid,
  splitSpecSentences,
} from "../src/causeEffectAnalysis.js";
import { computeDecisionTableRows } from "../src/tools/designDecisionTable.js";
import type { AnalyzeCauseEffectInput, CauseEffectRule } from "../src/types.js";

function baseInput(overrides: Partial<AnalyzeCauseEffectInput> = {}): AnalyzeCauseEffectInput {
  return {
    sectionId: "SEC-01",
    specText: "会員である場合は送料を無料にする",
    causes: [{ id: "C1", statement: "会員である" }],
    effects: [{ id: "E1", statement: "送料を無料にする" }],
    edges: [{ from: "C1", to: "E1" }],
    ...overrides,
  };
}

function enumerateFor(input: AnalyzeCauseEffectInput) {
  const graph = buildCauseEffectGraph(input);
  const blocking = buildStructuralBlockingFindings(input, graph);
  return { graph, enumeration: enumerateCauseEffect(input, graph, blocking) };
}

describe("buildCauseEffectGraph", () => {
  it("fills default logic / edge kind and stacks incoming-outgoing edges in input order", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
      ],
      intermediateNodes: [{ id: "N1", statement: "合流" }],
      effects: [{ id: "E1", statement: "結果1", logic: "or" }],
      edges: [
        { from: "C1", to: "N1" },
        { from: "C2", to: "N1", kind: "not" },
        { from: "N1", to: "E1" },
      ],
    });

    const graph = buildCauseEffectGraph(input);

    expect(graph.nodes.map((n) => n.id)).toEqual(["C1", "C2", "N1", "E1"]);
    expect(graph.nodeById.get("C1")?.logic).toBe("and");
    expect(graph.nodeById.get("N1")?.logic).toBe("and");
    expect(graph.nodeById.get("E1")?.logic).toBe("or");
    expect(graph.edges.map((e) => e.kind)).toEqual(["identity", "not", "identity"]);
    expect(graph.nodeById.get("N1")?.incoming.map((e) => e.from)).toEqual(["C1", "C2"]);
    expect(graph.nodeById.get("N1")?.outgoing.map((e) => e.to)).toEqual(["E1"]);
    expect(graph.causeIds).toEqual(["C1", "C2"]);
    expect(graph.effectIds).toEqual(["E1"]);
    expect(graph.intermediateIds).toEqual(["N1"]);
  });
});

describe("findIsolatedCauses", () => {
  it("reports causes that have outgoing edges but reach no effect (CEG-04)", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
      ],
      intermediateNodes: [{ id: "N1", statement: "行き止まり" }],
      effects: [{ id: "E1", statement: "結果1" }],
      edges: [
        { from: "C1", to: "N1" },
        { from: "C2", to: "E1" },
      ],
    });

    const findings = findIsolatedCauses(buildCauseEffectGraph(input));

    expect(findings).toHaveLength(1);
    expect(findings[0].categoryId).toBe("CEG-04");
    expect(findings[0].severity).toBe("high");
    expect(findings[0].targetId).toBe("C1");
  });
});

describe("findUnreachableEffects", () => {
  it("reports effects without incoming edges and effects not reachable from any cause (CEG-05)", () => {
    const input = baseInput({
      causes: [{ id: "C1", statement: "原因1" }],
      intermediateNodes: [{ id: "N2", statement: "入辺なしの中間" }],
      effects: [
        { id: "E1", statement: "結果1" },
        { id: "E2", statement: "入辺なし" },
        { id: "E3", statement: "原因に到達しない" },
      ],
      edges: [
        { from: "C1", to: "E1" },
        { from: "N2", to: "E3" },
      ],
    });

    const findings = findUnreachableEffects(buildCauseEffectGraph(input));

    expect(findings.map((f) => f.targetId)).toEqual(["E2", "E3"]);
    for (const f of findings) {
      expect(f.categoryId).toBe("CEG-05");
      expect(f.severity).toBe("high");
    }
  });
});

describe("findGraphCycles", () => {
  it("returns the cycle node path and reports CEG-07", () => {
    const input = baseInput({
      causes: [{ id: "C1", statement: "原因1" }],
      intermediateNodes: [
        { id: "N1", statement: "中間1" },
        { id: "N2", statement: "中間2" },
      ],
      effects: [{ id: "E1", statement: "結果1" }],
      edges: [
        { from: "C1", to: "N1" },
        { from: "N1", to: "N2" },
        { from: "N2", to: "N1" },
        { from: "N1", to: "E1" },
      ],
    });
    const graph = buildCauseEffectGraph(input);

    expect(findGraphCycles(graph)).toEqual([{ path: ["N1", "N2", "N1"] }]);

    const findings = findCycleFindings(graph);
    expect(findings).toHaveLength(1);
    expect(findings[0].categoryId).toBe("CEG-07");
    expect(findings[0].detail).toContain("N1 → N2 → N1");
  });
});

describe("findConstraintShapeFindings", () => {
  it("reports effect nodes in exclusive, three-element requires and cause nodes in masks (CEG-08)", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
        { id: "C3", statement: "原因3" },
      ],
      effects: [
        { id: "E1", statement: "結果1" },
        { id: "E2", statement: "結果2" },
      ],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
        { from: "C3", to: "E2" },
      ],
      constraints: [
        { id: "CN1", type: "exclusive", nodeIds: ["C1", "E1"] },
        { id: "CN2", type: "requires", nodeIds: ["C1", "C2", "C3"] },
        { id: "CN3", type: "masks", nodeIds: ["C1", "E2"] },
      ],
    });

    const findings = findConstraintShapeFindings(input, buildCauseEffectGraph(input));

    for (const f of findings) {
      expect(f.categoryId).toBe("CEG-08");
      expect(f.severity).toBe("high");
    }
    const cn1 = findings.filter((f) => f.targetId === "CN1");
    expect(cn1).toHaveLength(1);
    expect(cn1[0].detail).toContain("E1");
    const cn2 = findings.filter((f) => f.targetId === "CN2");
    expect(cn2).toHaveLength(1);
    expect(cn2[0].detail).toContain("3 件");
    const cn3 = findings.filter((f) => f.targetId === "CN3");
    expect(cn3).toHaveLength(1);
    expect(cn3[0].detail).toContain("C1");
  });
});

describe("enumerateCauseEffect", () => {
  it("counts 2 valid combinations out of 4 for two causes with an onlyOne constraint", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
      ],
      effects: [{ id: "E1", statement: "結果1", logic: "or" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
      ],
      constraints: [{ id: "CN1", type: "onlyOne", nodeIds: ["C1", "C2"] }],
    });

    const { enumeration } = enumerateFor(input);

    expect(enumeration.enumerated).toBe(true);
    expect(enumeration.theoreticalCombinationCount).toBe(4);
    expect(enumeration.validCombinationCount).toBe(2);
    expect(enumeration.rules.map((r) => r.causeValues)).toEqual([
      { C1: "F", C2: "T" },
      { C1: "T", C2: "F" },
    ]);
  });

  it("reports CEG-09 when mutually contradictory constraints leave zero valid combinations", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
      ],
      effects: [{ id: "E1", statement: "結果1", logic: "or" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
      ],
      constraints: [
        { id: "CN1", type: "requires", nodeIds: ["C1", "C2"] },
        { id: "CN2", type: "requires", nodeIds: ["C2", "C1"] },
        { id: "CN3", type: "exclusive", nodeIds: ["C1", "C2"] },
        { id: "CN4", type: "inclusive", nodeIds: ["C1", "C2"] },
      ],
    });

    const { graph, enumeration } = enumerateFor(input);

    expect(enumeration.enumerated).toBe(true);
    expect(enumeration.validCombinationCount).toBe(0);
    expect(enumeration.rules).toEqual([]);

    const findings = findConstraintConsistencyFindings(input, graph, enumeration);
    const ceg09 = findings.filter((f) => f.categoryId === "CEG-09");
    expect(ceg09).toHaveLength(1);
    expect(ceg09[0].severity).toBe("high");
    expect(ceg09[0].detail).toContain("4");
  });

  it("evaluates not edges and or logic correctly", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
      ],
      effects: [{ id: "E1", statement: "結果1", logic: "or" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1", kind: "not" },
      ],
    });

    const { enumeration } = enumerateFor(input);

    expect(enumeration.rules.map((r) => ({ ...r.causeValues, ...r.effectValues }))).toEqual([
      { C1: "F", C2: "F", E1: "T" },
      { C1: "F", C2: "T", E1: "F" },
      { C1: "T", C2: "F", E1: "T" },
      { C1: "T", C2: "T", E1: "T" },
    ]);
  });

  it("marks masked effect values as '-' when the masking effect is true", () => {
    const input = baseInput({
      causes: [{ id: "C1", statement: "原因1" }],
      effects: [
        { id: "E1", statement: "結果1" },
        { id: "E2", statement: "結果2" },
      ],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C1", to: "E2", kind: "not" },
      ],
      constraints: [{ id: "CN1", type: "masks", nodeIds: ["E1", "E2"] }],
    });

    const { enumeration } = enumerateFor(input);

    expect(enumeration.rules.map((r) => ({ ...r.causeValues, ...r.effectValues }))).toEqual([
      { C1: "F", E1: "F", E2: "T" },
      { C1: "T", E1: "T", E2: "-" },
    ]);
  });

  it("skips full enumeration when the cause count exceeds maxEnumerationCauses", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
        { id: "C3", statement: "原因3" },
      ],
      effects: [{ id: "E1", statement: "結果1", logic: "or" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
        { from: "C3", to: "E1" },
      ],
      maxEnumerationCauses: 2,
    });

    const { enumeration } = enumerateFor(input);

    expect(enumeration.enumerated).toBe(false);
    expect(enumeration.skipReason).toContain("上限");
    expect(enumeration.rules).toEqual([]);
    expect(enumeration.compressedRules).toEqual([]);
    expect(enumeration.validCombinationCount).toBe(0);
    expect(enumeration.theoreticalCombinationCount).toBe(8);
  });
});

describe("findConstraintConsistencyFindings", () => {
  it("reports a cause that constraints pin to a single value as CEG-10", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
      ],
      effects: [{ id: "E1", statement: "結果1", logic: "or" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
      ],
      constraints: [
        { id: "CN1", type: "requires", nodeIds: ["C1", "C2"] },
        { id: "CN2", type: "exclusive", nodeIds: ["C1", "C2"] },
      ],
    });

    const { graph, enumeration } = enumerateFor(input);
    const findings = findConstraintConsistencyFindings(input, graph, enumeration);
    const ceg10 = findings.filter((f) => f.categoryId === "CEG-10");

    expect(enumeration.validCombinationCount).toBe(2);
    expect(ceg10).toHaveLength(1);
    expect(ceg10[0].targetId).toBe("C1");
    expect(ceg10[0].severity).toBe("high");
    expect(ceg10[0].detail).toContain("F");
  });

  it("reports a constraint implied by another one as CEG-11 / info", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
      ],
      effects: [{ id: "E1", statement: "結果1", logic: "or" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
      ],
      constraints: [
        { id: "CN1", type: "onlyOne", nodeIds: ["C1", "C2"] },
        { id: "CN2", type: "exclusive", nodeIds: ["C1", "C2"] },
      ],
    });

    const { graph, enumeration } = enumerateFor(input);
    const ceg11 = findConstraintConsistencyFindings(input, graph, enumeration).filter(
      (f) => f.categoryId === "CEG-11"
    );

    expect(ceg11).toHaveLength(1);
    expect(ceg11[0].targetId).toBe("CN2");
    expect(ceg11[0].severity).toBe("info");
  });
});

describe("compressCauseEffectRules", () => {
  it("folds two rules that differ in exactly one cause into '-' and is deterministic", () => {
    const rules: CauseEffectRule[] = [
      { no: 1, causeValues: { C1: "T", C2: "T" }, effectValues: { E1: "T" } },
      { no: 2, causeValues: { C1: "T", C2: "F" }, effectValues: { E1: "T" } },
      { no: 3, causeValues: { C1: "F", C2: "T" }, effectValues: { E1: "F" } },
      { no: 4, causeValues: { C1: "F", C2: "F" }, effectValues: { E1: "F" } },
    ];

    const first = compressCauseEffectRules(rules, ["C1", "C2"]);
    const second = compressCauseEffectRules(rules, ["C1", "C2"]);

    expect(first).toEqual([
      { no: 1, causeValues: { C1: "T", C2: "-" }, effectValues: { E1: "T" } },
      { no: 2, causeValues: { C1: "F", C2: "-" }, effectValues: { E1: "F" } },
    ]);
    expect(second).toEqual(first);
    // 入力を破壊しない
    expect(rules[0].causeValues).toEqual({ C1: "T", C2: "T" });
  });
});

describe("findEffectVariabilityFindings", () => {
  it("reports an always-false effect as CEG-12 and an always-true effect as CEG-13", () => {
    const input = baseInput({
      causes: [{ id: "C1", statement: "原因1" }],
      effects: [
        { id: "E1", statement: "常に偽", logic: "and" },
        { id: "E2", statement: "常に真", logic: "or" },
      ],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C1", to: "E1", kind: "not" },
        { from: "C1", to: "E2" },
        { from: "C1", to: "E2", kind: "not" },
      ],
    });

    const { graph, enumeration } = enumerateFor(input);
    const findings = findEffectVariabilityFindings(enumeration, graph);

    expect(findings).toHaveLength(2);
    expect(findings[0].categoryId).toBe("CEG-12");
    expect(findings[0].severity).toBe("high");
    expect(findings[0].targetId).toBe("E1");
    expect(findings[1].categoryId).toBe("CEG-13");
    expect(findings[1].severity).toBe("medium");
    expect(findings[1].targetId).toBe("E2");
  });
});

describe("findUngroundedNodeQuotes", () => {
  it("reports quotes absent from specText as CEG-14 and missing quotes as CEG-15", () => {
    const input = baseInput({
      specText: "金額が１０００円以上の場合、送料は無料とする。",
      causes: [
        { id: "C1", statement: "金額が1000円以上", quote: "金額が 1000 円以上" },
        { id: "C2", statement: "存在しない条件", quote: "会員ランクがゴールドである" },
      ],
      effects: [{ id: "E1", statement: "送料無料" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
      ],
    });

    const findings = findUngroundedNodeQuotes(input);

    expect(findings).toHaveLength(2);
    // 全角/半角・空白差は normalizeForGrounding により一致する
    expect(findings.some((f) => f.targetId === "C1")).toBe(false);
    const ceg14 = findings.filter((f) => f.categoryId === "CEG-14");
    expect(ceg14).toHaveLength(1);
    expect(ceg14[0].targetId).toBe("C2");
    expect(ceg14[0].severity).toBe("high");
    const ceg15 = findings.filter((f) => f.categoryId === "CEG-15");
    expect(ceg15).toHaveLength(1);
    expect(ceg15[0].targetId).toBe("E1");
    expect(ceg15[0].severity).toBe("medium");
  });
});

describe("splitSpecSentences + findUnmodeledSentences", () => {
  it("enumerates every unmodeled sentence as CEG-16", () => {
    const input = baseInput({
      specText: "会員である場合は送料を無料にする。返品期限は14日以内とする。ポイントは購入金額の1%を付与する。",
      causes: [{ id: "C1", statement: "会員である", quote: "会員である場合" }],
      effects: [{ id: "E1", statement: "送料無料", quote: "送料を無料にする" }],
      edges: [{ from: "C1", to: "E1" }],
    });

    const sentences = splitSpecSentences(input.specText);
    expect(sentences.map((s) => s.no)).toEqual([1, 2, 3]);

    const findings = findUnmodeledSentences(input, sentences);

    expect(sentences[0].modeled).toBe(true);
    expect(sentences[0].nodeIds).toEqual(["C1", "E1"]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.targetId)).toEqual(["文2", "文3"]);
    for (const f of findings) {
      expect(f.categoryId).toBe("CEG-16");
      expect(f.severity).toBe("medium");
    }
    expect(findings[0].detail).toContain("返品期限は14日以内とする");
  });
});

describe("findUnmodeledConnectives", () => {
  it("reports a sentence with a connective that maps to a single node without any logical junction", () => {
    const input = baseInput({
      specText: "会員かつ初回購入の場合は割引する",
      causes: [{ id: "C1", statement: "会員かつ初回購入", quote: "会員かつ初回購入の場合は割引する" }],
      effects: [{ id: "E1", statement: "割引する" }],
      edges: [{ from: "C1", to: "E1" }],
    });

    const graph = buildCauseEffectGraph(input);
    const sentences = splitSpecSentences(input.specText);
    findUnmodeledSentences(input, sentences);

    const findings = findUnmodeledConnectives(input, graph, sentences);

    expect(findings).toHaveLength(1);
    expect(findings[0].categoryId).toBe("CEG-17");
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].detail).toContain("かつ");
  });

  it("does not report a sentence whose node has an AND junction of two incoming edges", () => {
    const input = baseInput({
      specText: "会員かつ初回購入の場合は割引する",
      causes: [
        { id: "C1", statement: "会員である" },
        { id: "C2", statement: "初回購入である" },
      ],
      effects: [{ id: "E1", statement: "割引する", quote: "会員かつ初回購入の場合は割引する" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
      ],
    });

    const graph = buildCauseEffectGraph(input);
    const sentences = splitSpecSentences(input.specText);
    findUnmodeledSentences(input, sentences);

    expect(findUnmodeledConnectives(input, graph, sentences)).toEqual([]);
  });
});

describe("findDeclaredRuleCountFindings", () => {
  it("reports a mismatch between the declared and the enumerated rule count as CEG-19", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
      ],
      effects: [{ id: "E1", statement: "結果1", logic: "or" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
      ],
      expectedRuleCount: 3,
    });

    const { enumeration } = enumerateFor(input);
    const findings = findDeclaredRuleCountFindings(input, enumeration);

    expect(findings).toHaveLength(1);
    expect(findings[0].categoryId).toBe("CEG-19");
    expect(findings[0].severity).toBe("high");
    expect(findings[0].detail).toContain("3");
    expect(findings[0].detail).toContain("4");

    const matching = { ...input, expectedRuleCount: 4 };
    expect(findDeclaredRuleCountFindings(matching, enumerateFor(matching).enumeration)).toEqual([]);
  });
});

describe("renderCauseEffectMermaid", () => {
  it("renders a deterministic flowchart with cause / effect shapes, not edges and constraint links", () => {
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
      ],
      intermediateNodes: [{ id: "N1", statement: "合流", logic: "or" }],
      effects: [{ id: "E1", statement: "結果1" }],
      edges: [
        { from: "C1", to: "N1" },
        { from: "C2", to: "N1", kind: "not" },
        { from: "N1", to: "E1" },
      ],
      constraints: [{ id: "CN1", type: "exclusive", nodeIds: ["C1", "C2"] }],
    });
    const graph = buildCauseEffectGraph(input);

    const mermaid = renderCauseEffectMermaid(graph, input.constraints ?? []);

    expect(mermaid.split("\n")[0]).toBe("flowchart LR");
    expect(mermaid).toContain('C1(["C1: 原因1"])');
    expect(mermaid).toContain('N1{{"N1: OR"}}');
    expect(mermaid).toContain('E1["E1: 結果1"]');
    expect(mermaid).toContain("C1 --> N1");
    expect(mermaid).toContain("C2 -. NOT .-> N1");
    expect(mermaid).toContain("%% 制約");
    expect(mermaid).toContain("C1 -. E .-> C2");
    expect(renderCauseEffectMermaid(graph, input.constraints ?? [])).toBe(mermaid);
  });
});

describe("findViolatedCauseConstraintIds", () => {
  it("returns the ids of violated constraints and keeps satisfiesCauseConstraints behaviour", () => {
    const constraints: AnalyzeCauseEffectInput["constraints"] = [
      { id: "CN1", type: "exclusive", nodeIds: ["C1", "C2"] },
      { id: "CN2", type: "requires", nodeIds: ["C1", "C3"] },
    ];

    // C1,C2 both true -> violates exclusive CN1. C1 true, C3 false -> violates requires CN2.
    const violating = new Map([
      ["C1", true],
      ["C2", true],
      ["C3", false],
    ]);
    expect(findViolatedCauseConstraintIds(violating, constraints ?? [])).toEqual(["CN1", "CN2"]);

    const satisfying = new Map([
      ["C1", true],
      ["C2", false],
      ["C3", true],
    ]);
    expect(findViolatedCauseConstraintIds(satisfying, constraints ?? [])).toEqual([]);

    // Cross-check against the enumeration behaviour driven by satisfiesCauseConstraints internally.
    const input = baseInput({
      causes: [
        { id: "C1", statement: "原因1" },
        { id: "C2", statement: "原因2" },
      ],
      effects: [{ id: "E1", statement: "結果1", logic: "or" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
      ],
      constraints: [{ id: "CN1", type: "exclusive", nodeIds: ["C1", "C2"] }],
    });
    const { enumeration } = enumerateFor(input);
    expect(enumeration.validCombinationCount).toBe(3);
  });
});

describe("buildDecisionTableSpec", () => {
  const twoCauseInput = (): AnalyzeCauseEffectInput =>
    baseInput({
      sectionId: "SEC-01",
      sectionTitle: "送料計算",
      causes: [
        { id: "C1", statement: "会員である" },
        { id: "C2", statement: "クーポンを保持する" },
      ],
      effects: [{ id: "E1", statement: "送料を無料にする", logic: "or" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
      ],
      constraints: [{ id: "CN1", type: "onlyOne", nodeIds: ["C1", "C2"] }],
    });

  it("returns a DecisionTableSpec with T/F levels, constraint-derived invalidCombinations and compressed rules", () => {
    const input = twoCauseInput();
    const { graph, enumeration } = enumerateFor(input);

    const spec = buildDecisionTableSpec(input, graph, enumeration);

    expect(spec).toBeDefined();
    expect(spec?.tableId).toBe("SEC-01");
    expect(spec?.title).toBe("送料計算");
    expect(spec?.conditions).toEqual([
      { id: "C1", statement: "会員である", levels: ["T", "F"] },
      { id: "C2", statement: "クーポンを保持する", levels: ["T", "F"] },
    ]);
    expect(spec?.actions).toEqual([{ id: "E1", statement: "送料を無料にする" }]);

    // onlyOne(C1, C2) is violated by (T,T) and (F,F).
    expect(spec?.invalidCombinations).toHaveLength(2);
    for (const invalid of spec?.invalidCombinations ?? []) {
      expect(invalid.reason).toContain("CN1");
    }

    expect(spec?.rules).toEqual(
      enumeration.compressedRules.map((rule) => ({
        id: `R${rule.no}`,
        when: Object.fromEntries(
          Object.entries(rule.causeValues).filter(([, v]) => v !== "-")
        ),
        actions: Object.fromEntries(
          Object.entries(rule.effectValues).map(([id, v]) => [id, v === "T" ? "Y" : v === "F" ? "N" : "-"])
        ),
      }))
    );
  });

  it("returns undefined when enumeration was skipped or causes/effects are empty", () => {
    const skippedInput = twoCauseInput();
    const skippedGraph = buildCauseEffectGraph(skippedInput);
    const skippedEnumeration = enumerateCauseEffect(
      { ...skippedInput, maxEnumerationCauses: 1 },
      skippedGraph,
      []
    );
    expect(buildDecisionTableSpec(skippedInput, skippedGraph, skippedEnumeration)).toBeUndefined();

    const noEffectsInput: AnalyzeCauseEffectInput = {
      sectionId: "SEC-02",
      specText: "対象なし",
      causes: [{ id: "C1", statement: "原因1" }],
      effects: [],
      edges: [],
    };
    const noEffectsGraph = buildCauseEffectGraph(noEffectsInput);
    const noEffectsEnumeration = enumerateCauseEffect(noEffectsInput, noEffectsGraph, []);
    expect(buildDecisionTableSpec(noEffectsInput, noEffectsGraph, noEffectsEnumeration)).toBeUndefined();
  });
});

describe("findDecisionTableHandoverFindings", () => {
  const twoCauseInput = (): AnalyzeCauseEffectInput =>
    baseInput({
      sectionId: "SEC-01",
      causes: [
        { id: "C1", statement: "会員である" },
        { id: "C2", statement: "クーポンを保持する" },
      ],
      effects: [{ id: "E1", statement: "送料を無料にする", logic: "or" }],
      edges: [
        { from: "C1", to: "E1" },
        { from: "C2", to: "E1" },
      ],
    });

  it("returns no findings for a spec built from the same enumeration", () => {
    const input = twoCauseInput();
    const { graph, enumeration } = enumerateFor(input);
    const spec = buildDecisionTableSpec(input, graph, enumeration);
    expect(spec).toBeDefined();

    const result = computeDecisionTableRows(spec!);
    const findings = findDecisionTableHandoverFindings(enumeration, spec!, result);

    expect(findings).toEqual([]);
  });

  it("reports CEG-20 when the decision table result disagrees with the enumeration", () => {
    const input = twoCauseInput();
    const { graph, enumeration } = enumerateFor(input);
    const spec = buildDecisionTableSpec(input, graph, enumeration);
    expect(spec).toBeDefined();

    const result = computeDecisionTableRows(spec!);
    const tamperedResult = { ...result, validCombinationCount: result.validCombinationCount + 1 };

    const findings = findDecisionTableHandoverFindings(enumeration, spec!, tamperedResult);

    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.categoryId).toBe("CEG-20");
      expect(f.severity).toBe("high");
    }
  });
});
