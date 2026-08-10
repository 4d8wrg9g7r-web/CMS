import { describe, expect, it } from "vitest";
import { mapImportRows, parseCsv } from "../people/import";

const CAMPUSES = [
  { id: "c1", name: "Main Campus" },
  { id: "c2", name: "North Campus" },
];

describe("parseCsv", () => {
  it("parses plain rows and trims blank trailing lines", () => {
    expect(parseCsv("a,b,c\n1,2,3\n\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields containing commas, newlines, and escaped quotes", () => {
    expect(parseCsv('name,notes\nDana,"loves ""coffee"", tea\nand snacks"')).toEqual([
      ["name", "notes"],
      ["Dana", 'loves "coffee", tea\nand snacks'],
    ]);
  });

  it("keeps empty fields positional", () => {
    expect(parseCsv("a,,c\n,,\n")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });
});

describe("mapImportRows", () => {
  const HEADER = "firstName,lastName,email,phone,membershipStatus,tags,campus";

  it("maps a fully populated row, resolving status, tags, and campus by name", () => {
    const records = parseCsv(`${HEADER}\nDana,Whitfield,dana@example.org,555-1234,member,greeter;musician,north campus`);
    const { rows, errors } = mapImportRows(records, CAMPUSES);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        firstName: "Dana",
        lastName: "Whitfield",
        email: "dana@example.org",
        phone: "555-1234",
        membershipStatus: "MEMBER",
        tags: ["greeter", "musician"],
        campusId: "c2",
      },
    ]);
  });

  it("defaults blank status to VISITOR and blank optionals to null/empty", () => {
    const records = parseCsv(`${HEADER}\nMarcus,Ibe,,,,,`);
    const { rows, errors } = mapImportRows(records, CAMPUSES);
    expect(errors).toEqual([]);
    expect(rows[0]!).toMatchObject({
      membershipStatus: "VISITOR",
      email: null,
      phone: null,
      tags: [],
      campusId: null,
    });
  });

  it("accepts headers in any order and ignores unknown columns", () => {
    const records = parseCsv("nickname,lastName,firstName\nDee,Whitfield,Dana");
    const { rows, errors } = mapImportRows(records, []);
    expect(errors).toEqual([]);
    expect(rows[0]!).toMatchObject({ firstName: "Dana", lastName: "Whitfield" });
  });

  it("reports rows missing firstName/lastName with their line numbers, keeping valid rows", () => {
    const records = parseCsv(`${HEADER}\n,Whitfield,,,,,\nPriya,Nair,,,,,`);
    const { rows, errors } = mapImportRows(records, CAMPUSES);
    expect(errors).toEqual([{ line: 2, message: "firstName and lastName are required." }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.line).toBe(3);
  });

  it("rejects an unknown membershipStatus", () => {
    const records = parseCsv(`${HEADER}\nDana,Whitfield,,,REGULAR,,`);
    const { rows, errors } = mapImportRows(records, CAMPUSES);
    expect(rows).toEqual([]);
    expect(errors[0]!.message).toContain('Unknown membershipStatus "REGULAR"');
  });

  it("rejects an unknown campus name instead of silently dropping it", () => {
    const records = parseCsv(`${HEADER}\nDana,Whitfield,,,,,West Campus`);
    const { rows, errors } = mapImportRows(records, CAMPUSES);
    expect(rows).toEqual([]);
    expect(errors[0]!.message).toContain('Unknown campus "West Campus"');
  });

  it("fails fast on a header row without firstName/lastName", () => {
    const { rows, errors } = mapImportRows(parseCsv("name,email\nDana,d@example.org"), []);
    expect(rows).toEqual([]);
    expect(errors[0]!.line).toBe(1);
  });

  it("reports an empty file", () => {
    const { errors } = mapImportRows(parseCsv(""), []);
    expect(errors).toEqual([{ line: 1, message: "The file is empty." }]);
  });
});
