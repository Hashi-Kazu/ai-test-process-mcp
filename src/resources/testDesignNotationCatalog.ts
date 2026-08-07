import type { TestDesignNotationCatalog } from "../types.js";

// テスト設計記法カタログ（FV表 / NGT / ゆもつよマトリクス）と、audit_test_design_notations の判定区分カタログ。
// ASTER テスト設計コンテストOPENクラスの参加要項が成果物2の例として並列に挙げている3記法を、
// 「リスト／ダイアグラム／マトリクス」という構造の違いで整理したもの。
// 記法の説明文・必須要素・判定区分はすべて自作の日本語文であり、出典資料本文の逐語転載ではない
// （出典は所在を示すURLのみを記載する）。
export const testDesignNotationCatalog: TestDesignNotationCatalog = {
  name: "テスト設計記法カタログ（FV表 / NGT / ゆもつよマトリクス）",
  note:
    "参加要項が例として挙げている3記法について、実務で使われている考え方を参考に独自へ整理したものであり、出典資料の逐語転載や特定の外部基準への適合を主張するものではない。",
  summary:
    "テスト設計の中間成果物としてよく使われる3つの記法を、リスト（FV表）・ダイアグラム（NGT）・マトリクス（ゆもつよマトリクス）という構造の違いで並べ、" +
    "各記法が何を表現し、どの要素が欠けると何を主張できなくなるかを定義する。宣言（記法上のラベル・網羅率宣言・記法間の対応宣言）と" +
    "実体（行・ノード・セル・テスト条件ID母集団）を双方向に照合するための判定区分 TDN-01〜TDN-25 を併せて持つ。",
  notations: [
    {
      id: "NTN-FV",
      nameJa: "FV表",
      structureKind: "list",
      expresses:
        "テスト対象の機能（Function）と、その機能について何を確かめるのか（Verification）を1行1組で並べ、機能と検証内容の対応をリストとして見せる記法。",
      suitableWhen:
        "機能IDの母集団が確定しており、機能単位で「何を確かめるか」に抜けがないかを1件ずつ突き合わせて点検したいとき。",
      caution:
        "行を機能から起こすため、機能をまたいで初めて成立する観点や非機能の観点が行として立たず、機能一覧の写しに退化しやすい。検証内容が「正常に動作すること」のような定型語で埋まると、行数だけが増えて中身が無い状態になる。",
      elements: [
        {
          id: "FV-EL-01",
          nameJa: "機能",
          required: true,
          definition: "その行が対象とするテスト対象の機能。機能IDの母集団を持つ場合は母集団のIDと対応づける。",
          emptyMeaning: "何についての検証なのかが特定できず、機能母集団に対する被覆を数えられなくなる。",
        },
        {
          id: "FV-EL-02",
          nameJa: "検証内容",
          required: true,
          definition: "その機能について何を確かめるのかを、確認できる形で述べた一文。",
          emptyMeaning: "行が機能名の列挙にとどまり、テスト設計として何を確かめるのかを主張できなくなる。",
        },
        {
          id: "FV-EL-03",
          nameJa: "由来",
          required: true,
          definition: "その検証内容の根拠となるテストベース上の要件ID・章節など、どこから来た行なのかを示す参照。",
          emptyMeaning: "テストベースに戻って妥当性を確認できず、書き手の思いつきと区別できなくなる。",
        },
        {
          id: "FV-EL-04",
          nameJa: "対応するテスト条件ID",
          required: true,
          definition: "その行の検証内容が、下流のどのテスト条件へ落ちたのかを示すID。",
          emptyMeaning: "表がテスト条件へ接続せず、以降の設計成果物との対応を追跡できなくなる。",
        },
      ],
      relatedToolNames: ["extract_test_conditions"],
      relatedResourceUris: ["testbasis://id-patterns", "testcondition://perspectives/catalog"],
      sourceNote:
        "ASTER テスト設計コンテストOPENクラス参加要項が、成果物2（テスト設計に関わる成果物一式）の「リスト」の例として http://jasst.jp/archives/jasst09e/pdf/A7-2.pdf P4 を挙げている。本カタログの記述は当該資料の逐語転載ではない。",
      auditCategoryIds: [
        "TDN-01",
        "TDN-02",
        "TDN-03",
        "TDN-04",
        "TDN-05",
        "TDN-06",
        "TDN-07",
        "TDN-23",
        "TDN-25",
      ],
    },
    {
      id: "NTN-NGT",
      nameJa: "NGT",
      structureKind: "diagram",
      expresses:
        "テスト観点をノードとして置き、上位の観点から下位の観点へ親子関係で分解していく階層をダイアグラムとして見せる記法。葉のノードが実際に確かめる単位になる。",
      suitableWhen:
        "テスト観点の全体像と、どの観点をどこまで分解したのかという粒度の揃い方を、一枚で俯瞰して点検したいとき。",
      caution:
        "階層を描くこと自体は容易なため、葉がテスト条件へ落ちていない枝や、子を1つしか持たない見かけだけの分解が残りやすい。分解の深さが枝ごとに大きく違うと、浅い枝の観点が実質未分析のまま見過ごされる。",
      elements: [
        {
          id: "NGT-EL-01",
          nameJa: "ノードラベル",
          required: true,
          definition: "そのノードが表すテスト観点を、何を気にしているのかが読み取れる語で述べたもの。",
          emptyMeaning: "階層の形だけが残り、各段が何を分解したものなのかを説明できなくなる。",
        },
        {
          id: "NGT-EL-02",
          nameJa: "親子関係",
          required: true,
          definition: "上位観点をどの下位観点へ分解したのかを示す親子の接続。ルートは1件に収める。",
          emptyMeaning: "ノードの集合が観点の並びにとどまり、分解の筋道を主張できなくなる。",
        },
        {
          id: "NGT-EL-03",
          nameJa: "葉ノードのテスト条件への接続",
          required: true,
          definition: "葉のノードが、どのテスト条件として実施されるのかを示すID。",
          emptyMeaning: "観点が図の中で完結し、実施されないまま網羅したように見える状態になる。",
        },
        {
          id: "NGT-EL-04",
          nameJa: "観点カテゴリID",
          required: false,
          definition:
            "そのノードがテスト観点カタログのどのカテゴリ・観点に対応するかを示すID（TPC-xx / TPC-xx-xx）。",
          emptyMeaning: "既知の観点カテゴリのうち、どのカテゴリを検討していないのかを機械的に照合できなくなる。",
        },
      ],
      relatedToolNames: ["design_test_architecture", "extract_test_conditions"],
      relatedResourceUris: [
        "testcondition://perspectives/catalog",
        "testarch://container/design-principles",
      ],
      sourceNote:
        "ASTER テスト設計コンテストOPENクラス参加要項が、成果物2の「ダイアグラム」の例として http://jasst.jp/archives/jasst09e/pdf/A7-6.pdf P4 を挙げている。本カタログの記述は当該資料の逐語転載ではない。",
      auditCategoryIds: [
        "TDN-08",
        "TDN-09",
        "TDN-10",
        "TDN-11",
        "TDN-12",
        "TDN-13",
        "TDN-14",
        "TDN-15",
        "TDN-16",
        "TDN-23",
        "TDN-24",
        "TDN-25",
      ],
    },
    {
      id: "NTN-YMX",
      nameJa: "ゆもつよマトリクス",
      structureKind: "matrix",
      expresses:
        "テスト観点・機能分類を行に、テストタイプを列に置いた表を作り、その交点で何を実施するのかをセルに書き込むことで、観点とタイプの掛け合わせの抜けを見せる記法。",
      suitableWhen:
        "どの観点をどのテストタイプで確かめるのかという割り付けを一望し、実施しない交点を意図的な判断として記録に残したいとき。",
      caution:
        "行と列を用意した時点で表は完成して見えるが、埋まっていないセルが「実施しない判断」なのか「検討漏れ」なのかは表からは区別できない。除外の理由を書かない限り、充填率は根拠のない数値になる。",
      elements: [
        {
          id: "YMX-EL-01",
          nameJa: "行（テスト観点・機能分類）",
          required: true,
          definition: "表の行として並べる観点または機能の分類。NGTの葉ノードと対応づけると階層との整合を照合できる。",
          emptyMeaning: "何を軸に割り付けたのかが定まらず、行方向の抜けを数えられなくなる。",
        },
        {
          id: "YMX-EL-02",
          nameJa: "列（テストタイプ）",
          required: true,
          definition: "表の列として並べるテストタイプ。各観点をどの側面から確かめるのかを表す。",
          emptyMeaning: "観点をどの側面で確かめるのかが分からず、列方向の抜けを数えられなくなる。",
        },
        {
          id: "YMX-EL-03",
          nameJa: "セル（そこで実施するテスト条件）",
          required: true,
          definition: "行と列の交点で実施するテスト条件のID。埋まっているセルが実施の宣言になる。",
          emptyMeaning: "交点に印だけが付き、実際に何を実施するのかが下流の成果物へ接続しなくなる。",
        },
        {
          id: "YMX-EL-04",
          nameJa: "除外セルの理由",
          required: true,
          definition: "意図的に実施しない交点について、なぜ実施しなくてよいのかを述べた理由。",
          emptyMeaning: "空セルが判断の結果なのか検討漏れなのか区別できず、充填率の分母を確定できなくなる。",
        },
      ],
      relatedToolNames: ["audit_cross_matrix"],
      relatedResourceUris: [
        "testdesign://cross-matrix/audit-criteria",
        "testcondition://perspectives/catalog",
      ],
      sourceNote:
        "ASTER テスト設計コンテストOPENクラス参加要項が、成果物2の「マトリクス」の例として http://jasst.jp/archives/jasst09e/pdf/A7-8.pdf P12 を挙げている。本カタログの記述は当該資料の逐語転載ではない。",
      auditCategoryIds: [
        "TDN-17",
        "TDN-18",
        "TDN-19",
        "TDN-20",
        "TDN-21",
        "TDN-22",
        "TDN-24",
        "TDN-25",
      ],
    },
  ],
  auditCategories: [
    {
      id: "TDN-01",
      nameJa: "FV表の行IDの重複・欠番・接頭辞不一致",
      appliesTo: ["fv-table"],
      severity: "high",
      definition:
        "FV表の行IDが重複している、連番に欠番がある、または idPrefix（既定 FV-）+ 連番の形式になっていない。",
      recommendedAction:
        "行IDを接頭辞＋連番で一意に振り直すこと。欠番が削除の跡であれば、削除した行が別記法から参照されたままになっていないかを併せて確認すること。",
    },
    {
      id: "TDN-02",
      nameJa: "機能名または検証内容の未記入",
      appliesTo: ["fv-table"],
      severity: "high",
      definition: "FV表の行の functionName または verification が空文字または空白のみである。",
      recommendedAction:
        "対象の機能と、その機能について何を確かめるのかを記入すること。記入できない行はテスト設計として成立していないため削除すること。",
    },
    {
      id: "TDN-03",
      nameJa: "検証内容が実質未記入",
      appliesTo: ["fv-table"],
      severity: "medium",
      definition:
        "verification が正規化後8文字未満である、または「正常に動作すること」「問題ないこと」のような定型語だけで構成されており、何を確かめるのかを特定できない。",
      recommendedAction:
        "確認する対象・条件・期待する結果が読み取れる形へ書き換えること。定型語のままでは下流でテスト条件へ落とせない。",
    },
    {
      id: "TDN-04",
      nameJa: "検証内容ゼロの機能",
      appliesTo: ["fv-table"],
      severity: "high",
      definition:
        "expectedFunctionIds に宣言された機能IDのうち、検証内容を持つ行がFV表に1件も存在しないものがある。",
      recommendedAction:
        "当該機能に対する検証内容を追加すること。テスト対象外であれば、その旨をテスト計画のスコープ外として明記し母集団から外すこと。",
    },
    {
      id: "TDN-05",
      nameJa: "母集団外の機能IDを参照する行",
      appliesTo: ["fv-table"],
      severity: "high",
      definition:
        "FV表の行の functionId が expectedFunctionIds のどれにも一致しない。母集団に無い機能を対象にしているか、IDの綴りが違う。",
      recommendedAction:
        "機能IDの綴りを母集団に合わせるか、母集団の宣言が古いのであれば expectedFunctionIds を更新して再監査すること。",
    },
    {
      id: "TDN-06",
      nameJa: "テストベース本文に裏付けの無い検証内容",
      appliesTo: ["fv-table"],
      severity: "medium",
      definition:
        "documents を指定したにもかかわらず、行の evidence（未指定時は verification）が本文のどこにも出現しない。照合は表記差を吸収した正規化後の包含判定で行う。",
      recommendedAction:
        "根拠となる本文の一文を evidence へ引用すること。本文に無い検証内容であれば、なぜその検証が必要なのかの導出をテストベース側へ戻して確認すること。",
    },
    {
      id: "TDN-07",
      nameJa: "宣言した機能被覆率と実測値の不一致",
      appliesTo: ["fv-table"],
      severity: "high",
      definition:
        "claimedFunctionCoveragePercent が実測（検証内容を1件以上持つ機能ID数 ÷ expectedFunctionIds 件数）と一致しない。expectedFunctionIds が未宣言のまま宣言値だけがある場合は、実測を算出できないため裏付け不能として扱う。",
      recommendedAction:
        "成果物に記載した被覆率を実測値へ修正するか、機能ID母集団を expectedFunctionIds として宣言し直して再監査すること。母集団を示せない被覆率は成果物へ載せないこと。",
    },
    {
      id: "TDN-08",
      nameJa: "NGTノードIDの重複・未宣言の親参照・接頭辞不一致",
      appliesTo: ["ngt"],
      severity: "high",
      definition:
        "NGTのノードIDが重複している、parentId がどのノードIDにも一致しない、または idPrefix（既定 NG-）+ 連番の形式になっていない。",
      recommendedAction:
        "ノードIDを接頭辞＋連番で一意に振り直し、親参照の綴りを宣言済みノードへ合わせること。",
    },
    {
      id: "TDN-09",
      nameJa: "親子関係の循環",
      appliesTo: ["ngt"],
      severity: "high",
      definition: "parentId をたどると元のノードへ戻る循環があり、階層として成立していない。",
      recommendedAction:
        "循環に含まれるノードのうち、どれが上位観点なのかを決めて親参照を1本に直すこと。相互に関係するだけの対であれば relations として宣言すること。",
    },
    {
      id: "TDN-10",
      nameJa: "ルートノードが0件または2件以上",
      appliesTo: ["ngt"],
      severity: "medium",
      definition:
        "parentId を持たないノードが存在しない（全体が循環している）、または2件以上あり、観点の全体像が1つの図として閉じていない。",
      recommendedAction:
        "最上位のテスト観点を1つ立て、他のルート候補をその配下へ接続すること。分割して描く意図があるなら、分割単位ごとに別の入力として監査すること。",
    },
    {
      id: "TDN-11",
      nameJa: "テスト条件へ落ちない葉ノード",
      appliesTo: ["ngt"],
      severity: "high",
      definition:
        "子を持たない葉ノードが、testConditionIds にもFV表の行（ngtNodeId 経由）にも紐づいていない。図の上では観点が存在するが実施されない。",
      recommendedAction:
        "当該葉に対応するテスト条件を抽出して紐づけること。実施しない観点であれば、実施しない判断であることを図の外に明記し葉から外すこと。",
    },
    {
      id: "TDN-12",
      nameJa: "縮退枝・粒度不揃いの分解",
      appliesTo: ["ngt"],
      severity: "medium",
      definition:
        "子を1つしか持たない中間ノードがあり分解になっていない、または同一の親の直下に葉と枝が混在しており分解の粒度が揃っていない。",
      recommendedAction:
        "子が1つの中間ノードは親へ畳むか、分解の観点を見直して2つ以上の子へ分けること。葉と枝の混在は、葉側をもう一段分解するか枝側を畳んで粒度を揃えること。",
    },
    {
      id: "TDN-13",
      nameJa: "葉の深さの偏り",
      appliesTo: ["ngt"],
      severity: "medium",
      definition:
        "ルートから葉までの深さの最大値と最小値の差が2以上あり、枝によって分解の掘り下げ方が大きく違う。",
      recommendedAction:
        "浅い枝が本当にそれ以上分解できないのかを確認すること。分解の検討が止まっているだけであれば、深い枝と同じ観点で掘り下げること。",
    },
    {
      id: "TDN-14",
      nameJa: "relations の不正な参照",
      appliesTo: ["ngt"],
      severity: "medium",
      definition:
        "relations の fromId / toId が未宣言のノードIDを指している、自己参照になっている、または既に親子関係にある対を関連として重複表現している。",
      recommendedAction:
        "参照先の綴りを宣言済みノードへ合わせ、自己参照を削除すること。親子で表現済みの関係は relations から外し、階層では表せない横断的な関係だけを残すこと。",
    },
    {
      id: "TDN-15",
      nameJa: "観点カテゴリIDの不一致・未検討カテゴリ",
      appliesTo: ["ngt"],
      severity: "medium",
      definition:
        "ノードの perspectiveCategoryId がテスト観点カタログに存在しないIDである、またはカタログのカテゴリのうちどのノードからも参照されていないものがある（双方向）。",
      recommendedAction:
        "IDの綴りをカタログ（testcondition://perspectives/catalog）へ合わせること。未参照のカテゴリについては、検討した上で対象外としたのか検討していないのかを判断し、対象外であればその判断を記録すること。",
    },
    {
      id: "TDN-16",
      nameJa: "宣言した葉ノード数と実測値の不一致",
      appliesTo: ["ngt"],
      severity: "high",
      definition: "claimedLeafCount が実際の葉ノード数と一致しない。",
      recommendedAction:
        "成果物に記載した観点数を実測値へ修正するか、図に載せたつもりのノードが入力から漏れていないかを確認して再監査すること。",
    },
    {
      id: "TDN-17",
      nameJa: "行ID・列IDの重複／未宣言の行列参照",
      appliesTo: ["yumotsuyo-matrix"],
      severity: "high",
      definition:
        "マトリクスの行IDまたは列IDが重複している、または cells / exclusions が宣言されていない行ID・列IDを参照している。",
      recommendedAction:
        "行ID・列IDをそれぞれ一意にし、セル・除外宣言の参照先を宣言済みの行・列へ合わせること。",
    },
    {
      id: "TDN-18",
      nameJa: "除外宣言のない空セル",
      appliesTo: ["yumotsuyo-matrix"],
      severity: "high",
      definition:
        "行と列の交点にテスト条件が1件も無く、かつ除外宣言も無い。実施しない判断なのか検討漏れなのかを表から区別できない。",
      recommendedAction:
        "当該交点で実施するテスト条件を書き込むか、実施しないのであれば exclusions に理由を添えて宣言し再監査すること。",
    },
    {
      id: "TDN-19",
      nameJa: "空行・空列",
      appliesTo: ["yumotsuyo-matrix"],
      severity: "high",
      definition:
        "どの列とも交点が埋まっていない行、またはどの行とも交点が埋まっていない列がある（全セルが除外宣言済みの行・列は除く）。行または列として立てた意味が無い状態である。",
      recommendedAction:
        "当該行・列で実施することを書き込むこと。全く実施しないのであれば行・列そのものを外すか、全セルを理由付きで除外宣言すること。",
    },
    {
      id: "TDN-20",
      nameJa: "除外理由の未記入",
      appliesTo: ["yumotsuyo-matrix"],
      severity: "medium",
      definition: "exclusions の reason が未指定または空文字であり、その交点を実施しない根拠が記録されていない。",
      recommendedAction:
        "なぜその観点をそのテストタイプで確かめなくてよいのかを reason に明記すること。理由を書けない除外は検討漏れと区別できない。",
    },
    {
      id: "TDN-21",
      nameJa: "セルのテスト条件IDと母集団の不一致",
      appliesTo: ["yumotsuyo-matrix"],
      severity: "high",
      definition:
        "セルの testConditionIds に入力 testConditionIds 母集団に存在しないIDがある、または母集団のIDのうちどのセルにも現れないものがある（双方向）。",
      recommendedAction:
        "IDの綴りを母集団へ合わせること。母集団にあるのにどのセルにも現れない条件は、どの観点・どのテストタイプで実施するのかを決めて表へ載せること。",
    },
    {
      id: "TDN-22",
      nameJa: "宣言した充填率と実測値の不一致",
      appliesTo: ["yumotsuyo-matrix"],
      severity: "high",
      definition:
        "claimedFillRatePercent が実測（充填セル数 ÷（行数 × 列数 − 除外セル数））と一致しない。セル数が maxCellCount を超える場合は直積を展開せず、算出しなかった旨を info として報告する。",
      recommendedAction:
        "成果物に記載した充填率を実測値へ修正すること。分母は除外セルを引いた値であり、除外宣言を増やせば充填率は上がるため、除外理由と併せて提示すること。",
    },
    {
      id: "TDN-23",
      nameJa: "FV表とNGTの対応の欠落",
      appliesTo: ["cross-notation"],
      severity: "high",
      definition:
        "FV表の行の ngtNodeId がNGTのどのノードにも存在しない、またはNGTの葉ノードのうちどのFV表の行からも参照されていないものがある（双方向）。",
      recommendedAction:
        "参照先の綴りを合わせること。どのFV行にも現れない葉は、機能に落とせていない観点であるため、対応する検証内容をFV表へ追加すること。",
    },
    {
      id: "TDN-24",
      nameJa: "ゆもつよマトリクスとNGTの対応の欠落",
      appliesTo: ["cross-notation"],
      severity: "high",
      definition:
        "マトリクスの行・列の ngtNodeId がNGTのどのノードにも存在しない、またはNGTの葉ノードのうちどの行・列にも現れないものがある（双方向）。",
      recommendedAction:
        "参照先の綴りを合わせること。どの行・列にも現れない葉は、どのテストタイプで確かめるのかが未決であるため、行または列として表へ載せること。",
    },
    {
      id: "TDN-25",
      nameJa: "記法が参照するテスト条件IDと母集団の差分",
      appliesTo: ["cross-notation"],
      severity: "medium",
      definition:
        "3記法のいずれかが参照するテスト条件IDが入力 testConditionIds 母集団に存在しない、または母集団のIDのうちどの記法からも参照されていないものがある（双方向）。",
      recommendedAction:
        "どの記法からも参照されない条件は、いずれかの記法へ位置づけるか母集団から外すこと。母集団に無いIDは綴りを合わせるか母集団の宣言を更新すること。",
    },
  ],
  notes: [
    "3記法は参加要項が成果物2の例として並列に挙げているものであり、どれか1つを選ぶことも複数を併用することもできる。本カタログは優劣を定めない。",
    "本検査は渡された記法データに対してのみ成立する。図として描いただけで入力へ起こしていない要素の取りこぼしは検出できない。",
    "網羅率・充填率（TDN-07 / TDN-16 / TDN-22）は分母を必ず併記する。母集団が未宣言のときは実測を算出せず、宣言値があれば裏付け不能として扱う。",
    "記法間の照合（TDN-23 / TDN-24 / TDN-25）は、双方の記法を同時に投入したときのみ成立する。片方のみの投入では対応の欠落を検出できない。",
    "本文との照合は全角半角・空白・記号差を吸収した正規化後の包含判定であり、正規化により記号が落ちるため短い文字列は偶発一致し得る。",
    "決定的層は候補の列挙までを行う。空セル・浅い枝・未参照の観点カテゴリが本当に不足なのか意図した判断なのかは、意味的層で判断すること。",
  ],
};
