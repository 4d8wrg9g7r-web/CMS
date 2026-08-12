import { Code2, Lock, Pause, Play, RotateCcw, Trash2, Webhook } from "lucide-react";
import { developerService } from "@cms/database";
import { ApiKeyCreator } from "../../../components/ApiKeyCreator";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { canDeveloper } from "../../../lib/developer-access";
import { getCurrentOrganization } from "../../../lib/session";
import {
  createApiKeyAction,
  createSubscriptionAction,
  deleteSubscriptionAction,
  replayDeliveryAction,
  revokeApiKeyAction,
  setSubscriptionActiveAction,
} from "./actions";

const EVENT_TYPES = ["FormSubmitted", "PersonCreated", "EventRegistered"] as const;

export default async function DevelopersPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const allowed = await canDeveloper(organization.id, "api.manage");
  if (!allowed) {
    return (
      <div>
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Developers</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to the developer platform"
            description="API keys and webhooks are restricted to organization owners and admins."
          />
        </Card>
      </div>
    );
  }

  const [keys, subscriptions] = await Promise.all([
    developerService.listApiKeys(organization.id),
    developerService.listSubscriptions(organization.id),
  ]);
  const deliveriesBySub = new Map(
    await Promise.all(
      subscriptions.map(async (s) => [s.id, await developerService.listDeliveries(organization.id, s.id, 5)] as const),
    ),
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Developers</h1>
        <p className="text-sm text-ink-secondary">
          Server API keys and signed webhooks — the same services and permissions as the dashboard, never a bypass.
        </p>
      </div>

      {/* API keys */}
      <Card padding="md" className="mb-6">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Code2 size={15} /> API keys
        </h2>
        <p className="mb-4 text-xs text-ink-muted">
          Use <code className="rounded bg-surface-muted px-1">Authorization: Bearer cms_…</code> against{" "}
          <code className="rounded bg-surface-muted px-1">/api/v1/people</code>,{" "}
          <code className="rounded bg-surface-muted px-1">/api/v1/events</code>,{" "}
          <code className="rounded bg-surface-muted px-1">/api/v1/groups</code>. Keys are org-wide server credentials.
        </p>
        <ApiKeyCreator action={createApiKeyAction} />
        {keys.length > 0 && (
          <ul className="mt-4 divide-y divide-border">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-ink">{key.name}</span>
                  <span className="ml-2 font-mono text-xs text-ink-muted">{key.keyPrefix}</span>
                  <span className="block text-xs text-ink-muted">
                    {key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}` : "Never used"}
                  </span>
                </div>
                {key.revokedAt ? (
                  <Badge variant="warning">Revoked</Badge>
                ) : (
                  <form action={revokeApiKeyAction.bind(null, key.id)}>
                    <button type="submit" className={buttonClasses("danger", "sm")}>
                      Revoke
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Webhooks */}
      <Card padding="md">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Webhook size={15} /> Webhooks
        </h2>
        <p className="mb-4 text-xs text-ink-muted">
          Deliveries are signed: <code className="rounded bg-surface-muted px-1">X-CMS-Signature: t=…,v1=HMAC-SHA256(&quot;t.body&quot;)</code>{" "}
          with your subscription secret. Reject stale timestamps. Failures retry automatically; anything can be replayed.
        </p>

        <form action={createSubscriptionAction} className="mb-5 flex flex-wrap items-end gap-3 border-b border-border pb-5">
          <label className="text-sm text-ink-secondary">
            Endpoint URL
            <Input name="url" type="url" required placeholder="https://example.org/hooks/cms" className="mt-1 w-80" />
          </label>
          <fieldset className="flex items-center gap-3 text-sm text-ink-secondary">
            {EVENT_TYPES.map((eventType) => (
              <label key={eventType} className="flex items-center gap-1.5">
                <input type="checkbox" name={`event_${eventType}`} defaultChecked className="h-4 w-4 rounded border-border-strong text-accent" />
                {eventType}
              </label>
            ))}
          </fieldset>
          <button type="submit" className={buttonClasses("primary", "sm")}>
            Add endpoint
          </button>
        </form>

        {subscriptions.length === 0 ? (
          <p className="text-sm text-ink-muted">No webhook endpoints yet.</p>
        ) : (
          <ul className="space-y-5">
            {subscriptions.map((subscription) => {
              const deliveries = deliveriesBySub.get(subscription.id) ?? [];
              return (
                <li key={subscription.id} className="rounded-md border border-border p-4">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all text-sm font-medium text-ink">{subscription.url}</span>
                    <div className="flex items-center gap-2">
                      {subscription.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="warning">Paused</Badge>}
                      <form action={setSubscriptionActiveAction.bind(null, subscription.id, !subscription.isActive)}>
                        <button type="submit" className={buttonClasses("ghost", "sm")} title={subscription.isActive ? "Pause" : "Resume"}>
                          {subscription.isActive ? <Pause size={13} /> : <Play size={13} />}
                        </button>
                      </form>
                      <form action={deleteSubscriptionAction.bind(null, subscription.id)}>
                        <button type="submit" className={buttonClasses("ghost", "sm")} title="Delete endpoint">
                          <Trash2 size={13} />
                        </button>
                      </form>
                    </div>
                  </div>
                  <p className="mb-1 text-xs text-ink-muted">Events: {subscription.events.join(", ")}</p>
                  <details className="mb-2 text-xs text-ink-muted">
                    <summary className="cursor-pointer">Signing secret</summary>
                    <code className="mt-1 block break-all rounded bg-surface-muted px-2 py-1 text-ink">{subscription.secret}</code>
                  </details>
                  {deliveries.length > 0 && (
                    <ul className="divide-y divide-border/60 border-t border-border pt-1">
                      {deliveries.map((delivery) => (
                        <li key={delivery.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
                          <span className="text-ink-secondary">
                            {delivery.eventType} · {new Date(delivery.createdAt).toLocaleString()}
                            {delivery.responseStatus != null && ` · HTTP ${delivery.responseStatus}`}
                            {delivery.lastError && <span className="text-danger"> · {delivery.lastError}</span>}
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge
                              variant={
                                delivery.status === "DELIVERED" ? "success" : delivery.status === "FAILED" ? "danger" : "neutral"
                              }
                            >
                              {delivery.status.toLowerCase()}
                            </Badge>
                            {delivery.status !== "PENDING" && (
                              <form action={replayDeliveryAction.bind(null, delivery.id)}>
                                <button type="submit" className={buttonClasses("ghost", "sm")} title="Replay delivery">
                                  <RotateCcw size={12} />
                                </button>
                              </form>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
