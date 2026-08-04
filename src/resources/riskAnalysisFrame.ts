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
    "riskScore = impact(1..5) × likelihood(1..5) × changeWeight(1..3)（範囲 1..75）。changeWeight は変更差分軸の value を用い、changeCategory 未指定時は 2 を既定とする。" +
    "impact が未指定の場合は重篤度サブ軸の最大値を、likelihood が未指定の場合は利用頻度と発生しやすさ係数からの導出値を代わりに用いる。",
  bands: [
    { id: "R1", minScore: 30, maxScore: 75, priority: "高", guidance: "最優先で条件を詳細化し、複数技法で厚めに設計する。" },
    { id: "R2", minScore: 15, maxScore: 29, priority: "中", guidance: "代表的な条件を確実に押さえ、境界・異常系を1件以上含める。" },
    { id: "R3", minScore: 6, maxScore: 14, priority: "低", guidance: "代表条件のみに絞り、工数が不足する場合は縮小候補とする。" },
    { id: "R4", minScore: 1, maxScore: 5, priority: "低", guidance: "実施対象外候補。除外してよいか関係者と要相談のうえ判断する。" },
  ],
  riskCategories: [
    {
      id: "RC-01",
      nameJa: "事業",
      description: "売上・契約・対外的な信用など、事業の継続や評価に直接影響するリスク。",
      probeQuestions: [
        "この不具合が収益・請求・契約条件に誤りを生じさせないか",
        "競合や取引先に対する優位性・信頼を損なう見え方にならないか",
      ],
      relatedPerspectiveCategoryIds: ["TPC-01", "TPC-13"],
    },
    {
      id: "RC-02",
      nameJa: "運用",
      description: "稼働後の監視・障害対応・保守作業の中で顕在化する運用負荷や復旧困難性のリスク。",
      probeQuestions: [
        "障害発生時に原因追跡や復旧に必要な手がかり（ログ・通知）が残るか",
        "定常運用の作業量が想定を超えて増大しないか",
      ],
      relatedPerspectiveCategoryIds: ["TPC-11", "TPC-14"],
    },
    {
      id: "RC-03",
      nameJa: "利用（ユーザビリティ/公平性）",
      description: "利用者が迷わず使えるか、また特定の利用者層だけが不利益を受ける扱いになっていないかというリスク。",
      probeQuestions: [
        "特定の利用環境・障害特性を持つ利用者だけが機能を使えない状態にならないか",
        "表示や操作導線の分かりにくさが誤操作や利用者間の不公平な結果につながらないか",
      ],
      relatedPerspectiveCategoryIds: ["TPC-16"],
    },
    {
      id: "RC-04",
      nameJa: "セキュリティ",
      description: "認証・認可・入力検証・機密情報の取り扱いに関する脆弱性や不正利用のリスク。",
      probeQuestions: [
        "権限のない利用者が他人のデータや管理機能へ到達できる経路が残っていないか",
        "入力値の検証不足によって不正なデータや操作が受理されないか",
        "機密情報がログ・通信・画面表示のいずれかで保護されずに露出しないか",
      ],
      relatedPerspectiveCategoryIds: ["TPC-15"],
    },
    {
      id: "RC-05",
      nameJa: "データ／技術",
      description: "データの整合性・移行・技術的な構成差異に起因する不整合や障害のリスク。",
      probeQuestions: [
        "データの生成・更新・削除の各段階で関連データとの整合が崩れないか",
        "利用環境や設定値の組み合わせによって想定外の挙動が生じないか",
      ],
      relatedPerspectiveCategoryIds: ["TPC-09", "TPC-10"],
    },
  ],
  severitySubAxes: [
    {
      id: "RA-SEV-01",
      key: "direct",
      nameJa: "直接的な影響度",
      description: "その不具合が発生した処理・利用者自身に対して直接的にどれだけの打撃を与えるか。",
      levels: [
        { value: 1, label: "実質無影響", criteria: "利用者は気付かず、処理も正しく完了する。" },
        { value: 2, label: "軽微な不便", criteria: "見た目の乱れなど軽微な不便はあるが、目的の処理は達成できる。" },
        { value: 3, label: "目的処理の一部失敗", criteria: "目的の処理の一部が失敗し、やり直しや手作業が必要になる。" },
        { value: 4, label: "目的処理の全面失敗", criteria: "目的の処理全体が失敗し、利用者が意図した結果を得られない。" },
        { value: 5, label: "利用者に直接的な損害", criteria: "利用者本人に金銭的損害や個人情報漏洩など直接的な損害が生じる。" },
      ],
    },
    {
      id: "RA-SEV-02",
      key: "ripple",
      nameJa: "関連機能への波及影響度",
      description: "その不具合が発生源以外の機能・データ・他利用者へどれだけ波及するか。",
      levels: [
        { value: 1, label: "波及なし", criteria: "発生源の処理内で完結し、他の機能・データへ影響しない。" },
        { value: 2, label: "隣接機能への軽微な波及", criteria: "隣接する一部の機能で軽微な表示不整合などが生じる。" },
        { value: 3, label: "複数機能への波及", criteria: "複数の機能・画面にわたって不整合や再実行が必要になる。" },
        { value: 4, label: "共有データの汚染", criteria: "他利用者や他プロセスが参照する共有データが汚染される。" },
        { value: 5, label: "システム全体への波及", criteria: "システム全体または多数の利用者・連携先に影響が及ぶ。" },
      ],
    },
    {
      id: "RA-SEV-03",
      key: "shortTermFinancial",
      nameJa: "短期的な金銭的影響度",
      description: "発生直後（当日〜数週間程度）に生じる金銭的な損失規模。",
      levels: [
        { value: 1, label: "金銭的影響なし", criteria: "直接の金銭的な発生・損失が生じない。" },
        { value: 2, label: "軽微な補償対応", criteria: "個別対応レベルの少額な返金・補償で収まる。" },
        { value: 3, label: "限定的な売上・請求誤り", criteria: "一部の取引・請求に誤りが生じ、限定的な補正作業が必要になる。" },
        { value: 4, label: "広範な売上・請求誤り", criteria: "多数の取引・請求に誤りが生じ、広範な補正・返金対応が必要になる。" },
        { value: 5, label: "重大な即時損失", criteria: "即時に重大な金銭的損失や不正取引の発生につながる。" },
      ],
    },
    {
      id: "RA-SEV-04",
      key: "longTermFinancial",
      nameJa: "長期的な金銭的影響度",
      description: "発生後、継続的（数ヶ月〜）に生じる金銭的・事業的な影響規模。",
      levels: [
        { value: 1, label: "長期的影響なし", criteria: "短期対応で完結し、その後の事業運営に影響を残さない。" },
        { value: 2, label: "軽微な信用低下", criteria: "軽微な問い合わせ増加はあるが、契約・売上には影響しない。" },
        { value: 3, label: "限定的な契約・売上への影響", criteria: "一部の顧客・契約で解約や条件見直しの申し出が生じる。" },
        { value: 4, label: "広範な契約・売上への影響", criteria: "複数の主要顧客・契約で解約や条件見直しが生じ、売上に影響する。" },
        { value: 5, label: "事業継続に関わる影響", criteria: "対外的な説明責任・法令対応が発生し、事業継続に関わる規模となる。" },
      ],
    },
  ],
  severityGrades: [
    {
      id: "S",
      minSeverity: 5,
      maxSeverity: 5,
      label: "S（最重篤）",
      guidance: "impactAxis の value 5 相当。最優先で条件を詳細化し、複数技法で厚めに設計する。",
    },
    {
      id: "A",
      minSeverity: 3,
      maxSeverity: 4,
      label: "A（重篤）",
      guidance: "impactAxis の value 3〜4 相当。代表的な条件を確実に押さえ、境界・異常系を1件以上含める。",
    },
    {
      id: "B",
      minSeverity: 1,
      maxSeverity: 2,
      label: "B（軽微）",
      guidance: "impactAxis の value 1〜2 相当。代表条件のみに絞ってよい。",
    },
  ],
  usageFrequencyAxis: {
    id: "RA-USAGE",
    nameJa: "利用頻度",
    description: "対象機能が実運用でどれだけの頻度で使われるか。",
    levels: [
      { value: 1, label: "ほぼ使われない", criteria: "特殊な状況でのみ使われ、通常運用では使われない。" },
      { value: 2, label: "稀に使われる", criteria: "月に数回程度、限られた利用者だけが使う。" },
      { value: 3, label: "ときどき使われる", criteria: "週に数回程度、通常運用の中で使われる。" },
      { value: 4, label: "頻繁に使われる", criteria: "日常的に利用される主要な経路の一部である。" },
      { value: 5, label: "常に使われる", criteria: "ほぼ全利用者が毎回通過する主要経路である。" },
    ],
  },
  defectPronenessAxis: {
    id: "RA-PRONENESS",
    nameJa: "発生しやすさ係数",
    description: "対象機能で障害が発生しやすい事情（実装の複雑さ・変更履歴・体制の習熟度等）をどれだけ抱えているか。",
    levels: [
      { value: 1, label: "非常に発生しにくい", criteria: "枯れた実装で長期間安定稼働しており、発生しやすさを高める事情が無い。" },
      { value: 2, label: "発生しにくい", criteria: "発生しやすさを高める事情がほとんど無い。" },
      { value: 3, label: "標準", criteria: "特筆すべき事情がない既定値。発生しやすさを特に高める・低める事情がどちらも無い。" },
      { value: 4, label: "発生しやすい", criteria: "pronenessFactors のうち発生しやすさを高める事情が1件以上該当する。" },
      { value: 5, label: "非常に発生しやすい", criteria: "pronenessFactors のうち発生しやすさを高める事情が複数件重なって該当する。" },
    ],
  },
  pronenessFactors: [
    {
      id: "RA-PF-01",
      nameJa: "過去に障害が発生した機能である",
      direction: "increase",
      description: "対象機能自体で過去に障害が発生した記録がある。",
    },
    {
      id: "RA-PF-02",
      nameJa: "過去に障害となった構成と類似した作りを採用している",
      direction: "increase",
      description: "別の機能で障害の原因となった設計・実装パターンと類似した作りを今回も採用している。",
    },
    {
      id: "RA-PF-03",
      nameJa: "今回初めて採用する技術・外部部品である",
      direction: "increase",
      description: "実績のない技術・ライブラリ・外部サービスを今回初めて採用している。",
    },
    {
      id: "RA-PF-04",
      nameJa: "実装・レビュー体制の習熟が浅い",
      direction: "increase",
      description: "担当者・レビュー体制がこの領域の実装・レビューに習熟していない。",
    },
    {
      id: "RA-PF-05",
      nameJa: "長期間変更がなく本番実績が積み上がっている",
      direction: "decrease",
      description: "長期間変更されておらず、本番環境での稼働実績が十分に積み上がっている。",
    },
  ],
  severityAggregationRule:
    "重篤度は記入済みの重篤度サブ軸（RA-SEV-01〜RA-SEV-04）の最大値とする。全サブ軸が未記入の場合は重篤度を導出しない。",
  likelihoodDerivationRule:
    "発生可能性は利用頻度(RA-USAGE)と発生しやすさ係数(RA-PRONENESS)の幾何平均を切り上げて 1..5 に丸めた値とする。いずれか一方のみの記入では導出しない。",
  optionalAxisPolicy:
    "必須軸は影響度・発生可能性・変更差分の3軸である。重篤度サブ軸・発生頻度サブ軸・ステークホルダ別影響行列は任意軸であり、未記入でも既存3軸のスコアで評価が完結する。記入コストを理由に任意軸を省略してよいが、省略した軸については分解能が得られない。",
  controlFlawFrame: {
    name: "制御不全パターン枠（自作整理）",
    note: "制御ループの捉え方とパターン分類は自作の整理であり、外部の分析手法・規格の逐語転載やそれらへの適合を主張するものではない。",
    loopElements: [
      {
        id: "RCL-01",
        nameJa: "制御する側",
        description: "判断して指示を出す側（利用者・上位機能・バッチ制御など）。",
      },
      {
        id: "RCL-02",
        nameJa: "制御される対象",
        description: "指示を受けて状態が変わる側（データ・機器・外部システムなど）。",
      },
      {
        id: "RCL-03",
        nameJa: "指示",
        description: "制御する側から対象へ渡る操作・命令・設定値。",
      },
      {
        id: "RCL-04",
        nameJa: "フィードバック",
        description: "対象の状態が制御する側へ戻る通知・応答・画面表示・ログ。",
      },
    ],
    patterns: [
      {
        id: "RCF-01",
        nameJa: "必要な制御が行われない",
        description: "出すべき指示が出ない、届かない、あるいは無視される状態。",
        probeQuestions: [
          "出すべき指示そのものが発生しない条件が存在しないか",
          "指示は発生するが、途中で失われて対象に届かない経路がないか",
          "対象の状態が変わったことが制御する側へ通知されず、フィードバックが欠落したままにならないか",
        ],
      },
      {
        id: "RCF-02",
        nameJa: "不適切な制御が行われる",
        description: "誤った内容や誤った対象へ指示が出てしまう状態。",
        probeQuestions: [
          "指示の内容が意図と異なる値・条件で送られてしまわないか",
          "指示が本来とは別の対象へ向けて出されてしまわないか",
          "制御する側が想定している対象の状態と、実際の対象の状態が食い違ったまま指示を出していないか",
        ],
      },
      {
        id: "RCF-03",
        nameJa: "タイミング・順序が不適切",
        description: "指示が早すぎる、遅すぎる、あるいは前後関係が逆転する状態。",
        probeQuestions: [
          "対象の準備が整う前に指示が先行してしまわないか",
          "本来先に行うべき指示が後回しになり、順序が入れ替わらないか",
          "遅れて届いたフィードバックをもとに、制御する側が古い状態を前提に次の指示を出してしまわないか",
        ],
      },
      {
        id: "RCF-04",
        nameJa: "継続すべき制御が早く止まる／過剰に続く",
        description: "途中で打ち切られる、または止まるべき制御が続いてしまう状態。",
        probeQuestions: [
          "終了条件が満たされる前に制御が打ち切られてしまわないか",
          "終了条件を満たした後も指示が出続け、対象に過剰な操作が繰り返されないか",
          "対象が終了状態になったことのフィードバックを制御する側が受け取れず、判断を誤らないか",
        ],
      },
    ],
  },
};
