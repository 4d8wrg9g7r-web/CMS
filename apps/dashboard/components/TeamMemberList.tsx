"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Select } from "./ui/Input";
import { timeAgo } from "../lib/format";

export interface TeamMemberRow {
  userId: string;
  name: string | null;
  email: string;
  role: "OWNER" | "ADMIN" | "CONTENT_MANAGER" | "ANALYTICS_VIEWER";
  joinedAt: Date;
}

const ROLE_LABELS: Record<TeamMemberRow["role"], string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  CONTENT_MANAGER: "Content Manager",
  ANALYTICS_VIEWER: "Analytics Viewer",
};

interface TeamMemberListProps {
  members: TeamMemberRow[];
  currentUserId: string;
  /** Whether the signed-in user can change roles / remove members (OWNER or ADMIN). */
  canManage: boolean;
  onUpdateRole: (userId: string, role: TeamMemberRow["role"]) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}

export function TeamMemberList({ members, currentUserId, canManage, onUpdateRole, onRemove }: TeamMemberListProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <ul className="flex flex-col divide-y divide-border">
      {members.map((member) => {
        const isSelf = member.userId === currentUserId;
        return (
          <li key={member.userId} className="flex items-center justify-between gap-4 py-3.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-ink">
                {member.name || member.email}
                {isSelf && <span className="ml-1.5 text-xs font-normal text-ink-muted">(you)</span>}
              </div>
              <div className="truncate text-xs text-ink-muted">
                {member.email} &middot; Joined {timeAgo(member.joinedAt)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canManage && !isSelf ? (
                <Select
                  aria-label={`Role for ${member.email}`}
                  defaultValue={member.role}
                  disabled={isPending}
                  onChange={(e) => {
                    const role = e.currentTarget.value as TeamMemberRow["role"];
                    startTransition(async () => onUpdateRole(member.userId, role));
                  }}
                  className="w-auto py-1.5 text-xs"
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="text-xs font-medium text-ink-secondary">{ROLE_LABELS[member.role]}</span>
              )}
              {canManage && !isSelf && (
                <button
                  type="button"
                  disabled={isPending}
                  aria-label={`Remove ${member.email}`}
                  onClick={() => {
                    if (!window.confirm(`Remove ${member.email} from this organization?`)) return;
                    startTransition(async () => onRemove(member.userId));
                  }}
                  className="rounded-sm p-1.5 text-ink-muted transition-colors duration-180 hover:bg-danger-bg hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
