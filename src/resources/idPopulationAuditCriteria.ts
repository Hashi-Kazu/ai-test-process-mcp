import type { IdPopulationAuditCriteria } from "../types.js";

// audit_id_population の判定区分カタログ。自作のパラフレーズであり、原典の逐語転載はしない。
export const idPopulationAuditCriteria: IdPopulationAuditCriteria = {
  name: "ID母集団監査 判定区分カタログ",
  summary:
    "テストベースに定義されたID全量と、各ツール呼び出しに実際に渡された母集団を突き合わせ、母集団の縮退（一部だけが繰り返し使われる状態）を検出するための判定区分。",
  categories: [
    {
      id: "PAC-01",
      nameJa: "未宣言ID",
      severity: "high",
      description:
        "テストベースに定義されているが、どの母集団にも一度も渡されていないID。除外理由が無い限り検討漏れの可能性が高い。",
      action:
        "対象のツール呼び出しの母集団に追加するか、対象外である理由を exclusions に明記して再監査すること。",
    },
    {
      id: "PAC-02",
      nameJa: "除外宣言ID",
      severity: "info",
      description:
        "未宣言だが exclusions で除外理由が明示されているID。監査対象からは外れるが、理由の妥当性は別途確認が必要。",
      action: "除外理由がスコープ外・対象外であることの説明として妥当かを確認すること。",
    },
    {
      id: "PAC-03",
      nameJa: "テストベース未定義ID",
      severity: "high",
      description:
        "母集団には含まれているが、テストベース文書の定義行として抽出できないID。誤記・古いID・投入漏れの文書に定義がある可能性がある。",
      action:
        "IDの表記揺れ・誤記を確認するか、そのIDを定義している文書を documents に追加して再監査すること。",
    },
    {
      id: "PAC-04",
      nameJa: "未投入文書",
      severity: "high",
      description:
        "expectedDocumentNames に指定されているが documents に含まれていない文書。監査対象の母集団そのものが不完全である可能性が高い。",
      action: "該当文書の全文を documents に投入し、再度監査を実行すること。",
    },
    {
      id: "PAC-05",
      nameJa: "工程間の母集団縮退",
      severity: "high",
      description:
        "複数の母集団（工程・ツール呼び出し）を比較したとき、ID件数が少ない母集団に、件数の多い母集団のIDが欠けている状態。工程が進むにつれてIDが失われている兆候。",
      action:
        "件数の多い母集団を基準に、欠落IDがどの工程で落ちたかを特定し、意図的な絞り込みか見落としかを確認すること。",
    },
    {
      id: "PAC-06",
      nameJa: "文書単位の反映率低下",
      severity: "medium",
      description:
        "特定の文書に定義されたIDのうち、母集団に宣言された割合（反映率）が他の文書より明確に低い状態。特定の文書だけが見落とされている兆候。",
      action: "反映率が低い文書を優先的に読み直し、未宣言IDが対象外か検討漏れかを確認すること。",
    },
  ],
  notes: [
    "網羅率・未カバー数は、入力として宣言された母集団に対してのみ成立する判定であり、テストベース全体に対する充足性を保証しない。",
    "母集団が縮退していても、その縮退した母集団の内部だけで見れば見かけ上100%（未カバー0件）になり得る。",
    "本監査は決定的な突き合わせのみを行う。除外理由の妥当性やスコープ判断は呼び出し側（意味的層）で確認すること。",
  ],
};
