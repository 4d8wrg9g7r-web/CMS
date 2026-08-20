import Link from "next/link";
import { ArrowLeft, Monitor, Printer, Smartphone } from "lucide-react";
import { Card } from "../../../../components/ui/Card";
import { CopyUrlButton } from "../../../../components/CopyUrlButton";
import { requireCheckin } from "../../../../lib/checkin-access";
import { getCurrentOrganization } from "../../../../lib/session";

/**
 * Printer & device setup for check-in kiosks (UX audit #14): the CLI flags
 * moved out of the kiosk card's product copy into an actual guide with
 * copyable commands and per-platform steps.
 */
export default async function KioskSetupPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireCheckin(organization.id, "checkin.view");

  const winCommand = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk --kiosk-printing "https://YOUR-KIOSK-LINK?autoprint=1"`;
  const macCommand = `open -a "Google Chrome" --args --kiosk --kiosk-printing "https://YOUR-KIOSK-LINK?autoprint=1"`;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/attendance" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Check-ins and Attendance
      </Link>
      <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Kiosk printer &amp; device setup</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        One-time setup for a check-in station that prints name tags and guardian receipts silently.
      </p>

      <Card padding="md" className="mb-5">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Monitor size={15} /> 1. Pick the device
        </h2>
        <p className="text-sm text-ink-secondary">
          Use a small Windows or Mac machine (a mini PC or Chromebox works well) wired to the label printer. iPads
          can run the kiosk screen, but Safari can&rsquo;t print silently — every check-in would pop a print dialog —
          so pair an iPad with a computer-connected printer or use the computer as the kiosk.
        </p>
      </Card>

      <Card padding="md" className="mb-5">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Printer size={15} /> 2. Set up the printer
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-secondary">
          <li>
            Install the printer&rsquo;s driver — for Brother QL label printers, the &ldquo;QL series&rdquo; driver from
            Brother&rsquo;s support site.
          </li>
          <li>Set it as the device&rsquo;s default printer.</li>
          <li>
            In the driver&rsquo;s preferences, choose the 62&nbsp;mm continuous tape and set the page size to
            62&nbsp;×&nbsp;100&nbsp;mm — the tags and receipt are laid out for that size.
          </li>
          <li>Print a test page from any app to confirm labels feed correctly.</li>
        </ul>
      </Card>

      <Card padding="md" className="mb-5">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Smartphone size={15} /> 3. Launch the kiosk
        </h2>
        <p className="mb-3 text-sm text-ink-secondary">
          Copy your kiosk&rsquo;s link from the Check-in kiosks card, add{" "}
          <code className="rounded bg-surface-muted px-1">?autoprint=1</code> to the end, and launch Chrome in kiosk
          mode with silent printing. Replace <code className="rounded bg-surface-muted px-1">YOUR-KIOSK-LINK</code>{" "}
          in the command:
        </p>
        <div className="space-y-3 text-sm">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Windows (Run dialog or a shortcut)</p>
            <div className="flex items-start gap-2">
              <code className="block min-w-0 flex-1 overflow-x-auto rounded-md bg-surface-muted p-2.5 text-xs">{winCommand}</code>
              <CopyUrlButton url={winCommand} />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Mac (Terminal)</p>
            <div className="flex items-start gap-2">
              <code className="block min-w-0 flex-1 overflow-x-auto rounded-md bg-surface-muted p-2.5 text-xs">{macCommand}</code>
              <CopyUrlButton url={macCommand} />
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-secondary">
          <span className="font-medium text-ink">What the pieces do:</span>{" "}
          <code className="rounded bg-surface-muted px-1">--kiosk</code> makes Chrome full-screen with no browser
          chrome; <code className="rounded bg-surface-muted px-1">--kiosk-printing</code> sends every print job
          straight to the default printer with no dialog;{" "}
          <code className="rounded bg-surface-muted px-1">?autoprint=1</code> tells the check-in screen to print
          labels automatically after each check-in. Without it, volunteers get a &ldquo;Print labels&rdquo; button
          instead — nothing prints by surprise.
        </p>
      </Card>

      <Card padding="md">
        <h2 className="mb-2 text-sm font-semibold text-ink">Good to know</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-secondary">
          <li>Disabling a kiosk (on the Check-ins page) turns its link off instantly — no need to touch the device.</li>
          <li>The pickup code on the guardian receipt is required at checkout; reprint labels any time with the Print button on the confirmation screen.</li>
          <li>Exit Chrome&rsquo;s kiosk mode with Alt+F4 (Windows) or ⌘Q (Mac).</li>
        </ul>
      </Card>
    </div>
  );
}
