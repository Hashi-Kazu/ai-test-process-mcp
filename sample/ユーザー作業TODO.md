# ユーザー作業TODO（Claudeが代行できない作業の一覧）

*過去コンテスト成果物との品質比較調査（2026-07-29）の結果として残った、**人間側でしか実行できない作業**をまとめたもの。Claude側の作業はすべて GitHub Issue #69 配下に登録済みで、本書はそれと重複しない。*

---

## 0 いまの状態

| 項目 | 状態 |
| --- | --- |
| 調査 | 完了。`docs/ai/capability-gap-analysis.md` と `sample/2026/品質比較レポート_再レビュー.md` |
| Issue登録 | 完了。25件（トラッキング #69 ＋ 子24件） |
| コード変更 | **まだゼロ**。1件も着手していない |
| 次の一手 | Claudeに「Phase A やって」と指示すれば #70 / #71 / #72 に着手する |

**Issue対応は本書の作業を待たずに進められる。** 下記1の作業は #75 の仕様策定より前に済んでいると手戻りが減る、という関係にある。

---

## 1 最優先: ASTER公式資料2点の取得

### なぜ必要か

登録済みの25 Issueは、すべて**過去チームの発表資料10本からClaudeが逆算した推測**の上に立っている。下記2ファイルがあれば、その土台が**公式仕様**に置き換わる。

### 取得するもの

| URL | 中身 | これで何が変わるか |
| --- | --- | --- |
| `https://www.aster.or.jp/testcontest/doc/2025_tdc_guidance.pdf` | 成果物0〜6の定義（成果物0=テスト開発プロセス全体像／1=テスト要求分析／2=テストアーキテクチャ設計／3=テスト詳細設計 …／6=プレゼン資料） | **#75（テストアーキテクチャ層）の仕様を、推測ではなく公式定義から決められる。** コンテストは「成果物2 = テストアーキテクチャ設計成果物（テスト全体像、最大10ページ）」を必須提出物として定義しており、Claudeが「同等ラインの分水嶺」とした判断がこれで裏付け／修正される |
| `https://www.aster.or.jp/testcontest/open.html` | OPENクラス テスト設計コンテスト審査基準 | 「良いレベルになったか」を機械判定する基盤。審査基準のresource化＋3成果物一式のセルフレビューtoolを新規Issueとして起こせる。**現状これを判定する手段は人間が資料を読み比べる方法しかなく、再現性がない** |

### 置き場所

```
sample/reference/2025_tdc_guidance.pdf
sample/reference/open_審査基準.html   （またはPDF印刷したもの）
```

`sample/reference/` は新規ディレクトリでよい。置いたらClaudeに「資料置いた」と伝えれば、内容を読んで該当Issueを更新する。

### なぜClaudeが取得できないのか

この実行環境のegressポリシーで `www.aster.or.jp:443` への接続が拒否される。

```
curl: (56) CONNECT tunnel failed, response 403
proxy: {"kind":"connect_rejected","host":"www.aster.or.jp:443",
        "detail":"gateway answered 403 to CONNECT (policy denial)"}
```

プロキシの運用規約上、迂回・再試行は禁止されている。上記URLはすべて検索インデックス経由で実在を確認したもので、**Claudeはどのファイルも開いていない**。

---

## 2 任意: 展示資料の取得（比較精度が上がる）

決勝戦では、プレゼン資料とは別に**テスト設計成果物の内容をA3横・最大8ページにまとめた展示資料**の提出が義務付けられている。プレゼンが「工夫点の紹介」なのに対し、展示資料は「作成過程の記述」であり、成果物本体に一段近い。

現在の比較は発表資料（20〜38ページ）に対して行っているため、「プレゼンに現れない詳細は評価できない」という限界がある。展示資料が入手できれば、35項目マトリクスのうち評価不能としていた部分を埋め直せる。

### 実在確認済み

| URL | 対象 |
| --- | --- |
| `https://www.aster.or.jp/testcontest/doc/2025/exhibition/exhibition_open_futoufukutu_final.pdf` | '25 OPEN / 不撓不屈の民 ← **手元の5チームの1つ** |
| `https://www.aster.or.jp/testcontest/doc/2023/appeal_sheet_11hippopotamus_final.pdf` | '23 OPEN / 11ヒポポタマス（アピールシート） |
| `https://www.aster.or.jp/testcontest/doc/2024/exhibition_IKKA_final.pdf` | '24 / IKKA（U-30と推定） |
| `https://www.aster.or.jp/testcontest/doc/2024/exhibition_kitsutsuki_final.pdf` | '24 / きつつき1.0（同上） |

### 推定URL（命名規則からの導出。実在は未確認）

'25 OPEN — `doc/2025/exhibition/exhibition_open_<team>_final.pdf`

```
.../exhibition_open_kangaeruasika_final.pdf
.../exhibition_open_mix_vegetable_final.pdf
.../exhibition_open_nekosauna_final.pdf
.../exhibition_open_team_yama_final.pdf
```

'24 — `doc/2024/exhibition_<team>_final.pdf`

```
.../exhibition_AVATES_final.pdf
```

'23 — `doc/2023/exhibition_<team>_final.pdf`

```
.../exhibition_11hippopotamus_final.pdf
.../exhibition_tamago_final.pdf
.../exhibition_ashika_final.pdf
.../exhibition_appli_final.pdf
```

`doc/2023/` `doc/2024/` は年直下フラット、`doc/2025/` から `presentation/` `exhibition/` のサブディレクトリ構成に変わっている。'23・'24に展示資料が存在するかどうか自体、未確認。

### 予選版プレゼン（審査員指摘の代理データになる）

決勝版とは別に予選版が存在する。**予選版と決勝版の差分は「審査員が何を指摘したか」の代理データ**であり、審査基準が取れない場合の次善の材料になる。

```
https://www.aster.or.jp/testcontest/doc/2025/presentation/presentation_nekosauna.pdf
https://www.aster.or.jp/testcontest/doc/2025/presentation/presentation_kangaeruasika_beta.pdf
https://www.aster.or.jp/testcontest/doc/2025/presentation/presentation_team_futoufukutu.pdf
```

置き場所: `sample/2025/` に `exhibition_*` / `presentation_*_yosen.pdf` 等の名前で追加。

---

## 3 任意: egressポリシーで aster.or.jp を許可する

許可設定を行えば、上記1・2の全URLについてClaude側で生死確認・ダウンロード・`sample/` への配置・35項目マトリクスの再評価まで一括で実行できる。**1と2を手作業で集めるより、こちらのほうが早い可能性が高い。**

### 設定手順

専用の設定ページは存在せず、環境セレクタから設定する。

1. [claude.ai/code](https://claude.ai/code) を開く
2. メッセージ入力欄の**すぐ上の行**にある雲アイコン（現在の環境名が表示されている）を選択
3. 使用中の環境（既定は **Default**）にホバーし、右側に出る**歯車アイコン**を選択
4. ダイアログの **Network access** を変更（下記のどちらか）
5. 保存

### 案A: Full（推奨・手間ゼロ）

**Network access** を `Full` にするだけ。全ドメインが通る。

- 追加設定が不要で、後述の「既定リスト同梱チェック忘れ」事故が構造的に起きない
- セキュリティプロキシ（不正リクエスト防御・レート制限・コンテンツフィルタ・DNS監査ログ）は Full でも有効なので、素の全開放ではない

### 案B: Custom（範囲を絞る）

**Network access** を `Custom` にし、**Allowed domains** 欄へ1行1ドメインで入力する。

```text
aster.or.jp
*.aster.or.jp
```

**「Also include default list of common package managers」に必ずチェックを入れること。** 外すと列挙したドメインだけしか通らなくなり、`registry.npmjs.org` が落ちて `npm install` / `npm test` が失敗する（本リポジトリは vitest が未インストール状態のため確実に踏む）。

### 共通の注意

- **設定変更は実行中のセッションに反映されない。** 環境設定はセッション開始時に読み込まれるため、変更後に**新しいセッションを開始**する必要がある（resume では反映されない。allowed hosts を変更すると環境キャッシュの再構築も走る）
- **GitHub 操作は影響を受けない。** GitHub は独立した専用プロキシを通るため、`Custom` に切り替えても Issue 操作・push は動作する。MCP コネクタの通信も allowlist の対象外
- ネットワークアクセスレベルは 4 種（`None` / `Trusted`（既定・既定allowlistのみ） / `Full` / `Custom`）
- Team / Enterprise で組織共通にする場合は、Owner / Admin が [claude.ai/admin-settings](https://claude.ai/admin-settings) の **Cloud environments** ページで組織共有環境を作成・編集する。ただし**全メンバーの環境へ一括適用できる組織レベルの allowlist は存在しない**（環境ごとに個別のリスト）

### Full を選ぶ場合に知っておくべきこと

唯一の実質リスクは**プロンプトインジェクション経由の情報持ち出し**である。本ワークフローでは Claude が web ページを取得し、GitHub の Issue 本文・PR コメント・CI ログを読むため、外部由来テキストに悪意ある指示が混ざる経路が実在する。Full では送信先が制限されない。

ただし本リポジトリでは影響は小さいと判断している。

- ソースは OSS（LICENSE あり・npm 公開済み）で、持ち出されて困る秘密を含まない
- GitHub トークンは専用プロキシ側にあり VM 内に存在しない。push もセッションの作業ブランチ限定
- Jira の認証情報は GitHub Actions の secrets 側にあり、セッションからは参照できない

参照: [Configure cloud environments](https://code.claude.com/docs/en/cloud-environments)

---

## 4 判断が必要な事項（Claudeが決めるべきでないもの）

| # | 判断事項 | 補足 |
| --- | --- | --- |
| 1 | `sample/2026/` の既存3成果物を、再生成時に**残すか置き換えるか** | #73 で 2025年テストベース基準に作り直す方針とした。既存3点は「改修前の証跡」として価値があるので残す選択もある |
| 2 | `AGENTS.md` に設計規約を追記するか | 追記案: 「新しい決定的検査を追加するときは、『宣言』と『実体』の照合を必ずセットで実装する。宣言されたIDやラベルの一致だけを見る検査は追加しない」。#70 の再発防止であり、検査を増やすほどゲーミング可能な指標も増えるという構造的リスクへの対策 |
| 3 | テストベース改訂履歴の追跡調査を行うか | ミックスベジタブル（2025）の指摘2件が2026年版テストベースで実際に修正されていたことが判明した。**改訂履歴を追えば「実行委員会が修正するに値すると判断した指摘」＝客観的な正解が特定できる。** 2023→2024、2024→2025 でも同じことができる可能性がある。審査基準が入手できない場合の代替評価軸として有効 |

---

## 5 Issue着手順（Claude側の作業。参考）

依存関係があるため、この順序を崩さないこと。25件を並行で回すことは想定していない。

```
① #70 #71 #72   Phase A・検証の穴（外部依存なし・いつでも着手可）
       ↓
② #73           2025テストベースで再生成 ＋ 2026を差分再展開
       ↓         ここで初めて「いまのMCPの実力」が正しく測れる
③ #92           データフロー・タイミング（60秒の伝播遅延の見落としを機械化で塞ぐ）
       ↓
④ #74           シナリオ設計エンジン（本課題の本丸）
       ↓
⑤ #75 #83       テストアーキテクチャ層 ← 本書「1」の資料が揃っていることが望ましい
       ↓
⑥ #76           多軸マトリクス監査（最も勝ちやすい一手）
       ↓
   再度サンプル再生成 ＝ 同等ライン到達の判定点（充足21〜22/35）
       ↓
⑦ 残り（#77 #78 #79 #80 #81 #82 #84〜#91 #93 #94）
```

**先にPhase B〜Fへ手を付けないこと。** #75 は本書1の資料待ち、#77 / #80 は #78（因子分解フレーム）が無いと効果が限定的。

---

## 6 Claudeへの指示の出し方

| やりたいこと | 言い方 |
| --- | --- |
| Phase A に着手 | 「Phase A やって」 |
| 特定Issueに着手 | 「#74 やって」（非自明なものは自動で `planner` を先に起動する） |
| 資料を置いたので反映 | 「資料置いた」 |
| 審査基準のIssue化 | 「審査基準のresource化をIssueにして」 |
| 改訂履歴の追跡調査 | 「テストベースの改訂履歴を調べて」 |

---

## 参照

- `docs/ai/capability-gap-analysis.md` — 35項目の充足マトリクス、工程別シミュレーション、Phase A〜F ロードマップ
- `sample/2026/品質比較レポート_再レビュー.md` — 既存 `品質比較レポート.md` の主張の実データ検証と訂正一覧
- GitHub Issue #69 — トラッキング（子24件のチェックリスト付き）
