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
  isTableOfContentsLine,
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

  it("treats a 1-group custom pattern's whole match as-is (no hyphen joining) for numeric-only IDs", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "| 031 | 1 | 宛名番号 | 説明 |" },
    ];
    const occurrences = extractIdOccurrences(documents, {
      idPatterns: ["(?<![0-9A-Za-z])(\\d{3})(?![0-9A-Za-z])"],
    });
    const target = occurrences.find((o) => o.id === "031");
    expect(target).toBeDefined();
    expect(target?.prefix).toBe("");
    expect(target?.numberPart).toBe("031");
    expect(target?.role).toBe("definition");
  });

  it("treats a leading empty pipe cell as the row-start marker so the next cell can be a definition", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "| | 031 | 1 | 宛名番号 | 説明 |" },
    ];
    const occurrences = extractIdOccurrences(documents, {
      idPatterns: ["(?<![0-9A-Za-z])(\\d{3})(?![0-9A-Za-z])"],
    });
    const target = occurrences.find((o) => o.id === "031");
    expect(target?.role).toBe("definition");
  });

  it("keeps a non-empty leading cell's later ID as reference (does not over-skip)", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "| 宛名番号 | 031 | 説明 |" },
    ];
    const occurrences = extractIdOccurrences(documents, {
      idPatterns: ["(?<![0-9A-Za-z])(\\d{3})(?![0-9A-Za-z])"],
    });
    const target = occurrences.find((o) => o.id === "031");
    expect(target?.role).toBe("reference");
  });

  it("never produces an id containing the literal string 'undefined' for 1-group or 0-group patterns", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "031 と XYZ123 が定義されている。" },
    ];
    const oneGroup = extractIdOccurrences(documents, {
      idPatterns: ["(?<![0-9A-Za-z])(\\d{3})(?![0-9A-Za-z])"],
    });
    const zeroGroup = extractIdOccurrences(documents, {
      idPatterns: ["\\bXYZ\\d{3}\\b"],
    });
    for (const o of [...oneGroup, ...zeroGroup]) {
      expect(o.id).not.toContain("undefined");
    }
  });

  it("uses the whole match as id for a 0-group custom pattern", () => {
    const documents: TestBasisDocument[] = [{ name: "doc1.md", content: "XYZ123 を参照する。" }];
    const occurrences = extractIdOccurrences(documents, { idPatterns: ["\\bXYZ\\d{3}\\b"] });
    expect(occurrences.some((o) => o.id === "XYZ123")).toBe(true);
  });
});

describe("COVERAGE_TARGET_ID_PATTERN_SOURCE / includeCoverageTargetIds", () => {
  it("extracts colon-separated coverage target IDs only when includeCoverageTargetIds is true", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: [
          "CFG:MAIN:R12 の構成を対象とする。",
          "DL:S:ORDER:PAID の状態遷移を確認する。",
          "UC:UC-01:F1 のフローを確認する。",
          "ST:T1 の遷移を確認する。",
        ].join("\n"),
      },
    ];

    const withoutOption = extractIdOccurrences(documents);
    expect(withoutOption.filter((o) => o.kind === "coverageTarget").length).toBe(0);

    const withOption = extractIdOccurrences(documents, { includeCoverageTargetIds: true });
    const coverage = withOption.filter((o) => o.kind === "coverageTarget");
    const ids = coverage.map((o) => o.id);
    expect(ids).toContain("CFG:MAIN:R12");
    expect(ids).toContain("DL:S:ORDER:PAID");
    expect(ids).toContain("UC:UC-01:F1");
    expect(ids).toContain("ST:T1");
    for (const o of coverage) {
      expect(o.prefix.endsWith(":")).toBe(true);
    }
  });

  it("does not double-extract the requirement id embedded inside a coverage target id", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "DL:S:ORDER-01:S-1 の状態遷移を確認する。" },
    ];
    const occurrences = extractIdOccurrences(documents, { includeCoverageTargetIds: true });
    expect(occurrences.some((o) => o.id === "ORDER-01")).toBe(false);
    expect(occurrences.some((o) => o.id === "DL:S:ORDER-01:S-1")).toBe(true);
  });

  it("excludes coverageTarget occurrences from analyzePrefixes", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "## CFG:MAIN:R12 構成一覧\n本文は CFG:MAIN:R12 を参照する。" },
    ];
    const occurrences = extractIdOccurrences(documents, { includeCoverageTargetIds: true });
    const { stats, issues } = analyzePrefixes(occurrences);
    expect(stats.some((s) => s.prefix === "CFG:")).toBe(false);
    expect(issues.length).toBe(0);
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

describe("目次行のID出現 (toc ロール)", () => {
  it("1. detects a toc line (dot leader + trailing page number) via isTableOfContentsLine", () => {
    expect(
      isTableOfContentsLine("W-001 新規登録.......................................... 5")
    ).toBe(true);
    const documents: TestBasisDocument[] = [
      {
        name: "toc.md",
        content: "W-001 新規登録.......................................... 5",
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].role).toBe("toc");
  });

  it("2. duplicate count excludes the toc line's occurrence and its lineText from places", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc.md",
        content: [
          "W-001 新規登録.......................................... 5",
          "W-001  ナビゲーション  概要説明",
          "## W-001 新規登録",
        ].join("\n"),
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    const duplicates = findDuplicateIds(occurrences);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].id).toBe("W-001");
    expect(duplicates[0].count).toBe(2);
    expect(
      duplicates[0].places.some((p) =>
        p.lineText.startsWith("W-001 新規登録..........")
      )
    ).toBe(false);
  });

  it("3. an id with a toc line plus only one body definition line does not appear as a duplicate", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc.md",
        content: [
          "W-001 新規登録.......................................... 5",
          "W-001 新規登録",
        ].join("\n"),
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    expect(findDuplicateIds(occurrences)).toEqual([]);
  });

  it("4. an id that only appears on a toc line is neither definition nor reference, and never unresolved", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc.md",
        content: "W-001 新規登録.......................................... 5",
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    expect(occurrences.every((o) => o.role === "toc")).toBe(true);
    expect(findUnresolvedReferences(occurrences)).toEqual([]);
  });

  it("5. a second id occurrence on the same toc line is also 'toc', not 'reference'", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc.md",
        content: "W-001 新規登録 W-002 ログイン.......................................... 5",
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((o) => o.role)).toEqual(["toc", "toc"]);
  });

  it("6. false-positive guards keep non-toc lines as 'definition'", () => {
    const shortDotLeader: TestBasisDocument[] = [
      { name: "doc.md", content: "EH-100 発券機起動.....5" },
    ];
    expect(extractIdOccurrences(shortDotLeader)[0].role).toBe("definition");

    const nonNumericTail: TestBasisDocument[] = [
      { name: "doc.md", content: "EH-100 発券機起動.......................... 概要" },
    ];
    expect(extractIdOccurrences(nonNumericTail)[0].role).toBe("definition");

    const noDotLeader: TestBasisDocument[] = [
      { name: "doc.md", content: "EH-100 発券機起動 5秒以内" },
    ];
    expect(extractIdOccurrences(noDotLeader)[0].role).toBe("definition");
  });

  it("7. regression: EH-100 duplicate true positive is preserved when there is no toc line", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc.md",
        content: ["EH-100 発券機起動", "EH-100 ゲートハブ起動"].join("\n"),
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    const duplicates = findDuplicateIds(occurrences);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].id).toBe("EH-100");
    expect(duplicates[0].count).toBe(2);
    expect(duplicates[0].sameText).toBe(false);
  });

  it("8. regression: EH-241 unresolved reference is preserved, unaffected by an added toc line", () => {
    const baseContent = "異常系は EH-241～EH-244 に定義する。";
    const documentsWithoutToc: TestBasisDocument[] = [{ name: "doc.md", content: baseContent }];
    const occurrencesWithoutToc = extractIdOccurrences(documentsWithoutToc);
    const unresolvedWithoutToc = findUnresolvedReferences(occurrencesWithoutToc);
    expect(unresolvedWithoutToc.some((u) => u.id === "EH-241")).toBe(true);

    const documentsWithToc: TestBasisDocument[] = [
      {
        name: "doc.md",
        content: [
          "EH-241 発券機起動.......................................... 5",
          baseContent,
        ].join("\n"),
      },
    ];
    const occurrencesWithToc = extractIdOccurrences(documentsWithToc);
    const unresolvedWithToc = findUnresolvedReferences(occurrencesWithToc);
    expect(unresolvedWithToc.some((u) => u.id === "EH-241")).toBe(true);
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

  it("excludes empty-prefix (non-prefix ID system) definitions from stats and issues", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc1.md", content: "| 031 | 1 | 宛名番号 |\n| 999 | 2 | 別項目 |" },
    ];
    const occurrences = extractIdOccurrences(documents, {
      idPatterns: ["(?<![0-9A-Za-z])(\\d{3})(?![0-9A-Za-z])"],
    });
    const { stats, issues } = analyzePrefixes(occurrences);
    expect(stats.some((s) => s.prefix === "")).toBe(false);
    expect(issues.some((i) => i.prefixes.includes(""))).toBe(false);
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
