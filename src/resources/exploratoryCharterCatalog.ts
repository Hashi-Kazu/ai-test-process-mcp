import type { ExploratoryCharterCatalog } from "../types.js";

// 探索的テスト（経験ベース技法）のチャーター設計を独自に整理したカタログ。
// 観点区分・確認観点・操作観点・停止の目安・チャーター表の列構成はすべて自作の
// パラフレーズであり、外部文献の逐語転載や特定の外部基準への適合を主張するものではない。
export const exploratoryCharterCatalog: ExploratoryCharterCatalog = {
  name: "探索的テストチャーターカタログ（自作整理）",
  note:
    "経験ベースのテスト技法（探索的テスト・エラー推測・チェックリストベースドテスト）でチャーターを設計する際の" +
    "観点区分・確認観点・操作観点・停止の目安を独自に整理したものであり、外部文献の逐語転載やその適合を主張するものではない。",
  charterAreas: [
    {
      id: "ECA-01",
      nameJa: "機能横断",
      summary: "複数の機能・画面をまたいだ操作でのみ表面化する不整合を狙う観点区分。",
      checkFocusExamples: [
        "ある機能で行った操作結果が、別の機能の表示・集計に正しく反映されているか",
        "画面をまたいで持ち回るデータ（選択内容・入力値）が途中で失われていないか",
      ],
      operationFocusExamples: [
        "通常の導線とは異なる順序で複数機能を行き来してみる",
        "一方の機能で更新した直後に、別機能から同じ対象を参照・更新してみる",
      ],
      relatedPerspectiveCategoryIds: ["TPC-01", "TPC-06", "TPC-18"],
      recommendedTimeboxMinutes: 60,
      stopHeuristics: [
        "同種の不整合が3回続けて再現し、追加の新規発見が乏しくなった",
        "予定したタイムボックスの残り時間が5分を切った",
      ],
    },
    {
      id: "ECA-02",
      nameJa: "状態・中断",
      summary: "処理の中断・再開・多重操作によって内部状態が崩れる不具合を狙う観点区分。",
      checkFocusExamples: [
        "処理の途中で中断しても、再開時に矛盾のない状態へ戻るか",
        "同じ操作を連打・多重実行しても状態が二重に進行しないか",
      ],
      operationFocusExamples: [
        "処理の途中でブラウザバック・タブ閉じ・通信断を意図的に発生させる",
        "確定ボタンを短時間に複数回連続で押す",
      ],
      relatedPerspectiveCategoryIds: ["TPC-05", "TPC-11"],
      recommendedTimeboxMinutes: 45,
      stopHeuristics: [
        "想定した中断パターンを一巡し、新しい崩れ方が見つからなくなった",
        "同一の状態不整合を報告済みで、これ以上の深掘りが低価値になった",
      ],
    },
    {
      id: "ECA-03",
      nameJa: "データ整合",
      summary: "保存・集計・表示の間でデータの値や件数がずれる不具合を狙う観点区分。",
      checkFocusExamples: [
        "登録・更新・削除の各操作後、一覧・詳細・集計値が同じ値を指しているか",
        "同じデータを異なる画面から見たときに表記や単位が食い違っていないか",
      ],
      operationFocusExamples: [
        "登録直後に一覧・詳細・集計の3画面を素早く見比べる",
        "同じレコードを複数の切り口（検索・並び替え・絞り込み）から辿ってみる",
      ],
      relatedPerspectiveCategoryIds: ["TPC-09", "TPC-07"],
      recommendedTimeboxMinutes: 60,
      stopHeuristics: [
        "主要な参照経路（一覧・詳細・集計）を一通り突き合わせ終えた",
        "見つかった不整合の再現条件が特定でき、これ以上の探索より再現手順の記録を優先すべきと判断した",
      ],
    },
    {
      id: "ECA-04",
      nameJa: "運用・例外",
      summary: "通常操作から外れた入力・権限・エラー経路での挙動を狙う観点区分。",
      checkFocusExamples: [
        "想定外の入力やエラー発生時に、利用者へ状況が分かる形で通知されるか",
        "権限のない操作を試みたとき、意図した範囲で拒否されるか",
      ],
      operationFocusExamples: [
        "通信断・タイムアウト・サーバーエラーを人為的に発生させてみる",
        "本来の権限より広い操作をURL直打ちやAPI呼び出しで試してみる",
      ],
      relatedPerspectiveCategoryIds: ["TPC-14", "TPC-02"],
      recommendedTimeboxMinutes: 60,
      stopHeuristics: [
        "主要なエラー経路（入力エラー・通信エラー・権限エラー）を一通り試し終えた",
        "同種のエラー処理不備が繰り返し見つかり、根本原因の報告を優先すべきと判断した",
      ],
    },
    {
      id: "ECA-05",
      nameJa: "環境・構成",
      summary: "利用環境・設定・組み合わせの違いによって挙動が変わる不具合を狙う観点区分。",
      checkFocusExamples: [
        "異なる環境・端末・設定の組み合わせでも表示や動作が崩れないか",
        "初期設定と変更後設定の両方で同じ操作結果になるか",
      ],
      operationFocusExamples: [
        "画面サイズ・言語設定・権限ロールなど条件を1つずつ変えて同じ操作を繰り返す",
        "普段使わない設定の組み合わせ（例: 通知オフ×多言語）を意図的に選んでみる",
      ],
      relatedPerspectiveCategoryIds: ["TPC-10", "TPC-17"],
      recommendedTimeboxMinutes: 45,
      stopHeuristics: [
        "優先度の高い環境・設定の組み合わせを一巡した",
        "組み合わせを変えても同じ崩れ方しか出なくなった",
      ],
    },
    {
      id: "ECA-06",
      nameJa: "時刻境界",
      summary: "日付・時刻・締め時刻をまたぐ境界での挙動を狙う観点区分。",
      checkFocusExamples: [
        "締め時刻・日付変更・期限の前後で扱いが正しく切り替わるか",
        "時刻に依存する集計・通知が想定したタイミングで発生するか",
      ],
      operationFocusExamples: [
        "締め時刻の直前・直後に操作を行ってみる",
        "日付・時刻設定を変更した状態や、月末・年末をまたぐ状態で操作してみる",
      ],
      relatedPerspectiveCategoryIds: ["TPC-08", "TPC-03", "TPC-12"],
      recommendedTimeboxMinutes: 45,
      stopHeuristics: [
        "主要な時刻境界（締め時刻・日付変更・期限）を一通り試し終えた",
        "境界付近での挙動が安定しており、新しい発見が出なくなった",
      ],
    },
  ],
  tableColumns: [
    { id: "ECC-01", nameJa: "観点区分", description: "対象とする観点区分（ECA-XX）とその名称。" },
    { id: "ECC-02", nameJa: "確認観点", description: "何が守られているべきかを列挙した確認観点。" },
    { id: "ECC-03", nameJa: "操作観点", description: "どう操作して揺さぶるかを列挙した操作観点。" },
    { id: "ECC-04", nameJa: "実施内容(ミッション)", description: "セッションで何を探索するかを述べたミッション文。" },
    { id: "ECC-05", nameJa: "実施者・タイムボックス", description: "実施者・スキルレベルと1セッションの時間枠。" },
    { id: "ECC-06", nameJa: "障害記録", description: "セッション中に見つかった不具合の記録（不具合No・要約・重大度）。" },
  ],
  allocationProcedure: [
    "高優先度テスト条件とリスクを、関連する観点区分（ECA-XX）へ割り付ける。",
    "割り付け結果の量に応じて、区分ごとに実施するチャーター数を決める。",
    "各チャーターへ観点区分の推奨タイムボックスを割り当て、合計をセッション時間予算に収める。",
    "予算に収まらない場合は優先度の低いチャーターを削るか、区分を統合する。",
    "リスク・条件の割り付けが無かった区分は、今回の対象範囲として不要かどうかを判断する。",
  ],
};
