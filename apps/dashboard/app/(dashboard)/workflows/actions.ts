"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditService, workflowService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireWorkflows } from "../../../lib/workflows-access";

/**
 * Workflow staff server actions. Authorization enforced server-side via requireWorkflows
 * (BLUEPRINT §34); every mutation records an audit event (§47).
 */

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

async function audit(organizationId: string, action: string, targetId: string, metadata?: Record<string, unknown>) {
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId,
    actorUserId: actor?.id,
    action,
    targetType: "WorkflowDefinition",
    targetId,
    metadata,
  });
}

export async function createWorkflowAction(formData: FormData) {
  const organization = await requireOrg();
  await requireWorkflows(organization.id, "workflow.manage");

  const name = str(formData, "name");
  if (!name) throw new Error("Workflow name is required.");
  const trigger = str(formData, "trigger") || "FormSubmitted";
  const triggerFormId = str(formData, "triggerFormId") || null;

  const workflow = await workflowService.createWorkflow(organization.id, {
    name,
    description: str(formData, "description") || null,
    trigger,
    triggerFormId: trigger === "FormSubmitted" ? triggerFormId : null,
  });
  await audit(organization.id, "workflow.created", workflow.id, { name, trigger });
  redirect(`/workflows/${workflow.id}`);
}

export async function updateWorkflowSettingsAction(workflowId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireWorkflows(organization.id, "workflow.manage");

  const name = str(formData, "name");
  if (!name) throw new Error("Workflow name is required.");
  const trigger = str(formData, "trigger") || "FormSubmitted";

  const updated = await workflowService.updateWorkflowSettings(organization.id, workflowId, {
    name,
    description: str(formData, "description") || null,
    trigger,
    triggerFormId: trigger === "FormSubmitted" ? str(formData, "triggerFormId") || null : null,
  });
  if (!updated) throw new Error("Workflow not found.");
  await audit(organization.id, "workflow.updated", workflowId);
  revalidatePath(`/workflows/${workflowId}`);
}

export async function saveWorkflowConfigAction(workflowId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireWorkflows(organization.id, "workflow.manage");

  let raw: unknown = {};
  try {
    raw = JSON.parse(str(formData, "config") || "{}");
  } catch {
    throw new Error("Could not read the workflow configuration.");
  }
  const saved = await workflowService.saveDraftConfig(organization.id, workflowId, raw);
  if (saved === null) throw new Error("Workflow not found.");
  await audit(organization.id, "workflow.updated", workflowId, { stepCount: saved.steps.length });
  revalidatePath(`/workflows/${workflowId}`);
}

export async function publishWorkflowAction(workflowId: string) {
  const organization = await requireOrg();
  await requireWorkflows(organization.id, "workflow.manage");
  const version = await workflowService.publishWorkflow(organization.id, workflowId);
  await audit(organization.id, "workflow.published", workflowId, { version });
  revalidatePath(`/workflows/${workflowId}`);
}

export async function pauseWorkflowAction(workflowId: string) {
  const organization = await requireOrg();
  await requireWorkflows(organization.id, "workflow.manage");
  await workflowService.setWorkflowStatus(organization.id, workflowId, "PAUSED");
  await audit(organization.id, "workflow.paused", workflowId);
  revalidatePath(`/workflows/${workflowId}`);
}

export async function resumeWorkflowAction(workflowId: string) {
  const organization = await requireOrg();
  await requireWorkflows(organization.id, "workflow.manage");
  await workflowService.setWorkflowStatus(organization.id, workflowId, "PUBLISHED");
  await audit(organization.id, "workflow.resumed", workflowId);
  revalidatePath(`/workflows/${workflowId}`);
}

export async function archiveWorkflowAction(workflowId: string) {
  const organization = await requireOrg();
  await requireWorkflows(organization.id, "workflow.manage");
  await workflowService.archiveWorkflow(organization.id, workflowId);
  await audit(organization.id, "workflow.archived", workflowId);
  revalidatePath(`/workflows/${workflowId}`);
  revalidatePath("/workflows");
}

export async function restoreWorkflowAction(workflowId: string) {
  const organization = await requireOrg();
  await requireWorkflows(organization.id, "workflow.manage");
  await workflowService.restoreWorkflow(organization.id, workflowId);
  await audit(organization.id, "workflow.restored", workflowId);
  revalidatePath(`/workflows/${workflowId}`);
  revalidatePath("/workflows");
}

export async function cancelRunAction(workflowId: string, runId: string) {
  const organization = await requireOrg();
  await requireWorkflows(organization.id, "workflow.manage");
  await workflowService.cancelRun(organization.id, runId);
  await audit(organization.id, "workflow.run_cancelled", workflowId, { runId });
  revalidatePath(`/workflows/${workflowId}`);
  revalidatePath(`/workflows/${workflowId}/runs/${runId}`);
}

export async function retryRunAction(workflowId: string, runId: string) {
  const organization = await requireOrg();
  await requireWorkflows(organization.id, "workflow.manage");
  await workflowService.retryRun(organization.id, runId);
  await audit(organization.id, "workflow.run_retried", workflowId, { runId });
  revalidatePath(`/workflows/${workflowId}`);
  revalidatePath(`/workflows/${workflowId}/runs/${runId}`);
}
