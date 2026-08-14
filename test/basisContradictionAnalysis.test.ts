import { describe, expect, it } from "vitest";
import {
  buildBasisLines,
  buildContradictionCandidates,
  buildRevisionReconciliation,
  checkDeclaredVsBodySubjectMismatch,
  checkMinorityTransitionTarget,
  checkRevisionResidual,
  checkUiLabelMismatch,
  checkUndescribedOperationElements,
  checkUnresolvedTransitionTarget,
  classifyEntityNameFragment,
  extractEntityOccurrences,
  extractEntityOccurrencesWithQuality,
  extractRevisionClaims,
  extractTransitions,
  extractUiElements,
} from "../src/basisContradictionAnalysis.js";
import type { BasisTransition, TestBasisDocument } from "../src/types.js";

describe("buildBasisLines / extractTransitions - 正規化", () => {
  it("正規化: 全角スペース埋めのラベルと1文字ごとに空白が入った行から同じトリガ・遷移先を抽出する", () => {
    const documents: TestBasisDocument[] = [
      { name: "docA", content: "「予約購入詳細へ」を押すと予約購入詳細画面に遷移する" },
      {
        name: "docB",
        content: "「 予 約 購 入 詳 細 へ 」 を 押 す と 予 約 購 入 詳 細 画 面 に 遷 移 す る",
      },
    ];
    const lines = buildBasisLines(documents);
    const transitions = extractTransitions(lines);
    expect(transitions).toHaveLength(2);
    expect(transitions[0].trigger).toBe(transitions[1].trigger);
    expect(transitions[0].targetName).toBe(transitions[1].targetName);
    expect(transitions[0].trigger).toBe("予約購入詳細へ");
  });
});

describe("buildBasisLines / extractUiElements - 表セル折返し", () => {
  it("表セル折返し: 次行がUI種別語で始まる場合に前行と結合して画面部品ラベルを抽出する", () => {
    const documents: TestBasisDocument[] = [{ name: "doc", content: "001予約日\nラジオボタン" }];
    const lines = buildBasisLines(documents);
    expect(lines).toHaveLength(1);
    const elements = extractUiElements(lines);
    expect(elements).toContainEqual(
      expect.objectContaining({ label: "予約日", elementKind: "ラジオボタン", source: "table-row" })
    );
  });
});

describe("BC-02: 構成要素ラベルの表記不一致", () => {
  it("BC-02: 同一画面IDの構成要素ラベルが接頭辞関係で食い違う場合にhighの候補を出す", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "21号",
        content: "W-008-04 予約詳細画面\n「予約購入詳細へ」ボタンを押すと予約購入詳細画面に遷移する",
      },
      {
        name: "22号",
        content: "W-008-04 予約詳細画面\n「予約購入詳細へする」ボタンを押すと予約購入詳細画面に遷移する",
      },
    ];
    const lines = buildBasisLines(documents);
    const uiElements = extractUiElements(lines);
    const candidates = checkUiLabelMismatch(uiElements);
    expect(candidates.length).toBeGreaterThan(0);
    const c = candidates[0];
    expect(c.checkId).toBe("BC-02");
    expect(c.confidence).toBe("high");
    expect(c.subject).toBe("W-008-04");
    expect(c.differingValues).toEqual(expect.arrayContaining(["予約購入詳細へ", "予約購入詳細へする"]));
  });
});

describe("BC-05: 未定義の遷移先・表示先", () => {
  it("BC-05: ID併記のない遷移先が名称カタログに無い場合に候補を出し、ID併記の遷移先は候補にしない", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc",
        content: [
          "EH-100 発券機起動画面",
          "「開始」ボタンを押すと未知案内画面に遷移する",
          "「終了」ボタンを押すとEH-100発券機起動画面に遷移する",
        ].join("\n"),
      },
    ];
    const lines = buildBasisLines(documents);
    const occurrences = extractEntityOccurrences(lines);
    const transitions = extractTransitions(lines);
    const candidates = checkUnresolvedTransitionTarget(transitions, occurrences, undefined);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].checkId).toBe("BC-05");
    expect(candidates[0].confidence).toBe("medium");
    expect(candidates[0].subject).toBe("未知案内画面");
  });
});

describe("BC-06: 振る舞い未記述の操作要素", () => {
  it("BC-06: 構成宣言のみで振る舞い文を持たない操作要素を候補にし、画面部品表の説明列は振る舞い文とみなさない", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc",
        content: [
          "020確定を選択すると次へ進むボタン",
          "「開始」ボタンを押すと初期画面に遷移する",
          "「確認」チェックボックス",
        ].join("\n"),
      },
    ];
    const lines = buildBasisLines(documents);
    const uiElements = extractUiElements(lines);
    const candidates = checkUndescribedOperationElements(uiElements, lines);
    const subjects = candidates.map((c) => c.subject);

    // 「開始」は同一文書内に振る舞い文(を押すと〜に遷移する)があるため候補にならない
    expect(subjects).not.toContain("開始");
    // 「確認」は振る舞い文が無いため候補になる
    expect(subjects).toContain("確認");
    // 画面部品表(table-row)の行自体に含まれる「を選択すると」は振る舞い文の母集団から除外されるため、
    // そのラベル自身も振る舞い未記述として候補になる
    expect(candidates.some((c) => c.checkId === "BC-06" && c.confidence === "medium")).toBe(true);
  });
});

describe("BC-07: 一覧宣言と本文実体の主題不一致", () => {
  function buildFixture(subjectLine: string): TestBasisDocument[] {
    return [
      {
        name: "doc",
        content: [
          "EH-100 チケット購入完了",
          "システムは処理を実行する",
          subjectLine,
          "EH-200 予約確認",
          "対象時刻に更新する",
        ].join("\n"),
      },
    ];
  }

  it("BC-07: 主題語が他IDの宣言名に一致する場合だけ候補にし、未知語の主題語では候補にしない", () => {
    const matchingDocs = buildFixture("■予約確認のお知らせ");
    const matchingLines = buildBasisLines(matchingDocs);
    const matchingOccurrences = extractEntityOccurrences(matchingLines);
    const matchingCandidates = checkDeclaredVsBodySubjectMismatch(matchingOccurrences, matchingLines);
    expect(matchingCandidates).toHaveLength(1);
    expect(matchingCandidates[0].checkId).toBe("BC-07");
    expect(matchingCandidates[0].confidence).toBe("high");

    const unknownDocs = buildFixture("■謎の通知のお知らせ");
    const unknownLines = buildBasisLines(unknownDocs);
    const unknownOccurrences = extractEntityOccurrences(unknownLines);
    const unknownCandidates = checkDeclaredVsBodySubjectMismatch(unknownOccurrences, unknownLines);
    expect(unknownCandidates).toHaveLength(0);
  });
});

describe("BC-09: 改訂宣言の旧値が本文に残存", () => {
  it("BC-09: 改訂宣言の旧値が本文に残存する場合はhigh、残存しない場合は反映済みとして記録する", () => {
    const residualDocs: TestBasisDocument[] = [
      {
        name: "doc",
        content: ["2026/03/01V1.2.0上限件数を10件→20件に変更", "システムは上限件数を10件までとする"].join("\n"),
      },
    ];
    const residualLines = buildBasisLines(residualDocs);
    const residualClaims = extractRevisionClaims(residualLines);
    expect(residualClaims).toHaveLength(1);
    const residualRows = buildRevisionReconciliation(residualClaims, residualLines);
    expect(residualRows).toHaveLength(1);
    expect(residualRows[0].status).toBe("residual");
    const residualCandidates = checkRevisionResidual(residualRows);
    expect(residualCandidates).toHaveLength(1);
    expect(residualCandidates[0].checkId).toBe("BC-09");
    expect(residualCandidates[0].confidence).toBe("high");

    const resolvedDocs: TestBasisDocument[] = [
      {
        name: "doc",
        content: ["2026/03/01V1.2.0上限件数を10件→20件に変更", "システムは上限件数を20件までとする"].join("\n"),
      },
    ];
    const resolvedLines = buildBasisLines(resolvedDocs);
    const resolvedClaims = extractRevisionClaims(resolvedLines);
    const resolvedRows = buildRevisionReconciliation(resolvedClaims, resolvedLines);
    expect(resolvedRows).toHaveLength(1);
    expect(resolvedRows[0].status).toBe("resolved");
    expect(checkRevisionResidual(resolvedRows)).toHaveLength(0);
  });
});

describe("BC-10: 少数派の遷移先(参考)", () => {
  it("BC-10: 同一トリガの少数派遷移先をlowで出す", () => {
    const makeTransition = (lineIndex: number, targetName: string): BasisTransition => ({
      sourceId: null,
      document: "doc",
      lineIndex,
      trigger: "戻る",
      targetId: null,
      targetName,
      targetKind: "name",
    });
    const transitions: BasisTransition[] = [
      makeTransition(0, "前画面"),
      makeTransition(1, "前画面"),
      makeTransition(2, "前画面"),
      makeTransition(3, "前画面"),
      makeTransition(4, "前画面"),
      makeTransition(5, "初期画面"),
    ];
    const candidates = checkMinorityTransitionTarget(transitions);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].checkId).toBe("BC-10");
    expect(candidates[0].confidence).toBe("low");
    expect(candidates[0].differingValues).toEqual(["初期画面"]);
  });
});

describe("classifyEntityNameFragment: NF-01 短すぎる名称候補", () => {
  it("NF-01: 2文字以下は除外し、3文字以上は採用する", () => {
    expect(classifyEntityNameFragment("い")).toBe("NF-01");
    expect(classifyEntityNameFragment("ゲート")).toBeNull();
  });
});

describe("classifyEntityNameFragment: NF-02 閉じ記号・読点・句点で始まる断片", () => {
  it("NF-02: 閉じ括弧・鉤括弧閉じ・読点・句点で始まる断片を除外する", () => {
    expect(classifyEntityNameFragment(")を表示し")).toBe("NF-02");
    expect(classifyEntityNameFragment("」を押す")).toBe("NF-02");
    expect(classifyEntityNameFragment("、確認画面")).toBe("NF-02");
    expect(classifyEntityNameFragment("。以上")).toBe("NF-02");
  });
});

describe("classifyEntityNameFragment: NF-03 助詞または読点で終わる断片", () => {
  it("NF-03: 助詞・読点で終わる断片を除外し、助詞で終わらない名称は採用する", () => {
    expect(classifyEntityNameFragment("パスワードの")).toBe("NF-03");
    expect(classifyEntityNameFragment("入場ゲートを")).toBe("NF-03");
    expect(classifyEntityNameFragment("券売機、")).toBe("NF-03");
    expect(classifyEntityNameFragment("氏名が入力されていません")).toBeNull();
  });
});

describe("classifyEntityNameFragment: NF-04 波ダッシュ・チルダのみ", () => {
  it("NF-04: 波ダッシュ・チルダのみの断片を除外する", () => {
    expect(classifyEntityNameFragment("~")).not.toBeNull();
    expect(classifyEntityNameFragment("～～")).not.toBeNull();
    expect(classifyEntityNameFragment("〜〜〜")).toBe("NF-04");
  });
});

describe("classifyEntityNameFragment: 判定順序", () => {
  it("NF-01→NF-02→NF-03→NF-04 の固定順で最初に一致したルールIDを返す(例: 短い波ダッシュはNF-04でなくNF-01)", () => {
    expect(classifyEntityNameFragment("~")).toBe("NF-01");
  });
});

describe("extractEntityOccurrencesWithQuality / extractEntityOccurrences", () => {
  it("抽出品質フィルタで除外された断片は occurrences に含めず excluded に積み、採用名だけが occurrences に残る", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "doc",
        content: ["EH-300 発券機起動", "EH-300 い", "EH-300 パスワードの"].join("\n"),
      },
    ];
    const lines = buildBasisLines(documents);
    const { occurrences, excluded } = extractEntityOccurrencesWithQuality(lines);

    expect(occurrences.map((o) => o.name)).toEqual(["発券機起動"]);
    expect(excluded).toEqual([
      { id: "EH-300", document: "doc", lineIndex: 1, name: "い", ruleId: "NF-01" },
      { id: "EH-300", document: "doc", lineIndex: 2, name: "パスワードの", ruleId: "NF-03" },
    ]);

    expect(extractEntityOccurrences(lines)).toEqual(occurrences);
  });

  it("断片除外により同一IDの残存名称が1種になった場合、BC-01候補は生成されない", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc", content: ["EH-400 発券機起動", "EH-400 い"].join("\n") },
    ];
    const candidates = buildContradictionCandidates(documents);
    expect(candidates.filter((c) => c.checkId === "BC-01" && c.subject === "EH-400")).toHaveLength(0);
  });
});

describe("EH-100 回帰: 真陽性の名称不一致は抽出品質フィルタで消えない", () => {
  it("離れた2行に異なる名称を持つ同一IDはBC-01候補として1件残り、除外もされない", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "11_園内チケットシステム要求仕様書",
        content: [
          "EH-100 発券機起動",
          "システムは起動処理を実行する",
          "EH-200 予約確認",
          "対象時刻に更新する",
          "EH-100 ゲートハブ起動",
        ].join("\n"),
      },
    ];
    const lines = buildBasisLines(documents);
    const { excluded } = extractEntityOccurrencesWithQuality(lines);
    expect(excluded.some((e) => e.name === "発券機起動" || e.name === "ゲートハブ起動")).toBe(false);

    const candidates = buildContradictionCandidates(documents);
    const bc01 = candidates.filter((c) => c.checkId === "BC-01" && c.subject === "EH-100");
    expect(bc01).toHaveLength(1);
    expect(bc01[0].confidence).toBe("high");
    expect(bc01[0].differingValues).toEqual(expect.arrayContaining(["発券機起動", "ゲートハブ起動"]));
  });
});

describe("候補番号の決定的採番", () => {
  it("候補番号は checkId → subject → document → lineIndex の順で決定的に採番される", () => {
    const documents: TestBasisDocument[] = [
      {
        name: "21号",
        content: [
          "W-008-04 予約詳細画面",
          "「予約購入詳細へ」ボタンを押すと予約購入詳細画面に遷移する",
          "「開始」ボタンを押すと未知案内画面に遷移する",
        ].join("\n"),
      },
      {
        name: "22号",
        content: ["W-008-04 予約詳細画面", "「予約購入詳細へする」ボタンを押すと予約購入詳細画面に遷移する"].join(
          "\n"
        ),
      },
    ];
    const run1 = buildContradictionCandidates(documents);
    const run2 = buildContradictionCandidates(documents);
    expect(run1).toEqual(run2);
    expect(run1.length).toBeGreaterThan(0);
    const numbers = run1.map((c) => c.no);
    expect(new Set(numbers).size).toBe(numbers.length);
    // checkId昇順であることの確認
    const checkIds = run1.map((c) => c.checkId);
    const sortedCheckIds = [...checkIds].sort();
    expect(checkIds).toEqual(sortedCheckIds);
  });
});

describe("buildBasisLines / extractEntityOccurrencesWithQuality - idPatterns 伝播 (HSKZ-221)", () => {
  it("表形式・行頭パイプ: idPatternsで数字のみのIDを行頭IDとして検出する", () => {
    const idPatterns = ["(?<![0-9A-Za-z])(\\d{3})\\s*\\|\\s*(\\d{1,3})(?![0-9A-Za-z])"];
    const documents: TestBasisDocument[] = [
      { name: "item-definition", content: "|  | 031 | 1 | 独自施策システム等ID |" },
    ];
    const lines = buildBasisLines(documents, { idPatterns });
    expect(lines[0].currentId).toBe("031-1");
  });

  it("1グループパターン: '-undefined' を生成しない", () => {
    const idPatterns = ["(?<=^\\|\\s{0,3})\\d{1,3}\\s*\\|(?:\\s*\\|)*\\s*(E\\d{4})(?![0-9A-Za-z])"];
    const documents: TestBasisDocument[] = [{ name: "doc", content: "| 1 | E1234 |" }];
    const lines = buildBasisLines(documents, { idPatterns });
    expect(lines[0].currentId).toBe("E1234");
    expect(lines[0].currentId).not.toContain("undefined");
  });

  it("extractEntityOccurrencesWithQualityにidPatternsを渡すとID出現数に反映される", () => {
    const idPatterns = ["(?<![0-9A-Za-z])(\\d{3})\\s*\\|\\s*(\\d{1,3})(?![0-9A-Za-z])"];
    const documents: TestBasisDocument[] = [
      { name: "item-definition", content: "|  | 031 | 1 | 独自施策システム等ID |" },
    ];
    const lines = buildBasisLines(documents, { idPatterns });
    const { occurrences } = extractEntityOccurrencesWithQuality(lines, { idPatterns });
    expect(occurrences.some((o) => o.id === "031-1")).toBe(true);
  });

  it("optionsを渡さない既存呼び出しは既定パターンのみで動作する(挙動不変)", () => {
    const documents: TestBasisDocument[] = [
      { name: "doc", content: "W-008-04 予約詳細画面\n本文" },
    ];
    const lines = buildBasisLines(documents);
    const occurrences = extractEntityOccurrences(lines);
    expect(occurrences.some((o) => o.id === "W-008-04")).toBe(true);
  });
});
