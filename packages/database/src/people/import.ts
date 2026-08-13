import { MembershipStatus } from "@prisma/client";

/**
 * Pure CSV people-import module (docs/domain/people-import.md). Hand-rolled RFC 4180
 * subset (quoted fields, "" escapes, CRLF) rather than a parser dependency — adding one
 * for this much logic would need an ADR. No I/O and no Prisma client usage here so the
 * whole pipeline is unit-testable.
 */

export const MAX_IMPORT_ROWS = 10000;
// Scales with the row cap (~500 bytes/row budget). Server-action uploads must
// also fit next.config's serverActions.bodySizeLimit — keep the two in step.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB

/** Recognized headers (case-insensitive). Extra columns are ignored. */
export const IMPORT_HEADERS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "membershipStatus",
  "tags",
  "campus",
] as const;

export interface ImportRowError {
  /** 1-based line number in the original file (header is line 1). */
  line: number;
  message: string;
}

/** A validated row, ready for the service to insert. */
export interface ImportPersonRow {
  line: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  membershipStatus: MembershipStatus;
  tags: string[];
  campusId: string | null;
}

/**
 * Parses CSV text into rows of fields. Handles quoted fields, escaped quotes ("") and
 * both LF and CRLF line endings. A truly malformed quote sequence surfaces as a field
 * containing the raw text — row-level validation then reports it, rather than the whole
 * file failing to parse.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Skip rows that are entirely empty (trailing newline, blank lines).
    if (row.length > 1 || row[0]?.trim() !== "") rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    if (ch === "\r") {
      // CRLF: consume both; lone CR treated as newline too.
      pushRow();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

const STATUS_BY_NAME = new Map(Object.values(MembershipStatus).map((s) => [s.toLowerCase(), s]));

/**
 * Maps parsed CSV records to validated rows. The first record must be the header row.
 * `campuses` is the org's campus list for name→id resolution (case-insensitive); an
 * unknown campus name is a row error, never silent data loss.
 */
export function mapImportRows(
  records: string[][],
  campuses: { id: string; name: string }[],
): { rows: ImportPersonRow[]; errors: ImportRowError[] } {
  const rows: ImportPersonRow[] = [];
  const errors: ImportRowError[] = [];
  if (records.length === 0) {
    return { rows, errors: [{ line: 1, message: "The file is empty." }] };
  }

  const header = records[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: (typeof IMPORT_HEADERS)[number]) => header.indexOf(name.toLowerCase());
  const idx = {
    firstName: col("firstName"),
    lastName: col("lastName"),
    email: col("email"),
    phone: col("phone"),
    membershipStatus: col("membershipStatus"),
    tags: col("tags"),
    campus: col("campus"),
  };
  if (idx.firstName === -1 || idx.lastName === -1) {
    return {
      rows,
      errors: [{ line: 1, message: 'Header row must include "firstName" and "lastName" columns.' }],
    };
  }

  const campusByName = new Map(campuses.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const get = (record: string[], index: number) => (index === -1 ? "" : (record[index] ?? "").trim());

  for (let r = 1; r < records.length; r++) {
    const record = records[r]!;
    const line = r + 1;

    const firstName = get(record, idx.firstName);
    const lastName = get(record, idx.lastName);
    if (!firstName || !lastName) {
      errors.push({ line, message: "firstName and lastName are required." });
      continue;
    }

    const rawStatus = get(record, idx.membershipStatus);
    let membershipStatus: MembershipStatus = MembershipStatus.VISITOR;
    if (rawStatus) {
      const matched = STATUS_BY_NAME.get(rawStatus.toLowerCase());
      if (!matched) {
        errors.push({
          line,
          message: `Unknown membershipStatus "${rawStatus}" (expected VISITOR, ATTENDER, MEMBER, or INACTIVE).`,
        });
        continue;
      }
      membershipStatus = matched;
    }

    const rawCampus = get(record, idx.campus);
    let campusId: string | null = null;
    if (rawCampus) {
      const matched = campusByName.get(rawCampus.toLowerCase());
      if (!matched) {
        errors.push({ line, message: `Unknown campus "${rawCampus}" — create it in Settings first.` });
        continue;
      }
      campusId = matched;
    }

    const email = get(record, idx.email);
    rows.push({
      line,
      firstName,
      lastName,
      email: email || null,
      phone: get(record, idx.phone) || null,
      membershipStatus,
      tags: get(record, idx.tags)
        .split(";")
        .map((t) => t.trim())
        .filter(Boolean),
      campusId,
    });
  }

  return { rows, errors };
}
