import { describe, expect, it } from "vitest";
import { renderDataFlowTiming } from "../src/tools/analyzeDataFlowTiming.js";
import { expectNextToolsSection } from "./nextToolSectionHelper.js";
import type { DataFlowTimingSpec } from "../src/types.js";

// 使用済みチケットのクラウド連携（入場ゲート → 入場管理 → クラウド2、周期60秒）。
function usedTicketSpec(overrides: Partial<DataFlowTimingSpec> = {}): DataFlowTimingSpec {
  return {
    title: "使用済みチケット連携",
    components: [
      { id: "CP-GATE", nameJa: "入場ゲート", kind: "device" },
      { id: "CP-EM", nameJa: "入場管理", kind: "service" },
      { id: "CP-CL2", nameJa: "クラウド2", kind: "cloud" },
    ],
    dataItems: [{ id: "DI-USED", nameJa: "使用済チケット情報" }],
    communications: [
      {
        id: "CM-01",
        fromId: "CP-GATE",
        toId: "CP-EM",
        dataItemIds: ["DI-USED"],
        timing: { kind: "event", trigger: "チケット読み取り" },
        ackKind: "application-ack",
        timeoutSeconds: 3,
        requirementIds: ["REQ-72"],
        sourceRef: { document: "テストベース.md", startLine: 720 },
      },
      {
        id: "CM-02",
        fromId: "CP-EM",
        toId: "CP-CL2",
        dataItemIds: ["DI-USED"],
        timing: { kind: "periodic", intervalSeconds: 60 },
        ackKind: "none",
        sourceRef: { document: "テストベース.md", startLine: 726 },
      },
    ],
    ...overrides,
  };
}

// 残数インジケータ（残数管理 → インジケータ1 は1秒周期、インジケータ2 は30秒周期）。
function remainingCountSpec(overrides: Partial<DataFlowTimingSpec> = {}): DataFlowTimingSpec {
  return {
    title: "残数インジケータ",
    components: [
      { id: "CP-RM", nameJa: "残数管理", kind: "service" },
      { id: "CP-IND1", nameJa: "残数インジケータ1", kind: "device" },
      { id: "CP-IND2", nameJa: "残数インジケータ2", kind: "device" },
    ],
    dataItems: [{ id: "DI-REMAIN", nameJa: "残数" }],
    communications: [
      {
        id: "CM-11",
        fromId: "CP-RM",
        toId: "CP-IND1",
        dataItemIds: ["DI-REMAIN"],
        timing: { kind: "periodic", intervalSeconds: 1 },
        ackKind: "none",
        requirementIds: ["REQ-11"],
        sourceRef: { document: "テストベース.md", startLine: 110 },
      },
      {
        id: "CM-12",
        fromId: "CP-RM",
        toId: "CP-IND2",
        dataItemIds: ["DI-REMAIN"],
        timing: { kind: "periodic", intervalSeconds: 30 },
        ackKind: "none",
        requirementIds: ["REQ-11"],
        sourceRef: { document: "テストベース.md", startLine: 201 },
      },
    ],
    ...overrides,
  };
}

function sectionOf(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.indexOf(heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const endRelative = rest.findIndex((l) => l.startsWith("## ") || l.startsWith("### "));
  return (endRelative === -1 ? rest : rest.slice(0, endRelative)).join("\n");
}

describe("renderDataFlowTiming", () => {
  it("computes a 60 second max propagation delay for the used-ticket cloud linkage", () => {
    const markdown = renderDataFlowTiming(usedTicketSpec());
    const section = sectionOf(markdown, "### 3.1 最大伝播遅延（遅延窓）");

    const row = section
      .split("\n")
      .find((l) => l.startsWith("| DFW:DI-USED:CP-GATE:CP-CL2 |"));
    expect(row).toBeDefined();
    const cells = (row as string).split("|").map((c) => c.trim());
    // | 遅延窓ID | データ項目 | 起点 | 終端 | 最大 | 最小 | クリティカル経路 | 状態 |
    expect(cells[5]).toBe("60");
    expect(cells[7]).toBe("CM-01 → CM-02");
    expect(cells[8]).toBe("算出済");
  });

  it("computes a 30 second max skew between the two remaining-count indicators", () => {
    const markdown = renderDataFlowTiming(remainingCountSpec());
    const section = sectionOf(markdown, "### 3.2 最大乖離時間（乖離窓）");

    const row = section.split("\n").find((l) => l.startsWith("| DSW:DI-REMAIN:CP-RM |"));
    expect(row).toBeDefined();
    const cells = (row as string).split("|").map((c) => c.trim());
    // | 乖離窓ID | データ項目 | 起点 | 観測点数 | 最大乖離時間 | 最遅観測点 | 最速観測点 | 状態 |
    expect(cells[4]).toBe("2");
    expect(cells[5]).toBe("30");
    expect(cells[5]).not.toBe("29");
    expect(cells[8]).toBe("算出済");
  });

  it("flags communications whose timing is undefined as high", () => {
    const spec = usedTicketSpec();
    spec.communications[1] = { ...spec.communications[1], timing: { kind: "undefined" } };
    const markdown = renderDataFlowTiming(spec);

    expect(markdown).toContain("[high] DFT-04 CM-02");
    expect(markdown).toContain("[high] DFT-07 DFW:DI-USED:CP-GATE:CP-CL2");

    const section = sectionOf(markdown, "### 3.1 最大伝播遅延（遅延窓）");
    const row = section.split("\n").find((l) => l.startsWith("| DFW:DI-USED:CP-GATE:CP-CL2 |"));
    expect(row).toContain("未算出(理由:");
    expect(row).toContain("CM-02");
  });

  it("flags communications with no declared ack", () => {
    const spec = usedTicketSpec();
    spec.communications[1] = { ...spec.communications[1], ackKind: undefined };
    const markdown = renderDataFlowTiming(spec);
    expect(markdown).toContain("[medium] DFT-05 CM-02");
  });

  it("flags a test condition that expects immediate reflection against a non-zero delay window", () => {
    const markdown = renderDataFlowTiming(
      usedTicketSpec({
        testConditions: [
          {
            id: "TC-01",
            statement: "使用済み情報がクラウド2へ即時反映されること",
            dataItemIds: ["DI-USED"],
            expectsImmediate: true,
          },
        ],
      })
    );
    const lines = markdown.split("\n").filter((l) => l.startsWith("- [high] DFT-12 TC-01"));
    expect(lines.length).toBeGreaterThan(0);
    const line = lines.find((l) => l.includes("DFW:DI-USED:CP-GATE:CP-CL2"));
    expect(line).toBeDefined();
    expect(line).toContain("60");
  });

  it("flags delay windows no test condition covers", () => {
    const markdown = renderDataFlowTiming(
      remainingCountSpec({
        testConditions: [{ id: "TC-11", statement: "残数が表示されること", coveredDelayWindowIds: [] }],
      })
    );
    expect(markdown).toContain("[medium] DFT-10 DFW:DI-REMAIN:CP-RM:CP-IND2");
    expect(markdown).toContain("[medium] DFT-11 DSW:DI-REMAIN:CP-RM");
  });

  it("rejects a claimed max latency that disagrees with the computed value", () => {
    const markdown = renderDataFlowTiming(
      usedTicketSpec({
        propagationTargets: [
          {
            id: "PT-01",
            dataItemId: "DI-USED",
            originComponentId: "CP-GATE",
            terminalComponentIds: ["CP-CL2"],
            claimedMaxLatencySeconds: 0,
          },
        ],
      })
    );
    const line = markdown.split("\n").find((l) => l.startsWith("- [high] DFT-08 PT-01"));
    expect(line).toBeDefined();
    expect(line).toContain("60");
    expect(sectionOf(markdown, "### 3.3 宣言値との照合")).toContain("不一致");
  });

  it("rejects a declared terminal that is unreachable in the data item subgraph", () => {
    const markdown = renderDataFlowTiming(
      usedTicketSpec({
        propagationTargets: [
          {
            id: "PT-02",
            dataItemId: "DI-USED",
            originComponentId: "CP-CL2",
            terminalComponentIds: ["CP-GATE"],
          },
        ],
      })
    );
    const line = markdown.split("\n").find((l) => l.startsWith("- [high] DFT-09 PT-02"));
    expect(line).toBeDefined();
    expect(line).toContain("CP-GATE");
  });

  it("substantiates the delay window coverage ratio with its denominator and numerator", () => {
    const markdown = renderDataFlowTiming(usedTicketSpec({ claimedDelayWindowCoveragePercent: 100 }));
    const section = sectionOf(markdown, "### 5.2 遅延窓被覆率");
    expect(section).toContain("分母(0秒超かつ算出済みの遅延窓＋乖離窓の件数): 3 件");
    expect(section).toContain(
      "分子(実在するテスト条件の coveredDelayWindowIds から実際に参照されている件数): 0 件"
    );
    expect(section).toContain("遅延窓被覆率: 0%");
    const line = markdown.split("\n").find((l) => l.startsWith("- [high] DFT-20 "));
    expect(line).toBeDefined();
    expect(line).toContain("100%");
  });

  it("renders a deterministic mermaid sequence diagram", () => {
    const spec = usedTicketSpec();
    const markdown = renderDataFlowTiming(spec);
    expect(markdown).toBe(renderDataFlowTiming(usedTicketSpec()));

    const start = markdown.indexOf("```mermaid");
    expect(start).toBeGreaterThanOrEqual(0);
    const diagram = markdown.slice(start, markdown.indexOf("```", start + 10));
    expect(diagram.split("\n")[1]).toBe("sequenceDiagram");
    expect(diagram).toContain("participant CP_GATE as 入場ゲート");
    expect(diagram).toContain("participant CP_EM as 入場管理");
    expect(diagram).toContain("CP_GATE->>CP_EM: CM-01 使用済チケット情報（契機： チケット読み取り）");
    expect(diagram).toContain("CP_EM--)CP_CL2: CM-02 使用済チケット情報（周期： 60秒）");
    expect(diagram).toContain(
      "Note over CP_GATE,CP_CL2: 最大伝播遅延 60秒 (DFW:DI-USED:CP-GATE:CP-CL2)"
    );

    // 周期系のみの入力では event の矢印が現れず、周期系の矢印だけが現れる。
    const remaining = renderDataFlowTiming(remainingCountSpec());
    expect(remaining).toContain("CP_RM--)CP_IND2: CM-12 残数（周期： 30秒）");
  });

  it("emits extract_test_conditions handover rows with source, derivedFrom and technique", () => {
    const markdown = renderDataFlowTiming(usedTicketSpec());
    const section = sectionOf(markdown, "## 7. extract_test_conditions 引き渡し");

    expect(section).toContain("| DFT-DELAY:DI-USED:CP-GATE:CP-CL2 |");
    expect(section).toContain("| DFT-SKEW:DI-USED:CP-GATE |");
    expect(section).toContain("testbase");
    expect(section).toContain("timing-order-test");
    expect(section).toContain("requirement:REQ-72");
    // CM-02 は requirementIds を持たないため、CM-02 だけを経路に持つ候補は未確定になる。
    expect(section).toContain("未確定");
    expect(section).toContain("- [medium] DFT-DELAY:DI-USED:CP-EM:CP-CL2:");
    expect(section).toContain("TPC-08");
  });

  it("emits the fixed heading structure and a single next-tools section", () => {
    const markdown = renderDataFlowTiming(
      usedTicketSpec({
        testConditions: [
          {
            id: "TC-01",
            coveredDelayWindowIds: ["DFW:DI-USED:CP-GATE:CP-CL2"],
          },
        ],
      })
    );
    const headings = markdown.split("\n").filter((l) => /^#{1,3} /.test(l));
    expect(headings).toEqual([
      "# データフロー・タイミング分析結果",
      "## 1. 構成要素・データ項目",
      "### 1.1 構成要素一覧",
      "### 1.2 データ項目一覧",
      "## 2. 通信一覧",
      "## 3. 伝播遅延の算出",
      "### 3.1 最大伝播遅延（遅延窓）",
      "### 3.2 最大乖離時間（乖離窓）",
      "### 3.3 宣言値との照合",
      "## 4. シーケンス図(mermaid)",
      "## 5. テスト条件との突合",
      "### 5.1 遅延窓・乖離窓の被覆",
      "### 5.2 遅延窓被覆率",
      "## 6. 決定的検査",
      "## 7. extract_test_conditions 引き渡し",
      "## 8. サマリ",
      "## 次に実行すべきツール",
    ]);
    expectNextToolsSection(markdown);
  });
});
