import type { CrossMatrixAuditCriteria } from "../types.js";

// audit_cross_matrix の判定区分カタログ。本プロジェクト独自の判定区分。
export const crossMatrixAuditCriteria: CrossMatrixAuditCriteria = {
  name: "多軸マトリクス監査 判定区分カタログ",
  summary:
    "任意の2軸以上(プロダクトリスク／テスト観点カテゴリ／ペルソナ／機能ID／シナリオ／テストコンテナ／パラメータ／テストタイプなど)を" +
    "汎用の軸データとして受け取り、軸ペアの直積表を生成したときに現れる空行・空列(片側にしかない要素)と、" +
    "充填率の根拠が縮退・未裏付けによって水増しされていないかを分類するための判定区分。",
  categories: [
    {
      id: "CMX-01",
      nameJa: "未宣言IDへの紐づけ",
      severity: "high",
      definition:
        "items[].links、または exclusions[].itemId が、どの軸の items[].id にも存在しないIDを参照している。",
      recommendedAction:
        "参照先IDの綴りを確認し、宣言済みの要素IDへ修正するか、当該要素をいずれかの軸の items に追加すること。",
    },
    {
      id: "CMX-02",
      nameJa: "軸ID・要素IDの重複",
      severity: "high",
      definition: "axes[].axisId が重複している、または items[].id が同一軸内もしくは軸をまたいで重複している。",
      recommendedAction:
        "軸IDは集合内で一意にし、要素IDも全軸を通じて一意にすること。索引は最初の宣言を採用するため、重複を残すと紐づけ先が意図と食い違う。",
    },
    {
      id: "CMX-03",
      nameJa: "空行(もう一方の軸のどれとも紐づかない行要素)",
      severity: "high",
      definition:
        "直積表の行要素が、列軸のどの要素とも紐づいていない。除外宣言がないため、意図した空白なのか分析の抜けなのか判断できない。",
      recommendedAction:
        "テスト分析へ立ち戻り、列軸側に不足している要素を追加するか、正当な空白であれば exclusions に理由を明記して再監査すること。",
    },
    {
      id: "CMX-04",
      nameJa: "空列(もう一方の軸のどれとも紐づかない列要素)",
      severity: "high",
      definition:
        "直積表の列要素が、行軸のどの要素とも紐づいていない。除外宣言がないため、意図した空白なのか分析の抜けなのか判断できない。",
      recommendedAction:
        "テスト分析へ立ち戻り、行軸側に不足している要素を追加するか、正当な空白であれば exclusions に理由を明記して再監査すること。",
    },
    {
      id: "CMX-05",
      nameJa: "自軸内要素への紐づけ",
      severity: "medium",
      definition: "items[].links が同じ軸に属する要素を指しており、軸間の関係として直積表に反映できない。",
      recommendedAction:
        "軸内の関係を表したい場合は別の軸として切り出すか、当該リンクを削除して軸間の紐づけだけを links に残すこと。",
    },
    {
      id: "CMX-06",
      nameJa: "片方向のみの紐づけ",
      severity: "medium",
      definition:
        "a から b への紐づけは宣言されているが、b から a への紐づけが宣言されていない。成果物側の表の見え方が軸の取り方で変わる原因になる。",
      recommendedAction:
        "双方の links に相手の要素IDを宣言し、どちらの軸を行に置いても同じ関係が読み取れる状態にすること。",
    },
    {
      id: "CMX-07",
      nameJa: "除外理由の未記入",
      severity: "high",
      definition: "exclusions[].reason が未指定または空文字であり、空行・空列を許容する根拠が記録されていない。",
      recommendedAction:
        "なぜその要素が片側にしかなくてよいのか(対象外・仕様上関係し得ないなど)を reason に明記すること。",
    },
    {
      id: "CMX-08",
      nameJa: "宣言された充填率と実測値の不一致",
      severity: "high",
      definition:
        "declaredCoverage に宣言された充填率・行被覆率・列被覆率が算出値と一致しない、または claimedNoEmptyCells が true であるにもかかわらず空行・空列が存在する。" +
        "宣言充填率が links 由来の充填率と一致していても、根拠裏付け後の充填率と一致しない場合を含む。",
      recommendedAction:
        "成果物に記載した数値を実測値へ修正するか、数値が正しいのであれば軸・紐づけの投入漏れがないか確認して再監査すること。",
    },
    {
      id: "CMX-09",
      nameJa: "軸母集団の縮退",
      severity: "high",
      definition:
        "expectedAxisPopulations に宣言された母集団のIDが、軸の items に存在しない。母集団が縮んだ状態で算出した充填率は見かけの高値になる。",
      recommendedAction:
        "欠落したIDを軸の items へ戻して再監査すること。意図的に外したのであれば exclusions で理由を明記すること。",
    },
    {
      id: "CMX-10",
      nameJa: "テストベース本文に裏付けの無い軸要素",
      severity: "high",
      definition:
        "documents を指定したにもかかわらず、軸要素の id も label もテストベース本文に出現しない。軸の要素が成果物本文から裏付けられていない。" +
        "照合は表記差(全角半角・空白・記号)を吸収した正規化後の包含判定で行う。",
      recommendedAction:
        "当該要素の出典をテストベースで確認し、綴りを本文に合わせるか、本文に無い要素であれば根拠を添えて軸から外すこと。",
    },
    {
      id: "CMX-11",
      nameJa: "テストベースに定義があるのに軸に載っていないID",
      severity: "medium",
      definition:
        "テストベース本文の定義行から抽出したIDが、どの軸の items にも exclusions にも存在しない。軸の母集団に取りこぼしがある可能性がある。",
      recommendedAction:
        "当該IDを対象軸の items に追加するか、対象外であれば exclusions に理由付きで宣言して再監査すること。",
    },
    {
      id: "CMX-12",
      nameJa: "直積に寄与しない軸",
      severity: "medium",
      definition:
        "軸の items が1件以下であり、他軸との直積が実質的に成立しない。充填率が自明に高い値になり、監査の意味を失う。",
      recommendedAction:
        "要素を2件以上に補うか、固定条件として軸から外し前提条件として記録すること。",
    },
    {
      id: "CMX-13",
      nameJa: "セル数が上限超過",
      severity: "info",
      definition:
        "軸ペアのセル数(行数 × 列数)が maxCellCount の上限を超え、または安全整数の範囲外であり、当該ペアの直積表を生成しなかった。",
      recommendedAction:
        "軸の要素を絞り込むか、必要であれば maxCellCount を明示的に引き上げて再監査すること。",
    },
    {
      id: "CMX-14",
      nameJa: "未宣言の軸IDの参照／同一軸ペアの指定",
      severity: "medium",
      definition:
        "axisPairs / declaredCoverage / exclusions / expectedAxisPopulations が axes に宣言されていない軸IDを参照している、または axisA と axisB が同一軸である。",
      recommendedAction:
        "軸IDの綴りを確認して宣言済みの軸へ修正するか、当該軸を axes に追加すること。同一軸ペアの指定は削除すること。",
    },
    {
      id: "CMX-15",
      nameJa: "完全孤立要素",
      severity: "high",
      definition:
        "どの他軸の要素とも1件も紐づいておらず、全ての軸ペアで空行かつ空列になっている要素。",
      recommendedAction:
        "上流の分析成果物へ立ち戻り、当該要素がどの軸のどの要素と関係するのかを特定して紐づけること。関係が本当に存在しないなら軸から外すこと。",
    },
    {
      id: "CMX-16",
      nameJa: "リンク根拠の未記入",
      severity: "high",
      definition:
        "documents を指定したにもかかわらず、他軸要素へのリンク宣言に根拠(evidence)が無い、または短すぎて本文と照合できない。充填の根拠が宣言のみであり実体の裏付けが無い。",
      recommendedAction:
        "当該リンクの根拠となる本文の一文を evidence に引用し、出典を evidenceSource に記録すること。根拠を示せないリンクは削除すること。",
    },
    {
      id: "CMX-17",
      nameJa: "本文に裏付けの無いリンク根拠",
      severity: "high",
      definition:
        "リンク宣言の evidence が、投入されたテストベース本文に存在しない(表記差を吸収した照合でも一致しない)。",
      recommendedAction:
        "evidence は本文からそのまま切り出すこと。要約・言い換えは書かず、本文に無い関係であれば当該リンクを削除するかテストベースを更新すること。",
    },
  ],
  notes: [
    "本検査は渡された軸と紐づけに対してのみ成立する。渡していない軸・要素の取りこぼしは検出できない。",
    "紐づけは無向として扱う。a→b と b→a のどちらか一方の宣言でセルは埋まったとみなし、片方向のみの宣言は CMX-06 として別に報告する。",
    "充填率の分母は 行数 × 列数 であり、意味的に成立し得ないセルを含む。行被覆率・列被覆率の分母は除外宣言された要素を除いた要素数であり、全要素数ではない。",
    "空セルは必ずしも欠陥ではない。片側にしかない要素が見つかった場合はテスト分析を再実施して追加するか、除外理由を明記すること。",
    "本検査は2軸間の関係のみを対象とする。3軸が同時に絡む網羅性は、軸ペアを回した結果の重ね合わせでは保証されない。",
    "セルの充填は links の宣言で成立するが、根拠裏付け充填率は evidence が本文から裏付けられたセルだけを分子に数える。宣言充填率と根拠裏付け充填率の差が、宣言のみで成立している部分である。",
    "links は文字列(相手IDのみ)でも受け付けるが、その形式では根拠が無いため documents 指定時は CMX-16 になる。",
    "本文との照合は全角半角・空白・記号差を吸収した正規化後の包含判定であり、正規化により記号が落ちるため短い文字列は偶発一致し得る。",
  ],
};
