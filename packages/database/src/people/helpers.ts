import { PersonRelationshipType } from "@prisma/client";

/**
 * Pure People-domain helpers, kept free of any Prisma client access so they can be
 * unit-tested without a database. Behaviour that touches the DB lives in
 * services/people-service.ts.
 */

/**
 * The name to show for a Person. Prefers an explicit preferredName over firstName,
 * falls back gracefully when a name part is blank so we never render "undefined" or a
 * stray space. A Person always has first+last at the schema level, but this stays
 * defensive for partially-populated read models.
 */
export function personDisplayName(person: {
  firstName?: string | null;
  lastName?: string | null;
  preferredName?: string | null;
}): string {
  const first = (person.preferredName?.trim() || person.firstName?.trim()) ?? "";
  const last = person.lastName?.trim() ?? "";
  return [first, last].filter(Boolean).join(" ").trim();
}

/**
 * The inverse of a relationship, used to store the reciprocal row so both people see
 * the tie (see people-service.addRelationship). A row "Bob is Alice's CHILD" implies
 * "Alice is Bob's PARENT".
 *
 * SPOUSE and SIBLING are symmetric. GUARDIAN has no distinct reciprocal in the v1 enum
 * (there is no DEPENDENT/WARD type), so it maps to CHILD as a documented approximation
 * -- see docs/domain/people.md "Unresolved risks".
 */
export function inverseRelationshipType(type: PersonRelationshipType): PersonRelationshipType {
  switch (type) {
    case PersonRelationshipType.SPOUSE:
      return PersonRelationshipType.SPOUSE;
    case PersonRelationshipType.SIBLING:
      return PersonRelationshipType.SIBLING;
    case PersonRelationshipType.PARENT:
      return PersonRelationshipType.CHILD;
    case PersonRelationshipType.CHILD:
      return PersonRelationshipType.PARENT;
    case PersonRelationshipType.GUARDIAN:
      return PersonRelationshipType.CHILD;
    case PersonRelationshipType.OTHER:
      return PersonRelationshipType.OTHER;
    default: {
      // Exhaustiveness guard: adding an enum member without handling it here is a
      // compile error.
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
