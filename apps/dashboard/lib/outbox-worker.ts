import { formService, messageService, outboxService, type ClaimedEvent, type HandlerRegistry } from "@cms/database";
import { getEmailProvider, renderEmailHtml, type EmailAttachmentInput } from "@cms/email";
import { getPrivateStorageProvider } from "@cms/storage";
import { workflowTriggerHandler } from "./workflow-runner";
import { webhookDispatchHandler } from "./webhook-dispatcher";

/**
 * The outbox handler registry lives in the app (not the database package) because
 * handlers perform external effects -- email, and later cross-module actions -- that the
 * data layer must not depend on. The generic claim/retry/idempotency orchestration lives
 * in outboxService.drain; this file only supplies the handlers and a drain entry point.
 */

interface FormSubmittedPayload {
  formId: string;
  submissionId: string;
  version: number;
  submitterEmail: string | null;
  submitterName: string | null;
}

/**
 * FormSubmitted -> queue notification messages to the form's configured addresses.
 * Delivery happens via the Message log (BLUEPRINT §19) -- deliver-message picks these up
 * on a later drain pass -- so every notification is recorded, observable, retryable.
 */
const notifyFormSubmission = {
  name: "notify-form-submission",
  async run(event: ClaimedEvent) {
    const payload = event.payload as FormSubmittedPayload;
    const form = await formService.getForm(event.organizationId, payload.formId);
    if (!form || form.notificationEmails.length === 0) return;

    const from = payload.submitterName || payload.submitterEmail || "Someone";
    for (const to of form.notificationEmails) {
      await messageService.queueMessage({
        organizationId: event.organizationId,
        toEmail: to,
        subject: `New submission: ${form.title}`,
        body: `${from} submitted "${form.title}".\n\nView it in the dashboard under Forms → ${form.title} → Submissions.`,
        source: "form_notification",
      });
    }
  },
};

/**
 * MessageQueued -> perform the actual provider send and record the outcome on the
 * Message row. A provider error rethrows so the outbox retries with backoff; on the
 * FINAL attempt the message is marked FAILED first, so a dead-lettered event never
 * strands a message in QUEUED (it becomes resendable instead).
 */
const deliverMessage = {
  name: "deliver-message",
  async run(event: ClaimedEvent) {
    const { messageId } = event.payload as { messageId: string };
    const message = await messageService.getQueuedMessage(event.organizationId, messageId);
    if (!message) return; // already handled (idempotency) or cancelled

    try {
      // Blast messages render their markdown to email HTML and carry attachments
      // (bytes fetched from private storage per send). Missing bytes throw, so the
      // outbox retries and, at worst, the message dead-letters as FAILED — never a
      // silent half-send.
      let html: string | undefined;
      let attachments: EmailAttachmentInput[] | undefined;
      if (message.blast) {
        html = renderEmailHtml(message.blast.bodyMarkdown, { organizationName: message.organization.name });
        if (message.blast.attachments.length > 0) {
          const storage = getPrivateStorageProvider();
          attachments = await Promise.all(
            message.blast.attachments.map(async (a) => {
              const content = await storage.get(a.storageKey);
              if (!content) throw new Error(`Attachment bytes missing from storage: ${a.fileName}`);
              return { filename: a.fileName, content, contentType: a.contentType };
            }),
          );
        }
      }
      await getEmailProvider().sendEmail({ to: message.toEmail, subject: message.subject, text: message.body, html, attachments });
      await messageService.markSent(event.organizationId, messageId);
    } catch (err) {
      const isFinalAttempt = event.attempts + 1 >= event.maxAttempts;
      if (isFinalAttempt) {
        await messageService.markFailed(
          event.organizationId,
          messageId,
          err instanceof Error ? err.message : String(err),
        );
      }
      throw err;
    }
  },
};

export const HANDLERS: HandlerRegistry = {
  FormSubmitted: [notifyFormSubmission, workflowTriggerHandler, webhookDispatchHandler],
  PersonCreated: [workflowTriggerHandler, webhookDispatchHandler],
  EventRegistered: [workflowTriggerHandler, webhookDispatchHandler],
  MessageQueued: [deliverMessage],
};

/**
 * Drain due outbox events using the app's handler registry. Runs a few passes because
 * handlers themselves enqueue follow-on events (a form submission queues Messages that a
 * later pass delivers) -- stops as soon as a pass does no work.
 */
export async function drainOutbox(opts?: { batchSize?: number }) {
  let processed = 0;
  let failed = 0;
  let retried = 0;
  for (let i = 0; i < 3; i++) {
    const result = await outboxService.drain(HANDLERS, opts);
    processed += result.processed;
    failed += result.failed;
    retried += result.retried;
    if (result.processed + result.failed + result.retried === 0) break;
  }
  return { processed, failed, retried };
}
