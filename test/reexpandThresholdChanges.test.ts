import { describe, expect, it } from "vitest";
import { renderThresholdChangeReexpansion } from "../src/tools/reexpandThresholdChanges.js";
import type { ReexpandThresholdChangesInput } from "../src/types.js";

describe("renderThresholdChangeReexpansion", () => {
  it("1. lists a changed parameter with its change kind in the diff table", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toContain("| MAX_TICKETS | value-changed | 10 | 20 | 枚→枚 | - |");
  });

  it("2. re-expands a boundary variable bound to parameter names and marks the changed coverage target id", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "10" },
      ],
      parametersAfter: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "20" },
      ],
      boundaryBindings: [
        { name: "枚数", minParameterName: "MIN_TICKETS", maxParameterName: "MAX_TICKETS" },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 3.1")[1].split("### 3.2")[0];
    expect(section).toContain("BV:枚数:10");
    expect(section).toContain("BV:枚数:20");
    expect(section).toContain("changed");
  });

  it("3. reports a case referencing a stale coverage target id as TCI-02 with high severity and a replacement suggestion", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "10" },
      ],
      parametersAfter: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "20" },
      ],
      boundaryBindings: [
        { name: "枚数", minParameterName: "MIN_TICKETS", maxParameterName: "MAX_TICKETS" },
      ],
      testCases: [
        {
          caseId: "TCS-001",
          title: "上限枚数のテスト",
          coverageTargets: ["BV:枚数:10"],
        },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toContain("TCI-02");
    expect(md).toContain("[high] TCI-02 TCS-001");
    expect(md).toContain("BV:枚数:10 → BV:枚数:20");
  });

  it("4. flags a case that still contains the stale literal value as TCI-01", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
      testCases: [
        {
          caseId: "TCS-001",
          title: "枚数上限のテスト",
          steps: [{ no: 1, action: "10枚を入力する", expected: "エラーが表示される" }],
        },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toContain("[high] TCI-01 TCS-001");
  });

  it("5. classifies a name-referencing case as TCI-03 recheck-required and does not raise TCI-01 for it", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
      testCases: [
        {
          caseId: "TCS-001",
          title: "MAX_TICKETS を超えるテスト",
          steps: [{ no: 1, action: "MAX_TICKETS 枚を入力する", expected: "エラーが表示される" }],
        },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    const findingsSection = md.split("### 4.1")[1].split("### 4.2")[0];
    expect(findingsSection).toContain("TCI-03");
    expect(findingsSection).not.toContain("TCI-01");
  });

  it("6. reports an artifact referencing a removed parameter as TCI-05", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "OLD_LIMIT", value: "5", unit: "件" }],
      parametersAfter: [],
      testConditions: [{ id: "TC-001", statement: "OLD_LIMIT を超えないことを確認する" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toContain("[high] TCI-05 TC-001");
  });

  it("7. lists a changed parameter with no references in section 2.2 as TCI-06", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "UNTRACKED", value: "5" }],
      parametersAfter: [{ name: "UNTRACKED", value: "15" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 2.2")[1].split("## 3.")[0];
    expect(section).toContain("UNTRACKED");
    expect(section).toContain("見つからない");
  });

  it("8. flags a unit-only change as TCI-04", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MIN_AGE", value: "18", unit: "歳" }],
      parametersAfter: [{ name: "MIN_AGE", value: "18", unit: "才" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toContain("TCI-04");
  });

  it("9. reports a non-numeric binding as TCI-08 in section 3.3 and omits its reexpansion row", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [
        { name: "MIN_TICKETS", value: "abc" },
        { name: "MAX_TICKETS", value: "10" },
      ],
      parametersAfter: [
        { name: "MIN_TICKETS", value: "abc" },
        { name: "MAX_TICKETS", value: "20" },
      ],
      boundaryBindings: [
        { name: "枚数", minParameterName: "MIN_TICKETS", maxParameterName: "MAX_TICKETS" },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section33 = md.split("### 3.3")[1].split("## 4.")[0];
    expect(section33).toContain("non-numeric-parameter");
    const section31 = md.split("### 3.1")[1].split("### 3.2")[0];
    expect(section31).toContain("- 対象なし");
  });

  it("10. emits the no-further-action message in section 6 when there are no findings", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "A", value: "1" }],
      parametersAfter: [{ name: "A", value: "1" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section6 = md.split("## 6.")[1];
    expect(section6).toContain("追加の対応指示なし");
  });

  it("11. lists a changed equivalence class representative in section 3.2", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "ADULT_AGE", value: "20" }],
      parametersAfter: [{ name: "ADULT_AGE", value: "18" }],
      equivalenceBindings: [
        {
          name: "年齢",
          classes: [
            { label: "成人", kind: "valid", representativeParameterName: "ADULT_AGE" },
          ],
        },
      ],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 3.2")[1].split("### 3.3")[0];
    expect(section).toContain("EP:年齢:成人");
    expect(section).toContain("changed");
  });

  it("12. marks an unaffected artifact as 影響なし in section 4.2", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20" }],
      testConditions: [{ id: "TC-999", statement: "無関係な条件" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    const section = md.split("### 4.2")[1].split("### 4.3")[0];
    expect(section).toContain("TC-999");
    expect(section).toMatch(/TC-999[^\n]*影響なし/);
  });

  it("13. outputs a summary line with the aggregate counts", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [{ name: "MAX_TICKETS", value: "10", unit: "枚" }],
      parametersAfter: [{ name: "MAX_TICKETS", value: "20", unit: "枚" }],
    };
    const md = renderThresholdChangeReexpansion(input);
    expect(md).toMatch(/変更パラメータ数: \d+ \/ 追加: \d+ \/ 削除: \d+/);
  });

  it("14. produces stable output for the same input", () => {
    const input: ReexpandThresholdChangesInput = {
      parametersBefore: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "10" },
        { name: "OLD_LIMIT", value: "5" },
      ],
      parametersAfter: [
        { name: "MIN_TICKETS", value: "1" },
        { name: "MAX_TICKETS", value: "20" },
        { name: "NEW_LIMIT", value: "8" },
      ],
      testConditions: [{ id: "TC-001", statement: "OLD_LIMIT を超えないことを確認する" }],
      testCases: [
        {
          caseId: "TCS-001",
          title: "上限枚数のテスト",
          coverageTargets: ["BV:枚数:10"],
          steps: [{ no: 1, action: "10枚を入力する", expected: "エラーが表示される" }],
        },
      ],
      boundaryBindings: [
        { name: "枚数", minParameterName: "MIN_TICKETS", maxParameterName: "MAX_TICKETS" },
      ],
    };
    const first = renderThresholdChangeReexpansion(input);
    const second = renderThresholdChangeReexpansion(input);
    expect(first).toBe(second);
  });
});
