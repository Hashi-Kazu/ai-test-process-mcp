import { describe, expect, it } from "vitest";
import {
  DEFAULT_ID_PATTERN_SOURCE,
  analyzePrefixes,
  buildRequirementSourceRefs,
  extractIdOccurrences,
  extractQuantityExpressions,
  findAmbiguousTerms,
  findDuplicateIds,
  findUnresolvedReferences,
  formatSourceCitation,
  formatSourceRef,
} from "../src/testBasisAnalysis.js";
import type { TestBasisDocument } from "../src/types.js";

describe("DEFAULT_ID_PATTERN_SOURCE", () => {
  it("matches common ID formats and excludes dates", () => {
    const regex = new RegExp(DEFAULT_ID_PATTERN_SOURCE, "gi");
    const text = "EH-100 S-001-01 W-008-04 W-Mail-011-01 E-016 2026-04-26";
    const matches = Array.from(text.matchAll(regex)).map((m) => m[0]);
    expect(matches).toContain("EH-100");
    expect(matches).toContain("S-001-01");
    expect(matches).toContain("W-008-04");
    expect(matches).toContain("W-Mail-011-01");
    expect(matches).toContain("E-016");
    expect(matches).not.toContain("2026-04-26");
  });
});

describe("extractIdOccurrences", () => {
  it("classifies leading occurrences as definition and others as reference", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: [
          "## W-008-04 メール送信仕様",
          "- E-016 詳細は下記の通り",
          "本機能は W-008-04 を満たすこと。E-016 も参照する。",
        ].join("\n"),
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    const w = occurrences.filter((o) => o.id === "W-008-04");
    const e = occurrences.filter((o) => o.id === "E-016");
    expect(w.filter((o) => o.role === "definition").length).toBe(1);
    expect(w.filter((o) => o.role === "reference").length).toBe(1);
    expect(e.filter((o) => o.role === "definition").length).toBe(1);
    expect(e.filter((o) => o.role === "reference").length).toBe(1);
  });

  it("respects additional idPatterns", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "REQ_100 is defined here." },
    ];
    const withoutExtra = extractIdOccurrences(documents);
    expect(withoutExtra.length).toBe(0);

    const withExtra = extractIdOccurrences(documents, {
      idPatterns: ["\\b(REQ)_(\\d+)\\b"],
    });
    expect(withExtra.length).toBe(1);
    expect(withExtra[0].id).toBe("REQ-100");
  });
});

describe("findDuplicateIds", () => {
  it("detects duplicate definitions with differing text as sameText=false", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: ["- E-016 最初の説明", "- E-016 別の説明（矛盾）"].join("\n"),
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    const duplicates = findDuplicateIds(occurrences);
    expect(duplicates.length).toBe(1);
    expect(duplicates[0].id).toBe("E-016");
    expect(duplicates[0].count).toBe(2);
    expect(duplicates[0].sameText).toBe(false);
  });

  it("returns empty array when there are no duplicates", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "- E-016 説明\n- E-017 別の説明" },
    ];
    const occurrences = extractIdOccurrences(documents);
    expect(findDuplicateIds(occurrences)).toEqual([]);
  });
});

describe("findUnresolvedReferences", () => {
  it("detects references to undefined ids but not cross-document defined ones", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "- E-016 説明\n本文中で E-999 を参照する。" },
      { name: "doc2.md", content: "本文中で E-016 を参照する。" },
    ];
    const occurrences = extractIdOccurrences(documents);
    const unresolved = findUnresolvedReferences(occurrences);
    expect(unresolved.length).toBe(1);
    expect(unresolved[0].id).toBe("E-999");
  });
});

describe("analyzePrefixes", () => {
  it("detects digit-width-mismatch", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "- S-001 説明1\n- S-01 説明2" },
    ];
    const occurrences = extractIdOccurrences(documents);
    const { issues } = analyzePrefixes(occurrences);
    expect(issues.some((i) => i.kind === "digit-width-mismatch")).toBe(true);
  });

  it("detects segment-count-mismatch", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "- S-001 説明1\n- S-001-01 説明2" },
    ];
    const occurrences = extractIdOccurrences(documents);
    const { issues } = analyzePrefixes(occurrences);
    expect(issues.some((i) => i.kind === "segment-count-mismatch")).toBe(true);
  });

  it("detects case-variant", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "- EH-100 説明1\n- eh-200 説明2" },
    ];
    const occurrences = extractIdOccurrences(documents);
    const { issues } = analyzePrefixes(occurrences);
    expect(issues.some((i) => i.kind === "case-variant")).toBe(true);
  });

  it("detects rare-prefix", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: [
          "- S-001 説明",
          "- S-002 説明",
          "- S-003 説明",
          "- Z-001 説明（誤記の可能性）",
        ].join("\n"),
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    const { issues } = analyzePrefixes(occurrences);
    expect(issues.some((i) => i.kind === "rare-prefix" && i.prefixes.includes("Z"))).toBe(true);
  });
});

describe("findAmbiguousTerms", () => {
  it("aggregates ambiguous/weak/incomplete terms by document and heading", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: [
          "## 見出しA",
          "相応の対応が必要な処置を行う。",
          "## 見出しB",
          "定期的に確認することが望ましい。",
          "一部概要のみ記載する。",
        ].join("\n"),
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const byTerm = new Map(findings.map((f) => [f.term, f]));

    expect(byTerm.get("相応の")?.total).toBe(1);
    expect(byTerm.get("相応の")?.byHeading[0]).toEqual({
      document: "doc1.md",
      heading: "見出しA",
      count: 1,
    });

    expect(byTerm.get("必要な")?.total).toBe(1);
    expect(byTerm.get("定期的に")?.total).toBe(1);
    expect(byTerm.get("定期的に")?.byHeading[0].heading).toBe("見出しB");
    expect(byTerm.get("望ましい")?.total).toBe(1);
    expect(byTerm.get("一部概要のみ記載")?.total).toBe(1);
  });

  it("excludes ambiguous terms preceded by a negation prefix", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: ["不適切な制御が行われる。", "不十分な検証を行う。"].join("\n"),
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const byTerm = new Map(findings.map((f) => [f.term, f]));

    expect(byTerm.get("適切な")).toBeUndefined();
    expect(byTerm.get("十分な")).toBeUndefined();
  });

  it("still detects ambiguous terms without a negation prefix", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: ["適切な制御が行われることを確認する。", "十分な検証を実施する。"].join("\n"),
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const byTerm = new Map(findings.map((f) => [f.term, f]));

    expect(byTerm.get("適切な")?.total).toBe(1);
    expect(byTerm.get("十分な")?.total).toBe(1);
  });

  it("excludes other negation prefixes (非/未/無) from matching ambiguous terms", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: "不十分に検証されている。",
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const byTerm = new Map(findings.map((f) => [f.term, f]));

    expect(byTerm.get("十分に")).toBeUndefined();
  });

  it("still detects ambiguous terms when a negation prefix appears elsewhere in the line", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: "不具合が発生した場合、適切な処置を行う。",
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const byTerm = new Map(findings.map((f) => [f.term, f]));

    expect(byTerm.get("適切な")?.total).toBe(1);
  });
});

describe("extractQuantityExpressions", () => {
  it("extracts quantity expressions with correct kind and boundary flag", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: "応答は3秒以内に返すこと。受付時間は10:00から。IDは4桁。毎日実行する。上限は5回まで。",
      },
    ];
    const expressions = extractQuantityExpressions(documents);
    const byRaw = new Map(expressions.map((e) => [e.raw, e]));

    expect(byRaw.get("3秒以内")?.kind).toBe("comparison");
    expect(byRaw.get("3秒以内")?.hasBoundaryWord).toBe(true);

    expect(byRaw.get("10:00")?.kind).toBe("time");
    expect(byRaw.get("10:00")?.hasBoundaryWord).toBe(false);

    expect(byRaw.get("4桁")?.kind).toBe("digits");
    expect(byRaw.get("4桁")?.hasBoundaryWord).toBe(false);

    expect(byRaw.get("毎日")?.kind).toBe("period");
    expect(byRaw.get("毎日")?.hasBoundaryWord).toBe(false);

    const fiveTimes = expressions.find((e) => e.raw.includes("5回"));
    expect(fiveTimes?.kind).toBe("comparison");
    expect(fiveTimes?.hasBoundaryWord).toBe(false);
  });
});

describe("buildRequirementSourceRefs", () => {
  it("sets endLine to one line before the next definition in the same document", () => {
    const lines: string[] = [];
    lines[0] = "## EH-100 発券機起動";
    for (let i = 1; i < 5; i++) lines[i] = `本文${i}`;
    lines[5] = "## EH-200 発券機停止";
    lines[6] = "本文6";
    const documents: TestBasisDocument[] = [{ name: "doc1.md", content: lines.join("\n") }];
    const occurrences = extractIdOccurrences(documents);
    const refs = buildRequirementSourceRefs(occurrences, documents);

    const eh100 = refs.find((r) => r.requirementId === "EH-100");
    expect(eh100?.startLine).toBe(1);
    expect(eh100?.endLine).toBe(5); // 次定義行(0-based lineIndex=5)＝1行前(1-based)
  });

  it("sets endLine to the document's last line for the final definition", () => {
    const lines = ["## EH-100 発券機起動", "本文1", "本文2"];
    const documents: TestBasisDocument[] = [{ name: "doc1.md", content: lines.join("\n") }];
    const occurrences = extractIdOccurrences(documents);
    const refs = buildRequirementSourceRefs(occurrences, documents);

    const eh100 = refs.find((r) => r.requirementId === "EH-100");
    expect(eh100?.startLine).toBe(1);
    expect(eh100?.endLine).toBe(3);
  });

  it("builds label from id + heading text derived from the definition line", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "## EH-100 発券機起動\n本文" },
    ];
    const occurrences = extractIdOccurrences(documents);
    const refs = buildRequirementSourceRefs(occurrences, documents);
    const eh100 = refs.find((r) => r.requirementId === "EH-100");
    expect(eh100?.label).toBe("EH-100 発券機起動");
    expect(eh100?.heading).toBe("EH-100 発券機起動");
  });

  it("keeps input occurrence order and separates refs across multiple documents", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "## E-001 説明A\n本文" },
      { name: "doc2.md", content: "## E-002 説明B\n本文" },
    ];
    const occurrences = extractIdOccurrences(documents);
    const refs = buildRequirementSourceRefs(occurrences, documents);
    expect(refs.map((r) => r.requirementId)).toEqual(["E-001", "E-002"]);
    expect(refs[0].document).toBe("doc1.md");
    expect(refs[1].document).toBe("doc2.md");
  });
});

describe("formatSourceRef", () => {
  it("formats a single-line ref without a range", () => {
    expect(formatSourceRef({ document: "doc.md", startLine: 652 })).toBe("doc.md:652");
    expect(formatSourceRef({ document: "doc.md", startLine: 652, endLine: 652 })).toBe("doc.md:652");
  });

  it("formats a range ref", () => {
    expect(formatSourceRef({ document: "doc.md", startLine: 652, endLine: 677 })).toBe("doc.md:652-677");
  });
});

describe("formatSourceCitation", () => {
  it("formats a range citation matching the issue example", () => {
    const citation = formatSourceCitation({
      document: "doc.md",
      startLine: 652,
      endLine: 677,
      label: "EH-100 発券機起動",
    });
    expect(citation).toBe("(EH-100 発券機起動, line 652-677)");
  });

  it("formats a single-line citation and falls back to document when label is missing", () => {
    expect(formatSourceCitation({ document: "doc.md", startLine: 10 })).toBe("(doc.md, line 10)");
  });
});
