# non_contest_testbase

このディレクトリは、**テスト設計コンテスト（ASTER主催）とは無関係な、実務由来の日本語公開資料**を
テストベースのサンプルとして置く場所。コンテスト資料（公式資料・提出物）は
すべて `sample/contest_testbase/` に集約しており、本ディレクトリとは明確に区別する。

用途: このMCPサーバー（テストベースレビュー・テスト計画ドラフト生成・テスト設計技法適用など）を、
コンテストのお題以外の題材へ通しで適用した記録を置く。原本・成果物・変換中間物の置き場所は次のとおり
3者を明確に分ける。

| 種別 | 置き場所 | コミット | 内容 |
| --- | --- | --- | --- |
| 原本 | 本ディレクトリ直下の `*.xlsx` | する | デジタル庁の公開資料をそのまま保存する。移動・改変・Markdownへの書き起こしはしない |
| 成果物 | 本ディレクトリ直下の `00_`〜`18_` の Markdown と `payloads/` | する | 各ツールの payload と出力。`00_` と `09_` 以外はツール出力そのままで手編集しない |
| 変換中間物 | `.work/testbase/atenabango/*.txt` | **しない** | 原本をテキスト化した投入用データ。`.gitignore` の `.work/` により除外される |

再生成の手順・実行コマンド・実測値は `00_成果物生成手順.md` にまとめてある。

## 方針

- 資料は **原本（xlsx等）のまま** 保存する。Markdownへの書き起こしは表記揺れ・転記ミスにより
  資料間の整合性を損なうリスクがあるため行わない。
  投入時のテキスト化は `docs/ai/testbase-ingestion.md` の規約に従い、変換物は `.work/` 配下へ出してコミットしない。
  Markdownへの書き起こしを行わない本方針と、投入前の一時変換は別物である。
- 資料を追加する際は、**同一ソース内**（同じ標準仕様書・同じ機能グループ）でまとめる。
  異なる省庁・異なる制度の資料を混在させると、項目ID体系やコード値の対応関係が資料間で
  食い違い、テストベースとしての一貫性が失われるため避ける。

## 収録資料

出典はいずれもデジタル庁「地方公共団体情報システム共通機能標準仕様書」の
住登外者宛名番号管理機能に関する別紙（同一機能グループ内でのテストベース）。

| ファイル | 出所 | 内容 |
| --- | --- | --- |
| `2026-08_digital-agency_atenabango-kanri_item-definition.xlsx` | https://www.digital.go.jp/assets/contents/node/basic_page/field_ref_resources/4d056a04-6eba-4109-9850-a786d3e71971/d1877523/20230929_policies_local_governments_common-feature-specification_outline_56.xlsx | 項目定義書（住登外者宛名番号管理）。データ項目ID・データ型・桁数・データ出力条件（必須/任意/条件付き必須）・コード一覧等 |
| `2026-08_digital-agency_atenabango-fuban-api_spec.xlsx` | https://www.digital.go.jp/assets/contents/node/basic_page/field_ref_resources/4d056a04-6eba-4109-9850-a786d3e71971/73b57de4/20230929_policies_local_governments_common-feature-specification_outline_74.xlsx | 住登外者宛名番号付番API仕様。API概要・APIシーケンス・リクエスト/レスポンス仕様・HTTPステータスコード別のエラー応答等 |

取得日: 2026-07-31。原文の逐語利用はテストベースとしての検証目的の一時利用に限る。

## 成果物一覧

上記2文書を投入して生成した成果物。手順・実行コマンド・実測値・読み取りの注意点は
`00_成果物生成手順.md` を参照する。

| ファイル | 生成元 |
| --- | --- |
| `00_成果物生成手順.md` | 手書き |
| `01_ID母集団監査_住登外者宛名番号テストベース.md` | `audit_id_population` |
| `02_テスト計画書_初版.md` | `create_test_plan` |
| `03_テスト計画書レビュー結果_初版.md` | `review_test_plan` |
| `04_テスト計画書修正指示_初版.md` | `revise_test_plan` |
| `05_テスト計画書_改訂版.md` | `create_test_plan` |
| `06_テスト計画書レビュー結果_改訂版.md` | `review_test_plan` |
| `07_要件分析結果_住登外者宛名番号テストベース.md` | `analyze_requirements` |
| `08_テストベースレビュー結果_住登外者宛名番号テストベース.md` | `review_test_basis` |
| `09_テストベース仕様齟齬指摘_住登外者宛名番号テストベース.md` | 手書き（`08_` の TB-01〜TB-13 を人手適用） |
| `10_利用状況モデリング結果.md` | `generate_user_story_map` |
| `11_テスト条件抽出結果.md` | `extract_test_conditions` |
| `12_境界値分析結果.md` | `design_boundary_values` |
| `13_同値分割結果.md` | `design_equivalence_partitioning` |
| `14_テストケース生成結果.md` | `generate_test_cases` |
| `15_探索的テストチャーター生成結果.md` | `generate_exploratory_charters` |
| `16_テスト仕様書レビュー結果.md` | `review_test_specification` |
| `17_実行順序分析結果.md` | `analyze_execution_order` |
| `18_データフロー・タイミング分析結果.md` | `analyze_data_flow_timing` |
| `payloads/*.json` | 各ツール呼び出しの入力（テストベース本文は含まない） |

## 形式リファレンス資料（Word / Markdown / JSON）

`format_reference/` は、上記の宛名番号テストベース一式（Excel 2件）とは**別枠**の資料置き場である。
目的は `docs/ai/testbase-ingestion.md` の4章（Word）・6章（Markdown）・7章（JSON）の変換規約が
実在の公開資料へ適用できるかを実測値付きで確認することであり、決定的検査の実行や母集団監査の対象では
ない。

- Word: デジタル庁「地方公共団体情報システム共通機能標準仕様書」本編（第2.1版）と、その新旧対照表。
  上記の宛名番号テストベース一式と**同一ソース**（同標準仕様書）。
- Markdown: デジタル庁「政府相互運用性フレームワーク（GIF）2.3」実装データモデル（防災）の Markdown
  一式（別ソース。CC0 1.0）。
- JSON: 気象庁の防災情報エリアマスタ（`area.json`）（別ソース）。

Markdown・JSON は同一ソース内に該当形式の公開物が存在しないため別ソースを採用しており、
「資料は同一ソース内でまとめる」という上記の方針は**宛名番号テストベース一式（Excel 2件）にのみ**
適用される。出典URL・取得日・sha256・規約適用確認の実測記録は
`format_reference/README.md` を参照する。
