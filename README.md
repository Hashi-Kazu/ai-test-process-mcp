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

複数のテストベース文書を横断分析し、要件ID体系・数量表現の全文書横断集約・境界値候補（`design_boundary_values` 連携）・用語定義と本文使用の照合・曖昧語検出を決定的に行い、根拠位置必須の指摘表付きMarkdownとして返す。要件ID→文書名・行範囲・引用ラベルの根拠位置（`requirementSources`）もJSON付きで出力し、`extract_test_conditions` / `generate_test_cases` にそのまま引き継げる。品質特性マッピング・ステークホルダー別影響・変更差分4区分は呼び出し側LLMへの指示として出力される。

### Prompt: `requirements_analysis_interview`

質問形式で要件分析のコンテキストを収集するためのガイド。開発背景・分析対象文書・スコープ・ステークホルダー・変更差分等を確認し、`analyze_requirements` を呼び出すようアシスタントを誘導する。任意引数 `subjectName` を受け取る。

### Resource: `quality://characteristics/product`

製品品質特性モデル（自作パラフレーズ、機能適合性・性能効率性・互換性・使用性・信頼性・セキュリティ・保守性・移植性の8特性）を副特性・着眼点・関連テストタイプ付きの構造化データ（JSON）として公開する。

### Resource: `testbasis://id-patterns`

要件ID・機能IDの表記ゆれに対応する正規表現パターン集を構造化データ（JSON）として公開する。`analyze_requirements` / `review_test_basis` の `idPatterns` 引数にそのままコピーして使える。

### Tool: `extract_test_conditions`

テスト条件を「テストベース／ステークホルダー／リスク／ガイドワード」の4系統から導出させ、導出元（`source` + `derivedFrom`）を必須メタデータとして検査する。要件ID×テスト条件の双方向カバレッジマトリクス・未カバー要件ID・観点カテゴリの未使用・条件IDの重複/欠番・優先度未設定・`derivedFrom` の未解決参照・未知の推奨技法IDを決定的に検出し、リスクスコア（影響度×発生可能性×変更差分重み）からの優先度導出と宣言優先度の逸脱判定を添えたMarkdownを返す。`derivedFrom` は ID 文字列に加えて `{kind, id}` 形式（`requirement` / `risk` / `stakeholder` / `guideword`）で種別を明示でき、種別ごとに対応する母集団と照合する。`analyze_requirements` の `requirementSources` を渡すか条件ごとに `sourceRefs` を指定すると、条件表に文書名・行番号の根拠位置が表示され、未特定の条件も検出される。観点カタログ・ガイドワード辞書・リスク分析フレームに基づく追加洗い出しは呼び出し側LLMへの指示として出力される。

### Resource: `testcondition://perspectives/catalog`

テスト観点カタログ（自作パラフレーズ、機能・境界・同値・状態遷移・並行競合・障害回復・性能負荷・セキュリティ・リグレッション等の18カテゴリ）を、観点・着眼点例・関連品質特性・推奨技法付きの構造化データ（JSON）として公開する。

### Resource: `testcondition://guidewords/dictionary`

着目点語彙（12件）・ガイドワード語彙（16件）・質問テンプレート・運用手順を構造化データ（JSON）として公開する。着目点1×着目点2×ガイドワードを掛け合わせ、テストベースに書かれていないテスト条件を機械的に洗い出すために使う。

### Resource: `testcondition://risk/frame`

リスク分析フレーム（影響度軸・発生可能性軸・変更差分軸・ステークホルダー別影響枠・リスクスコア算出式・スコアから優先度への写像）を構造化データ（JSON）として公開する。

### Tool: `generate_test_cases`

テスト条件からテストケース仕様を導出する。二層構成: (1) 決定的層は、境界値分析・同値分割・状態遷移の各入力から網羅対象一覧を機械的に構築し、網羅率カウント・未充足の網羅対象・テスト条件×テストケーストレーサビリティ・ケースIDの重複/欠番/プレフィックス不一致・由来メタデータの未解決参照・期待結果の主観語/空欄・手順の粒度・閾値の直値埋め込みを決定的に検査する。(2) 意味的層は、テストケース本文（前提条件・手順・期待結果）の組み立てのみを呼び出し側LLMへの指示として返す。`testCases` が未指定・空の場合は「生成指示のみ」の出力になる。`derivedFrom` は ID 文字列に加えて `{kind, id}` 形式（`requirement` / `risk` / `stakeholder` / `guideword`）で種別を明示でき、`riskIds` / `personaIds` を渡すと種別ごとに対応する母集団と照合する。`requirementSources` / `testConditions[].sourceRefs` / `testCases[].sourceRefs` を渡すと、対象テスト条件表・ケース詳細・トレーサビリティ表に根拠位置（文書名・行番号）が引き継がれる。

### Prompt: `test_design_interview`

質問形式でテスト設計のコンテキストを収集するためのガイド。対象テスト条件・テストベースの特徴・境界値/同値クラス・状態遷移・因子水準・前提条件・閾値パラメータ等を確認し、`generate_test_cases` を呼び出すようアシスタントを誘導する。任意引数 `subjectName` を受け取る。

### Resource: `testdesign://techniques/catalog`

テスト技法カタログ（自作パラフレーズ、境界値分析・同値分割・デシジョンテーブル・状態遷移・ペアワイズ・ユースケース/シナリオ・CRUD/データライフサイクル・競合/タイミング・探索的テスト/エラー推測/チェックリストベースドテストの13技法）と、テストベースの特徴からの技法選定決定表（10行）を構造化データ（JSON）として公開する。`generate_test_cases` / `generate_exploratory_charters` が技法推奨と網羅基準表示に利用する。

### Tool: `review_test_specification`

「テストベースに対してテスト仕様書が十分か」を評価軸に、テストベース文書一式とテスト仕様書本文（フォーマット不問）、任意の `testCases` / `testConditions` / `risks` を入力として受け取る。要件ID・テスト条件ID・リスクIDの3系統について双方向カバレッジ（forward: 未カバーID、reverse: 根拠不明・過剰テスト候補）を構築し、ID表記の同期（`EH100` と `EH-100` の表記ゆれ）・ケースIDの重複・期待結果の空欄・優先度の付与状況と判定基準の宣言有無・前提条件のプレースホルダー・手順数と期待結果数のバランス・主観語・網羅基準の宣言有無を決定的に検査する。意味的レビュー用チェックリスト（14項目）と改善提案を併せて返す。`testCases` 未指定時はID抽出ベースの簡易チェックのみを返す。

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
