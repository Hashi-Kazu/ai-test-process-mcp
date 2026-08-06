import type { TestPurposeDerivationFrame } from "../types.js";

// 依頼者の期待 → テスト要求（マネジメント的／エンジニアリング的の2系統） → テスト戦略 →
// テスト目的 → 優先順位、という導出チェーンを言語化するための観点・定義・質問例を独自に
// 整理したフレーム。定義・質問例・判定区分はすべて自作のパラフレーズであり、外部文献の逐語
// 転載ではなく、特定の外部基準・手法への適合を主張するものでもない。実際の依頼内容・優先順位
// は、対象プロジェクトの一次情報（依頼書・関係者へのヒアリング）で必ず裏取りすること。
export const testPurposeDerivationFrame: TestPurposeDerivationFrame = {
  name: "テスト目的の導出フレーム（自作整理）",
  note:
    "依頼者の期待からテスト目的・優先順位までを一続きの連鎖として言語化するための観点・定義・" +
    "質問例を独自に整理したものであり、外部文献の逐語転載ではなく、特定の外部基準・手法への" +
    "適合を主張するものでもない。実際の依頼内容・優先順位は、対象プロジェクトの一次情報で必ず" +
    "裏取りすること。",
  stages: [
    {
      id: "PDS-01",
      key: "expectation",
      nameJa: "依頼者の期待の把握",
      definition:
        "テストを依頼した相手が、テストを通じて何を確信したいのか・何を確認してほしいのかという" +
        "一次的な期待。依頼書・関係者への聞き取りから拾う。",
      outputConvention:
        "期待は EXP-xx としてIDを付け、依頼書の該当位置（文書名・行番号）を sourceRef に残す。",
      questionExamples: [
        "依頼者は、このテストの結果として何を確信したいのか。",
        "依頼者が最も心配している事態は何か。",
        "依頼者は誰に対してこのテストの結果を説明する必要があるのか。",
      ],
      badExamples: [
        "依頼書の見出しをそのまま期待として書き写す（依頼者の意図を言い換えていない）。",
        "「品質を確保したい」のように、どのテストにも当てはまる一般論だけを書く。",
      ],
    },
    {
      id: "PDS-02",
      key: "testRequirement",
      nameJa: "テスト要求の整理",
      definition:
        "依頼者の期待を、テスト活動の運営に対する要求（マネジメント的）と、テスト対象の中身に" +
        "対する要求（エンジニアリング的）の2系統に分けて具体化したもの。",
      outputConvention:
        "要求は TR-xx としてIDを付け、系統（management/engineering）と紐づく期待ID" +
        "（expectationIds）を残す。",
      questionExamples: [
        "この期待は、テストの進め方・体制・報告に対する要求か、テスト対象そのものに対する要求か。",
        "この要求を満たしたかどうかを、誰がどの時点で判断するのか。",
      ],
      badExamples: [
        "期待の文章をほぼそのまま複写し、要求として具体化していない。",
        "2系統のどちらに属するかを判断せず、両方に該当する曖昧な書き方をする。",
      ],
    },
    {
      id: "PDS-03",
      key: "strategy",
      nameJa: "テスト戦略の適用",
      definition:
        "整理したテスト要求を満たすために、限られたリソース・期間の中でどこに重点を置くかという" +
        "方針。テスト目的を決める前段の判断材料になる。",
      outputConvention: "戦略は ST-xx としてIDを付け、方針の文章として残す（下流IDからの参照は必須にしない）。",
      questionExamples: [
        "限られた期間・要員の中で、どの要求を優先的に満たすべきか。",
        "リスクの高い領域と低い領域で、テストの厚みをどう変えるか。",
      ],
      badExamples: [
        "「全部丁寧にテストする」のように、優先順位を含まない方針を書く。",
        "戦略とテスト目的を区別せず、いきなり個別のテスト目的だけを書く。",
      ],
    },
    {
      id: "PDS-04",
      key: "purpose",
      nameJa: "テスト目的の決定",
      definition:
        "テスト要求とテスト戦略を踏まえて決めた、個々のテスト活動が達成すべき具体的な目的。" +
        "達成・未達を判定できる形で書く。",
      outputConvention:
        "目的は TP-xx としてIDを付け、紐づくテスト要求ID（testRequirementIds）・戦略ID" +
        "（strategyIds）・達成判定基準（successCriterion）を残す。",
      questionExamples: [
        "この目的が達成されたかどうかを、何をもって判定するのか。",
        "この目的から、どのテスト観点・テスト条件が導出できるか。",
      ],
      badExamples: [
        "「機能テストを実施する」のように、テストタイプ名をそのまま目的として書く。",
        "達成判定基準を書かず、目的の文章だけで終わらせる。",
      ],
    },
    {
      id: "PDS-05",
      key: "prioritization",
      nameJa: "目的・タイプの優先順位付け",
      definition:
        "決定したテスト目的、およびそこから選ぶテストタイプに、限られたリソースの中でどの順で" +
        "取り組むかという優先順位を付けること。",
      outputConvention: "各目的の priorityRank（1が最優先）と priorityRationale（根拠）を残す。",
      questionExamples: [
        "この目的が未達のまま出荷した場合、依頼者にどの程度の影響が出るか。",
        "この目的の達成確認は、他の目的よりも先に着手すべきか。",
      ],
      badExamples: [
        "全ての目的を同一順位のまま並べ、優先順位を付けない。",
        "優先順位の根拠を書かず、順位の数値だけを割り当てる。",
      ],
    },
  ],
  requirementLines: [
    {
      id: "PRL-01",
      line: "management",
      nameJa: "マネジメント的テスト要求",
      definition:
        "テスト活動そのものの運営に対する要求。期間・体制・報告のタイミングと形式・リリース判断への" +
        "関わり方など、テストをどう進めるかに関する要求。",
      typicalSubjects: ["テスト期間", "テスト体制", "進捗報告の頻度・形式", "リリース判断への関与"],
      probeQuestions: [
        "依頼者は、テストの進捗をどのタイミング・どの形式で知りたいのか。",
        "テスト完了の判断に、依頼者自身がどこまで関与したいのか。",
        "テスト実施体制・期間について、依頼者側に制約や希望はあるか。",
      ],
    },
    {
      id: "PRL-02",
      line: "engineering",
      nameJa: "エンジニアリング的テスト要求",
      definition:
        "テスト対象そのものの中身に対する要求。対象範囲・確認すべき条件・満たすべき品質特性など、" +
        "何を確認するかに関する要求。",
      typicalSubjects: ["対象機能・対象範囲", "確認すべき利用条件", "満たすべき品質特性", "許容できない不具合の種類"],
      probeQuestions: [
        "この要求は、対象システムのどの機能・どの品質特性に関わるものか。",
        "この要求が満たされないと、どのような不具合が本番で顕在化するのか。",
        "この要求を確認するために必要な、テスト対象の状態・条件は何か。",
      ],
    },
  ],
  purposeQualityRules: [
    {
      id: "PQR-01",
      nameJa: "達成・未達を判定できるか",
      rule: "テスト目的は、達成したかどうかを客観的に判定できる形で書かれているか（successCriterion を伴うか）。",
    },
    {
      id: "PQR-02",
      nameJa: "観点を導出できるか",
      rule: "テスト目的から、テスト観点・テスト条件を1件以上具体的に導出できるか。",
    },
    {
      id: "PQR-03",
      nameJa: "テストタイプ名をそのまま書いていないか",
      rule: "「機能テストを実施する」のようにテストタイプ名をそのままテスト目的として書いていないか。",
    },
    {
      id: "PQR-04",
      nameJa: "複数のテスト要求を束ねているか",
      rule: "テスト目的が、関連する複数のテスト要求を1つの達成状態として束ねられているか。",
    },
    {
      id: "PQR-05",
      nameJa: "依頼者の期待に遡れるか",
      rule: "テスト目的から、テスト要求を経由して依頼者の期待まで遡って説明できるか。",
    },
  ],
  prioritizationAxes: [
    {
      id: "PPA-01",
      nameJa: "依頼者要求との関連の強さ",
      definition: "この目的が、依頼者の期待・テスト要求とどれだけ強く結びついているか。",
      probeQuestions: ["この目的は、依頼者のどの期待に最も強く結びついているか。"],
    },
    {
      id: "PPA-02",
      nameJa: "未達時の影響",
      definition: "この目的が未達のまま出荷・リリースされた場合に生じる影響の大きさ。",
      probeQuestions: ["この目的が未達のまま出荷された場合、誰にどのような影響が出るか。"],
    },
    {
      id: "PPA-03",
      nameJa: "検証の緊急度",
      definition: "この目的の達成状況を、他の目的よりも早く確認する必要があるか。",
      probeQuestions: ["この目的の確認が遅れると、後続工程にどのような支障が出るか。"],
    },
  ],
  categories: [
    {
      id: "PDC-01",
      nameJa: "未解決参照",
      severity: "high",
      definition:
        "testRequirements[].expectationIds / purposes[].testRequirementIds / purposes[].strategyIds / " +
        "testConditions[].purposeIds / testTypeSelections[].purposeIds が宣言済みIDを指していない。",
      recommendedAction: "参照先IDを宣言するか、参照側の記述を修正すること。",
    },
    {
      id: "PDC-02",
      nameJa: "ID重複・プレフィックス不一致・欠番",
      severity: "high",
      definition: "種別ごとにID重複、既定/指定プレフィックス不一致、連番の欠番がある。",
      recommendedAction: "ID採番規約に合わせて重複・欠番を解消すること。",
    },
    {
      id: "PDC-03",
      nameJa: "どのテスト要求からも参照されない依頼者の期待",
      severity: "high",
      definition: "期待がテスト要求へ落とし込まれていない。",
      recommendedAction: "この期待からテスト要求を導出するか、対象外とする理由を明記すること。",
    },
    {
      id: "PDC-04",
      nameJa: "依頼者の期待に紐づかないテスト要求",
      severity: "high",
      definition: "テスト要求の expectationIds が空である。",
      recommendedAction: "この要求がどの期待に由来するかを明記すること。",
    },
    {
      id: "PDC-05",
      nameJa: "どのテスト目的からも参照されないテスト要求",
      severity: "high",
      definition: "テスト要求がテスト目的へ束ねられていない。",
      recommendedAction: "このテスト要求を満たすテスト目的を追加するか、対象外とする理由を明記すること。",
    },
    {
      id: "PDC-06",
      nameJa: "テスト要求に紐づかないテスト目的",
      severity: "high",
      definition: "テスト目的の testRequirementIds が空である。",
      recommendedAction: "この目的がどのテスト要求から導出されたかを明記すること。",
    },
    {
      id: "PDC-07",
      nameJa: "テスト要求の系統欠落",
      severity: "medium",
      definition: "management / engineering のいずれかの系統が0件である。",
      recommendedAction: "欠落している系統の要求を洗い出し、意図的に無いのであれば理由を明記すること。",
    },
    {
      id: "PDC-08",
      nameJa: "どのテスト目的にも紐づかないテスト条件",
      severity: "high",
      definition: "testConditions[].purposeIds が空である。",
      recommendedAction: "このテスト条件がどのテスト目的から導出されたかを明記すること。",
    },
    {
      id: "PDC-09",
      nameJa: "どのテスト条件からも参照されないテスト目的",
      severity: "high",
      definition: "テスト目的が観点・テスト条件へ展開されていない。",
      recommendedAction: "この目的からテスト条件を導出するか、未展開の理由を明記すること。",
    },
    {
      id: "PDC-10",
      nameJa: "テストタイプ選択と目的の不整合",
      severity: "high",
      definition:
        "selected:true なのに purposeIds が空／reason が空、または selected:false なのに purposeIds が非空である。",
      recommendedAction: "選定・非選定の判断根拠となるテスト目的IDと理由を明記すること。",
    },
    {
      id: "PDC-11",
      nameJa: "どのテストタイプにも紐づかないテスト目的",
      severity: "medium",
      definition: "テスト目的がテストタイプ決定に反映されていない。",
      recommendedAction: "この目的を根拠とするテストタイプ選択を追加するか、対象外の理由を明記すること。",
    },
    {
      id: "PDC-12",
      nameJa: "達成判定基準の未記入",
      severity: "high",
      definition: "successCriterion が未指定または空である。",
      recommendedAction: "この目的が達成されたと判定できる客観的な基準を記入すること。",
    },
    {
      id: "PDC-13",
      nameJa: "優先順位の未設定・重複・根拠未記入",
      severity: "high",
      definition: "priorityRank が未指定、同一値が重複、または priorityRationale が空である。",
      recommendedAction: "優先順位付けの軸（PPA-01〜03）に基づき順位と根拠を記入すること。",
    },
    {
      id: "PDC-14",
      nameJa: "品質特性の未割当・未知ID",
      severity: "medium",
      definition:
        "目的にもテスト条件にも品質特性IDが無い、または製品品質特性モデル（QC-*）・利用時品質特性モデル（QU-*）のいずれにも存在しないIDが指定されている。",
      recommendedAction:
        "製品品質特性モデル（QC-*）・利用時品質特性モデル（QU-*）のいずれかから既知の品質特性IDを割り当てるか、対象外の理由を明記すること。",
    },
    {
      id: "PDC-15",
      nameJa: "依頼書本文に裏付けの無い期待",
      severity: "high",
      definition:
        "requestDocuments 指定時、id も statement も本文に出現せず sourceRef も未指定である。sourceRef が" +
        "ある場合は文書名の実在と行番号が文書行数の範囲内かを照合する。",
      recommendedAction: "依頼書の該当箇所を sourceRef として明記するか、期待の記述を依頼書の言葉に合わせること。",
    },
    {
      id: "PDC-16",
      nameJa: "宣言した被覆率と実測値の不一致",
      severity: "high",
      definition:
        "claimedPurposeCoveragePercent / claimedTestTypeJustificationPercent が算出値と0.05超の差がある。",
      recommendedAction: "宣言値を算出値に合わせて修正するか、算出根拠となる入力を見直すこと。",
    },
    {
      id: "PDC-17",
      nameJa: "カタログ外のテストタイプ名",
      severity: "medium",
      definition: "testTypeSelections[].name が testTypeCatalog の name に存在しない。",
      recommendedAction: "カタログに存在するテストタイプ名を使うか、カタログの拡張を検討すること。",
    },
  ],
  notes: [
    "本検査は渡された期待・要求・目的に対してのみ成立し、依頼書に書かれていない期待の取りこぼしは検出できない。",
    "テスト目的の件数に正解はなく、本フレームの例で示す件数は例に過ぎない。",
    "決定的層は候補列挙までであり、テスト目的の妥当性判断（内容として適切か）は意味的層に委ねる。",
    "テスト戦略（strategyStatements）は下流IDからの参照を必須にしていない。優先順位判断の背景説明として自由に使ってよい。",
  ],
};
