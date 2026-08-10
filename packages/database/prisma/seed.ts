/**
 * Idempotent dev seed. Safe to re-run against an already-seeded database — it looks
 * up existing rows by their natural keys (email, slug, name) before creating anything.
 *
 * All people below are FICTIONAL, created for local development only.
 */
import bcrypt from "bcryptjs";
import { campusService, organizationService, peopleService, rawDb, userService } from "../src/index";

const DEV_USER_EMAIL = "owner@cms.dev";
const DEV_USER_PASSWORD = "devpassword123";
const ORG_SLUG = "riverside-demo";

async function main() {
  let user = await userService.findUserByEmail(DEV_USER_EMAIL);
  if (!user) {
    const passwordHash = await bcrypt.hash(DEV_USER_PASSWORD, 10);
    user = await userService.createUser({
      email: DEV_USER_EMAIL,
      name: "Dev Owner",
      passwordHash,
    });
    console.log(`Created dev user ${DEV_USER_EMAIL} (password: ${DEV_USER_PASSWORD})`);
  } else {
    console.log(`Dev user ${DEV_USER_EMAIL} already exists`);
  }

  let organization = await organizationService.getOrganizationBySlug(ORG_SLUG);
  if (!organization) {
    organization = await organizationService.createOrganizationWithOwner({
      name: "Riverside Community Church (Demo)",
      slug: ORG_SLUG,
      ownerUserId: user.id,
    });
    console.log(`Created organization ${organization.name}`);
  } else {
    console.log(`Organization ${organization.slug} already exists`);
  }

  const campuses = await campusService.listCampuses(organization.id, { includeArchived: true });
  let campus = campuses.find((c) => c.name === "Main Campus") ?? null;
  if (!campus) {
    campus = await campusService.createCampus(organization.id, {
      name: "Main Campus",
      address: "100 Riverside Ave (fictional)",
    });
    console.log("Created Main Campus");
  }

  const fictionalPeople = [
    { firstName: "Dana", lastName: "Whitfield", email: "dana.whitfield@example.org" },
    { firstName: "Marcus", lastName: "Ibe", email: "marcus.ibe@example.org" },
    { firstName: "Priya", lastName: "Nair", email: "priya.nair@example.org" },
  ];
  for (const seed of fictionalPeople) {
    const existing = await peopleService.findByEmail(organization.id, seed.email);
    if (existing) continue;
    await peopleService.createPerson(organization.id, { ...seed, campusId: campus.id });
    console.log(`Created person ${seed.firstName} ${seed.lastName}`);
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => rawDb.$disconnect());
