import { describe, expect, it } from "vitest";
import {
  BIGRAM_CONTAINMENT_THRESHOLD,
  analyzeDeliverableConsistency,
  bigramContainmentRatio,
  buildCrossRefIdIndex,
  buildDeliverableIndex,
  buildDeliverableConsistencyFindings,
  buildIdStatementDiffs,
  buildReferencedDocumentMatrix,
  checkCorrespondenceClaims,
  checkCountClaims,
  checkIdStatementDiffs,
  checkNeverReferencedIds,
  checkReferencedDocumentConflicts,
  checkSectionReferences,
  checkSharedItemGaps,
  checkUnreadDocumentIdUsage,
  checkUnresolvedCrossRefIds,
  expandIdRanges,
  extractCorrespondenceClaims,
  extractCountClaims,
  extractReferencedDocuments,
  extractSectionReferences,
  extractSharedItems,
} from "../src/deliverableConsistencyAnalysis.js";
import { extractIdOccurrences } from "../src/testBasisAnalysis.js";
import type {
  AuditDeliverableConsistencyInput,
  ConsistencyDeliverable,
  DeliverableConsistencyFinding,
} from "../src/types.js";

// --- 実データ（sample/contest_testbase/2026）由来の抜粋フィクスチャ ---

const PLAN: ConsistencyDeliverable = {
  name: "テスト計画書.md",
  kind: "test-plan",
  content: `# テスト計画書

## 1 はじめに

### 1.1 スコープ

- 入場ゲート複数台化
- 入場ゲートハブ新設

### 1.3 参考文献

- 11_園内チケットシステム要求仕様書.pdf: 機能要求の一次情報
- 13_園内チケットシステム発券機画面仕様書.pdf: 発券機の画面遷移およびエラーメッセージの詳細仕様
- 22_Webチケットシステム画面仕様書.pdf: Webチケットシステムの画面詳細仕様
- 72_だんだん動物園入場システムデータ連携仕様書.pdf: システム間データ連携仕様

## 11 テスト体制

### 11.2 ステークホルダー

| 役割 | 担当 |
| --- | --- |
| テスト責任者 | A |

## 14 リスク

### 14.1 プロダクトリスク

| 区分 | 内容 |
| --- | --- |
| 構成変更 | 入場ゲートハブ新設に伴う整合性 |

## 15 特記事項

### 15.2 テストベース読解状況

本計画書はサンプル資料01・02・11・12・21・71号文書を精読して作成した。13(発券機画面仕様書)・22(Webチケット画面仕様書)・72(データ連携仕様書)は未読のため、画面遷移の詳細設計時に追加確認が必要。
`,
};

const ANALYSIS: ConsistencyDeliverable = {
  name: "テスト分析.md",
  kind: "test-analysis",
  content: `# テスト分析

## 0 本書の位置づけとスコープ

テスト計画書 1.1 節のスコープをそのまま引き継ぐ。対象テストベースは以下のとおり。

- 11_園内チケットシステム要求仕様書.pdf
- 13_園内チケットシステム発券機画面仕様書.pdf
- 72_だんだん動物園入場システムデータ連携仕様書.pdf

対象外文書: 22_Webチケットシステム画面仕様書.pdf（21号文書と内容の重複が多いため今回は未読解。テスト設計仕様書3.1節の詳細化フェーズで追加確認が必要）。

## 1 要件分析

### 1.1 要件ID体系

テスト依頼元への質問状項目としても記録する（8.2節参照）。テスト計画書11.2「ステークホルダー」表に対応させた。

## 2 テスト条件

### 2.1 プロダクトリスク

| ID | 内容 |
| --- | --- |
| R-01 | 複数ゲート間でQRコードの整合性が崩壊する |
| R-02 | 入場制限人数パラメータ変更の影響 |
| R-03 | 応答遅延 |
| R-04 | 決済通信障害時のフォールバック不備 |

うちR-01〜R-04はテスト計画書14.1プロダクトリスクと対応する。

### 2.4 テスト条件一覧

| ID | 対象 | 内容 |
| --- | --- | --- |
| TC-002 | 入場ゲートハブ | 同一の入場用QRコードを2台以上の入場ゲートからほぼ同時にタッチした場合、1台のゲートのみ入場可となること |
| TC-012 | 発券機 | 発券機の起動シーケンスが正常に完了すること |
`,
};

const DESIGN: ConsistencyDeliverable = {
  name: "テスト設計.md",
  kind: "test-design",
  content: `# テスト設計

## 1 スコープ

### 1.1 対象範囲

- 入場ゲート複数台化
- 入場ゲートハブ新設

## 3 テストケース

### 3.5 閾値のパラメータ名参照化

| ID | 対象 | 内容 |
| --- | --- | --- |
| TCS-010 | 入場制限人数 | 入場制限人数が上限値のとき入場不可となること |
| TCS-013 | 残数表示 | 残数がしきい値を下回ると残数表示が切り替わること |
| TCS-014 | 残数表示 | 残数が0のとき満了表示となること |
| TCS-015 | 入場制限人数 | 入場制限人数の既定値で入場可となること |
| TCS-040 | データ連携 | 連携ファイルの受信が成功すること |
| TCS-050 | 発券機画面 | 発券機画面 S-008-01 でエラーメッセージが表示されること |

入場券区分・会員ゲスト区分は本書のテストケース骨格に含めていないため4節「未着手・今後の課題」に記載する。対象リスクは R-01 である。

### 3.6 網羅率

| 観点 | 網羅 |
| --- | --- |
| 状態網羅 | 6/6（100.0%） |

## 4 決定的検査結果(改修前の証跡)

| 指摘 | 件数 |
| --- | --- |
| 閾値の直値埋め込み | 7件（TCS-010, TCS-013, TCS-014, TCS-015, TCS-040。3.5節で改修済み） |

## 5 今後の課題

- 入場券区分の網羅
`,
};

function subjects(findings: DeliverableConsistencyFinding[], checkId: string): string[] {
  return findings.filter((f) => f.checkId === checkId).map((f) => f.subject);
}

function findingsOf(input: AuditDeliverableConsistencyInput): DeliverableConsistencyFinding[] {
  return buildDeliverableConsistencyFindings(input);
}

describe("参照テストベース文書（DCC-01〜DCC-05）", () => {
  const occurrences = extractReferencedDocuments([PLAN, ANALYSIS]);
  const rows = buildReferencedDocumentMatrix(occurrences, [PLAN, ANALYSIS]);

  it("読了状態が成果物間で食い違う文書（13・72）を DCC-01 で検出する", () => {
    const findings = checkReferencedDocumentConflicts(rows);
    const dcc01 = subjects(findings, "DCC-01");
    expect(dcc01.some((s) => s.startsWith("13"))).toBe(true);
    expect(dcc01.some((s) => s.startsWith("72"))).toBe(true);
    for (const f of findings.filter((x) => x.checkId === "DCC-01")) {
      expect(f.severity).toBe("high");
    }
  });

  it("同一成果物内の読了・未読の自己矛盾を DCC-02 で検出する", () => {
    const findings = checkReferencedDocumentConflicts(rows);
    const dcc02 = subjects(findings, "DCC-02");
    expect(dcc02.every((s) => s.startsWith("テスト計画書.md"))).toBe(true);
    expect(dcc02.some((s) => s.includes("13"))).toBe(true);
  });

  it("括弧内の番号は読了状態の判定対象にならない（21は未読扱いにならない）", () => {
    const analysisOnly = extractReferencedDocuments([ANALYSIS]);
    expect(analysisOnly.some((o) => o.documentKey === "21")).toBe(false);
    const unread22 = analysisOnly.filter((o) => o.documentKey === "22");
    expect(unread22.length).toBeGreaterThan(0);
    expect(unread22.every((o) => o.state === "unread")).toBe(true);
    const rowsOnly = buildReferencedDocumentMatrix(analysisOnly, [ANALYSIS]);
    expect(checkReferencedDocumentConflicts(rowsOnly).filter((f) => f.checkId === "DCC-02")).toHaveLength(0);
  });

  it("連番列挙（01・02・11・12・21・71号文書）を read として6件抽出する", () => {
    const doc: ConsistencyDeliverable = {
      name: "計画書",
      kind: "test-plan",
      content: "01・02・11・12・21・71号文書を精読して作成した。",
    };
    const keys = extractReferencedDocuments([doc])
      .filter((o) => o.state === "read")
      .map((o) => o.documentKey);
    expect(new Set(keys)).toEqual(new Set(["01", "02", "11", "12", "21", "71"]));
  });

  it("片側の成果物にしか現れない文書を DCC-03 で検出する", () => {
    const dcc03 = subjects(checkReferencedDocumentConflicts(rows), "DCC-03");
    // 01/02/12/21/71 は計画書にしか現れない
    expect(dcc03.some((s) => s.startsWith("01"))).toBe(true);
  });

  it("declaredReferencedDocuments 未指定なら DCC-04 は0件", () => {
    const findings = findingsOf({ deliverables: [PLAN, ANALYSIS] });
    expect(findings.filter((f) => f.checkId === "DCC-04")).toHaveLength(0);
  });

  it("宣言リストと本文実体の相違を DCC-04 で検出する", () => {
    const findings = findingsOf({
      deliverables: [PLAN, ANALYSIS],
      declaredReferencedDocuments: [
        {
          deliverable: "テスト分析.md",
          readDocuments: ["11_園内チケットシステム要求仕様書.pdf", "22_Webチケットシステム画面仕様書.pdf"],
        },
      ],
    });
    const dcc04 = findings.filter((f) => f.checkId === "DCC-04");
    expect(dcc04.length).toBeGreaterThan(0);
    // 22 は本文では未読扱いなのに読了として宣言されている
    expect(dcc04.some((f) => f.subject.endsWith("22") && f.summary.includes("読了状態相違"))).toBe(true);
    // 13/72 は本文にあるが宣言リストに無い
    expect(dcc04.some((f) => f.subject.endsWith("13") && f.summary.includes("本文のみ"))).toBe(true);
  });

  it("未読宣言文書に由来するIDの実参照を DCC-05 で検出する（未指定時は0件）", () => {
    const withOwners = findingsOf({
      deliverables: [PLAN, ANALYSIS, DESIGN],
      idPrefixOwners: [{ documentKey: "13", prefixes: ["S-"] }],
    });
    const dcc05 = withOwners.filter((f) => f.checkId === "DCC-05");
    expect(dcc05).toHaveLength(1);
    expect(dcc05[0].severity).toBe("high");
    expect(dcc05[0].summary).toContain("S-008-01");

    const withoutOwners = findingsOf({ deliverables: [PLAN, ANALYSIS, DESIGN] });
    expect(withoutOwners.filter((f) => f.checkId === "DCC-05")).toHaveLength(0);
  });
});

describe("IDの成果物間相互参照（DCC-06〜DCC-08）", () => {
  it("expandIdRanges がレンジ表記を展開する", () => {
    expect(expandIdRanges("うちR-01〜R-04はテスト計画書14.1プロダクトリスクと対応する")).toEqual([
      "R-01",
      "R-02",
      "R-03",
      "R-04",
    ]);
  });

  it("expandIdRanges の境界（逆順・件数超過・プレフィックス不一致）では展開しない", () => {
    expect(expandIdRanges("R-04〜R-01")).toEqual([]);
    expect(expandIdRanges("R-0001〜R-0999")).toEqual([]);
    expect(expandIdRanges("R-01〜S-04")).toEqual([]);
  });

  it("どの成果物にも定義がない参照IDを DCC-06 で検出する", () => {
    const a: ConsistencyDeliverable = {
      name: "分析",
      kind: "test-analysis",
      content: `# 分析\n\n| ID | 内容 |\n| --- | --- |\n| TC-001 | 入場できること |\n`,
    };
    const b: ConsistencyDeliverable = {
      name: "設計",
      kind: "test-design",
      content: `# 設計\n\nTC-001 と TC-999 を対象とする。\n`,
    };
    const index = buildCrossRefIdIndex([a, b]);
    const findings = checkUnresolvedCrossRefIds(index);
    expect(findings).toHaveLength(1);
    expect(findings[0].subject).toBe("TC-999");
    expect(findings[0].severity).toBe("high");
  });

  it("未解決の網羅対象ID参照 CFG:MAIN:R99 を DCC-06 として検出する", () => {
    const designDoc: ConsistencyDeliverable = {
      name: "テスト設計書",
      kind: "test-design",
      content: [
        "# テスト設計書",
        "",
        "## 構成マトリクス",
        "",
        "| ID | 内容 |",
        "| --- | --- |",
        "| CFG:MAIN:R1 | ブラウザ=Chrome, OS=Win11 |",
      ].join("\n"),
    };
    const caseListDoc: ConsistencyDeliverable = {
      name: "テストケース一覧",
      kind: "test-design",
      content: ["# テストケース一覧", "", "本ケースは CFG:MAIN:R99 を網羅する。"].join("\n"),
    };

    const input: AuditDeliverableConsistencyInput = {
      deliverables: [designDoc, caseListDoc],
    };
    const result = analyzeDeliverableConsistency({
      ...input,
      includeCoverageTargetIds: true,
    });
    const dcc06 = result.findings.filter(
      (f) => f.checkId === "DCC-06" && f.subject === "CFG:MAIN:R99"
    );
    expect(dcc06).toHaveLength(1);

    const cfgEntry = result.crossRefIndex.find((e) => e.id === "CFG:MAIN:R1");
    expect(cfgEntry).toBeDefined();
    expect(cfgEntry?.prefix).toBe("CFG:");
    expect(cfgEntry?.owner).toBe("テスト設計書");

    const withoutCoverageTargets = analyzeDeliverableConsistency({
      ...input,
      includeCoverageTargetIds: false,
    });
    const dcc06Off = withoutCoverageTargets.findings.filter(
      (f) => f.checkId === "DCC-06" && f.subject === "CFG:MAIN:R99"
    );
    expect(dcc06Off).toHaveLength(0);
  });

  it("対応主張の裏付け欠落を DCC-07 で検出し、裏付けがあれば0件になる", () => {
    const deliverableIndex = buildDeliverableIndex([PLAN, ANALYSIS]);
    const index = buildCrossRefIdIndex([PLAN, ANALYSIS]);
    const claims = extractCorrespondenceClaims([PLAN, ANALYSIS], index, deliverableIndex);
    const findings = checkCorrespondenceClaims(claims, index);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("high");
    for (const id of ["R-01", "R-02", "R-03", "R-04"]) {
      expect(findings[0].summary).toContain(id);
    }

    const planWithRisks: ConsistencyDeliverable = {
      ...PLAN,
      content: PLAN.content.replace(
        "| 構成変更 | 入場ゲートハブ新設に伴う整合性 |",
        `| R-01 | 複数ゲート間でQRコードの整合性が崩壊する |
| R-02 | 入場制限人数パラメータ変更の影響 |
| R-03 | 応答遅延 |
| R-04 | 決済通信障害時のフォールバック不備 |`
      ),
    };
    const index2 = buildCrossRefIdIndex([planWithRisks, ANALYSIS]);
    const claims2 = extractCorrespondenceClaims(
      [planWithRisks, ANALYSIS],
      index2,
      buildDeliverableIndex([planWithRisks, ANALYSIS])
    );
    expect(checkCorrespondenceClaims(claims2, index2)).toHaveLength(0);
  });

  it("後続成果物から一度も参照されないIDを DCC-08 で検出し、最終成果物が owner のIDは対象外", () => {
    const a: ConsistencyDeliverable = {
      name: "分析",
      kind: "test-analysis",
      content: `# 分析\n\n| ID | 内容 |\n| --- | --- |\n| TC-001 | 入場できること |\n| TC-012 | 発券機が起動すること |\n`,
    };
    const b: ConsistencyDeliverable = {
      name: "設計",
      kind: "test-design",
      content: `# 設計\n\n| ID | 由来 |\n| --- | --- |\n| TCS-001 | TC-001 |\n`,
    };
    const deliverableIndex = buildDeliverableIndex([a, b]);
    const index = buildCrossRefIdIndex([a, b]);
    const findings = checkNeverReferencedIds(index, deliverableIndex);
    expect(findings.map((f) => f.subject)).toEqual(["TC-012"]);
    expect(findings[0].severity).toBe("medium");
  });
});

describe("章節参照（DCC-09〜DCC-11）", () => {
  const deliverables = [PLAN, ANALYSIS, DESIGN];
  const deliverableIndex = buildDeliverableIndex(deliverables);
  const refs = extractSectionReferences(deliverables, deliverableIndex);
  const findings = checkSectionReferences(refs, deliverableIndex);

  it("実在しない章節参照を DCC-09 で検出する", () => {
    const dcc09 = findings.filter((f) => f.checkId === "DCC-09");
    expect(dcc09.some((f) => f.subject === "テスト分析.md 8.2")).toBe(true);
    expect(dcc09.every((f) => f.severity === "high")).toBe(true);
  });

  it("番号は実在するがラベルが本文に無い参照を DCC-10 で検出する", () => {
    const dcc10 = findings.filter((f) => f.checkId === "DCC-10");
    expect(dcc10.map((f) => f.subject)).toContain("テスト設計.md 4");
    expect(dcc10.every((f) => f.severity === "medium")).toBe(true);
  });

  it("見出し一致する参照（テスト計画書11.2「ステークホルダー」）は指摘しない", () => {
    expect(
      findings.some((f) => f.checkId === "DCC-10" && f.subject === "テスト計画書.md 11.2")
    ).toBe(false);
    expect(
      findings.some((f) => f.checkId === "DCC-09" && f.subject === "テスト計画書.md 11.2")
    ).toBe(false);
  });

  it("投入されていない成果物への参照を DCC-11 で検出する", () => {
    const dcc11 = findings.filter((f) => f.checkId === "DCC-11");
    expect(dcc11.some((f) => f.subject.includes("テスト設計仕様書"))).toBe(true);
    expect(dcc11.every((f) => f.severity === "medium")).toBe(true);
  });
});

describe("記述差分（DCC-12・DCC-13）", () => {
  function pair(a: string, b: string): DeliverableConsistencyFinding[] {
    const docA: ConsistencyDeliverable = {
      name: "分析",
      kind: "test-analysis",
      content: `# 分析\n\n| ID | 内容 |\n| --- | --- |\n| TC-001 | ${a} |\n`,
    };
    const docB: ConsistencyDeliverable = {
      name: "設計",
      kind: "test-design",
      content: `# 設計\n\n| ID | 内容 |\n| --- | --- |\n| TC-001 | ${b} |\n`,
    };
    return checkIdStatementDiffs(buildIdStatementDiffs(buildCrossRefIdIndex([docA, docB])));
  }

  it("同一単位で異なる値を DCC-12 で検出する", () => {
    const findings = pair("応答が1秒以内に完了すること", "応答が2秒以内に完了すること");
    const dcc12 = findings.filter((f) => f.checkId === "DCC-12");
    expect(dcc12).toHaveLength(1);
    expect(dcc12[0].severity).toBe("high");
    expect(dcc12[0].summary).toContain("秒");
  });

  it("片側に単位付き数値が無い場合は DCC-12 を出さない", () => {
    const findings = pair("応答が1秒以内に完了すること", "応答が速やかに完了すること");
    expect(findings.filter((f) => f.checkId === "DCC-12")).toHaveLength(0);
  });

  it("2-gram 包含率がちょうど閾値のときは DCC-13 を出さず、閾値未満で検出する", () => {
    const a = "ABCDE";
    const b = "ABCDEFG";
    // bigrams(a)=4, bigrams(b)=6, 共通4 → 4/4 = 1.0
    expect(bigramContainmentRatio(a, b)).toBe(1);

    const c = "あいうえおかきくけこ"; // 9 bigrams
    const d = "あいうえおかきくXX"; // 共通は「あい..くけ」ではなく7つ
    const ratio = bigramContainmentRatio(c, d);
    expect(ratio).toBeLessThan(1);

    const same = pair("入場ゲートが3台構成で並行して入場処理できること", "入場ゲートが3台構成で並行して入場処理できること");
    expect(same.filter((f) => f.checkId === "DCC-13")).toHaveLength(0);

    const diverged = pair(
      "入場ゲートが3台構成で並行して入場処理できること",
      "発券機の印字位置が仕様どおりであること",
    );
    const dcc13 = diverged.filter((f) => f.checkId === "DCC-13");
    expect(dcc13).toHaveLength(1);
    expect(dcc13[0].severity).toBe("medium");
    expect(BIGRAM_CONTAINMENT_THRESHOLD).toBe(0.8);
  });

  it("実データ相当の要約差（TC-002 / TC-013）では DCC-13 を出さない", () => {
    const analysisText =
      "同一の入場用QRコードを2台以上の入場ゲートからほぼ同時にタッチした場合、1台のゲートのみ入場可となること";
    const designText =
      "同一の入場用QRコードを2台以上の入場ゲートからほぼ同時にタッチした場合、1台のゲートのみ入場可となること(排他制御)";
    const findings = pair(analysisText, designText);
    expect(findings.filter((f) => f.checkId === "DCC-13")).toHaveLength(0);
  });
});

describe("件数・網羅率宣言（DCC-15）", () => {
  it("件数宣言と同一セルのID列挙数の不一致を検出し、一致すれば0件", () => {
    const index = buildCrossRefIdIndex([PLAN, ANALYSIS, DESIGN]);
    const claims = extractCountClaims([DESIGN]);
    const findings = checkCountClaims(claims, index, undefined).filter(
      (f) => f.checkId === "DCC-15"
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("high");
    expect(findings[0].summary).toContain("7件");

    const fixed: ConsistencyDeliverable = {
      ...DESIGN,
      content: DESIGN.content.replace("7件（TCS-010", "5件（TCS-010"),
    };
    const fixedClaims = extractCountClaims([fixed]);
    expect(checkCountClaims(fixedClaims, index, undefined)).toHaveLength(0);
  });

  it("網羅率宣言の率が分子分母と一致しない場合に検出する", () => {
    const ok: ConsistencyDeliverable = {
      name: "設計",
      kind: "test-design",
      content: `# 設計\n\n| 観点 | 網羅 |\n| --- | --- |\n| 状態網羅 | 6/6（100.0%） |\n`,
    };
    const ng: ConsistencyDeliverable = {
      ...ok,
      content: ok.content.replace("100.0%", "50.0%"),
    };
    const index: ReturnType<typeof buildCrossRefIdIndex> = [];
    expect(checkCountClaims(extractCountClaims([ok]), index, undefined)).toHaveLength(0);
    const findings = checkCountClaims(extractCountClaims([ng]), index, undefined);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("high");
  });

  it("countClaimSubjects 指定時、宣言件数と定義済みID実数の不一致を検出する", () => {
    const analysis: ConsistencyDeliverable = {
      name: "分析",
      kind: "test-analysis",
      content: `# 分析\n\nプロダクトリスクは R-01(整合性崩壊)〜R-03(応答遅延)の7件。\n\n| ID | 内容 |\n| --- | --- |\n| R-01 | 整合性崩壊 |\n| R-02 | パラメータ変更 |\n| R-03 | 応答遅延 |\n`,
    };
    const design: ConsistencyDeliverable = {
      name: "設計",
      kind: "test-design",
      content: `# 設計\n\n対象は R-01 である。\n`,
    };
    const index = buildCrossRefIdIndex([analysis, design]);
    const subjectsInput = [{ keyword: "プロダクトリスク", idPrefix: "R-" }];
    const claims = extractCountClaims([analysis, design], { countClaimSubjects: subjectsInput });
    const findings = checkCountClaims(claims, index, subjectsInput).filter(
      (f) => f.checkId === "DCC-15"
    );
    expect(findings.some((f) => f.summary.includes("3 件"))).toBe(true);
  });
});

describe("網羅率の母集団照合（DCC-16 / DCC-17）", () => {
  function buildTcDefinitions(count: number): string {
    return Array.from(
      { length: count },
      (_, i) => `| TC-${String(i + 1).padStart(3, "0")} | 条件${i + 1} |`
    ).join("\n");
  }

  const ANALYSIS_20: ConsistencyDeliverable = {
    name: "分析.md",
    kind: "test-analysis",
    content: `# 分析\n\n## 2 テスト条件\n\n| ID | 内容 |\n| --- | --- |\n${buildTcDefinitions(20)}\n`,
  };

  const DESIGN_RATIO: ConsistencyDeliverable = {
    name: "設計.md",
    kind: "test-design",
    content: `# 設計\n\n### 3.6 網羅率\n\n| テスト条件網羅率 | 8/8（100%） |\n`,
  };

  it("網羅率宣言の分母が本文定義ID実数と一致しない場合に DCC-16 を high で検出する", () => {
    const index = buildCrossRefIdIndex([ANALYSIS_20, DESIGN_RATIO]);
    const subjectsInput = [{ keyword: "テスト条件", idPrefix: "TC-" }];
    const claims = extractCountClaims([ANALYSIS_20, DESIGN_RATIO], { countClaimSubjects: subjectsInput });
    const findings = checkCountClaims(claims, index, subjectsInput);
    const dcc16 = findings.filter((f) => f.checkId === "DCC-16");
    expect(dcc16).toHaveLength(1);
    expect(dcc16[0].severity).toBe("high");
    expect(dcc16[0].summary).toContain("20");
    expect(dcc16[0].summary).toContain("8");
    expect(findings.filter((f) => f.checkId === "DCC-15")).toHaveLength(0);
  });

  it("countClaimSubjects 未指定でも既定主語カタログで母集団を解決して DCC-16 を出す", () => {
    const index = buildCrossRefIdIndex([ANALYSIS_20, DESIGN_RATIO]);
    const claims = extractCountClaims([ANALYSIS_20, DESIGN_RATIO]);
    const findings = checkCountClaims(claims, index, undefined);
    expect(findings.filter((f) => f.checkId === "DCC-16")).toHaveLength(1);
  });

  it("分母が本文定義ID実数と一致していれば DCC-16 を出さない", () => {
    const analysis8: ConsistencyDeliverable = {
      ...ANALYSIS_20,
      content: `# 分析\n\n## 2 テスト条件\n\n| ID | 内容 |\n| --- | --- |\n${buildTcDefinitions(8)}\n`,
    };
    const index = buildCrossRefIdIndex([analysis8, DESIGN_RATIO]);
    const subjectsInput = [{ keyword: "テスト条件", idPrefix: "TC-" }];
    const claims = extractCountClaims([analysis8, DESIGN_RATIO], { countClaimSubjects: subjectsInput });
    const findings = checkCountClaims(claims, index, subjectsInput);
    expect(findings.filter((f) => f.checkId === "DCC-15")).toHaveLength(0);
    expect(findings.filter((f) => f.checkId === "DCC-16")).toHaveLength(0);
  });

  it("主語を解決できない網羅率宣言では DCC-16 を出さない", () => {
    const index = buildCrossRefIdIndex([DESIGN]);
    const claims = extractCountClaims([DESIGN]);
    const findings = checkCountClaims(claims, index, undefined);
    expect(findings.filter((f) => f.checkId === "DCC-16")).toHaveLength(0);
  });

  it("分子分母を伴わない達成度%を DCC-17 medium で検出する", () => {
    const bare: ConsistencyDeliverable = {
      name: "設計.md",
      kind: "test-design",
      content: `# 設計\n\n### 3.6 網羅率\n\n| テスト条件網羅率 | 100% |\n`,
    };
    const claims = extractCountClaims([bare]);
    const findings = checkCountClaims(claims, [], undefined);
    const dcc17 = findings.filter((f) => f.checkId === "DCC-17");
    expect(dcc17).toHaveLength(1);
    expect(dcc17[0].severity).toBe("medium");
  });

  it("目標値・閾値としての%は DCC-17 を出さない", () => {
    const target: ConsistencyDeliverable = {
      name: "計画.md",
      kind: "test-plan",
      content: `# 計画\n\n網羅率は目標90%以上とする。\n`,
    };
    const claims = extractCountClaims([target]);
    const findings = checkCountClaims(claims, [], undefined);
    expect(findings.filter((f) => f.checkId === "DCC-17")).toHaveLength(0);
  });

  it("分子分母が併記された%は DCC-17 を出さない", () => {
    const grounded: ConsistencyDeliverable = {
      name: "設計.md",
      kind: "test-design",
      content: `# 設計\n\n| 観点 | 網羅 |\n| --- | --- |\n| 状態網羅率 | 6/6（100.0%） |\n| 条件網羅率 | 8件中8件（100%） |\n`,
    };
    const claims = extractCountClaims([grounded]);
    const findings = checkCountClaims(claims, [], undefined);
    expect(findings.filter((f) => f.checkId === "DCC-17")).toHaveLength(0);
  });

  it("分子が分母を超える網羅率宣言を DCC-15 で検出する", () => {
    const overflow: ConsistencyDeliverable = {
      name: "設計.md",
      kind: "test-design",
      content: `# 設計\n\n| 観点 | 網羅 |\n| --- | --- |\n| 状態網羅 | 9/8（112.5%） |\n`,
    };
    const claims = extractCountClaims([overflow]);
    const findings = checkCountClaims(claims, [], undefined);
    const dcc15 = findings.filter((f) => f.checkId === "DCC-15");
    expect(dcc15.length).toBeGreaterThan(0);
    expect(dcc15.every((f) => f.severity === "high")).toBe(true);
  });
});

describe("共通項目の片側欠落（DCC-14）", () => {
  const planScope: ConsistencyDeliverable = {
    name: "計画書",
    kind: "test-plan",
    content: `# 計画書\n\n## 1.4 対象外\n\n- 性能テスト\n- セキュリティテスト\n- 移行テスト\n- 運用テスト\n`,
  };
  const analysisScope: ConsistencyDeliverable = {
    name: "分析",
    kind: "test-analysis",
    content: `# 分析\n\n## 0.2 対象外\n\n- 性能テスト\n- セキュリティテスト\n`,
  };

  it("片側にしかない項目を DCC-14 で検出する", () => {
    const items = extractSharedItems([planScope, analysisScope]);
    const findings = checkSharedItemGaps(items, [planScope, analysisScope]);
    expect(findings.every((f) => f.checkId === "DCC-14" && f.severity === "medium")).toBe(true);
    expect(findings.map((f) => f.summary).join("\n")).toContain("移行テスト");
    expect(findings.map((f) => f.summary).join("\n")).toContain("運用テスト");
    expect(findings).toHaveLength(2);
  });

  it("完全一致なら0件", () => {
    const same: ConsistencyDeliverable = {
      ...analysisScope,
      content: `# 分析\n\n## 0.2 対象外\n\n- 性能テスト\n- セキュリティテスト\n- 移行テスト\n- 運用テスト\n`,
    };
    const items = extractSharedItems([planScope, same]);
    expect(checkSharedItemGaps(items, [planScope, same])).toHaveLength(0);
  });
});

describe("純関数としての性質", () => {
  const input: AuditDeliverableConsistencyInput = {
    deliverables: [PLAN, ANALYSIS, DESIGN],
    declaredReferencedDocuments: [
      { deliverable: "テスト計画書.md", readDocuments: ["11"], unreadDocuments: ["13", "22", "72"] },
    ],
    idPrefixOwners: [{ documentKey: "13", prefixes: ["S-"] }],
    countClaimSubjects: [{ keyword: "プロダクトリスク", idPrefix: "R-" }],
  };

  it("入力を破壊しない", () => {
    const snapshot = JSON.parse(JSON.stringify(input));
    analyzeDeliverableConsistency(input);
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot);
  });

  it("同一入力で2回実行しても同一結果になる", () => {
    const first = analyzeDeliverableConsistency(input);
    const second = analyzeDeliverableConsistency(input);
    expect(JSON.stringify(second.findings)).toBe(JSON.stringify(first.findings));
    expect(second.summary).toEqual(first.summary);
  });

  it("指摘番号が DC-001 から連番で付与される", () => {
    const { findings } = analyzeDeliverableConsistency(input);
    expect(findings.length).toBeGreaterThan(0);
    findings.forEach((f, i) => {
      expect(f.no).toBe(`DC-${String(i + 1).padStart(3, "0")}`);
    });
  });

  it("DCC-05 は idOccurrences の実体照合を伴う", () => {
    const rows = buildReferencedDocumentMatrix(
      extractReferencedDocuments([PLAN, ANALYSIS, DESIGN]),
      [PLAN, ANALYSIS, DESIGN]
    );
    const occurrences = extractIdOccurrences([
      { name: PLAN.name, content: PLAN.content },
      { name: ANALYSIS.name, content: ANALYSIS.content },
    ]);
    // S- のIDが本文に存在しないため、未読宣言だけでは指摘しない
    expect(
      checkUnreadDocumentIdUsage(rows, occurrences, [{ documentKey: "13", prefixes: ["S-"] }])
    ).toHaveLength(0);
  });
});
