import type { TestPerspectiveCatalog, TestTechniqueId } from "../types.js";

// 広く使われるテスト観点の考え方を参考に、テスト分析で使いやすい形へ独自に整理した
// 観点カタログ。カテゴリ名・観点名・着眼点例はすべて自作の日本語文であり、
// 外部文献の逐語転載ではない（規格番号・準拠表記は意図的に含めない）。
export const testPerspectiveCatalog: TestPerspectiveCatalog = {
  name: "テスト観点カタログ（自作整理）",
  note:
    "広く使われるテスト観点の考え方を参考に独自に整理したものであり、外部文献の逐語転載や特定の外部基準への適合を主張するものではない。",
  categories: [
    {
      id: "TPC-01",
      nameJa: "機能",
      summary: "要件に記載された機能そのものが意図どおりに実現できているかを確かめる観点。",
      perspectives: [
        {
          id: "TPC-01-01",
          nameJa: "主要機能の実現",
          focusExamples: [
            "要件記載の機能が単体で意図どおり動くか",
            "操作の入口と出口が揃っているか",
            "機能を使い切るまでの一連の手順が途切れずに完了できるか",
          ],
          relatedQualityCharacteristicIds: ["QC-01", "QC-01-01"],
          recommendedTechniques: ["scenario-based", "decision-table", "checklist-based"],
        },
        {
          id: "TPC-01-02",
          nameJa: "計算・判定ロジック",
          focusExamples: [
            "計算結果が仕様値と一致するか",
            "端数処理・丸めの方向が仕様どおりか",
            "判定条件の組み合わせごとに正しい結果が返るか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-02"],
          recommendedTechniques: ["decision-table", "boundary-value-analysis", "checklist-based"],
        },
        {
          id: "TPC-01-03",
          nameJa: "機能間の整合",
          focusExamples: [
            "同じ情報を扱う複数機能で結果が一致するか",
            "一方の機能での更新が他方の表示に正しく反映されるか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-01", "QC-01-03"],
          recommendedTechniques: ["scenario-based", "checklist-based"],
        },
      ],
    },
    {
      id: "TPC-02",
      nameJa: "正常系・準正常系・異常系",
      summary: "経路の種類を正常・準正常・異常に分け、どの経路も想定どおり扱われるかを確かめる観点。",
      perspectives: [
        {
          id: "TPC-02-01",
          nameJa: "正常系",
          focusExamples: [
            "想定操作・想定データでの成功経路が完了するか",
            "成功時の結果表示・後続処理が仕様どおりか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-01"],
          recommendedTechniques: ["use-case-based", "scenario-based", "equivalence-partitioning"],
        },
        {
          id: "TPC-02-02",
          nameJa: "準正常系",
          focusExamples: [
            "キャンセル・差戻し・再入力で状態が破綻しないか",
            "部分入力のまま中断した場合の扱いが決まっているか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-03", "QC-04-04"],
          recommendedTechniques: ["scenario-based", "decision-table"],
        },
        {
          id: "TPC-02-03",
          nameJa: "異常系",
          focusExamples: [
            "不正入力・必須未入力に対する拒否とメッセージが適切か",
            "権限不足・システムエラー時の振る舞いとメッセージが適切か",
          ],
          relatedQualityCharacteristicIds: ["QC-05-03", "QC-04-04"],
          recommendedTechniques: ["equivalence-partitioning", "decision-table", "error-guessing"],
        },
      ],
    },
    {
      id: "TPC-03",
      nameJa: "境界",
      summary: "値・件数・桁数の境界付近で判定が切り替わる箇所を確かめる観点。",
      perspectives: [
        {
          id: "TPC-03-01",
          nameJa: "数値・日付の境界",
          focusExamples: [
            "上限・下限とその直前直後で判定が切り替わるか",
            "境界を含む/含まないの扱いが仕様どおりか",
            "年度末・月末・うるう日で日付計算が破綻しないか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-02"],
          recommendedTechniques: ["boundary-value-analysis"],
        },
        {
          id: "TPC-03-02",
          nameJa: "桁数・件数の境界",
          focusExamples: [
            "最小文字数・最大文字数とその直前直後で扱いが変わるか",
            "0件・1件・最大件数での一覧表示や集計が正しいか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-02", "QC-02-03"],
          recommendedTechniques: ["boundary-value-analysis"],
        },
      ],
    },
    {
      id: "TPC-04",
      nameJa: "同値",
      summary: "入力を同じ扱いになるグループへ分け、各グループの代表値で確かめる観点。",
      perspectives: [
        {
          id: "TPC-04-01",
          nameJa: "有効同値クラス",
          focusExamples: [
            "区分ごとの代表値で期待どおりの処理が行われるか",
            "同じ区分内の別の値でも結果が変わらないか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-02"],
          recommendedTechniques: ["equivalence-partitioning"],
        },
        {
          id: "TPC-04-02",
          nameJa: "無効同値クラス",
          focusExamples: [
            "型違い・範囲外・空文字での拒否が一貫しているか",
            "記号・全角半角混在の入力が想定どおり扱われるか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-02", "QC-06-02"],
          recommendedTechniques: ["equivalence-partitioning", "error-guessing"],
        },
      ],
    },
    {
      id: "TPC-05",
      nameJa: "状態遷移",
      summary: "業務上の状態と遷移を洗い出し、許される遷移と許されない遷移を確かめる観点。",
      perspectives: [
        {
          id: "TPC-05-01",
          nameJa: "正当な遷移",
          focusExamples: [
            "全状態・全遷移を一度は通過できるか",
            "遷移の前後で関連データが整合するか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-01"],
          recommendedTechniques: ["state-transition"],
        },
        {
          id: "TPC-05-02",
          nameJa: "不正な遷移",
          focusExamples: [
            "起こり得ない遷移要求が確実に拒否されるか",
            "拒否時のメッセージと状態の巻き戻しが適切か",
          ],
          relatedQualityCharacteristicIds: ["QC-05-03"],
          recommendedTechniques: ["state-transition", "error-guessing"],
        },
        {
          id: "TPC-05-03",
          nameJa: "状態の永続化",
          focusExamples: [
            "中断・再開後も状態が保たれるか",
            "セッション切断や再ログイン後に状態が失われないか",
          ],
          relatedQualityCharacteristicIds: ["QC-05-04"],
          recommendedTechniques: ["state-transition", "scenario-based"],
        },
      ],
    },
    {
      id: "TPC-06",
      nameJa: "画面遷移",
      summary: "画面間の移動と入力値の引き継ぎ、ブラウザ操作への耐性を確かめる観点。",
      perspectives: [
        {
          id: "TPC-06-01",
          nameJa: "遷移経路",
          focusExamples: [
            "正順の遷移と戻り操作の両方で正しい画面へ移動するか",
            "直リンクでの到達時に前提チェックが働くか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-01", "QC-04-03"],
          recommendedTechniques: ["state-transition", "scenario-based"],
        },
        {
          id: "TPC-06-02",
          nameJa: "入力値の保持",
          focusExamples: [
            "遷移前後で入力値・選択状態が保持されるか",
            "スクロール位置やページングの位置が失われないか",
          ],
          relatedQualityCharacteristicIds: ["QC-04-03"],
          recommendedTechniques: ["scenario-based"],
        },
        {
          id: "TPC-06-03",
          nameJa: "ブラウザ操作",
          focusExamples: [
            "戻る/進む/更新の操作後も画面と状態が一致するか",
            "多重タブで同じ画面を開いた場合に不整合が起きないか",
          ],
          relatedQualityCharacteristicIds: ["QC-05-03"],
          recommendedTechniques: ["state-transition", "exploratory"],
        },
      ],
    },
    {
      id: "TPC-07",
      nameJa: "並行・競合",
      summary: "同時実行や同時更新で発生する競合とロックの扱いを確かめる観点。",
      perspectives: [
        {
          id: "TPC-07-01",
          nameJa: "同一データの同時更新",
          focusExamples: [
            "後勝ち・排他・競合検知のいずれの方針か明確で、そのとおり動くか",
            "競合が検知された際の利用者への提示と復旧手段が用意されているか",
          ],
          relatedQualityCharacteristicIds: ["QC-06-02", "QC-01-02"],
          recommendedTechniques: ["concurrency-test"],
        },
        {
          id: "TPC-07-02",
          nameJa: "多重実行",
          focusExamples: [
            "多重ログインが許されるか、許す場合の影響が把握されているか",
            "二重送信で二重登録が発生しないか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-02", "QC-06-05"],
          recommendedTechniques: ["concurrency-test", "error-guessing"],
        },
        {
          id: "TPC-07-03",
          nameJa: "ロック",
          focusExamples: [
            "ロック待ちが過度に長くならないか",
            "デッドロックが発生した場合に検知・解消できるか",
          ],
          relatedQualityCharacteristicIds: ["QC-02-01", "QC-05-03"],
          recommendedTechniques: ["concurrency-test", "load-test"],
        },
      ],
    },
    {
      id: "TPC-08",
      nameJa: "タイミング・順序",
      summary: "処理の順序・時刻依存・タイムアウトの境界を確かめる観点。",
      perspectives: [
        {
          id: "TPC-08-01",
          nameJa: "処理順序",
          focusExamples: [
            "前提処理が未完了のまま後続を実行した場合の振る舞いが決まっているか",
            "非同期処理の完了順が入れ替わっても結果が壊れないか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-02", "QC-05-03"],
          recommendedTechniques: ["timing-order-test", "state-transition"],
        },
        {
          id: "TPC-08-02",
          nameJa: "時刻依存",
          focusExamples: [
            "締め時刻の直前直後で扱いが切り替わるか",
            "日付変更・営業時間外での操作が仕様どおり扱われるか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-02"],
          recommendedTechniques: ["timing-order-test", "boundary-value-analysis"],
        },
        {
          id: "TPC-08-03",
          nameJa: "タイムアウト",
          focusExamples: [
            "通信・セッション・操作の各タイムアウト境界で挙動が仕様どおりか",
            "タイムアウト後の再操作でデータが二重に登録されないか",
          ],
          relatedQualityCharacteristicIds: ["QC-02-01", "QC-05-03"],
          recommendedTechniques: ["timing-order-test", "boundary-value-analysis"],
        },
      ],
    },
    {
      id: "TPC-09",
      nameJa: "データライフサイクル",
      summary: "データの生成から廃棄・移行までの各段階と関連データへの波及を確かめる観点。",
      perspectives: [
        {
          id: "TPC-09-01",
          nameJa: "生成〜更新〜削除",
          focusExamples: [
            "各段階でデータの整合が保たれるか",
            "関連データへの波及（親子・集計値）が正しく行われるか",
          ],
          relatedQualityCharacteristicIds: ["QC-06-02", "QC-01-01"],
          recommendedTechniques: ["data-lifecycle-test", "state-transition"],
        },
        {
          id: "TPC-09-02",
          nameJa: "論理削除・物理削除",
          focusExamples: [
            "削除済みデータが一覧・検索・帳票から除外されるか",
            "復元が必要な場合に復元手段と範囲が定義されているか",
          ],
          relatedQualityCharacteristicIds: ["QC-06-01", "QC-05-04"],
          recommendedTechniques: ["data-lifecycle-test"],
        },
        {
          id: "TPC-09-03",
          nameJa: "保持期間・アーカイブ",
          focusExamples: [
            "保持期限の到来時に自動処理が仕様どおり動くか",
            "アーカイブ済みデータの参照可否が明確か",
          ],
          relatedQualityCharacteristicIds: ["QC-06-01"],
          recommendedTechniques: ["data-lifecycle-test", "boundary-value-analysis"],
        },
        {
          id: "TPC-09-04",
          nameJa: "移行・旧仕様データの扱い",
          focusExamples: [
            "旧仕様で作られたデータが新仕様で正しく解釈されるか",
            "移行データの欠落・重複・文字化けが起きないか",
          ],
          relatedQualityCharacteristicIds: ["QC-08-03"],
          recommendedTechniques: ["data-lifecycle-test", "regression-selection"],
        },
      ],
    },
    {
      id: "TPC-10",
      nameJa: "構成・環境",
      summary: "利用環境や設定値の組み合わせによる差異を確かめる観点。",
      perspectives: [
        {
          id: "TPC-10-01",
          nameJa: "端末・OS・ブラウザの組み合わせ",
          focusExamples: [
            "対象として宣言された環境すべてで主要機能が動作するか",
            "環境固有の表示崩れや操作不能が起きないか",
          ],
          relatedQualityCharacteristicIds: ["QC-08-01", "QC-03-01"],
          recommendedTechniques: ["config-matrix", "pairwise"],
        },
        {
          id: "TPC-10-02",
          nameJa: "画面サイズ・解像度・拡大率",
          focusExamples: [
            "小さい画面幅で要素が重ならず操作できるか",
            "文字拡大時にラベルやボタンが欠けないか",
          ],
          relatedQualityCharacteristicIds: ["QC-04-01", "QC-08-01"],
          recommendedTechniques: ["config-matrix"],
        },
        {
          id: "TPC-10-03",
          nameJa: "ネットワーク条件",
          focusExamples: [
            "低速・不安定な回線で操作が完了できるか",
            "オフライン時の表示と再接続後の復帰が適切か",
          ],
          relatedQualityCharacteristicIds: ["QC-02-01", "QC-05-03"],
          recommendedTechniques: ["config-matrix", "fault-injection"],
        },
        {
          id: "TPC-10-04",
          nameJa: "設定値・パラメータの組み合わせ",
          focusExamples: [
            "設定値の組み合わせで矛盾する挙動が起きないか",
            "既定値のまま利用した場合に問題が生じないか",
          ],
          relatedQualityCharacteristicIds: ["QC-08-01", "QC-07-04"],
          recommendedTechniques: ["config-matrix", "pairwise"],
        },
      ],
    },
    {
      id: "TPC-11",
      nameJa: "障害・縮退・回復",
      summary: "障害発生時の振る舞い、縮退運転、復旧手順を確かめる観点。",
      perspectives: [
        {
          id: "TPC-11-01",
          nameJa: "外部システム障害",
          focusExamples: [
            "応答なし・エラー応答・不正応答のそれぞれで適切に処理されるか",
            "障害を利用者へ伝えるメッセージが分かりやすいか",
          ],
          relatedQualityCharacteristicIds: ["QC-03-02", "QC-05-03"],
          recommendedTechniques: ["fault-injection"],
        },
        {
          id: "TPC-11-02",
          nameJa: "処理中断",
          focusExamples: [
            "通信断やプロセス停止の後でデータ整合が保たれるか",
            "中途半端な状態が残った場合に検知・修復できるか",
          ],
          relatedQualityCharacteristicIds: ["QC-05-03", "QC-06-02"],
          recommendedTechniques: ["fault-injection"],
        },
        {
          id: "TPC-11-03",
          nameJa: "リトライと冪等性",
          focusExamples: [
            "再送で二重登録・二重課金が起きないか",
            "リトライ回数・間隔が仕様どおりか",
          ],
          relatedQualityCharacteristicIds: ["QC-05-03", "QC-01-02"],
          recommendedTechniques: ["fault-injection", "concurrency-test"],
        },
        {
          id: "TPC-11-04",
          nameJa: "縮退運転・復旧手順",
          focusExamples: [
            "一部機能停止時にも業務継続に必要な機能が使えるか",
            "手順書どおりの操作で想定時間内に復旧できるか",
          ],
          relatedQualityCharacteristicIds: ["QC-05-04", "QC-05-02"],
          recommendedTechniques: ["fault-injection", "checklist-based"],
        },
      ],
    },
    {
      id: "TPC-12",
      nameJa: "長時間稼働",
      summary: "長期間の連続稼働で徐々に現れる劣化や累積の問題を確かめる観点。",
      perspectives: [
        {
          id: "TPC-12-01",
          nameJa: "資源の単調増加",
          focusExamples: [
            "メモリ・ディスク使用量が時間とともに増え続けないか",
            "コネクションやファイルハンドルが解放されるか",
          ],
          relatedQualityCharacteristicIds: ["QC-02-02"],
          recommendedTechniques: ["long-run-test"],
        },
        {
          id: "TPC-12-02",
          nameJa: "累積データ量に伴う性能劣化",
          focusExamples: [
            "データが積み上がった状態でも応答時間が許容範囲か",
            "一覧・検索・集計が実運用相当のデータ量で完了するか",
          ],
          relatedQualityCharacteristicIds: ["QC-02-01", "QC-02-03"],
          recommendedTechniques: ["long-run-test", "load-test"],
        },
        {
          id: "TPC-12-03",
          nameJa: "日跨ぎ・週跨ぎの定期処理",
          focusExamples: [
            "日付が変わっても定期処理が欠落・重複しないか",
            "連続稼働中の定期処理が前回結果に影響されないか",
          ],
          relatedQualityCharacteristicIds: ["QC-05-01"],
          recommendedTechniques: ["long-run-test", "timing-order-test"],
        },
      ],
    },
    {
      id: "TPC-13",
      nameJa: "性能・負荷",
      summary: "応答時間・処理量・限界超過時の振る舞いを確かめる観点。",
      perspectives: [
        {
          id: "TPC-13-01",
          nameJa: "応答時間",
          focusExamples: [
            "代表操作の応答時間が目標値を満たすか",
            "遅い操作について進行状況が利用者に示されるか",
          ],
          relatedQualityCharacteristicIds: ["QC-02-01"],
          recommendedTechniques: ["load-test"],
        },
        {
          id: "TPC-13-02",
          nameJa: "スループット・同時利用者数",
          focusExamples: [
            "想定同時利用者数で処理量が目標を満たすか",
            "同時実行数を上げたときの劣化の仕方が緩やかか",
          ],
          relatedQualityCharacteristicIds: ["QC-02-03"],
          recommendedTechniques: ["load-test", "concurrency-test"],
        },
        {
          id: "TPC-13-03",
          nameJa: "ピーク負荷と限界超過",
          focusExamples: [
            "ピーク時想定の負荷で業務が完遂できるか",
            "限界を超えた場合に安全側で縮退・拒否できるか",
          ],
          relatedQualityCharacteristicIds: ["QC-02-03", "QC-05-03"],
          recommendedTechniques: ["load-test", "fault-injection"],
        },
      ],
    },
    {
      id: "TPC-14",
      nameJa: "運用・保守",
      summary: "稼働後の運用作業や障害調査に必要な仕組みを確かめる観点。",
      perspectives: [
        {
          id: "TPC-14-01",
          nameJa: "ログ・監査証跡",
          focusExamples: [
            "誰が何をしたかを追跡できる形でログが残るか",
            "調査に必要な情報が欠けていないか",
          ],
          relatedQualityCharacteristicIds: ["QC-07-03", "QC-06-04"],
          recommendedTechniques: ["checklist-based"],
        },
        {
          id: "TPC-14-02",
          nameJa: "監視・通知",
          focusExamples: [
            "異常を検知して通知が到達するか",
            "通知の内容から一次対応の判断ができるか",
          ],
          relatedQualityCharacteristicIds: ["QC-05-02", "QC-07-03"],
          recommendedTechniques: ["checklist-based", "fault-injection"],
        },
        {
          id: "TPC-14-03",
          nameJa: "バッチ・定期処理",
          focusExamples: [
            "実行・再実行の手順が定義され、そのとおり動くか",
            "失敗時の扱い（中断・スキップ・リカバリ）が明確か",
          ],
          relatedQualityCharacteristicIds: ["QC-05-04"],
          recommendedTechniques: ["checklist-based", "timing-order-test"],
        },
        {
          id: "TPC-14-04",
          nameJa: "バックアップ・リストア",
          focusExamples: [
            "取得したバックアップから実際に復元できるか",
            "復元後のデータ範囲と欠損時間が想定どおりか",
          ],
          relatedQualityCharacteristicIds: ["QC-05-04"],
          recommendedTechniques: ["checklist-based", "data-lifecycle-test"],
        },
      ],
    },
    {
      id: "TPC-15",
      nameJa: "セキュリティ",
      summary: "認証・認可・入力検証・機密情報の扱いを確かめる観点。",
      perspectives: [
        {
          id: "TPC-15-01",
          nameJa: "認証",
          focusExamples: [
            "ログイン失敗時のロックアウトとパスワード規則が仕様どおりか",
            "セッションの有効期限と再認証が機能するか",
          ],
          relatedQualityCharacteristicIds: ["QC-06-05"],
          recommendedTechniques: ["checklist-based", "boundary-value-analysis"],
        },
        {
          id: "TPC-15-02",
          nameJa: "認可",
          focusExamples: [
            "権限別に可視範囲・操作可能範囲が制限されるか",
            "直接URLアクセスや他人データの参照が拒否されるか",
          ],
          relatedQualityCharacteristicIds: ["QC-06-01"],
          recommendedTechniques: ["checklist-based", "decision-table"],
        },
        {
          id: "TPC-15-03",
          nameJa: "入力検証",
          focusExamples: [
            "不正文字列の混入が拒否またはエスケープされるか",
            "サーバ側でも検証が行われるか",
          ],
          relatedQualityCharacteristicIds: ["QC-06-02"],
          recommendedTechniques: ["checklist-based", "error-guessing"],
        },
        {
          id: "TPC-15-04",
          nameJa: "機密情報の扱い",
          focusExamples: [
            "通信・保存時に適切に保護されているか",
            "ログや画面表示でマスキングされるか",
          ],
          relatedQualityCharacteristicIds: ["QC-06-01"],
          recommendedTechniques: ["checklist-based"],
        },
      ],
    },
    {
      id: "TPC-16",
      nameJa: "ユーザビリティ・アクセシビリティ",
      summary: "利用者が迷わず操作でき、支援技術でも利用できるかを確かめる観点。",
      perspectives: [
        {
          id: "TPC-16-01",
          nameJa: "操作導線とエラーメッセージの理解性",
          focusExamples: [
            "初見の利用者が次に何をすべきか分かるか",
            "エラーメッセージから原因と対処が読み取れるか",
          ],
          relatedQualityCharacteristicIds: ["QC-04-01", "QC-04-02"],
          recommendedTechniques: ["checklist-based", "exploratory"],
        },
        {
          id: "TPC-16-02",
          nameJa: "キーボード操作・フォーカス順序",
          focusExamples: [
            "マウスを使わずに主要操作を完了できるか",
            "フォーカス順序が画面の意味的な順序と一致するか",
          ],
          relatedQualityCharacteristicIds: ["QC-04-03"],
          recommendedTechniques: ["checklist-based", "exploratory"],
        },
        {
          id: "TPC-16-03",
          nameJa: "支援技術での利用",
          focusExamples: [
            "読み上げで画面の意味が伝わるか",
            "画像の代替テキストと文字色のコントラストが確保されているか",
          ],
          relatedQualityCharacteristicIds: ["QC-04-01"],
          recommendedTechniques: ["checklist-based"],
        },
      ],
    },
    {
      id: "TPC-17",
      nameJa: "ローカライズ",
      summary: "言語・書式・文字コードの違いによる問題を確かめる観点。",
      perspectives: [
        {
          id: "TPC-17-01",
          nameJa: "言語・文言",
          focusExamples: [
            "未翻訳の文言が残っていないか",
            "翻訳による文字数増加でレイアウトが崩れないか",
          ],
          relatedQualityCharacteristicIds: ["QC-04-01", "QC-08-01"],
          recommendedTechniques: ["config-matrix", "checklist-based"],
        },
        {
          id: "TPC-17-02",
          nameJa: "日時・数値・通貨の書式",
          focusExamples: [
            "地域ごとの書式で表示・入力できるか",
            "タイムゾーン差で日付がずれないか",
          ],
          relatedQualityCharacteristicIds: ["QC-01-02", "QC-08-01"],
          recommendedTechniques: ["config-matrix", "boundary-value-analysis"],
        },
        {
          id: "TPC-17-03",
          nameJa: "文字コード・多言語文字",
          focusExamples: [
            "絵文字・サロゲートペア・結合文字が保存・表示できるか",
            "文字数カウントが仕様どおりの単位で行われるか",
          ],
          relatedQualityCharacteristicIds: ["QC-06-02", "QC-08-01"],
          recommendedTechniques: ["boundary-value-analysis", "equivalence-partitioning"],
        },
      ],
    },
    {
      id: "TPC-18",
      nameJa: "リグレッション",
      summary: "変更によって既存の保証範囲が壊れていないかを確かめる観点。",
      perspectives: [
        {
          id: "TPC-18-01",
          nameJa: "変更影響範囲",
          focusExamples: [
            "変更差分から影響を受ける既存機能が特定されているか",
            "影響範囲の既存機能が変更後も動作するか",
          ],
          relatedQualityCharacteristicIds: ["QC-07-04"],
          recommendedTechniques: ["regression-selection"],
        },
        {
          id: "TPC-18-02",
          nameJa: "既存保証範囲の再確認",
          focusExamples: [
            "過去に発生した不具合が再発していないか",
            "従来の主要業務シナリオが引き続き完遂できるか",
          ],
          relatedQualityCharacteristicIds: ["QC-05-01", "QC-07-04"],
          recommendedTechniques: ["regression-selection", "scenario-based"],
        },
        {
          id: "TPC-18-03",
          nameJa: "共通部品・共有データの利用箇所",
          focusExamples: [
            "変更した共通部品を使う全画面・全機能が確認されているか",
            "共有マスタ・共有設定の変更が想定外の箇所へ波及しないか",
          ],
          relatedQualityCharacteristicIds: ["QC-07-01", "QC-07-02"],
          recommendedTechniques: ["regression-selection", "checklist-based"],
        },
      ],
    },
  ],
};

// 技法ID → 既に提供しているテスト設計ツール名の対応。
// Phase 3（generate_test_cases）追加時にここへ追記する。
export const testTechniqueToolMapping: { techniqueId: TestTechniqueId; toolName: string }[] = [
  { techniqueId: "equivalence-partitioning", toolName: "design_equivalence_partitioning" },
  { techniqueId: "boundary-value-analysis", toolName: "design_boundary_values" },
  { techniqueId: "decision-table", toolName: "design_decision_table" },
  { techniqueId: "state-transition", toolName: "generate_test_cases" },
  { techniqueId: "pairwise", toolName: "design_pairwise" },
  { techniqueId: "use-case-based", toolName: "design_scenario_flows" },
  { techniqueId: "scenario-based", toolName: "design_scenario_flows" },
  { techniqueId: "error-guessing", toolName: "generate_exploratory_charters" },
  { techniqueId: "exploratory", toolName: "generate_exploratory_charters" },
  { techniqueId: "checklist-based", toolName: "generate_exploratory_charters" },
  { techniqueId: "load-test", toolName: "generate_test_cases" },
  { techniqueId: "long-run-test", toolName: "generate_test_cases" },
  { techniqueId: "fault-injection", toolName: "generate_test_cases" },
  { techniqueId: "concurrency-test", toolName: "generate_test_cases" },
  { techniqueId: "timing-order-test", toolName: "analyze_data_flow_timing" },
  { techniqueId: "data-lifecycle-test", toolName: "generate_test_cases" },
  { techniqueId: "config-matrix", toolName: "generate_test_cases" },
  { techniqueId: "regression-selection", toolName: "generate_test_cases" },
];
