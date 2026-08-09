import type { BasisContradictionCriteria, EntityNameFragmentRuleId } from "../types.js";

// audit_basis_contradictions の判定区分カタログ。自作のパラフレーズであり、原典の逐語転載はしない。
export const basisContradictionCriteria: BasisContradictionCriteria = {
  name: "テストベース仕様矛盾監査 判定区分カタログ",
  summary:
    "テストベース文書群から自前抽出したID・画面要素・遷移・数量パラメータ・改訂宣言を突き合わせ、" +
    "同一対象について複数箇所・複数文書が異なることを言っている差分候補を決定的に列挙するための判定区分。" +
    "矛盾か否かの最終判断は意味的層へ委ね、本カタログは候補・確信度・対処指針の提示までを担う。",
  categories: [
    {
      id: "BC-01",
      nameJa: "同一IDの名称不一致",
      severity: "high",
      definition: "同一IDから抽出した名称が2種以上あり、複数箇所・複数文書で異なる名称が使われている。",
      recommendedAction: "どちらが正式名称かを本文の文脈・依頼元回答で確認し、誤記であれば表記を統一すること。",
    },
    {
      id: "BC-02",
      nameJa: "構成要素ラベルの表記不一致",
      severity: "high",
      definition:
        "同一IDのUI構成要素ラベルが文書間で片方にしか存在せず、かつ相手側に接頭辞関係にある類似ラベルが存在する。",
      recommendedAction: "同一要素の表記ゆれか、別要素かを本文・画面図で確認し、表記を統一するか別要素として扱うこと。",
    },
    {
      id: "BC-03",
      nameJa: "構成要素の片側欠落",
      severity: "medium",
      definition:
        "同一IDの操作要素(ボタン/リンク等)ラベルが、接頭辞関係の候補も見つからないまま片方の文書にしか存在しない。",
      recommendedAction: "対象文書に構成要素の記載漏れがないか確認し、意図的な差であれば理由を記録すること。",
    },
    {
      id: "BC-04",
      nameJa: "同一トリガの遷移先不一致",
      severity: "high",
      definition: "同一の起点ID・トリガーラベルの組に対して、遷移先が2種以上宣言されている。",
      recommendedAction: "正しい遷移先を画面遷移図・依頼元回答で確認し、誤記の側を修正すること。",
    },
    {
      id: "BC-05",
      nameJa: "未定義の遷移先・表示先",
      severity: "medium",
      definition:
        "ID併記のない遷移先名が、宣言・実体いずれの名称カタログにも部分一致しない。ID併記済みの遷移先は別検査(未解決参照)の対象であり、本区分には含めない。",
      recommendedAction: "遷移先がどのIDの画面/ダイアログを指すかを特定し、名称またはIDを補記すること。",
    },
    {
      id: "BC-06",
      nameJa: "振る舞い未記述の操作要素",
      severity: "medium",
      definition:
        "操作要素として宣言されたラベルが、全文書を通じて振る舞い文(押下・選択・遷移・表示等)に1件も現れない。画面部品表の説明列は振る舞い文の母集団から除外して判定する。",
      recommendedAction: "当該操作要素の挙動が別文書に記載されていないか確認し、無ければ記載漏れとして追記すること。",
    },
    {
      id: "BC-07",
      nameJa: "一覧宣言と本文実体の主題不一致",
      severity: "high",
      definition:
        "本文セクションの主題語が対象IDの宣言名のどのトークンとも一致せず、かつ主題語が別IDの宣言名のトークンと一致する。両条件を満たす場合のみ候補とする。",
      recommendedAction: "本文セクションが正しいIDに対応付けられているかを確認し、誤配置であれば見出し・ID表記を修正すること。",
    },
    {
      id: "BC-08",
      nameJa: "同一パラメータの値不一致",
      severity: "medium",
      definition: "同一のパラメータ名・単位の組に対して、値が2種以上宣言されている。",
      recommendedAction: "正しい値を仕様の最新版・依頼元回答で確認し、古い値が残っている箇所を修正すること。",
    },
    {
      id: "BC-09",
      nameJa: "改訂宣言の旧値が本文に残存",
      severity: "high",
      definition: "改版履歴で宣言された値変更(旧値→新値)の旧値が、改版履歴行以外の本文に残存している。",
      recommendedAction: "残存箇所を新値に更新するか、別対象への言及であれば区別できるよう記載を見直すこと。",
    },
    {
      id: "BC-10",
      nameJa: "少数派の遷移先(参考)",
      severity: "info",
      definition:
        "同一トリガーラベルの遷移先分布で、総数3件以上かつ当該遷移先の比率が20%未満。矛盾ではなく不揃いの可能性提示にとどまる。",
      recommendedAction: "少数派の遷移先が正当な分岐か誤記かを確認すること。矛盾と断定しないこと。",
    },
  ],
  notes: [
    "決定的層は差分候補の列挙までであり、矛盾の断定・正誤の決定は行わない。差分の正誤は本文の意図・図表・依頼元回答で判断すること。",
    "候補件数を仕様欠陥件数として扱ってはならない。候補は確認対象の提示であり、欠陥の確定ではない。",
    "図・画像中の記述、記載そのものが存在しない欠落(導線・タイミング・上限値の未記載)、記述はあるが業務的に不適切な操作の許可は、本検査の対象外である。",
    "候補0件は矛盾が無いことを意味しない。決定的層のパターンに一致しない矛盾は検出できないため、意味的層での確認を省略しないこと。",
  ],
};

// --- 名称抽出の抽出品質フィルタ（NF-01〜NF-04） ---
// 以下は表セル連結由来の断片を候補母集団から外すための抽出品質基準であり、
// 矛盾の判定区分(BC-nn)ではない。basisContradictionCriteria(リソースJSONの直列化対象)には含めない。

/** これ未満の文字数の名称候補は表セル断片として除外する(NF-01)。 */
export const ENTITY_NAME_MIN_LENGTH = 3;

/** 閉じ記号・読点・句点で始まる名称候補を除外する(NF-02)。normalizeText は NFKC 正規化済みである点を踏まえた集合。 */
export const ENTITY_NAME_LEADING_REJECT_CHARS = new Set([
  ")",
  "]",
  "}",
  "）",
  "］",
  "｝",
  "】",
  "〕",
  "》",
  "」",
  "』",
  "、",
  "。",
  "，",
  "．",
]);

/** 助詞または読点で終わる名称候補を除外する(NF-03)。 */
export const ENTITY_NAME_TRAILING_REJECT_CHARS = new Set([
  "の",
  "を",
  "に",
  "は",
  "が",
  "で",
  "と",
  "や",
  "へ",
  "、",
  "，",
  "．",
]);

/** 波ダッシュ・チルダのみで構成される名称候補を除外する(NF-04)。U+007E / U+FF5E / U+301C / U+223C。 */
export const ENTITY_NAME_SYMBOL_ONLY_PATTERN = /^[~～〜∼]+$/;

export const ENTITY_NAME_FRAGMENT_RULES: {
  id: EntityNameFragmentRuleId;
  nameJa: string;
  definition: string;
}[] = [
  {
    id: "NF-01",
    nameJa: "短すぎる名称候補",
    definition: `名称候補の文字数が ${ENTITY_NAME_MIN_LENGTH} 文字未満(2文字以下)であり、表セル連結由来の断片である可能性が高い。`,
  },
  {
    id: "NF-02",
    nameJa: "閉じ記号・読点・句点で始まる断片",
    definition: "名称候補が閉じ括弧・鉤括弧閉じ・読点・句点で始まっており、直前セルの続きの断片である可能性が高い。",
  },
  {
    id: "NF-03",
    nameJa: "助詞または読点で終わる断片",
    definition: "名称候補が助詞(の/を/に/は/が/で/と/や/へ)または読点で終わっており、文の途中で切れた断片である可能性が高い。",
  },
  {
    id: "NF-04",
    nameJa: "波ダッシュ・チルダのみ",
    definition: "名称候補が波ダッシュ・チルダのみで構成されており、範囲区切り記号の断片である可能性が高い。",
  },
];
