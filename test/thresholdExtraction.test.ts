import { describe, expect, it } from "vitest";
import {
  analyzeThresholdExtraction,
  extractThresholdParameterCandidates,
  matchDeclaredToCandidates,
  mergeApprovedExtractions,
} from "../src/thresholdExtraction.js";
import type { ThresholdParameterCandidate } from "../src/types.js";

function cand(name: string, value: string, unit?: string): ThresholdParameterCandidate {
  return {
    name,
    value,
    rawValue: `${value}${unit ?? ""}`,
    unit,
    document: "spec.md",
    lineIndex: 0,
    heading: "(見出しなし)",
    form: "table-row",
  };
}

describe("extractThresholdParameterCandidates", () => {
  it("1. extracts a threshold from a markdown table row", () => {
    const candidates = extractThresholdParameterCandidates([
      { name: "spec.md", content: "| 大人料金 | 400円 |" },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "大人料金",
      value: "400",
      unit: "円",
      form: "table-row",
    });
  });

  it("2. skips table separator rows and header rows without a numeric cell", () => {
    const candidates = extractThresholdParameterCandidates([
      {
        name: "spec.md",
        content: ["| 項目 | 値 |", "| --- | --- |", "| 大人料金 | 400円 |"].join("\n"),
      },
    ]);
    expect(candidates.map((c) => c.name)).toEqual(["大人料金"]);
  });

  it("3. extracts a labeled line as labeled-line form", () => {
    const candidates = extractThresholdParameterCandidates([
      { name: "spec.md", content: "- 上限枚数: 10枚" },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "上限枚数",
      value: "10",
      unit: "枚",
      form: "labeled-line",
    });
  });

  it("4. normalizes a thousands-separated value and keeps the raw value", () => {
    const candidates = extractThresholdParameterCandidates([
      { name: "spec.md", content: "| 上限金額 | 1,000円 |" },
    ]);
    expect(candidates[0].value).toBe("1000");
    expect(candidates[0].rawValue).toBe("1,000円");
  });

  it("5. records the nearest preceding heading, or (見出しなし) when there is none", () => {
    const candidates = extractThresholdParameterCandidates([
      {
        name: "spec.md",
        content: ["- 上限枚数: 10枚", "# 料金仕様", "| 大人料金 | 400円 |"].join("\n"),
      },
    ]);
    expect(candidates[0].heading).toBe("(見出しなし)");
    expect(candidates[1].heading).toContain("料金仕様");
  });
});

describe("matchDeclaredToCandidates", () => {
  it("6. resolves in priority order: exact name > source match > partial match", () => {
    const exact = matchDeclaredToCandidates(
      [{ name: "上限枚数", value: "10" }],
      [cand("上限枚数の初期値", "5"), cand("上限枚数", "10")]
    );
    expect(exact.get("上限枚数")?.name).toBe("上限枚数");

    const bySource = matchDeclaredToCandidates(
      [{ name: "上限枚数", value: "10", source: "チケット上限" }],
      [cand("上限枚数の初期値", "5"), cand("チケット上限", "10")]
    );
    expect(bySource.get("上限枚数")?.name).toBe("チケット上限");

    const byPartial = matchDeclaredToCandidates(
      [{ name: "上限枚数", value: "10" }],
      [cand("上限枚数の初期値", "5")]
    );
    expect(byPartial.get("上限枚数")?.name).toBe("上限枚数の初期値");
  });
});

describe("buildExtractionFindings", () => {
  it("7. reports an undeclared extracted threshold as TCE-01 with medium severity", () => {
    const analysis = analyzeThresholdExtraction({
      parametersBefore: [],
      parametersAfter: [],
      documentsAfter: [{ name: "spec.md", content: "| 大人料金 | 400円 |" }],
    });
    const tce01 = analysis.findings.filter((f) => f.categoryId === "TCE-01");
    expect(tce01).toHaveLength(1);
    expect(tce01[0].severity).toBe("medium");
    expect(tce01[0].name).toBe("大人料金");
  });

  it("8. reports a declared/document mismatch as TCE-02, distinguishing value and unit mismatches", () => {
    const valueMismatch = analyzeThresholdExtraction({
      parametersBefore: [],
      parametersAfter: [{ name: "大人料金", value: "600", unit: "円" }],
      documentsAfter: [{ name: "spec.md", content: "| 大人料金 | 400円 |" }],
    });
    const v = valueMismatch.findings.filter((f) => f.categoryId === "TCE-02");
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("high");
    expect(v[0].detail).toContain("値が不一致");

    const unitMismatch = analyzeThresholdExtraction({
      parametersBefore: [],
      parametersAfter: [{ name: "大人料金", value: "400", unit: "ドル" }],
      documentsAfter: [{ name: "spec.md", content: "| 大人料金 | 400円 |" }],
    });
    const u = unitMismatch.findings.filter((f) => f.categoryId === "TCE-02");
    expect(u).toHaveLength(1);
    expect(u[0].detail).toContain("単位が不一致");
    expect(u[0].detail).not.toContain("値が不一致");
  });

  it("9. reports a declared parameter with no grounding in the documents as TCE-03", () => {
    const analysis = analyzeThresholdExtraction({
      parametersBefore: [],
      parametersAfter: [{ name: "深夜割増", value: "999", unit: "円" }],
      documentsAfter: [{ name: "spec.md", content: "| 大人料金 | 400円 |" }],
    });
    const tce03 = analysis.findings.filter((f) => f.categoryId === "TCE-03");
    expect(tce03).toHaveLength(1);
    expect(tce03[0].severity).toBe("medium");
    expect(tce03[0].name).toBe("深夜割増");
  });

  it("10. reports both directions of document/declaration diff inconsistency as TCE-04", () => {
    const documentOnly = analyzeThresholdExtraction({
      parametersBefore: [{ name: "上限枚数", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "上限枚数", value: "10", unit: "枚" }],
      documentsBefore: [{ name: "spec.md", content: "| 上限枚数 | 10枚 |" }],
      documentsAfter: [{ name: "spec.md", content: "| 上限枚数 | 20枚 |" }],
    });
    const a = documentOnly.findings.filter((f) => f.categoryId === "TCE-04");
    expect(a).toHaveLength(1);
    expect(a[0].severity).toBe("high");
    expect(a[0].detail).toContain("宣言パラメータ表へ未反映");

    const declarationOnly = analyzeThresholdExtraction({
      parametersBefore: [{ name: "上限枚数", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "上限枚数", value: "20", unit: "枚" }],
      documentsBefore: [{ name: "spec.md", content: "| 上限枚数 | 10枚 |" }],
      documentsAfter: [{ name: "spec.md", content: "| 上限枚数 | 10枚 |" }],
    });
    const b = declarationOnly.findings.filter((f) => f.categoryId === "TCE-04");
    expect(b).toHaveLength(1);
    expect(b[0].detail).toContain("文書側に変更の裏付けが無い");
  });

  it("11. reports conflicting values for the same label once per name as TCE-05", () => {
    const analysis = analyzeThresholdExtraction({
      parametersBefore: [],
      parametersAfter: [],
      documentsAfter: [
        { name: "spec.md", content: ["| 上限枚数 | 10枚 |", "- 上限枚数: 20枚"].join("\n") },
      ],
    });
    const tce05 = analysis.findings.filter((f) => f.categoryId === "TCE-05");
    expect(tce05).toHaveLength(1);
    expect(tce05[0].name).toBe("上限枚数");
    expect(tce05[0].places).toHaveLength(2);
  });

  it("12. reports an approval that does not match any candidate value as TCE-06 and does not merge it", () => {
    const analysis = analyzeThresholdExtraction({
      parametersBefore: [],
      parametersAfter: [],
      documentsAfter: [{ name: "spec.md", content: "| 上限枚数 | 20枚 |" }],
      approvedExtractions: [{ name: "上限枚数", afterValue: "30" }],
    });
    const tce06 = analysis.findings.filter((f) => f.categoryId === "TCE-06");
    expect(tce06).toHaveLength(1);
    expect(tce06[0].severity).toBe("high");
    expect(analysis.effectiveAfter).toHaveLength(0);
    expect(analysis.summary.mergedParameterCount).toBe(0);
  });

  it("13. marks an unapproved candidate diff row as unapproved and reports TCE-07 with info severity", () => {
    const analysis = analyzeThresholdExtraction({
      parametersBefore: [],
      parametersAfter: [],
      documentsBefore: [{ name: "spec.md", content: "| 上限枚数 | 10枚 |" }],
      documentsAfter: [{ name: "spec.md", content: "| 上限枚数 | 20枚 |" }],
    });
    expect(analysis.candidateDiffRows).toHaveLength(1);
    expect(analysis.candidateDiffRows[0].approval).toBe("unapproved");
    const tce07 = analysis.findings.filter((f) => f.categoryId === "TCE-07");
    expect(tce07).toHaveLength(1);
    expect(tce07[0].severity).toBe("info");
  });
});

describe("mergeApprovedExtractions", () => {
  it("14. appends only undeclared approved candidates with an extraction source and never overwrites declared values", () => {
    const declared = [{ name: "上限枚数", value: "10", unit: "枚" }];
    const candidates = [cand("上限枚数", "20", "枚"), cand("新規閾値", "5", "件")];
    const merged = mergeApprovedExtractions(
      declared,
      candidates,
      [
        { name: "上限枚数", afterValue: "20" },
        { name: "新規閾値", afterValue: "5" },
      ],
      "after"
    );
    expect(merged.mergedCount).toBe(1);
    expect(merged.parameters).toHaveLength(2);
    expect(merged.parameters[0]).toEqual({ name: "上限枚数", value: "10", unit: "枚" });
    expect(merged.parameters[1].name).toBe("新規閾値");
    expect(merged.parameters[1].source).toMatch(/^抽出:/);
    expect(declared).toHaveLength(1);
  });

  it("15. returns the declared table unchanged when there are no approvals", () => {
    const declared = [{ name: "上限枚数", value: "10", unit: "枚" }];
    const merged = mergeApprovedExtractions(declared, [cand("上限枚数", "20", "枚")], undefined, "after");
    expect(merged.mergedCount).toBe(0);
    expect(merged.parameters).toEqual(declared);
  });
});

describe("analyzeThresholdExtraction determinism", () => {
  it("16. produces identical output for the same input", () => {
    const params = {
      parametersBefore: [{ name: "上限枚数", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "上限枚数", value: "10", unit: "枚" }],
      documentsBefore: [
        { name: "spec.md", content: ["# 仕様", "| 上限枚数 | 10枚 |", "- 大人料金: 400円"].join("\n") },
      ],
      documentsAfter: [
        { name: "spec.md", content: ["# 仕様", "| 上限枚数 | 20枚 |", "- 大人料金: 500円"].join("\n") },
      ],
      approvedExtractions: [{ name: "大人料金", beforeValue: "400", afterValue: "500" }],
    };
    const first = JSON.stringify(analyzeThresholdExtraction(params));
    const second = JSON.stringify(analyzeThresholdExtraction(params));
    expect(first).toBe(second);
  });
});
