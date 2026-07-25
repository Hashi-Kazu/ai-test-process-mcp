import type { RiskAnalysisFrame } from "../types.js";

// テスト条件の優先度をリスクから決めるための評価枠。軸の段階定義・判定基準・
// ステークホルダー別の問いはすべて自作の日本語文であり、外部文献の逐語転載ではない。
export const riskAnalysisFrame: RiskAnalysisFrame = {
  name: "リスク分析フレーム（自作整理）",
  note:
    "影響度・発生可能性・変更差分の各段階定義と算出式は自作であり、外部文献の逐語転載や特定の外部基準への適合を主張するものではない。",
  impactAxis: {
    id: "RA-IMPACT",
    nameJa: "影響度",
    description: "その不具合が起きたときに業務・利用者・事業へ与える打撃の大きさ。",
    levels: [
      { value: 1, label: "影響ほぼなし", criteria: "気付かれない程度の軽微な差異で、業務も利用者も影響を受けない。" },
      { value: 2, label: "軽微（回避策あり）", criteria: "不便はあるが、簡単な回避策で業務を続けられる。" },
      { value: 3, label: "業務に支障（手作業で復旧可）", criteria: "業務が滞るが、手作業や再実行で復旧できる。" },
      { value: 4, label: "重大（業務停止・データ不整合）", criteria: "業務が停止するか、データ不整合が生じて修復に手間がかかる。" },
      { value: 5, label: "致命的（金銭損失・法令違反・個人情報漏洩）", criteria: "金銭的損失、法令違反、個人情報の漏洩など、組織の信用に直結する。" },
    ],
  },
  likelihoodAxis: {
    id: "RA-LIKELIHOOD",
    nameJa: "発生可能性",
    description: "実運用の中でその事象がどの程度の頻度で起こり得るか。",
    levels: [
      { value: 1, label: "ほぼ起きない", criteria: "特殊な条件が重ならないと発生しない。" },
      { value: 2, label: "まれ", criteria: "年に数回程度、限られた利用者だけが遭遇する。" },
      { value: 3, label: "ときどき", criteria: "月に数回程度、通常運用の中で遭遇し得る。" },
      { value: 4, label: "頻繁", criteria: "日常的に利用される経路で高い頻度で遭遇する。" },
      { value: 5, label: "常に起こりうる", criteria: "主要な操作経路上にあり、ほぼ全利用者が遭遇する。" },
    ],
  },
  changeAxis: {
    id: "RA-CHANGE",
    nameJa: "変更差分",
    description: "対象が今回の変更でどれだけ手を入れられたか（analyze_requirements の4区分に対応）。",
    levels: [
      { value: 1, label: "existing-unaffected（既存・影響なし）", criteria: "今回の変更で手が入らず、影響も受けないと判断できる範囲。" },
      { value: 2, label: "existing-impacted（既存・影響あり）", criteria: "直接は変更していないが、共通部品や共有データを介して影響を受ける範囲。" },
      { value: 3, label: "modified（変更）", criteria: "既存の実装に手を入れた範囲。" },
      { value: 3, label: "new（新規実装）", criteria: "今回新たに作られ、実績のない範囲。" },
    ],
  },
  stakeholderFrames: [
    {
      id: "RSF-01",
      nameJa: "エンドユーザー",
      impactQuestions: [
        "この不具合が出たとき、利用者は自力で回避できるか",
        "気付かずに誤った結果を信じてしまう恐れがあるか",
      ],
    },
    {
      id: "RSF-02",
      nameJa: "運用・保守担当",
      impactQuestions: [
        "発生時に原因を特定できる情報（ログ・通知）が残るか",
        "復旧のための手作業がどれだけ発生するか",
      ],
    },
    {
      id: "RSF-03",
      nameJa: "事業責任者",
      impactQuestions: [
        "売上・請求・契約に直接影響する誤りが生じるか",
        "対外的な説明や謝罪が必要になる規模か",
      ],
    },
    {
      id: "RSF-04",
      nameJa: "開発者",
      impactQuestions: [
        "修正時の影響範囲が広く、二次不具合を招きやすい箇所か",
        "再現条件が特殊で、調査に時間がかかる箇所か",
      ],
    },
    {
      id: "RSF-05",
      nameJa: "外部連携先",
      impactQuestions: [
        "連携先へ誤ったデータを送ってしまう可能性があるか",
        "連携先の処理を止めたり、再送を強いることになるか",
      ],
    },
  ],
  formula:
    "riskScore = impact(1..5) × likelihood(1..5) × changeWeight(1..3)（範囲 1..75）。changeWeight は変更差分軸の value を用い、changeCategory 未指定時は 2 を既定とする。",
  bands: [
    { id: "R1", minScore: 30, maxScore: 75, priority: "高", guidance: "最優先で条件を詳細化し、複数技法で厚めに設計する。" },
    { id: "R2", minScore: 15, maxScore: 29, priority: "中", guidance: "代表的な条件を確実に押さえ、境界・異常系を1件以上含める。" },
    { id: "R3", minScore: 6, maxScore: 14, priority: "低", guidance: "代表条件のみに絞り、工数が不足する場合は縮小候補とする。" },
    { id: "R4", minScore: 1, maxScore: 5, priority: "低", guidance: "実施対象外候補。除外してよいか関係者と要相談のうえ判断する。" },
  ],
};
