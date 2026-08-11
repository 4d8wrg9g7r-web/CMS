import Link from "next/link";
import { ArrowLeft, Globe, Lock } from "lucide-react";
import { appService, givingService, onlineGivingService } from "@cms/database";
import { OnlineGivingSettings } from "../../../../components/OnlineGivingSettings";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { canGiving } from "../../../../lib/giving-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { setFundOnlineAction } from "../actions";

/**
 * Online giving setup (docs/domain/giving.md "Online giving", ADR-015): the
 * church connects its own Stripe account, points a webhook at us, and picks
 * which funds appear in the app. Gifts recorded by the webhook land in the
 * same Contribution ledger as Sunday's count — method "Online".
 */
export default async function OnlineGivingPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canGiving(organization.id, "giving.manage_funds"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to giving settings" description="" />
      </Card>
    );
  }

  const [config, funds, app] = await Promise.all([
    onlineGivingService.getMaskedConfig(organization.id),
    givingService.listFunds(organization.id),
    appService.getChurchApp(organization.id),
  ]);
  const live = config.enabled && config.hasSecretKey && config.hasWebhookSecret;
  const onlineFundCount = funds.filter((f) => f.onlineEnabled).length;

  return (
    <div>
      <Link href="/giving" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Giving
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Online giving</h1>
        {live && onlineFundCount > 0 ? <Badge variant="success">Live in the app</Badge> : <Badge>Not live yet</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card padding="md">
            <h2 className="mb-1 text-sm font-semibold text-ink">Your Stripe account</h2>
            <p className="mb-4 text-xs text-ink-muted">
              Gifts go straight to your church&apos;s own Stripe account — we never hold your money. Create an
              account at stripe.com, then paste your secret key (Developers → API keys) here.
            </p>
            <OnlineGivingSettings config={config} />
          </Card>

          <Card padding="md">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
              <Globe size={14} /> Webhook
            </h2>
            {app ? (
              <>
                <p className="mb-2 text-xs text-ink-muted">
                  In Stripe (Developers → Webhooks) add an endpoint with events
                  <code className="mx-1 rounded bg-surface-muted px-1">checkout.session.completed</code> and
                  <code className="mx-1 rounded bg-surface-muted px-1">invoice.paid</code> pointing at:
                </p>
                <code className="block break-all rounded-md bg-surface-muted p-2 text-xs text-ink">
                  {`https://<your-dashboard-domain>/api/giving/stripe/${app.publicAppId}`}
                </code>
                <p className="mt-2 text-xs text-ink-muted">
                  Then paste the endpoint&apos;s signing secret (whsec_…) into the form above. Gifts appear in your
                  ledger automatically — matched to people by their receipt email.
                </p>
              </>
            ) : (
              <p className="text-xs text-ink-muted">
                Online giving runs inside your church app — set one up in App Studio first.
              </p>
            )}
          </Card>
        </div>

        <Card padding="md" data-section="online-funds">
          <h2 className="mb-1 text-sm font-semibold text-ink">Funds in the app</h2>
          <p className="mb-4 text-xs text-ink-muted">
            Pick which funds members can give to. The first one is the default.
          </p>
          {funds.length === 0 ? (
            <p className="text-sm text-ink-muted">Create a fund on the Funds page first.</p>
          ) : (
            <ul className="divide-y divide-border">
              {funds.map((fund) => (
                <li key={fund.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {fund.name}
                      {fund.archivedAt && <span className="ml-2 text-xs text-ink-muted">(archived)</span>}
                    </p>
                    {fund.description && <p className="text-xs text-ink-muted">{fund.description}</p>}
                  </div>
                  <form action={setFundOnlineAction.bind(null, fund.id, !fund.onlineEnabled)}>
                    <button
                      type="submit"
                      disabled={Boolean(fund.archivedAt)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        fund.onlineEnabled
                          ? "bg-success/10 text-success"
                          : "bg-surface-muted text-ink-muted hover:text-ink"
                      }`}
                    >
                      {fund.onlineEnabled ? "In the app" : "Not shown"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
