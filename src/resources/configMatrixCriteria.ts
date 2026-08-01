import type { ConfigMatrixAnalysisCriteria } from "../types.js";

// design_config_matrix の判定区分カタログ。本プロジェクト独自の判定区分。
export const configMatrixAnalysisCriteria: ConfigMatrixAnalysisCriteria = {
  name: "構成・環境マトリクス設計 判定区分カタログ",
  summary:
    "因子・水準・除外組合せ・網羅方針(single/pairwise/full)から成る構成マトリクス入力に対して、入力の整合性の欠落と、" +
    "構成生成後に判明する到達不能・被覆不足・除外理由未記入を分類するための判定区分。",
  categories: [
    {
      id: "CMC-01",
      nameJa: "未宣言の因子IDの参照",
      severity: "high",
      definition: "除外組合せが factors[].id に存在しない因子IDを参照している。",
      recommendedAction: "参照先IDの綴りを確認し、宣言済みの因子IDへ修正するか、当該因子を factors に追加すること。",
    },
    {
      id: "CMC-02",
      nameJa: "未宣言の水準の参照",
      severity: "high",
      definition: "除外組合せが、当該因子の levels に存在しない水準を指定している。",
      recommendedAction: "指定した水準の綴りを確認し、当該因子の levels に含まれる値へ修正すること。",
    },
    {
      id: "CMC-03",
      nameJa: "因子ID・水準の重複",
      severity: "high",
      definition: "factors[].id が重複している、または同一因子内で levels が重複している。",
      recommendedAction: "因子IDは集合内で一意にし、同一因子内の水準も重複なく宣言すること。",
    },
    {
      id: "CMC-04",
      nameJa: "組合せに寄与しない因子",
      severity: "medium",
      definition: "因子の取り得る水準が1件以下であり、他因子との組合せに実質的に寄与していない。",
      recommendedAction: "水準を2件以上に補うか、固定条件として因子表から外し前提条件へ移すこと。",
    },
    {
      id: "CMC-05",
      nameJa: "因子数不足",
      severity: "high",
      definition: "因子が1件も宣言されておらず、構成を生成できない。",
      recommendedAction: "対象とする環境・設定項目を1件以上 factors に宣言すること。",
    },
    {
      id: "CMC-06",
      nameJa: "除外理由の未記入",
      severity: "high",
      definition: "excludedCombinations[].reason が未指定または空文字であり、除外の根拠が記録されていない。",
      recommendedAction: "なぜその組合せを除外するのか(仕様上不可能・対応対象外など)を reason に明記すること。",
    },
    {
      id: "CMC-07",
      nameJa: "除外組合せにより到達不能な水準ペア",
      severity: "medium",
      definition: "除外組合せによって、その水準ペアを含む有効な構成が1件も存在しない。",
      recommendedAction:
        "除外の指定が過剰でないか確認すること。仕様上正しい到達不能であれば、被覆できないペアとして記録し分母から外れることを受け入れること。",
    },
    {
      id: "CMC-08",
      nameJa: "冗長・到達不能な除外組合せ",
      severity: "medium",
      definition: "宣言した除外組合せに一致する組合せが、他の除外組合せによって既に全て除外されている。",
      recommendedAction: "除外組合せ同士の重なりを確認し、不要であれば削除して除外表を読みやすく保つこと。",
    },
    {
      id: "CMC-09",
      nameJa: "全構成数が上限超過",
      severity: "info",
      definition: "全構成数(因子の水準数の積)が maxCombinationCount の上限を超え、または安全整数の範囲外であり、構成生成を行わなかった。",
      recommendedAction: "因子・水準を絞り込むか、必要であれば maxCombinationCount を明示的に引き上げること。",
    },
    {
      id: "CMC-10",
      nameJa: "生成後もテストされない水準が残っている",
      severity: "high",
      definition: "構成を生成したにもかかわらず、到達可能な水準のうち、どの構成にも登場していないものが残っている。",
      recommendedAction:
        "生成結果とカウントが自己整合していない可能性があるため、入力（特に除外組合せ）を見直し、再現する入力を添えて報告すること。",
    },
  ],
  notes: [
    "本検査は渡された因子・水準・除外組合せに対してのみ成立する。渡していない因子の取りこぼしは検出できない。",
    "single は各水準を最低1回、pairwise は全ての水準ペアを被覆する決定的な貪欲法であり、行数の最小性を保証しない。",
    "水準被覆率・ペア被覆率の分母は、除外組合せにより到達不能な水準・ペアを除いた対象数であり、全水準数・全ペア数ではない。",
    "ペア被覆・ペア到達可否は2因子間の相互作用のみを対象とする。3因子以上が同時に絡む不具合は、別途 excludedCombinations や他技法で補うこと。",
  ],
};
