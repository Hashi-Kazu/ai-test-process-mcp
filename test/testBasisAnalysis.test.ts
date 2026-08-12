import { describe, expect, it } from "vitest";
import {
  ALT_ANCHOR_MIN_CHARS,
  DEFAULT_ID_PATTERN_SOURCE,
  analyzePrefixes,
  anchorLabelAt,
  parsePipeTableRow,
  resolveSectionAnchors,
  resolveSectionAnchorsDetailed,
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

  it("severity=medium when one occurrence is a heading line and the other is not (list+detail)", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: ["- E-016 一覧行の説明", "## E-016 本文見出しの説明"].join("\n"),
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    const duplicates = findDuplicateIds(occurrences);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].id).toBe("E-016");
    expect(duplicates[0].count).toBe(2);
    expect(duplicates[0].severity).toBe("medium");
  });

  it("severity=high when both occurrences are heading lines", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: ["## E-016 最初の見出し", "## E-016 別の見出し"].join("\n"),
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    const duplicates = findDuplicateIds(occurrences);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].id).toBe("E-016");
    expect(duplicates[0].severity).toBe("high");
  });

  it("severity=high when both occurrences are non-heading lines", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: ["- E-016 最初の説明", "- E-016 別の説明（矛盾）"].join("\n"),
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    const duplicates = findDuplicateIds(occurrences);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].id).toBe("E-016");
    expect(duplicates[0].severity).toBe("high");
  });

  it("severity=high when there are 3 or more definitions even with a heading line mixed in", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: [
          "- E-016 一覧行の説明",
          "## E-016 本文見出しの説明",
          "E-016 さらに別の説明",
        ].join("\n"),
      },
    ];
    const occurrences = extractIdOccurrences(documents);
    const duplicates = findDuplicateIds(occurrences);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].id).toBe("E-016");
    expect(duplicates[0].count).toBe(3);
    expect(duplicates[0].severity).toBe("high");
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
    expect(duplicates[0].severity).toBe("high");
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

describe("findAmbiguousTerms exclusion rules", () => {
  it("excludes AMBX-01 (single-noun hedge suffix) occurrences of 「等」", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: [
          "届出書等を地方公共団体に提出する。",
          "独自施策システム等を一意に特定し、管理するためにIDを付番する。",
        ].join("\n"),
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const finding = findings.find((f) => f.term === "等");

    expect(finding?.total).toBe(0);
    expect(finding?.excludedTotal).toBe(2);
    expect(finding?.excludedByRule).toEqual([{ ruleId: "AMBX-01", count: 2 }]);
    expect(finding?.exclusionHits).toHaveLength(2);
    expect(finding?.exclusionHits[0].ruleId).toBe("AMBX-01");
    expect(finding?.exclusionHits[0].document).toBe("doc1.md");
  });

  it("does not misclassify the topic-particle comma in 「Xは、Y等」 as an enumeration separator", () => {
    // 票の実装注意事項: 30文字程度の後方参照窓では「住登外者は、」の読点を誤って列挙区切りと判定してしまう。
    // 直前が主題助詞「は」の読点は別クローズの区切りとみなし、除外対象に含めなければならない。
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: "住登外者は、届出書等を地方公共団体に提出する。",
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const finding = findings.find((f) => f.term === "等");

    expect(finding?.total).toBe(0);
    expect(finding?.excludedTotal).toBe(1);
  });

  it("does not exclude 「等」 when the preceding enumeration is joined by 「、」 (open-ended listing)", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: "自動デプロイ、コスト最適化支援等の非機能要件を実現するための機能群をいう。",
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const finding = findings.find((f) => f.term === "等");

    expect(finding?.total).toBe(1);
    expect(finding?.excludedTotal).toBe(0);
  });

  it("does not exclude 「等」 when the preceding enumeration is joined by 「や」", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: "マイナポータルや中間サーバー等の外部システムとのインターフェースについて規定する。",
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const finding = findings.find((f) => f.term === "等");

    expect(finding?.total).toBe(1);
    expect(finding?.excludedTotal).toBe(0);
  });

  it("does not exclude 「等」 following a verb clause (open-scoped example listing, not a noun hedge)", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: "新たな技術が開発される等デジタル化の進展がみられる場合にも、改定する。",
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const finding = findings.find((f) => f.term === "等");

    expect(finding?.total).toBe(1);
    expect(finding?.excludedTotal).toBe(0);
  });

  it("excludes AMBX-02 (definitional 「Xに/がYに必要な」 with Y in {機能,情報,データ})", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: [
          "標準準拠システムに必要な機能のうち、複数の標準準拠システムに共通する機能を実装する。",
          "システム運用に必要なデータ項目を対象としておらず、実装は別途検討する。",
        ].join("\n"),
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const finding = findings.find((f) => f.term === "必要な");

    expect(finding?.total).toBe(0);
    expect(finding?.excludedTotal).toBe(2);
    expect(finding?.excludedByRule).toEqual([{ ruleId: "AMBX-02", count: 2 }]);
  });

  it("does not exclude 「必要な」 when the following noun is not 機能/情報/データ (existing behavior unchanged)", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: "相応の対応が必要な処置を行う。",
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const finding = findings.find((f) => f.term === "必要な");

    expect(finding?.total).toBe(1);
    expect(finding?.excludedTotal).toBe(0);
  });

  it("does not exclude 「必要な」 when the preceding particle is not に/が (implicit subject via a comma)", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: "公共団体内で一意に特定できず、必要な情報の連携時に支障が生じる可能性がある。",
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const finding = findings.find((f) => f.term === "必要な");

    expect(finding?.total).toBe(1);
    expect(finding?.excludedTotal).toBe(0);
  });

  it("does not affect other ambiguous terms such as 「速やかに」「適切な」「十分に」", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc1.md",
        content: "速やかに適切な措置を十分に検討すること。",
      },
    ];
    const findings = findAmbiguousTerms(documents);
    const byTerm = new Map(findings.map((f) => [f.term, f]));

    expect(byTerm.get("速やかに")?.total).toBe(1);
    expect(byTerm.get("速やかに")?.excludedTotal).toBe(0);
    expect(byTerm.get("適切な")?.total).toBe(1);
    expect(byTerm.get("適切な")?.excludedTotal).toBe(0);
    expect(byTerm.get("十分に")?.total).toBe(1);
    expect(byTerm.get("十分に")?.excludedTotal).toBe(0);
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

// --- 章節アンカー解決器（見出し退化時の代替アンカー） ---

/** 見出し0件・パイプ表0件の大きな本文（pdftotext -layout 出力の模擬。連続空白区切りの行を含む）。 */
function noStructureBody(): string {
  const lines: string[] = ["項番   区分   内容"];
  for (let i = 0; i < 60; i++) {
    lines.push(`本文${i}の説明として必要な記述をここに続ける。適切な運用を前提とする。`);
  }
  return lines.join("\n");
}

/** content を target 文字にそろえる（末尾へ独立した本文行を足すのでパイプ表・見出しの構造は変えない）。 */
function padTo(content: string, target: number): string {
  return `${content}\n${"あ".repeat(target - content.length - 1)}`;
}

const PIPE_TABLE_LINES = [
  "| 改定後 | 現行 |",
  "| --- | --- |",
  "| 変更後の記述である。 | 変更前の記述である。 |",
];

describe("parsePipeTableRow", () => {
  it("returns inner cells with raw-line offsets (leading whitespace included)", () => {
    const line = "  | A | B |";
    const cells = parsePipeTableRow(line);
    expect(cells).not.toBeNull();
    expect(cells!.map((c) => c.text)).toEqual([" A ", " B "]);
    for (const cell of cells!) {
      expect(line.slice(cell.start, cell.end)).toBe(cell.text);
    }
  });

  it("returns null for a separator row, a single-cell row and a non-pipe row", () => {
    expect(parsePipeTableRow("| --- | --- |")).toBeNull();
    expect(parsePipeTableRow("|:---|---:|")).toBeNull();
    expect(parsePipeTableRow("| 単独セル |")).toBeNull();
    expect(parsePipeTableRow("項番   区分   内容")).toBeNull();
    expect(parsePipeTableRow("")).toBeNull();
  });

  it("does not split on an escaped pipe", () => {
    const cells = parsePipeTableRow("| A\\|B | C |");
    expect(cells!.map((c) => c.text)).toEqual([" A\\|B ", " C "]);
  });
});

describe("resolveSectionAnchors (見出し0件・パイプ表0件の文書は現状維持)", () => {
  it("keeps every line as (見出しなし) for a 2000+ char document without headings and pipe tables", () => {
    const content = noStructureBody();
    expect(content.length).toBeGreaterThanOrEqual(ALT_ANCHOR_MIN_CHARS);
    const anchors = resolveSectionAnchors(content);
    expect(anchors).toHaveLength(content.split("\n").length);
    for (const anchor of anchors) {
      expect(anchor).toEqual({ label: "(見出しなし)", kind: "none" });
    }
  });

  it("does not use layout-extracted (whitespace separated) rows as anchors", () => {
    const detailed = resolveSectionAnchorsDetailed(noStructureBody());
    expect(detailed.alternativeAnchorLineCount).toBe(0);
    expect(detailed.alternativeTableCount).toBe(0);
    expect(detailed.distinctHeadingAnchors).toBe(1);
  });

  it("keeps all findings of findAmbiguousTerms under (見出しなし) for such a document", () => {
    const findings = findAmbiguousTerms([{ name: "pdf.txt", content: noStructureBody() }]);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      for (const group of finding.byHeading) {
        expect(group.heading).toBe("(見出しなし)");
      }
    }
  });
});

describe("resolveSectionAnchors (退化判定の境界条件)", () => {
  it("does not switch to alternative anchors below ALT_ANCHOR_MIN_CHARS (1999 chars)", () => {
    const content = padTo(PIPE_TABLE_LINES.join("\n"), ALT_ANCHOR_MIN_CHARS - 1);
    expect(content.length).toBe(ALT_ANCHOR_MIN_CHARS - 1);
    const anchors = resolveSectionAnchors(content);
    for (const anchor of anchors) {
      expect(anchor).toEqual({ label: "(見出しなし)", kind: "none" });
    }
  });

  it("switches pipe table rows to table-row anchors at exactly ALT_ANCHOR_MIN_CHARS (2000 chars)", () => {
    const content = padTo(PIPE_TABLE_LINES.join("\n"), ALT_ANCHOR_MIN_CHARS);
    expect(content.length).toBe(ALT_ANCHOR_MIN_CHARS);
    const anchors = resolveSectionAnchors(content);
    expect(anchors[0].kind).toBe("table-row");
    expect(anchors[0].label).toBe("[代替アンカー:表行] 表「改定後 / 現行」見出し行(行1)");
    expect(anchors[1].kind).toBe("none"); // 区切り行はアンカーを持たない
    expect(anchors[2].kind).toBe("table-row");
    expect(anchors[2].label).toBe("[代替アンカー:表行] 表「改定後 / 現行」第1行(行3)");
  });

  it("switches to alternative anchors when the only heading label is a real heading", () => {
    const content = padTo(["# 新旧対照表", ...PIPE_TABLE_LINES].join("\n"), ALT_ANCHOR_MIN_CHARS);
    const detailed = resolveSectionAnchorsDetailed(content);
    expect(detailed.distinctHeadingAnchors).toBe(1);
    expect(detailed.alternativeAnchorLineCount).toBe(2);
    expect(detailed.alternativeTableCount).toBe(1);
    // 見出し行そのものは従来どおり見出しラベルのまま
    expect(detailed.anchors[0]).toEqual({ label: "新旧対照表", kind: "heading", anchorLine: 1 });
    expect(detailed.anchors[1].kind).toBe("table-row");
  });

  it("never emits alternative anchors when heading labels are discriminative (2+ distinct)", () => {
    const content = padTo(
      ["# 第1章", ...PIPE_TABLE_LINES, "# 第2章", "本文である。"].join("\n"),
      ALT_ANCHOR_MIN_CHARS + 500
    );
    const detailed = resolveSectionAnchorsDetailed(content);
    expect(detailed.distinctHeadingAnchors).toBeGreaterThanOrEqual(2);
    expect(detailed.alternativeAnchorLineCount).toBe(0);
    expect(detailed.anchors.every((a) => !a.label.startsWith("[代替アンカー"))).toBe(true);
    expect(detailed.anchors[1]).toEqual({ label: "第1章", kind: "heading", anchorLine: 1 });
  });
});

describe("resolveSectionAnchors (アンカー構造)", () => {
  const twoTables = [
    "| 改定後 | 現行 |",
    "| --- | --- |",
    "| 変更後1 | 変更前1 |",
    "| 変更後2 | 変更前2 |",
    "本文の区切り。",
    "| 項目 | 値 |",
    "| 追加項目 | 100件以上 |",
  ];

  it("numbers tables from 1 and restarts row numbers per table without consuming separator rows", () => {
    const content = padTo(twoTables.join("\n"), ALT_ANCHOR_MIN_CHARS);
    const anchors = resolveSectionAnchors(content);
    // 末尾は padTo が足した本文行
    expect(anchors.map((a) => a.tableIndex)).toEqual([1, undefined, 1, 1, undefined, 2, 2, undefined]);
    expect(anchors.map((a) => a.rowNumber)).toEqual([0, undefined, 1, 2, undefined, 0, 1, undefined]);
    expect(anchors.map((a) => a.anchorLine)).toEqual([1, undefined, 3, 4, undefined, 6, 7, undefined]);
    expect(anchors[5].tableSummary).toBe("項目 / 値");
    expect(anchors[6].label).toBe("[代替アンカー:表行] 表「項目 / 値」第1行(行7)");
    const detailed = resolveSectionAnchorsDetailed(content);
    expect(detailed.alternativeTableCount).toBe(2);
    expect(detailed.alternativeAnchorLineCount).toBe(5);
  });

  it("summarizes at most the first 3 header cells and skips empty ones", () => {
    const content = padTo(
      ["| A | B | C | D |", "| 1 | 2 | 3 | 4 |", "本文。", "|  |  |  | 値 |", "| x | y | z | w |"].join(
        "\n"
      ),
      ALT_ANCHOR_MIN_CHARS
    );
    const anchors = resolveSectionAnchors(content);
    expect(anchors[0].tableSummary).toBe("A / B / C");
    expect(anchors[3].tableSummary).toBe("値");
    expect(anchors[4].label).toBe("[代替アンカー:表行] 表「値」第1行(行5)");
    // 空セルのヘッダは列ラベルから「」を落とす
    const cells = anchors[4].cells as { start: number; header: string }[];
    expect(anchorLabelAt(anchors[4], cells[0].start + 1)).toBe(
      "[代替アンカー:表行] 表「値」第1行 第1列(行5)"
    );
  });

  it("truncates each header cell at 10 chars and keeps the summary within 40 chars", () => {
    const long = "あいうえおかきくけこさしすせそ";
    const content = padTo(
      [`| ${long}1 | ${long}2 | ${long}3 | ${long}4 |`, "| a | b | c | d |"].join("\n"),
      ALT_ANCHOR_MIN_CHARS
    );
    const anchors = resolveSectionAnchors(content);
    const summary = anchors[0].tableSummary as string;
    expect(summary).toBe("あいうえおかきくけこ… / あいうえおかきくけこ… / あいうえおかきくけこ…");
    expect(summary.length).toBeLessThanOrEqual(40);
  });

  it("collapses consecutive whitespace inside header cells", () => {
    const content = padTo(
      ["| 改定  後　　版 | 現行 |", "| a | b |"].join("\n"),
      ALT_ANCHOR_MIN_CHARS
    );
    const anchors = resolveSectionAnchors(content);
    expect(anchors[0].tableSummary).toBe("改定 後 版 / 現行");
  });

  it("never puts a pipe or a newline into the label (escaped pipes become /)", () => {
    const content = padTo(
      ["| 改定\\|後 | 現行 |", "| 変更後 | 変更前 |"].join("\n"),
      ALT_ANCHOR_MIN_CHARS
    );
    const anchors = resolveSectionAnchors(content);
    expect(anchors[0].tableSummary).toBe("改定/後 / 現行");
    for (const anchor of anchors) {
      expect(anchor.label).not.toContain("|");
      expect(anchor.label).not.toContain("\n");
    }
    expect(anchorLabelAt(anchors[1], (anchors[1].cells as { start: number }[])[0].start + 1)).toBe(
      "[代替アンカー:表行] 表「改定/後 / 現行」第1行 第1列「改定/後」(行2)"
    );
  });
});

describe("anchorLabelAt", () => {
  const content = padTo(
    ["| 改定後 |  | 現行 |", "| --- | --- | --- |", "| 変更後 | 補足 | 変更前 |"].join("\n"),
    ALT_ANCHOR_MIN_CHARS
  );
  const anchors = resolveSectionAnchors(content);
  const dataAnchor = anchors[2];

  it("inserts the column number and header for an offset inside a cell", () => {
    const cells = dataAnchor.cells as { start: number; end: number; header: string }[];
    expect(anchorLabelAt(dataAnchor, cells[0].start + 1)).toBe(
      "[代替アンカー:表行] 表「改定後 / 現行」第1行 第1列「改定後」(行3)"
    );
    expect(anchorLabelAt(dataAnchor, cells[2].start + 1)).toBe(
      "[代替アンカー:表行] 表「改定後 / 現行」第1行 第3列「現行」(行3)"
    );
  });

  it("omits the header quotes when the header cell is empty", () => {
    const cells = dataAnchor.cells as { start: number; end: number; header: string }[];
    expect(anchorLabelAt(dataAnchor, cells[1].start + 1)).toBe(
      "[代替アンカー:表行] 表「改定後 / 現行」第1行 第2列(行3)"
    );
  });

  it("returns the plain label for an offset outside every cell and for non table-row anchors", () => {
    expect(anchorLabelAt(dataAnchor, 0)).toBe(dataAnchor.label);
    expect(anchorLabelAt(dataAnchor, 10_000)).toBe(dataAnchor.label);
    expect(anchorLabelAt({ label: "3.1 概要", kind: "heading", anchorLine: 5 }, 3)).toBe("3.1 概要");
    expect(anchorLabelAt({ label: "(見出しなし)", kind: "none" }, 0)).toBe("(見出しなし)");
  });
});

describe("章節解決の一本化（ID・数値・曖昧語）", () => {
  const content = padTo(
    ["| 改定後 | 現行 |", "| --- | --- |", "| EH-100 は 60人以下 とする。 | EH-099 は 50人以下 とする。 |"].join(
      "\n"
    ),
    ALT_ANCHOR_MIN_CHARS
  );
  const documents: TestBasisDocument[] = [{ name: "新旧対照表", content }];

  it("resolves the heading of each id occurrence per match position", () => {
    const occurrences = extractIdOccurrences(documents);
    const eh100 = occurrences.find((o) => o.id === "EH-100");
    const eh099 = occurrences.find((o) => o.id === "EH-099");
    expect(eh100?.heading).toBe("[代替アンカー:表行] 表「改定後 / 現行」第1行 第1列「改定後」(行3)");
    expect(eh099?.heading).toBe("[代替アンカー:表行] 表「改定後 / 現行」第1行 第2列「現行」(行3)");
  });

  it("resolves the heading of quantity expressions per match position", () => {
    const quantities = extractQuantityExpressions(documents);
    const headings = quantities.map((q) => q.heading);
    expect(headings).toContain("[代替アンカー:表行] 表「改定後 / 現行」第1行 第1列「改定後」(行3)");
    expect(headings).toContain("[代替アンカー:表行] 表「改定後 / 現行」第1行 第2列「現行」(行3)");
  });

  it("keeps ambiguous term counts identical when several matches share one line", () => {
    const line = "適切な対応を行い、適切な記録を残し、不適切な処理は行わない。";
    const findings = findAmbiguousTerms([{ name: "doc.md", content: `# 概要\n${line}` }]);
    const finding = findings.find((f) => f.term === "適切な");
    expect(finding?.total).toBe(2); // 不適切な は lookbehind で除外
    expect(finding?.byHeading).toEqual([{ document: "doc.md", heading: "概要", count: 2 }]);
  });

  it("groups ambiguous terms per resolved column when the alternative anchor is used", () => {
    const table = padTo(
      ["| 改定後 | 現行 |", "| 適切な運用とする。 | 適宜運用する。 |"].join("\n"),
      ALT_ANCHOR_MIN_CHARS
    );
    const findings = findAmbiguousTerms([{ name: "新旧対照表", content: table }]);
    const teki = findings.find((f) => f.term === "適切な");
    expect(teki?.byHeading).toEqual([
      {
        document: "新旧対照表",
        heading: "[代替アンカー:表行] 表「改定後 / 現行」第1行 第1列「改定後」(行2)",
        count: 1,
      },
    ]);
    const tekigi = findings.find((f) => f.term === "適宜");
    expect(tekigi?.byHeading).toEqual([
      {
        document: "新旧対照表",
        heading: "[代替アンカー:表行] 表「改定後 / 現行」第1行 第2列「現行」(行2)",
        count: 1,
      },
    ]);
  });
});
