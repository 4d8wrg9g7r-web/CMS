import {
  CalendarDays,
  Inbox as InboxIcon,
  Contact,
  Folder,
  HandCoins,
  House,
  LifeBuoy,
  MonitorSmartphone,
  Send,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Users2,
} from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "../../components/DashboardShell";
import { SidebarNavGroup } from "../../components/ui/SidebarNavGroup";
import { SidebarNavItem } from "../../components/ui/SidebarNavItem";
import { ToastProvider } from "../../components/ui/Toast";
import { signOut } from "../../auth";
import { inboxService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../lib/session";

/** Every page behind this layout is authenticated-only content -- never meant to be indexed, regardless of what robots.txt already disallows (defense in depth: a disallowed URL can still get indexed by title alone if linked externally). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/**
 * Navigation is organized around the staff mental model, not the database
 * (docs/design-system.md "Navigation"): eight primary destinations, with the
 * long tail grouped under Communicate / Content / Digital / More. Everything
 * is still one keystroke away via the ⌘K palette — grouping hides
 * architecture, never capability.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/onboarding");

  const user = await getCurrentUser();
  // Sidebar badge: undismissed action-required inbox items (cheap bounded queries).
  const inboxCount = await inboxService.countActionRequired(organization.id).catch(() => 0);

  const sidebar = (
    <>
      <div className="px-3 pb-2 pt-4">
        {/* Non-interactive by design -- one organization per account (see
            OrganizationMember.userId's @unique constraint), so there's nothing to
            switch to. This is a label, not a control. */}
        <div className="flex w-full items-center gap-2.5 rounded-md px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-warm text-xs font-bold text-accent">
            {initials(organization.name)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{organization.name}</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pt-1" aria-label="Main">
        <SidebarNavItem href="/dashboard" label="Home" icon={<House size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/inbox" label="Inbox" icon={<InboxIcon size={17} strokeWidth={1.75} />} badge={inboxCount} />
        <SidebarNavItem href="/people" label="People" icon={<Contact size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/groups" label="Groups" icon={<Users2 size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/events" label="Events" icon={<CalendarDays size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/giving" label="Giving" icon={<HandCoins size={17} strokeWidth={1.75} />} />

        <SidebarNavGroup
          label="Communicate"
          icon={<Send size={17} strokeWidth={1.75} />}
          childHrefs={["/communicate", "/messages", "/forms", "/workflows", "/journeys", "/tasks"]}
        >
          <SidebarNavItem nested href="/communicate" label="Overview" icon={null} />
          <SidebarNavItem nested href="/messages" label="Messages" icon={null} />
          <SidebarNavItem nested href="/forms" label="Forms" icon={null} />
          <SidebarNavItem nested href="/workflows" label="Automations" icon={null} />
          <SidebarNavItem nested href="/journeys" label="Journeys" icon={null} />
          <SidebarNavItem nested href="/tasks" label="Tasks" icon={null} />
        </SidebarNavGroup>

        <SidebarNavGroup
          label="Content"
          icon={<Folder size={17} strokeWidth={1.75} />}
          childHrefs={["/sermons", "/community"]}
        >
          <SidebarNavItem nested href="/sermons" label="Sermons" icon={null} />
          <SidebarNavItem nested href="/community" label="Community" icon={null} />
        </SidebarNavGroup>

        <SidebarNavGroup
          label="Digital"
          icon={<MonitorSmartphone size={17} strokeWidth={1.75} />}
          childHrefs={["/app-studio", "/website"]}
        >
          <SidebarNavItem nested href="/app-studio" label="Church App" icon={null} />
          {/* The builder is a full-page workspace — it opens in its own tab
              (Wix-style). Site settings stay at /website, reachable from the
              builder's top bar. */}
          <SidebarNavItem nested newTab href="/studio/website" label="Website" icon={null} />
        </SidebarNavGroup>

        <SidebarNavGroup
          label="More"
          icon={<SlidersHorizontal size={17} strokeWidth={1.75} />}
          childHrefs={["/reports", "/attendance", "/serving", "/team", "/audit-log", "/developers"]}
        >
          <SidebarNavItem nested href="/reports" label="Reports" icon={null} />
          <SidebarNavItem nested href="/attendance" label="Attendance" icon={null} />
          <SidebarNavItem nested href="/serving" label="Serving" icon={null} />
          <SidebarNavItem nested href="/team" label="Team" icon={null} />
          <SidebarNavItem nested href="/audit-log" label="Audit Log" icon={null} />
          <SidebarNavItem nested href="/developers" label="Developers" icon={null} />
        </SidebarNavGroup>
      </nav>

      <div className="flex flex-col gap-0.5 px-3 pb-3 pt-2">
        <SidebarNavItem href="/settings" label="Settings" icon={<SettingsIcon size={17} strokeWidth={1.75} />} />
        <div className="mt-2 flex items-center gap-2.5 border-t border-black/[0.06] px-2 pt-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-xs font-semibold text-ink-secondary">
            {initials(user?.name || user?.email || "?")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink">{user?.name || "Account"}</div>
            <div className="truncate text-xs text-ink-muted">{user?.email}</div>
          </div>
        </div>
        <div className="flex items-center justify-between px-2 pb-1 pt-1.5 text-xs">
          <span className="flex cursor-default items-center gap-1 text-ink-muted" title="Support isn't available yet">
            <LifeBuoy size={12} /> Help
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-sm text-ink-muted hover:text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <ToastProvider>
      <DashboardShell sidebar={sidebar}>{children}</DashboardShell>
    </ToastProvider>
  );
}
