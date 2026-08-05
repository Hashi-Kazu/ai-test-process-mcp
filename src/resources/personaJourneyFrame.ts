import type { PersonaJourneyFrame } from "../types.js";

// 上流の利用状況モデリング（ドメイン分析 → ペルソナ立案 → ユーザーストーリーマップ →
// テスト要求導出）を独自に整理したフレーム。観点・定義・質問例はすべて自作のパラフレーズであり、
// 外部文献の逐語転載や特定の外部基準への適合を主張するものではない。
export const personaJourneyFrame: PersonaJourneyFrame = {
  name: "ペルソナ／ユーザーストーリーマップ・フレーム（自作整理）",
  note:
    "テスト対象の利用状況を上流から言語化するための観点・定義・質問例を独自に整理したものであり、" +
    "外部文献の逐語転載ではなく、特定の外部基準・手法への適合を主張するものでもない。" +
    "実際の業界知識・利用者像は、対象プロジェクトの一次情報で必ず裏取りすること。",
  domainAnalysisAspects: [
    {
      id: "DOM-01",
      nameJa: "対象業界の提供サービス",
      summary: "対象の組織が誰に何を売り、どこで収益を得ているかを把握する観点。",
      questionExamples: [
        "対象の組織が提供している主なサービス・商品は何か。",
        "売上の中心はどのサービスか。付随的なサービスは何か。",
        "サービスの提供が止まると、誰がどの程度困るのか。",
      ],
    },
    {
      id: "DOM-02",
      nameJa: "利用者の構成",
      summary: "サービスを使う側の人物像の広がり（年齢層・同伴形態・IT習熟度）を把握する観点。",
      questionExamples: [
        "利用者の年齢層・同伴形態（単独・家族・団体）はどう分布しているか。",
        "スマートフォン・現金・紙の券など、利用者が使える手段に偏りはあるか。",
        "リピーターと初回利用者で行動はどう違うか。",
      ],
    },
    {
      id: "DOM-03",
      nameJa: "従業員・運用体制",
      summary: "現場で操作・監視・例外対応を担う側の構成と習熟度を把握する観点。",
      questionExamples: [
        "現場で操作する従業員の職種・人数・雇用形態はどうなっているか。",
        "繁忙時の増員・交代はどう行われるか。習熟にどれくらいかかるか。",
        "障害・例外が起きたとき、誰が判断し誰が実作業を行うか。",
      ],
    },
    {
      id: "DOM-04",
      nameJa: "業務フローの特徴",
      summary: "受付から完了までの流れ、待ち行列、他業務との相互依存を把握する観点。",
      questionExamples: [
        "利用者が来てから目的を達するまでの流れはどうなっているか。",
        "どの工程で待ち行列・滞留が発生しやすいか。",
        "別の業務・別の窓口と情報を共有している箇所はどこか。",
      ],
    },
    {
      id: "DOM-05",
      nameJa: "IT化・自動化の傾向",
      summary: "どこまでが機械化済みで、どこが人手・紙・口頭に残っているかを把握する観点。",
      questionExamples: [
        "既にシステム化されている業務と、人手・紙に残っている業務はどれか。",
        "業界全体で自動化・セルフ化が進んでいる領域はどこか。",
        "システム停止時の代替手段（手作業運用）は用意されているか。",
      ],
    },
    {
      id: "DOM-06",
      nameJa: "法規制・業界ルール",
      summary: "遵守が必須な決まり事と、違反時の影響の大きさを把握する観点。",
      questionExamples: [
        "遵守が必要な法令・業界ルール・社内規程は何か。",
        "個人情報・決済情報の取り扱いに固有の制約はあるか。",
        "ルール違反が起きた場合、誰にどのような不利益が生じるか。",
      ],
    },
    {
      id: "DOM-07",
      nameJa: "季節性・繁閑・イベント",
      summary: "時期・時刻による負荷と業務内容の変動を把握する観点。",
      questionExamples: [
        "年間・週間・1日の中で、繁忙と閑散はどう変動するか。",
        "繁忙期にだけ現れる業務・特例対応はあるか。",
        "季節・イベントに合わせた料金・在庫・開催時間の切り替えはあるか。",
      ],
    },
  ],
  personaQuadrants: [
    {
      id: "PQ-01",
      key: "demographics",
      nameJa: "属性",
      definition:
        "その人物が誰であるかを外形的に示す事実。年齢層・職業・役割・利用環境（端末・回線・場所）・IT習熟度・利用頻度など。",
      questionExamples: [
        "年齢層・職業・役割は何か。",
        "どの端末・どの場所から、どれくらいの頻度で使うのか。",
        "IT機器の操作にどの程度慣れているか。",
      ],
      badExamples: [
        "「一般ユーザー」のように誰にでも当てはまる記述だけを書く。",
        "属性欄に「早く入場したい」のような目標を書いてしまう。",
      ],
    },
    {
      id: "PQ-02",
      key: "saysAndThinks",
      nameJa: "発言・思考",
      definition:
        "その人物が口に出す言葉、および口には出さないが頭の中で考えていること。一次情報（ヒアリング・問い合わせ記録）の言い回しに寄せて書く。",
      questionExamples: [
        "利用中に口に出す言葉・問い合わせの言い回しはどのようなものか。",
        "口には出さないが不安に思っていることは何か。",
        "「本当はこうしてほしい」と考えていることは何か。",
      ],
      badExamples: [
        "システム側の仕様説明を書いてしまう（人物の言葉になっていない）。",
        "発言と不満点をまったく同じ文で埋める。",
      ],
    },
    {
      id: "PQ-03",
      key: "goals",
      nameJa: "目標",
      definition:
        "その人物がこの場面で達したい状態。手段ではなく達成したい結果で書き、達成を判定できる表現にする。",
      questionExamples: [
        "この場面で最終的に達したい状態は何か。",
        "その達成をどうやって本人は判断するのか。",
        "複数の目標が競合する場合、どちらを優先するのか。",
      ],
      badExamples: [
        "「アプリを使う」のように手段を目標として書く。",
        "「快適に使えること」のように達成を判定できない書き方をする。",
      ],
    },
    {
      id: "PQ-04",
      key: "painPoints",
      nameJa: "不満点",
      definition:
        "目標の達成を妨げている具体的な障害・不便・不安。現状で実際に起きている事象として書く。",
      questionExamples: [
        "目標の達成を妨げている具体的な事象は何か。",
        "その不便はどの工程・どのタイミングで起きるか。",
        "回避のために本人が今行っている手間は何か。",
      ],
      badExamples: [
        "「使いにくい」だけで、どの操作のどこが問題か書かない。",
        "将来の要望（After）を現状の不満点として書く。",
      ],
    },
  ],
  storyMapLevels: [
    {
      id: "USM-01",
      key: "persona",
      nameJa: "ペルソナ",
      definition: "マップの起点となる人物。4象限で記述済みのペルソナIDを指す。",
      granularityGuidance:
        "1人のペルソナは1つの役割・利用文脈に対応させる。役割が違えば別ペルソナとして分ける。",
    },
    {
      id: "USM-02",
      key: "productGoal",
      nameJa: "プロダクトゴール",
      definition: "そのペルソナにとって製品が達成すべき状態。ペルソナの目標を製品側の言葉に置き換えたもの。",
      granularityGuidance:
        "1ペルソナあたり1〜3件程度。機能名ではなく、達成される状態で書く。",
    },
    {
      id: "USM-03",
      key: "activity",
      nameJa: "アクティビティ",
      definition: "プロダクトゴールに至るまでの大きな活動の区切り。マップ横軸の見出しになる。",
      granularityGuidance:
        "利用者の時間軸に沿って左から右へ並ぶ粒度。1件が数分〜数十分の活動に相当する程度。",
    },
    {
      id: "USM-04",
      key: "task",
      nameJa: "タスク",
      definition: "アクティビティを構成する具体的な作業単位。1つの目的を持つひとまとまりの操作。",
      granularityGuidance:
        "1アクティビティあたり2〜7件程度。動詞1つで言い切れる大きさに揃える。",
    },
    {
      id: "USM-05",
      key: "userStory",
      nameJa: "ユーザーストーリー",
      definition:
        "タスクを実現する個々の要求。「誰が」「何をしたい」「なぜ」が読み取れる1文で書く。",
      granularityGuidance:
        "1タスクあたり複数件。テスト条件へ落とせる具体性（判定できる完了状態）まで下げる。",
    },
  ],
  testRequirementFrame: {
    columns: [
      {
        id: "TRF-01",
        nameJa: "現状(Before)",
        definition:
          "対象の機能・運用が導入される前に、そのペルソナが実際にどう困っていたかを事実として書く列。",
      },
      {
        id: "TRF-02",
        nameJa: "将来(After)",
        definition:
          "対象の機能・運用が入った後に、そのペルソナがどうなっていれば成功かを書く列。判定できる状態で書く。",
      },
      {
        id: "TRF-03",
        nameJa: "テスト要求",
        definition:
          "Before から After への差分が本当に達成されたことを確かめるために、テストで確認すべき事柄を書く列。",
      },
    ],
    handoverConvention: [
      "テスト要求1件は extract_test_conditions のテスト条件1件以上へ展開する。",
      "展開したテスト条件は source=\"stakeholder\" とし、derivedFrom に由来ペルソナID（personas[].id）を書く。",
      "ペルソナは4象限（属性・発言・思考・目標・不満点）を埋めたうえで extract_test_conditions の personas へ渡す。",
      "テスト要求IDは条件の rationale などに残し、テスト要求 → テスト条件の追跡を切らさない。",
      "テスト要求を品質特性へ接続する場合は、まず quality://characteristics/in-use の利用時品質特性ID(QU-XX)を検討し、対応する quality://characteristics/product のQC-XXがあれば併記すること。",
    ],
  },
  stakeholderWeightingFrame: {
    name: "ステークホルダー2軸評価フレーム（自作整理）",
    note:
      "ステークホルダーを影響力・関心度の2軸で段階評価し、扱いクラスへ落とすための定義・対応表を独自に整理したものであり、" +
      "外部文献の逐語転載ではなく、特定の外部基準・手法への適合を主張するものでもない。" +
      "評価値・扱いクラスの判断根拠は、対象プロジェクトの一次情報で必ず裏取りすること。",
    highThreshold: 3,
    steps: [
      {
        id: "SWS-01",
        nameJa: "特定",
        definition:
          "対象システムの意思決定・利用・運用・外部連携に関与する人と組織を、直接の利用者に限らず漏れなく列挙する段。",
        outputArtifact: "役割付きのステークホルダー一覧（各件がペルソナIDまたは役割名で識別できる状態）",
      },
      {
        id: "SWS-02",
        nameJa: "ニーズと期待の抽出",
        definition:
          "各ステークホルダーがシステムに何を求め、何が損なわれると困るのかを本人の言葉に寄せて言語化する段。",
        outputArtifact: "ステークホルダーごとのニーズ・期待の記述（ペルソナ4象限の目標・不満点へ接続する）",
      },
      {
        id: "SWS-03",
        nameJa: "2軸評価と得点化",
        definition:
          "影響力・関心度の段階定義に照らして各ステークホルダーを1〜4で評価し、その値を選んだ根拠となる事実を添えて得点化する段。",
        outputArtifact: "影響力・関心度・スコア・扱いクラスと根拠を持つ評価表",
      },
      {
        id: "SWS-04",
        nameJa: "絞り込みと要求導出",
        definition:
          "扱いクラスに従って重視対象を絞り、重点クラスからテスト要求・テスト条件を導出する段。落とした対象は落とした事実と理由を残す。",
        outputArtifact: "重点クラス起点のテスト要求と、参考クラスとして絞り込みで外した対象の記録",
      },
    ],
    influenceAxis: {
      id: "SW-INFLUENCE",
      nameJa: "影響力",
      description:
        "そのステークホルダーが、システムの仕様決定・受け入れ判断・リリース可否にどれだけ影響を与えられるか。",
      levels: [
        {
          value: 1,
          label: "決定に関与しない",
          criteria: "仕様や受け入れ可否の決定に加わらず、意見を述べても結果が変わらない。",
        },
        {
          value: 2,
          label: "意見を求められる",
          criteria: "意見を聞かれることはあるが、決定を覆す権限はなく、反対しても差し戻しにはならない。",
        },
        {
          value: 3,
          label: "決定に強く関与する",
          criteria: "仕様・受け入れ条件の決定に参加し、反対すれば見直しや再調整が必要になる。",
        },
        {
          value: 4,
          label: "決定権を持つ",
          criteria: "リリース可否や受け入れ判定を単独で覆せる、または最終承認を行う立場にある。",
        },
      ],
    },
    interestAxis: {
      id: "SW-INTEREST",
      nameJa: "関心度",
      description:
        "システムの品質が低下したとき、そのステークホルダーがどれだけ直接に影響を受けるか（システムとの関与の度合いを含む）。",
      levels: [
        {
          value: 1,
          label: "ほぼ影響を受けない",
          criteria: "日常的に利用せず、品質が低下しても自身の業務や利益がほぼ変わらない。",
        },
        {
          value: 2,
          label: "間接的に影響を受ける",
          criteria: "影響は他者を経由して及ぶ程度で、自身の業務は回避策で継続できる。",
        },
        {
          value: 3,
          label: "直接影響を受ける",
          criteria: "日常的に利用または依存しており、品質低下によって自身の業務が滞る。",
        },
        {
          value: 4,
          label: "業務・事業が成立しなくなる",
          criteria: "品質低下によって本人の業務や事業そのものが止まる、または金銭的・法的な不利益を直接負う。",
        },
      ],
    },
    formula:
      "stakeholderScore = influence(1..4) × interest(1..4)（範囲 1..16）。扱いクラスは score だけでは決めず、" +
      "matrix の (influence, interest) の組合せで決める。score は同一クラス内の並び順の判断にのみ用いる。",
    handlingClasses: [
      {
        id: "SWC-01",
        key: "focus",
        nameJa: "重点",
        definition: "影響力・関心度の双方が高く、テスト要求・テスト条件を必ず導出する対象。",
        rule: "影響力・関心度の双方が highThreshold(3) 以上。",
        defaultConditionPriority: "高",
        guidance:
          "テスト要求とテスト条件を必ず導出し、Before/After のテスト要求列を最初に埋める対象とする。工数不足でも縮小対象にしない。",
      },
      {
        id: "SWC-02",
        key: "standard",
        nameJa: "通常",
        definition: "影響力・関心度のいずれか一方だけが高く、代表的なテスト要求を押さえる対象。",
        rule: "影響力・関心度のいずれか一方だけが highThreshold(3) 以上。",
        defaultConditionPriority: "中",
        guidance:
          "代表的なテスト要求を押さえる。高評価側の軸に対応する観点（影響力が高いなら受け入れ判断に関わる確認、" +
          "関心度が高いなら日常利用経路の確認）を優先する。",
      },
      {
        id: "SWC-03",
        key: "reference",
        nameJa: "参考",
        definition: "影響力・関心度の双方が低く、工数不足時の縮小候補となる対象。",
        rule: "影響力・関心度の双方が highThreshold(3) 未満。",
        defaultConditionPriority: "低",
        guidance:
          "影響の確認のみとし、工数不足時の縮小候補とする。テスト条件0件でもよいが、その判断は記録に残す。",
      },
    ],
    matrix: [
      { influence: 1, interest: 1, score: 1, classKey: "reference" },
      { influence: 1, interest: 2, score: 2, classKey: "reference" },
      { influence: 1, interest: 3, score: 3, classKey: "standard" },
      { influence: 1, interest: 4, score: 4, classKey: "standard" },
      { influence: 2, interest: 1, score: 2, classKey: "reference" },
      { influence: 2, interest: 2, score: 4, classKey: "reference" },
      { influence: 2, interest: 3, score: 6, classKey: "standard" },
      { influence: 2, interest: 4, score: 8, classKey: "standard" },
      { influence: 3, interest: 1, score: 3, classKey: "standard" },
      { influence: 3, interest: 2, score: 6, classKey: "standard" },
      { influence: 3, interest: 3, score: 9, classKey: "focus" },
      { influence: 3, interest: 4, score: 12, classKey: "focus" },
      { influence: 4, interest: 1, score: 4, classKey: "standard" },
      { influence: 4, interest: 2, score: 8, classKey: "standard" },
      { influence: 4, interest: 3, score: 12, classKey: "focus" },
      { influence: 4, interest: 4, score: 16, classKey: "focus" },
    ],
    handoverConvention: [
      "すべてのペルソナ（personas[].id）について影響力・関心度の両軸を 1..4 で評価する。未評価のペルソナを絞り込み済みとして扱ってはならない。",
      "評価値は各軸の levels の value をそのまま用い、その値を選んだ根拠となる事実（一次情報・役割・依存関係）を1件以上添える。",
      "扱いクラスは matrix の (influence, interest) 対応で決める。stakeholderScore だけで重点／通常／参考を判定しない。",
      "重点クラス（SWC-01）のペルソナには extract_test_conditions のテスト条件を1件以上必ず紐づける。条件は source=\"stakeholder\" とし、derivedFrom に当該ペルソナID（personas[].id）を書く。",
      "重点クラス由来のテスト条件は handlingClasses の defaultConditionPriority を既定の priority とする。引き下げる場合は rationale に引き下げの理由を明記する。",
      "参考クラス（SWC-03）のペルソナはテスト条件0件でよいが、絞り込みで対象外にした事実と理由を成果物に残す。",
      "リスク分析（RA-IMPACT / RA-LIKELIHOOD）由来の優先度と扱いクラス由来の優先度が食い違う場合はリスク側を優先し、差分の理由を rationale に残す。",
      "テスト計画書11.2 ステークホルダーの表には、名前・役割・連絡先に加えて影響力・関心度・スコア・扱いクラスの列を持たせる。",
    ],
  },
};
