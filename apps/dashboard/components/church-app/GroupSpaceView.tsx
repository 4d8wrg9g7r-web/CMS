"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  ClipboardCheck,
  EyeOff,
  Link as LinkIcon,
  Mail,
  MessageCircle,
  Plus,
  RotateCcw,
  Send,
  UserMinus,
  UserPlus,
  Vote,
} from "lucide-react";
import type { GroupSpace } from "@cms/database";
import {
  addGroupMemberAction,
  closePollAction,
  createGroupEventAction,
  createGroupPollAction,
  emailGroupAction,
  hideGroupPostAction,
  markAttendanceAction,
  postToGroupAction,
  prayAction,
  removeGroupMemberAction,
  rsvpAction,
  votePollAction,
} from "../../app/a/[publicAppId]/group/actions";

/**
 * The small-group space (docs/domain/groups.md): stream (chat/links/prayer),
 * group-only events with RSVP, polls, and — for leaders — event/poll creation,
 * moderation, attendance, member management, and email-the-group. Rendered in
 * the church app; the dashboard has its own staff view over the same payload.
 */

function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function eventWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type TabKey = "stream" | "events" | "polls" | "leader";

export function GroupSpaceView({
  publicAppId,
  space,
  accent,
}: {
  publicAppId: string;
  space: GroupSpace;
  accent: string;
}) {
  const router = useRouter();
  const groupId = space.group.id;
  const isLeader = space.viewer.isLeader;
  const [tab, setTab] = useState<TabKey>("stream");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Something went wrong");
      router.refresh();
    });

  // Composer state
  const [composerKind, setComposerKind] = useState<"MESSAGE" | "LINK" | "PRAYER">("MESSAGE");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  // Leader form state
  const [eventDraft, setEventDraft] = useState({ title: "", startAt: "", location: "" });
  const [pollDraft, setPollDraft] = useState({ question: "", options: "" });
  const [emailDraft, setEmailDraft] = useState({ subject: "", body: "" });
  const [memberDraft, setMemberDraft] = useState({ email: "", firstName: "", lastName: "" });
  const [emailSent, setEmailSent] = useState(false);
  const attendanceRef = useRef<Record<string, Record<string, boolean>>>({});

  const submitPost = () => {
    const payload = { kind: composerKind, body, url: url || undefined, anonymous };
    setBody("");
    setUrl("");
    setAnonymous(false);
    act(() => postToGroupAction(publicAppId, groupId, payload));
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "stream", label: "Chat" },
    { key: "events", label: "Events" },
    { key: "polls", label: "Polls" },
    ...(isLeader ? [{ key: "leader" as const, label: "Lead" }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 rounded-full bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t.key ? "text-white" : "text-neutral-500"}`}
            style={tab === t.key ? { backgroundColor: accent } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tab === "stream" && (
        <>
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="mb-2 flex gap-1.5">
              {(
                [
                  ["MESSAGE", "Message", <MessageCircle key="m" size={13} />],
                  ["LINK", "Link", <LinkIcon key="l" size={13} />],
                  ["PRAYER", "Prayer", <span key="p">🙏</span>],
                ] as const
              ).map(([kind, label, icon]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setComposerKind(kind)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                    composerKind === kind ? "border-current" : "border-neutral-200 text-neutral-500"
                  }`}
                  style={composerKind === kind ? { color: accent } : undefined}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={
                composerKind === "PRAYER"
                  ? "Share a prayer request with your group…"
                  : composerKind === "LINK"
                    ? "What is this link? (optional note)"
                    : "Message your group…"
              }
              className="w-full resize-none border-0 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            {composerKind === "LINK" && (
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none"
              />
            )}
            <div className="mt-2 flex items-center justify-between">
              {composerKind === "PRAYER" ? (
                <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                  Share anonymously
                </label>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={pending || (!body.trim() && composerKind !== "LINK") || (composerKind === "LINK" && !url.trim())}
                onClick={submitPost}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                <Send size={13} /> Send
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {space.stream.length === 0 && (
              <p className="pt-6 text-center text-sm text-neutral-500">Say hello — start the conversation.</p>
            )}
            {space.stream.map((item) => (
              <div key={item.id} className={`rounded-xl border bg-white p-3 ${item.hidden ? "opacity-50" : ""} ${item.kind === "PRAYER" ? "border-amber-200 bg-amber-50/50" : "border-neutral-200"}`}>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs text-neutral-500">
                    <span className="font-semibold text-neutral-800">
                      {item.isStaff ? "Church staff" : (item.authorName ?? "Anonymous")}
                    </span>{" "}
                    · {timeAgo(item.createdAt)}
                    {item.kind === "PRAYER" && " · Prayer request"}
                  </p>
                  {isLeader && (
                    <button
                      type="button"
                      onClick={() => act(() => hideGroupPostAction(publicAppId, groupId, item.id, !item.hidden))}
                      aria-label={item.hidden ? "Restore" : "Hide"}
                      className="text-neutral-400 hover:text-neutral-700"
                    >
                      {item.hidden ? <RotateCcw size={13} /> : <EyeOff size={13} />}
                    </button>
                  )}
                </div>
                {item.body && <p className="whitespace-pre-wrap text-sm text-neutral-800">{item.body}</p>}
                {item.url && (
                  <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm font-medium underline" style={{ color: accent }}>
                    {item.url}
                  </a>
                )}
                {item.kind === "PRAYER" && (
                  <button
                    type="button"
                    onClick={() => act(() => prayAction(publicAppId, groupId, item.id))}
                    className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${item.prayingByMe ? "border-current font-semibold" : "border-neutral-200 text-neutral-500"}`}
                    style={item.prayingByMe ? { color: accent } : undefined}
                  >
                    🙏 {item.prayingCount > 0 ? `${item.prayingCount} praying` : "I'm praying"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "events" && (
        <div className="flex flex-col gap-2">
          {space.events.length === 0 && <p className="pt-6 text-center text-sm text-neutral-500">No group events yet.</p>}
          {space.events.map((event) => (
            <div key={event.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="font-semibold text-neutral-900">{event.title}</p>
              <p className="text-sm text-neutral-600">{eventWhen(event.startAt)}</p>
              {event.location && <p className="text-xs text-neutral-500">📍 {event.location}</p>}
              {event.description && <p className="mt-1 text-sm text-neutral-700">{event.description}</p>}
              <div className="mt-2 flex items-center gap-1.5">
                {(["GOING", "MAYBE", "NO"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => act(() => rsvpAction(publicAppId, groupId, event.id, status))}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${event.myRsvp === status ? "border-current" : "border-neutral-200 text-neutral-500"}`}
                    style={event.myRsvp === status ? { color: accent } : undefined}
                  >
                    {status === "GOING" ? "Going" : status === "MAYBE" ? "Maybe" : "Can't"}
                  </button>
                ))}
                <span className="ml-auto text-xs text-neutral-500">
                  {event.going} going{event.maybe > 0 ? ` · ${event.maybe} maybe` : ""}
                </span>
              </div>

              {isLeader && event.attendance.length > 0 && (
                <details className="mt-3 border-t border-neutral-100 pt-2">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-neutral-600">
                    <ClipboardCheck size={13} /> Attendance
                  </summary>
                  <div className="mt-2 flex flex-col gap-1">
                    {event.attendance.map((row) => (
                      <label key={row.personId} className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          defaultChecked={row.attended === true}
                          onChange={(e) => {
                            attendanceRef.current[event.id] = {
                              ...(attendanceRef.current[event.id] ?? {}),
                              [row.personId]: e.target.checked,
                            };
                          }}
                        />
                        {row.name} <span className="text-xs text-neutral-400">({row.rsvp.toLowerCase()})</span>
                      </label>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        act(() =>
                          markAttendanceAction(
                            publicAppId,
                            groupId,
                            event.id,
                            Object.entries(attendanceRef.current[event.id] ?? {}).map(([personId, attended]) => ({
                              personId,
                              attended,
                            })),
                          ),
                        )
                      }
                      className="mt-1 self-start rounded-full px-3 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: accent }}
                    >
                      Save attendance
                    </button>
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "polls" && (
        <div className="flex flex-col gap-2">
          {space.polls.length === 0 && <p className="pt-6 text-center text-sm text-neutral-500">No polls yet.</p>}
          {space.polls.map((poll) => (
            <div key={poll.id} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold text-neutral-900">{poll.question}</p>
                {poll.closed && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">CLOSED</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                {poll.options.map((option, i) => {
                  const pct = poll.totalVotes > 0 ? Math.round(((poll.counts[i] ?? 0) / poll.totalVotes) * 100) : 0;
                  const mine = poll.myVote === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={poll.closed}
                      onClick={() => act(() => votePollAction(publicAppId, groupId, poll.id, i))}
                      className={`relative overflow-hidden rounded-lg border px-3 py-2 text-left text-sm ${mine ? "border-current font-semibold" : "border-neutral-200"}`}
                      style={mine ? { color: accent } : undefined}
                    >
                      <span
                        className="absolute inset-y-0 left-0 opacity-15"
                        style={{ width: `${pct}%`, backgroundColor: accent }}
                      />
                      <span className="relative flex justify-between">
                        <span>{option}</span>
                        <span className="text-xs text-neutral-500">
                          {poll.counts[i] ?? 0}{poll.totalVotes > 0 ? ` · ${pct}%` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                <span>{poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}</span>
                {isLeader && !poll.closed && (
                  <button type="button" onClick={() => act(() => closePollAction(publicAppId, groupId, poll.id))} className="font-semibold hover:text-neutral-700">
                    Close poll
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "leader" && isLeader && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
              <CalendarPlus size={15} /> New group event
            </p>
            <div className="flex flex-col gap-2">
              <input value={eventDraft.title} onChange={(e) => setEventDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Potluck at the Nguyens'" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none" />
              <input type="datetime-local" value={eventDraft.startAt} onChange={(e) => setEventDraft((d) => ({ ...d, startAt: e.target.value }))} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none" />
              <input value={eventDraft.location} onChange={(e) => setEventDraft((d) => ({ ...d, location: e.target.value }))} placeholder="Location (optional)" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none" />
              <button
                type="button"
                disabled={pending || !eventDraft.title.trim() || !eventDraft.startAt}
                onClick={() => {
                  const draft = eventDraft;
                  setEventDraft({ title: "", startAt: "", location: "" });
                  act(() => createGroupEventAction(publicAppId, groupId, { title: draft.title, startAt: draft.startAt, location: draft.location || undefined }));
                }}
                className="self-start rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                <Plus size={13} className="mr-1 inline" /> Create event
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
              <Vote size={15} /> New poll
            </p>
            <div className="flex flex-col gap-2">
              <input value={pollDraft.question} onChange={(e) => setPollDraft((d) => ({ ...d, question: e.target.value }))} placeholder="Where should we meet next month?" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none" />
              <textarea value={pollDraft.options} onChange={(e) => setPollDraft((d) => ({ ...d, options: e.target.value }))} rows={3} placeholder={"One option per line:\nThe church\nThe Nguyens' place\nCoffee shop downtown"} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none" />
              <button
                type="button"
                disabled={pending || !pollDraft.question.trim()}
                onClick={() => {
                  const draft = pollDraft;
                  setPollDraft({ question: "", options: "" });
                  act(() => createGroupPollAction(publicAppId, groupId, { question: draft.question, options: draft.options.split("\n") }));
                }}
                className="self-start rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                <Plus size={13} className="mr-1 inline" /> Create poll
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
              <Mail size={15} /> Email the group
            </p>
            <div className="flex flex-col gap-2">
              <input value={emailDraft.subject} onChange={(e) => setEmailDraft((d) => ({ ...d, subject: e.target.value }))} placeholder="Subject" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none" />
              <textarea value={emailDraft.body} onChange={(e) => setEmailDraft((d) => ({ ...d, body: e.target.value }))} rows={3} placeholder="Your message — goes to every member with an email, consent-checked." className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none" />
              <button
                type="button"
                disabled={pending || !emailDraft.subject.trim() || !emailDraft.body.trim()}
                onClick={() => {
                  const draft = emailDraft;
                  setEmailDraft({ subject: "", body: "" });
                  setEmailSent(false);
                  act(async () => {
                    const result = await emailGroupAction(publicAppId, groupId, draft);
                    if (result.ok) setEmailSent(true);
                    return result;
                  });
                }}
                className="self-start rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                <Send size={13} className="mr-1 inline" /> Send email
              </button>
              {emailSent && <p className="text-xs text-green-700">Sent — delivery shows up in the church's message log.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
              <UserPlus size={15} /> Members ({space.members.length})
            </p>
            <div className="mb-3 flex flex-col gap-1">
              {space.members.map((m) => (
                <div key={m.personId} className="flex items-center justify-between text-sm text-neutral-700">
                  <span>
                    {m.name}
                    {m.role !== "MEMBER" && <span className="ml-1.5 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">{m.role === "LEADER" ? "LEADER" : "CO-LEADER"}</span>}
                  </span>
                  {m.personId !== space.viewer.personId && (
                    <button type="button" onClick={() => act(() => removeGroupMemberAction(publicAppId, groupId, m.personId))} aria-label={`Remove ${m.name}`} className="text-neutral-400 hover:text-red-600">
                      <UserMinus size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t border-neutral-100 pt-2">
              <input value={memberDraft.email} onChange={(e) => setMemberDraft((d) => ({ ...d, email: e.target.value }))} placeholder="friend@example.com" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none" />
              <div className="flex gap-2">
                <input value={memberDraft.firstName} onChange={(e) => setMemberDraft((d) => ({ ...d, firstName: e.target.value }))} placeholder="First (if new)" className="w-1/2 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none" />
                <input value={memberDraft.lastName} onChange={(e) => setMemberDraft((d) => ({ ...d, lastName: e.target.value }))} placeholder="Last (if new)" className="w-1/2 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none" />
              </div>
              <button
                type="button"
                disabled={pending || !memberDraft.email.trim()}
                onClick={() => {
                  const draft = memberDraft;
                  setMemberDraft({ email: "", firstName: "", lastName: "" });
                  act(() => addGroupMemberAction(publicAppId, groupId, { email: draft.email, firstName: draft.firstName || undefined, lastName: draft.lastName || undefined }));
                }}
                className="self-start rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                <UserPlus size={13} className="mr-1 inline" /> Add member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
