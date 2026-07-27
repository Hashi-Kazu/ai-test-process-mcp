import { describe, expect, it } from "vitest";
import {
  derivedFromIds,
  formatDerivedFromEntry,
  formatDerivedFromList,
  hasDerivedFromRef,
  toDerivedFromRef,
} from "../src/derivedFromRefs.js";

describe("toDerivedFromRef", () => {
  it("normalizes a plain string into { id }", () => {
    expect(toDerivedFromRef("R-001")).toEqual({ id: "R-001" });
  });

  it("normalizes an explicit-kind entry into { id, kind }", () => {
    expect(toDerivedFromRef({ kind: "risk", id: "RK-01" })).toEqual({ id: "RK-01", kind: "risk" });
  });
});

describe("derivedFromIds", () => {
  it("returns the ids in input order without deduplication", () => {
    expect(derivedFromIds(["R-001", { kind: "risk", id: "RK-01" }])).toEqual(["R-001", "RK-01"]);
  });
});

describe("hasDerivedFromRef", () => {
  it("does not match an explicit-kind entry against a different kind", () => {
    expect(hasDerivedFromRef([{ kind: "risk", id: "R-001" }], "R-001", "requirement")).toBe(false);
  });

  it("matches an unspecified-kind (string) entry by id alone", () => {
    expect(hasDerivedFromRef(["R-001"], "R-001", "requirement")).toBe(true);
  });

  it("matches both string and explicit-kind entries when kind is omitted", () => {
    expect(hasDerivedFromRef(["R-001"], "R-001")).toBe(true);
    expect(hasDerivedFromRef([{ kind: "risk", id: "R-001" }], "R-001")).toBe(true);
  });
});

describe("formatDerivedFromList / formatDerivedFromEntry", () => {
  it("formats unspecified-kind entries as plain ids and explicit-kind entries as label:id", () => {
    expect(formatDerivedFromEntry("R-001")).toBe("R-001");
    expect(formatDerivedFromEntry({ kind: "risk", id: "RK-01" })).toBe("リスク:RK-01");
    expect(formatDerivedFromList(["R-001", { kind: "risk", id: "RK-01" }])).toBe("R-001, リスク:RK-01");
  });
});
