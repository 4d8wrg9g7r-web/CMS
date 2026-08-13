import { describe, expect, it } from "vitest";
import { mapImportRows, parseCsv, parseFamilyPosition, parseImportDate } from "../people/import";

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
        middleName: null,
        lastName: "Whitfield",
        suffix: null,
        preferredName: null,
        email: "dana@example.org",
        phone: "555-1234",
        birthdate: null,
        gender: null,
        householdRole: null,
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

describe("new default fields (middle name, suffix, preferred, DOB, gender, family position)", () => {
  const FULL_HEADER =
    "firstName,middleName,lastName,suffix,preferredName,email,phone,dateOfBirth,gender,familyPosition,membershipStatus,tags,campus";

  it("maps every new column onto the row", () => {
    const records = parseCsv(
      `${FULL_HEADER}\nDana,Rae,Whitfield,Jr.,Dee,d@example.org,555-1234,1990-05-17,Female,Mother,member,,`,
    );
    const { rows, errors } = mapImportRows(records, []);
    expect(errors).toEqual([]);
    expect(rows[0]!).toMatchObject({
      middleName: "Rae",
      suffix: "Jr.",
      preferredName: "Dee",
      gender: "Female",
      householdRole: "MOTHER",
    });
    expect(rows[0]!.birthdate?.toISOString().slice(0, 10)).toBe("1990-05-17");
  });

  it("reports an unreadable dateOfBirth as a row error", () => {
    const records = parseCsv(`${FULL_HEADER}\nDana,,Whitfield,,,,,not-a-date,,,,,`);
    const { rows, errors } = mapImportRows(records, []);
    expect(rows).toEqual([]);
    expect(errors[0]!.message).toContain('Unreadable dateOfBirth "not-a-date"');
  });

  it("reports an unknown familyPosition with the accepted words", () => {
    const records = parseCsv(`${FULL_HEADER}\nDana,,Whitfield,,,,,,,cousin twice removed,,,`);
    const { rows, errors } = mapImportRows(records, []);
    expect(rows).toEqual([]);
    expect(errors[0]!.message).toContain('Unknown familyPosition "cousin twice removed"');
  });
});

describe("parseFamilyPosition", () => {
  it("matches the words churches actually type", () => {
    expect(parseFamilyPosition("Father")).toBe("FATHER");
    expect(parseFamilyPosition("dad")).toBe("FATHER");
    expect(parseFamilyPosition("Mom")).toBe("MOTHER");
    expect(parseFamilyPosition("Head of Household")).toBe("HEAD_OF_HOUSEHOLD");
    expect(parseFamilyPosition("HOH")).toBe("HEAD_OF_HOUSEHOLD");
    expect(parseFamilyPosition("daughter")).toBe("CHILD");
    expect(parseFamilyPosition("Grandma")).toBe("GRANDPARENT");
    expect(parseFamilyPosition("spouse")).toBe("ADULT");
    expect(parseFamilyPosition("HEAD_OF_HOUSEHOLD")).toBe("HEAD_OF_HOUSEHOLD");
    expect(parseFamilyPosition("neighbor")).toBeNull();
  });
});

describe("parseImportDate", () => {
  it("accepts ISO, US slash/dash, and written-month dates at UTC noon", () => {
    expect(parseImportDate("1990-05-17")?.toISOString()).toBe("1990-05-17T12:00:00.000Z");
    expect(parseImportDate("5/17/1990")?.toISOString().slice(0, 10)).toBe("1990-05-17");
    expect(parseImportDate("05-17-1990")?.toISOString().slice(0, 10)).toBe("1990-05-17");
    expect(parseImportDate("May 17, 1990")?.toISOString().slice(0, 10)).toBe("1990-05-17");
  });

  it("rejects garbage and calendar rollovers", () => {
    expect(parseImportDate("not-a-date")).toBeNull();
    expect(parseImportDate("2020-02-30")).toBeNull();
    expect(parseImportDate("13/45/1990")).toBeNull();
  });
});
