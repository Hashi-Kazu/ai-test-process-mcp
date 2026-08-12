import type { AmbiguityExclusionRuleCatalog } from "../types.js";

// review_test_basis / analyze_requirements / analyze_cause_effect が参照する、
// src/testBasisAnalysis.ts の findAmbiguousTerms 専用の文脈依存除外規則カタログ。
// testplan://review/ambiguity-lexicon（review_test_plan 専用）とは独立したデータであり、共有・共通化はしない。
//
// 各 contextPatternSource は lookbehind/lookahead のみで構成し、マッチ開始位置が対象語(term)の
// 一致位置と一致するようにする。これにより「宣言された除外規則」と「本文中の実際の一致箇所」を
// 同一インデックスで突き合わせられる。
//
// AMBX-01（「等」）: 直前の名詞句に読点(、)・並列助詞「や」による列挙が埋め込まれている場合は
// 除外しない（列挙が閉じない仕様欠陥のリスクが残るため）。単純な名詞1語＋「等」のヘッジ語尾のみ除外する。
// 「、」直前が格助詞・主題助詞（は/も/を/に/で/と/から/まで/ので/が/の）の場合はその読点を別クローズの
// 読点とみなし、列挙とは判定しない（誤って除外対象外になることを防ぐ）。
const PHRASE_CHAR_CLASS =
  "A-Za-z0-9\\u30A0-\\u30FF\\u4E00-\\u9FFF\\u3005\\u30FC\\u30FB";
const NON_ENUMERATION_BOUNDARY =
  `(?:^|[^${PHRASE_CHAR_CLASS}、や]|[はもをにでとがの]、|から、|まで、|ので、)`;
const AMBX_01_PATTERN = `(?<=${NON_ENUMERATION_BOUNDARY}[${PHRASE_CHAR_CLASS}]+)等`;

// AMBX-02（「必要な」）: 「Xに/がYに必要な」の定義的連体修飾のみ除外する。
// Yは限定した具体名詞（機能|情報|データ）のみとし、「必要な対応/処置/措置/検討/実施」等の
// 抽象名詞や、直前が読点等で暗黙主語になっている場合は除外しない。
const AMBX_02_PATTERN = `(?<=[にが])必要な(?=機能|情報|データ)`;

export const ambiguityExclusionRules: AmbiguityExclusionRuleCatalog = {
  name: "曖昧語検査 文脈依存除外規則カタログ（自作整理）",
  note:
    "findAmbiguousTerms が過検出する実務文書の定型表現（名詞ヘッジ語尾の「等」、定義的用法の「必要な」）を、" +
    "文脈条件つきで除外するための規則集。列挙が閉じない用法や基準の無い曖昧語は除外対象に含めない。",
  rules: [
    {
      id: "AMBX-01",
      term: "等",
      contextPatternSource: AMBX_01_PATTERN,
      rationale:
        "直前の名詞句が単独（読点・「や」による列挙を含まない）の場合のみ、名詞に付くヘッジ語尾とみなして除外する。" +
        "「、」直前が格助詞・主題助詞（は/も/を/に/で/と/から/まで/ので/が/の）のときはその読点を別クローズの区切りとみなし、列挙とは判定しない。",
      keptCounterExample: "自動デプロイ、コスト最適化支援等の非機能要件",
    },
    {
      id: "AMBX-02",
      term: "必要な",
      contextPatternSource: AMBX_02_PATTERN,
      rationale:
        "「Xに/がYに必要な」の定義的連体修飾（Yが機能/情報/データのいずれか）のみ除外する。" +
        "抽象名詞が続く場合や直前が読点等で暗黙主語になっている場合は除外しない。",
      keptCounterExample: "相応の対応が必要な処置を行う。",
    },
  ],
};
