import { Church, EyeOff, Lock, MessagesSquare, Radio, RotateCcw, Trash2 } from "lucide-react";
import { appFeedService, appService, livestreamChatService, peopleService, personDisplayName } from "@cms/database";
import { AnnouncementForm } from "../../../components/AnnouncementForm";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input, Select } from "../../../components/ui/Input";
import { buttonClasses } from "../../../components/ui/Button";
import { canApp } from "../../../lib/app-access";
import { getCurrentOrganization } from "../../../lib/session";
import { timeAgo } from "../../../lib/format";
import {
  assignChatRoleAction,
  postStaffChatMessageAction,
  removeChatRoleAction,
  setChatMessageHiddenAction,
  setChatSlowModeAction,
  setPostHiddenAction,
} from "./actions";

function authorLabel(post: { kind: string; person: { firstName: string; lastName: string; preferredName: string | null } | null }): string {
  if (post.kind === "CHURCH" || !post.person) return "Church announcement";
  return `${post.person.preferredName || post.person.firstName} ${post.person.lastName}`.trim();
}

export default async function CommunityPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canApp(organization.id, "app.view"),
    canApp(organization.id, "app.manage"),
  ]);
  if (!canView) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to Community" description="" />
      </Card>
    );
  }

  const [posts, chatRoles, chatMessages, app, people] = await Promise.all([
    appFeedService.listAllPosts(organization.id),
    livestreamChatService.listChatRoles(organization.id),
    livestreamChatService.listChatMessages(organization.id, { includeHidden: true }),
    appService.getChurchApp(organization.id),
    canManage ? peopleService.listPeople(organization.id, {}) : Promise.resolve([]),
  ]);
  const roleHolderIds = new Set(chatRoles.map((r) => r.personId));

  return (
    <div>
      <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Community</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        The live feed inside your church app: post announcements as the church, and moderate what members share.
      </p>

      {canManage && (
        <Card padding="md" className="mb-6">
          <AnnouncementForm />
        </Card>
      )}

      {posts.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<MessagesSquare size={22} />}
            title="No posts yet"
            description="Post the first announcement above — it appears in the app instantly."
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3 font-medium">Author</th>
                  <th className="px-5 py-3 font-medium">Post</th>
                  <th className="px-5 py-3 font-medium">Audience</th>
                  <th className="px-5 py-3 font-medium">Engagement</th>
                  <th className="px-5 py-3 font-medium">Posted</th>
                  {canManage && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} className={`border-b border-border/60 last:border-0 ${post.hiddenAt ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1.5 font-medium text-ink">
                        {post.kind === "CHURCH" && <Church size={13} className="text-accent" />}
                        {authorLabel(post)}
                      </span>
                    </td>
                    <td className="max-w-md px-5 py-3 text-ink-secondary">
                      <span className="line-clamp-2">
                        {post.imageUrl && <span className="mr-1 text-ink-muted">[Photo]</span>}
                        {post.body}
                      </span>
                      {post.hiddenAt && (
                        <span className="mt-1 block">
                          <Badge variant="warning">Hidden</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{post.group?.name ?? "Everyone"}</td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {post._count.likes} {post._count.likes === 1 ? "like" : "likes"} · {post._count.comments}{" "}
                      {post._count.comments === 1 ? "comment" : "comments"}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{timeAgo(post.createdAt)}</td>
                    {canManage && (
                      <td className="px-5 py-3 text-right">
                        <form action={setPostHiddenAction.bind(null, post.id, !post.hiddenAt)}>
                          <button
                            type="submit"
                            className={`inline-flex items-center gap-1 text-xs ${
                              post.hiddenAt ? "text-ink-muted hover:text-ink" : "text-ink-muted hover:text-danger"
                            }`}
                          >
                            {post.hiddenAt ? (
                              <>
                                <RotateCcw size={13} /> Restore
                              </>
                            ) : (
                              <>
                                <EyeOff size={13} /> Hide
                              </>
                            )}
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ------------------------- Livestream chat ------------------------- */}
      <h2 className="mb-1 mt-10 flex items-center gap-2 text-lg font-semibold text-ink">
        <Radio size={17} /> Livestream chat
      </h2>
      <p className="mb-4 text-sm text-ink-secondary">
        Chat runs on the app&rsquo;s Livestream tab. Hosts get a badge; hosts and moderators can hide messages from
        their phones.
      </p>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card padding="md" className="lg:col-span-2" data-section="chat-moderation">
          <h3 className="mb-3 text-sm font-semibold text-ink">Recent messages</h3>
          {chatMessages.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing yet — messages appear here as people chat during services.</p>
          ) : (
            <ul className="space-y-2">
              {chatMessages.slice(-30).map((m) => (
                <li key={m.id} className={`flex items-start gap-2 text-sm ${m.hiddenAt ? "opacity-50" : ""}`} data-chat-row={m.id}>
                  <div className="min-w-0 flex-1">
                    <span className="mr-1.5 font-semibold text-ink">
                      {m.displayName}
                      {m.role && (
                        <span className="ml-1.5">
                          <Badge variant={m.role === "HOST" ? "success" : "info"}>
                            {m.role === "HOST" ? "Host" : m.role === "MODERATOR" ? "Mod" : "Team"}
                          </Badge>
                        </span>
                      )}
                    </span>
                    <span className="break-words text-ink-secondary">{m.body}</span>
                    <span className="ml-2 text-xs text-ink-muted">{timeAgo(m.createdAt)}</span>
                    {m.hiddenAt && (
                      <span className="ml-2">
                        <Badge variant="warning">Hidden</Badge>
                      </span>
                    )}
                  </div>
                  {canManage && (
                    <form action={setChatMessageHiddenAction.bind(null, m.id, !m.hiddenAt)}>
                      <button
                        type="submit"
                        className="text-xs text-ink-muted hover:text-ink"
                        data-action={m.hiddenAt ? "unhide-chat" : "hide-chat"}
                      >
                        {m.hiddenAt ? <RotateCcw size={13} /> : <EyeOff size={13} />}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <form action={postStaffChatMessageAction} className="mt-4 flex items-center gap-2" data-section="chat-staff-post">
              <Input name="body" maxLength={500} placeholder={`Post in chat as ${organization.name}…`} className="flex-1 text-sm" data-chat-staff-input />
              <button type="submit" className={buttonClasses("primary", "sm")} data-action="post-staff-chat">
                Post
              </button>
            </form>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          {canManage && (
            <Card padding="md" data-section="chat-roles">
              <h3 className="mb-2 text-sm font-semibold text-ink">Hosts &amp; moderators</h3>
              <p className="mb-3 text-xs text-ink-muted">
                Hosts wear a badge in chat; both roles can hide messages and skip slow mode.
              </p>
              {chatRoles.length > 0 && (
                <ul className="mb-3 space-y-1.5 text-sm">
                  {chatRoles.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2" data-chat-role={r.personId}>
                      <span className="min-w-0 truncate text-ink">
                        {personDisplayName(r.person)}
                        <span className="ml-1.5">
                          <Badge variant={r.role === "HOST" ? "success" : "info"}>
                            {r.role === "HOST" ? "Host" : "Moderator"}
                          </Badge>
                        </span>
                      </span>
                      <form action={removeChatRoleAction.bind(null, r.personId)}>
                        <button type="submit" aria-label="Remove role" className="p-0.5 text-ink-muted hover:text-danger" data-action="remove-chat-role">
                          <Trash2 size={13} />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <form action={assignChatRoleAction} className="space-y-2">
                <Select name="personId" className="w-full text-sm" aria-label="Person" data-chat-role-person>
                  <option value="">Choose a person…</option>
                  {people
                    .filter((p) => !roleHolderIds.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {personDisplayName(p)}
                      </option>
                    ))}
                </Select>
                <div className="flex items-center gap-2">
                  <Select name="role" className="flex-1 text-sm" aria-label="Role" data-chat-role-kind>
                    <option value="HOST">Host</option>
                    <option value="MODERATOR">Moderator</option>
                  </Select>
                  <button type="submit" className={buttonClasses("secondary", "sm")} data-action="assign-chat-role">
                    Assign
                  </button>
                </div>
              </form>
            </Card>
          )}

          {canManage && (
            <Card padding="md" data-section="chat-slow-mode">
              <h3 className="mb-2 text-sm font-semibold text-ink">Slow mode</h3>
              <p className="mb-3 text-xs text-ink-muted">
                Seconds members must wait between messages (0 = off). Hosts and moderators are exempt.
              </p>
              <form action={setChatSlowModeAction} className="flex items-center gap-2">
                <Input
                  name="seconds"
                  type="number"
                  min={0}
                  max={600}
                  defaultValue={app?.chatSlowModeSeconds ?? 0}
                  className="w-24 text-sm"
                  aria-label="Slow mode seconds"
                  data-chat-slow-input
                />
                <button type="submit" className={buttonClasses("secondary", "sm")} data-action="save-slow-mode">
                  Save
                </button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
