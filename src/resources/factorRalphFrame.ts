import type { FactorRalphFrame } from "../types.js";

// 組合せ技法（design_boundary_values / design_equivalence_partitioning /
// design_decision_table / 将来の design_pairwise）の入力である「因子と水準」の
// 洗い出しを支援するために独自に整理したフレーム。4分類・問い・水準の割り当て方・
// 引き渡し規約はすべて自作のパラフレーズであり、外部文献の逐語転載ではなく、
// 特定の外部基準・手法への適合を主張するものでもない。実際の因子・水準は、
// 対象プロジェクトの一次情報で必ず裏取りすること。
export const factorRalphFrame: FactorRalphFrame = {
  name: "因子分解フレーム（自作整理）",
  note:
    "組合せ技法の入力となる因子と水準の洗い出しを助けるために独自に整理したものであり、" +
    "外部文献の逐語転載ではなく、特定の外部基準・手法への適合を主張するものでもない。" +
    "実際の因子・水準は、対象プロジェクトの一次情報（仕様・設定値・運用実態）で必ず裏取りすること。",
  procedure: [
    {
      id: "FDS-01",
      nameJa: "対象の目的機能を固定する",
      description:
        "testcondition://risk/frame で優先度が高いと判定されたリスクに紐づく目的機能を先に選び、因子分解の対象を1つに絞る。",
    },
    {
      id: "FDS-02",
      nameJa: "信号因子を挙げる",
      description: "その目的機能を達成させるために外から与える入力を列挙する。",
    },
    {
      id: "FDS-03",
      nameJa: "制御因子を挙げる",
      description: "提供側が設定値として決めている値を列挙する。",
    },
    {
      id: "FDS-04",
      nameJa: "状態因子を挙げる",
      description: "操作を始める時点で対象・関連データが置かれている状態を列挙する。",
    },
    {
      id: "FDS-05",
      nameJa: "誤差因子を挙げる",
      description: "制御できないが結果をぶらす外乱を列挙する。",
    },
    {
      id: "FDS-06",
      nameJa: "水準を割り当てて総組合せ数を数える",
      description:
        "各因子に水準ヒューリスティック（FLH-xx）を適用し、水準が1件しか出ない因子は因子表から外して「固定条件」として別記する。" +
        "総組合せ数が扱える上限を超える場合は誤差因子の水準を代表値に絞り、絞った理由を残す。",
    },
  ],
  categories: [
    {
      id: "FC-01",
      key: "signal",
      nameJa: "信号因子",
      definition:
        "目的機能を達成させるために利用者・上位システムが能動的に与える入力値および操作。値域や選択肢を持ち、テスト側が自由に指定できる。",
      roleInDesign:
        "水準を必ず振る対象。数値範囲を持つものは境界値、選択肢型のものは同値クラスへ落とす。",
      probeQuestions: [
        "利用者はこの機能を使うとき、どの値を自分で決めて入力するか。",
        "入力の形式が複数ある場合、どの経路から入るか。",
        "同じ目的を別の入力手段で達成できないか。",
      ],
      levelGuidance:
        "範囲型は上下限を持つならFLH-01、選択肢型はFLH-02、有無を問うものはFLH-03、件数を問うものはFLH-04を適用する。",
      levelHeuristicIds: ["FLH-01", "FLH-02", "FLH-03", "FLH-04"],
      badExamples: [
        "因子として『入場制限人数』1件だけを挙げて終わりにする（他の入力経路・操作種別を挙げていない）。",
        "水準を書かず因子名だけを列挙する。",
      ],
      handoverConventionIds: ["FHO-01", "FHO-02"],
    },
    {
      id: "FC-02",
      key: "noise",
      nameJa: "誤差因子",
      definition:
        "テスト側・提供側のどちらも意図して制御できないが、結果をぶらす外的条件。同時実行、通信品質、端末・回線、実行時刻、データ量、操作の中断など。",
      roleInDesign:
        "全水準を掛けると爆発するため、通常・劣化・断絶のような代表水準に絞り、絞った根拠を残す対象。",
      probeQuestions: [
        "同じ瞬間に他の誰かが同じ操作をしていないか。",
        "通信・機器・時刻のどれが揺れると結果が変わるか。",
        "操作が途中で中断された場合に何が残るか。",
      ],
      levelGuidance:
        "劣化型（FLH-06）を基本とし、時刻・タイミングに関わるものはFLH-05も併用する。代表水準に絞った理由を必ず残す。",
      levelHeuristicIds: ["FLH-05", "FLH-06"],
      badExamples: [
        "誤差因子を『環境』の1語で済ませる。",
        "制御できる設定値を誤差因子に混ぜる。",
      ],
      handoverConventionIds: ["FHO-04"],
    },
    {
      id: "FC-03",
      key: "state",
      nameJa: "状態因子",
      definition:
        "操作開始時点で対象データ・対象機器・利用者が置かれている状態。残数・残高・予約有無・権限・セッションの有無・締め前後・初回か再訪か。",
      roleInDesign:
        "相互排他な状態の列挙として水準化し、条件項目としてデシジョンテーブルへ渡す対象。ありえない状態の組合せを必ず明示する。",
      probeQuestions: [
        "操作を始める前に、対象データはどの状態を取り得るか。",
        "同時に成立しない状態の組合せはどれか。",
        "前回の操作の残りが次回に影響しないか。",
      ],
      levelGuidance:
        "有無を問うものはFLH-03、件数・残数を問うものはFLH-04、区分が3つ以上あるものはFLH-02を適用する。",
      levelHeuristicIds: ["FLH-02", "FLH-03", "FLH-04"],
      badExamples: [
        "状態を『正常／異常』の2値でまとめてしまう。",
        "同時に成立しない状態の組合せを除外せずに全組合せを数える。",
      ],
      handoverConventionIds: ["FHO-02", "FHO-03"],
    },
    {
      id: "FC-04",
      key: "control",
      nameJa: "制御因子",
      definition:
        "提供側が設定・運用で決めている値。上限人数、料金、保持期間、機能の有効無効、運用モード。",
      roleInDesign:
        "現行設定を既定水準とし、設定変更後の候補値を追加水準とする対象。閾値パラメータとして変更再展開の対象にもなる。",
      probeQuestions: [
        "この値は誰がいつ変更するのか。",
        "変更されたとき、影響する画面・帳票・判定はどこか。",
        "現行値以外に運用上あり得る値はどれか。",
      ],
      levelGuidance:
        "範囲型で閾値を持つものはFLH-01、有効無効の切り替えはFLH-03、運用モードのように区分があるものはFLH-02を適用する。",
      levelHeuristicIds: ["FLH-01", "FLH-02", "FLH-03"],
      badExamples: [
        "設定値を信号因子として利用者入力に混ぜる。",
        "現行値だけを水準とし、変更後の候補を挙げない。",
      ],
      handoverConventionIds: ["FHO-01", "FHO-03", "FHO-04"],
    },
  ],
  levelHeuristics: [
    {
      id: "FLH-01",
      nameJa: "範囲型",
      appliesTo: "下限・上限を持つ数値因子",
      levelPattern: ["下限-1", "下限", "上限", "上限+1"],
      note: "中間値の代表を1件足すかは3値か2値かで決める。実際の列挙は design_boundary_values に任せる。",
    },
    {
      id: "FLH-02",
      nameJa: "列挙型",
      appliesTo: "相互排他な区分に分ける因子",
      levelPattern: ["区分A", "区分B", "区分C"],
      note: "「その他」を水準として残さず、必ず具体的な区分に開く。",
    },
    {
      id: "FLH-03",
      nameJa: "有無型",
      appliesTo: "ある／ないを問う因子",
      levelPattern: ["有", "無"],
      note: "有の側にさらに種類があるなら列挙型へ格上げする。",
    },
    {
      id: "FLH-04",
      nameJa: "数量型",
      appliesTo: "件数・残数を問う因子",
      levelPattern: ["0件", "1件", "複数件", "上限件数", "上限超"],
      note: "空・単一・複数を必ず分ける。",
    },
    {
      id: "FLH-05",
      nameJa: "時間型",
      appliesTo: "期限・締切に関わる因子",
      levelPattern: ["期限前", "期限当日（境界）", "期限後", "期限切れ後の再操作"],
      note: "日付境界と時刻境界を別因子に分けるか判断する。",
    },
    {
      id: "FLH-06",
      nameJa: "劣化型",
      appliesTo: "通信・機器・実行環境の外乱を表す因子",
      levelPattern: ["通常", "劣化（遅延・低速）", "断絶（切断・停止）"],
      note: "主に誤差因子に適用し、断絶時の復旧側も水準として持つか判断する。",
    },
  ],
  idConvention: [
    "因子IDは `FCT-01` のように呼び出し側で連番採番し、目的機能ごとに区切る。",
    "水準IDは `FCT-01-L1` のように因子IDへ枝番を付ける。",
    "因子表には必ず「因子ID・分類キー（signal/noise/state/control）・因子名・水準一覧・水準ID・固定条件か否か」を残す。",
    "因子IDと水準IDは、後続ツールの入力へ変換した後も対応表として保持し、extract_test_conditions / generate_test_cases の derivedFrom や rationale から追跡できる状態を保つ。",
  ],
  handoverConventions: [
    {
      id: "FHO-01",
      targetTool: "design_boundary_values",
      status: "available",
      applicableCategoryKeys: ["signal", "control"],
      notation: [
        "範囲型（FLH-01）の因子だけを対象にする。",
        "因子名をそのまま variables[].name に使い、因子IDを名称に併記して対応を切らさない。",
        "有効範囲の下限を min、上限を max に入れる。",
        "整数か小数かを valueType（int / decimal）で明示し、刻みが1・0.1以外なら step を指定する。",
        "境界値そのものを因子表の水準欄に書き写さず、列挙はツールの出力に委ねる。",
        "2値か3値かは mode で宣言する。",
        "因子表全体を factorInventory に、由来因子IDを variables[].sourceFactorId に渡し、引き渡し検査(FHC-xx)を受ける。",
      ],
      traceability:
        "出力された境界値行は、由来因子IDと水準ID（FLH-01の4点に対応）を添えて generate_test_cases の boundaryValues へ渡す。",
    },
    {
      id: "FHO-02",
      targetTool: "design_equivalence_partitioning",
      status: "available",
      applicableCategoryKeys: ["signal", "state"],
      notation: [
        "列挙型（FLH-02）・有無型（FLH-03）・数量型（FLH-04）の因子を対象にする。",
        "因子名を variables[].name、水準名を validClasses[].label、その水準の代表値を representative に置く。",
        "仕様上受理されない水準は invalidClasses 側へ移し、有効水準と混ぜない。",
        "description に水準の判定条件（どの範囲・どの条件でその水準になるか）を書く。",
        "水準が1件しかない因子は渡さず、固定条件として別記する。",
        "因子表全体を factorInventory に、由来因子IDを variables[].sourceFactorId に渡し、引き渡し検査(FHC-xx)を受ける。",
      ],
      traceability:
        "クラスラベルへ水準IDを併記し、generate_test_cases の equivalencePartitions まで因子IDを引き継ぐ。",
    },
    {
      id: "FHO-03",
      targetTool: "design_decision_table",
      status: "available",
      applicableCategoryKeys: ["state", "control"],
      notation: [
        "状態因子・制御因子を条件項目にする。因子1件を conditions[] の1件へ写し、id に条件ID（例 C1）、statement に因子名と判定内容、levels に水準名の配列（2件以上）を置く。",
        "因子IDと条件IDの対応表を必ず出力に残す。",
        "同時に成立しない水準の組合せは invalidCombinations に reason 付きで登録し、除外理由を空にしない。",
        "動作項目（actions）は目的機能の結果側から起こし、因子ではなく期待される振る舞いを書く。",
        "条件項目の総数が多く maxCombinations に触れる場合は、誤差因子を条件項目へ入れずFHO-04側へ回す。",
        "因子表全体を factorInventory に、由来因子IDを conditions[].sourceFactorId に渡し、因子IDと条件IDの対応表を引き渡し検査(FHC-xx)で確認する。",
      ],
      traceability: "圧縮後ルールの DT: 網羅対象IDに、由来因子IDを対応表で紐づける。",
    },
    {
      id: "FHO-04",
      targetTool: "design_pairwise",
      status: "available",
      applicableCategoryKeys: ["noise", "control"],
      notation: [
        "誤差因子・環境系の制御因子を組合せ対象にする。因子1件を factors[] の1件へ写し、id に因子ID（例 F1）、name に因子名、levels に水準名の配列（2件以上）を置く。",
        "同時に成立しない水準の組合せは forbiddenCombinations に reason 付きで登録し、ありえない理由を空にしない。",
        "必ず含めたい既知の重要組合せは seedRows に全因子の水準を指定して渡す。",
        "水準が1件しかない因子は factors に渡さず、固定条件として前提条件へ別記する。",
        "誤差因子は FLH-06 等で代表水準へ絞り、絞り込んだ理由を因子表に残す。",
        "因子表全体を factorInventory に、由来因子IDを factors[].sourceFactorId に渡し、引き渡し検査(FHC-xx)を受ける。",
      ],
      traceability: "生成したペアの PW: 網羅対象IDに、由来因子ID・水準IDを対応表で紐づける。",
    },
  ],
  completenessChecks: [
    "4分類のいずれかが0件になっていないか。0件なら「該当なし」と判断した理由を残しているか。",
    "信号因子が1件だけで終わっていないか（入力経路・操作種別・データ形式の観点で他に無いか）。",
    "水準が1件しかない因子を因子表に残していないか（固定条件として分離したか）。",
    "誤差因子に「同時実行」「通信・機器」「時刻・タイミング」の3系統がそれぞれ検討されているか。",
    "状態因子について、同時に成立しない水準の組合せを列挙し、除外理由を書いたか。",
    "制御因子が閾値パラメータとして reexpand_threshold_changes の対象に登録されているか。",
    "各因子が、FHO-01〜FHO-04 のいずれの引き渡し先に割り当てられたか明示されているか。",
  ],
};
