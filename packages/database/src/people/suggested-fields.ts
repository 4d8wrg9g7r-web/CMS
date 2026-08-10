import { PersonFieldType } from "@prisma/client";

/**
 * Backend-only catalog of the fields churches most commonly track on people
 * (docs/domain/people.md "Custom fields"). This list is never rendered as a
 * browsable UI — it exists so the system can ANTICIPATE incoming data: the import
 * wizard's heuristic guesser pre-recognizes these headers as custom fields with a
 * clean label and the right storage type, and the AI mapper receives matches as
 * hints. Nothing is created from this catalog until a user confirms a column in
 * the wizard (or adds a field in Settings) — suggestions only.
 *
 * Ground rules for entries:
 * - No financial amounts (gifts, pledges, balances) — those never belong on a
 *   person profile import (BLUEPRINT §61/ADR-007). Identity-like giving numbers
 *   (envelope number) are allowed.
 * - Aliases are pre-normalized (lowercase, alphanumeric only) and must not
 *   collide with the built-in header aliases in import-mapping.ts.
 * - SELECT/MULTI_SELECT entries carry no options — the import derives options
 *   from the organization's own file values.
 */

export interface SuggestedPersonField {
  /** Stable slug — same shape slugifyFieldKey produces. */
  key: string;
  label: string;
  type: PersonFieldType;
  /** Extra normalized header spellings that should match, beyond key + label. */
  aliases: string[];
}

const T = PersonFieldType;

function f(key: string, label: string, type: PersonFieldType, aliases: string[] = []): SuggestedPersonField {
  return { key, label, type, aliases };
}

export const SUGGESTED_PERSON_FIELDS: SuggestedPersonField[] = [
  // -- Identity & personal -------------------------------------------------------
  f("title", "Title", T.SELECT, ["prefix", "salutation"]),
  f("suffix", "Suffix", T.TEXT, ["namesuffix"]),
  f("middle-name", "Middle Name", T.TEXT, ["middle", "middleinitial"]),
  f("nickname", "Nickname", T.TEXT, ["goesby", "knownas"]),
  f("maiden-name", "Maiden Name", T.TEXT, ["maidenname"]),
  f("gender", "Gender", T.SELECT, ["sex"]),
  f("date-of-birth", "Date of Birth", T.DATE, ["dob", "birthday", "birthdate", "borndate"]),
  f("age", "Age", T.NUMBER, []),
  f("marital-status", "Marital Status", T.SELECT, ["maritalstate", "married"]),
  f("wedding-anniversary", "Wedding Anniversary", T.DATE, ["anniversary", "anniversarydate", "weddingdate"]),
  f("deceased", "Deceased", T.BOOLEAN, []),
  f("deceased-date", "Deceased Date", T.DATE, ["dateofdeath"]),
  f("nationality", "Nationality", T.TEXT, []),
  f("ethnicity", "Ethnicity", T.SELECT, []),
  f("primary-language", "Primary Language", T.SELECT, ["language"]),
  f("occupation", "Occupation", T.TEXT, ["job", "jobtitle", "profession"]),
  f("employer", "Employer", T.TEXT, ["company", "workplace"]),
  f("school", "School", T.TEXT, ["schoolname"]),
  f("grade-level", "Grade Level", T.SELECT, ["grade", "schoolgrade"]),
  f("graduation-year", "Graduation Year", T.NUMBER, ["gradyear", "classof"]),
  f("t-shirt-size", "T-Shirt Size", T.SELECT, ["shirtsize", "tshirt", "tshirtsize"]),
  f("photo-url", "Photo URL", T.TEXT, ["photo", "avatar", "picture"]),

  // -- Contact & address ---------------------------------------------------------
  f("home-phone", "Home Phone", T.TEXT, ["homephone", "housephone"]),
  f("work-phone", "Work Phone", T.TEXT, ["workphone", "officephone", "businessphone"]),
  f("alternate-email", "Alternate Email", T.TEXT, ["email2", "secondaryemail", "otheremail", "workemail"]),
  f("address-line-1", "Address Line 1", T.TEXT, ["address", "address1", "street", "streetaddress", "addressline1", "homeaddress"]),
  f("address-line-2", "Address Line 2", T.TEXT, ["address2", "apt", "unit", "addressline2"]),
  f("city", "City", T.TEXT, ["town"]),
  f("state-province", "State / Province", T.TEXT, ["state", "province"]),
  f("postal-code", "Postal Code", T.TEXT, ["zip", "zipcode", "postcode"]),
  f("country", "Country", T.TEXT, []),
  f("preferred-contact-method", "Preferred Contact Method", T.SELECT, ["contactmethod", "preferredcontact"]),
  f("do-not-call", "Do Not Call", T.BOOLEAN, ["donotcall", "nocalls"]),
  f("do-not-text", "Do Not Text", T.BOOLEAN, ["donottext", "nosms"]),
  f("do-not-mail", "Do Not Mail", T.BOOLEAN, ["donotmail"]),
  f("emergency-contact-name", "Emergency Contact Name", T.TEXT, ["emergencycontact", "icename"]),
  f("emergency-contact-phone", "Emergency Contact Phone", T.TEXT, ["emergencyphone", "icephone"]),
  f("emergency-contact-relationship", "Emergency Contact Relationship", T.TEXT, ["emergencyrelationship"]),
  f("facebook", "Facebook", T.TEXT, ["facebookurl"]),
  f("instagram", "Instagram", T.TEXT, ["instagramhandle"]),
  f("twitter-x", "X / Twitter", T.TEXT, ["twitter", "twitterhandle"]),
  f("website", "Website", T.TEXT, ["personalwebsite", "blog"]),
  f("linkedin", "LinkedIn", T.TEXT, []),
  f("whatsapp", "WhatsApp", T.TEXT, ["whatsappnumber"]),

  // -- Membership & church life --------------------------------------------------
  f("member-id", "Member ID", T.TEXT, ["memberid", "membernumber", "recordid"]),
  f("join-date", "Join Date", T.DATE, ["joindate", "datejoined", "joined"]),
  f("membership-date", "Membership Date", T.DATE, ["memberdate", "membersince"]),
  f("membership-class-completed", "Membership Class Completed", T.BOOLEAN, ["membershipclass", "newmembersclass"]),
  f("membership-class-date", "Membership Class Date", T.DATE, []),
  f("previous-church", "Previous Church", T.TEXT, ["formerchurch", "priorchurch"]),
  f("how-did-you-hear", "How Did You Hear About Us", T.SELECT, ["howdidyouhear", "hearaboutus", "source"]),
  f("first-visit-date", "First Visit Date", T.DATE, ["firstvisit", "firstattended"]),
  f("last-attended-date", "Last Attended Date", T.DATE, ["lastattended", "lastvisit"]),
  f("attendance-frequency", "Attendance Frequency", T.SELECT, ["attendfrequency"]),
  f("envelope-number", "Envelope Number", T.NUMBER, ["envelope", "envelopeno"]),
  f("giving-number", "Giving Number", T.TEXT, ["givingid", "donornumber"]),
  f("sunday-school-class", "Sunday School Class", T.TEXT, ["sundayschool", "ssclass"]),
  f("small-group", "Small Group", T.TEXT, ["smallgroup", "lifegroup", "cellgroup", "connectgroup", "homegroup"]),
  f("ministry-team", "Ministry Team", T.SELECT, ["ministry", "ministryarea"]),
  f("serving-role", "Serving Role", T.TEXT, ["volunteerrole", "servingposition"]),
  f("leadership-role", "Leadership Role", T.TEXT, ["leadershipposition"]),
  f("deacon", "Deacon", T.BOOLEAN, []),
  f("elder", "Elder", T.BOOLEAN, []),
  f("trustee", "Trustee", T.BOOLEAN, []),
  f("staff-member", "Staff Member", T.BOOLEAN, ["staff", "onstaff"]),
  f("staff-position", "Staff Position", T.TEXT, []),
  f("committee", "Committee", T.TEXT, ["committees"]),
  f("usher", "Usher", T.BOOLEAN, []),
  f("greeter", "Greeter", T.BOOLEAN, []),
  f("choir-member", "Choir Member", T.BOOLEAN, ["choir"]),
  f("worship-team", "Worship Team", T.BOOLEAN, ["praiseteam"]),
  f("tech-team", "Tech Team", T.BOOLEAN, ["avteam", "mediateam"]),
  f("nursery-worker", "Nursery Worker", T.BOOLEAN, ["nursery"]),
  f("youth-leader", "Youth Leader", T.BOOLEAN, []),

  // -- Faith milestones ----------------------------------------------------------
  f("baptized", "Baptized", T.BOOLEAN, ["baptised", "waterbaptized"]),
  f("baptism-date", "Baptism Date", T.DATE, ["datebaptized", "baptismday"]),
  f("baptism-location", "Baptism Location", T.TEXT, ["baptizedat"]),
  f("infant-baptism", "Infant Baptism", T.BOOLEAN, []),
  f("child-dedication", "Child Dedication", T.BOOLEAN, ["dedication", "dedicated"]),
  f("dedication-date", "Dedication Date", T.DATE, []),
  f("confirmed", "Confirmed", T.BOOLEAN, ["confirmation"]),
  f("confirmation-date", "Confirmation Date", T.DATE, []),
  f("first-communion-date", "First Communion Date", T.DATE, ["firstcommunion"]),
  f("salvation-date", "Salvation Date", T.DATE, ["saveddate", "dateofsalvation", "conversiondate"]),
  f("born-again", "Born Again", T.BOOLEAN, ["saved"]),
  f("holy-spirit-baptism", "Holy Spirit Baptism", T.BOOLEAN, ["spiritbaptized", "spiritfilled"]),
  f("discipleship-class", "Discipleship Class", T.TEXT, ["discipleship"]),
  f("bible-study", "Bible Study", T.TEXT, ["biblestudygroup"]),
  f("spiritual-gifts", "Spiritual Gifts", T.MULTI_SELECT, ["gifts", "giftings"]),
  f("mission-trip", "Mission Trip Participant", T.BOOLEAN, ["missiontrip", "missions"]),
  f("mission-trip-year", "Mission Trip Year", T.NUMBER, []),
  f("ordained", "Ordained", T.BOOLEAN, []),
  f("ordination-date", "Ordination Date", T.DATE, []),
  f("testimony-on-file", "Testimony on File", T.BOOLEAN, ["testimony"]),
  f("mentor", "Mentor", T.TEXT, ["discipler"]),
  f("next-step", "Next Step", T.TEXT, ["nextsteps"]),

  // -- Safety & compliance -------------------------------------------------------
  f("background-check", "Background Check Completed", T.BOOLEAN, ["backgroundcheck", "bgcheck", "screened"]),
  f("background-check-date", "Background Check Date", T.DATE, ["bgcheckdate"]),
  f("background-check-expiration", "Background Check Expiration", T.DATE, ["bgcheckexpires"]),
  f("child-safety-training", "Child Safety Training", T.BOOLEAN, ["childprotection", "safeguardingtrained", "safesanctuary"]),
  f("child-safety-training-date", "Child Safety Training Date", T.DATE, []),
  f("cpr-certified", "CPR Certified", T.BOOLEAN, ["cpr"]),
  f("cpr-certification-date", "CPR Certification Date", T.DATE, []),
  f("first-aid-certified", "First Aid Certified", T.BOOLEAN, ["firstaid"]),
  f("approved-driver", "Approved Driver", T.BOOLEAN, ["driverapproved"]),
  f("drivers-license-on-file", "Driver's License on File", T.BOOLEAN, ["driverslicense"]),
  f("works-with-minors", "Works With Minors", T.BOOLEAN, []),
  f("volunteer-application-date", "Volunteer Application Date", T.DATE, []),
  f("reference-check", "Reference Check Completed", T.BOOLEAN, ["references"]),
  f("confidentiality-agreement", "Confidentiality Agreement Signed", T.BOOLEAN, []),

  // -- Health & care -------------------------------------------------------------
  f("allergies", "Allergies", T.TEXT, ["allergy", "foodallergies"]),
  f("dietary-restrictions", "Dietary Restrictions", T.TEXT, ["diet", "dietaryneeds"]),
  f("medical-notes", "Medical Notes", T.TEXT, ["medicalconditions", "healthnotes"]),
  f("medications", "Medications", T.TEXT, []),
  f("mobility-needs", "Mobility Needs", T.TEXT, ["mobility", "wheelchair"]),
  f("special-needs", "Special Needs", T.TEXT, ["specialneeds", "accommodations"]),
  f("physician-name", "Physician Name", T.TEXT, ["doctorname", "doctor"]),
  f("physician-phone", "Physician Phone", T.TEXT, ["doctorphone"]),
  f("homebound", "Homebound", T.BOOLEAN, ["shutin"]),
  f("preferred-hospital", "Preferred Hospital", T.TEXT, ["hospital"]),
  f("care-ministry", "Care Ministry", T.TEXT, ["careteam"]),
  f("prayer-requests", "Prayer Requests", T.TEXT, ["prayerrequest"]),
  f("grief-care", "Grief Care", T.BOOLEAN, ["griefsupport"]),
  f("counseling-referral", "Counseling Referral", T.BOOLEAN, []),

  // -- Volunteering & skills -----------------------------------------------------
  f("skills", "Skills", T.MULTI_SELECT, ["talents", "abilities"]),
  f("interests", "Interests", T.MULTI_SELECT, ["areasofinterest"]),
  f("hobbies", "Hobbies", T.TEXT, []),
  f("musical-instrument", "Musical Instrument", T.TEXT, ["instrument", "instruments"]),
  f("vocal-part", "Vocal Part", T.SELECT, ["voicepart"]),
  f("av-experience", "Audio/Visual Experience", T.BOOLEAN, ["soundexperience"]),
  f("teaching-experience", "Teaching Experience", T.BOOLEAN, ["teacher"]),
  f("childcare-willing", "Willing to Serve in Childcare", T.BOOLEAN, ["childcarevolunteer"]),
  f("transportation-willing", "Willing to Provide Transportation", T.BOOLEAN, ["drivewilling"]),
  f("meal-ministry-willing", "Willing to Provide Meals", T.BOOLEAN, ["mealministry", "mealtrain"]),
  f("hospitality-willing", "Willing to Serve in Hospitality", T.BOOLEAN, ["hospitality"]),
  f("willing-to-serve", "Willing to Serve", T.BOOLEAN, ["volunteerinterest", "wantstoserve"]),
  f("volunteer-status", "Volunteer Status", T.SELECT, []),
  f("availability", "Availability", T.SELECT, ["availabledays"]),
  f("preferred-service-time", "Preferred Service Time", T.SELECT, ["servicetime", "servicepreference"]),
  f("gifts-assessment-date", "Gifts Assessment Date", T.DATE, []),
  f("languages-spoken", "Languages Spoken", T.MULTI_SELECT, ["otherlanguages"]),
  f("professional-skills", "Professional Skills", T.TEXT, ["professionskills"]),
  f("trade", "Trade", T.TEXT, []),
  f("certifications", "Certifications", T.TEXT, ["certificates"]),

  // -- Communication & privacy ---------------------------------------------------
  f("newsletter-subscriber", "Newsletter Subscriber", T.BOOLEAN, ["newsletter", "mailinglist"]),
  f("sms-opt-in", "Text Message Opt-In", T.BOOLEAN, ["smsoptin", "textoptin"]),
  f("photo-consent", "Photo Consent", T.BOOLEAN, ["photorelease", "mediaconsent", "photopermission"]),
  f("directory-include", "Include in Directory", T.BOOLEAN, ["directory", "directoryoptin"]),
  f("directory-photo", "Directory Photo on File", T.BOOLEAN, []),
  f("preferred-service", "Preferred Service", T.SELECT, ["whichservice"]),
  f("online-attender", "Online Attender", T.BOOLEAN, ["watchesonline", "virtualattender"]),
  f("interpreter-needed", "Interpreter Needed", T.BOOLEAN, ["needsinterpreter"]),
  f("large-print-needed", "Large Print Needed", T.BOOLEAN, ["largeprint"]),
  f("accessibility-needs", "Accessibility Needs", T.TEXT, []),
  f("communication-notes", "Communication Notes", T.TEXT, []),
  f("best-time-to-contact", "Best Time to Contact", T.TEXT, ["besttimetocall"]),
  f("mail-returned", "Mail Returned", T.BOOLEAN, ["badaddress"]),
  f("email-bounced", "Email Bounced", T.BOOLEAN, ["bademail"]),

  // -- Family & household --------------------------------------------------------
  f("head-of-household", "Head of Household", T.BOOLEAN, ["headofhouse", "hoh"]),
  f("household-position", "Household Position", T.SELECT, ["familyposition", "familyrole"]),
  f("spouse-name", "Spouse Name", T.TEXT, ["spouse"]),
  f("number-of-children", "Number of Children", T.NUMBER, ["childrencount", "numkids"]),
  f("childrens-names", "Children's Names", T.TEXT, ["childrennames", "kids"]),
  f("parent-guardian-name", "Parent / Guardian Name", T.TEXT, ["parentname", "guardianname", "guardian"]),
  f("parent-guardian-phone", "Parent / Guardian Phone", T.TEXT, ["parentphone"]),
  f("parent-guardian-email", "Parent / Guardian Email", T.TEXT, ["parentemail"]),
  f("custody-notes", "Custody Notes", T.TEXT, ["custody"]),
  f("authorized-pickup", "Authorized Pickup", T.TEXT, ["pickupauthorization", "pickuplist"]),
  f("family-notes", "Family Notes", T.TEXT, []),
  f("single-parent", "Single Parent", T.BOOLEAN, []),
  f("foster-family", "Foster Family", T.BOOLEAN, ["fosters"]),
  f("adopted", "Adopted", T.BOOLEAN, []),
  f("grandparent-raising-children", "Grandparent Raising Children", T.BOOLEAN, []),
  f("empty-nester", "Empty Nester", T.BOOLEAN, []),

  // -- Life stage & engagement ---------------------------------------------------
  f("life-stage", "Life Stage", T.SELECT, ["lifestage", "agegroup"]),
  f("generation", "Generation", T.SELECT, []),
  f("student", "Student", T.BOOLEAN, ["isstudent"]),
  f("college", "College / University", T.TEXT, ["university"]),
  f("degree", "Degree", T.TEXT, ["fieldofstudy"]),
  f("retired", "Retired", T.BOOLEAN, ["retirementstatus"]),
  f("new-resident", "New to the Area", T.BOOLEAN, ["newintown"]),
  f("move-in-date", "Move-In Date", T.DATE, []),
  f("assimilation-stage", "Assimilation Stage", T.SELECT, ["pipelinestage", "journeystage"]),
  f("engagement-level", "Engagement Level", T.SELECT, ["engagement"]),
  f("follow-up-needed", "Follow-Up Needed", T.BOOLEAN, ["needsfollowup"]),
  f("follow-up-date", "Follow-Up Date", T.DATE, []),
  f("last-contacted-date", "Last Contacted", T.DATE, ["lastcontact"]),
  f("connect-card-date", "Connect Card Date", T.DATE, ["connectioncard"]),

  // -- Service background & ministries -------------------------------------------
  f("veteran", "Veteran", T.BOOLEAN, ["militaryveteran"]),
  f("military-branch", "Military Branch", T.SELECT, ["branchofservice"]),
  f("active-duty", "Active Duty", T.BOOLEAN, ["activemilitary"]),
  f("era-of-service", "Era of Service", T.TEXT, ["militaryera"]),
  f("first-responder", "First Responder", T.BOOLEAN, []),
  f("widowed", "Widow / Widower", T.BOOLEAN, ["widow", "widower"]),
  f("college-ministry", "College Ministry", T.BOOLEAN, []),
  f("youth-group", "Youth Group", T.BOOLEAN, ["studentministry"]),
  f("kids-ministry", "Kids Ministry", T.BOOLEAN, ["childrensministry"]),
  f("mens-ministry", "Men's Ministry", T.BOOLEAN, ["mensgroup"]),
  f("womens-ministry", "Women's Ministry", T.BOOLEAN, ["womensgroup"]),
  f("seniors-ministry", "Seniors Ministry", T.BOOLEAN, ["seniorsgroup"]),
];

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const LOOKUP = new Map<string, SuggestedPersonField>();
for (const field of SUGGESTED_PERSON_FIELDS) {
  for (const name of [field.key, field.label, ...field.aliases]) {
    const key = normalize(name);
    if (key && !LOOKUP.has(key)) LOOKUP.set(key, field);
  }
}

/**
 * Matches an arbitrary spreadsheet header against the catalog (case/punctuation
 * insensitive). Built-in targets (name/email/phone/…) are matched FIRST by
 * guessMappingColumns — this only sees headers those didn't claim.
 */
export function matchSuggestedField(header: string): SuggestedPersonField | null {
  return LOOKUP.get(normalize(header)) ?? null;
}
