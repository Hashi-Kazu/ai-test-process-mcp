import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { deriveTestPurposesInputShape } from "../src/tools/deriveTestPurposes.js";
import { designTestArchitectureInputShape } from "../src/tools/designTestArchitecture.js";
import { auditCrossMatrixInputShape } from "../src/tools/auditCrossMatrix.js";
import { auditDeliverableConsistencyInputShape } from "../src/tools/auditDeliverableConsistency.js";
import { auditCoverageBalanceInputShape } from "../src/tools/auditCoverageBalance.js";
import { auditTestDesignNotationsInputShape } from "../src/tools/auditTestDesignNotations.js";

/**
 * GitHub Issue #215 / Jira HSKZ-219。
 * 指標13〜18 のプローブ payload（6ツール × 2年度 = 12本）と、
 * `docs/ai/regression-baseline.md` 第5章 指標13〜18 の記入状態を決定的に検査する。
 */

const YEARS = ["2025", "2024"] as const;

const TOOLS = [
  { file: "derive-test-purposes.json", shape: deriveTestPurposesInputShape },
  { file: "design-test-architecture.json", shape: designTestArchitectureInputShape },
  { file: "audit-cross-matrix.json", shape: auditCrossMatrixInputShape },
  { file: "audit-deliverable-consistency.json", shape: auditDeliverableConsistencyInputShape },
  { file: "audit-coverage-balance.json", shape: auditCoverageBalanceInputShape },
  { file: "audit-test-design-notations.json", shape: auditTestDesignNotationsInputShape },
] as const;

const payloadPath = (year: string, file: string): string =>
  path.join("sample", "contest_testbase", year, "payloads", file);

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

/** 実行時に `scripts/call-mcp-tool.mjs` が注入するキーを、スキーマ検証のためだけに補う。 */
function withInjectedKeys(year: string, file: string, payload: Record<string, unknown>): unknown {
  if (file === "audit-coverage-balance.json") {
    return { ...payload, testCases: readJson(payloadPath(year, "test-cases.json")) };
  }
  if (file === "audit-deliverable-consistency.json") {
    return {
      ...payload,
      deliverables: [
        { name: "dummy-a.md", kind: "test-plan", content: "# dummy a" },
        { name: "dummy-b.md", kind: "test-design", content: "# dummy b" },
      ],
    };
  }
  return payload;
}

describe("指標13〜18 のプローブ payload（Issue #215）", () => {
  for (const year of YEARS) {
    for (const tool of TOOLS) {
      it(`${year}/${tool.file} が存在し、対応ツールの入力スキーマを通る`, () => {
        const payload = readJson(payloadPath(year, tool.file)) as Record<string, unknown>;
        expect(typeof payload).toBe("object");
        expect(payload).not.toBeNull();
        const parsed = z.object(tool.shape).safeParse(withInjectedKeys(year, tool.file, payload));
        if (!parsed.success) {
          throw new Error(
            `${year}/${tool.file} did not satisfy the input schema:\n${JSON.stringify(
              parsed.error.issues,
              null,
              2
            )}`
          );
        }
      });
    }
  }

  it("2025年版 payload が指標20向けの最小プローブのままではない", () => {
    const purposes = readJson(payloadPath("2025", "derive-test-purposes.json")) as {
      testConditions?: unknown[];
    };
    expect(purposes.testConditions?.length ?? 0).toBeGreaterThanOrEqual(50);

    const notations = readJson(payloadPath("2025", "audit-test-design-notations.json")) as {
      testConditionIds?: unknown[];
    };
    expect(notations.testConditionIds?.length ?? 0).toBeGreaterThanOrEqual(50);

    const matrix = readJson(payloadPath("2025", "audit-cross-matrix.json")) as {
      axes: { items: unknown[] }[];
    };
    const itemTotal = matrix.axes.reduce((sum, axis) => sum + axis.items.length, 0);
    expect(itemTotal).toBeGreaterThanOrEqual(50);
  });

  it("2024年版 payload にV02構成へ存在しない「ゲートハブ」が混入していない", () => {
    for (const tool of TOOLS) {
      const raw = readFileSync(payloadPath("2024", tool.file), "utf8");
      expect(
        raw.includes("ゲートハブ"),
        `2024/${tool.file} contains "ゲートハブ", which does not exist in the V02 configuration`
      ).toBe(false);
    }
  });
});

describe("docs/ai/regression-baseline.md 第5章 指標13〜18", () => {
  const doc = readFileSync(path.join("docs", "ai", "regression-baseline.md"), "utf8");

  /** 「### 指標13:」から「### 指標19:」の直前までを切り出す。 */
  const section = ((): string => {
    const start = doc.indexOf("### 指標13:");
    const end = doc.indexOf("### 指標19:");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return doc.slice(start, end);
  })();

  it("「未測定」と「プローブ payload 未整備」が1件も残っていない", () => {
    expect(section.includes("未測定")).toBe(false);
    expect(section.includes("プローブ payload 未整備")).toBe(false);
  });

  it("指標13〜18 の6見出しがこの範囲に揃っている", () => {
    for (const n of [13, 14, 15, 16, 17, 18]) {
      expect(section.includes(`### 指標${n}:`)).toBe(true);
    }
  });

  it("6つの対比表がすべて 2025年版 / 2024年版（生） 列を持ち、データ行に空セルが無い", () => {
    const headerLine = "| 項目 | 2025年版 | 2024年版（生） | 2024年版（除去） | 差の解釈 |";
    const lines = section.split("\n");
    const headerIndexes = lines
      .map((line, i) => (line.trim() === headerLine ? i : -1))
      .filter((i) => i >= 0);
    expect(headerIndexes).toHaveLength(6);

    for (const headerIndex of headerIndexes) {
      // ヘッダの直後は区切り行、その次からデータ行
      expect(lines[headerIndex + 1].trim().startsWith("| ---")).toBe(true);
      let dataRowCount = 0;
      for (let i = headerIndex + 2; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (!line.startsWith("|")) break;
        const cells = line.slice(1, line.endsWith("|") ? -1 : undefined).split(" | ");
        expect(cells).toHaveLength(5);
        for (const cell of cells) {
          expect(cell.trim().length, `empty cell in table row: ${line}`).toBeGreaterThan(0);
        }
        dataRowCount += 1;
      }
      expect(dataRowCount).toBeGreaterThan(0);
    }
  });
});
