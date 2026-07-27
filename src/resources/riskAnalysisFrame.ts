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
