import type { DecisionTableAnalysisCriteria } from "../types.js";

// design_decision_table の判定区分カタログ。自作のパラフレーズであり、原典の逐語転載はしない。
export const decisionTableAnalysisCriteria: DecisionTableAnalysisCriteria = {
  name: "デシジョンテーブル設計 判定区分カタログ",
  summary:
    "条件項目・水準・無効組合せ・ルールから成るデシジョンテーブル入力を全組合せ列挙にかけたとき、入力の整合性の欠落と、列挙後に判明する未定義・矛盾・冗長を分類するための判定区分。",
  categories: [
    {
      id: "DTC-01",
      nameJa: "未宣言の条件IDの参照",
      severity: "high",
      definition: "無効組合せまたはルールの when が、conditions[].id に存在しない条件IDを参照している。",
      recommendedAction: "参照先IDの綴りを確認し、宣言済みの条件IDへ修正するか、当該条件を conditions に追加すること。",
    },
    {
      id: "DTC-02",
      nameJa: "未宣言の水準の参照",
      severity: "high",
      definition: "無効組合せまたはルールの when が、当該条件の levels に存在しない水準を指定している。",
      recommendedAction: "指定した水準の綴りを確認し、当該条件の levels に含まれる値へ修正すること。",
    },
    {
      id: "DTC-03",
      nameJa: "未宣言の動作IDの参照",
      severity: "high",
      definition: "ルールの actions が、actions[].id に存在しない動作IDを参照している。",
      recommendedAction: "参照先IDの綴りを確認し、宣言済みの動作IDへ修正するか、当該動作を actions に追加すること。",
    },
    {
      id: "DTC-04",
      nameJa: "ID・水準の重複",
      severity: "high",
      definition: "conditions[].id / actions[].id が重複している、または同一条件内で levels が重複している。",
      recommendedAction: "IDは条件・動作それぞれで一意にし、同一条件内の水準も重複なく宣言すること。",
    },
    {
      id: "DTC-05",
      nameJa: "組合せに寄与しない条件",
      severity: "medium",
      definition: "条件の取り得る水準が1件以下であり、組合せ生成に実質的に寄与していない。",
      recommendedAction: "水準を2件以上に補うか、条件として不要であれば削除すること。",
    },
    {
      id: "DTC-06",
      nameJa: "動作未定義の有効組合せ",
      severity: "high",
      definition: "有効な組合せのうち、一致するルールが1件も無く動作が決まらないものがある。",
      recommendedAction: "当該組合せに一致するルールを追加するか、ありえない組合せであれば invalidCombinations へ理由付きで宣言すること。",
    },
    {
      id: "DTC-07",
      nameJa: "動作が食い違う複数ルールの一致",
      severity: "high",
      definition: "同一の有効組合せに複数のルールが一致し、正規化後の動作ベクトルが一致しない。",
      recommendedAction: "ルールの when の重なりを見直し、当該組合せに対する動作を一意に決まるよう修正すること。",
    },
    {
      id: "DTC-08",
      nameJa: "冗長・到達不能なルール",
      severity: "medium",
      definition: "宣言したルールが、有効な組合せを1件も引き当てていない。",
      recommendedAction: "当該ルールの when が無効組合せと重複していないか確認し、不要であれば削除すること。",
    },
    {
      id: "DTC-09",
      nameJa: "有効組合せが0件",
      severity: "high",
      definition: "無効組合せ指定によって全ての組合せが除外され、有効な組合せが1件も残らない。",
      recommendedAction: "invalidCombinations の指定が過剰でないか確認し、意図した組合せが残るよう見直すこと。",
    },
    {
      id: "DTC-10",
      nameJa: "全組合せ数が上限超過",
      severity: "info",
      definition: "条件の水準数の積が maxCombinations の上限を超え、全列挙を行わなかった。",
      recommendedAction: "条件・水準を絞り込むか、必要であれば maxCombinations を明示的に引き上げること。",
    },
  ],
  notes: [
    "本検査は渡された条件・水準・無効組合せ・ルールに対してのみ成立する。渡していない条件の取りこぼしは検出できない。",
    "圧縮（don't care 導出）は、動作ベクトルが一致し他の全条件の採用水準集合が完全一致するルール同士のみを1本へ融合する貪欲・決定的な処理であり、最小被覆を保証するものではない。",
    "圧縮後の列数・削減率は、動作が一意に決まった有効組合せ（definedCombinationCount）を分母として算出する。動作未定義・矛盾の組合せは圧縮対象に含めない。",
  ],
};
