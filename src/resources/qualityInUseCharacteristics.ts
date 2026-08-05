import type { QualityCharacteristicModel } from "../types.js";

// 広く知られている「利用時品質」の考え方を参考に、テスト分析で使いやすい形へ
// 独自に再整理した特性モデル。定義文・着眼点はすべて自作のパラフレーズであり、
// 特定規格の逐語転載ではない（規格番号・準拠表記は意図的に含めない）。
// quality://characteristics/product（製品品質）と対を成し、利用者由来のテスト条件
// （ペルソナ／ステークホルダーから導出したテスト要求）の接続先として用いる。
export const qualityInUseCharacteristicModel: QualityCharacteristicModel = {
  name: "利用時品質特性モデル（自作整理）",
  note:
    "広く知られている利用時品質の考え方を参考に独自に整理したものであり、規格本文の転載や特定の外部基準への適合を主張するものではない。",
  characteristics: [
    {
      id: "QU-01",
      nameJa: "有効性",
      nameEn: "effectiveness",
      summary:
        "利用者が指定された利用状況の中で、目的とする結果を正確かつ完全に達成できるかを表す特性。",
      subCharacteristics: [
        {
          id: "QU-01-01",
          nameJa: "達成の正確さ",
          nameEn: "accuracy of outcome",
          focus: [
            "利用者が意図した結果と実際の結果が一致するか",
            "操作の完了状態が利用者にとって曖昧でないか",
          ],
          relatedTestTypes: ["acceptance-testing"],
        },
        {
          id: "QU-01-02",
          nameJa: "達成の完全性",
          nameEn: "completeness of outcome",
          focus: [
            "目的達成に必要な一連の操作を、迂回や補助なしに最後まで終えられるか",
            "一部の利用者層・利用経路だけ達成できない抜け道が無いか",
          ],
          relatedTestTypes: ["acceptance-testing", "functional-testing"],
        },
      ],
    },
    {
      id: "QU-02",
      nameJa: "効率性",
      nameEn: "efficiency",
      summary:
        "目的の達成までに利用者が投じる労力・時間・資源に対して、得られる成果が見合っているかを表す特性。",
      subCharacteristics: [
        {
          id: "QU-02-01",
          nameJa: "達成までの手数の少なさ",
          nameEn: "effort economy",
          focus: [
            "目的達成までの操作回数・入力量が不必要に多くないか",
            "同じ目的を持つ利用者が繰り返し同じ手間を強いられていないか",
          ],
          relatedTestTypes: ["acceptance-testing", "non-functional-testing"],
        },
        {
          id: "QU-02-02",
          nameJa: "達成までの時間の短さ",
          nameEn: "time economy",
          focus: [
            "目的達成までに要する体感時間が許容範囲か",
            "待ち時間・行列など利用者側の外部要因を含めても許容範囲か",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
      ],
    },
    {
      id: "QU-03",
      nameJa: "満足性",
      nameEn: "satisfaction",
      summary:
        "利用者が実際に使ってみて、期待や欲求がどれだけ満たされたと感じるかを表す特性。",
      subCharacteristics: [
        {
          id: "QU-03-01",
          nameJa: "実用性の実感",
          nameEn: "usefulness",
          focus: ["利用者が『役に立った』と実感できる結果が得られるか"],
          relatedTestTypes: ["acceptance-testing"],
        },
        {
          id: "QU-03-02",
          nameJa: "信頼感",
          nameEn: "trust",
          focus: [
            "表示された情報・状態を利用者が疑わずに信じて行動できるか",
            "誤った情報や不確かな表示によって利用者が不安になる場面が無いか",
          ],
          relatedTestTypes: ["acceptance-testing"],
        },
        {
          id: "QU-03-03",
          nameJa: "快適さ",
          nameEn: "pleasure",
          focus: ["操作の過程に不快感・苛立ちを感じさせる要素が無いか"],
          relatedTestTypes: [],
        },
        {
          id: "QU-03-04",
          nameJa: "心理的負担のなさ",
          nameEn: "comfort",
          focus: [
            "失敗したらどうしようという不安を抱かせる場面が無いか",
            "利用者が急かされている・監視されていると感じる要素が無いか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
      ],
    },
    {
      id: "QU-04",
      nameJa: "リスク回避性",
      nameEn: "freedom from risk",
      summary:
        "利用に伴って生じうる不利益・危害を、許容できる水準まで抑えられているかを表す特性。",
      subCharacteristics: [
        {
          id: "QU-04-01",
          nameJa: "経済的損失の回避",
          nameEn: "economic risk mitigation",
          focus: [
            "誤操作・システム不具合によって利用者に金銭的損失が生じないか",
            "二重決済・過剰請求など金銭に関わる異常系が防止されているか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
        {
          id: "QU-04-02",
          nameJa: "健康・安全上の危害の回避",
          nameEn: "health and safety risk mitigation",
          focus: [
            "利用者・従業員の身体的な安全（滞留・混雑・誤誘導等）が損なわれないか",
            "緊急時に安全側へフォールバックする設計になっているか",
          ],
          relatedTestTypes: ["acceptance-testing"],
        },
        {
          id: "QU-04-03",
          nameJa: "環境・組織への悪影響の回避",
          nameEn: "environmental and organizational risk mitigation",
          focus: [
            "システムの誤動作が周辺設備・他システム・組織運営に悪影響を及ぼさないか",
          ],
          relatedTestTypes: [],
        },
      ],
    },
    {
      id: "QU-05",
      nameJa: "利用状況網羅性",
      nameEn: "context coverage",
      summary:
        "想定した利用状況だけでなく、想定外の状況や利用の広がりにも対応できているかを表す特性。",
      subCharacteristics: [
        {
          id: "QU-05-01",
          nameJa: "想定利用状況の網羅",
          nameEn: "context completeness",
          focus: [
            "洗い出したすべての利用状況（利用者属性・環境・時間帯・繁閑）で目的を達成できるか",
            "特定の利用状況だけを想定して他が欠落していないか",
          ],
          relatedTestTypes: ["system-testing"],
        },
        {
          id: "QU-05-02",
          nameJa: "想定外状況への適応力",
          nameEn: "flexibility",
          focus: [
            "想定外の利用状況（初めての利用者・非定型な操作順序・複合的な例外）でも致命的な失敗に至らないか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
      ],
    },
  ],
};
