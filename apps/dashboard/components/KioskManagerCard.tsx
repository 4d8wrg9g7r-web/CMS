import Link from "next/link";
import { MonitorCheck, Plus } from "lucide-react";
import { Card } from "./ui/Card";
import { Input, Select } from "./ui/Input";
import { buttonClasses } from "./ui/Button";
import { ActionForm, FieldError } from "./ui/ActionForm";
import { ConfirmSubmitButton } from "./ui/ConfirmDialog";
import { OverflowMenu } from "./ui/OverflowMenu";
import { menuItemClasses } from "./ui/menu-classes";
import { SubmitButton } from "./ui/SubmitButton";
import { createKioskAction, deleteKioskAction, setKioskEnabledAction } from "../app/(dashboard)/attendance/actions";

/**
 * Kids check-in kiosks (docs/domain/app.md "Check-in"): each kiosk is pinned
 * to a calendar; the device opened to its link shows that calendar's events
 * for today automatically. Print setup: Chrome with --kiosk --kiosk-printing
 * and the Brother QL driver installed prints tags silently.
 */
export function KioskManagerCard({
  kiosks,
  calendars,
  canManage,
}: {
  kiosks: { id: string; name: string; enabled: boolean; publicKioskKey: string; calendarName: string | null }[];
  calendars: { id: string; name: string }[];
  canManage: boolean;
}) {
  return (
    <Card padding="md" data-section="kiosks">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <MonitorCheck size={15} /> Check-in kiosks
      </h2>
      <p className="mb-4 text-xs text-ink-muted">
        Pin a kiosk to a calendar and open its link on the check-in device — today&rsquo;s events appear
        automatically. Works with silent label printing on a Brother QL printer — see the{" "}
        <Link href="/attendance/kiosk-setup" className="text-accent hover:underline" data-action="kiosk-setup-guide">
          printer &amp; device setup guide
        </Link>
        .
      </p>

      {kiosks.length > 0 && (
        <ul className="mb-4 divide-y divide-border/60">
          {kiosks.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 py-2.5" data-kiosk={k.id}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {k.name}
                  {!k.enabled && <span className="ml-2 text-xs text-warning">disabled</span>}
                </p>
                <p className="text-xs text-ink-muted">{k.calendarName ?? "All calendars"}</p>
              </div>
              <a href={`/k/${k.publicKioskKey}`} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm")} data-action="open-kiosk">
                Open kiosk
              </a>
              {canManage && (
                <OverflowMenu label={`Actions for ${k.name}`}>
                  <ActionForm action={setKioskEnabledAction.bind(null, k.id, !k.enabled)}>
                    <button type="submit" role="menuitem" className={menuItemClasses()} data-action="toggle-kiosk">
                      {k.enabled ? "Disable kiosk" : "Enable kiosk"}
                    </button>
                  </ActionForm>
                  <ActionForm action={deleteKioskAction.bind(null, k.id)}>
                    <ConfirmSubmitButton
                      title={`Delete "${k.name}"?`}
                      message="Its link stops working immediately — any device opened to it goes dark on the spot. If you just need it off for a while, Disable is reversible."
                      confirmLabel="Delete kiosk"
                      aria-label={`Delete ${k.name}`}
                      className={menuItemClasses("danger")}
                      data-action="delete-kiosk"
                    >
                      Delete kiosk…
                    </ConfirmSubmitButton>
                  </ActionForm>
                </OverflowMenu>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <ActionForm action={createKioskAction} resetOnSuccess className="flex flex-wrap items-start gap-2" data-section="kiosk-create">
          <span className="flex flex-col">
            <Input name="name" placeholder="Kids Wing Kiosk" className="w-48 text-sm" data-kiosk-name />
            <FieldError name="name" />
          </span>
          <Select name="calendarId" className="w-44 text-sm" aria-label="Calendar" data-kiosk-calendar>
            <option value="">All calendars</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <SubmitButton size="sm" pendingLabel="Adding…" data-action="create-kiosk">
            <Plus size={14} /> Add kiosk
          </SubmitButton>
        </ActionForm>
      )}
    </Card>
  );
}
