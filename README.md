# ai-test-process-mcp

**JSTQB/ISTQB Generic Test Process を AI で支援する MCP サーバー。**

テスト管理ツールの操作を目的とせず、Generic Test Process の各工程（Test Planning 〜 Test Completion）において、テスト成果物の作成・レビュー・分析を AI で支援することを目的とする。文書構成は JSTQB準拠の15章テンプレートに基づく。

**現在のスコープ（Phase 1〜3: Test Planning + Test Analysis + Test Design）**: テスト計画書（JSTQB準拠15章構成）の日本語ドラフト生成・JSTQB観点でのレビュー・修正支援・質問形式でのコンテキスト収集ガイド、要件分析・テスト条件抽出、境界値分析・同値分割・テストケース生成によるテスト設計技法、および探索的テストのチャーター設計を含む経験ベース技法。
**将来構想**: Test Analysis（要件分析・テスト条件抽出）、Test Design（テストケース生成・テスト仕様書レビュー）を経て、Generic Test Process 全7工程へ段階的に拡張する。詳細は [docs/roadmap.md](./docs/roadmap.md) を参照。

## セットアップ

```bash
npm install
npm run build
```

## 提供する機能

### Tool: `create_test_plan`

プロジェクト情報（`projectName`, `scope` は必須。`objectives`, `risks`, `scheduleConstraints`, `team`, `testItems`, `stakeholders`, `glossary` など多数の任意項目）を入力すると、JSTQB準拠の15章構成に沿った**日本語**Markdown形式のテスト計画書ドラフトを生成する。未入力の項目は `_未記入_`（必須項目は `_未記入（必須）_`）として明示される。テストタイプ説明・インシデントランク等の固定リファレンスは常に出力される。

### Tool: `review_test_plan`

テスト計画書のMarkdown本文を入力すると、JSTQB観点でレビューレポートを返す。二層構成: (1) 構造検査（15章の欠落・必須項目の未記入を決定的に検出）、(2) 意味的レビュー用チェックリスト（呼び出し側のLLMが内容の妥当性を判断するための指示形式）。

### Tool: `revise_test_plan`

既存のテスト計画書Markdownと修正指示（`instructions`、任意の文字列配列）を入力すると、修正結果レポートを返す。二層構成: (1) 機械的修正（欠落章の自動補完、`TBD`/`TODO`/`未定`等の未記入プレースホルダの `_未記入_` への正規化）を適用した修正後計画書、(2) 内容の書き換えを呼び出し側LLMに指示する箇条書き（ユーザー指定の修正指示、および修正後もなお残る必須未記入項目の一覧）。

### Prompt: `test_plan_interview`

質問形式でテスト計画書のコンテキストを収集するためのガイド。テンプレートの必須項目を中心に、ユーザーへ順に質問して回答を集め、`create_test_plan` を呼び出すようアシスタントを誘導する。任意引数 `projectName` を受け取る。

### Tool: `design_boundary_values`

変数の有効範囲（下限・上限・刻み・型）から2値/3値の境界値を決定的に列挙し、有効/無効判定付きのMarkdown表で返す。

### Tool: `design_equivalence_partitioning`

変数ごとの有効/無効同値クラスから代表値ベースのテストケースを決定的に生成し、全クラス被覆チェック付きのMarkdown表で返す。

### Tool: `design_decision_table`

条件項目（原因）とその取り得る水準・無効組合せ（ありえない組合せと理由）・ルール（条件セレクタ→動作）から、全組合せの決定的な列挙 → 無効組合せの除外 → 同一動作列の圧縮（don't care 導出）を行い、条件組合せ被覆・動作未定義組合せ（DTC-06）・食い違う動作の矛盾（DTC-07）・圧縮前後の列数と削減率をMarkdownで返す。圧縮後の各ルールは `DT:` プレフィックスの網羅対象IDとして `generate_test_cases` の `decisionTable` へそのまま渡せる。`analyze_cause_effect` の「デシジョンテーブルへの引き渡し」出力（`DecisionTableSpec` 形式。水準 `["T","F"]` の条件項目・動作項目、制約由来の無効組合せ、圧縮後ルールを含む）をそのまま入力にできる。

### Tool: `design_pairwise`

因子（`factors[]`: `id` / `name` / `levels`）・禁則（`forbiddenCombinations[]`: ありえない組合せと理由）・必ず含めたい既知の重要組合せ（`seedRows[]`）を入力すると、全ての水準ペアの正準順での列挙 → 禁則による到達不能ペアの判定 → ペアを被覆する組合せの決定的な貪欲法での生成、を行い、因子・水準表、禁則表、到達可否表、生成した組合せ表、行別の新規被覆ペア、決定的検査、網羅対象一覧、サマリの8節をMarkdownで返す。乱数・現在時刻を使わないため、同一入力からは常に同一の組合せ表が得られる。生成した各ペアは `PW:<setId>:P<n>` 形式の網羅対象IDとして出力され、そのまま `generate_test_cases` の `pairwise` へ渡すとペア被覆率を決定的にカウントできる。ペア被覆率の分母は「全ペア数 − 禁則により到達不能なペア数 − 探索上限により判定保留となったペア数」であり全ペア数ではない旨を明示する。削減率の分母は、全組合せを厳密列挙できたときは「禁則適用後の有効組合せ数」、列挙上限（`maxEnumerationCombinations`、既定4096）を超えるときは「禁則適用前の全組合せ数」であり、いずれを使ったかを出力に明記する。全組合せ数が安全整数を超える場合は削減率を推測値で出さず「未算出（理由）」と明記する。全ペア数が上限（`maxPairCount`、既定5000）を超える場合や入力に致命的な指摘がある場合は組合せ生成を行わず、算出できたカウントのみを返す。因子・水準は `testcondition://factor/ralph-frame` の因子表（`FHO-04`）からそのまま投入できる。判定区分と対処指針は `testdesign://pairwise/analysis-criteria` を参照する。

### Resource: `testdesign://pairwise/analysis-criteria`

`design_pairwise` の判定区分カタログ（`PWC-01`〜`PWC-12`、自作パラフレーズ）を構造化データ（JSON）として公開する。未宣言の因子ID・水準の参照、因子ID/水準の重複、組合せに寄与しない因子、因子数不足、禁則により到達不能なペア、有効な組合せが存在しない、冗長・到達不能な禁則、seed行の不正、ペア数の上限超過、到達可否の判定保留、ペア被覆率が100%未満、の各区分について重大度・定義・推奨アクションを含む。ペア被覆率・削減率それぞれの分母の定義と、本検査が渡された因子・水準・禁則に対してのみ成立するという限界も注記として持つ。

### Resource: `testplan://template/standard`

テスト計画書テンプレート（JSTQB準拠15章構成）の構造データ（JSON）を公開する。各セクションの見出し・必須フラグ・入力マッピング（`fieldKey`）に加え、固定リファレンス（テストタイプ・カタログ、インシデントランク、判定ステータス、標準メトリクス等）を含む。

### Resource: `jstqb://glossary/core`

JSTQB（ISTQB）用語のパラフレーズ集（テストレベル・テストタイプ・開始基準/終了基準・テスト条件/テスト観点・レビュータイプ等）を構造化データ（JSON）として公開する。

### Resource: `testplan://review/checklist`

テスト計画書の意味的レビュー用チェックリスト（JSTQB観点、用語集への相互参照付き）を構造化データ（JSON）として公開する。

### Tool: `review_test_basis`

テストベース（要件・仕様）のMarkdown文書一式を入力すると、ID重複・未解決参照・プレフィックス逸脱・曖昧語・数量表現を決定的に検査し、意味的チェックリスト・依頼元への質問状雛形・改善提案を併せて返す。

### Resource: `testbasis://review/checklist`

テストベース（要件・仕様）レビュー用の意味的チェックリスト（改善アクション・用語集への相互参照付き）を構造化データ（JSON）として公開する。

### Tool: `analyze_requirements`

複数のテストベース文書を横断分析し、要件ID体系・数量表現の全文書横断集約・境界値候補（`design_boundary_values` 連携）・用語定義と本文使用の照合・曖昧語検出を決定的に行い、根拠位置必須の指摘表付きMarkdownとして返す。要件ID→文書名・行範囲・引用ラベルの根拠位置（`requirementSources`）もJSON付きで出力し、`extract_test_conditions` / `generate_test_cases` にそのまま引き継げる。品質特性マッピング・ステークホルダー別影響・変更差分4区分は呼び出し側LLMへの指示として出力される。文書全文を受け取るツール（`analyze_requirements` / `review_test_basis` / `audit_id_population` / `review_test_specification`）は、投入されたテキストの規模と検出量（文字数・行数・見出し数・検出ID数・数値トークン数）を「入力ダイジェスト」表として先頭に出力し、検出IDが0件の文書やプレフィックスの検出が極端に少ない文書を抜粋投入の疑いとして `[medium]` で指摘する。

### Prompt: `requirements_analysis_interview`

質問形式で要件分析のコンテキストを収集するためのガイド。開発背景・分析対象文書・スコープ・ステークホルダー・変更差分等を確認し、`analyze_requirements` を呼び出すようアシスタントを誘導する。任意引数 `subjectName` を受け取る。

### Resource: `quality://characteristics/product`

製品品質特性モデル（自作パラフレーズ、機能適合性・性能効率性・互換性・使用性・信頼性・セキュリティ・保守性・移植性の8特性）を副特性・着眼点・関連テストタイプ付きの構造化データ（JSON）として公開する。

### Resource: `testbasis://id-patterns`

要件ID・機能IDの表記ゆれに対応する正規表現パターン集を構造化データ（JSON）として公開する。`analyze_requirements` / `review_test_basis` の `idPatterns` 引数にそのままコピーして使える。

### Tool: `extract_test_conditions`

テスト条件を「テストベース／ステークホルダー／リスク／ガイドワード」の4系統から導出させ、導出元（`source` + `derivedFrom`）を必須メタデータとして検査する。要件ID×テスト条件の双方向カバレッジマトリクス・未カバー要件ID・観点カテゴリの未使用・条件IDの重複/欠番・優先度未設定・`derivedFrom` の未解決参照・未知の推奨技法IDを決定的に検出し、リスクスコア（影響度×発生可能性×変更差分重み）からの優先度導出と宣言優先度の逸脱判定を添えたMarkdownを返す。`derivedFrom` は ID 文字列に加えて `{kind, id}` 形式（`requirement` / `risk` / `stakeholder` / `guideword`）で種別を明示でき、種別ごとに対応する母集団と照合する。`analyze_requirements` の `requirementSources` を渡すか条件ごとに `sourceRefs` を指定すると、条件表に文書名・行番号の根拠位置が表示され、未特定の条件も検出される。観点カタログ・ガイドワード辞書・リスク分析フレームに基づく追加洗い出しは呼び出し側LLMへの指示として出力される。`personas` は「属性（`demographics`）／発言・思考（`saysAndThinks`）／目標（`goals`）／不満点（`painPoints`）」の4象限で記述でき、ペルソナ表は4象限の列で出力され、未記入の象限があるペルソナは決定的に検出される（旧形式の `concerns` は不満点のフォールバックとして引き続き有効）。

### Resource: `testcondition://perspectives/catalog`

テスト観点カタログ（自作パラフレーズ、機能・境界・同値・状態遷移・並行競合・障害回復・性能負荷・セキュリティ・リグレッション等の18カテゴリ）を、観点・着眼点例・関連品質特性・推奨技法付きの構造化データ（JSON）として公開する。

### Resource: `testcondition://guidewords/dictionary`

着目点語彙（12件）・ガイドワード語彙（16件）・質問テンプレート・運用手順を構造化データ（JSON）として公開する。着目点1×着目点2×ガイドワードを掛け合わせ、テストベースに書かれていないテスト条件を機械的に洗い出すために使う。

### Resource: `testcondition://risk/frame`

リスク分析フレーム（影響度軸・発生可能性軸・変更差分軸・ステークホルダー別影響枠・リスクスコア算出式・スコアから優先度への写像）を構造化データ（JSON）として公開する。

### Resource: `testcondition://factor/ralph-frame`

因子分解フレーム（自作パラフレーズ）を構造化データ（JSON）として公開する。因子の4分類（`FC-01`〜`FC-04`、信号因子・誤差因子・状態因子・制御因子）の定義・問い・水準の割り当て方、水準ヒューリスティック6件（`FLH-01`〜`FLH-06`、範囲型・列挙型・有無型・数量型・時間型・劣化型）、因子ID/水準IDの採番規約、洗い出し漏れの自己点検、および `design_boundary_values` / `design_equivalence_partitioning` / `design_decision_table` / `design_pairwise` への引き渡し規約（`FHO-01`〜`FHO-04`、いずれも `available`）を含む。組合せ技法の入力となる因子・水準を体系的に洗い出すために、技法適用の前段で使う。

### Tool: `generate_test_cases`

テスト条件からテストケース仕様を導出する。二層構成: (1) 決定的層は、境界値分析・同値分割・状態遷移の各入力から網羅対象一覧を機械的に構築し、網羅率カウント・未充足の網羅対象・テスト条件×テストケーストレーサビリティ・ケースIDの重複/欠番/プレフィックス不一致・由来メタデータの未解決参照・期待結果の主観語/空欄・手順の粒度・閾値の直値埋め込みを決定的に検査する。さらに、宣言された網羅対象IDがケース本文（タイトル・前提条件・手順・事後条件）から裏付けられるかを照合して「裏付けあり充足率」を宣言ベースの網羅率と並べて出し（網羅対象IDの流用だけで網羅率が緑になる状態を検出する）、任意入力 `testBasisDocuments`（テストベース全文）を渡すと期待結果の引用文言・IDがテストベースに実在するかを照合する（未指定時は「未実施(要確認)」と明示する）。加えて、`testCases[].testLevel` / `externalDependencyIds` / `estimatedDurationSeconds` / `declaredTestSize`（いずれも任意）を渡すと、`testdesign://testsize/classification-criteria` の客観的基準（外部依存の有無・実行時間上限）でテストサイズを分類し、宣言サイズとの不一致・テストレベルとサイズの不整合・サイズ構成比の偏り・テストレベル間の網羅対象重複を検査する（判定入力が無い場合は「判定不可」を明示する）。(2) 意味的層は、テストケース本文（前提条件・手順・期待結果）の組み立てのみを呼び出し側LLMへの指示として返す。`testCases` が未指定・空の場合は「生成指示のみ」の出力になる。`derivedFrom` は ID 文字列に加えて `{kind, id}` 形式（`requirement` / `risk` / `stakeholder` / `guideword`）で種別を明示でき、`riskIds` / `personaIds` を渡すと種別ごとに対応する母集団と照合する。`requirementSources` / `testConditions[].sourceRefs` / `testCases[].sourceRefs` を渡すと、対象テスト条件表・ケース詳細・トレーサビリティ表に根拠位置（文書名・行番号）が引き継がれる。

### Prompt: `test_design_interview`

質問形式でテスト設計のコンテキストを収集するためのガイド。対象テスト条件・テストベースの特徴・境界値/同値クラス・状態遷移・因子水準・前提条件・閾値パラメータ等を確認し、`generate_test_cases` を呼び出すようアシスタントを誘導する。任意引数 `subjectName` を受け取る。

### Resource: `testdesign://techniques/catalog`

テスト技法カタログ（自作パラフレーズ、境界値分析・同値分割・デシジョンテーブル・状態遷移・ペアワイズ・ユースケース/シナリオ・CRUD/データライフサイクル・競合/タイミング・探索的テスト/エラー推測/チェックリストベースドテストの13技法）と、テストベースの特徴からの技法選定決定表（10行）を構造化データ（JSON）として公開する。`generate_test_cases` / `generate_exploratory_charters` が技法推奨と網羅基準表示に利用する。

### Resource: `testdesign://testsize/classification-criteria`

テストサイズ分類基準（自作整理、Google Test Sizes の考え方を参考にした独自パラフレーズ）を構造化データ（JSON）として公開する。外部依存の判定軸8件（外部ホストへのネットワークアクセス・永続データストア・ファイルシステム・別プロセス起動・並行実行・実機/周辺機器・画面操作・実時間待ち）と、スモール/ミディアム/ラージの3サイズ（実行時間上限 60/300/1800秒、許容する判定軸、妥当なテストレベル、推奨構成比）を定義する。`generate_test_cases` がテストレベル配分の妥当性検査に利用する。外部基準への適合を主張するものではない。

### Tool: `review_test_specification`

「テストベースに対してテスト仕様書が十分か」を評価軸に、テストベース文書一式とテスト仕様書本文（フォーマット不問）、任意の `testCases` / `testConditions` / `risks` を入力として受け取る。要件ID・テスト条件ID・リスクIDの3系統について双方向カバレッジ（forward: 未カバーID、reverse: 根拠不明・過剰テスト候補）を構築し、ID表記の同期（`EH100` と `EH-100` の表記ゆれ）・ケースIDの重複・期待結果の空欄・優先度の付与状況と判定基準の宣言有無・前提条件のプレースホルダー・手順数と期待結果数のバランス・主観語・期待結果の引用文言/IDのテストベース実在照合・網羅基準の宣言有無を決定的に検査する。意味的レビュー用チェックリスト（14項目）と改善提案を併せて返す。`testCases` 未指定時はID抽出ベースの簡易チェックのみを返す。

### Resource: `testspec://review/checklist`

テスト仕様書レビュー用の意味的チェックリスト（網羅性・トレーサビリティ・期待結果の整合・技法の適切さ・実行可能性・観測可能性・再現性・独立性・データ準備可能性・環境指定・変更差分への重み付け・再利用性・用語一貫性・技法選定根拠の14項目）を、改善アクション・用語集への相互参照付きの構造化データ（JSON）として公開する。

### Tool: `generate_exploratory_charters`

探索的テスト（エラー推測・チェックリストベースドテストを含む経験ベース技法）のチャーター表を生成する。二層構成: (1) 決定的層は、観点区分カタログを基にチャーターIDの重複/欠番/プレフィックス不一致・未知の観点区分ID・由来メタデータ（`derivedFrom`）の未解決参照・観点区分の未使用・高優先度テスト条件/リスクの未カバー・タイムボックスと時間予算の超過・ミッション文の主観語を決定的に検査する。(2) 意味的層は、ミッション文（何を確認し、どう揺さぶるか）の言語化のみを呼び出し側LLMへの指示として返す。`charters` が未指定・空の場合は「生成指示のみ」の出力になる。既存のチャーター表を `charters` に渡せば、既存成果物のレビューとしても機能する。任意の `deterministicallyCoveredConditionIds`（境界値分析・同値分割等の決定的技法で既にテストケース化済みのテスト条件ID）を渡すと、探索的テストは決定的技法の補完という位置づけに沿って、その条件を高優先度テスト条件の未カバー検査から除外する。

### Prompt: `exploratory_charter_interview`

質問形式で探索的テストのチャーター設計のコンテキストを収集するためのガイド。対象領域・テスト条件・既存テストケースで手薄な箇所・過去障害/経験上の勘所・観点区分・セッション時間予算・実施者/スキル・記録方法・停止条件を確認し、`generate_exploratory_charters` を呼び出すようアシスタントを誘導する。任意引数 `subjectName` を受け取る。

### Resource: `testdesign://exploratory/charters`

探索的テストチャーターカタログ（自作パラフレーズ、機能横断・状態/中断・データ整合・運用/例外・環境/構成・時刻境界の6観点区分）を、確認観点・操作観点・関連観点区分・推奨タイムボックス・停止の目安・チャーター表の固定列構成付きの構造化データ（JSON）として公開する。`generate_exploratory_charters` が観点区分カタログとチャーター表の列構成に利用する。

### Tool: `audit_id_population`

`extract_test_conditions` 等の「未カバー0件／網羅率100%」が、入力として宣言された母集団にしか効かない問題に対応する。テストベース文書一式（`documents`）から抽出した定義済みID全量と、各ツール呼び出しに実際に渡された母集団（`declaredPopulations`）を突き合わせ、どの母集団にも一度も渡されていないID（未宣言ID）・除外宣言されたID・母集団にのみ存在しテストベースに定義が無いID・文書別の母集団反映率・未投入文書（`expectedDocumentNames`）・母集団間の差分（工程間の縮退）を決定的に検出する。網羅率100%が母集団の縮退（一部のIDだけが繰り返し使われる状態）による見かけの値でないかを検証するために使う。判定区分と対処指針は `testbasis://population/audit-criteria` を参照する。

### Resource: `testbasis://population/audit-criteria`

ID母集団監査の判定区分カタログ（自作パラフレーズ、未宣言ID・除外宣言ID・テストベース未定義ID・未投入文書・工程間の母集団縮退・文書単位の反映率低下の6区分）を、重大度・説明・対処指針付きの構造化データ（JSON）として公開する。`audit_id_population` が判定表の生成に利用する。

### Tool: `generate_user_story_map`

上流の利用状況モデリング（ドメイン分析 → ペルソナ立案 → ユーザーストーリーマップ5階層 → テスト要求導出）を支援する。二層構成: (1) 決定的層は、アクティビティ/タスク/ユーザーストーリー/テスト要求のID重複・欠番・プレフィックス不一致、階層参照（`personaIds` / `activityId` / `taskId` / `storyIds`）の未解決、ユーザーストーリーが1件も紐づかないペルソナ、テスト要求0件のペルソナ、ペルソナ4象限の未記入、テスト要求行（現状(Before)/将来(After)/テスト要求）の欠落、ドメイン分析観点の被覆状況を決定的に検査する。(2) 意味的層は、フレームの質問例に基づく深掘り指示のみを呼び出し側LLMへ返す。`activities` / `tasks` / `stories` / `testRequirements` が未指定・空の場合は「生成指示のみ」の出力になり、既存成果物を渡せばレビューとして機能する。導出したテスト要求は `source="stakeholder"` のテスト条件として `extract_test_conditions` へ引き渡す対応表付きで出力される。

### Prompt: `persona_journey_interview`

質問形式で上流の利用状況モデリングのコンテキストを収集するためのガイド。ドメイン分析（提供サービス・利用者/従業員の構成・業務フロー・IT化傾向・法規制・季節性）→ ペルソナ4象限（属性・発言・思考・目標・不満点）→ プロダクトゴール → アクティビティ・タスク → ユーザーストーリー → テスト要求（Before/After）を順に確認し、`generate_user_story_map` を呼び出すようアシスタントを誘導する。任意引数 `subjectName` を受け取る。

### Resource: `testcondition://persona/journey-frame`

上流の利用状況モデリング用フレーム（自作パラフレーズ）を構造化データ（JSON）として公開する。ドメイン分析の観点（`DOM-xx`、提供サービス・利用者/従業員構成・業務フロー・IT化傾向・法規制・季節性）、ペルソナ4象限の定義（`PQ-01`〜`PQ-04`、質問例・避ける書き方付き）、ユーザーストーリーマップの5階層（`USM-01`〜`USM-05`、粒度の目安付き）、現状(Before)/将来(After)/テスト要求の3列定義と `extract_test_conditions` への引き渡し規約を含む。`generate_user_story_map` が利用する。

### Tool: `analyze_cause_effect`

仕様文（セクション単位）の論理関係を原因・結果・制約としてモデル化した入力を受け取り、そのモデルの整合性と「仕様文本文による裏付け」を決定的に検査する。モデル化そのもの（意味的層）は呼び出し側LLMに委ね、決定的層が (1) 未知ノード参照・ID重複・IDプレフィックス不一致・グラフの循環、(2) どの結果にも接続しない孤立原因、(3) どの原因からも導かれない結果、(4) 中間ノードの片側未接続、(5) 制約の指定不正（対象種別・要素数・重複）・制約の矛盾・制約による原因値の固定・冗長な制約、(6) 原因の真偽組合せ数（理論上限 2^n・制約充足後・圧縮後のデシジョンテーブル列数）、(7) 常に偽の結果／原因に依存しない結果、(8) 引用（`quote`）の仕様文実在照合と引用未指定、(9) どのノードにも紐づかない未モデル化仕様文の全件列挙とモデル化率、(10) 論理接続語（かつ／または／ただし／以外 等）のモデル未反映、(11) 宣言列数（`expectedRuleCount`）と算出列数の不一致、(12) 生成したデシジョンテーブル入力を `design_decision_table` の算出ロジックへ通した結果との突き合わせ、を検査する。制約は `exclusive` / `inclusive` / `onlyOne` / `requires` / `masks` の5種、辺は `identity` / `not`、中間ノードは `and` / `or` を指定できる。出力は mermaid の原因結果グラフ、圧縮後ルール表、および `design_decision_table` へそのまま渡せる引き渡しJSONを含む。原因数が上限（既定12件、`maxEnumerationCauses` で変更可）を超える場合やモデルに致命的な構造指摘がある場合は全列挙を行わず、制約充足後の列数・圧縮後の列数を推測値で出さずに「未算出（理由）」と明記する。判定区分と対処指針は `testbasis://cause-effect/analysis-criteria` を参照する。

### Resource: `testbasis://cause-effect/analysis-criteria`

原因結果グラフ分析の判定区分カタログ（自作パラフレーズ、`CEG-01`〜`CEG-20` の20区分。未知ノード参照・ID重複・プレフィックス不一致・孤立原因・導出されない結果・中間ノードの片側未接続・グラフの循環・制約の指定不正・制約の矛盾・原因値の固定・冗長な制約・常に偽の結果・原因に依存しない結果・仕様文に存在しない引用・引用未指定・未モデル化仕様文・論理接続語の未反映・曖昧語の残存・宣言列数と算出列数の不一致・デシジョンテーブル引き渡しの不整合）を、重大度・説明・対処指針付きの構造化データ（JSON）として公開する。`analyze_cause_effect` が判定表の生成に利用する。

## コマンド

```bash
npm run dev       # tsc --watch
npm start         # node dist/server.js（stdio transport）
npm test          # vitest run
npm run inspect   # build後、MCP Inspectorを起動して動作確認
```

## 動作確認（CLI）

```bash
npx @modelcontextprotocol/inspector --cli node dist/server.js --method resources/list
npx @modelcontextprotocol/inspector --cli node dist/server.js --method tools/list
npx @modelcontextprotocol/inspector --cli node dist/server.js --method prompts/list
npx @modelcontextprotocol/inspector --cli node dist/server.js --method tools/call \
  --tool-name create_test_plan \
  --tool-arg projectName="ECサイト" \
  --tool-arg scope="決済とログイン機能"
npx @modelcontextprotocol/inspector --cli node dist/server.js --method prompts/get \
  --prompt-name test_plan_interview --prompt-args projectName="ECサイト"
```

## 実クライアントへの登録例（Claude Desktop / Claude Code）

```json
{
  "mcpServers": {
    "ai-test-process-mcp": {
      "command": "node",
      "args": ["<repo-path>/dist/server.js"]
    }
  }
}
```

npm公開後は、リポジトリをローカルにcloneしなくても `npx` 経由で起動できる（`.vscode/mcp.json` の例）。

```json
{
  "servers": {
    "ai-test-process-mcp": {
      "command": "npx",
      "args": ["-y", "ai-test-process-mcp"]
    }
  }
}
```

## 公開手順（メンテナ向け）

1. `npm login`（npmjs.comのアカウントで認証）
2. `npm run build`（`npm publish` 実行時は `prepublishOnly` フックにより自動実行されるため、手動実行は任意）
3. `npm publish`

公開後の接続方式（stdio）は変わらない。MCPレジストリ（`server.json` / `mcp-publisher`）への登録は本手順の対象外で、将来の別タスクとして扱う。

## 将来機能の追加方法

新しい機能（Test Analysis・Test Design ほか Generic Test Process 各工程の tool）を追加する際は、以下のパターンに従う：

1. `src/resources/<name>.ts` — 必要な参照データ（構造化データ）を定義
2. `src/tools/<name>.ts` — zod入力スキーマ + 純粋なレンダリング関数 + `registerXxxTool()`
3. `src/resources/index.ts` / `src/tools/index.ts` にそれぞれ1行登録を追加
4. `test/<name>.test.ts` でレンダリング関数を単体テスト

`server.ts` 本体は変更不要。プラグインローダーやレジストリのような抽象化は、モジュール数が増えて明示的な登録リストが煩雑になるまで導入しない。

詳細は [AGENTS.md](./AGENTS.md) と [docs/ai/project-overview.md](./docs/ai/project-overview.md) を参照。
