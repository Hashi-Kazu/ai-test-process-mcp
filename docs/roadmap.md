# 開発ロードマップ

本プロジェクトを「**JSTQB/ISTQB Generic Test Process を AI で支援する MCP**」として育てるための段階的な開発計画。

## ビジョン

JSTQB（ISTQB準拠）の Generic Test Process 全7工程を対象に、各工程のテスト成果物の**作成・レビュー・分析**を MCP の tool / resource / prompt として段階的に提供する。テスト管理ツールの操作を目的とせず、AI による品質向上と効率化の支援に特化する。

```text
1. Test Planning
2. Test Monitoring and Control
3. Test Analysis
4. Test Design
5. Test Implementation
6. Test Execution
7. Test Completion
```

文書構成は JSTQB 準拠の15章テンプレートに基づく。

### 提供価値

- **品質向上**: レビュー支援・観点漏れ防止・リスク分析・ベストプラクティス提示・JSTQB/ISTQB シラバスに基づくアドバイス
- **効率化**: ドキュメント生成・テストケース生成・テストデータ生成・レポート生成・分析の自動化

### 目指す姿

- 初学者でも品質の高い成果物を作成できる
- ベテランのレビュー負荷を削減できる
- テスト資産を標準化できる

## 全フェーズ共通の方針

- **スモールステップ**: 1ステップ = 1 PRサイズ。既存の拡張パターン（`src/resources/<name>.ts` + `src/tools/<name>.ts` を新設し、各 `index.ts` に1行登録。`server.ts` は変更しない）を厳守する。
- **JSTQB準拠の実現方式**: 文書の章構成は JSTQB/実務ベースの15章テンプレートを維持し、JSTQB 用語・シラバスの観点を知識リソース（`jstqb://glossary/core` 等）として追加・整合させる。既存機能を壊さずに積み上げる。
- **レビュー系toolの二層構成**: 機械的チェック（章の欠落、必須項目の未記入、ID重複などの構造検査）は純関数で決定的に実施し vitest で単体テストする。意味的レビュー（内容の妥当性判断）は JSTQB 準拠チェックリストを tool 出力 / resource として返し、呼び出し側の LLM が適用する。
- **生成系toolの3点セット構成**: 生成系は resource（テンプレート構造データ）+ tool（zodスキーマ + 純関数レンダリング）+ interview prompt（対話的コンテキスト収集）で構成する（`create_test_plan` / `test_plan_interview` と同型）。
- **著作権**: JSTQB用語集・シラバスとも逐語転載せず、パラフレーズのみを構造化データとして保持する。
- **進め方**: 各ステップの着手時は `AGENTS.md` のルール通り、planner による調査・仕様策定・引き渡し票生成を経て実装担当（feature-dev）へ引き継ぐ。

## フェーズ計画

構想上の Tool 一覧（下記「将来構想: Tool 一覧」）のうち、**計画 → 分析 → 設計 → 全工程** の順に実装する。

### Phase 1: Test Planning（進行中）

テスト計画書の作成・レビュー・修正支援。Phase 1 完了 = v1.0 の目安。

| tool | 内容 | 状態 |
| --- | --- | --- |
| `create_test_plan` | JSTQB準拠15章構成の日本語テスト計画書ドラフト生成（旧名 `gen_test_plan`） | 完了 |
| `review_test_plan` | JSTQB観点でのテスト計画書レビュー（構造検査 + 意味的チェックリストの二層構成） | 完了 |
| `revise_test_plan` | レビュー結果・修正指示を反映したテスト計画書の修正支援 | 完了 |

`revise_test_plan` の実装内容:

- 機械的修正（欠落章補完・未記入マーカー正規化）+ LLM向け書き換え指示の二層構成で実装済み。

### Phase 2: Test Analysis

要件・仕様（テストベース）の分析支援。

| tool | 内容 | 状態 |
| --- | --- | --- |
| `analyze_requirements` | 要件分析・品質特性抽出・曖昧さ検出 | 完了 |
| `extract_test_conditions` | テストベースからのテスト条件導出（4系統からの導出・双方向カバレッジ/観点未使用/ID重複欠番/優先度未設定の決定的検査 + 観点カタログ・ガイドワード辞書・リスク分析フレームによる意味的洗い出し指示） | 完了 |
| `review_test_basis` | テストベース（要件・仕様）のレビュー（ID重複・未解決参照・プレフィックス逸脱・曖昧語・数量表現の決定的検査 + 意味的チェックリスト/質問状/改善提案の二層構成） | 完了 |
| `audit_id_population` | テストベース定義済みID全量×各ツール呼び出しの宣言母集団の突き合わせ（未宣言ID/除外宣言ID/母集団未定義ID/文書別反映率/未投入文書/母集団間の縮退の決定的検査 + 判定区分カタログ `testbasis://population/audit-criteria`） | 完了（GitHub Issue #45 / Jira `HSKZ-99`） |
| `analyze_cause_effect` | セクション単位の仕様文と、呼び出し側が構造化した原因・結果・制約の突き合わせ（孤立原因/導出されない結果/中間ノードの片側未接続/グラフの循環/制約の指定不正・矛盾・原因値の固定・冗長/常に偽の結果/組合せ数とデシジョンテーブル列数/引用の仕様文実在照合/未モデル化仕様文と論理接続語の未反映/宣言列数の不一致/デシジョンテーブル引き渡しの不整合の決定的検査 + 判定区分カタログ `testbasis://cause-effect/analysis-criteria` 20区分。mermaid 図と `design_decision_table` にそのまま渡せる `DecisionTableSpec` JSON（同ツールの算出ロジックで往復照合済み）を出力、全列挙未実施時は列数を推測せず「未算出（理由）」を明記、共有純関数 `src/causeEffectAnalysis.ts`） | 完了（GitHub Issue #90 / Jira `HSKZ-134`） |
| `generate_business_requirement_model` | 業務側の「システム化の目的 → 業務ユースケース → 業務フロー → 駆動する情報」4層モデルを、機能IDの章立てに従属せず再構成（目的↔業務ユースケースの相互紐づけ・機能ID母集団との双方向照合・業務フロー工程0件/担い手未記入・駆動データの未接触・`hasStates`宣言とstates実体の照合・達成判定指標の未記入・例外時運用の未記入・宣言済み機能ID被覆率と算出値の一致・必須観点の空欄を判定区分`BRC-01`〜`BRC-15`で決定的に検査 + フレーム resource `testcondition://business/requirement-frame`。`design_scenario_flows`/`design_test_data`/`audit_cross_matrix`への引き渡し表と`testcondition://persona/journey-frame`との役割分担を出力、共有純関数 `src/businessRequirementAnalysis.ts`） | 完了（GitHub Issue #93 / Jira `HSKZ-137`） |

### Phase 3: Test Design

テストケースの生成とテスト仕様書のレビュー。

| tool | 内容 | 状態 |
| --- | --- | --- |
| `generate_test_cases` | テスト技法の推奨とテストケース生成（技法カタログ＋技法選定決定表 resource、決定的な網羅率カウント/未通過網羅対象列挙/主観語・空欄・手順粒度・直値埋め込み検査 + 手順組み立ての意味的層の二層構成） | 完了 |
| `review_test_specification` | テスト設計仕様・テストケース仕様のレビュー（テストベース突き合わせ。要件ID/テスト条件ID/リスクIDの3系統×双方向カバレッジ、ID表記ゆれ・優先度・前提条件・手順粒度・主観語・網羅基準宣言の決定的検査 + 意味的チェックリスト14項目/改善提案の二層構成） | 完了 |
| `generate_exploratory_charters` | 探索的テストのチャーター設計（チャーターカタログ resource + チャーターID/観点区分/由来参照/未カバー/タイムボックス/主観語の決定的検査 + ミッション言語化の意味的層） | 完了 |
| `reexpand_threshold_changes` | 閾値パラメータ表の変更前後2スナップショットを突き合わせ、境界値/同値分割をパラメータ名束縛で新旧再展開し、旧値の直値残存/失効した網羅対象ID参照/名前参照経由の再確認要否を判定区分カタログ `testdesign://threshold/change-impact-criteria` 8区分で決定的に検出 | 完了（GitHub Issue #55） |
| `design_pairwise` | ペアワイズ設計（因子・水準・禁則・seed行から全水準ペアを正準順に列挙し、禁則による到達不能ペアの判定・ペア被覆組合せの決定的な貪欲法生成・ペア被覆率・全網羅組合せ数に対する削減率を算出。判定区分カタログ `testdesign://pairwise/analysis-criteria` 12区分。生成した各ペアを `PW:` プレフィックスの網羅対象として `generate_test_cases` の universe へ統合し、技法カタログ `TTK-05`(pairwise) の決定的カウント可否を可へ、因子分解フレーム `FHO-04` を available へ更新） | 完了（GitHub Issue #80 / Jira `HSKZ-124`） |
| `design_scenario_flows` | ユースケース／シナリオ設計（アクター・事前条件・主フロー・代替フロー・例外フローから、主フロー単独＋1分岐ずつのシナリオ一覧を正常系/準正常系/異常系の分類つきで決定的に生成。フロー展開・宣言した機能ID母集団とステップ実体の双方向照合・テスト条件との突合を判定区分カタログ `testdesign://scenario-flow/analysis-criteria` 15区分で検査。各フローを `UC:`、各シナリオを `SC:` プレフィックスの網羅対象として `generate_test_cases` の universe へ統合し、技法カタログ `TTK-06`(use-case-based) / `TTK-07`(scenario-based) の決定的カウント可否を可へ更新） | 完了（GitHub Issue #74 / Jira `HSKZ-118`） |
| `design_test_architecture` | テストアーキテクチャ設計（テスト条件群をテストコンテナへ束ね、各コンテナの責務・テストレベル・テストタイプ・優先度クラス・担当観点カテゴリ・テストスコープを宣言させ、実際に帰属したテスト条件・テストケースの実体と双方向で照合。帰属率は分母（入力テスト条件数）・分子（帰属済み条件数）・未帰属条件IDの全列挙つきで、レベル/タイプ/優先度クラスの分布は帰属済み条件数を分母として算出し、コンテナ別テストサイズ分布はテストケース指定時のみ算出する。設計原則（分割軸 `TAX-01`〜`TAX-08` / 責務定義項目 `RFD-01`〜`RFD-09` / 優先度クラス `TPR-01`〜`TPR-03` / スコープ宣言項目 `TSC-01`〜`TSC-03`）と判定区分カタログ `testarch://container/design-principles` 17区分で検査。コンテナ間の実行順序・依存関係・クリティカルパスは対象外） | 完了（GitHub Issue #75） |
| `design_test_data` | テストデータ設計（データ区分ごとのライフサイクル状態・遷移から、データ区分×状態マトリクス・未使用状態/遷移の検出・データ↔ケースの供給トレーサビリティ・同一データを更新する複数ケースの排他検出・状態/遷移被覆を決定的に算出。供給元の有無はIDの存在だけでなく初期状態からの到達可能性（BFS）で判定し、被覆率は本文裏付けを通過した要求だけを分子に数える。データ区分種別カタログ `TDK-01`〜`TDK-06` と判定区分カタログ `testdesign://test-data/analysis-criteria` `TDC-01`〜`TDC-18` で検査。各状態を `DL:S:`、各遷移を `DL:T:` プレフィックスの網羅対象として `generate_test_cases` の universe へ統合し、技法カタログ `TTK-08`(data-lifecycle-test) の決定的カウント可否を可へ更新。実行順序・依存関係・クリティカルパスは対象外（`analyze_execution_order` の担当領域）） | 完了（GitHub Issue #82 / Jira `HSKZ-126`） |
| `audit_cross_matrix` | 多軸マトリクス監査（任意の2軸以上＝リスク／テスト観点カテゴリ／ペルソナ／機能ID／シナリオ／テストコンテナ／パラメータ／テストタイプ等を汎用の軸データとして受け取り、軸ペアの直積表を決定的に生成して空行・空列＝「片側にしかない要素」を列挙する。3軸以上なら全組合せの軸ペアを一括で回す。充填率は分母（行数 × 列数）を明示して算出し、行被覆率・列被覆率の分母は除外宣言を除いた対象要素数とする。さらに `expectedAxisPopulations` による軸母集団の縮退と、`documents` 本文との双方向の裏付け照合（本文に無い軸要素／本文に定義があるのに軸に載っていないID）と、リンク宣言の根拠（`links[].evidence`）が本文から裏付けられるかまで検査し、根拠が裏付けられたセルだけを分子に数えた根拠裏付け充填率を併記するため、見かけの高充填率を検出できる。判定区分カタログ `testdesign://cross-matrix/audit-criteria` `CMX-01`〜`CMX-17`、共有純関数 `src/crossMatrixAnalysis.ts`） | 完了（GitHub Issue #76 / Jira `HSKZ-120`） |
| `select_regression_suite` | リグレッションスイート選択（テスト条件・テストケースの母集団に対する選択(include/exclude)判定の理由列挙、非選択となった高リスク項目(`riskScore >= highRiskMinScore` または `priority: "高"`)の全件明示、選択された case のテストサイズ分布・推定実行時間、前バージョンスイートとの追加/削除/維持の差分と削除理由の双方向照合、変更差分区分(`RA-CHANGE`)未紐づけの検出、影響範囲被覆率(`TTC-COV-18`)の宣言と算出値の照合を判定区分`RSC-01`〜`RSC-20`で決定的に検査。判定区分カタログ `testdesign://regression-selection/analysis-criteria`。テストサイズ分類・リスクスコア算出は既存の共有純関数(`src/testSizeAnalysis.ts` / `src/testConditionAnalysis.ts`)を再利用し、技法カタログ `TTK-17`(regression-selection) の決定的カウント可否を可へ更新） | 完了（GitHub Issue #94 / Jira `HSKZ-138`） |
| `analyze_execution_order` | テスト実行順序・依存関係分析（テストコンテナ／スイート／ケース群の依存関係・所要時間・必要リソースから、Kahn法によるトポロジカルソートで実行順序・並列実行グループ(wave)を決定し、循環依存を検出して代表閉路を提示。CPM(クリティカルパス法)でES/EF/LS/LF・スラック・クリティカルパス・総所要時間を算出し、最早開始スケジュール上の同一リソース競合(`capacity`超過)・並列度上限(`maxParallelism`)超過を検出。依存関係の未宣言・依存根拠(成果物/リソース/データ項目)の宣言と実体の不一致、品質目標(SLO)・合格基準の測定可能性とSLO参照の双方向照合、モニタリング計画の宣言・範囲・指標接続、`design_test_architecture` のコンテナ母集団との計画被覆率の宣言と算出値の照合を判定区分`EOC-01`〜`EOC-27`で決定的に検査。判定区分カタログ `testdesign://execution-order/analysis-criteria`。コンテナへの分割・責務定義は `design_test_architecture` の担当で対象外） | 完了（GitHub Issue #83 / Jira `HSKZ-127`） |
| `audit_coverage_balance` | 網羅バランス・用語定義監査（生成済みテストケース群の観点カテゴリ別／技法別／テストレベル別のケース数分布と観点カテゴリ×テストレベルのクロス表を決定的に集計し、0件区分と「未指定」行を必ず含めて構成比とともに提示。望ましい分布の基準は持たず分布そのものには合否を付けず、合否は宣言と実体の食い違い（観点/技法カタログに存在しない区分IDの宣言、分布軸の未宣言、`declaredDistributions` の宣言件数と実集計の不一致、分布に計上したケースIDが成果物本文に実在しない水増し、本文にあるのに集計対象へ未投入のケースID）にのみ付ける。割り当て0件区分と分布の集中度（最大区分の占有率・上位2区分の合計）は `info` の観測値として提示。あわせて成果物中の独自用語を4規則（鉤括弧語・カタカナ連続・英大文字略語・太字強調語）で機械抽出し、用語集セクション不在・定義欠落・定義済みだが本文未使用・定義文が一致しない重複定義・既知カタログ用語との表記ゆれ候補を判定区分`CBC-01`〜`CBC-13`で決定的に検査。任意入力未指定の検査は合格ではなく「検査不能（要確認）」として出力する。判定区分カタログ `testdesign://balance/coverage-balance-criteria`、共有純関数 `src/coverageBalanceAnalysis.ts`） | 完了（GitHub Issue #155 / Jira `HSKZ-182`） |
| `audit_deliverable_consistency` | 成果物間整合性監査（テスト計画書・テスト分析書・テスト設計書のように工程をまたぐ複数成果物を突き合わせ、参照テストベース文書リストの差分（2桁の文書番号キーで読了／未読を成果物別マトリクス化し、成果物間の読了状態不一致・同一成果物内の自己矛盾・片側にしか現れない文書を検出。`declaredReferencedDocuments` で宣言リストと本文実体、`idPrefixOwners` で未読宣言文書由来IDの実参照まで照合）、IDの成果物間相互参照（レンジ表記 `R-01〜R-04` の展開つきで、どの成果物にも定義が無い参照ID・対応主張の裏付け欠落・後続成果物から一度も参照されない定義済みIDを検出）、章節参照の実在性（参照番号の実在・見出しラベルの一致・参照先成果物の未投入）、同一項目・同一IDの記述差分（同一単位の異値・2-gram包含率0.8未満の記述乖離・スコープ/対象外/前提条件/制約/テストレベル/テストタイプ列挙の片側欠落）を判定区分`DCC-01`〜`DCC-17`で決定的に検査。件数・網羅率の宣言は同一箇所のID列挙実数・分子分母からの算出率・`countClaimSubjects`（未指定時は既定主語カタログ）で解決したプレフィックスの定義済みID実数（母集団）と照合し、分母が母集団の実数と一致しない見かけの網羅率（`DCC-16`）と、分子分母の根拠を伴わない裸の達成度%主張（`DCC-17`）を区別して検出。任意入力未指定の検査は合格ではなく「検査不能（要確認）」として出力する。判定区分カタログ `testdesign://deliverable/consistency-criteria`、共通項目種別カタログ `DSI-01`〜`DSI-06`、共有純関数 `src/deliverableConsistencyAnalysis.ts`） | 完了（GitHub Issue #88 / #134 / Jira `HSKZ-132` / `HSKZ-173`） |

`review_test_specification` の設計方針（旧ロードマップ Phase 4 から引き継ぎ）:

- テスト仕様書単体の形式チェックではなく、「**テストベースに対して仕様書が十分か**」を評価軸の中心に置く。
- **テストベースのフォーマットは任意**。実務上のテストベースは Excel・Word・Markdown・プレーンテキストなど多様であるため、特定のフォーマットや章立てを仮定しない。バイナリ形式は呼び出し側（MCPクライアント / LLM）がテキスト化して渡す責務とし、tool 側は「フォーマット不問の自由テキスト」として受け取る。変換時に何を保ち何を落とすかの規約と参照実装は `docs/ai/testbase-ingestion.md` に定めた。
- 入力はテストベースのテキストとテスト仕様書のテキストの2つ（いずれも必須）。二層構成:
  - 構造検査（決定的）: テストケースIDの重複、期待結果の空欄、要件ID（テストベース側にID表記がある場合）とテストケースの対応表を機械的に構築し、どのテストケースからも参照されていない要件IDを未カバー候補として列挙。要件IDの抽出はパターンマッチベースとし、既定パターンで拾えない場合に備え任意入力で要件IDパターンを指定できるようにする。
  - 意味的チェック: 要件IDが明示されていない・表記が揺れているテストベースについても、呼び出し側 LLM がチェックリストに沿って要件と仕様書を突き合わせ、カバレッジ漏れ・期待結果の不整合を指摘できる形式で返す。
- チェックリスト resource: テストベースに対するテスト条件の網羅性、トレーサビリティ、期待結果の明確さと整合、テスト技法の適切さ、事前条件・手順の実行可能性など。

### Phase 5: 実務適用（Practitioner Readiness）

Phase 1〜3 で実装済みのツール群を、コンテスト用テストベースではない**現場の実務文書**に対して使用に耐える水準へ引き上げる。横方向（工程の広さ）ではなく縦方向（実務での信用）を扱う。工程拡張（Phase 4）より先に着手する。

追跡: GitHub Issue #176 の M5（条件V）。実測の根拠は `docs/ai/regression-baseline.md` と `sample/non_contest_testbase/`。

| マイルストーン | 内容 | 状態 |
| --- | --- | --- |
| M5-1 検査可能性の可視化 | 定義ID0件・母集団0件で決定的層が空振りしたことを「検査不能(要確認)」として必ず出力する。ID体系を持たない実務文書向けの代替アンカー（見出しパス）で章節を解決する | 未着手 |
| M5-2 出力量 | 1ツールの既定出力を呼び出し元 context に載る規模へ。要約表示が重複ID件数に比例して破綻する構造を解消する | 未着手 |
| M5-3 優先順位付け | 決定的指摘へ対処優先度を機械的に付与する。曖昧語等の定型表現による偽陽性を、除外件数と規則IDを明示したうえで抑制する | 未着手 |
| M5-4 入力コスト | 上流出力→下流payloadの引き渡しJSONを標準化し、interview prompt と原文入力口を拡張する | 未着手 |
| M5-5 導線と実証 | 起点からの工程導線を resource で提供し、実務テストベースで全ツールを実証する | 未着手 |

Phase 5 の設計規約（`AGENTS.md` の必須ルールの具体化）:

- 検査が実行できなかったことは「合格」ではなく「**検査不能（要確認）**」として出力する。`audit_coverage_balance` / `audit_deliverable_consistency` が既に実装している方式を、ID系検査へも適用する。
- 出力量を削るときは、削った件数と全件取得手段（`verbose: true`）を必ず併記する。黙って縮退させない。
- 偽陽性を抑制するときは、除外した件数と除外規則IDを出力する。フィルタが効きすぎたことを回帰で検出できる形にする。

### Phase 4: Generic Test Process 全体への拡張

残る4工程（Monitoring and Control / Implementation / Execution / Completion）へ拡張する。**Phase 5（実務適用）の完了後に着手し、着手時に再計画する。**

## 将来構想: Tool 一覧

Generic Test Process の各工程で最終的に提供したい tool 群。Phase 1〜3 のスコープ外は着手時に取捨選択・再計画する。

| 工程 | tool |
| --- | --- |
| Test Planning | `create_test_plan` / `review_test_plan` / `revise_test_plan` / `estimate_test_effort` / `analyze_test_risk` |
| Test Monitoring and Control | KPI分析 / 進捗分析 / リスク監視 / テスト完了率 |
| Test Analysis | `analyze_requirements` / `extract_test_conditions` / `detect_requirement_ambiguity` / `review_test_basis` |
| Test Design | `generate_test_cases` / `recommend_test_techniques` / `review_test_specification` / `analyze_coverage` |
| Test Implementation | `generate_test_data` / `generate_test_procedure` / `generate_test_suite` |
| Test Execution | `analyze_test_results` / `analyze_logs` / `classify_defects` |
| Test Completion | `generate_test_summary` / `evaluate_quality` / `generate_retrospective` |

## 将来構想: 連携・基盤

- Jira・GitHub Issues・Azure DevOps との連携
- Playwright/Cypress など自動テストとの連携
- テストメトリクスの可視化
- プロジェクト横断でのナレッジ蓄積
- 組織標準やテンプレートのカスタマイズ対応
- RAG による社内テスト標準・過去資産の参照
- テスト状況報告書・テスト完了報告書の生成
- レビュー用 interview prompt（`test_plan_interview` のレビュー版。レビュー対象・観点を対話的に絞り込む）

## 実装履歴

| ステップ | 内容 | 状態 |
| --- | --- | --- |
| 旧Phase 1 | テスト計画書ドラフト生成 `gen_test_plan`（15章構成） | 完了（v0.3.0） |
| 旧Phase 2 | JSTQB用語基盤（`jstqb://glossary/core` resource + テンプレート用語整合） | 完了（v0.4.0） |
| 旧Phase 3 | テスト計画書レビュー tool `review_test_plan` | 完了（v0.5.0） |
| 構想再編 | Generic Test Process 構想へのロードマップ再編 + `gen_test_plan` → `create_test_plan` リネーム | 完了（v0.6.0） |
| Phase 1 完了 | テスト計画書修正支援 `revise_test_plan`（欠落章補完・マーカー正規化 + LLM向け書き換え指示） | 完了（v0.7.0） |
| Test Design 着手 | 規格準拠表記の除去 + Test Design 技法エンジン `design_boundary_values` / `design_equivalence_partitioning` | 完了（v0.8.0） |
| Phase 2 着手 | テストベースレビュー `review_test_basis`（ID重複・未解決参照・プレフィックス逸脱・曖昧語・数量表現の決定的検査 + 意味的チェックリスト/質問状/改善提案、共有純関数 `src/testBasisAnalysis.ts`） | 完了 |
| Phase 2 残り | Test Analysis（`extract_test_conditions` + 観点カタログ・ガイドワード辞書・リスク分析フレーム resource、共有純関数 `src/testConditionAnalysis.ts`） | 完了 |
| Phase 3 着手 | Test Design（`generate_test_cases` + テスト技法カタログ・技法選定決定表 resource `testdesign://techniques/catalog`、`test_design_interview` prompt、共有純関数 `src/testCaseAnalysis.ts`） | 完了 |
| Phase 3 残り | Test Design（`review_test_specification` + テスト仕様書レビューチェックリスト resource `testspec://review/checklist`、共有純関数 `src/testSpecificationAnalysis.ts`） | 完了 |
| Phase 3 追加 | 経験ベース技法（`generate_exploratory_charters` + `testdesign://exploratory/charters`、`exploratory_charter_interview` prompt、共有純関数 `src/exploratoryCharterAnalysis.ts`、技法カタログ `TTK-11`〜`13` / `TTS-09`〜`10`） | 完了 |
| Phase 4 | 全工程への拡張 | 未計画（Phase 5 の後） |
| Phase 2 追加 | ID母集団監査 `audit_id_population`（テストベース定義済みID全量×宣言母集団の突き合わせで未宣言IDを決定的に検出、判定区分カタログ `testbasis://population/audit-criteria`、共有純関数 `src/idPopulationAnalysis.ts`。GitHub Issue #45 / Jira `HSKZ-99`） | 完了 |
| Phase 2 追加 | 上流の利用状況モデリング（ペルソナの4象限化 = 属性/発言・思考/目標/不満点、`generate_user_story_map` + フレーム resource `testcondition://persona/journey-frame` + `persona_journey_interview` prompt、共有純関数 `src/userStoryMapAnalysis.ts`。ドメイン分析→ペルソナ立案→ユーザーストーリーマップ5階層→テスト要求(Before/After)導出を支援し、テスト要求を `extract_test_conditions` の `source="stakeholder"` 条件へ引き渡す。GitHub Issue #50 / #57 / Jira `HSKZ-104` / `HSKZ-111`） | 完了 |
| Phase 3 追加 | 閾値変更の影響再展開 reexpand_threshold_changes（閾値パラメータ表の変更前後2スナップショットを突き合わせ、境界値/同値分割をパラメータ名束縛で新旧再展開し、旧値の直値残存・失効した網羅対象ID参照・名前参照経由の再確認要否を判定区分カタログ `testdesign://threshold/change-impact-criteria` 8区分で決定的に検出、共有純関数 `src/thresholdChangeAnalysis.ts`。GitHub Issue #55） | 完了 |
| Phase 3 追加 | ASTER参加要項が例示するFV表/NGT/ゆもつよマトリクスの3記法対応（`audit_test_design_notations` + 記法カタログ・判定区分カタログ `testdesign://notation/catalog`（`TDN-01`〜`25`）、共有純関数 `src/testDesignNotationAnalysis.ts`。宣言（網羅率・記法間の対応）と実体（行・ノード・セル・テスト条件母集団）を双方向照合し、記法をまたいだ不整合まで検出） | 完了（GitHub Issue #95 / Jira `HSKZ-139`） |
| Phase 5 | 実務適用（M5-1 検査可能性の可視化 / M5-2 出力量 / M5-3 優先順位付け / M5-4 入力コスト / M5-5 導線と実証。GitHub Issue #176 の M5・条件V） | 未着手 |
