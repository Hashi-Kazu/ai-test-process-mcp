import type { BusinessRequirementFrame } from "../types.js";

// 業務側の目的 → 業務ユースケース → 業務フロー → 駆動する情報という4層で、機能IDの章立てに
// 従属しない業務要求の再構成を支援するフレーム。定義・質問例・引き渡し規約はすべて自作の
// パラフレーズであり、外部文献の逐語転載ではなく、特定の外部基準・手法（RDRA等）への適合を
// 主張するものでもない。実際の業務内容は、対象プロジェクトの一次情報で必ず裏取りすること。
export const businessRequirementFrame: BusinessRequirementFrame = {
  name: "業務ユースケース・要件モデル・フレーム（自作整理）",
  note:
    "業務側から見たシステム化の目的・業務ユースケース・業務フロー・駆動する情報を言語化するための" +
    "観点・定義・質問例を独自に整理したものであり、外部文献の逐語転載ではなく、特定の外部基準・手法への" +
    "適合を主張するものでもない。実際の業務知識・機能構成は、対象プロジェクトの一次情報で必ず裏取りすること。",
  layers: [
    {
      id: "BRL-01",
      key: "systemPurpose",
      nameJa: "システム化の目的",
      definition:
        "そのシステムを作る・改修することで、業務側が何を達成したいのかという最上位の意図。" +
        "機能名ではなく、業務上の結果で書く。",
      granularityGuidance:
        "1プロジェクトあたり1〜数件。業務ゴール・システム化目的・達成判定指標の3階層に分けて書く。",
      questionExamples: [
        "このシステムが無かったら、業務側は何に困り続けるのか。",
        "このシステム化によって、誰のどの業務がどう変わることを狙っているのか。",
      ],
      badExamples: [
        "「使いやすいシステムを作る」のように機能に依存しない一般論だけを書く。",
        "システム機能名（画面名・API名）をそのまま目的として書く。",
      ],
    },
    {
      id: "BRL-02",
      key: "businessUseCase",
      nameJa: "業務ユースケース",
      definition:
        "業務側の担い手が、業務上の完了状態に至るまでの一続きの活動。機能IDの単位ではなく、" +
        "業務が完結する単位で切る。",
      granularityGuidance:
        "1業務ユースケースは1人（1ロール）の担い手が1つの業務目的を完了させる粒度に揃える。" +
        "複数の機能IDにまたがってよい。",
      questionExamples: [
        "この業務ユースケースは、誰が何をもって「終わった」と判断するのか。",
        "この業務ユースケースは、どの機能ID群を横断して実現されるのか。",
      ],
      badExamples: [
        "画面遷移1つを業務ユースケースとして切り出す（機能IDの単位と混同している）。",
        "担い手が誰か特定できないまま業務ユースケースを記述する。",
      ],
    },
    {
      id: "BRL-03",
      key: "businessFlow",
      nameJa: "業務フロー",
      definition:
        "業務ユースケースを構成する工程の並びと、工程間で受け渡される情報・分岐・待ち・" +
        "システム外に残る手作業。",
      granularityGuidance:
        "1業務ユースケースあたり数工程〜十数工程。1工程は1つの担い手による1つの行為に揃える。",
      questionExamples: [
        "工程間で受け渡される情報は何か。誰から誰に渡るのか。",
        "この工程で判断が割れる場合、誰の権限でどちらへ進むのか。",
      ],
      badExamples: [
        "工程の担い手を書かないまま行為だけを列挙する。",
        "システム内の処理手順（ログ・バッチ）を業務フローとして書いてしまう。",
      ],
    },
    {
      id: "BRL-04",
      key: "drivingData",
      nameJa: "駆動する情報",
      definition:
        "業務フローを動かす源になる情報。発生源・状態の有無・共有範囲・保持期間を持つ、" +
        "業務ユースケースが読み書きする対象。",
      granularityGuidance:
        "1業務ユースケースあたり複数件。design_test_data のデータ区分1件に対応する粒度まで下げる。",
      questionExamples: [
        "この情報はどこで発生し、いつの時点のものとして扱われるのか。",
        "この情報は状態（未処理／処理済 等）を持つか。持つなら誰がどの工程で変えるのか。",
      ],
      badExamples: [
        "情報の発生源を書かないまま「マスタ」とだけ書く。",
        "状態を持つと言いながら、その状態の一覧を書かない。",
      ],
    },
  ],
  purposeLevels: [
    {
      id: "BPL-01",
      key: "businessGoal",
      definition:
        "業務側が最終的に達成したい経営・現場レベルの結果。システムに依存しない言葉で書く。",
      questionExamples: [
        "このシステム化の話が出る前、業務側は何を経営課題・現場課題として抱えていたか。",
      ],
      badExamples: ["「システムを刷新する」のようにシステムの存在を前提にした目標を書く。"],
    },
    {
      id: "BPL-02",
      key: "systemizationPurpose",
      definition:
        "業務ゴールを実現する手段として、なぜ・何をシステム化するのかという意図。" +
        "業務ゴールとシステムの間をつなぐ層。",
      questionExamples: ["業務ゴールに対して、なぜ人手ではなくシステム化を選んだのか。"],
      badExamples: ["業務ゴールと同じ文をそのまま繰り返すだけで、システム化の意図を書かない。"],
    },
    {
      id: "BPL-03",
      key: "achievementMetric",
      definition:
        "システム化の目的が達成されたかどうかを、誰がどう測るのかという判定指標と測定方法。",
      questionExamples: [
        "達成したかどうかを、いつ・誰が・何の数値で判断するのか。",
        "その数値はどこから取得できるのか（測定方法）。",
      ],
      badExamples: ["「満足度が上がること」のように測定方法が読み取れない指標だけを書く。"],
    },
  ],
  useCaseAspects: [
    {
      id: "BUC-01",
      nameJa: "業務側の名称",
      definition: "システムの機能名ではなく、業務側が普段呼んでいる呼称。",
      questionExamples: ["業務側は、この一連の活動を普段どう呼んでいるか。"],
      required: true,
    },
    {
      id: "BUC-02",
      nameJa: "担い手となる業務ロール",
      definition: "この業務ユースケースを主に遂行する業務上の役割。",
      questionExamples: ["この業務ユースケースは、どの役割の人が主に遂行するのか。"],
      required: true,
    },
    {
      id: "BUC-03",
      nameJa: "起動の契機",
      definition: "この業務ユースケースが始まるきっかけ。",
      questionExamples: ["何が起きると、この業務ユースケースが始まるのか。"],
      required: true,
    },
    {
      id: "BUC-04",
      nameJa: "業務上の完了状態",
      definition: "この業務ユースケースが「終わった」と判断できる業務上の状態。",
      questionExamples: ["何が成立すれば、この業務ユースケースは終わったと言えるのか。"],
      required: true,
    },
    {
      id: "BUC-05",
      nameJa: "関連する機能ID",
      definition: "この業務ユースケースを実現するために横断する機能IDの集合。",
      questionExamples: ["この業務ユースケースは、どの機能ID群を使って実現されるのか。"],
      required: false,
    },
    {
      id: "BUC-06",
      nameJa: "例外時の業務運用",
      definition:
        "システムが想定通りに動かない・処理が止まったときに、業務側がどう運用でしのぐか。",
      questionExamples: ["この業務ユースケースが途中で止まったとき、現場はどう対応するのか。"],
      required: false,
    },
  ],
  flowAspects: [
    {
      id: "BFL-01",
      nameJa: "工程の並び",
      definition: "業務ユースケースを構成する工程の実施順序。",
      questionExamples: ["工程はどの順番で行われるのか。並行して行われる工程はあるか。"],
    },
    {
      id: "BFL-02",
      nameJa: "受け渡される情報",
      definition: "工程から次の工程へ受け渡される情報。",
      questionExamples: ["この工程は、次の工程へ何の情報を渡すのか。"],
    },
    {
      id: "BFL-03",
      nameJa: "判断分岐と権限",
      definition: "工程内で判断が割れる条件と、その判断を下す権限の所在。",
      questionExamples: ["この工程での判断は、誰の権限で行われるのか。"],
    },
    {
      id: "BFL-04",
      nameJa: "待ち・滞留・締め処理",
      definition: "工程間で発生する待ち時間・滞留・締め切り処理。",
      questionExamples: ["この工程はどれくらい滞留しうるか。締め処理のタイミングはあるか。"],
    },
    {
      id: "BFL-05",
      nameJa: "システム外に残る手作業",
      definition: "システム化されずに人手・紙・口頭で残っている作業。",
      questionExamples: ["この業務フローのうち、システム外に残っている手作業はどこか。"],
    },
  ],
  dataAspects: [
    {
      id: "BDA-01",
      nameJa: "駆動する情報の識別",
      definition: "その情報を一意に指し示すための識別方法。",
      questionExamples: ["この情報は何をもって同一のものと判断するのか。"],
      suggestedDataClassKinds: ["master"],
    },
    {
      id: "BDA-02",
      nameJa: "発生源と鮮度",
      definition: "その情報がどこで発生し、いつの時点のものとして扱われるか。",
      questionExamples: ["この情報はどこで発生するのか。どれくらいの頻度で更新されるのか。"],
      suggestedDataClassKinds: ["transaction", "time-dependent"],
    },
    {
      id: "BDA-03",
      nameJa: "状態を持つか",
      definition: "その情報がライフサイクル上の状態（未処理／処理済 等）を持つか。",
      questionExamples: ["この情報は状態を持つか。持つなら、その状態の一覧は何か。"],
      suggestedDataClassKinds: ["transaction", "counter"],
    },
    {
      id: "BDA-04",
      nameJa: "共有範囲",
      definition: "その情報を複数の業務ユースケース・担い手がどこまで共有するか。",
      questionExamples: ["この情報は、どの業務ユースケース・担い手の間で共有されるのか。"],
      suggestedDataClassKinds: ["master", "external-settlement"],
    },
    {
      id: "BDA-05",
      nameJa: "保持期間と法規制",
      definition: "その情報をどれだけの期間保持し、遵守すべき法規制があるか。",
      questionExamples: ["この情報はいつまで保持するのか。保持・破棄に関わる法規制はあるか。"],
      suggestedDataClassKinds: ["credential", "external-settlement"],
    },
  ],
  roleSeparation: {
    businessFrameScope:
      "業務側の目的（システム化の目的・業務ゴール・達成判定指標）、業務ロール（担い手）、" +
      "業務フローの工程順序、駆動する情報、機能IDとの接続を担う。",
    personaFrameScope:
      "利用者個人としての属性・発言/思考・目標・不満点（4象限）、および現状(Before)/将来(After)から" +
      "導くテスト要求を担う（`testcondition://persona/journey-frame` の役割）。",
    sharedTopics: [
      {
        topic: "業務フロー(DOM-04 と BFL-01)",
        owner: "business",
        rule:
          "工程の並びと担い手の正はこのフレームの BFL-01 に書く。persona 側の DOM-04 は業界一般の" +
          "傾向把握にとどめ、個々の業務ユースケースの工程順序は書かない。",
      },
      {
        topic: "役割・担い手（ペルソナと業務ロール）",
        owner: "persona",
        rule:
          "利用者個人としての人物像（属性・発言・思考）は persona 側の4象限に書く。このフレームの" +
          "actorRoleId は「どの役割か」という業務上の役割IDのみを持ち、個人の属性・発言・思考は書かない。",
      },
      {
        topic: "目標（利用者の目標とシステム化の目的）",
        owner: "persona",
        rule:
          "利用者個人が達したい状態は persona 側の goals 象限に書く。このフレームの目的階層" +
          "（BPL-01〜03）は、組織・業務側から見たシステム化の意図と達成判定指標のみを書き、" +
          "個人の目標をそのまま複製しない。",
      },
    ],
    avoidDuplication: [
      "同じ内容を業務側フレームと persona フレームの双方に書かず、上記 sharedTopics の owner 側にのみ書く。" +
        "もう一方からは owner 側のIDを参照するにとどめる。",
    ],
  },
  handoverConventions: [
    {
      id: "BRH-01",
      targetTool: "design_scenario_flows",
      available: true,
      rules: [
        "業務ユースケース1件を useCases[] の1件へ変換する。",
        "担い手（actorRoleId）を actors[] へ変換する。人手の業務ロールは kind:\"human\"、外部システムは" +
          "kind:\"system\" として宣言する。",
        "起動の契機（BUC-03）を preconditions へ、工程の並び（BFL-01）を mainFlow[].no/actor/action へ変換する。",
        "関連する機能ID（BUC-05・工程ごとの featureIds）をステップの featureIds へ変換する。",
        "例外時の業務運用（BUC-06）を branches[] の kind:\"exception\" へ、目的は達成するが経路が" +
          "異なる業務運用を kind:\"alternate\" へ変換する。",
        "機能ID母集団（featureIdPopulation）を featureIds（機能ID母集団の宣言）へそのまま渡す。",
      ],
    },
    {
      id: "BRH-02",
      targetTool: "design_test_data",
      available: true,
      rules: [
        "駆動する情報1件を dataClasses[] の1件へ変換する。",
        "kind は BDA-xx の suggestedDataClassKinds から選ぶ。",
        "BDA-03（状態を持つか）で状態を持つと判定した情報は states / transitions を宣言する。",
        "業務ユースケースの read / update を testCases[].requiredData[].access へ写す。",
      ],
    },
    {
      id: "BRH-03",
      targetTool: "audit_cross_matrix",
      available: true,
      rules: [
        "axes に業務ユースケース軸（axisId:\"BIZUC\"）と機能ID軸（axisId:\"FEATURE\"）を立てる。",
        "links で業務ユースケースと機能IDを相互参照させる。",
        "空行＝どの機能IDにも接続しない業務ユースケース、空列＝どの業務ユースケースからも参照されない" +
          "機能IDとして CMX-03 で検出させる。",
        "expectedAxisPopulations に機能ID母集団を渡し、母集団縮小も検査させる。",
      ],
    },
    {
      id: "BRH-04",
      targetTool: "テスト目的の導出フレーム（未実装。#85）",
      available: false,
      rules: [
        "目的階層（BPL-01〜03）のIDを成果物本文に残し、テスト目的導出フレームが実装された時点で" +
          "参照元として渡せる状態を保つ。",
        "現時点では本MCP内での自動接続は行わない。",
      ],
    },
  ],
};
