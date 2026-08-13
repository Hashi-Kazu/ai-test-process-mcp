// interview prompt の共有型と純関数。
// 型定義と純関数だけを持ち、ローダー／レジストリのような抽象化は持たない。
// 乱数・現在時刻・I/O は使わない（同一入力に対して同一出力）。

export interface InterviewTopic {
  id: string;
  titleJa: string;
  required: boolean;
  guidance: string;
  /** 対象ツールの入力キーへの収集先式。" / " 区切りで複数指定可 */
  collectTo: string;
}

/** 専用の入力キーを持たない topic の collectTo 先頭マーカー（RI-08 の既存表記に合わせる） */
export const COLLECT_TO_NO_KEY_PREFIX = "(専用の入力キーなし";

/**
 * collectTo から対象ツールの入力トップレベルキーだけを取り出す。
 * " / " で分割し、各要素の先頭から `[` `.` `（` `(` の直前までをキーとみなす。
 * COLLECT_TO_NO_KEY_PREFIX で始まる要素は結果に含めない。
 */
export function extractCollectToRootKeys(collectTo: string): string[] {
  const keys: string[] = [];
  for (const rawPart of collectTo.split(" / ")) {
    const part = rawPart.trim();
    if (part === "") continue;
    if (part.startsWith(COLLECT_TO_NO_KEY_PREFIX)) continue;
    const key = part.split(/[[.（(]/)[0].trim();
    if (key === "") continue;
    keys.push(key);
  }
  return keys;
}

export interface InterviewPromptSpec {
  /** 対象ツール名。例 "extract_test_conditions" */
  toolName: string;
  /** 冒頭の役割文。例 "テスト条件抽出"（"あなたは{roleJa}の聞き手です。" に埋め込む） */
  roleJa: string;
  topics: readonly InterviewTopic[];
  subjectName?: string;
  /** "進め方:" 配下の既定3行の「前」へ差し込む追加行（各行に先頭 "- " を含めた完成形で渡す） */
  extraProcedureLines?: readonly string[];
  /** 末尾の締め行の後ろへ連結する追加文（先頭に空白等は付けない） */
  extraClosingText?: string;
}

/** 既存4本と同一フォーマットの本文を生成する純関数 */
export function buildInterviewPromptText(spec: InterviewPromptSpec): string {
  const lines: string[] = [];
  const target = spec.subjectName?.trim() ? `「${spec.subjectName.trim()}」` : "対象システム";

  lines.push(
    `あなたは${spec.roleJa}の聞き手です。${target}について ${spec.toolName} ツールを呼び出すため、` +
      `以下の項目についてユーザーに1〜3項目ずつ順に質問し、回答を集めてください。`
  );
  lines.push("");
  lines.push("進め方:");
  for (const line of spec.extraProcedureLines ?? []) {
    lines.push(line);
  }
  lines.push("- 必須(★)の項目を優先し、一度に多く聞きすぎない。");
  lines.push("- ユーザーが「不明」「後で」と答えた項目はスキップしてよい。");
  lines.push(`- ひととおり集まったら ${spec.toolName} を呼び出す。`);
  lines.push("");
  lines.push("## 質問項目");
  lines.push("");

  for (const topic of spec.topics) {
    const star = topic.required ? "★" : "・";
    lines.push(`${star} [${topic.titleJa}] — ${topic.guidance}`);
    lines.push(`   （収集先: ${topic.collectTo}）`);
  }

  lines.push("");
  lines.push(
    `上記の質問が終わったら、収集した回答を ${spec.toolName} ツールの引数にマッピングして呼び出してください。` +
      (spec.extraClosingText ?? "")
  );

  return lines.join("\n");
}
