import type { TestBasisReviewChecklist } from "../types.js";

// テストベース（要件・仕様）レビューのための意味的レビューチェックリスト。
// JSTQB等の逐語転載はせず、確認観点を自作の日本語文で要約している。
// glossaryRefs は jstqbGlossary.terms の id を参照する。
export const testBasisReviewChecklist: TestBasisReviewChecklist = {
  name: "テストベースレビューチェックリスト",
  items: [
    {
      id: "TB-01",
      severity: "high",
      title: "ID体系の一貫性",
      check:
        "要件ID・機能IDの付与規則（プレフィックス、連番の桁数、階層の深さ）が文書全体で統一され、重複・欠番が説明可能かを確認する。",
      improvementActions: [
        "ID付与規則を冒頭に明記する",
        "重複IDを採番し直し、旧IDとの対応表を残す",
        "欠番は意図的か削除跡かを注記する",
      ],
    },
    {
      id: "TB-02",
      severity: "high",
      title: "参照の解決可能性",
      check:
        "本文中のID参照・図表参照・他文書参照が、参照先の実体に到達できる形になっているかを確認する。",
      improvementActions: [
        "未解決参照の参照先を追記または参照を削除する",
        "文書名＋章番号＋IDの3点で参照表記を統一する",
      ],
    },
    {
      id: "TB-03",
      severity: "high",
      title: "文書間整合",
      check:
        "同一の仕様が複数文書に記述されている場合に、値・条件・用語が食い違っていないかを確認する。",
      improvementActions: [
        "正となる文書を決め他文書は参照に置き換える",
        "差異一覧を作成し依頼元に確認する",
      ],
    },
    {
      id: "TB-04",
      severity: "medium",
      title: "用語定義と用語の一貫使用",
      check:
        "用語が定義されており、同義語・表記揺れ（同一対象の別名）なく一貫して使われているかを確認する。",
      improvementActions: [
        "用語集を作成し正式名称を1つに固定する",
        "表記揺れ箇所を一括置換し、置換対象語を記録する",
      ],
    },
    {
      id: "TB-05",
      severity: "high",
      title: "数量条件の境界の明示",
      check:
        "数値・時刻・期間・桁数などの条件について、境界（以上/以下/未満/超/以内）と単位・丸め規則が明示されているかを確認する。",
      improvementActions: [
        "境界語を補い、両端の値がどちらに属するかを書き切る",
        "単位と丸め・切り捨て規則を追記する",
      ],
    },
    {
      id: "TB-06",
      severity: "medium",
      title: "状態と遷移の網羅",
      check:
        "対象の取り得る状態と、状態間の遷移条件・禁止遷移が漏れなく規定されているかを確認する。",
      improvementActions: [
        "状態遷移表を作成し空欄を依頼元に確認する",
        "禁止遷移時の振る舞いを明記する",
      ],
    },
    {
      id: "TB-07",
      severity: "high",
      title: "異常系・タイムアウト・リトライの規定",
      check:
        "入力エラー・機器障害・通信失敗時の振る舞い、タイムアウト値、リトライ回数と打ち切り後の処理が規定されているかを確認する。",
      improvementActions: [
        "異常系のケースごとに期待動作と利用者への通知内容を定義する",
        "タイムアウト値とリトライ上限を数値で規定する",
      ],
      glossaryRefs: ["functional-testing"],
    },
    {
      id: "TB-08",
      severity: "medium",
      title: "並行操作・競合時の規定",
      check:
        "複数利用者・複数端末の同時操作や在庫・座席などの資源競合時の扱いが規定されているかを確認する。",
      improvementActions: [
        "競合時の勝敗ルールと排他範囲を明記する",
        "同時実行の上限と超過時の挙動を規定する",
      ],
    },
    {
      id: "TB-09",
      severity: "medium",
      title: "外部連携の責務境界",
      check:
        "外部システム・外部機器との連携について、責務分担・データ形式・連携失敗時の責任範囲が定義されているかを確認する。",
      improvementActions: [
        "連携I/Fの入出力項目とエラーコード一覧を追記する",
        "障害時の一次切り分け責任を明記する",
      ],
      glossaryRefs: ["integration-testing"],
    },
    {
      id: "TB-10",
      severity: "high",
      title: "非機能要求の測定可能性",
      check:
        "性能・可用性・セキュリティなどの非機能要求が、測定方法と合否ラインを伴う形で書かれているかを確認する。",
      improvementActions: [
        "目標値・測定条件・測定方法の3点セットで書き直す",
        "定性表現を数値目標に置き換える",
      ],
      glossaryRefs: ["non-functional-testing"],
    },
    {
      id: "TB-11",
      severity: "medium",
      title: "スコープ外／既に保証済み範囲の明示",
      check:
        "テスト対象外の範囲、既に他工程で保証済みの範囲が明示され、その根拠が示されているかを確認する。",
      improvementActions: [
        "対象外範囲とその理由を一覧化する",
        "保証済みとする根拠成果物を参照として示す",
      ],
    },
    {
      id: "TB-12",
      severity: "low",
      title: "変更履歴と差分の追跡性",
      check:
        "版数・変更履歴が記録され、前版からの差分と影響範囲が追跡できるかを確認する。",
      improvementActions: [
        "変更履歴に変更IDと影響範囲を記載する",
        "版間差分の一覧を添付してもらう",
      ],
      glossaryRefs: ["change-related-testing"],
    },
    {
      id: "TB-13",
      severity: "high",
      title: "テスト可能性",
      check:
        "各記述から観測可能な期待結果を書けるか、事前条件と判定手段が読み取れるかを確認する。",
      improvementActions: [
        "観測できない記述を観測可能な事象へ言い換える",
        "判定に必要なログ・画面表示を明記する",
      ],
      glossaryRefs: ["test-condition", "exit-criteria"],
    },
  ],
};
