import { describe, expect, it } from "vitest";
import {
  decodeXmlEntities,
  parseDrawingTexts,
  parseSharedStrings,
  parseSheetRows,
  parseWordDocument,
} from "../scripts/lib/ooxml.mjs";

describe("decodeXmlEntities", () => {
  it("decodes named entities and numeric entities (decimal and hex)", () => {
    expect(decodeXmlEntities("&amp;&lt;&gt;&quot;&apos;")).toBe("&<>\"'");
    expect(decodeXmlEntities("&#65;&#66;")).toBe("AB");
    expect(decodeXmlEntities("&#x41;&#x42;")).toBe("AB");
  });
});

describe("parseSharedStrings", () => {
  it("strips <rPh> furigana and keeps only body text", () => {
    const xml = `<sst><si><rPh sb="0" eb="2"><t>フリガナ</t></rPh><t>漢字</t></si></sst>`;
    expect(parseSharedStrings(xml)).toEqual(["漢字"]);
  });

  it("concatenates multiple <t> (split by <r>) within a single <si>", () => {
    const xml = `<sst><si><r><t>あい</t></r><r><t>うえお</t></r></si></sst>`;
    expect(parseSharedStrings(xml)).toEqual(["あいうえお"]);
  });
});

describe("parseSheetRows", () => {
  const sharedStrings = ["共有A", "共有B"];

  it("keeps a self-closing cell as empty string without shifting subsequent columns", () => {
    const xml = `<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"/><c r="C1" t="s"><v>1</v></c></row></sheetData>`;
    expect(parseSheetRows(xml, sharedStrings)).toEqual([["共有A", "", "共有B"]]);
  });

  it("resolves t=\"s\" cells against shared strings", () => {
    const xml = `<sheetData><row r="1"><c r="A1" t="s"><v>1</v></c></row></sheetData>`;
    expect(parseSheetRows(xml, sharedStrings)).toEqual([["共有B"]]);
  });

  it("reads inline strings (t=\"inlineStr\")", () => {
    const xml = `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>直書き</t></is></c></row></sheetData>`;
    expect(parseSheetRows(xml, sharedStrings)).toEqual([["直書き"]]);
  });
});

describe("parseDrawingTexts", () => {
  it("returns one entry per <xdr:sp>, concatenating its <a:t> in document order", () => {
    const xml = `
      <xdr:wsDr>
        <xdr:twoCellAnchor>
          <xdr:sp>
            <xdr:txBody><a:p><a:r><a:t>図形1</a:t></a:r><a:r><a:t>続き</a:t></a:r></a:p></xdr:txBody>
          </xdr:sp>
        </xdr:twoCellAnchor>
        <xdr:twoCellAnchor>
          <xdr:sp>
            <xdr:txBody><a:p><a:r><a:t>図形2</a:t></a:r></a:p></xdr:txBody>
          </xdr:sp>
        </xdr:twoCellAnchor>
      </xdr:wsDr>`;
    expect(parseDrawingTexts(xml)).toEqual(["図形1続き", "図形2"]);
  });
});

describe("parseWordDocument", () => {
  it("converts w:pStyle Heading2 into '## '", () => {
    const xml = `<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>見出し</w:t></w:r></w:p></w:body></w:document>`;
    expect(parseWordDocument(xml)).toBe("## 見出し");
  });

  it("drops <w:del> content and keeps <w:ins> content", () => {
    const xml = `<w:document><w:body><w:p><w:ins><w:r><w:t>挿入された</w:t></w:r></w:ins><w:del><w:r><w:delText>削除された</w:delText></w:r></w:del><w:r><w:t>本文</w:t></w:r></w:p></w:body></w:document>`;
    expect(parseWordDocument(xml)).toBe("挿入された本文");
  });

  it("drops the result text of a TOC field", () => {
    const xml = `<w:document><w:body><w:p><w:fldSimple w:instr=" TOC \\o &quot;1-3&quot; "><w:r><w:t>見出し1\t1</w:t></w:r></w:fldSimple></w:p><w:p><w:r><w:t>本文</w:t></w:r></w:p></w:body></w:document>`;
    expect(parseWordDocument(xml)).toBe("本文");
  });

  it("converts <w:tbl> into a pipe table", () => {
    const xml = `<w:document><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
    expect(parseWordDocument(xml)).toBe("| a | b |");
  });

  it("resolves numeric styleId via styles.xml (w:styleId=\"21\" -> heading 2)", () => {
    const xml = `<w:document><w:body><w:p><w:pPr><w:pStyle w:val="21"/></w:pPr><w:r><w:t>見出し</w:t></w:r></w:p></w:body></w:document>`;
    const stylesXml = `<w:styles><w:style w:type="paragraph" w:styleId="21"><w:name w:val="heading 2"/></w:style></w:styles>`;
    expect(parseWordDocument(xml, stylesXml)).toBe("## 見出し");
  });

  it("does not treat a numeric styleId resolving to a non-heading style name as a heading", () => {
    const xml = `<w:document><w:body><w:p><w:pPr><w:pStyle w:val="23"/></w:pPr><w:r><w:t>目次見出し</w:t></w:r></w:p></w:body></w:document>`;
    const stylesXml = `<w:styles><w:style w:type="paragraph" w:styleId="23"><w:name w:val="toc 2"/></w:style></w:styles>`;
    expect(parseWordDocument(xml, stylesXml)).toBe("目次見出し");
  });
});
