import type { InputQualityCriteria } from "../types.js";

/** 判定に必要な最小の表セル数。これ未満の文書は IQC-01 / IQC-04 の判定対象外。 */
export const IQC_MIN_TABLE_CELLS = 30;

/** 孤立数値セル率がこの比率以上なら high（整数演算で 100分率として比較する）。 */
export const IQC_ISOLATED_NUMERIC_HIGH_PERCENT = 30;
/** 孤立数値セルの異なり値数がこの件数未満なら判定しない（少数の連番・件数を除外する裏付け条件）。 */
export const IQC_ISOLATED_NUMERIC_MIN_DISTINCT = 20;

/** ふりがな候補と見なすカタカナ列の最小長。 */
export const IQC_FURIGANA_MIN_RUN_LENGTH = 8;
/** ふりがな候補がこの件数未満なら判定しない。 */
export const IQC_FURIGANA_MIN_RUNS = 3;
/** ふりがな文字数の全文字数比（千分率で整数比較）。10 = 1.0% 以上で high。 */
export const IQC_FURIGANA_HIGH_PERMILLE = 10;
/** 2 = 0.2% 以上で medium。 */
export const IQC_FURIGANA_MEDIUM_PERMILLE = 2;

/** 見出し0件を指摘する最小の文字数・行数。 */
export const IQC_NO_HEADING_MIN_CHARS = 2000;
export const IQC_NO_HEADING_MIN_LINES = 50;

/** 表崩れセル率がこの比率以上なら medium（100分率で整数比較）。 */
export const IQC_BROKEN_TABLE_PERCENT = 12;

/**
 * ふりがな（読み仮名）として現れうるカタカナのみの集合。
 * 長音符「ー」・促音「ッ」・小書きの「ァィゥェォヮ」・「ヴ」を意図的に除外する。
 * これらは外来語表記の指標であり、漢字直後の外来語（例「入場システム」「オンラインチケット」）を
 * ふりがなと誤判定しないための除外である。拗音「ャュョ」は読みに現れるため含める。
 */
export const IQC_YOMI_KATAKANA =
  "アイウエオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモヤユヨラリルレロワヲンャュョ";

// input-quality-criteria（IQC-01..IQC-04）の判定区分カタログ。
// 変換品質（テキスト化の忠実性）のみを機械的に測る自作の判定基準であり、原典の逐語転載はしない。
export const inputQualityCriteria: InputQualityCriteria = {
  name: "入力品質（変換品質）判定区分カタログ",
  summary:
    "バイナリ形式（Word/Excel/PDF）から自由テキストへ変換された投入テキストが、変換時の破損・混入・欠落を含んでいないかを機械的に測る判定区分。" +
    "テストベース仕様そのものの内容判断は行わない。",
  criteria: [
    {
      id: "IQC-01",
      nameJa: "孤立数値セル",
      severity: "high",
      metric:
        "表行から抽出した非空セルのうち、単位も文脈語も伴わない2桁以上の数値のみのセルの比率と、その異なり値数。",
      threshold:
        `母数（表セル総数）が IQC_MIN_TABLE_CELLS(${IQC_MIN_TABLE_CELLS}) 件以上、比率が IQC_ISOLATED_NUMERIC_HIGH_PERCENT(${IQC_ISOLATED_NUMERIC_HIGH_PERCENT})% 以上、` +
        `かつ異なり値が IQC_ISOLATED_NUMERIC_MIN_DISTINCT(${IQC_ISOLATED_NUMERIC_MIN_DISTINCT}) 種以上のとき high。` +
        "比率だけでなく異なり値数もAND条件とすることで、少数の連番・件数（正当な数値の繰り返し）を誤検出しないようにしている。",
      description:
        "表のセル値が変換時に別の値（共有文字列インデックス等）へ化けると、文脈語を伴わない数値のみのセルが多数出現する。" +
        "これは Excel の自己閉じセル（<c/>）を誤処理して共有文字列参照がずれるような変換破損の典型パターンである。",
      action: "原本（Excel等）から再変換したテキストで再実行すること。",
      measuredEvidence: [
        "破損変換Excel（自己閉じセル <c/> の誤処理で共有文字列参照がずれた変換）で比率 0.733 / 0.778。",
        "正しい変換の同一Excelで比率 0.142 / 0.087。",
        "2026年版PDF（pdftotext -layout）最大 0.196。",
        "既存Markdown成果物38件の最大 0.161。",
      ],
    },
    {
      id: "IQC-02",
      nameJa: "ふりがな混入",
      severity: "high",
      metric:
        "漢字の直後に区切りなしで連続する、長音符・促音・小書きカナを含まない IQC_FURIGANA_MIN_RUN_LENGTH 文字以上のカタカナ列の文字数が全文字数に占める比率。",
      threshold:
        `検出件数が IQC_FURIGANA_MIN_RUNS(${IQC_FURIGANA_MIN_RUNS}) 件以上のとき、` +
        `比率が IQC_FURIGANA_HIGH_PERMILLE(${IQC_FURIGANA_HIGH_PERMILLE})‰（1.0%）以上なら high、` +
        `IQC_FURIGANA_MEDIUM_PERMILLE(${IQC_FURIGANA_MEDIUM_PERMILLE})‰（0.2%）以上なら medium。`,
      description:
        "Word/Excel の <rPh> ルビ要素を落とさない変換を行うと、漢字直後にふりがな（読み仮名）のカタカナ表記がそのまま本文へ連結される。" +
        "外来語表記（例「入場システム」「オンラインチケット」）は長音符・促音・小書きカナを含むことが多く、除外集合で切り分けている。",
      action: "ふりがな（ルビ）を除いたテキストで再実行すること。",
      measuredEvidence: [
        "ふりがな（<rPh>）を落とさない変換のExcelで比率 0.0703 / 0.0053。",
        "同一Excelの正しい変換・2026年版PDF・既存Markdown成果物の全55件で最大 0.00015。",
      ],
    },
    {
      id: "IQC-03",
      nameJa: "見出し0件",
      severity: "medium",
      metric: "parseHeadings によるMarkdown見出し数。",
      threshold:
        `IQC_NO_HEADING_MIN_CHARS(${IQC_NO_HEADING_MIN_CHARS}) 字以上かつ IQC_NO_HEADING_MIN_LINES(${IQC_NO_HEADING_MIN_LINES}) 行以上の文書で見出し0件のとき medium。`,
      description:
        "PDFのプレーン抽出・-layout抽出のいずれも、見出し構造（フォントサイズ・太字等）をMarkdown見出し記号へ変換しない。" +
        "見出しが0件のまま以降の全ツールへ渡ると、章節の手がかりがすべて失われる。",
      action: "見出しを保持した変換テキスト（章節番号を本文中に残す等）で再実行すること。",
      measuredEvidence: [
        "2026年版PDF 9文書はプレーン抽出・-layout 抽出のいずれでも見出し0件。",
      ],
    },
    {
      id: "IQC-04",
      nameJa: "表崩れ",
      severity: "medium",
      metric: "表セルのうち、3文字以上かつ末尾が助詞・読点で終わるセルの比率。",
      threshold:
        `母数（表セル総数）が IQC_MIN_TABLE_CELLS(${IQC_MIN_TABLE_CELLS}) 件以上、` +
        `比率が IQC_BROKEN_TABLE_PERCENT(${IQC_BROKEN_TABLE_PERCENT})% 以上のとき medium。`,
      description:
        "表のセルが行方向に分断され、文の断片（助詞・読点で終わる不完全なテキスト）が1セルとして抽出される状態。" +
        "セル結合や改行を含むセルが正しく1セルとして変換されなかった可能性がある。",
      action: "セル結合を保持した変換テキストで再実行すること。",
      measuredEvidence: [
        "2026年版PDF（-layout）最大 0.077、既存Markdown成果物最大 0.075、Excel変換 0.003 以下。",
        "閾値0.12はこれらすべての上に置いた保守的な値であり、既知サンプルでは発火しない。",
      ],
    },
  ],
  notes: [
    "本区分はすべて変換品質（テキスト化の忠実性）の指標であり、テストベース仕様そのものの欠陥を示すものではない。",
    "閾値は形式（Word/Excel/PDF）ごとに変えない。tool は形式不問の自由テキストを受け取り、形式を決定的に判別できないため。",
    "本区分は網羅率・達成度を提示するものではなく、成果物の宣言と実体の照合でもない。投入テキストそのものの機械的性質のみを測る。",
    "閾値未満であることは変換が正しいことを保証しない。逆に、全セルが数値である正当な数値表など、正常な文書が閾値を超える場合がある。",
    "IQC-01は比率だけでなく異なり値数20種以上という実体側の裏付け条件をAND条件で課している。少数の連番・件数（正当な数値の繰り返し）が" +
      "比率だけで誤検出されないようにするための設計であり、宣言と実体の照合ではないが同種の裏付け要件を意図的に取り入れている。",
  ],
};
