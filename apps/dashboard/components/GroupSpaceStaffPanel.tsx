import Link from "next/link";
import {
  CalendarPlus,
  ClipboardCheck,
  ExternalLink,
  EyeOff,
  Link as LinkIcon,
  Mail,
  RotateCcw,
  Send,
  Trash2,
  Vote,
} from "lucide-react";
import type { GroupSpace } from "@cms/database";
import {
  archiveGroupEventStaffAction,
  closeGroupPollStaffAction,
  createGroupEventStaffAction,
  createGroupPollStaffAction,
  markGroupAttendanceStaffAction,
  moderateGroupPostAction,
  postToGroupAsChurchAction,
} from "../app/(dashboard)/groups/actions";
import { Badge } from "./ui/Badge";
import { buttonClasses } from "./ui/Button";
import { Card } from "./ui/Card";
import { Input, Textarea } from "./ui/Input";

/**
 * Staff view of the group space (docs/domain/groups.md): the same stream /
 * events / polls payload members see in the app, plus moderation, attendance,
 * and posting as the church. Server-rendered; every mutation is a plain form
 * bound to an audited group.manage action.
 */

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function postedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function GroupSpaceStaffPanel({
  space,
  churchName,
  canManage,
}: {
  space: GroupSpace;
  churchName: string;
  canManage: boolean;
}) {
  const groupId = space.group.id;

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Group space</h2>
          <p className="text-sm text-ink-secondary">
            What this group sees in the church app — chat, prayer, events, and polls.
          </p>
        </div>
        {canManage && (
          <Link
            href={`/messages/new?audienceKind=group&groupId=${groupId}`}
            className={buttonClasses("secondary", "sm")}
          >
            <Mail size={14} /> Email the group
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Activity stream + moderation */}
        <Card padding="md" data-section="group-stream">
          <h3 className="mb-3 text-sm font-semibold text-ink">Activity</h3>
          {space.stream.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing posted yet.</p>
          ) : (
            <ul className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto">
              {space.stream.map((post) => (
                <li
                  key={post.id}
                  className={`rounded-md border border-border p-3 ${post.hidden ? "opacity-50" : ""} ${
                    post.kind === "PRAYER" ? "bg-amber-50/60" : "bg-surface"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-ink-muted">
                      <span className="font-medium text-ink">
                        {post.isStaff ? churchName : (post.authorName ?? "Unknown")}
                      </span>
                      {post.anonymous && " · posted anonymously to the group"}
                      {" · "}
                      {postedAt(post.createdAt)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {post.kind === "PRAYER" && <Badge variant="warning">Prayer</Badge>}
                      {post.hidden && <Badge>Hidden</Badge>}
                      {canManage && (
                        <form action={moderateGroupPostAction.bind(null, groupId, post.id, !post.hidden)}>
                          <button
                            type="submit"
                            aria-label={post.hidden ? "Restore post" : "Hide post"}
                            title={post.hidden ? "Restore post" : "Hide post"}
                            className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
                          >
                            {post.hidden ? <RotateCcw size={13} /> : <EyeOff size={13} />}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  {post.body && <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{post.body}</p>}
                  {post.kind === "LINK" && post.url && (
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1.5 break-all text-sm font-medium text-accent hover:underline"
                    >
                      <LinkIcon size={13} /> {post.url} <ExternalLink size={11} />
                    </a>
                  )}
                  {post.kind === "PRAYER" && post.prayingCount > 0 && (
                    <p className="mt-1.5 text-xs text-ink-muted">
                      🙏 {post.prayingCount} praying
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <form action={postToGroupAsChurchAction.bind(null, groupId)} className="mt-4 border-t border-border pt-4">
              <label className="text-xs text-ink-secondary">
                Post to the group as {churchName}
                <Textarea name="body" rows={2} required placeholder="Reminder: we meet Thursday!" className="mt-1 block w-full text-sm" />
              </label>
              <button type="submit" className={buttonClasses("primary", "sm") + " mt-2"}>
                <Send size={13} /> Post
              </button>
            </form>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          {/* Group events + attendance */}
          <Card padding="md" data-section="group-events">
            <h3 className="mb-3 text-sm font-semibold text-ink">Group events</h3>
            {space.events.length === 0 ? (
              <p className="text-sm text-ink-muted">No group events planned.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {space.events.map((event) => {
                  // Roster = everyone with an RSVP row plus current members (walk-ins included).
                  const byPerson = new Map(event.attendance.map((a) => [a.personId, a]));
                  for (const member of space.members) {
                    if (!byPerson.has(member.personId)) {
                      byPerson.set(member.personId, {
                        personId: member.personId,
                        name: member.name,
                        attended: null,
                        rsvp: "NO_RESPONSE",
                      });
                    }
                  }
                  const roster = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name));
                  const marked = roster.filter((r) => r.attended !== null);
                  const present = roster.filter((r) => r.attended === true);

                  return (
                    <li key={event.id} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ink">{event.title}</p>
                          <p className="text-xs text-ink-secondary">
                            {when(event.startAt)}
                            {event.location && ` · ${event.location}`}
                          </p>
                        </div>
                        {canManage && (
                          <form action={archiveGroupEventStaffAction.bind(null, groupId, event.id)}>
                            <button
                              type="submit"
                              aria-label={`Remove ${event.title}`}
                              className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                            >
                              <Trash2 size={13} />
                            </button>
                          </form>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-ink-muted">
                        {event.going} going · {event.maybe} maybe
                        {marked.length > 0 && ` · attendance: ${present.length} of ${marked.length} marked present`}
                      </p>
                      {canManage && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-accent">
                            <ClipboardCheck size={12} className="mr-1 inline" />
                            Mark attendance
                          </summary>
                          <form
                            action={markGroupAttendanceStaffAction.bind(null, groupId, event.id)}
                            className="mt-2 rounded-md bg-surface-muted p-3"
                          >
                            <input type="hidden" name="personIds" value={roster.map((r) => r.personId).join(",")} />
                            <ul className="flex flex-col gap-1.5">
                              {roster.map((row) => (
                                <li key={row.personId}>
                                  <label className="flex items-center gap-2 text-sm text-ink">
                                    <input
                                      type="checkbox"
                                      name={`attended:${row.personId}`}
                                      defaultChecked={row.attended === true}
                                      className="h-3.5 w-3.5"
                                    />
                                    {row.name}
                                    {row.rsvp === "GOING" && <span className="text-xs text-ink-muted">(going)</span>}
                                    {row.rsvp === "MAYBE" && <span className="text-xs text-ink-muted">(maybe)</span>}
                                  </label>
                                </li>
                              ))}
                            </ul>
                            <button type="submit" className={buttonClasses("secondary", "sm") + " mt-3"}>
                              Save attendance
                            </button>
                          </form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {canManage && (
              <details className="mt-4 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm font-medium text-accent">
                  <CalendarPlus size={14} className="mr-1 inline" />
                  New group event
                </summary>
                <form action={createGroupEventStaffAction.bind(null, groupId)} className="mt-3 flex flex-col gap-2">
                  <Input name="title" required placeholder="Potluck at the Hendersons'" className="text-sm" />
                  <div className="flex flex-wrap gap-2">
                    <Input name="startAt" type="datetime-local" required className="text-sm" />
                    <Input name="location" placeholder="Location (optional)" className="flex-1 text-sm" />
                  </div>
                  <Textarea name="description" rows={2} placeholder="Details (optional)" className="text-sm" />
                  <button type="submit" className={buttonClasses("primary", "sm") + " self-start"}>
                    Create event
                  </button>
                </form>
              </details>
            )}
          </Card>

          {/* Polls */}
          <Card padding="md" data-section="group-polls">
            <h3 className="mb-3 text-sm font-semibold text-ink">Polls</h3>
            {space.polls.length === 0 ? (
              <p className="text-sm text-ink-muted">No polls yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {space.polls.map((poll) => (
                  <li key={poll.id} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{poll.question}</p>
                      <div className="flex items-center gap-1.5">
                        {poll.closed ? (
                          <Badge>Closed</Badge>
                        ) : (
                          canManage && (
                            <form action={closeGroupPollStaffAction.bind(null, groupId, poll.id)}>
                              <button type="submit" className="text-xs font-medium text-ink-muted hover:text-ink">
                                Close poll
                              </button>
                            </form>
                          )
                        )}
                      </div>
                    </div>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {poll.options.map((option, i) => {
                        const count = poll.counts[i] ?? 0;
                        const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
                        return (
                          <li key={i} className="relative overflow-hidden rounded-sm border border-border">
                            <div className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${pct}%` }} />
                            <div className="relative flex items-center justify-between px-2.5 py-1.5 text-sm">
                              <span className="text-ink">{option}</span>
                              <span className="text-xs text-ink-muted">
                                {count} · {pct}%
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-1.5 text-xs text-ink-muted">
                      {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {canManage && (
              <details className="mt-4 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm font-medium text-accent">
                  <Vote size={14} className="mr-1 inline" />
                  New poll
                </summary>
                <form action={createGroupPollStaffAction.bind(null, groupId)} className="mt-3 flex flex-col gap-2">
                  <Input name="question" required placeholder="Where should we meet next month?" className="text-sm" />
                  <label className="text-xs text-ink-secondary">
                    Options — one per line (2–10)
                    <Textarea
                      name="options"
                      rows={3}
                      required
                      placeholder={"The church\nThe Hendersons'\nCoffee shop downtown"}
                      className="mt-1 block w-full text-sm"
                    />
                  </label>
                  <button type="submit" className={buttonClasses("primary", "sm") + " self-start"}>
                    Create poll
                  </button>
                </form>
              </details>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
