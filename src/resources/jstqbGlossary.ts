import type { JstqbGlossary } from "../types.js";

// Definitions below are paraphrased summaries aligned with JSTQB (ISTQB-based)
// Foundation Level syllabus terminology, not verbatim glossary/syllabus text.
export const jstqbGlossary: JstqbGlossary = {
  source: "JSTQB Foundation Level Syllabus terminology (paraphrased)",
  terms: [
    // --- テストレベル ---
    {
      id: "component-testing",
      category: "test-level",
      nameJa: "コンポーネントテスト（単体テスト）",
      nameEn: "Component Testing (Unit Testing)",
      definition: "個々のモジュールやクラスなど、独立してテスト可能な最小単位を対象に、他の部分から切り離して確認するテストレベル。",
      isoRef: "approach",
    },
    {
      id: "integration-testing",
      category: "test-level",
      nameJa: "統合テスト",
      nameEn: "Integration Testing",
      definition: "複数のコンポーネントやシステム間のインタフェース・連携動作が意図どおりかを確認するテストレベル。",
      isoRef: "approach",
    },
    {
      id: "system-testing",
      category: "test-level",
      nameJa: "システムテスト",
      nameEn: "System Testing",
      definition: "統合されたシステム全体を対象に、機能・非機能要件を満たしているかを確認するテストレベル。",
      isoRef: "approach",
    },
    {
      id: "acceptance-testing",
      category: "test-level",
      nameJa: "受け入れテスト",
      nameEn: "Acceptance Testing",
      definition: "顧客・利用者の要求を満たし、システムが受け入れ可能な状態かを判断するために行う最終段階のテストレベル。",
      isoRef: "approach",
    },
    // --- テストタイプ ---
    {
      id: "functional-testing",
      category: "test-type",
      nameJa: "機能テスト",
      nameEn: "Functional Testing",
      definition: "システムが何を行うか（機能要件）に着目し、期待どおりの振る舞いをするかを確認するテストタイプ。",
      isoRef: "approach",
    },
    {
      id: "non-functional-testing",
      category: "test-type",
      nameJa: "非機能テスト",
      nameEn: "Non-functional Testing",
      definition: "性能・信頼性・ユーザビリティ・移植性など、システムがどのように動作するか（品質特性）を評価するテストタイプ。",
      isoRef: "approach",
    },
    {
      id: "structural-testing",
      category: "test-type",
      nameJa: "構造テスト（ホワイトボックステスト）",
      nameEn: "Structural (White-box) Testing",
      definition: "コードやアーキテクチャの内部構造（分岐・パス等）に基づいてテストを設計・評価するテストタイプ。",
      isoRef: "approach",
    },
    {
      id: "change-related-testing",
      category: "test-type",
      nameJa: "変更部分に関するテスト（確認テスト・回帰テスト）",
      nameEn: "Change-related Testing (Confirmation & Regression Testing)",
      definition: "修正・変更が意図どおり反映されたかを確認する確認テストと、変更が既存機能に悪影響を与えていないかを確認する回帰テストの総称。",
      isoRef: "approach",
    },
    // --- 開始/終了基準 ---
    {
      id: "entry-criteria",
      category: "criteria",
      nameJa: "開始基準（エントリー基準）",
      nameEn: "Entry Criteria",
      definition: "あるテスト活動を開始するために満たしておくべき前提条件。",
      isoRef: "item-pass-fail-criteria",
    },
    {
      id: "exit-criteria",
      category: "criteria",
      nameJa: "終了基準（イグジット基準）",
      nameEn: "Exit Criteria",
      definition: "あるテスト活動を完了したとみなすために満たすべき条件。",
      isoRef: "item-pass-fail-criteria",
    },
    {
      id: "suspension-criteria",
      category: "criteria",
      nameJa: "中断基準",
      nameEn: "Suspension Criteria",
      definition: "進行中のテスト活動を一時的に停止する必要があると判断する基準。",
      isoRef: "suspension-resumption-criteria",
    },
    {
      id: "resumption-criteria",
      category: "criteria",
      nameJa: "再開基準",
      nameEn: "Resumption Criteria",
      definition: "中断していたテスト活動を再び開始してよいと判断する基準。",
      isoRef: "suspension-resumption-criteria",
    },
    // --- テスト条件・テスト観点 ---
    {
      id: "test-condition",
      category: "test-condition",
      nameJa: "テスト条件",
      nameEn: "Test Condition",
      definition: "テストベース（要件・仕様等）の分析から導出される、テストで検証すべき対象・状態・振る舞いの単位。",
      isoRef: "approach",
    },
    {
      id: "test-perspective",
      category: "test-perspective",
      nameJa: "テスト観点",
      nameEn: "Test Perspective (Test Viewpoint)",
      definition: "テスト条件を洗い出す際に用いる着眼点（正常系/異常系、境界値、利用シーン等）の分類軸。",
      isoRef: "approach",
    },
    // --- レビュータイプ ---
    {
      id: "informal-review",
      category: "review-type",
      nameJa: "非公式レビュー",
      nameEn: "Informal Review",
      definition: "定められた手順を伴わない、比較的軽量な形式で行われるレビュー。",
    },
    {
      id: "walkthrough",
      category: "review-type",
      nameJa: "ウォークスルー",
      nameEn: "Walkthrough",
      definition: "作成者が説明役となり、成果物の内容を参加者と共有しながら理解の一致や課題を洗い出すレビュー形式。",
    },
    {
      id: "technical-review",
      category: "review-type",
      nameJa: "テクニカルレビュー",
      nameEn: "Technical Review",
      definition: "技術的な観点から専門家が成果物を評価し、欠陥や改善点を識別する、ある程度形式化されたレビュー。",
    },
    {
      id: "inspection",
      category: "review-type",
      nameJa: "インスペクション",
      nameEn: "Inspection",
      definition: "定義された役割・手順・記録に基づいて実施される、最も形式的で厳密なレビュー手法。",
    },
  ],
};
