import type { ThresholdChangeImpactCriteria } from "../types.js";

// reexpand_threshold_changes の判定区分カタログ。自作のパラフレーズであり、原典の逐語転載はしない。
export const thresholdChangeImpactCriteria: ThresholdChangeImpactCriteria = {
  name: "閾値変更 影響判定区分カタログ",
  summary:
    "閾値パラメータ表の変更前後2スナップショットを突き合わせたとき、既存のテスト条件・テストケース・網羅対象へ与える影響の種類を分類するための判定区分。",
  categories: [
    {
      id: "TCI-01",
      nameJa: "旧値の直値残存",
      severity: "high",
      description: "変更前の値が成果物本文に直値で残っている。",
      action: "旧値の直値をパラメータ名参照へ置き換え、期待結果の数値を変更後の値で再計算すること。",
    },
    {
      id: "TCI-02",
      nameJa: "網羅対象IDの失効",
      severity: "high",
      description:
        "ケースの coverageTargets が再展開後に存在しない BV:/EP: 形式の網羅対象IDを参照している。",
      action: "coverageTargets を再展開後の網羅対象IDへ差し替え、期待結果の境界値を再計算すること。",
    },
    {
      id: "TCI-03",
      nameJa: "参照名経由の影響",
      severity: "medium",
      description:
        "パラメータ名で参照しているため本文修正は不要だが、期待結果の妥当性再確認が必要。",
      action:
        "本文修正は不要だが、期待結果・前提条件の数値記述が変更後の値と整合するか確認すること。",
    },
    {
      id: "TCI-04",
      nameJa: "単位の変更",
      severity: "high",
      description: "単位が変わっており、値が同じでも意味が変わる。",
      action: "単位の変更を前提条件・期待結果の記述に反映し、換算の要否を確認すること。",
    },
    {
      id: "TCI-05",
      nameJa: "削除パラメータの参照残存",
      severity: "high",
      description: "削除されたパラメータを成果物がまだ参照している。",
      action: "参照元のテスト条件・テストケースを見直し、代替パラメータへの置換または該当箇所の削除を検討すること。",
    },
    {
      id: "TCI-06",
      nameJa: "参照0件の変更パラメータ",
      severity: "medium",
      description:
        "値を変更したのに名前参照も直値も成果物側に見つからない（未反映または追跡不能）。",
      action: "当該パラメータを参照するテスト条件・テストケースが存在するか確認し、無ければ追跡できるよう明示的に参照を追加すること。",
    },
    {
      id: "TCI-07",
      nameJa: "追加パラメータの未参照",
      severity: "info",
      description: "追加したが成果物側で未使用。",
      action: "追加したパラメータを利用するテスト条件・テストケースの追加を検討すること。",
    },
    {
      id: "TCI-08",
      nameJa: "束縛の解決不能",
      severity: "high",
      description: "境界値/同値変数の束縛先パラメータが未定義、または値が数値として解釈できない。",
      action: "束縛先パラメータ名・値の指定を見直し、数値として解釈できる値を渡すこと。",
    },
  ],
  notes: [
    "本判定は入力として渡された成果物に対してのみ成立する。渡していない成果物の影響は検出できない。",
    "名前参照であっても期待結果の数値記述は人が再確認する必要がある。",
    "再展開は決定的エンジンを持つ技法（境界値分析・同値分割）に限られる。",
  ],
};
