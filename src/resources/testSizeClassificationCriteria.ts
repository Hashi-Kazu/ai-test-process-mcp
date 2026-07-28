import type { TestSizeClassificationCriteria } from "../types.js";

// テストサイズ（スモール/ミディアム/ラージ）の分類基準。
// 「テストが何に依存するか」と「実行時間の上限」でサイズを決めるという考え方を参考にした自作の整理であり、
// 原典（Google Test Sizes を含む外部資料）の逐語転載はしない。判定軸名・説明文はすべて自作の日本語文。
export const testSizeClassificationCriteria: TestSizeClassificationCriteria = {
  name: "テストサイズ分類基準（外部依存・実行時間）",
  note:
    "Google Test Sizes の考え方（外部依存の有無と実行時間上限でテストを機械的に分類する）を参考にした独自整理であり、" +
    "原典の逐語転載を含まず、いずれの外部基準への適合も主張しない。テストレベル（コンポーネント/統合/システム/受け入れ）とは" +
    "別軸の指標として扱い、サイズ判定はテストレベル宣言の妥当性を点検するための客観的な補助線として使う。",
  dimensions: [
    {
      id: "TSD-01",
      nameJa: "外部ホストへのネットワークアクセス",
      question: "テスト実行中に、自マシン外のホスト（外部API・他環境のサーバ）への通信が発生するか。",
      note: "ループバック内で完結する通信は本軸に該当しない。",
    },
    {
      id: "TSD-02",
      nameJa: "永続データストア（DB）へのアクセス",
      question: "テスト実行中に、プロセス外の永続データストア（RDB・KVS等）への読み書きが発生するか。",
      note: "インメモリの代替実装で置き換えられている場合は該当しない。",
    },
    {
      id: "TSD-03",
      nameJa: "ファイルシステムへのアクセス",
      question: "テスト実行中に、実ファイル・実ディレクトリの読み書きが発生するか。",
    },
    {
      id: "TSD-04",
      nameJa: "別プロセス・別サービスの起動",
      question: "テスト実行のために、被テスト対象とは別のプロセスやサービスを起動・常駐させる必要があるか。",
    },
    {
      id: "TSD-05",
      nameJa: "複数スレッド・並行実行",
      question: "テストが複数スレッド・複数タスクの並行動作を前提としているか。",
    },
    {
      id: "TSD-06",
      nameJa: "実機・専用ハードウェア／周辺機器",
      question: "テスト実行に、実機・専用装置・周辺機器（読取機・プリンタ等）の接続が必要か。",
    },
    {
      id: "TSD-07",
      nameJa: "画面操作（UI）経由の実行",
      question: "テストの操作が画面（GUI・ブラウザ）を介して行われるか。",
    },
    {
      id: "TSD-08",
      nameJa: "実時間の経過待ち（待機・時刻依存）",
      question: "テストが実時間の経過待ちや、実時刻・日付の進行に依存するか。",
      note: "時刻を差し替えられる仕組みで制御している場合は該当しない。",
    },
  ],
  sizes: [
    {
      id: "TSZ-01",
      sizeId: "small",
      nameJa: "スモール",
      timeLimitSeconds: 60,
      allowedDimensionIds: [],
      description:
        "外部依存を一切持たず、単一プロセス・単一スレッド内で完結し、1件あたり60秒以内に完了するテスト。" +
        "失敗時の原因箇所が狭く、繰り返し実行しても結果が揺れないため、テストケースの主力に置く。",
      primaryTestLevelIds: ["component-testing"],
      acceptableTestLevelIds: ["component-testing", "integration-testing"],
      recommendedSharePercent: { min: 50, max: 80 },
    },
    {
      id: "TSZ-02",
      sizeId: "medium",
      nameJa: "ミディアム",
      timeLimitSeconds: 300,
      allowedDimensionIds: ["TSD-02", "TSD-03", "TSD-04", "TSD-05"],
      description:
        "同一マシン内に閉じた依存（データストア・ファイル・別プロセス・並行実行）までを許し、1件あたり300秒以内に完了するテスト。" +
        "外部ホストや実機、画面操作、実時間待ちを含む場合はこのサイズに収まらない。",
      primaryTestLevelIds: ["integration-testing"],
      acceptableTestLevelIds: ["integration-testing", "system-testing"],
      recommendedSharePercent: { min: 15, max: 35 },
    },
    {
      id: "TSZ-03",
      sizeId: "large",
      nameJa: "ラージ",
      timeLimitSeconds: 1800,
      allowedDimensionIds: ["TSD-01", "TSD-02", "TSD-03", "TSD-04", "TSD-05", "TSD-06", "TSD-07", "TSD-08"],
      description:
        "外部ホスト・実機・画面操作・実時間待ちを含む、環境全体を使うテスト。実行コストと結果の揺れが大きいため、" +
        "利用者視点で通しでしか確認できない振る舞いに絞る。1件あたり1800秒を超える場合はテストの分割を検討する。",
      primaryTestLevelIds: ["system-testing", "acceptance-testing"],
      acceptableTestLevelIds: ["system-testing", "acceptance-testing"],
      recommendedSharePercent: { min: 5, max: 20 },
    },
  ],
  notes: [
    "推奨構成比は設計時のバランスを点検するための目安であり、範囲外であること自体を不合格とする判定基準ではない。",
    "実行時間は設計時点の見積もり値として扱い、実測値の代替にはしない。実測後に見積もりを更新して再判定する。",
    "外部依存・実行時間のいずれも申告されていないテストケースは、サイズ分類そのものが成立しないため「判定不可」として扱う。",
    "サイズはテストレベルを決めるものではない。サイズとテストレベルの対応は妥当性を点検するための対応表であり、" +
      "不一致が出た場合はテストレベル宣言を見直すか、依存を代替実装へ置き換えてサイズを縮小するかのいずれかを検討する。",
  ],
};
