# non_contest_testbase

このディレクトリは、**テスト設計コンテスト（ASTER主催）とは無関係な、実務由来の日本語公開資料**を
テストベースのサンプルとして置く場所。コンテスト資料（公式資料・提出物）は
すべて `sample/contest_testbase/` に集約しており、本ディレクトリとは明確に区別する。

用途: このMCPサーバー（テストベースレビュー・テスト計画ドラフト生成・テスト設計技法適用など）の
実力を、コンテストのお題以外の題材でも手軽に測定できるようにするための入力資料置き場。

## 方針

- 資料は **原本（xlsx等）のまま** 保存する。Markdownへの書き起こしは表記揺れ・転記ミスにより
  資料間の整合性を損なうリスクがあるため行わない。
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
