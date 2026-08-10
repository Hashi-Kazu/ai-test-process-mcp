# format_reference（形式カバレッジ確認用リファレンス原本）

このディレクトリは、`sample/non_contest_testbase/` 直下の宛名番号テストベース一式（Excel 2件）とは
**別枠**の資料置き場である。目的は `docs/ai/testbase-ingestion.md` の4章（Word）・6章（Markdown）・
7章（JSON）の変換規約が、実在する公開資料に対して達成できるか／できないかを、実測値付きで記録すること。
決定的検査の実行・形式間一致度の再測定は行わない（GitHub Issue #174 の続きとして別Issueに委ねる）。

## 資料選定の根拠

- **Word**: 既存の宛名番号テストベース Excel 2件（`2026-08_digital-agency_atenabango-kanri_item-definition.xlsx`
  / `2026-08_digital-agency_atenabango-fuban-api_spec.xlsx`）と同一ソース、デジタル庁
  「地方公共団体情報システム共通機能標準仕様書」の**本編（第2.1版）**を採る。同一ソース内で形式（Excel/Word）
  違いのカバレッジを確認できるため。加えて、日本の公的文書では変更履歴が Word の `w:ins`/`w:del` ではなく
  **別文書（新旧対照表）**として提供される実務慣行があり、その実体を確認するために新旧対照表 docx も
  併せて置く。
- **Markdown / JSON**: 同一ソース（地方公共団体情報システム共通機能標準仕様書）には Markdown/JSON 形式の
  公開物が存在しない。そのため形式ごとに別ソースを採用する。ただし宛名番号テストベース一式（Excel）とは
  ディレクトリを `format_reference/` 配下へ完全に物理分離しており、`README.md`（親）の「同一ソース内で
  まとめる」方針は**宛名番号テストベース一式（Excel 2件）にのみ適用**する。本ディレクトリの資料同士は
  項目ID体系・コード値の対応関係を要求しない、形式カバレッジ確認専用の資料である。
  - Markdown: デジタル庁「政府相互運用性フレームワーク（GIF）2.3」の実装データモデル（防災）
    パッケージに同梱される Markdown（mermaid クラス図記法）一式を採る。実務で流通する Markdown の
    代表例として、見出し・パイプ表がほぼ使われない実データを確認する目的。
  - JSON: 気象庁の防災情報エリアマスタ（`area.json`）を採る。実務API配信JSONの代表例として、
    ID がフィールド値ではなくオブジェクトキーとして表現される実データを確認する目的。

## ライセンス

- GIF-2.3 一式: CC0 1.0 Universal（同梱 `markdown/2026-08_digital-agency_gif-2.3/license` を参照）。
- デジタル庁・気象庁のサイト資料: 各サイトの政府標準利用規約（CC BY 4.0 相当）に準拠。原文の逐語利用は
  本検証目的の一時利用に限る。

## 収録資料・出典・取得日

取得日: 2026-08-10。

| 配置パス | 出典URL | サイズ | sha256 |
| --- | --- | --- | --- |
| `word/2026-08_digital-agency_common-feature-spec_v2.1.docx` | https://www.digital.go.jp/assets/contents/node/basic_page/field_ref_resources/4d056a04-6eba-4109-9850-a786d3e71971/5f453dd1/20230929_policies_local_governments_common-feature-specification_outline_35.docx | 1,490,299 bytes | `4d05da6d8514a86ff056d8a8699fd3b3d3afc1a8ae419d50e0b96a7f08315ecc` |
| `word/2026-08_digital-agency_common-feature-spec_v2.1_shinkyu-taishohyo.docx` | https://www.digital.go.jp/assets/contents/node/basic_page/field_ref_resources/4d056a04-6eba-4109-9850-a786d3e71971/363ecc62/20230929_policies_local_governments_common-feature-specification_outline_36.docx | 55,615 bytes | `b07cbb07dc0179bbc3ca57669b890b39c9d8c8dac5fb7c32e6515095ada6f4b8` |
| `markdown/2026-08_digital-agency_gif-2.3/`（license・455章README・mermaid 25件のみ） | https://www.digital.go.jp/assets/contents/node/basic_page/field_ref_resources/4e06cf86-4403-47a8-bd67-52f8ea5ec66b/8627b40a/GIF-2.3.zip | ZIP本体22,246,079 bytes（**未コミット**。抽出物のみコミット） | ZIP: `c157ffba10414ff7f618778bf35d7ec005a02aded9de7418368fc7057c2d4176` |
| `json/2026-08_jma_bosai-area.json` | https://www.jma.go.jp/bosai/common/const/area.json | 262,108 bytes | `b2716ef1f338f66a7080c2498f0768e3941eebbd6880af70917f67b16ec09992` |

GIF-2.3.zip は `.work/` 配下へ一時展開し、ZIP本体はコミットせず次のエントリのみを ZIP 内の相対パス構造を
保って `markdown/2026-08_digital-agency_gif-2.3/` 配下へ配置した。原本は一切改変していない（BOM・改行
コード・ファイル名の日本語を含めそのまま）。

- `GIF-2.3/license` → `markdown/2026-08_digital-agency_gif-2.3/license`（7,047 bytes、
  sha256 `6d489af6292662d9e36d34ce49423784984a5f6e41d7b58f49b01264df59fa03`）
- `GIF-2.3/455_実装データモデル_防災/README.md` → `.../455_実装データモデル_防災/README.md`
- `GIF-2.3/455_実装データモデル_防災/mermaid/*.md`（25ファイル）→ `.../455_実装データモデル_防災/mermaid/`

## 規約適用確認の記録

### Word（`docs/ai/testbase-ingestion.md` 4章）

参照実装 `node scripts/extract-testbase-docx.mjs <docx> --out .work/ingestion/<name>.txt` を実行し、また
`scripts/lib/ooxml.mjs` の `readOoxmlEntries` で `word/document.xml` と `word/styles.xml` を直接読んで
実測した。

**`2026-08_digital-agency_common-feature-spec_v2.1.docx`（本編）**

- `word/document.xml` 中の `w:pStyle w:val` は次の9種類が使われている（すべて**数値/短縮ID**であり
  `Heading<n>` / `見出し<n>` のような文字列ではない）: `1`(×3), `11`(×3), `21`(×14), `23`(×14),
  `31`(×32), `33`(×33), `af5`(×1), `afff9`(×22), `ad`(×96)。
  `word/styles.xml` でこれらの `styleId` → `w:name` を解決すると、`1`→`heading 1`、`21`→`heading 2`、
  `31`→`heading 3`、`11`→`toc 1`、`23`→`toc 2`、`33`→`toc 3`、`af5`→`TOC Heading`、`afff9`→`caption`、
  `ad`→`List Paragraph` である。つまり原本には Heading 1〜3 の見出しパラグラフが **3+14+32=49件**
  実在する。
- **見出しの`#`対応: 達成。** `scripts/lib/ooxml.mjs` の `parseWordDocument()` は、`w:pStyle` の
  `w:val` 文字列自体（例 `Heading2`）で見出し判定できない場合、`word/styles.xml` の
  `w:styleId` → `w:name`（例 `21`→`heading 2`）を解決したうえで同じ判定を再試行する
  （2段階判定、`GitHub Issue #194` で実装）。本原本のような「styleId が数値の Word 文書」でも
  見出しが正しく出力され、`parseWordDocument()` 出力の `#` 始まり行数を実測すると **49件**
  （heading1=3 / heading2=14 / heading3=32）であり、原本の見出しパラグラフ数と一致する。
- **目次の除去: 未達。** 原本には TOC の複合フィールド（`w:fldChar` begin/separate/end、
  `w:instrText` に `TOC \o "1-3" \h \z \u` を含む）が1件あり、begin/end の `w:fldChar` は104個ずつ
  ある（TOC全体を1つの複合フィールドで囲んでいるのではなく、目次内の各項目行が独自の
  ハイパーリンク/PAGEREF フィールドを持つ構造）。`extractParagraphText()` の
  「`w:fldChar` begin〜end をひとかたまりとして除去し、区間内に `TOC` を含む `w:instrText` があれば
  丸ごと除去する」実装では、TOC の各行に対応する begin〜end 区間には `TOC` という `w:instrText` が
  含まれないため対象外となり、目次由来のテキストが除去されない。実測: `parseWordDocument()` 出力を
  `^\d+(\.\d+)*\..+\d+$`（見出し番号＋タイトル＋末尾ページ番号）で数えると **48行**が目次由来として
  残存する（例: `1.1.標準化法における位置づけ1`）。規約・参照実装の修正は本Issueでは行わない
  （GitHub Issue #168 へ）。
- **変更履歴の反映: 該当なし。** 原本に `w:ins`/`w:del` は1件も無い（実測: いずれも0件）。
- **表構造の保持: 達成。** `w:tbl` は6件あり、`parseWordDocument()` 出力のパイプ表行数は92行。
  行方向・列方向のセル欠落は目視確認で見られない。

`parseWordDocument()` の出力実測値（見出し行の直前に script が付ける `# <basename>` の1行は除く、
本文 `body` のみ）:

- 文字数: 33,871字
- 行数: 1,251行
- `#`始まり行数: 49
- パイプ表行数: 92
- 目次由来行数（`^\d+(\.\d+)*\..+\d+$`）: 48

**`2026-08_digital-agency_common-feature-spec_v2.1_shinkyu-taishohyo.docx`（新旧対照表）**

- `word/pStyle` は `a3`（`w:name`=`header`、ヘッダー用）が1件のみで、見出しスタイルは使われていない。
  「日本の公的docxでは変更履歴が`w:ins`/`w:del`ではなく別文書（新旧対照表）で表現される」実体が
  ここに現れており、原本自体に `w:ins`/`w:del` は0件（実測）。改定後／現行の2列パイプ表として
  `w:tbl` が1件あり、`parseWordDocument()` 出力のパイプ表行数は2行（ヘッダ行＋データ行）で、
  改定前後の全文が1セルへ収まっている（**表構造の保持: 達成**）。見出しは元から無いため
  「見出しの`#`対応」は評価対象外、目次も存在しないため「目次の除去」も評価対象外。
- `parseWordDocument()` の出力実測値: 文字数 5,797字、行数4行、`#`始まり行数0、パイプ表行数2、
  目次由来行数0。

### Markdown（6章）

変換不要（規約どおり）。取得した Markdown ファイル群（`markdown/2026-08_digital-agency_gif-2.3/`
配下の `.md` 26件。README.md 1件 + `mermaid/*.md` 25件。`license` は拡張子なしのため対象外）を実測した。

- 総ファイル数: 26
- 総文字数（UTF-8デコード後の文字列長の合計）: 41,373字
- `#`始まり行数（全ファイル合計）: 0
- パイプ（`|`）始まり行数（全ファイル合計）: 0
- mermaid `classDiagram` を含むファイル数: 25（`mermaid/*.md` 全件。`README.md` は含まない）
- 章節ID相当のファイル名パターン種別数: 2種類
  （`^\d{2}[^\d].*\.md$` 形式＝2桁数字+名称、25ファイル／数字プレフィックスなし＝`README.md`、1ファイル）

判定: **6章「変換不要・原文そのまま」は形式面では達成している**（変換処理自体を行わないため失敗しようが
ない）。ただし実データを投入した場合の所見として、
- `README.md` の1行目は `# 政府相互運用性フレームワーク(GIF) 454 実装データモデル 防災` という
  Markdown見出しで**始まっているが**、ファイル先頭に UTF-8 BOM（`EF BB BF`）が付与されているため、
  `src/tools/reviewTestPlan.ts` の見出し検出正規表現 `^#{1,6}\s+` は行頭が BOM文字（`﻿`）になり
  **一致しない**。原本を改変しない前提のもとでは、このファイル単体を投入すると見出しが0件と判定される
  （IQC-03「見出し0件」を招く実データの実例）。
- `mermaid/*.md` はいずれも `classDiagram` から始まる mermaid コードのみで、Markdown 見出し・パイプ表を
  一切含まない。これらを単独で投入すると同様に IQC-03（見出し0件）が出る可能性が高い。

### JSON（7章）

変換不要（規約どおり）。取得した `json/2026-08_jma_bosai-area.json` を実測した。

- バイト数: 262,108 bytes
- 行数（原本のまま）: 1行（**minify済み**。改行を含まない単一行）
- トップレベルキーと要素数: `centers`=11、`offices`=58、`class10s`=142、`class15s`=375、`class20s`=1805
- `"id"` フィールド出現数: 0
- pretty-print（`JSON.stringify(data, null, 2)`）後の行数: 17,382行、文字数: 352,587字

判定:
- **「IDフィールド値をIDとみなす」規約は本データに適用できない。** 本データは ID を `"id"` のような
  フィールド値としてではなく、`centers`/`offices`/`class10s`/`class15s`/`class20s` 各オブジェクトの
  **キー自体**（例: `"010100"`）として表現している。`"id"` 出現数は実測で0件であり、規約が想定する
  「値として現れる `"id"` 系フィールド」の抽出方式ではこのデータの ID を1件も拾えない。
  `idPatterns` を「オブジェクトキーとして現れる6桁コード」向けに定義し直す必要がある
  （7章の既存の指摘「`idPatterns`は形式ごとに定義し直すこと」と整合する実例）。
- **「minifyされたJSONは避ける」規約について: 本データはminifyされている。** 原本は1行のJSON
  （インデント・改行なし）であり、規約が推奨する pretty-print 形式ではない。pretty-print すると
  17,382行・352,587字（原本の262,108 bytesに対し約1.34倍）になる。

## 未達項目の扱い

Word の「見出しの`#`対応」は GitHub Issue #194（`word/styles.xml` の `w:styleId`→`w:name` 解決）で
解決済み。「目次の除去」は本原本に対して依然未達であることを実測で確認しているが、
`extractParagraphText()` の TOC フィールド除去ロジックの修正は本Issueのスコープ外であり、
本Issueでは行わない（GitHub Issue #168 の担当）。
