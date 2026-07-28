import { describe, expect, it } from "vitest";
import {
  buildDefinedIdIndex,
  buildDocumentPopulationStats,
  buildIdPopulationMatrix,
  buildPopulationDiff,
  findExcludedIds,
  findMissingDocuments,
  findNeverDeclaredIds,
  findUndefinedPopulationIds,
  populationLabel,
  summarizeIdPopulation,
} from "../src/idPopulationAnalysis.js";
import type { DeclaredIdPopulation, TestBasisDocument } from "../src/types.js";

const documents: TestBasisDocument[] = [
  {
    name: "doc-A",
    content: ["# doc-A", "EH-100 発券機起動", "EH-101 発券機停止"].join("\n"),
  },
  {
    name: "doc-B",
    content: ["# doc-B", "W-001 警告表示", "W-002 警告解除"].join("\n"),
  },
];

const defined = buildDefinedIdIndex(documents);

const populationsBase: DeclaredIdPopulation[] = [
  { toolName: "extract_test_conditions", ids: ["EH-100", "EH-101"] },
];

describe("buildDefinedIdIndex", () => {
  it("extracts 4 defined ids across both documents", () => {
    expect(defined.map((d) => d.id)).toEqual(["EH-100", "EH-101", "W-001", "W-002"]);
  });
});

describe("buildIdPopulationMatrix / findNeverDeclaredIds", () => {
  it("detects test-basis-defined ids never passed to any population (V03/V04 shrinkage reproduction)", () => {
    const rows = buildIdPopulationMatrix(defined, populationsBase);
    const never = findNeverDeclaredIds(rows);
    expect(never.map((r) => r.id)).toEqual(["W-001", "W-002"]);
  });

  it("marks excluded ids with a reason and removes them from never-declared", () => {
    const rows = buildIdPopulationMatrix(defined, populationsBase, [
      { id: "W-002", reason: "対象外機能のため監査除外" },
    ]);
    const w002 = rows.find((r) => r.id === "W-002");
    expect(w002?.status).toBe("excluded");
    expect(w002?.exclusionReason).toBe("対象外機能のため監査除外");
    expect(findNeverDeclaredIds(rows).map((r) => r.id)).toEqual(["W-001"]);
    expect(findExcludedIds(rows).map((r) => r.id)).toEqual(["W-002"]);
  });

  it("prioritizes 'declared' over an exclusion declaration when the id is actually passed", () => {
    const rows = buildIdPopulationMatrix(
      defined,
      [{ toolName: "extract_test_conditions", ids: ["EH-100", "EH-101", "W-002"] }],
      [{ id: "W-002", reason: "対象外のはずだった" }]
    );
    const w002 = rows.find((r) => r.id === "W-002");
    expect(w002?.status).toBe("declared");
  });
});

describe("findUndefinedPopulationIds", () => {
  it("detects ids that only exist in a population but not in the test basis", () => {
    const populations: DeclaredIdPopulation[] = [
      { toolName: "extract_test_conditions", ids: ["EH-100", "X-999"] },
    ];
    const undefinedIds = findUndefinedPopulationIds(defined, populations);
    expect(undefinedIds).toEqual([{ id: "X-999", populations: ["extract_test_conditions"] }]);
  });
});

describe("buildDocumentPopulationStats", () => {
  it("sets doc-B's declarationRate to 0 and doc-A's to 100", () => {
    const rows = buildIdPopulationMatrix(defined, populationsBase);
    const stats = buildDocumentPopulationStats(rows, documents);
    const docA = stats.find((s) => s.document === "doc-A");
    const docB = stats.find((s) => s.document === "doc-B");
    expect(docA?.declarationRate).toBe(100);
    expect(docB?.declarationRate).toBe(0);
  });
});

describe("findMissingDocuments", () => {
  it("returns missing documents in expectedDocumentNames order", () => {
    const expected = ["doc-A", "doc-X", "doc-B", "doc-Y", "doc-Z", "doc-W", "doc-V", "doc-U", "doc-T"];
    const fourDocs: TestBasisDocument[] = [
      ...documents,
      { name: "doc-X", content: "" },
      { name: "doc-Y", content: "" },
    ];
    const missing = findMissingDocuments(fourDocs, expected);
    expect(missing).toEqual(["doc-Z", "doc-W", "doc-V", "doc-U", "doc-T"]);
  });
});

describe("buildPopulationDiff", () => {
  it("reports missingIds for smaller populations and none for the largest", () => {
    const populations: DeclaredIdPopulation[] = [
      { toolName: "analyze_requirements", ids: ["EH-100", "EH-101", "W-001", "W-002"] },
      { toolName: "extract_test_conditions", ids: ["EH-100", "EH-101"] },
    ];
    const diff = buildPopulationDiff(populations);
    expect(diff[0].missingIds).toEqual([]);
    expect(diff[1].missingIds).toEqual(["W-001", "W-002"]);
  });
});

describe("summarizeIdPopulation", () => {
  it("computes counters and rounds the declaration rate to one decimal (e.g. 2/3 -> 66.7)", () => {
    const threeIds = defined.slice(0, 3);
    const rows = buildIdPopulationMatrix(threeIds, [
      { toolName: "t", ids: ["EH-100", "EH-101"] },
    ]);
    const undefinedIds = findUndefinedPopulationIds(threeIds, [{ toolName: "t", ids: ["EH-100", "EH-101"] }]);
    const summary = summarizeIdPopulation(rows, undefinedIds, []);
    expect(summary.definedTotal).toBe(3);
    expect(summary.declaredTotal).toBe(2);
    expect(summary.declarationRate).toBe(66.7);
  });
});

describe("determinism", () => {
  it("returns identical results across repeated calls", () => {
    const rows1 = buildIdPopulationMatrix(defined, populationsBase);
    const rows2 = buildIdPopulationMatrix(defined, populationsBase);
    expect(rows1).toEqual(rows2);
  });
});

describe("populationLabel", () => {
  it("combines toolName and label when label is present", () => {
    expect(populationLabel({ toolName: "extract_test_conditions", label: "V04", ids: [] })).toBe(
      "extract_test_conditions(V04)"
    );
    expect(populationLabel({ toolName: "extract_test_conditions", ids: [] })).toBe("extract_test_conditions");
  });
});
