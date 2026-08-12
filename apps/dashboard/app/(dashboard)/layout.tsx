import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Code2,
  Contact,
  Church,
  HandCoins,
  HeartHandshake,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Map,
  MessagesSquare,
  PieChart,
  Clapperboard,
  Globe,
  ScrollText,
  Smartphone,
  Settings as SettingsIcon,
  Users,
  Users2,
  Workflow,
} from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "../../components/DashboardShell";
import { SidebarNavItem } from "../../components/ui/SidebarNavItem";
import { ToastProvider } from "../../components/ui/Toast";
import { signOut } from "../../auth";
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

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const organization = await getCurrentOrganization();
  if (!organization) redirect("/onboarding");

  const user = await getCurrentUser();

  const sidebar = (
    <>
      <div className="flex items-center gap-2 px-5 pb-5 pt-6">
        <Church size={20} strokeWidth={1.75} className="text-accent-light" />
        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-white">CMS</span>
      </div>

      <div className="px-3 pb-4">
        {/* Non-interactive by design -- one organization per account (see
            OrganizationMember.userId's @unique constraint), so there's nothing to
            switch to. This is a label, not a control. */}
        <div className="flex w-full items-center gap-2.5 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent/25 text-xs font-semibold text-accent-light">
            {initials(organization.name)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{organization.name}</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        <SidebarNavItem href="/dashboard" label="Overview" icon={<LayoutDashboard size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/people" label="People" icon={<Contact size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/groups" label="Groups" icon={<Users2 size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/journeys" label="Journeys" icon={<Map size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/events" label="Events" icon={<CalendarDays size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/attendance" label="Attendance" icon={<BarChart3 size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/reports" label="Reports" icon={<PieChart size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/giving" label="Giving" icon={<HandCoins size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/serving" label="Serving" icon={<HeartHandshake size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/forms" label="Forms" icon={<ClipboardList size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/workflows" label="Workflows" icon={<Workflow size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/tasks" label="Tasks" icon={<CheckSquare size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/messages" label="Messages" icon={<Mail size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/sermons" label="Sermons" icon={<Clapperboard size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/app-studio" label="App Studio" icon={<Smartphone size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/website" label="Website" icon={<Globe size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/community" label="Community" icon={<MessagesSquare size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/team" label="Team" icon={<Users size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/audit-log" label="Audit Log" icon={<ScrollText size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/developers" label="Developers" icon={<Code2 size={17} strokeWidth={1.75} />} />
        <SidebarNavItem href="/settings" label="Settings" icon={<SettingsIcon size={17} strokeWidth={1.75} />} />
      </nav>

      <div className="flex flex-col gap-3 px-3 pb-4">
        <div className="flex items-center gap-2.5 border-t border-white/[0.06] pt-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
            {initials(user?.name || user?.email || "?")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user?.name || "Account"}</div>
            <div className="truncate text-[11px] text-white/40">{user?.email}</div>
          </div>
        </div>
        <div className="flex items-center justify-between px-0.5 text-[11px]">
          <span className="flex cursor-default items-center gap-1 text-white/40" title="Support isn't available yet">
            <LifeBuoy size={12} /> Help & Support
          </span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-sm text-white/40 hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
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
