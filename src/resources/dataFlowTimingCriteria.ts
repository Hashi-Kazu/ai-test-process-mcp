import type { DataFlowTimingAnalysisCriteria } from "../types.js";

// analyze_data_flow_timing の判定区分カタログ。本プロジェクト独自の判定区分。
export const dataFlowTimingAnalysisCriteria: DataFlowTimingAnalysisCriteria = {
  name: "データフロー・タイミング分析 判定区分カタログ",
  summary:
    "システム構成要素間の通信(送信元・宛先・運ぶデータ項目・送信タイミング・ACK・タイムアウト・再送)から、" +
    "同一データが末端へ届くまでの最大伝播遅延と、複数経路で伝播したときの最大乖離時間を算出し、" +
    "宣言(伝播先・遅延値・乖離値・被覆率)と実体(グラフ到達性・算出値・テスト条件本体)を双方向で照合するための判定区分。",
  categories: [
    {
      id: "DFT-01",
      nameJa: "IDの重複",
      severity: "high",
      definition: "components[].id / dataItems[].id / communications[].id のいずれかが重複している。",
      recommendedAction: "各母集団のIDが一意になるよう修正すること。",
    },
    {
      id: "DFT-02",
      nameJa: "母集団外参照",
      severity: "high",
      definition:
        "communications[].fromId / toId が components に存在しない、または dataItemIds が dataItems に存在しない。",
      recommendedAction: "参照先IDの綴りを確認し、母集団に宣言済みのIDへ修正するか、当該構成要素・データ項目を追加すること。",
    },
    {
      id: "DFT-03",
      nameJa: "自己通信",
      severity: "high",
      definition: "communications[].fromId と toId が同一である。",
      recommendedAction: "自分自身への通信宣言を削除するか、実際の宛先へ修正すること。",
    },
    {
      id: "DFT-04",
      nameJa: "タイミングの未定義",
      severity: "high",
      definition:
        "timing.kind が \"undefined\" である、または periodic / batch / on-demand なのに intervalSeconds が無い、" +
        "または event なのに trigger が未記入である。当該通信は latency 不定として扱い、0秒で代替しない。",
      recommendedAction:
        "テストベースから送信周期または送信契機を特定して補うこと。特定できない場合はテストベース側の欠落として起票すること。",
    },
    {
      id: "DFT-05",
      nameJa: "ACK・応答の未定義",
      severity: "medium",
      definition: "ackKind が未指定または \"undeclared\" であり、到達確認の有無が確定していない。",
      recommendedAction:
        "アプリケーション応答・トランスポート応答・応答なしのいずれかを ackKind に明示すること。",
    },
    {
      id: "DFT-06",
      nameJa: "タイムアウト値の未宣言",
      severity: "medium",
      definition: "ackKind が application-ack / transport-ack なのに timeoutSeconds が宣言されていない。",
      recommendedAction: "応答待ちの上限時間を timeoutSeconds に宣言すること。最悪遅延の算出に必要である。",
    },
    {
      id: "DFT-07",
      nameJa: "伝播遅延の算出不能",
      severity: "high",
      definition: "遅延窓の経路上に DFT-04 の通信が含まれ、最大伝播遅延を算出できない。",
      recommendedAction: "原因となった通信のタイミング定義を補い、再実行して遅延窓を算出可能にすること。",
    },
    {
      id: "DFT-08",
      nameJa: "最大伝播遅延の宣言不一致",
      severity: "high",
      definition:
        "propagationTargets[].claimedMaxLatencySeconds が算出値と一致しない、または算出不能で裏付けられない。",
      recommendedAction: "通信仕様の周期・タイムアウト宣言を確認し、宣言値を算出値に合わせるか、入力を算出可能な状態まで補うこと。",
    },
    {
      id: "DFT-09",
      nameJa: "宣言した終端の到達不能",
      severity: "high",
      definition:
        "propagationTargets[].terminalComponentIds が、当該 dataItemId の部分グラフで originComponentId から到達できない。",
      recommendedAction: "伝播経路となる通信が母集団から漏れていないか確認し、漏れていれば communications に追加すること。",
    },
    {
      id: "DFT-10",
      nameJa: "遅延窓に対応するテスト条件の欠落",
      severity: "medium",
      definition:
        "算出された0秒超の遅延窓が、どのテスト条件の coveredDelayWindowIds からも参照されていない。" +
        "逆に、実在しない遅延窓IDを参照しているテスト条件も同区分で列挙する。",
      recommendedAction: "遅延窓ごとにテスト条件を起こし、coveredDelayWindowIds で対応関係を明示すること。",
    },
    {
      id: "DFT-11",
      nameJa: "乖離窓に対応するテスト条件の欠落",
      severity: "medium",
      definition:
        "算出された0秒超の乖離窓が、どのテスト条件の coveredDelayWindowIds からも参照されていない。" +
        "逆に、実在しない乖離窓IDを参照しているテスト条件も同区分で列挙する。",
      recommendedAction: "乖離窓ごとにテスト条件を起こし、coveredDelayWindowIds で対応関係を明示すること。",
    },
    {
      id: "DFT-12",
      nameJa: "即時反映の期待と算出遅延の矛盾",
      severity: "high",
      definition:
        "expectsImmediate: true のテスト条件が参照するデータ項目に、最大伝播遅延が0秒を超える遅延窓が存在する。",
      recommendedAction:
        "遅延窓の秒数を前提に条件文を書き直すか、即時反映が仕様として要求されるなら通信仕様側の実現性を確認すること。",
    },
    {
      id: "DFT-13",
      nameJa: "運ばれないデータ項目",
      severity: "medium",
      definition: "dataItems に宣言されたが、どの通信の dataItemIds にも現れない。",
      recommendedAction: "そのデータ項目を運ぶ通信が母集団から漏れていないか確認すること。漏れでなければ宣言を削除すること。",
    },
    {
      id: "DFT-14",
      nameJa: "データ項目を運ばない通信",
      severity: "medium",
      definition: "通信の dataItemIds が空、または全件が母集団外参照で有効な実体を1件も持たない。",
      recommendedAction: "その通信が実際に運ぶデータ項目を dataItemIds に宣言すること。",
    },
    {
      id: "DFT-15",
      nameJa: "孤立した構成要素",
      severity: "info",
      definition: "送信も受信もしない構成要素(通信母集団からの取りこぼし候補)。",
      recommendedAction: "本当に他の構成要素と通信しないか、通信の宣言漏れが無いかを確認すること。",
    },
    {
      id: "DFT-16",
      nameJa: "根拠位置の未特定",
      severity: "medium",
      definition: "通信に sourceRef(テストベース上の根拠位置)が無く、通信仕様の出所を追跡できない。",
      recommendedAction: "その通信仕様が書かれている文書・行・見出しを sourceRef に記入すること。",
    },
    {
      id: "DFT-17",
      nameJa: "周期の不揃い",
      severity: "medium",
      definition:
        "同一データ項目を運ぶ周期系通信の intervalSeconds が経路間で揃っておらず、表示・状態の乖離が構造的に生じ得る。",
      recommendedAction: "周期差が意図的かを確認し、意図的なら乖離下の振る舞いをテスト条件として明示すること。",
    },
    {
      id: "DFT-18",
      nameJa: "最大乖離時間の宣言不一致",
      severity: "high",
      definition: "claimedMaxSkewSeconds が算出値と一致しない、または算出不能で裏付けられない。",
      recommendedAction: "宣言値を算出値に合わせるか、経路上のタイミング定義を補って算出可能にすること。",
    },
    {
      id: "DFT-19",
      nameJa: "件数上限の超過・列挙の打ち切り",
      severity: "info",
      definition: "通信件数が maxCommunications を超過した、または経路列挙が maxPathsPerPair で打ち切られた。",
      recommendedAction: "対象を絞り込むか、必要であれば上限を明示的に引き上げて再実行すること。",
    },
    {
      id: "DFT-20",
      nameJa: "遅延窓被覆率の宣言不一致",
      severity: "high",
      definition: "claimedDelayWindowCoveragePercent が算出値と一致しない、または算出不能である。",
      recommendedAction: "分母(0秒超の算出済み遅延窓・乖離窓)と分子(テスト条件から実際に参照されている窓)を確認し、宣言値を算出値に合わせること。",
    },
  ],
  notes: [
    "本検査は渡された通信母集団に対してのみ成立し、渡していない通信の取りこぼしは検出できない。",
    "遅延値は仕様上の周期・タイムアウト宣言から導いた設計上の最悪値であり、実測値の代替にしない。",
    "辺の最大遅延は「送信待ち(周期系は intervalSeconds、eventは0) + 伝送時間 + タイムアウト×再送回数」、" +
      "最小遅延は「伝送時間」で算出する。",
    "最大乖離は「最も遅い観測点の最悪値 − 最も速い観測点の最良値」であり、周期差そのものと一致するとは限らない。",
    "タイミングが未定義の辺は0秒で代替せず、その辺を含む経路の遅延窓・乖離窓を「未算出」として区別する。",
    "mermaid の矢印記法は timing.kind と対応する。event かつ ACK ありは `->>`、event かつ ACK なしは `-)`、" +
      "periodic / batch / on-demand は `--)`、タイミング未定義は `-x` で描画する。",
    "本ツールが扱うのはSUT内部の構成要素間の通信タイミングであり、テスト作業そのものの実行順序(analyze_execution_order)とは別概念である。",
  ],
};
