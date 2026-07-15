import type { TestPlanReviewChecklist } from "../types.js";

// テスト計画書レビューのための意味的レビューチェックリスト。
// JSTQB・ISO/IEC/IEEE 29119 の逐語転載はせず、確認観点を自作の日本語文で要約している。
// glossaryRefs は jstqbGlossary.terms の id、chapterRefs は testPlanTemplate.sections の no
// （実在する値）のみを参照する。
export const testPlanReviewChecklist: TestPlanReviewChecklist = {
  name: "テスト計画書レビューチェックリスト（JSTQB/29119観点）",
  items: [
    {
      id: "CL-01",
      severity: "high",
      title: "テストレベルの妥当性",
      check:
        "対象とするテストレベルが定義されており、テスト対象の規模・構成に照らして過不足がないかを確認する。",
      glossaryRefs: [
        "component-testing",
        "integration-testing",
        "system-testing",
        "acceptance-testing",
      ],
      chapterRefs: ["5.1"],
    },
    {
      id: "CL-02",
      severity: "high",
      title: "テストタイプの網羅性",
      check:
        "機能面・非機能面のテストタイプが選定されており、重要な品質特性の確認が漏れていないかを確認する。",
      glossaryRefs: ["functional-testing", "non-functional-testing"],
      chapterRefs: ["5.2"],
    },
    {
      id: "CL-03",
      severity: "medium",
      title: "テスト技法・観点の明確さ",
      check:
        "テスト条件・テスト観点の識別方針が示されており、技法選定の根拠が読み取れるかを確認する。",
      glossaryRefs: ["test-condition", "test-perspective"],
      chapterRefs: ["5.3"],
    },
    {
      id: "CL-04",
      severity: "high",
      title: "開始・終了基準の測定可能性",
      check:
        "エントリー基準・イグジット基準の双方が、客観的に判定可能な形で定義されているかを確認する。",
      glossaryRefs: ["entry-criteria", "exit-criteria"],
      chapterRefs: ["6.1"],
    },
    {
      id: "CL-05",
      severity: "high",
      title: "中断・再開基準",
      check:
        "テストを中断する基準と、中断後に再開してよいと判断する基準の双方が定義されているかを確認する。",
      glossaryRefs: ["suspension-criteria", "resumption-criteria"],
      chapterRefs: ["7"],
    },
    {
      id: "CL-06",
      severity: "medium",
      title: "合否判定基準の客観性",
      check: "テスト実施結果の合否判定基準が、主観に依らず判定できる内容になっているかを確認する。",
      glossaryRefs: ["exit-criteria"],
      chapterRefs: ["6.2"],
    },
    {
      id: "CL-07",
      severity: "medium",
      title: "完了基準と終了基準の整合",
      check:
        "テストの完了基準が終了基準と矛盾しておらず、測定可能な形で記述されているかを確認する。",
      glossaryRefs: ["exit-criteria"],
      chapterRefs: ["6.3"],
    },
    {
      id: "CL-08",
      severity: "high",
      title: "スコープ・対象の明確さ",
      check:
        "スコープ、テスト対象、対象機能・対象外機能の境界が具体的に記述されているかを確認する。",
      chapterRefs: ["1.1", "2", "3", "4"],
    },
    {
      id: "CL-09",
      severity: "medium",
      title: "テストベースの参照",
      check:
        "テスト設計の根拠となるテストベース（要件・仕様等）が明示的に参照されているかを確認する。",
      glossaryRefs: ["test-condition"],
      chapterRefs: ["1.3"],
    },
    {
      id: "CL-10",
      severity: "high",
      title: "プロダクトリスクの識別",
      check:
        "プロダクトリスクが識別されており、その影響と対策がリスクベースドの観点で示されているかを確認する。",
      chapterRefs: ["14.1"],
    },
    {
      id: "CL-11",
      severity: "medium",
      title: "環境・テストデータ要件",
      check:
        "テスト環境要件とテストデータ要件が、実行可能なレベルまで具体的に記述されているかを確認する。",
      chapterRefs: ["10.1", "10.2"],
    },
    {
      id: "CL-12",
      severity: "medium",
      title: "責任分担・体制",
      check: "役割と責任が明確に定義され、テスト体制が具体的に示されているかを確認する。",
      chapterRefs: ["11.1"],
    },
    {
      id: "CL-13",
      severity: "low",
      title: "スケジュールの実現性",
      check:
        "テスト期間・マイルストーンが、対象範囲や体制に照らして現実的な計画になっているかを確認する。",
      chapterRefs: ["13.1", "13.2"],
    },
    {
      id: "CL-14",
      severity: "low",
      title: "成果物の定義",
      check: "テストで作成する成果物が明示され、何を誰がいつ作るかが読み取れるかを確認する。",
      chapterRefs: ["8"],
    },
  ],
};
