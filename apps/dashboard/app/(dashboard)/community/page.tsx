import { Church, EyeOff, Lock, MessagesSquare, RotateCcw } from "lucide-react";
import { appFeedService } from "@cms/database";
import { AnnouncementForm } from "../../../components/AnnouncementForm";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { canApp } from "../../../lib/app-access";
import { getCurrentOrganization } from "../../../lib/session";
import { timeAgo } from "../../../lib/format";
import { setPostHiddenAction } from "./actions";

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

  const posts = await appFeedService.listAllPosts(organization.id);

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
    </div>
  );
}
