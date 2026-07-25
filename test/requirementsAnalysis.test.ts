import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  aggregateQuantitiesByUnit,
  analyzeTermUsage,
  buildBoundaryCandidates,
  buildDeterministicFindings,
  normalizeTermKey,
  parseQuantity,
  toBoundaryValuesToolInput,
} from "../src/requirementsAnalysis.js";
import { designBoundaryValuesInputShape } from "../src/tools/designBoundaryValues.js";
import type { TestBasisDocument } from "../src/types.js";

const docA: TestBasisDocument = {
  name: "doc-a.md",
  content: [
    "## 3. 購入条件",
    "- W-001 Web購入は利用日の29日後まで可能とする。",
    "- W-002 応答は3秒以内に返すこと。",
    "本項は W-999 を参照する。",
    "## 用語定義",
    "| 用語 | 定義 |",
    "| --- | --- |",
    "| 入場券 | 当日利用可能なチケット |",
    "| サーバ | 予約サービスを提供する機器 |",
  ].join("\n"),
};

const docB: TestBasisDocument = {
  name: "doc-b.md",
  content: [
    "## 2. 購入条件",
    "- W-001 Web購入は利用日の30日後まで可能とする。",
    "- W-003 必要な範囲で適切に通知する。",
    "サーバーの応答は速やかに返す。",
    "入場券の枚数上限は10枚。",
  ].join("\n"),
};

const documents: TestBasisDocument[] = [docA, docB];

describe("parseQuantity", () => {
  it("parses a value with a unit only", () => {
    expect(parseQuantity("29日")).toEqual({ value: 29, unit: "日" });
  });

  it("parses a value with a unit and boundary word", () => {
    expect(parseQuantity("3秒以内")).toEqual({ value: 3, unit: "秒", boundaryWord: "以内" });
  });

  it("parses a value with unit 枚", () => {
    const result = parseQuantity("10枚");
    expect(result.value).toBe(10);
    expect(result.unit).toBe("枚");
  });

  it("returns value null for non-matching strings", () => {
    expect(parseQuantity("該当なし").value).toBeNull();
  });
});

describe("aggregateQuantitiesByUnit", () => {
  const aggregates = aggregateQuantitiesByUnit(documents);

  it("groups the 日 unit across both documents with cross-document variance", () => {
    const day = aggregates.find((a) => a.unit === "日");
    expect(day).toBeDefined();
    expect(day!.numbers).toEqual([29, 30]);
    expect(day!.documents).toHaveLength(2);
    expect(day!.crossDocumentVariance).toBe(true);
  });

  it("does not include time or period kinds", () => {
    for (const agg of aggregates) {
      for (const occ of agg.occurrences) {
        expect(occ.kind).not.toBe("time");
        expect(occ.kind).not.toBe("period");
      }
    }
  });
});

describe("buildBoundaryCandidates", () => {
  const aggregates = aggregateQuantitiesByUnit(documents);
  const candidates = buildBoundaryCandidates(aggregates);

  it("builds a complete candidate for 秒 with boundary word 以内", () => {
    const seconds = candidates.find((c) => c.unit === "秒");
    expect(seconds).toBeDefined();
    expect(seconds!.variable).toMatchObject({ name: "秒", min: 0, max: 3 });
    expect(seconds!.incomplete).toBe(false);
  });

  it("builds a complete candidate for 日 spanning both documents", () => {
    const day = candidates.find((c) => c.unit === "日");
    expect(day).toBeDefined();
    expect(day!.variable).toMatchObject({ name: "日", min: 29, max: 30 });
  });

  it("marks decimal inputs with valueType decimal and a matching step", () => {
    const decimalDocs: TestBasisDocument[] = [
      {
        name: "decimal.md",
        content: ["応答は1.5秒以内に返す。", "応答は2.25秒以内に返す。"].join("\n"),
      },
    ];
    const decimalAggregates = aggregateQuantitiesByUnit(decimalDocs);
    const decimalCandidates = buildBoundaryCandidates(decimalAggregates);
    const seconds = decimalCandidates.find((c) => c.unit === "秒");
    expect(seconds).toBeDefined();
    expect(seconds!.variable.valueType).toBe("decimal");
    expect(seconds!.variable.step).toBe(0.01);
  });

  it("excludes units outside the allowlist such as (単位なし)", () => {
    expect(candidates.some((c) => c.unit === "(単位なし)")).toBe(false);
  });
});

describe("toBoundaryValuesToolInput", () => {
  it("produces output compatible with the design_boundary_values input schema", () => {
    const aggregates = aggregateQuantitiesByUnit(documents);
    const candidates = buildBoundaryCandidates(aggregates);
    const toolInput = toBoundaryValuesToolInput(candidates);

    expect(toolInput.variables.length).toBeGreaterThan(0);
    const result = z.object(designBoundaryValuesInputShape).safeParse(toolInput);
    expect(result.success).toBe(true);
  });
});

describe("normalizeTermKey", () => {
  it("treats サーバー and サーバ as the same key", () => {
    expect(normalizeTermKey("サーバー")).toBe(normalizeTermKey("サーバ"));
  });
});

describe("analyzeTermUsage", () => {
  const findings = analyzeTermUsage(documents);

  it("marks サーバ as variant-suspected due to サーバー usage in doc-b", () => {
    const server = findings.find((f) => f.term === "サーバ");
    expect(server).toBeDefined();
    expect(server!.status).toBe("variant-suspected");
  });

  it("marks 入場券 as ok since it is used verbatim in doc-b", () => {
    const ticket = findings.find((f) => f.term === "入場券");
    expect(ticket).toBeDefined();
    expect(ticket!.status).toBe("ok");
  });

  it("marks an unused defined term as unused", () => {
    const unusedDocs: TestBasisDocument[] = [
      {
        name: "unused.md",
        content: [
          "## 用語定義",
          "| 用語 | 定義 |",
          "| --- | --- |",
          "| 未使用語句 | 本文中では使われない用語 |",
          "本文にはこの用語は登場しません。",
        ].join("\n"),
      },
    ];
    const result = analyzeTermUsage(unusedDocs);
    const term = result.find((f) => f.term === "未使用語句");
    expect(term).toBeDefined();
    expect(term!.status).toBe("unused");
  });

  it("marks a term defined twice as duplicate-definition", () => {
    const dupDocs: TestBasisDocument[] = [
      {
        name: "dup.md",
        content: [
          "## 用語定義",
          "| 用語 | 定義 |",
          "| --- | --- |",
          "| 重複語 | 定義その1 |",
          "## 別の用語定義",
          "| 用語 | 定義 |",
          "| --- | --- |",
          "| 重複語 | 定義その2 |",
          "本文で重複語を利用する。",
        ].join("\n"),
      },
    ];
    const result = analyzeTermUsage(dupDocs);
    const term = result.find((f) => f.term === "重複語");
    expect(term).toBeDefined();
    expect(term!.status).toBe("duplicate-definition");
  });
});

describe("buildDeterministicFindings", () => {
  const findings = buildDeterministicFindings(documents);

  it("numbers findings sequentially starting at F-01 without gaps or duplicates", () => {
    const ids = findings.map((f) => f.id);
    const expected = ids.map((_, i) => `F-${String(i + 1).padStart(2, "0")}`);
    expect(ids).toEqual(expected);
  });

  it("includes the expected finding kinds", () => {
    const kinds = new Set(findings.map((f) => f.kind));
    expect(kinds.has("ID重複")).toBe(true);
    expect(kinds.has("未解決参照")).toBe(true);
    expect(kinds.has("矛盾")).toBe(true);
    expect(kinds.has("表記揺れ")).toBe(true);
    expect(kinds.has("曖昧")).toBe(true);
  });

  it("never leaves place empty", () => {
    for (const f of findings) {
      expect(f.place.trim().length).toBeGreaterThan(0);
    }
  });
});
