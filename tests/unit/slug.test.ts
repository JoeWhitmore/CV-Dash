import { describe, expect, it } from "vitest";
import { initialsFromName, slugFromName } from "@/lib/sync/slug";

describe("slugFromName", () => {
  it("returns first-name + first-letter-of-surname, lowercased, hyphenated", () => {
    expect(slugFromName("Joe Whitmore")).toBe("joe-w");
    expect(slugFromName("Priya Singh")).toBe("priya-s");
  });

  it("handles single-word names", () => {
    expect(slugFromName("Madonna")).toBe("madonna");
  });

  it("handles 3+ word names by using last name's first letter", () => {
    expect(slugFromName("Maria del Carmen Lopez")).toBe("maria-l");
  });

  it("strips diacritics and non-alphanumerics", () => {
    expect(slugFromName("Renée O'Connor")).toBe("renee-o");
  });

  it("returns 'unknown' for empty input", () => {
    expect(slugFromName("")).toBe("unknown");
    expect(slugFromName("   ")).toBe("unknown");
  });
});

describe("initialsFromName", () => {
  it("returns first letter of first word + first letter of last word, uppercased", () => {
    expect(initialsFromName("Joe Whitmore")).toBe("JW");
    expect(initialsFromName("Priya Singh")).toBe("PS");
  });

  it("handles single-word names", () => {
    expect(initialsFromName("Madonna")).toBe("MA");
  });

  it("returns '??' for empty", () => {
    expect(initialsFromName("")).toBe("??");
  });
});
