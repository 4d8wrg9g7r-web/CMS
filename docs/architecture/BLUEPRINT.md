# Church OS — Master Product & Technical Architecture Blueprint

> **Product + Engineering Constitution.** A unified blueprint for a church operating
> platform spanning people, ministry, staff, finance, digital, content, operations,
> automation, analytics, and AI.
>
> **Status:** Foundational product specification • Version 1.0 • August 2026

**North Star.** Build one coherent platform, not a collection of loosely connected
church apps. Every product should compose shared primitives: Person, Household,
Organization, Campus, Event, Form, Task, File, Message, Workflow, Ledger Entry,
Permission, and Audit Event.

**Document purpose.** This document combines the product blueprint with the technical
architecture specification that should govern implementation. It is the source-of-truth
document Claude Code, human engineers, product designers, and future implementation
teams work from. The condensed, enforceable invariants are extracted into
[`CONSTITUTION.md`](./CONSTITUTION.md); read that before planning or modifying
architecture.

---

## Table of contents

- [Executive Summary](#executive-summary)
- [Part I — Master Product Blueprint](#part-i--master-product-blueprint)
- [Part II — Technical Architecture Constitution](#part-ii--technical-architecture-constitution)
- [Part III — Claude Code Engineering Guardrails](#part-iii--claude-code-engineering-guardrails)
- [Part IV — Phased Build Roadmap](#part-iv--phased-build-roadmap)
- [Part V — Coverage & Differentiation Matrix](#part-v--coverage--differentiation-matrix)
- [Part VI — Canonical Data & Security Reference](#part-vi--canonical-data--security-reference)
- [Part VII — Operating Model for Building With Claude Code](#part-vii--operating-model-for-building-with-claude-code)
- [Appendix — Foundation Launch Checklist](#appendix--foundation-launch-checklist)

---

## Executive Summary

*What this product is, how it should be organized, and what must remain true as it grows.*

### 1. Product thesis

The platform is an operating system for the local church. It should support the full
lifecycle of a church's relationship with people, volunteers, donors, staff, content,
facilities, finances, and digital presence without forcing the church to maintain
duplicate records across separate products.

```
DISCOVERY  →  CONNECTION  →  DISCIPLESHIP  →  PARTICIPATION  →  OPERATIONS  →  COMMUNICATION  →  INTELLIGENCE
Website       People         Groups           Volunteers        Staff / HR      Email / SMS       Analytics
SEO           Forms          Learning         Services          Facilities      Push / App        Automation
Sermons       Events         Journeys         Giving            Finance         Website           AI
```

**Product promise.** Enter important information once, then let the platform reuse it
everywhere it belongs. A service time, event, sermon, person, team, room, fund, course,
or policy should not require duplicate entry across website, app, CRM, scheduling,
communications, and reporting.

### 2. Product families

| Family | Customer-facing capabilities |
| --- | --- |
| People | CRM, households, journeys, groups, forms, pastoral care, prayer |
| Ministry | Services, music, volunteer coordination, check-in |
| Events | Calendar, registrations, rooms, resources |
| Learning | Training, certifications, policy acknowledgments, courses |
| Staff | HR, onboarding, documents, time, PTO, mileage, expenses, reviews |
| Finance | Giving, funds, pledges, deposits, purchase requests, reconciliation |
| Content | Sermons, media, podcasts, content discovery |
| Digital | Website builder, app builder, SEO, member portal |
| Operations | Facilities, assets, maintenance, projects, inventory |
| Platform | Communications, automation, analytics, AI, integrations, settings |

### 3. Non-negotiable architectural principles

1. **One Person model.** Giving, Groups, HR, Check-In, Communications, and Services
   reference the same Person rather than creating product-specific people records.
2. **Multi-tenant from day one.** Every tenant-scoped record is explicitly owned by an
   Organization and, when relevant, a Campus or Ministry.
3. **Modular monolith first.** Maintain hard module boundaries without prematurely
   splitting the system into dozens of networked services.
4. **Permissions are a platform primitive.** Authorization is enforced at the
   service/repository layer, not only hidden in the UI.
5. **Auditability is mandatory for sensitive actions.** Finance, HR, child safety,
   exports, permission changes, and pastoral-care access require durable audit records.
6. **Workflows compose shared primitives.** Modules trigger workflows; modules should
   not each invent their own automation engine.
7. **External providers handle regulated infrastructure.** Payment credentials,
   background checks, email delivery, SMS delivery, and similar specialist functions
   should be integrated rather than reinvented.
8. **AI never bypasses permissions.** AI access is permission-aware, logged, grounded in
   authorized records, and separated from high-risk automated decisions.
9. **Public API and webhooks are designed early.** Migration and integration are product
   capabilities, not cleanup work after launch.
10. **Reliability follows ministry criticality.** Sunday-morning check-in, giving,
    authentication, and service planning have stricter operating requirements than
    editorial features.

---

## Part I — Master Product Blueprint

*The complete customer-facing product vision and the platform primitives that should be
reused across it.*

### 4. Shared platform primitives

| Primitive | Purpose | Used by |
| --- | --- | --- |
| Organization | Tenant boundary, subscription, branding, policies | All modules |
| Campus | Physical/digital ministry location | People, Events, Services, Check-In, Website, Giving |
| Person | Canonical individual identity | All ministry-facing modules |
| Household | Family/relationship grouping | People, Check-In, Giving, Registrations |
| Event | Shared scheduled occurrence | Calendar, Groups, Services, Facilities, Registrations |
| Form | Structured data collection | People, Events, HR, Care, Learning |
| Task | Assignable unit of work | HR, Facilities, Care, Events, Workflows |
| File / Media | Secure file metadata and storage reference | Content, HR, People, Services, Facilities |
| Message | Outbound/in-app communication record | Communications, Workflows, Events, Groups |
| Workflow | Trigger/condition/action orchestration | Every module |
| Ledger Entry | Immutable financial fact | Giving, Reimbursements, Deposits, Finance |
| Permission Policy | Authorization decision input | Every module |
| Audit Event | Security/compliance history | Every sensitive module |

### 5. People & Households

Canonical church CRM and relationship graph.

- Person profiles, household relationships, children, guardians, emergency contacts,
  contact methods, addresses, communication preferences, campuses, membership status,
  tags, custom fields, notes, milestones, lists, duplicate detection, merge tools,
  imports, exports, and engagement timeline.
- Every Person may exist without a login. A User account may authenticate and be linked
  to one Person; the concepts must remain separate.
- Sensitive subdomains such as pastoral care, giving, HR, and background checks must
  never be exposed merely because a user can view the basic Person profile.

### 6. Journeys & Discipleship

Configurable pathways that help churches model next steps.

- Custom journey definitions, milestones, stages, assignments, completion states, due
  dates, staff follow-up, and reporting.
- Examples include First Visit → Connect Card → Follow-Up → Next Steps → Membership →
  Group → Serve Team, but churches must be able to define their own models.
- Journey automation should use the central workflow engine rather than embed bespoke
  automation logic.

### 7. Forms

A church-aware form builder that turns submissions into structured actions.

- Conditional fields, household-aware inputs, signatures, file uploads, payment fields,
  approvals, hidden metadata, repeating fields, confirmation pages, and
  embeddable/public forms.
- Submissions may match or create People, update permitted fields, start workflows,
  create tasks, register attendees, or attach documents.
- Form schemas should be versioned so historical submissions remain interpretable after
  a form changes.

### 8. Groups

Community, discipleship, attendance, and leader tools.

- Group types, enrollment modes, seasons, campuses, schedules, meeting locations,
  leaders, members, applications, capacity, resources, curriculum, attendance, RSVPs,
  messaging, childcare metadata, and group finder publishing.
- Health dashboards should surface factual patterns such as attendance decline or long
  absences without making pastoral judgments or sensitive inferences.

### 9. Services & Music

Service planning, worship planning, team coordination, and stage documents.

- Service plans, templates, plan items, run-of-show timing, teams, positions, requests,
  rehearsals, songs, arrangements, keys, chord charts, lyrics, files, notes, service
  attendance, and service-specific communications.
- Music/Stage is a presentation mode over shared song and service-plan data rather than
  a totally separate product.
- Tablet mode should prioritize offline resilience, fast loading, annotations, set
  navigation, and minimal distraction.

### 10. Volunteers

Volunteer lifecycle management beyond simple scheduling.

- Teams, positions, qualification rules, availability, blockout dates, rotations,
  substitutions, serving history, reminders, training, background-check status,
  certifications, and team leadership.
- Eligibility should be policy-driven: for example, a Kids Leader role may require
  current background check + child safety training + approved reference check.
- Expired requirements should flag eligibility; the system should not silently delete
  schedule history or make irreversible decisions.

### 11. Learning

One LMS engine for staff, volunteers, leaders, and members.

- Courses contain video, text, documents, quizzes, acknowledgments, signatures,
  assignments, external certifications, and live-session requirements.
- Assignments can target a Person, team, position, employee type, group, campus, or
  organization-wide audience.
- Templates should be clonable and editable for customer churches: employee onboarding,
  child safety, financial controls, cybersecurity, volunteer orientation, pastoral
  boundaries, emergency procedures, and leadership development.

### 12. Check-In

High-reliability attendance and child-security workflows.

- Household check-in, child check-in, adult attendance, volunteer check-in, event
  check-in, stations, kiosks, QR/mobile check-in, label printing, room assignment, room
  capacity, allergies, security codes, guardian authorization, checkout, and attendance
  reporting.
- Check-In requires graceful degradation, local caching where appropriate, printer
  diagnostics, clear station status, and aggressive performance testing.

### 13. Events, Calendar & Registrations

One event object drives public, operational, and registration experiences.

- Events, recurrence, calendars, rooms, resources, setup/cleanup windows, staff
  assignments, registration products, capacity, waitlists, forms, discounts, payments,
  waivers, household registration, attendee messaging, volunteer requirements, check-in,
  attendance, and follow-up.
- Publishing an Event should make it available to authorized website/app surfaces
  without duplicate entry.

### 14. Facilities, Assets & Inventory

Physical operations and stewardship of church property.

- Buildings, rooms, maintenance requests, work orders, preventive maintenance,
  inspections, recurring service schedules, vendors, incidents, vehicles, production
  equipment, instruments, laptops, warranties, serial numbers, purchase data, assignment
  history, and inventory counts.
- Assets can be assigned to staff and automatically appear in onboarding/offboarding
  workflows.
- Facility requests and maintenance tasks use the shared Task engine.

### 15. Staff / Human Resources

A secure employee operating system tailored to church staff.

- Employee profile, employment status, department, position, supervisor, compensation
  history, benefits metadata, onboarding, offboarding, job descriptions, documents,
  policy acknowledgments, certifications, timecards, PTO, mileage, expenses, reviews,
  goals, equipment, and staff training.
- HR is a separate security domain from general People. A ministry leader who can view a
  Person should not inherit compensation, tax-document, disciplinary, or
  performance-review access.
- Payroll processing can initially integrate with specialist systems; the platform owns
  time, approvals, records, and exports before attempting full payroll.

### 16. Time, PTO, Mileage & Expenses

Simple employee self-service with manager approvals.

- Clock in/out, breaks, manual corrections, timesheet approval, PTO policies, balances,
  requests, blackout rules, manager calendars, mileage entry, configurable reimbursement
  rates, receipt capture, expense coding, and approval chains.
- Approved staff unavailability can inform scheduling while preserving the distinction
  between work schedule and ministry/service assignment.
- Financial exports should feed accounting/payroll integrations through explicit
  mappings.

### 17. Giving

A first-class church giving experience using regulated payment infrastructure.

- One-time and recurring gifts, cards, ACH, digital wallets, funds, campaigns, pledges,
  donor accounts, statements, offline gifts, batches, deposits, failed-payment recovery,
  refunds, text/QR entry points, reconciliation, and reporting.
- Payment credentials should be tokenized/hosted by a compliant processor. The platform
  stores processor references and church financial facts, not raw card/CVV data.
- Giving history references Person/Household but authorization to view giving remains
  independently restricted.

### 18. Finance & Purchasing

Church-specific financial workflows without prematurely becoming a full accounting suite.

- Funds, departments, budgets/visibility, purchase requests, approval chains,
  reimbursements, expense classifications, deposit reconciliation, accounting exports,
  and finance dashboards.
- Approved purchases can create Asset records when appropriate.
- QuickBooks/Xero/Sage-style integrations should be treated as adapters around the
  platform's own stable domain events.

### 19. Communications

One audience and delivery engine for email, SMS, push, and in-app messages.

- Segments/lists, channel eligibility, subscription preferences, templates, campaigns,
  transactional messages, scheduled messages, delivery status, bounce/failure handling,
  reply metadata where supported, and communication history.
- Audience construction should reuse People, Groups, Events, Campuses, Teams, Journeys,
  and custom fields rather than copying contacts into isolated marketing lists.
- SMS consent and channel preferences must be explicitly modeled and auditable.

### 20. Website Builder

A database-aware, church-specific website platform.

- Church-specific blocks for service times, Plan Your Visit, sermons, livestream,
  events, groups, ministries, staff, locations, beliefs, giving, FAQs, forms, and next
  steps.
- Design system controls for themes, typography, colors, spacing, responsive behavior,
  reusable sections, navigation, redirects, custom code boundaries, and staging/preview.
- Content blocks should bind to live platform data. Editing a service time or event
  should update connected surfaces without duplicate content entry.

### 21. Church SEO

SEO translated into ministry-friendly actions.

- Technical audits, metadata, sitemaps, canonical URLs, redirects, social previews,
  structured data, local/campus SEO, keyword/content opportunities, internal linking
  recommendations, performance monitoring, and indexability diagnostics.
- The UI should explain outcomes in plain language: for example, "Google does not
  clearly understand your service times" rather than only exposing raw JSON-LD warnings.
- AI may recommend or draft changes, but publishing material website changes should
  respect approval policies.

### 22. Sermon & Media Engine

The canonical media/content library for sermons, podcasts, series, and teaching.

- Video/audio ingest, YouTube/Vimeo import, transcripts, speakers, series, topics,
  scriptures, chapters, attachments, podcast feeds, clips, SEO metadata, publishing
  schedules, search, and related-content relationships.
- AI can assist transcription cleanup, chaptering, scripture extraction, metadata,
  summaries, discussion guides, and clip candidates while retaining human approval for
  published content.

### 23. Intelligent Content Discovery

Conversational discovery grounded in church-approved content.

- Semantic search across sermons, articles, podcasts, courses, devotionals, and approved
  external resources.
- The assistant should retrieve and recommend content rather than fabricate pastoral
  advice, counseling, or doctrine.
- The same retrieval infrastructure can power website search, app search, staff search,
  and recommendation surfaces.

### 24. App Builder & Member Portal

A branded mobile/member experience backed by the same data.

- Configurable app navigation and blocks, livestream, media, events, groups, giving,
  forms, notifications, household profile, registrations, serving schedule, courses,
  messages, and preferences.
- Prefer shared application infrastructure with organization-specific configuration;
  separately published branded apps can become a higher-tier option.
- Member Portal web experiences should reuse the same APIs and permissions as mobile.

### 25. Pastoral Care & Prayer

Sensitive ministry workflows isolated from ordinary CRM access.

- Prayer requests, counseling/follow-up records, hospital visits, bereavement,
  benevolence requests, care assignments, visibility levels, outcomes, and secure notes.
- Prayer requests should allow explicit visibility choices such as pastors only, prayer
  team, or approved public sharing.
- Access, export, and viewing of sensitive care records should be heavily audited.

### 26. Tasks & Projects

A universal work layer shared across ministries and operations.

- Tasks, assignments, due dates, priorities, status, comments, attachments, related
  entities, checklists, dependencies, recurring tasks, project boards, templates, and
  notifications.
- HR onboarding, facilities maintenance, pastoral follow-up, event planning, and
  communications campaigns should all compose this shared engine.

### 27. Automation & Workflow

The connective tissue of the entire platform.

- Triggers, conditions, delays, branches, actions, approvals, retries, idempotency keys,
  human tasks, escalation, status history, and workflow templates.
- Triggers should span forms, people, events, giving, check-in, attendance, groups,
  serving, training, HR, facilities, payments, content, and website activity.
- Every workflow run must be inspectable: what triggered it, what data was read, what
  actions ran, what failed, and what can be retried.

### 28. Analytics & AI

Cross-platform intelligence without bypassing privacy or authorization.

- Custom dashboards, role-specific scorecards, saved reports, exports, trends,
  funnel/journey reporting, participation metrics, website/app analytics, giving
  summaries, staffing/operations indicators, and content performance.
- Natural-language analysis must execute through permission-aware data access. AI should
  not receive broad database dumps "just in case."
- AI actions that modify records should use the same command/service layer, validation,
  audit log, and approval policies as human actions.

### 29. Integrations & Migration

Make switching and extending the platform a first-class product experience.

- Public API, scoped OAuth, API keys for server-to-server integrations, signed webhooks,
  import/export jobs, migration mapping, duplicate resolution, dry runs, reconciliation
  reports, and adapter architecture.
- Priority integrations include payment processor, email/SMS, accounting,
  Google/Microsoft identity/productivity, YouTube/Vimeo/podcast services,
  background-check providers, and common church-platform importers.
- Migration tools should show counts, errors, duplicates, unsupported fields, and
  post-import validation rather than silently importing partial data.

---

## Part II — Technical Architecture Constitution

*Rules Claude Code and future engineers should treat as invariants unless an explicit
architecture decision record changes them.*

### 30. Architecture style: modular monolith first

The initial production architecture should be a modular monolith: one primary
application/backend deployment with enforceable internal module boundaries, not a
free-for-all monolith and not premature microservices.

```
/apps       admin-web  public-web  member-web  mobile  worker
/packages   ui  auth  db  observability  testing  integrations
/modules    organizations  people  groups  events  services  volunteers
            learning  checkin  staff  giving  finance  communications
            content  digital  facilities  tasks  workflows  analytics
```

**Boundary rule.** A module may call another module through its published
application/service interface or consume its domain events. It must not reach directly
into another module's tables, repositories, or internal implementation because that
creates invisible coupling Claude will later amplify.

### 31. Suggested technology baseline

| Layer | Baseline | Reasoning |
| --- | --- | --- |
| Web | Next.js + React + TypeScript | Strong server/client ecosystem, shared types, modern admin/public UI |
| Mobile | React Native / Expo | Shared TypeScript skills and APIs; staged adoption |
| Backend | TypeScript application services | Keeps core domain logic outside UI handlers |
| Primary DB | PostgreSQL | Transactions, constraints, JSON where appropriate, mature operations |
| ORM / SQL | Prisma, Drizzle, or disciplined query layer | Select one and standardize; domain rules still live above ORM |
| Cache / ephemeral | Redis | Rate limits, short-lived locks, caching, queues when appropriate |
| Jobs | Durable queue/workflow worker | Retries, delays, recurring work, async integrations |
| Object storage | S3-compatible | Files/media are references, not database blobs |
| Search | Postgres first; dedicated search later | Avoid infrastructure until scale/search needs justify it |
| Payments | Connect-style payment platform | Tokenized regulated payment rails |
| Messaging | Pluggable email/SMS/push adapters | Provider independence and testability |
| Observability | Structured logs + traces + metrics + error tracking | Required before platform breadth grows |
| Infrastructure | Managed cloud services | Reduce undifferentiated operations burden |

### 32. Tenant isolation

- **Invariant:** Every tenant-owned table includes `organization_id` directly or
  inherits tenant ownership through a rigorously enforced parent that cannot be crossed
  accidentally.
- **Default deny:** Queries without an organization scope should be rejected by
  repository/service APIs except explicitly platform-global operations.
- **Defense in depth:** Use application authorization plus database constraints/policies
  where practical. Consider PostgreSQL Row Level Security for the highest-risk
  tenant-scoped datasets after careful testing.
- **No tenant IDs from trustless clients:** The server resolves allowed
  organization/campus context from authenticated membership and validates every
  requested scope.
- **Background jobs:** Every queued job carries organization context and
  authorization/system-principal context explicitly.
- **Files:** Storage keys and signed-download authorization are tenant-aware; object
  URLs are not treated as authorization.
- **Caching:** Cache keys include tenant scope. Never cache tenant data under globally
  ambiguous keys.
- **Analytics:** Cross-tenant aggregated analytics for the SaaS operator must use a
  separately governed pipeline and must not expose customer-identifiable data to other
  tenants.

### 33. Identity model

```
UserAccount            1 ── 0..1  Person
UserAccount            * ── *     OrganizationMembership
OrganizationMembership * ── *     Role / PermissionPolicy
Person                 1 ── *     PersonRelationship
Person                 * ── 1     Household   (may be many-to-many if needed)
```

- A Person is a ministry record. A UserAccount is an authenticated identity. Do not
  merge these concepts.
- An employee can be a Person plus an EmployeeProfile; a volunteer is a Person with team
  assignments; a donor is a Person/Household with financial relationships.
- Use stable internal UUID/ULID identifiers. External provider IDs are aliases, never
  canonical primary keys.
- Keep login email separate from Person contact email; they can often match but must not
  be assumed identical.
- Support account linking/recovery without creating duplicate Person records.

### 34. Authorization model

Use role-based access control for common assignments plus attribute/resource-level
policies for sensitive or scoped access. Authorization must answer both "what action?"
and "on which data scope?"

```
can(user, action, resource, context)

can(jane, "person.read.contact", person_123, campus=Raleigh)
can(jane, "giving.read", donor_123)                 → false
can(jane, "checkin.manage", event_456)              → true
can(finance_admin, "gift.refund", gift_789)         → true + audit
can(kids_leader, "background_check.read_result", p) → policy-dependent
```

| Security domain | Examples | Default posture |
| --- | --- | --- |
| General People | Contact, household, membership | Role/campus scoped |
| Children | Guardian, allergies, check-in security | Strict need-to-know |
| Giving | Gift amounts, payment/refund history | Finance-specific |
| HR | Compensation, tax docs, reviews, discipline | HR/executive only |
| Pastoral Care | Counseling/care notes, benevolence | Explicit restricted circles |
| Background Checks | Status/results/provider refs | Minimal disclosure |
| Platform Security | Roles, API keys, SSO, audit exports | Org admin/security admin |

**Claude rule.** Never implement "authorization by UI." Hiding a button is not a
security control. Every command/query that returns or mutates protected data must
enforce authorization server-side.

### 35. Domain/service layering

```
UI / Route Handler
   ↓
Application Command / Query
   ↓
Authorization + Validation
   ↓
Domain Service / Aggregate Rules
   ↓
Repository / Transaction
   ↓
PostgreSQL
   ↓
Domain Events → Outbox → Worker / Integrations
```

- Route handlers stay thin: parse request, resolve principal, invoke application
  service, serialize response.
- Business rules do not live in React components, database triggers, or provider adapters
  unless explicitly justified.
- Repositories hide persistence details and always operate within tenant scope.
- Commands are explicit verbs: `CreatePerson`, `RegisterAttendee`, `ApprovePTO`,
  `RefundGift`, `CompleteTraining`.
- Queries return purpose-built read models rather than leaking arbitrary database
  entities.
- External effects are not performed inside open database transactions; emit an outbox
  event and let durable workers perform them.

### 36. Database design rules

- Use relational columns and foreign keys for core domain relationships. JSON is for
  genuinely flexible/extensible data, not as an escape hatch from schema design.
- Enforce important invariants with database constraints in addition to application
  validation where possible.
- Prefer soft archival/status fields for ministry records that require history; do not
  blindly soft-delete every table.
- Financial ledger entries and audit events are append-oriented and should not be mutated
  in place except narrowly defined metadata corrections.
- Every table gets `created_at` and, where meaningful, `updated_at`. Sensitive tables may
  additionally store `created_by`/`updated_by` or derive this through audit history.
- Use explicit timezone-aware timestamps; display in organization/campus timezone.
- Use decimal/integer minor units for money. Never floating-point money.
- Large historical tables such as check-ins, communication events, audit events, and
  workflow runs should be designed for partitioning/archive strategies before they become
  operational emergencies.
- Every migration must be backward-safe for rolling deployments when the deployment model
  requires it.

### 37. Financial ledger model

Financial facts should be modeled as immutable or append-only events with clear links to
processor transactions, funds, donors, deposits, adjustments, refunds, and reconciliation
status.

```
Gift
 ├─ gross_amount
 ├─ currency
 ├─ donor/person/household reference
 ├─ payment_processor_reference
 └─ GiftAllocation[] → Fund

Settlement / Deposit
 ├─ processor_payout_reference
 ├─ gross
 ├─ fees
 ├─ net
 └─ related transactions

Adjustment / Refund
 └─ references original transaction; never silently overwrites it
```

**Payment-data boundary.** Do not store raw card numbers, CVV, or unrestricted bank
credentials. Use processor-hosted/tokenized payment components and store only the minimum
references needed to operate the church giving experience.

### 38. Event and outbox architecture

- Domain events describe facts that already happened: `PersonCreated`, `EventPublished`,
  `GiftSucceeded`, `TrainingExpired`, `PTOApproved`.
- Write domain state and its outbound event record in the same database transaction using
  an outbox pattern.
- A worker publishes/processes outbox events after commit, with retries and idempotency.
- Consumers must tolerate duplicate delivery. Every side-effecting handler needs an
  idempotency strategy.
- Events are versioned contracts. Breaking event payload changes require a new event
  version or compatible evolution.
- Do not use events to obscure simple synchronous domain invariants. If a command must
  know immediately whether something is valid, enforce it synchronously.

### 39. Workflow engine specification

| Concept | Required behavior |
| --- | --- |
| Trigger | Domain event, schedule, manual start, webhook, form submission |
| Condition | Permission-safe evaluation over allowed data |
| Action | Send message, create task, update field, assign role, create registration, invoke integration, request approval |
| Delay | Durable timer, not in-memory sleep |
| Branch | Deterministic condition branches |
| Approval | Human decision step with deadline/escalation |
| Retry | Configurable transient-failure retries with backoff |
| Idempotency | Prevent duplicate external effects |
| Versioning | Existing runs preserve the workflow version they started with |
| Observability | Timeline of trigger, inputs, steps, outputs, failures, retries |
| Cancellation | Safe cancellation semantics and audit history |

```
WorkflowDefinition v3
WHEN FormSubmitted(form = ConnectCard)
IF person.first_visit = true
THEN CreateTask(type = FollowUp)
THEN SendTemplate(channel = email, template = FirstVisitWelcome)
WAIT 2 days
IF task.status != Complete
THEN Notify(role = ConnectionsPastor)
```

### 40. Task engine specification

- Tasks support assignee Person/User/Team, related entity, due date, priority, status,
  checklist, comments, files, recurrence, and workflow provenance.
- Tasks created by workflows retain `workflow_run_id` so users can understand why they
  exist.
- Domain-specific screens can present tasks contextually, but they should remain the same
  Task records underneath.
- Task permissions inherit both task visibility and related-entity sensitivity.

### 41. File and media architecture

- Object storage contains bytes; PostgreSQL contains file metadata, tenant ownership,
  access policy, hashes, processing state, and relationships.
- Uploads use short-lived signed URLs or trusted upload endpoints with
  file-size/type validation and malware scanning where appropriate.
- Private HR, pastoral-care, and child-safety documents are never served from permanently
  public URLs.
- Media processing is asynchronous: thumbnails, transcoding, waveform extraction,
  transcript generation, and metadata extraction are durable jobs.
- Files can be retained/archived independently of a UI record when policy requires legal
  or historical preservation.

### 42. API conventions

- Expose explicit versioned APIs. REST is a reasonable default; GraphQL may be added only
  where its benefits justify authorization/query-complexity costs.
- Use consistent resource naming, pagination, filtering, error envelopes, request IDs,
  idempotency headers, and optimistic concurrency where needed.
- Public APIs operate through the same application services as first-party clients; never
  provide a bypass around authorization/business rules.
- Use scoped OAuth for third-party user-authorized access, service credentials for
  trusted server integrations, and signed webhooks for outbound events.
- Rate limits are tenant-aware and principal-aware. Elevated bulk/export endpoints have
  stricter controls and audit logging.
- API responses should not expose internal database columns or provider secrets
  accidentally through broad object serialization.

### 43. Webhook conventions

- Sign webhook payloads with rotating secrets; include timestamp and event ID.
- Retries use exponential backoff with a maximum retention window and dead-letter
  visibility.
- Customers can inspect delivery attempts, HTTP status, response snippets, and replay
  eligible deliveries.
- Webhook payloads minimize sensitive content; consumers can call the API for authorized
  detail when appropriate.
- Webhook event schemas are versioned and documented.

### 44. Background jobs and scheduling

- Every async job has a durable ID, tenant context, attempt count, status, last error,
  and timestamps.
- Jobs must be idempotent or protected by idempotency keys/locks.
- Recurring schedules are persisted and timezone-aware.
- Long-running imports/exports/media processing expose progress and cancellation where
  practical.
- No production-critical automation depends on a single web request remaining alive.

### 45. Search architecture

- Start with PostgreSQL text search/trigram capabilities for most operational search.
- Abstract search behind application interfaces so a dedicated engine can later serve
  full-text, faceted, and semantic search.
- Semantic/vector indexes must preserve authorization metadata. Retrieval must filter
  inaccessible records before content reaches the model.
- Sensitive HR/pastoral data should not enter a broad cross-platform semantic index
  unless explicitly designed and isolated.

### 46. AI architecture

```
User Request
   ↓
Authenticated Principal
   ↓
AI Orchestrator
   ↓
Permission-aware Tools / Queries
   ↓
Approved Context Only
   ↓
Model
   ↓
Proposed Answer / Action
   ↓
Policy + Validation + Optional Human Approval
   ↓
Application Command
   ↓
Audit Log
```

- AI is not granted direct unrestricted SQL access.
- Provide narrowly scoped tools such as `SearchSermons`, `QueryAttendanceSummary`,
  `DraftWebsitePage`, `ListExpiringTraining`.
- Never place secrets, raw payment credentials, unnecessary HR documents, or unrestricted
  pastoral notes in prompts.
- Destructive/sensitive actions require deterministic validation and may require explicit
  approval even if requested through AI.
- Capture model/provider/version, tool calls, record references, and action results for
  AI-assisted mutations where auditability matters.
- Use a provider abstraction so models can change without rewriting domain logic.

### 47. Audit architecture

| Audit class | Examples | Retention posture |
| --- | --- | --- |
| Security | Login, MFA, role changes, API keys, SSO | Long-lived |
| Data access | HR record viewed, pastoral note viewed, large export | Long-lived / policy-driven |
| Finance | Gift refund, fund change, deposit reconciliation | Long-lived |
| Child safety | Guardian/security changes, background-check access | Long-lived |
| Administration | Configuration, website publishing, integrations | Operational history |
| AI mutation | AI-triggered record changes and approvals | Same as underlying action |

- Audit records are append-only to normal application users.
- Record actor, tenant, action, resource, timestamp, request ID, source/client, and
  meaningful before/after metadata when safe.
- Do not duplicate highly sensitive document contents into audit metadata; log references
  and structured deltas.
- Provide controlled audit search/export to security/authorized admins.

### 48. Security baseline

- MFA support, secure session management, CSRF protections where relevant, secure
  cookies, modern password hashing, optional SSO/SCIM for larger organizations.
- Central secrets manager; no production secrets in source code, repository history,
  client bundles, logs, or prompt context.
- Encryption in transit and at rest using managed cloud capabilities; additional
  application-level encryption for selected highly sensitive fields if threat model
  warrants it.
- Dependency scanning, secret scanning, SAST, container/image scanning, and automated
  security tests in CI.
- Rate limiting and abuse protection on auth, forms, giving, search, and public
  endpoints.
- Regular backup restore tests; backups are useless until restoration is proven.
- Security review and penetration testing before broad commercial deployment, especially
  for giving, children, HR, and pastoral care.
- Create incident response procedures, security contact path, severity classification,
  and customer notification process before scale.

### 49. Privacy and data governance

- Data classification: Public, Internal, Confidential, Highly Restricted.
- Field/resource definitions should declare classification and permitted processing
  purposes.
- Data retention should be configurable by domain where legal/organizational requirements
  differ.
- Provide export/delete/anonymization workflows where legally appropriate while
  preserving records that must be retained for financial/security/legal reasons.
- Consent/communication preference changes are timestamped and auditable.
- Dev/test environments use synthetic or sanitized production-derived data; never
  casually clone sensitive church databases into developer laptops.
- Customer support impersonation/access requires controlled, time-limited, audited
  support-access mechanisms.

### 50. Reliability tiers

| Tier | Examples | Target posture |
| --- | --- | --- |
| Tier A — Sunday critical | Auth, Check-In, Service plans, member identity | High availability, graceful degradation, strong monitoring, tested recovery |
| Tier B — Financial | Giving, deposits, refunds, statements | High integrity, idempotency, reconciliation, strong audit |
| Tier C — Operational | People, Groups, Events, Volunteers, HR | Reliable transactional application |
| Tier D — Editorial | Website editing, SEO recommendations, content drafting | Can tolerate slower async workflows without affecting ministry operations |

- Define SLOs per tier instead of pretending every feature needs identical availability.
- Create runbooks for Tier A/B incidents before commercial launch.
- Use feature flags and kill switches for integrations/automations that could cascade
  failures.

### 51. Observability

- Structured logs include request/job/workflow IDs and tenant IDs but redact secrets and
  sensitive content.
- Distributed tracing spans web request → application command → database → outbox →
  worker → external provider where practical.
- Metrics cover latency, error rate, queue depth, webhook failures, provider failures,
  email/SMS deliverability, check-in throughput, payment events, and database health.
- Alert on user-impacting symptoms, not only server CPU.
- Provide internal admin tooling for workflow runs, integration status, imports, provider
  errors, and customer-safe diagnostics.

### 52. Testing constitution

| Test type | Purpose |
| --- | --- |
| Unit | Domain rules and pure logic |
| Integration | Repository/database constraints, external adapter contracts |
| Authorization | Positive and negative permission matrix tests |
| Contract | Public API, webhook, provider adapters |
| End-to-end | Critical customer workflows across UI + backend |
| Migration | Upgrade real representative schemas/data safely |
| Load | Check-In, public event spikes, giving campaigns, communication fan-out |
| Resilience | Provider failures, duplicate webhooks, retries, queue backlog |
| Security | Auth boundaries, tenant isolation, export protections, common web vulnerabilities |

**Merge gate.** No module is "done" because Claude produced working UI. Critical business
rules, tenant isolation, authorization, migrations, and failure cases must have automated
tests before a feature is treated as production-ready.

### 53. Feature flags and configuration

- Use organization-level feature entitlements for plans/beta features, not scattered
  if-statements tied to customer names.
- Feature flags have owner, purpose, default, rollout state, and removal date/criteria.
- Operational config belongs in typed configuration/services, not magic
  environment-variable reads throughout business code.
- Church-customizable policies (PTO, giving funds, required training, check-in rules)
  belong in versioned tenant configuration with validation.

### 54. Integration adapter architecture

```
Domain/Application Layer
   ↓
Port / Interface
   ↓
Adapter
 ├─ StripeAdapter
 ├─ EmailProviderAdapter
 ├─ SmsProviderAdapter
 ├─ QuickBooksAdapter
 ├─ BackgroundCheckAdapter
 └─ MediaProviderAdapter
```

- Provider-specific webhook payloads are translated into internal commands/events at the
  adapter boundary.
- Domain records never depend on provider-specific enums if an internal stable vocabulary
  can represent the concept.
- Adapter contract tests protect against accidental breakage during provider/library
  upgrades.
- Provider IDs are stored in dedicated integration-reference tables, allowing future
  provider migration.

### 55. Import/migration architecture

- Every migration is a job with dry-run, mapping, validation, import, reconciliation, and
  rollback/compensation strategy.
- Imported records store source-system provenance and source IDs for dedupe/re-run
  safety.
- Never silently discard unsupported source data; generate an exceptions report.
- Large imports stage data before promotion into canonical tables so duplicate resolution
  and validation can occur safely.
- Migration tooling is tenant-isolated and high privilege; every export/import is audited.

---

## Part III — Claude Code Engineering Guardrails

*The implementation rules that should be placed in the repository and referenced in every
major Claude Code build request.*

### 56. Repository constitution

**Recommended file.** Create [`CONSTITUTION.md`](./CONSTITUTION.md) containing the
invariants in this section. Claude Code should be instructed to read it before planning or
modifying architecture.

1. Do not create a new representation of Person, Organization, Campus, Event, Task, Form,
   File, Workflow, Message, Permission, or Ledger Entry when an existing primitive can
   satisfy the requirement.
2. Do not access another module's database tables directly. Use its public application
   interface or published event contract.
3. Do not introduce a new infrastructure dependency, cloud service, queue, database, or
   framework without an Architecture Decision Record (ADR).
4. Do not weaken tenant scoping, authorization, audit logging, validation, or encryption
   to simplify implementation.
5. Do not perform external network side effects inside a database transaction. Use outbox
   + durable worker patterns.
6. Do not store secrets or regulated credentials in application tables/logs unless the
   architecture explicitly requires and protects them.
7. Do not let UI components own business rules that are required by API/mobile/automation
   clients.
8. Do not add AI direct database access. AI must use permission-aware application tools.
9. Do not modify immutable financial or audit facts in place; use corrective/compensating
   records.
10. Do not silently invent product behavior when a domain rule is unspecified. Preserve
    the current invariant, record the ambiguity in the implementation summary, and choose
    the safest reversible behavior.
11. Do not create customer-specific code branches. Model tenant variation as
    configuration, templates, permissions, or extensions.
12. Do not merge code without tests for new domain rules, authorization boundaries, and
    failure cases.

### 57. Standard feature implementation sequence

1. Read product/domain spec + `CONSTITUTION.md`
2. Identify existing primitives/modules to reuse
3. Write implementation plan
4. Define permission matrix
5. Define schema/migration changes
6. Define commands/queries + events
7. Define API/UI contract
8. Implement domain + repository
9. Implement workers/integrations
10. Implement UI
11. Add unit/integration/auth/E2E tests
12. Run lint/typecheck/tests/migrations
13. Summarize architecture impact + unresolved risks

### 58. Required feature spec template

See [`feature-spec-template.md`](./feature-spec-template.md).

| Section | Required content |
| --- | --- |
| Problem | User problem and measurable outcome |
| Actors | Roles/personas using the feature |
| Scope | Included and explicitly excluded behavior |
| Data | Entities, fields, ownership, retention, classification |
| Permissions | Action × role/scope matrix |
| Commands | State-changing operations and invariants |
| Queries | Read models and filters |
| Events | Published/consumed domain events |
| Workflows | Automation hooks and idempotency |
| UI states | Loading, empty, error, permission denied, success |
| Failure modes | Provider errors, retries, duplicates, offline behavior |
| Audit | Actions that require audit records |
| Tests | Unit, integration, authorization, E2E, load if critical |
| Migration | Backfill/import/upgrade plan |

### 59. Architecture Decision Records

Use short ADRs for decisions that future engineers or Claude might otherwise revisit
repeatedly. Each ADR should state Context, Decision, Alternatives Considered,
Consequences, and Status. See [`adr/`](./adr/).

- ADR-001: Modular monolith before microservices
- ADR-002: Canonical Person and separate UserAccount
- ADR-003: PostgreSQL as primary system of record
- ADR-004: Outbox for cross-module/external side effects
- ADR-005: Shared workflow engine
- ADR-006: Tokenized payment processor boundary
- ADR-007: Permission-aware AI tool architecture
- ADR-008: S3-compatible object storage + metadata DB
- ADR-009: API/webhook versioning strategy
- ADR-010: Multi-tenant isolation strategy

### 60. Definition of Done

See [`DEFINITION_OF_DONE.md`](./DEFINITION_OF_DONE.md).

- Product acceptance criteria satisfied.
- Tenant scope enforced and tested.
- Permission matrix implemented with negative tests.
- Audit requirements implemented.
- Migrations are safe and repeatable.
- No secrets/sensitive values leaked to logs.
- Async effects are idempotent and observable.
- Loading/empty/error/permission-denied UI states exist.
- Unit/integration/E2E coverage exists appropriate to risk tier.
- Observability added for critical paths.
- Documentation and changelog/domain spec updated.
- No duplicate platform primitive introduced.
- Accessibility baseline verified for customer-facing UI.

---

## Part IV — Phased Build Roadmap

*A sequence designed to create real ministry value early without sacrificing the
architecture required for a commercial platform.*

### Phase 0 — Foundation
*Architecture before customer breadth.*

Organizations, campuses, auth, People, households, permissions, audit, files, tasks, event
primitive, messages/notifications, durable jobs, workflow core, API conventions, webhooks,
testing, observability, backups.

**Exit criteria.** Exit when tenant isolation and authorization have automated tests; one
organization can safely manage People/Households; jobs/outbox/audit are production-shaped.

### Phase 1 — Internal Church Operating MVP
*Replace core disconnected operational workflows.*

Forms, journeys, groups, events, volunteers, services, tasks, communications, basic
dashboards and migration tools.

**Exit criteria.** Exit when a real church can run weekly people follow-up, group
activity, event planning, volunteer scheduling, service plans, and communications in the
platform.

### Phase 2 — Digital Platform
*Turn internal data into public/member experiences.*

Website builder, SEO, sermon/media engine, content discovery, member portal, app shell,
push notifications.

**Exit criteria.** Exit when events, sermons, forms, groups, service times, and giving
entry points can publish from one source of truth to public/member surfaces.

### Phase 3 — Ministry Operations
*Reach broad Planning Center-style operational coverage.*

Check-In, advanced registrations, rooms/resources, facilities, assets, Learning,
background-check integration, prayer, pastoral care.

**Exit criteria.** Exit when the platform can reliably support Sunday check-in and
operational ministry workflows with sensitive-data boundaries.

### Phase 4 — Staff Platform
*Extend the operating system to employees.*

HR, onboarding/offboarding, staff documents, time, PTO, mileage, expenses, reviews, staff
training, equipment assignment.

**Exit criteria.** Exit when staff lifecycle workflows and approvals work without exposing
HR data to ordinary ministry roles.

### Phase 5 — Giving & Finance
*Own the giving experience while regulated infrastructure moves funds.*

Processor platform integration, cards, ACH, wallets, recurring giving, funds, campaigns,
pledges, statements, offline gifts, batches, deposits, refunds, reconciliation,
purchase/finance integration.

**Exit criteria.** Exit after professional security/payments/legal review, reconciliation
testing, failure/retry testing, and controlled real-money pilot.

### Phase 6 — Intelligence
*Use accumulated connected data safely.*

Cross-platform analytics, natural-language reporting, AI assistant, SEO/content copilots,
workflow drafting, factual ministry insights, anomaly detection.

**Exit criteria.** Exit when AI access is permission-aware, auditable, measured, and useful
without becoming a bypass around normal controls.

### Phase 7 — Commercial SaaS
*Productize onboarding, migration, support, and ecosystem.*

Self-service church onboarding, subscriptions/entitlements, implementation tools, migration
wizard, template library/marketplace, enterprise controls, white labeling, public developer
platform, customer-support tooling, partner program.

**Exit criteria.** Exit when a new church can migrate, configure, train, launch, and
receive support without founder-only knowledge.

### 61. What not to build first

- Full payroll engine — integrate before replacing payroll providers.
- Full general-ledger accounting — integrate with established accounting systems before
  considering native accounting.
- Custom card processing/acquiring infrastructure — own the donor experience, not the
  regulated payment rails.
- Microservices for every product family — extract only when scale/team boundaries
  justify it.
- An unrestricted AI "chat with the whole database" feature — start with scoped tools and
  explicit use cases.
- A giant app-builder framework before the data/content primitives are stable.
- Customer-specific forks — variation should be configuration or templates.

---

## Part V — Coverage & Differentiation Matrix

*A build-target map showing how the platform should cover existing church-software
categories while adding church operations that are often fragmented elsewhere.*

| Market category | Target product area | Differentiation goal |
| --- | --- | --- |
| Church CRM / People | People + Journeys | Single relationship graph across all products; configurable discipleship journeys |
| Groups | Groups | Health/leader workflows connected to journeys, communications, training |
| Service planning | Services + Music + Volunteers | Plan, music, qualification, volunteer lifecycle in one model |
| Check-in | Check-In | Household/security model tightly connected to People and Events |
| Registrations | Events + Registrations | Event drives website/app/calendar/rooms/comms/check-in |
| Giving | Giving + Finance | Unified donor experience and ledger; processor hidden underneath |
| Member app | App + Member Portal | Self-service connected to household, giving, groups, schedules, courses |
| Church website | Website Builder | Database-aware publishing rather than duplicate CMS entry |
| SEO tools | Church SEO | Church-specific explanations and structured data generated from trusted records |
| Media/sermons | Sermon Engine + Discovery | Transcription, enrichment, distribution, semantic discovery |
| HR tools | Staff | Church staff workflows, permissions, training, time/PTO/expense in same platform |
| LMS/training | Learning | Shared employee/volunteer/member course engine + templates |
| Facilities/asset software | Operations | Rooms/resources/events/maintenance/assets tied together |
| Task/project software | Tasks + Projects | Shared tasks related directly to church records/workflows |
| Automation tools | Workflow Engine | Native cross-module automation with audit and permissions |
| Analytics/AI | Analytics + AI | Permission-aware cross-platform reporting and assistance |

---

## Part VI — Canonical Data & Security Reference

*A compact reference for the entities and data classifications future domain specs should
build on.*

### 62. Canonical entity registry

| Entity | Meaning | Typical classification |
| --- | --- | --- |
| Organization | Tenant/account; branding; policy defaults | Internal |
| Campus | Location/ministry scope | Internal |
| UserAccount | Authentication principal | Confidential |
| OrganizationMembership | User ↔ tenant membership and roles | Confidential |
| Person | Canonical individual ministry record | Confidential |
| Household | Family/relationship grouping | Confidential |
| PersonRelationship | Guardian/spouse/family/other relationship | Confidential |
| Event | Scheduled occurrence | Public/Internal |
| Registration | Person/household ↔ Event signup | Confidential |
| CheckIn | Attendance/security record | Confidential/Restricted |
| Group | Community/ministry grouping | Public/Internal |
| GroupMembership | Person ↔ Group | Confidential |
| ServicePlan | Service/run-of-show | Internal |
| Team/Position | Volunteer/staff assignment structure | Internal |
| TrainingCourse | Learning definition | Internal/Public |
| TrainingAssignment | Person ↔ course requirement/completion | Confidential |
| EmployeeProfile | Employment relationship | Highly Restricted |
| TimeEntry | Work time | Restricted |
| PTORequest | Leave request | Restricted |
| Expense/Mileage | Reimbursement request | Restricted |
| Gift | Contribution fact | Highly Restricted |
| Fund/Allocation | Financial designation | Restricted |
| Deposit/Settlement | Processor/bank reconciliation record | Highly Restricted |
| PastoralCareCase | Sensitive care workflow | Highly Restricted |
| PrayerRequest | Request with explicit visibility | Confidential/Restricted |
| Asset | Owned equipment/property | Internal |
| FacilityRequest | Maintenance/work order | Internal |
| Task | Universal work item | Inherits related resource |
| FormDefinition | Versioned form schema | Internal/Public |
| FormSubmission | Captured form data | Inherits field/resource sensitivity |
| File | Object metadata/access policy | Inherits related resource |
| Message | Communication content/status | Confidential |
| WorkflowDefinition | Automation definition | Internal |
| WorkflowRun | Execution history | Confidential |
| AuditEvent | Security/action history | Highly Restricted |
| IntegrationConnection | Provider credentials/references | Highly Restricted |

### 63. Data classification rules

| Class | Examples | Handling |
| --- | --- | --- |
| Public | Published website content, public event info | May be publicly cached/indexed |
| Internal | Service plans, facility tasks, internal courses | Authenticated tenant users as authorized |
| Confidential | Person contacts, registrations, household data | Need-to-know; encrypted transport/storage; audited exports |
| Restricted | Child security data, time/PTO, detailed background status | Explicit role/resource authorization; minimized access |
| Highly Restricted | Giving details, compensation, tax docs, pastoral notes, credentials | Strongest authorization, auditing, support-access controls, minimal AI exposure |

---

## Part VII — Operating Model for Building With Claude Code

*How to use AI coding tools aggressively without allowing speed to outrun architecture,
security, or review.*

### 64. Recommended development loop

1. Maintain this master blueprint plus module-specific domain specs in `/docs`.
2. Before each epic, create a short ADR only if the work changes a foundational decision.
3. Give Claude Code one bounded epic/feature at a time with explicit scope and non-goals.
4. Require Claude to identify reused platform primitives before proposing schema.
5. Require a permission matrix before implementation of sensitive features.
6. Require migrations, domain tests, authorization tests, and failure/retry tests
   alongside UI.
7. Run a human architecture review before merging changes to core primitives, permissions,
   finance, HR, child safety, or workflow infrastructure.
8. Deploy behind a feature flag to internal/pilot organizations first.
9. Collect real operational feedback, then update the domain spec before widening rollout.
10. Periodically run architecture lint/review to identify cross-module imports, duplicated
    primitives, bypassed authorization, and accumulating flags.

### 65. Example Claude Code master instruction

```
Before making any changes:
1. Read /docs/architecture/CONSTITUTION.md and the relevant /docs/domain/*.md files.
2. Identify which existing platform primitives and module APIs this feature must reuse.
3. Do not create duplicate People, Event, Task, Form, File, Message, Workflow,
   Permission, or financial concepts.
4. Preserve organization scoping and enforce authorization server-side.
5. External side effects must use the outbox/worker pattern.
6. Add/update audit events for sensitive actions.
7. Add migrations and automated tests, including negative authorization tests.
8. Do not add a new dependency or architectural pattern without an ADR.
9. At completion, report schema changes, module interfaces used, events added,
   permission changes, tests run, and unresolved risks.
```

### 66. Human review required

- Changes to authentication, tenant isolation, authorization, encryption, secrets, audit
  architecture, or SSO.
- Giving/payment flows, refunds, statements, ledger/reconciliation rules, and financial
  exports.
- HR compensation, tax/payroll documents, disciplinary/performance data, or employee
  retention policies.
- Child check-in/security, guardian authorization, background-check handling, or
  child-safety data.
- Pastoral-care confidentiality and benevolence workflows.
- Large-scale data imports, destructive migrations, retention/delete operations, and
  customer exports.
- AI features that can mutate records, communicate externally, or analyze highly
  restricted data.

---

## Appendix — Foundation Launch Checklist

*The minimum architecture capabilities to establish before feature velocity accelerates.*

| Area | Foundation requirement |
| --- | --- |
| Tenancy | Organization/Campus context resolved on every request and job; cross-tenant tests pass. |
| Identity | UserAccount separated from Person; membership/role model established. |
| Permissions | Central authorization API exists; sensitive-domain policies tested. |
| Audit | Append-only audit pipeline and viewer for authorized admins. |
| Database | Migration conventions, constraints, money/timestamp standards, backup strategy. |
| Outbox | Transactional outbox + worker + idempotent handlers. |
| Jobs | Durable retries, scheduling, dead-letter/failed-job visibility. |
| Files | Private object storage, signed access, upload validation, metadata model. |
| Tasks | Universal task primitive with related-resource authorization. |
| Forms | Versioned definitions and submissions, before many modules create bespoke intake forms. |
| Events | Canonical event primitive and recurrence strategy. |
| Communications | Message/template/channel abstraction with consent/preferences. |
| Workflows | Versioned workflow definition/run model with inspectable history. |
| API | Versioning/error/pagination/idempotency conventions established. |
| Webhooks | Signed outbound delivery, retries, replay, event versioning. |
| Observability | Logs, metrics, traces, error tracking, tenant/request correlation. |
| Testing | Unit/integration/auth/E2E harness and CI gates. |
| Security | MFA path, secrets management, scanning, rate limiting, incident response skeleton. |
| Backups | Automated backups plus verified restore procedure. |
| Docs | CONSTITUTION.md, ADR folder, domain-spec template, Definition of Done checked into repo. |

**Final design test.** Before approving any new module, ask: *"If we removed the UI label
for this feature, is the underlying capability already a platform primitive?"* If yes,
compose it. If no, define a genuinely new domain concept with clear ownership and
boundaries.

---

*END OF MASTER BLUEPRINT*
