import { PersonRelationshipType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { inverseRelationshipType, personDisplayName } from "../people/helpers";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

describe("personDisplayName", () => {
  it("prefers preferredName over firstName", () => {
    expect(personDisplayName({ firstName: "Jonathan", lastName: "Reed", preferredName: "Jon" })).toBe("Jon Reed");
  });

  it("falls back to firstName when there is no preferredName", () => {
    expect(personDisplayName({ firstName: "Maria", lastName: "Lopez", preferredName: null })).toBe("Maria Lopez");
  });

  it("does not render stray spaces or 'undefined' for missing parts", () => {
    expect(personDisplayName({ firstName: "Sam", lastName: null })).toBe("Sam");
    expect(personDisplayName({ firstName: null, lastName: "Okafor" })).toBe("Okafor");
    expect(personDisplayName({})).toBe("");
  });
});

describe("inverseRelationshipType", () => {
  it("keeps symmetric relationships symmetric", () => {
    expect(inverseRelationshipType(PersonRelationshipType.SPOUSE)).toBe(PersonRelationshipType.SPOUSE);
    expect(inverseRelationshipType(PersonRelationshipType.SIBLING)).toBe(PersonRelationshipType.SIBLING);
    expect(inverseRelationshipType(PersonRelationshipType.OTHER)).toBe(PersonRelationshipType.OTHER);
  });

  it("pairs PARENT and CHILD", () => {
    expect(inverseRelationshipType(PersonRelationshipType.PARENT)).toBe(PersonRelationshipType.CHILD);
    expect(inverseRelationshipType(PersonRelationshipType.CHILD)).toBe(PersonRelationshipType.PARENT);
  });

  it("maps GUARDIAN to WARD (the v1 CHILD approximation was replaced by a real type)", () => {
    expect(inverseRelationshipType(PersonRelationshipType.GUARDIAN)).toBe(PersonRelationshipType.WARD);
  });

  it("is defined for every relationship type in the enum", () => {
    for (const type of Object.values(PersonRelationshipType)) {
      expect(Object.values(PersonRelationshipType)).toContain(inverseRelationshipType(type));
    }
  });
});

describe("tenant guard registration", () => {
  // The new People primitives must be tenant-scoped so an unscoped query throws rather
  // than leaking across churches (BLUEPRINT §32). Guards against adding a model but
  // forgetting to register it.
  it("registers Person, Household, and PersonRelationship as tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("Person")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("Household")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("PersonRelationship")).toBe(true);
  });
});
