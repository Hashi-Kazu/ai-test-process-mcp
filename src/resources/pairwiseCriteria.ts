import type { PairwiseAnalysisCriteria } from "../types.js";

// design_pairwise の判定区分カタログ。自作のパラフレーズであり、原典の逐語転載はしない。
export const pairwiseAnalysisCriteria: PairwiseAnalysisCriteria = {
  name: "ペアワイズ設計 判定区分カタログ",
  summary:
    "因子・水準・禁則から成るペアワイズ入力に対して、入力の整合性の欠落と、ペア被覆の生成後に判明する到達不能・判定保留・被覆不足を分類するための判定区分。",
  categories: [
    {
      id: "PWC-01",
      nameJa: "未宣言の因子IDの参照",
      severity: "high",
      definition: "禁則または seed 行が、factors[].id に存在しない因子IDを参照している。",
      recommendedAction: "参照先IDの綴りを確認し、宣言済みの因子IDへ修正するか、当該因子を factors に追加すること。",
    },
    {
      id: "PWC-02",
      nameJa: "未宣言の水準の参照",
      severity: "high",
      definition: "禁則または seed 行が、当該因子の levels に存在しない水準を指定している。",
      recommendedAction: "指定した水準の綴りを確認し、当該因子の levels に含まれる値へ修正すること。",
    },
    {
      id: "PWC-03",
      nameJa: "因子ID・水準の重複",
      severity: "high",
      definition: "factors[].id が重複している、または同一因子内で levels が重複している。",
      recommendedAction: "因子IDは集合内で一意にし、同一因子内の水準も重複なく宣言すること。",
    },
    {
      id: "PWC-04",
      nameJa: "組合せに寄与しない因子",
      severity: "medium",
      definition: "因子の取り得る水準が1件以下であり、他因子とのペア生成に実質的に寄与していない。",
      recommendedAction: "水準を2件以上に補うか、固定条件として因子表から外し前提条件へ移すこと。",
    },
    {
      id: "PWC-05",
      nameJa: "因子数不足",
      severity: "high",
      definition: "因子が2件未満であり、水準ペアを構成できない。",
      recommendedAction: "組み合わせたい因子を2件以上宣言すること。単一因子なら同値分割・境界値分析側で扱うこと。",
    },
    {
      id: "PWC-06",
      nameJa: "禁則により到達不能なペア",
      severity: "medium",
      definition: "禁則によって、その水準ペアを含む有効な組合せが1件も存在しない。",
      recommendedAction:
        "禁則の指定が過剰でないか確認すること。仕様上正しい到達不能であれば、被覆できないペアとして記録し分母から外れることを受け入れること。",
    },
    {
      id: "PWC-07",
      nameJa: "有効な組合せが存在しない",
      severity: "high",
      definition: "禁則によって全ての組合せが除外され、被覆できるペアが1件も残らない。",
      recommendedAction: "禁則の条件を見直し、意図した組合せが残るよう修正すること。",
    },
    {
      id: "PWC-08",
      nameJa: "冗長・到達不能な禁則",
      severity: "medium",
      definition: "宣言した禁則に一致する組合せが、他の禁則によって既に全て除外されている。",
      recommendedAction: "禁則同士の重なりを確認し、不要であれば削除して禁則表を読みやすく保つこと。",
    },
    {
      id: "PWC-09",
      nameJa: "seed行の不正",
      severity: "high",
      definition: "seed 行が全因子の水準を指定していない、または宣言した禁則に違反している。",
      recommendedAction: "seed 行は全因子の水準を明示し、禁則に違反しない組合せだけを渡すこと。",
    },
    {
      id: "PWC-10",
      nameJa: "ペア数が上限超過",
      severity: "info",
      definition: "全ペア数が maxPairCount の上限を超え、組合せ生成を行わなかった。",
      recommendedAction: "因子・水準を絞り込むか、必要であれば maxPairCount を明示的に引き上げること。",
    },
    {
      id: "PWC-11",
      nameJa: "到達可否の判定保留",
      severity: "info",
      definition: "到達可否の探索が maxSearchNodes の上限に達し、一部のペアの到達可否を判定できなかった。",
      recommendedAction:
        "禁則の数や因子数を減らすか maxSearchNodes を引き上げて再実行し、判定保留のペアを残さないこと。判定保留のペアは被覆率の分母に含めない。",
    },
    {
      id: "PWC-12",
      nameJa: "ペア被覆率が100%未満",
      severity: "high",
      definition: "組合せを生成したにもかかわらず、到達可能なペアのうち被覆できていないものが残っている。",
      recommendedAction:
        "生成結果とカウントが自己整合していない可能性があるため、入力（特に禁則と seed 行）を見直し、再現する入力を添えて報告すること。",
    },
  ],
  notes: [
    "本検査は渡された因子・水準・禁則に対してのみ成立する。渡していない因子の取りこぼしは検出できない。",
    "組合せ生成は決定的な貪欲法であり、行数の最小性を保証しない。theoreticalMinimumRowCount は水準数上位2因子の積であり、禁則を考慮しない参考下限である。",
    "ペア被覆率の分母は、到達不能ペアと判定保留ペアを除いた対象ペア数であり、全ペア数ではない。",
    "削減率の分母は、全組合せを厳密列挙できたときのみ禁則適用後の有効組合せ数、できないときは禁則適用前の全組合せ数である。出力には分母の別を必ず明記し、全組合せ数が安全整数を超える場合は数値を出さず未算出と明記する。",
    "ペア被覆は2因子間の相互作用のみを対象とする。3因子以上が同時に絡む不具合は、seed 行や別技法で補うこと。",
  ],
};
