import type { QualityCharacteristicModel } from "../types.js";

// 広く使われている製品品質特性の考え方を参考に、テスト分析で使いやすい形へ
// 独自に再整理した特性モデル。定義文・着眼点はすべて自作のパラフレーズであり、
// 特定規格の逐語転載ではない（規格番号・準拠表記は意図的に含めない）。
export const qualityCharacteristicModel: QualityCharacteristicModel = {
  name: "製品品質特性モデル（自作整理）",
  note:
    "広く使われている製品品質の考え方を参考に独自に整理したものであり、規格本文の転載や特定の外部基準への適合を主張するものではない。",
  characteristics: [
    {
      id: "QC-01",
      nameJa: "機能適合性",
      nameEn: "functional suitability",
      summary: "利用者が必要とする機能を、過不足なく正しく実現できているかを表す特性。",
      subCharacteristics: [
        {
          id: "QC-01-01",
          nameJa: "完全性",
          nameEn: "completeness",
          focus: [
            "要件で定義された機能が漏れなく実装されているか",
            "業務フロー上、必要な操作の入口・出口がすべて用意されているか",
          ],
          relatedTestTypes: ["functional-testing"],
        },
        {
          id: "QC-01-02",
          nameJa: "正確性",
          nameEn: "correctness",
          focus: [
            "計算結果や判定結果が仕様どおりの値になるか",
            "境界値・特殊値を含めて期待結果と一致するか",
          ],
          relatedTestTypes: ["functional-testing", "test-condition"],
        },
        {
          id: "QC-01-03",
          nameJa: "適切性",
          nameEn: "appropriateness",
          focus: [
            "実現された機能が利用目的・利用シーンに合っているか",
            "類似機能との使い分けが利用者にとって迷いにくいか",
          ],
          relatedTestTypes: ["functional-testing", "test-perspective"],
        },
      ],
    },
    {
      id: "QC-02",
      nameJa: "性能効率性",
      nameEn: "performance efficiency",
      summary: "限られた資源・時間の中で、期待される処理能力を発揮できるかを表す特性。",
      subCharacteristics: [
        {
          id: "QC-02-01",
          nameJa: "時間効率性",
          nameEn: "time behaviour",
          focus: [
            "応答時間・処理時間が想定した範囲に収まるか",
            "想定される最大負荷時にも許容できる応答が保てるか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
        {
          id: "QC-02-02",
          nameJa: "資源効率性",
          nameEn: "resource utilization",
          focus: [
            "CPU・メモリ・ストレージ等の使用量が想定範囲内か",
            "長時間稼働時に資源使用量が単調に増え続けないか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
        {
          id: "QC-02-03",
          nameJa: "キャパシティ",
          nameEn: "capacity",
          focus: [
            "想定される最大同時利用者数・データ量に耐えられるか",
            "上限を超えた場合の挙動が安全側か",
          ],
          relatedTestTypes: ["non-functional-testing", "system-testing"],
        },
      ],
    },
    {
      id: "QC-03",
      nameJa: "互換性",
      nameEn: "compatibility",
      summary: "他のシステムや環境と共存・連携できるかを表す特性。",
      subCharacteristics: [
        {
          id: "QC-03-01",
          nameJa: "共存性",
          nameEn: "co-existence",
          focus: [
            "同一環境上の他システムと資源を奪い合わず動作できるか",
            "他システムの動作に悪影響を与えないか",
          ],
          relatedTestTypes: ["integration-testing", "non-functional-testing"],
        },
        {
          id: "QC-03-02",
          nameJa: "相互運用性",
          nameEn: "interoperability",
          focus: [
            "外部システムとのデータ連携・API連携が仕様どおり成立するか",
            "連携先の異常応答時にも適切にハンドリングできるか",
          ],
          relatedTestTypes: ["integration-testing"],
        },
      ],
    },
    {
      id: "QC-04",
      nameJa: "使用性",
      nameEn: "usability",
      summary: "利用者が目的を達成するまでの分かりやすさ・使いやすさを表す特性。",
      subCharacteristics: [
        {
          id: "QC-04-01",
          nameJa: "認知的な把握しやすさ",
          nameEn: "appropriateness recognizability",
          focus: [
            "初めて画面を見た利用者が用途を理解できるか",
            "操作の結果が視覚的に分かりやすくフィードバックされるか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
        {
          id: "QC-04-02",
          nameJa: "習得しやすさ",
          nameEn: "learnability",
          focus: [
            "マニュアルなしで基本操作を習得できるか",
            "ヘルプ・ガイダンスが必要な場面で提供されているか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
        {
          id: "QC-04-03",
          nameJa: "運用しやすさ",
          nameEn: "operability",
          focus: [
            "日常的な操作の手数が過剰でないか",
            "頻出操作にショートカットや一括処理が用意されているか",
          ],
          relatedTestTypes: ["non-functional-testing", "acceptance-testing"],
        },
        {
          id: "QC-04-04",
          nameJa: "ユーザーエラー防止",
          nameEn: "user error protection",
          focus: [
            "誤操作・誤入力を事前に防ぐ仕組みがあるか",
            "取り消し不可な操作の前に確認が入るか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
      ],
    },
    {
      id: "QC-05",
      nameJa: "信頼性",
      nameEn: "reliability",
      summary: "決められた条件下で機能を継続して発揮できるかを表す特性。",
      subCharacteristics: [
        {
          id: "QC-05-01",
          nameJa: "成熟性",
          nameEn: "maturity",
          focus: [
            "通常運用条件下で障害が発生しにくいか",
            "既知の不具合が主要な業務シナリオに残っていないか",
          ],
          relatedTestTypes: ["system-testing", "non-functional-testing"],
        },
        {
          id: "QC-05-02",
          nameJa: "可用性",
          nameEn: "availability",
          focus: [
            "必要な時間帯にサービスが利用可能な状態を保てるか",
            "計画メンテナンス以外での停止が想定より多くないか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
        {
          id: "QC-05-03",
          nameJa: "障害許容性",
          nameEn: "fault tolerance",
          focus: [
            "一部機能・一部コンポーネントの異常時に全体が停止しないか",
            "異常系入力に対して想定外の停止をしないか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
        {
          id: "QC-05-04",
          nameJa: "回復性",
          nameEn: "recoverability",
          focus: [
            "障害発生後、想定時間内にサービスを復旧できるか",
            "復旧後にデータの整合性が保たれているか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
      ],
    },
    {
      id: "QC-06",
      nameJa: "セキュリティ",
      nameEn: "security",
      summary: "情報や機能を不正なアクセス・改ざんから保護できるかを表す特性。",
      subCharacteristics: [
        {
          id: "QC-06-01",
          nameJa: "機密性",
          nameEn: "confidentiality",
          focus: [
            "権限のない利用者が情報にアクセスできないか",
            "アクセス制御が権限区分どおりに機能するか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
        {
          id: "QC-06-02",
          nameJa: "インテグリティ",
          nameEn: "integrity",
          focus: [
            "データが不正に書き換えられていないことを検証できるか",
            "改ざん検知の仕組みが機能するか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
        {
          id: "QC-06-03",
          nameJa: "否認防止性",
          nameEn: "non-repudiation",
          focus: [
            "実施した操作を後から本人が否認できない証跡が残るか",
          ],
          relatedTestTypes: [],
        },
        {
          id: "QC-06-04",
          nameJa: "責任追跡性",
          nameEn: "accountability",
          focus: [
            "操作履歴から実行者・実行内容を追跡できるか",
          ],
          relatedTestTypes: [],
        },
        {
          id: "QC-06-05",
          nameJa: "真正性",
          nameEn: "authenticity",
          focus: [
            "利用者・システムの身元が正しく認証されるか",
            "なりすましによるアクセスを防止できるか",
          ],
          relatedTestTypes: ["non-functional-testing"],
        },
      ],
    },
    {
      id: "QC-07",
      nameJa: "保守性",
      nameEn: "maintainability",
      summary: "変更・修正・解析のしやすさを表す特性。",
      subCharacteristics: [
        {
          id: "QC-07-01",
          nameJa: "モジュール性",
          nameEn: "modularity",
          focus: [
            "機能が独立したモジュールに分割されているか",
            "一部モジュールの変更が他へ波及しにくい構造か",
          ],
          relatedTestTypes: ["component-testing", "structural-testing"],
        },
        {
          id: "QC-07-02",
          nameJa: "再利用性",
          nameEn: "reusability",
          focus: [
            "共通処理が他機能・他プロジェクトで再利用できる形になっているか",
          ],
          relatedTestTypes: ["component-testing"],
        },
        {
          id: "QC-07-03",
          nameJa: "解析性",
          nameEn: "analysability",
          focus: [
            "不具合発生時に原因箇所を特定しやすいログ・情報が残るか",
          ],
          relatedTestTypes: ["structural-testing"],
        },
        {
          id: "QC-07-04",
          nameJa: "修正性",
          nameEn: "modifiability",
          focus: [
            "仕様変更時の修正影響範囲が局所化されているか",
            "修正が既存機能に副作用を与えないか",
          ],
          relatedTestTypes: ["change-related-testing"],
        },
        {
          id: "QC-07-05",
          nameJa: "試験性",
          nameEn: "testability",
          focus: [
            "テスト用のフックやモック差し替えが可能な作りか",
            "テストに必要な状態設定・観測が容易か",
          ],
          relatedTestTypes: ["component-testing", "test-condition"],
        },
      ],
    },
    {
      id: "QC-08",
      nameJa: "移植性",
      nameEn: "portability",
      summary: "異なる環境へ移行・設置・置き換えできるかを表す特性。",
      subCharacteristics: [
        {
          id: "QC-08-01",
          nameJa: "適応性",
          nameEn: "adaptability",
          focus: [
            "異なるOS・ブラウザ・端末で動作環境に合わせて動くか",
          ],
          relatedTestTypes: ["system-testing"],
        },
        {
          id: "QC-08-02",
          nameJa: "設置性",
          nameEn: "installability",
          focus: [
            "導入手順どおりにインストール・初期設定が完了できるか",
            "アンインストール時に環境が正しく元に戻るか",
          ],
          relatedTestTypes: ["acceptance-testing"],
        },
        {
          id: "QC-08-03",
          nameJa: "置換性",
          nameEn: "replaceability",
          focus: [
            "旧システム・旧バージョンからの切り替えが円滑に行えるか",
            "移行データが欠落・破損なく引き継がれるか",
          ],
          relatedTestTypes: ["change-related-testing"],
        },
      ],
    },
  ],
};
