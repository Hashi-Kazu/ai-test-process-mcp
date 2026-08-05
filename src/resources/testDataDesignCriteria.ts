import type { TestDataDesignCriteria } from "../types.js";

// design_test_data のデータ区分種別カタログ・判定区分カタログ。自作のパラフレーズであり、
// 原典（JSTQB等）の逐語転載はしない。
export const testDataDesignCriteria: TestDataDesignCriteria = {
  name: "テストデータ設計 データ区分種別・判定区分カタログ（自作整理）",
  note:
    "データの生成〜更新〜消滅までのライフサイクルをテストデータとして扱う際の考え方を独自に整理したものであり、" +
    "外部文献の逐語転載や特定の外部基準への適合を主張するものではない。",
  summary:
    "データ区分ごとのライフサイクル状態・遷移を宣言し、テストケースが要求する前提データの状態・アクセス種別（read/update）を、" +
    "データ管理表の実体（dataItems）およびケース本文と決定的に照合するための判定区分。",
  dataKinds: [
    {
      id: "TDK-01",
      kind: "master",
      nameJa: "マスタ系データ",
      description: "商品・利用者・料金表のように、業務の前提として参照されるが更新頻度が低いデータ。",
      cautions: [
        "複数ケースから同時に参照されやすく、あるケースの更新が他ケースの前提を壊しやすい。",
        "共有方針(sharingPolicy)を明示しないと、read専用のつもりが update されて実行順序依存が生まれる。",
      ],
    },
    {
      id: "TDK-02",
      kind: "transaction",
      nameJa: "トランザクション系データ",
      description: "注文・予約・申請のように、業務の実行を通じて生成され状態が進行するデータ。",
      cautions: [
        "状態遷移そのものが確認対象であり、read専用のケースだけでは状態進行の検証にならない。",
        "同一データを複数ケースが同時に更新すると、遷移の前提（from状態）が競合する。",
      ],
    },
    {
      id: "TDK-03",
      kind: "counter",
      nameJa: "カウンタ・連番系データ",
      description: "在庫数・残席数・連番のように、他のケースの実行順序によって値が変動するデータ。",
      cautions: [
        "実行順序に依存するため、他技法よりも排他・実行順序の宣言が重要になる。",
        "参照するだけのケースが多いと、値が変動する境界（0件・上限）の検証が漏れる。",
      ],
    },
    {
      id: "TDK-04",
      kind: "credential",
      nameJa: "認証・権限系データ",
      description: "アカウント・トークン・権限設定のように、操作の許可範囲を決めるデータ。",
      cautions: [
        "無効化・失効の状態遷移が起こりやすく、状態を戻せない（isTerminal）遷移の宣言漏れが起きやすい。",
        "共有すると、あるケースの失効操作が他ケースの前提を壊す。",
      ],
    },
    {
      id: "TDK-05",
      kind: "external-settlement",
      nameJa: "外部連携・決済系データ",
      description: "決済・外部システム連携のように、外部システム側の状態と同期する必要があるデータ。",
      cautions: [
        "外部側の状態を直接操作できないことが多く、状態遷移の宣言だけでは供給元が用意できない場合がある。",
        "取消・返金のような逆方向遷移を宣言し忘れると、後続ケースの前提データが用意できない。",
      ],
    },
    {
      id: "TDK-06",
      kind: "time-dependent",
      nameJa: "時刻・期限依存データ",
      description: "有効期限・締め時刻・日付跨ぎのように、時間経過そのものが状態遷移の引き金になるデータ。",
      cautions: [
        "時刻依存の遷移は本ツールの決定的検査の対象外であり、期限切れの状態も dataItems の実体として宣言しないと供給元不在になる。",
        "実行順序・タイミングそのものの検証は timing-order-test の担当領域であり、本ツールは状態・遷移の宣言整合のみを扱う。",
      ],
    },
  ],
  categories: [
    {
      id: "TDC-01",
      nameJa: "IDの重複",
      severity: "high",
      definition:
        "dataClasses[].id、区分内の states[].id、区分内の transitions[].id、dataItems[].id、または testCases[].caseId が重複して宣言されている。",
      recommendedAction: "重複しているIDのいずれかを採番し直すこと。区分内IDは区分をまたいで一意である必要はないが、同一区分内では一意にすること。",
    },
    {
      id: "TDC-02",
      nameJa: "未宣言IDの参照",
      severity: "high",
      definition:
        "transitions の from/to、dataItems の dataClassId/initialStateId、requiredData の dataClassId/stateId/dataItemId/resultStateId/transitionId が、宣言済みのIDを参照していない。",
      recommendedAction: "参照先IDの綴りを確認し、宣言済みのIDへ修正するか、参照先を新たに宣言すること。",
    },
    {
      id: "TDC-03",
      nameJa: "初期状態の宣言不正",
      severity: "high",
      definition: "データ区分ごとに isInitial を宣言した状態が0件、または2件以上ある。",
      recommendedAction: "各データ区分の初期状態を1件だけ isInitial: true で宣言すること。",
    },
    {
      id: "TDC-04",
      nameJa: "遷移イベントの未記入",
      severity: "high",
      definition: "遷移のイベント名(event)が空欄または空白のみである。",
      recommendedAction: "その遷移を引き起こす操作・イベント名を記入すること。",
    },
    {
      id: "TDC-05",
      nameJa: "到達不能な状態",
      severity: "medium",
      definition: "初期状態から遷移をたどっても到達できない状態が宣言されている。",
      recommendedAction: "初期状態からその状態へ至る遷移を追加するか、不要な状態を削除すること。",
    },
    {
      id: "TDC-06",
      nameJa: "デッドエンド状態",
      severity: "medium",
      definition: "出て行く遷移が1件も無く、終端(isTerminal)としても宣言されていない状態がある。",
      recommendedAction: "その状態から先の遷移を追加するか、意図した終端であれば isTerminal: true を宣言すること。",
    },
    {
      id: "TDC-07",
      nameJa: "どのケースからも要求されない状態",
      severity: "medium",
      definition:
        "データ区分×ライフサイクル状態マトリクスの当該セルを要求するテストケースが1件も無い。テストケースが未指定のときは判定しない。",
      recommendedAction: "その状態を要求するテストケースを追加するか、確認不要である理由を明記すること。",
    },
    {
      id: "TDC-08",
      nameJa: "どのケースの update も通過しない遷移",
      severity: "medium",
      definition:
        "宣言した遷移のうち、いずれの update 要求からも一意に通過が確定するケースが無い。テストケースが未指定のときは判定しない。",
      recommendedAction: "その遷移を通過する update 要求（transitionId または from/resultStateId の組）を持つテストケースを追加すること。",
    },
    {
      id: "TDC-09",
      nameJa: "どのケースからも要求されないデータ区分",
      severity: "medium",
      definition: "宣言したデータ区分のうち、1件のテストケースからも requiredData で参照されないものがある。テストケースが未指定のときは判定しない。",
      recommendedAction: "そのデータ区分を要求するテストケースを追加するか、今回の対象外である理由を明記すること。",
    },
    {
      id: "TDC-10",
      nameJa: "供給元不在",
      severity: "high",
      definition:
        "テストケースが要求する (dataClassId, stateId) に対し、dataItems のうち同一区分かつ initialStateId から遷移グラフでその状態へ到達可能な実体が1件も無い。dataItemId 指定時はその実体単体の到達可能性で判定する。dataItems が未指定のときは判定せず未照合として別掲する。",
      recommendedAction: "その状態へ到達できる dataItem を追加するか、初期状態からの遷移を追加すること。dataItemId を指定している場合はその実体の初期状態を見直すこと。",
    },
    {
      id: "TDC-11",
      nameJa: "本文裏付けなし",
      severity: "medium",
      definition:
        "要求が指す状態名（または状態ID）が、そのケースの前提条件・手順本文に現れない。データ区分名・実体のラベル・属性値は補助証跡であり、これらだけが本文に現れても成立しない。ケース本文が1つも渡されていないケースは判定しない。",
      recommendedAction: "状態名（または状態ID）そのものが本文から読み取れるよう前提条件・手順を補記すること。データ区分名・実体のラベル・属性値の記載だけでは解消しない。",
    },
    {
      id: "TDC-12",
      nameJa: "供給過剰",
      severity: "medium",
      definition: "どのテストケースからも使われない dataItems の行がある。dataItems が未指定のときは判定しない。",
      recommendedAction: "使われていない実体を削除するか、その実体を使うテストケースを追加すること。",
    },
    {
      id: "TDC-13",
      nameJa: "同一データを更新する複数ケース",
      severity: "medium",
      definition: "同一データ（dataItemId、または dataClassId＋keyAttributes で同定した単位）を update するテストケースが2件以上ある。",
      recommendedAction: "実行順序または排他制御を明示するか、各ケースが専用のデータを使うよう dataItemId を分けること。",
    },
    {
      id: "TDC-14",
      nameJa: "共有方針(shared)と update要求の不一致",
      severity: "high",
      definition: "sharingPolicy: \"shared\" を宣言したデータ区分に update 要求が存在する。",
      recommendedAction: "共有方針を \"exclusive\" または \"per-case\" へ変更するか、当該 update 要求を専用データへ差し替えること。",
    },
    {
      id: "TDC-15",
      nameJa: "共有方針(exclusive)と共有実体の不一致",
      severity: "medium",
      definition: "sharingPolicy: \"exclusive\" を宣言したデータ区分の同一データを、read/update を問わず2件以上のケースが共有している。",
      recommendedAction: "各ケースへ専用のデータ実体（dataItemId）を割り当て直すこと。",
    },
    {
      id: "TDC-16",
      nameJa: "不正遷移の要求",
      severity: "high",
      definition: "update 要求が resultStateId または transitionId を指定しているのに、要求元の stateId から到達する遷移がグラフ上に存在しない。",
      recommendedAction: "要求している遷移が実際に宣言されているか確認し、遷移を追加するか要求側の状態・遷移指定を修正すること。",
    },
    {
      id: "TDC-17",
      nameJa: "上限超過",
      severity: "info",
      definition: "dataClasses の件数が maxDataClasses を超える、またはいずれかの区分の states の件数が maxStatesPerClass を超えるため、マトリクス・被覆の算出を行わなかった。",
      recommendedAction: "データ区分・状態を統合して件数を減らすか、必要であれば上限値を明示的に引き上げること。",
    },
    {
      id: "TDC-18",
      nameJa: "状態変化前提の区分に update 要求が無い",
      severity: "medium",
      definition: "kind が counter / transaction / external-settlement のデータ区分に update 要求が1件も無い。",
      recommendedAction: "その区分の状態が実際に変化する操作を要求するテストケースを追加すること。",
    },
  ],
  notes: [
    "実行順序そのもの（トポロジカルソート・クリティカルパス・要員/リソースの集計）は本ツールの対象外であり、将来の analyze_execution_order（実行順序決定エンジン）へ引き渡す入力の宣言に留める。",
    "状態被覆率は本文裏付け(TDC-11、状態名の本文出現)を通過した要求だけを分子に数える。遷移被覆率はさらに、遷移元状態＋（イベントまたは遷移先状態）が本文に現れる（または遷移IDの直接記載がある）ことを要求し、状態粒度の裏付けだけでは分子に数えない。テストケース本文が1件も渡されていない、または遷移が1件も宣言されていない場合は、数値を出さず未算出（理由）と明記する。",
    "同一データの同定は dataItemId 指定時はその実体、未指定時は dataClassId とキー属性(keyAttributes)の値の組で行う。keyAttributes を宣言していない場合はデータ区分単位で同定する。",
    "本検査は渡されたデータ区分・実体・テストケースに対してのみ成立し、そもそも洗い出されていないデータ区分・状態の取りこぼしは検出できない。",
  ],
};
