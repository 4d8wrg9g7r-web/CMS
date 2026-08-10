import {
  formService,
  formSubmissionService,
  groupService,
  interpolate,
  journeyService,
  messageService,
  peopleService,
  taskService,
  workflowService,
  type ClaimedEvent,
  type ExecutorMap,
} from "@cms/database";

/**
 * Workflow executors + trigger wiring live in the app (like outbox-worker.ts) because
 * they perform external effects the data layer must not depend on. The engine — claiming,
 * sequencing, waits, retries, version pinning, timeline — lives in workflowService; this
 * file only supplies what each step type actually DOES and how trigger events map to a
 * run context.
 */

export const EXECUTORS: ExecutorMap = {
  // Interpolated so bodies can reference the trigger context: "Hi {{submitterName}}".
  // Sends flow through the Message log (BLUEPRINT §19): recorded, consent-aware for
  // recipients that ARE the run's linked person, delivered by the outbox worker.
  SEND_EMAIL: async (step, run) => {
    if (step.type !== "SEND_EMAIL") throw new Error("wrong step type");
    const person = run.personId ? await peopleService.getPerson(run.organizationId, run.personId) : null;
    let queued = 0;
    let suppressed = 0;
    for (const rawTo of step.to) {
      const to = interpolate(rawTo, run.context).trim();
      if (!to) continue;
      // Link the run's person when the recipient IS that person, so their consent applies.
      const isRunPerson = !!person?.email && person.email.toLowerCase() === to.toLowerCase();
      const result = await messageService.queueMessage({
        organizationId: run.organizationId,
        toEmail: to,
        toPersonId: isRunPerson ? run.personId : null,
        subject: interpolate(step.subject, run.context),
        body: interpolate(step.body, run.context),
        source: "workflow",
        workflowRunId: run.runId,
      });
      if (result.queued) queued++;
      else suppressed++;
    }
    return suppressed > 0 ? `Queued ${queued}, suppressed ${suppressed} (opted out)` : `Queued ${queued} email(s)`;
  },

  ADD_TO_GROUP: async (step, run) => {
    if (step.type !== "ADD_TO_GROUP") throw new Error("wrong step type");
    if (!run.personId) return "Skipped: run has no linked person";
    const result = await groupService.addMember(run.organizationId, step.groupId, run.personId, step.role ?? "MEMBER");
    if (!result.ok && result.reason !== "already_member") {
      // at_capacity / not_found are real failures the timeline should surface (and retry
      // may resolve at_capacity if someone leaves).
      throw new Error(`Could not add person to group: ${result.reason}`);
    }
    return result.ok ? "Added to group" : "Already in group";
  },

  ADD_TAG: async (step, run) => {
    if (step.type !== "ADD_TAG") throw new Error("wrong step type");
    if (!run.personId) return "Skipped: run has no linked person";
    const person = await peopleService.getPerson(run.organizationId, run.personId);
    if (!person) throw new Error("Person not found");
    if (person.tags.includes(step.tag)) return "Tag already present";
    await peopleService.updatePerson(run.organizationId, run.personId, { tags: [...person.tags, step.tag] });
    return `Tagged "${step.tag}"`;
  },

  // Title/description are interpolated so tasks read naturally ("Follow up with
  // {{submitterName}}"); the task carries workflowRunId provenance (§40) and links the
  // run's person when there is one.
  CREATE_TASK: async (step, run) => {
    if (step.type !== "CREATE_TASK") throw new Error("wrong step type");
    const task = await taskService.createTask(run.organizationId, {
      title: interpolate(step.title, run.context),
      description: step.description ? interpolate(step.description, run.context) : null,
      priority: step.priority,
      dueAt: step.dueInDays ? new Date(Date.now() + step.dueInDays * 24 * 60 * 60 * 1000) : null,
      assigneeUserId: step.assigneeUserId ?? null,
      relatedPersonId: run.personId,
      workflowRunId: run.runId,
    });
    return `Created task "${task.title}"`;
  },

  // Enrollment is idempotent at the service layer, so re-triggering never duplicates;
  // an inactive/archived journey or person-less run skips gracefully rather than failing
  // the run (docs/domain/journeys.md).
  ENROLL_IN_JOURNEY: async (step, run) => {
    if (step.type !== "ENROLL_IN_JOURNEY") throw new Error("wrong step type");
    if (!run.personId) return "Skipped: run has no linked person";
    const result = await journeyService.enroll(run.organizationId, step.journeyId, run.personId, {
      workflowRunId: run.runId,
    });
    if (!result.ok) return `Skipped: journey ${result.reason}`;
    return result.alreadyEnrolled ? "Already enrolled" : "Enrolled in journey";
  },
};

interface FormSubmittedPayload {
  formId: string;
  submissionId: string;
  version: number;
  submitterEmail: string | null;
  submitterName: string | null;
}

interface PersonCreatedPayload {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  membershipStatus: string;
}

/**
 * Outbox handler that fans trigger events out to matching published workflows. Runs
 * exactly once per event (outbox ProcessedEvent ledger). Context building happens here:
 * FormSubmitted re-reads the submission for answers + the matched person (linked after
 * the event's transaction), PersonCreated carries everything in its payload.
 */
export const workflowTriggerHandler = {
  name: "workflow-trigger",
  async run(event: ClaimedEvent) {
    if (event.type === "FormSubmitted") {
      const payload = event.payload as FormSubmittedPayload;
      const [form, submission] = await Promise.all([
        formService.getForm(event.organizationId, payload.formId),
        formSubmissionService.getSubmission(event.organizationId, payload.submissionId),
      ]);
      if (!submission) return; // deleted before processing — nothing to trigger on
      await workflowService.processTrigger(
        {
          organizationId: event.organizationId,
          trigger: "FormSubmitted",
          formId: payload.formId,
          eventId: event.id,
          personId: submission.personId,
          context: {
            formId: payload.formId,
            formTitle: form?.title ?? "",
            submitterName: payload.submitterName ?? "",
            submitterEmail: payload.submitterEmail ?? "",
            answers: submission.data ?? {},
          },
        },
        EXECUTORS,
      );
      return;
    }

    if (event.type === "EventRegistered") {
      const payload = event.payload as {
        eventId: string;
        eventTitle: string;
        registrationId: string;
        registrantName: string;
        registrantEmail: string | null;
        personId: string | null;
      };
      await workflowService.processTrigger(
        {
          organizationId: event.organizationId,
          trigger: "EventRegistered",
          eventId: event.id,
          personId: payload.personId,
          context: {
            eventId: payload.eventId,
            eventTitle: payload.eventTitle,
            registrantName: payload.registrantName,
            registrantEmail: payload.registrantEmail ?? "",
          },
        },
        EXECUTORS,
      );
      return;
    }

    if (event.type === "PersonCreated") {
      const payload = event.payload as PersonCreatedPayload;
      await workflowService.processTrigger(
        {
          organizationId: event.organizationId,
          trigger: "PersonCreated",
          eventId: event.id,
          personId: payload.personId,
          context: {
            personId: payload.personId,
            firstName: payload.firstName,
            lastName: payload.lastName,
            email: payload.email ?? "",
            membershipStatus: payload.membershipStatus,
          },
        },
        EXECUTORS,
      );
    }
  },
};

/** Advance every due run (elapsed WAITs, due retries). The cron backstop. */
export function drainWorkflowRuns(limit?: number) {
  return workflowService.drainDueRuns(EXECUTORS, limit);
}
