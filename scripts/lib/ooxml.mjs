// OOXML（.xlsx / .docx）共通の ZIP 読み出しと、シート/文書XMLをテキスト化するための純関数群。
//
// 用途:
//   scripts/extract-testbase-xlsx.mjs / scripts/extract-testbase-docx.mjs から使う参照実装。
//   規約は docs/ai/testbase-ingestion.md を正とする（本ファイルはその実装のみ）。
//
// 実装方針:
//   npm依存パッケージ（xlsx / mammoth 等）を追加せず、Node.js標準の node:zlib（inflateRawSync）だけで
//   ZIP（.xlsx/.docx はいずれも ZIP コンテナ）を読み出す。External Central Directory の
//   走査により各エントリの圧縮方式・圧縮サイズ・ローカルヘッダオフセットを得て、ローカルヘッダの
//   サイズ欄は使わない（データディスクリプタ使用時に0になるため）。
//
// 使い方（他モジュールから）:
//   import { readOoxmlEntries, parseSharedStrings, parseSheetRows, parseDrawingTexts, parseWordDocument, decodeXmlEntities }
//     from "./lib/ooxml.mjs";
//   const entries = readOoxmlEntries(await readFile("in.xlsx"));
//   const shared = parseSharedStrings(entries.get("xl/sharedStrings.xml") ?? "");
import { inflateRawSync } from "node:zlib";

const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_HEADER_SIGNATURE = 0x02014b50;

/**
 * ZIPバッファ（Buffer/Uint8Array）を読み、エントリ名 -> UTF-8文字列 の Map を返す。
 * 圧縮方式は 0(stored) と 8(deflate) のみ対応。それ以外は明示的にエラーにする。
 */
export function readOoxmlEntries(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // End Of Central Directory レコードを末尾から探す（コメント欄があるため固定オフセットにない）。
  const minEocdSize = 22;
  let eocdOffset = -1;
  for (let i = buf.length - minEocdSize; i >= 0; i--) {
    if (buf.readUInt32LE(i) === END_OF_CENTRAL_DIR_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("ZIP形式ではありません（End Of Central Directory レコードが見つかりません）");
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buf.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries = new Map();
  let offset = centralDirOffset;
  const centralDirEnd = centralDirOffset + centralDirSize;

  for (let i = 0; i < totalEntries && offset < centralDirEnd; i++) {
    const signature = buf.readUInt32LE(offset);
    if (signature !== CENTRAL_DIR_HEADER_SIGNATURE) {
      throw new Error(`Central Directory ヘッダの署名が不正です（offset=${offset}）`);
    }
    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const fileNameLength = buf.readUInt16LE(offset + 28);
    const extraFieldLength = buf.readUInt16LE(offset + 30);
    const fileCommentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const fileName = buf.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    const localSignature = buf.readUInt32LE(localHeaderOffset);
    if (localSignature !== 0x04034b50) {
      throw new Error(`ローカルファイルヘッダの署名が不正です（entry=${fileName}）`);
    }
    const localFileNameLength = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraFieldLength = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
    const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

    if (!fileName.endsWith("/")) {
      let content;
      if (compressionMethod === 0) {
        content = compressedData;
      } else if (compressionMethod === 8) {
        content = inflateRawSync(compressedData);
      } else {
        throw new Error(
          `未対応の圧縮方式です（entry=${fileName}, method=${compressionMethod}）。stored(0) と deflate(8) のみ対応。`,
        );
      }
      entries.set(fileName, content.toString("utf8"));
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

const XML_ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** XML実体参照（名前実体・10進数値実体・16進数値実体）を復号する。 */
export function decodeXmlEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (Number.isNaN(codePoint)) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    }
    return Object.prototype.hasOwnProperty.call(XML_ENTITY_MAP, body) ? XML_ENTITY_MAP[body] : match;
  });
}

/** `<t ...>...</t>` 要素のテキストを連結する（xml:space="preserve" は空白をそのまま保持）。 */
function extractTagTexts(xml, tagLocalName) {
  const pattern = new RegExp(`<(?:[\\w.]+:)?${tagLocalName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.]+:)?${tagLocalName}>`, "g");
  const texts = [];
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    texts.push(decodeXmlEntities(match[1]));
  }
  return texts;
}

/**
 * xl/sharedStrings.xml の <si> をパースし、共有文字列配列を返す。
 * <rPh>（ふりがな）は先に除去してから <t> を連結する（<rPh> 内にも <t> があるため順序が重要）。
 */
export function parseSharedStrings(xml) {
  const siPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  const result = [];
  let match;
  while ((match = siPattern.exec(xml)) !== null) {
    const siBody = match[1];
    // <rPh ...>...</rPh> を先に除去する（ふりがなのブロックごと落とす）。
    const withoutRuby = siBody.replace(/<(?:[\w.]+:)?rPh\b[^>]*>[\s\S]*?<\/(?:[\w.]+:)?rPh>/g, "");
    const texts = extractTagTexts(withoutRuby, "t");
    result.push(texts.join(""));
  }
  return result;
}

/** 列文字（A, B, ..., Z, AA, AB, ...）を 0 始まりの列インデックスへ変換する。 */
function columnLettersToIndex(letters) {
  let index = 0;
  for (const ch of letters) {
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index - 1;
}

/** セル参照（例 "B3"）から列文字部分を取り出す。 */
function columnLettersFromCellRef(cellRef) {
  const match = /^([A-Z]+)\d+$/.exec(cellRef);
  return match ? match[1] : null;
}

/**
 * シートXMLの <row> をパースし、行×列の文字列配列（string[][]）を返す。
 * 自己閉じセル（値なし）は空文字として位置を保持する。t="s" は共有文字列へ解決する。
 * t="inlineStr" は <is> 配下の <t> を連結する。t="str" / 無指定は <v> の生値を使う（数式 <f> は無視）。
 */
export function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const rowBody = rowMatch[1];
    const cells = [];
    // 自己閉じ <c .../> と、値を持つ <c ...>...</c> の両方を拾う。
    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowBody)) !== null) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2];
      const refMatch = /\br="([A-Z]+\d+)"/.exec(attrs);
      const colLetters = refMatch ? columnLettersFromCellRef(refMatch[1]) : null;
      const colIndex = colLetters ? columnLettersToIndex(colLetters) : cells.length;

      while (cells.length < colIndex) {
        cells.push("");
      }

      if (inner === undefined) {
        // 自己閉じセル: 値の無いセル。
        cells.push("");
        continue;
      }

      const typeMatch = /\bt="([^"]+)"/.exec(attrs);
      const type = typeMatch ? typeMatch[1] : null;

      if (type === "inlineStr") {
        const isMatch = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner);
        const texts = isMatch ? extractTagTexts(isMatch[1], "t") : [];
        cells.push(texts.join(""));
        continue;
      }

      const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
      const rawValue = valueMatch ? decodeXmlEntities(valueMatch[1]) : "";

      if (type === "s") {
        const idx = Number(rawValue);
        cells.push(Number.isFinite(idx) ? sharedStrings[idx] ?? "" : "");
      } else {
        // t="str" または無指定（数値/真偽値）: <v> の生値を使う。<f>（数式）は無視。
        cells.push(rawValue);
      }
    }

    // 末尾の空セルを削る。
    while (cells.length > 0 && cells[cells.length - 1] === "") {
      cells.pop();
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * 図形/テキストボックスの XML（xl/drawings/drawingN.xml）から、<xdr:sp> 単位に
 * <a:t> を連結したテキストの配列を出現順で返す。空文字は除く。
 */
export function parseDrawingTexts(xml) {
  const shapePattern = /<(?:[\w.]+:)?sp\b[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?sp>/g;
  const result = [];
  let match;
  while ((match = shapePattern.exec(xml)) !== null) {
    const texts = extractTagTexts(match[1], "t");
    const joined = texts.join("");
    if (joined !== "") {
      result.push(joined);
    }
  }
  return result;
}

/** pStyle の w:val からヘッダーレベル（1以上）を判定する。見出しでなければ null。 */
function headingLevelFromStyleVal(styleVal) {
  if (!styleVal) return null;
  const patterns = [/^Heading(\d+)$/i, /^heading\s*(\d+)$/i, /^見出し\s*(\d+)$/];
  for (const pattern of patterns) {
    const m = pattern.exec(styleVal.trim());
    if (m) {
      const level = Number(m[1]);
      if (Number.isFinite(level) && level >= 1) {
        return level;
      }
    }
  }
  return null;
}

/** 段落XML（<w:p>...</w:p> の中身）から w:pStyle の w:val を取得する。 */
function extractParagraphStyleVal(paragraphBody) {
  const attrsMatch = /<w:pStyle\b([^>]*)\/>/.exec(paragraphBody);
  if (!attrsMatch) return null;
  const valMatch = /w:val="([^"]*)"/.exec(attrsMatch[1]);
  return valMatch ? valMatch[1] : null;
}

/**
 * word/styles.xml から <w:style w:type="paragraph"> の w:styleId -> w:name（w:val）の対応表を作る。
 * styles.xml が空/未指定でも空Mapを返す（w:basedOn の継承チェーンは辿らない）。
 */
function parseStyleIdToName(stylesXml) {
  const map = new Map();
  if (!stylesXml) return map;
  const stylePattern = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g;
  let match;
  while ((match = stylePattern.exec(stylesXml)) !== null) {
    const attrs = match[1];
    const body = match[2];
    const typeMatch = /w:type="([^"]*)"/.exec(attrs);
    if (!typeMatch || typeMatch[1] !== "paragraph") continue;
    const idMatch = /w:styleId="([^"]*)"/.exec(attrs);
    if (!idMatch) continue;
    const nameMatch = /<w:name\b[^>]*w:val="([^"]*)"/.exec(body);
    if (!nameMatch) continue;
    map.set(idMatch[1], nameMatch[1]);
  }
  return map;
}

/**
 * 本文XML（<w:body>...</w:body> の中身）に含まれる TOC の複合フィールド
 * （<w:fldChar w:fldCharType="begin|separate|end"/> のスタック構造）を、段落をまたぐ範囲も含めて
 * 丸ごと除去する。
 *
 * 実データでは TOC の begin が段落Aに、対応する end が数十段落先の段落Bにあるため、段落単位の
 * 走査では除去できない（見出し番号+タイトル+ページ番号の目次エントリが本文へ混入する）。そこで
 * begin/separate/end を出現順にスタックで深さ管理し、begin〜separate間（separateが無い単純フィールド
 * の場合は begin〜end間）に <w:instrText> で `TOC` を含むものがあれば、対応する begin タグ開始位置〜
 * end タグ終了位置までを除去対象レンジとして記録する。記録したレンジのうち他のレンジに内包される
 * ものは除外し、最も外側のレンジのみを実際に文字列除去する（除去は単純な区間削除であり、XMLとして
 * 厳密に妥当な文字列を再構成する必要はない。後段の走査は <w:tbl>/<w:p> のみを対象にした正規表現走査
 * のため、タグの残骸が非妥当でも影響しない）。end に対応する begin が無い（壊れたXML）場合は無視する。
 */
function removeTocFieldSpans(bodyXml) {
  const fldCharPattern = /<w:fldChar\b[^>]*w:fldCharType="(begin|separate|end)"[^>]*\/>/g;
  const stack = [];
  const ranges = [];
  let match;
  while ((match = fldCharPattern.exec(bodyXml)) !== null) {
    const type = match[1];
    const tagStart = match.index;
    const tagEnd = match.index + match[0].length;

    if (type === "begin") {
      stack.push({ beginStart: tagStart, beginEnd: tagEnd, hasToc: false, instrChecked: false });
      continue;
    }

    if (type === "separate") {
      if (stack.length === 0) continue;
      const frame = stack[stack.length - 1];
      const segment = bodyXml.slice(frame.beginEnd, tagStart);
      frame.hasToc = /<w:instrText\b[^>]*>[^<]*\bTOC\b/.test(segment);
      frame.instrChecked = true;
      continue;
    }

    // type === "end"
    if (stack.length === 0) continue;
    const frame = stack.pop();
    if (!frame.instrChecked) {
      const segment = bodyXml.slice(frame.beginEnd, tagStart);
      frame.hasToc = /<w:instrText\b[^>]*>[^<]*\bTOC\b/.test(segment);
    }
    if (frame.hasToc) {
      ranges.push({ start: frame.beginStart, end: tagEnd });
    }
  }

  if (ranges.length === 0) return bodyXml;

  // 内包されるレンジを除外し、最も外側のレンジのみを残す（start昇順、同startならend降順）。
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const outerRanges = [];
  for (const range of ranges) {
    const last = outerRanges[outerRanges.length - 1];
    if (last && range.start >= last.start && range.end <= last.end) continue;
    outerRanges.push(range);
  }

  let result = "";
  let cursor = 0;
  for (const range of outerRanges) {
    result += bodyXml.slice(cursor, range.start);
    cursor = range.end;
  }
  result += bodyXml.slice(cursor);
  return result;
}

/**
 * 段落本体（<w:p>...</w:p> の中身）から、TOC フィールドの結果テキストを除去し、
 * 変更履歴（<w:del>/<w:delText> 除去、<w:ins> 採用）を適用したうえで、本文テキストを返す。
 */
function extractParagraphText(paragraphBody) {
  let body = paragraphBody;

  // TOC フィールド: <w:fldSimple w:instr="... TOC ...">結果</w:fldSimple> の中身を除去。
  body = body.replace(
    /<w:fldSimple\b[^>]*w:instr="[^"]*\bTOC\b[^"]*"[^>]*>([\s\S]*?)<\/w:fldSimple>/g,
    "",
  );

  // <w:del>...</w:del>（削除）と <w:delText>...</w:delText> を除去する。
  body = body.replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "");
  body = body.replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, "");

  // <w:ins>...</w:ins>（挿入）は中身を残すため、タグだけ剥がす。
  body = body.replace(/<\/?w:ins\b[^>]*>/g, "");

  const texts = extractTagTexts(body, "w:t");
  return texts.join("");
}

/** テーブルセル本体の改行・タブを半角空白へ畳み、パイプをエスケープする。 */
function normalizeTableCellText(text) {
  return text.replace(/[\n\t\r]+/g, " ").replace(/\|/g, "\\|").trim();
}

/**
 * word/document.xml をパースし、Markdownテキストを返す。
 * 見出し（w:pStyle の Heading<n>/見出し<n>）は `#`×n、表（<w:tbl>）はパイプ表へ変換する。
 * TOCフィールドの結果、削除履歴（<w:del>/<w:delText>）は除去し、挿入履歴（<w:ins>）は残す。
 *
 * TOCフィールドの除去は2系統ある: (1) 本文XML全体を対象に removeTocFieldSpans() が行う、
 * 段落をまたぐ複合フィールド（<w:fldChar> begin/separate/end）の除去（begin〜endが別の
 * <w:p> にまたがる場合に対応するため、<w:tbl>/<w:p> 走査の前に適用する）。(2) 段落単位の
 * extractParagraphText() が行う、単一段落内の <w:fldSimple> の除去。
 *
 * stylesXml（word/styles.xml、省略可）を渡すと、w:pStyle の w:val が数値/短縮スタイルIDで
 * 直接には見出し名判定できない場合に、styles.xml の w:styleId -> w:name 解決を経て
 * 同じ判定を試みる（2段階判定）。省略時は既存動作（直接名判定のみ）を維持する。
 */
export function parseWordDocument(xml, stylesXml) {
  const styleIdToName = parseStyleIdToName(stylesXml);
  const bodyMatch = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(xml);
  const body = removeTocFieldSpans(bodyMatch ? bodyMatch[1] : xml);

  const blocks = [];
  // <w:tbl> と <w:p> をXML中の出現順に走査する。
  const blockPattern = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let match;
  while ((match = blockPattern.exec(body)) !== null) {
    const raw = match[0];
    if (raw.startsWith("<w:tbl")) {
      const rowPattern = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
      const tableLines = [];
      let rowMatch;
      while ((rowMatch = rowPattern.exec(raw)) !== null) {
        const cellPattern = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
        const cellTexts = [];
        let cellMatch;
        while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
          const cellText = extractParagraphCellText(cellMatch[1]);
          cellTexts.push(normalizeTableCellText(cellText));
        }
        tableLines.push(`| ${cellTexts.join(" | ")} |`);
      }
      if (tableLines.length > 0) {
        blocks.push(tableLines.join("\n"));
      }
    } else {
      const styleVal = extractParagraphStyleVal(raw);
      let level = headingLevelFromStyleVal(styleVal);
      if (!level && styleVal && styleIdToName.has(styleVal)) {
        level = headingLevelFromStyleVal(styleIdToName.get(styleVal));
      }
      const text = extractParagraphText(raw);
      if (level) {
        blocks.push(`${"#".repeat(level)} ${text}`);
      } else if (text !== "") {
        blocks.push(text);
      }
    }
  }

  return blocks.join("\n\n");
}

/** テーブルセル内の全段落テキストを連結する（セル内複数段落は改行区切りとし、後段で空白へ畳む）。 */
function extractParagraphCellText(cellBody) {
  const paragraphPattern = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  const texts = [];
  let match;
  while ((match = paragraphPattern.exec(cellBody)) !== null) {
    texts.push(extractParagraphText(match[1]));
  }
  return texts.join("\n");
}
