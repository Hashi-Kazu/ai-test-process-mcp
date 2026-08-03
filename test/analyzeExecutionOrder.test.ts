import { describe, expect, it } from "vitest";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import {
  computeExecutionOrder,
  renderExecutionOrder,
  DEFAULT_MAX_EXECUTION_NODES,
} from "../src/tools/analyzeExecutionOrder.js";
import type { ExecutionOrderSpec } from "../src/types.js";

function findingsOf(result: ReturnType<typeof computeExecutionOrder>, categoryId: string) {
  return result.findings.filter((f) => f.categoryId === categoryId);
}

describe("computeExecutionOrder", () => {
  it("orders a linear dependency chain A -> B -> C", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [
        { id: "A", dependsOn: [] },
        { id: "B", dependsOn: [{ fromId: "A", reason: "Aの結果を使う" }] },
        { id: "C", dependsOn: [{ fromId: "B", reason: "Bの結果を使う" }] },
      ],
    };
    const result = computeExecutionOrder(spec);
    expect(result.orderedNodeIds).toEqual(["A", "B", "C"]);
    expect(result.waves).toEqual([["A"], ["B"], ["C"]]);
    expect(result.generated).toBe(true);
  });

  it("computes the critical path through a diamond graph with different durations", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [
        { id: "A", durationHours: 1, dependsOn: [] },
        { id: "B", durationHours: 2, dependsOn: [{ fromId: "A", reason: "r" }] },
        { id: "C", durationHours: 5, dependsOn: [{ fromId: "A", reason: "r" }] },
        {
          id: "D",
          durationHours: 1,
          dependsOn: [
            { fromId: "B", reason: "r" },
            { fromId: "C", reason: "r" },
          ],
        },
      ],
    };
    const result = computeExecutionOrder(spec);
    expect(result.criticalPathNodeIds).toEqual(["A", "C", "D"]);
    expect(result.totalDurationHours).toBe(7);
    expect(result.scheduleBasis).toBe("computed");
    const rowB = result.schedule.find((r) => r.nodeId === "B")!;
    expect(rowB.slackHours).toBe(3);
  });

  it("breaks ties deterministically by input order and is stable across repeated runs", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [
        { id: "A", durationHours: 1, dependsOn: [] },
        { id: "B", durationHours: 2, dependsOn: [{ fromId: "A", reason: "r" }] },
        { id: "C", durationHours: 2, dependsOn: [{ fromId: "A", reason: "r" }] },
        {
          id: "D",
          durationHours: 1,
          dependsOn: [
            { fromId: "B", reason: "r" },
            { fromId: "C", reason: "r" },
          ],
        },
      ],
    };
    const result1 = computeExecutionOrder(spec);
    const result2 = computeExecutionOrder(spec);
    expect(result1.criticalPathNodeIds).toEqual(["A", "B", "D"]);
    expect(result1).toEqual(result2);
  });

  it("detects a cycle A -> B -> A and reports EOC-04 with an empty critical path", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [
        { id: "A", dependsOn: [{ fromId: "B", reason: "r" }] },
        { id: "B", dependsOn: [{ fromId: "A", reason: "r" }] },
      ],
    };
    const result = computeExecutionOrder(spec);
    expect(findingsOf(result, "EOC-04")).toHaveLength(1);
    expect(result.cycleNodeIds.sort()).toEqual(["A", "B"]);
    expect(result.representativeCycle.length).toBeGreaterThan(1);
    expect(result.generated).toBe(false);
    expect(result.criticalPathNodeIds).toEqual([]);

    const markdown = renderExecutionOrder(spec);
    const section2to6 = markdown.slice(
      markdown.indexOf("## 2."),
      markdown.indexOf("## 7.")
    );
    expect(section2to6).toContain("未算出(理由:");
  });

  it("flags EOC-05 for nodes with omitted dependsOn but not for an explicit empty array", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [
        { id: "A" },
        { id: "B", dependsOn: [] },
      ],
    };
    const result = computeExecutionOrder(spec);
    expect(findingsOf(result, "EOC-05")).toHaveLength(1);
    expect(result.undeclaredDependencyNodeIds).toEqual(["A"]);
  });

  it("flags EOC-07 when an artifact dependency basis is not backed by the predecessor's produced artifacts", () => {
    const specMissing: ExecutionOrderSpec = {
      nodes: [
        { id: "A", producedArtifactIds: ["ART-01"] },
        { id: "B", dependsOn: [{ fromId: "A", basisKind: "artifact", basisRef: "ART-99", reason: "r" }] },
      ],
    };
    const resultMissing = computeExecutionOrder(specMissing);
    expect(findingsOf(resultMissing, "EOC-07")).toHaveLength(1);

    const specPresent: ExecutionOrderSpec = {
      nodes: [
        { id: "A", producedArtifactIds: ["ART-01"] },
        { id: "B", dependsOn: [{ fromId: "A", basisKind: "artifact", basisRef: "ART-01", reason: "r" }] },
      ],
    };
    const resultPresent = computeExecutionOrder(specPresent);
    expect(findingsOf(resultPresent, "EOC-07")).toHaveLength(0);
  });

  it("flags EOC-12 for overlapping resource requests but not for merely touching intervals", () => {
    const overlapping: ExecutionOrderSpec = {
      resources: [{ id: "RES-01", nameJa: "端末", kind: "device", capacity: 1 }],
      nodes: [
        { id: "A", durationHours: 3, dependsOn: [], requiredResources: [{ resourceId: "RES-01" }] },
        { id: "B", durationHours: 3, dependsOn: [], requiredResources: [{ resourceId: "RES-01" }] },
      ],
    };
    // Force overlap: both start at 0 since neither depends on the other.
    const resultOverlap = computeExecutionOrder(overlapping);
    expect(findingsOf(resultOverlap, "EOC-12")).toHaveLength(1);
    expect(resultOverlap.resourceConflicts).toHaveLength(1);
    expect(resultOverlap.resourceConflicts[0].nodeIds.sort()).toEqual(["A", "B"]);

    const touching: ExecutionOrderSpec = {
      resources: [{ id: "RES-01", nameJa: "端末", kind: "device", capacity: 1 }],
      nodes: [
        { id: "A", durationHours: 2, dependsOn: [], requiredResources: [{ resourceId: "RES-01" }] },
        {
          id: "B",
          durationHours: 2,
          dependsOn: [{ fromId: "A", reason: "r" }],
          requiredResources: [{ resourceId: "RES-01" }],
        },
      ],
    };
    const resultTouching = computeExecutionOrder(touching);
    expect(findingsOf(resultTouching, "EOC-12")).toHaveLength(0);
  });

  it("flags EOC-12 only when three nodes share a resource with capacity 2", () => {
    const spec: ExecutionOrderSpec = {
      resources: [{ id: "RES-01", nameJa: "枠", kind: "environment", capacity: 2 }],
      nodes: [
        { id: "A", durationHours: 5, dependsOn: [], requiredResources: [{ resourceId: "RES-01" }] },
        { id: "B", durationHours: 5, dependsOn: [], requiredResources: [{ resourceId: "RES-01" }] },
        { id: "C", durationHours: 5, dependsOn: [], requiredResources: [{ resourceId: "RES-01" }] },
      ],
    };
    const result = computeExecutionOrder(spec);
    expect(findingsOf(result, "EOC-12")).toHaveLength(1);
    expect(result.resourceConflicts[0].nodeIds.sort()).toEqual(["A", "B", "C"]);
  });

  it("flags EOC-13 when the number of concurrent nodes exceeds maxParallelism", () => {
    const spec: ExecutionOrderSpec = {
      maxParallelism: 1,
      nodes: [
        { id: "A", durationHours: 2, dependsOn: [] },
        { id: "B", durationHours: 2, dependsOn: [] },
      ],
    };
    const result = computeExecutionOrder(spec);
    expect(findingsOf(result, "EOC-13")).toHaveLength(1);
  });

  it("flags EOC-16/EOC-17 for critical path / total duration claim mismatches and clears when matching", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [
        { id: "A", durationHours: 1, dependsOn: [] },
        { id: "B", durationHours: 2, dependsOn: [{ fromId: "A", reason: "r" }] },
      ],
      claimedCriticalPathNodeIds: ["B"],
      claimedTotalDurationHours: 99,
    };
    const mismatchResult = computeExecutionOrder(spec);
    expect(findingsOf(mismatchResult, "EOC-16")).toHaveLength(1);
    expect(findingsOf(mismatchResult, "EOC-17")).toHaveLength(1);

    const matching: ExecutionOrderSpec = {
      ...spec,
      claimedCriticalPathNodeIds: ["A", "B"],
      claimedTotalDurationHours: 3,
    };
    const matchResult = computeExecutionOrder(matching);
    expect(findingsOf(matchResult, "EOC-16")).toHaveLength(0);
    expect(findingsOf(matchResult, "EOC-17")).toHaveLength(0);

    const partial: ExecutionOrderSpec = {
      nodes: [
        { id: "A", durationHours: 1, dependsOn: [] },
        { id: "B", dependsOn: [{ fromId: "A", reason: "r" }] },
      ],
      claimedTotalDurationHours: 1,
    };
    const partialResult = computeExecutionOrder(partial);
    expect(partialResult.scheduleBasis).toBe("partial");
    expect(findingsOf(partialResult, "EOC-17")).toHaveLength(1);
  });

  it("flags EOC-18 and computes coverage when architectureContainerIds includes an unplanned container", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [{ id: "TCN-01", dependsOn: [] }],
      architectureContainerIds: ["TCN-01", "TCN-02"],
    };
    const result = computeExecutionOrder(spec);
    expect(findingsOf(result, "EOC-18")).toHaveLength(1);
    expect(result.unplannedContainerIds).toEqual(["TCN-02"]);
    expect(result.coverage.basis).toBe("computed");
    expect(result.coverage.percent).toBe(50);

    const withClaim: ExecutionOrderSpec = { ...spec, claimedPlannedContainerCoveragePercent: 100 };
    const claimResult = computeExecutionOrder(withClaim);
    expect(findingsOf(claimResult, "EOC-25")).toHaveLength(1);
  });

  it("flags EOC-20/EOC-21 for unmeasurable exit criteria and mismatched SLO references", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [{ id: "A", dependsOn: [] }],
      slos: [{ id: "SLO-01", metric: "defect density", comparator: "<=", threshold: 1, unit: "件/KLOC" }],
      exitCriteria: [
        { id: "EXC-01", statement: "十分にテストされていること" },
        { id: "EXC-02", statement: "全ケース実施済み", sloIds: ["SLO-99"] },
      ],
    };
    const result = computeExecutionOrder(spec);
    expect(findingsOf(result, "EOC-20")).toHaveLength(1);
    const eoc21 = findingsOf(result, "EOC-21");
    // undefined reference (SLO-99) と、被参照ゼロの SLO-01 の双方で発生する
    expect(eoc21.length).toBeGreaterThanOrEqual(2);
  });

  it("flags EOC-22/EOC-23/EOC-24 for monitoring plan issues", () => {
    const noPlan = computeExecutionOrder({ nodes: [{ id: "A", durationHours: 1, dependsOn: [] }] });
    expect(findingsOf(noPlan, "EOC-22")).toHaveLength(1);

    const badPlan = computeExecutionOrder({
      nodes: [{ id: "A", durationHours: 1, dependsOn: [] }],
      monitoringCheckpoints: [
        { id: "MON-01", nameJa: "中間レビュー", atHour: 99, reviewItems: ["進捗"] },
        { id: "MON-02", nameJa: "終了確認", afterNodeIds: ["ZZZ"], reviewItems: ["完了"] },
      ],
    });
    expect(findingsOf(badPlan, "EOC-23").length).toBeGreaterThanOrEqual(2);
    expect(findingsOf(badPlan, "EOC-24")).toHaveLength(2);
  });

  it("skips generation and reports EOC-26 when node count exceeds maxNodes", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [{ id: "A", dependsOn: [] }, { id: "B", dependsOn: [] }],
      maxNodes: 1,
    };
    const result = computeExecutionOrder(spec);
    expect(findingsOf(result, "EOC-26")).toHaveLength(1);
    expect(result.generated).toBe(false);
    expect(result.schedule).toEqual([]);

    const markdown = renderExecutionOrder(spec);
    for (const heading of ["## 2.", "## 3.", "## 4.", "## 5.", "## 6.", "## 7.", "## 8.", "## 9."]) {
      const idx = markdown.indexOf(heading);
      const nextIdx = markdown.indexOf("##", idx + heading.length);
      const block = markdown.slice(idx, nextIdx === -1 ? undefined : nextIdx);
      expect(block).toContain("未算出(理由:");
    }
  });

  it("reports EOC-27 and leaves totalDurationHours undefined when no node declares durationHours", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [
        { id: "A", dependsOn: [] },
        { id: "B", dependsOn: [{ fromId: "A", reason: "r" }] },
      ],
    };
    const result = computeExecutionOrder(spec);
    expect(findingsOf(result, "EOC-27")).toHaveLength(1);
    expect(result.scheduleBasis).toBe("unavailable");
    expect(result.totalDurationHours).toBeUndefined();
  });

  it("respects DEFAULT_MAX_EXECUTION_NODES export", () => {
    expect(DEFAULT_MAX_EXECUTION_NODES).toBeGreaterThan(0);
  });
});

describe("renderExecutionOrder", () => {
  it("includes all 13 section headings and reports no findings for a clean input", () => {
    const spec: ExecutionOrderSpec = {
      nodes: [
        { id: "A", durationHours: 1, dependsOn: [], requiredResources: [] },
        {
          id: "B",
          durationHours: 1,
          dependsOn: [{ fromId: "A", reason: "Aの完了後に実行する" }],
          requiredResources: [],
        },
      ],
      monitoringCheckpoints: [
        { id: "MON-01", nameJa: "完了確認", reviewItems: ["完了状況"], afterNodeIds: ["B"], exitCriterionIds: ["EXC-01"] },
      ],
    };
    const markdown = renderExecutionOrder(spec);
    for (let i = 1; i <= 13; i++) {
      expect(markdown).toMatch(new RegExp(`## ${i}\\. `));
    }
    const section10 = markdown.slice(markdown.indexOf("## 10."), markdown.indexOf("## 11."));
    expect(section10).toContain("- 指摘なし");
  });

  it("lists every EOC-01..EOC-27 category in the catalog section", () => {
    const spec: ExecutionOrderSpec = { nodes: [{ id: "A", durationHours: 1, dependsOn: [] }] };
    const markdown = renderExecutionOrder(spec);
    for (let i = 1; i <= 27; i++) {
      expect(markdown).toContain(`EOC-${String(i).padStart(2, "0")}`);
    }
  });
});

describe("renderExecutionOrder 次に実行すべきツール節", () => {
  it("節が出力中に1回だけ、最後の ## 見出しとして現れる", () => {
    expectNextToolsSection(renderExecutionOrder({ nodes: [{ id: "A", dependsOn: [] }] }));
  });
});
