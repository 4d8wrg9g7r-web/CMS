/**
 * The church-app content contract (docs/domain/app.md "Container experience").
 * Mirrors the ADDITIVE-ONLY payloads of /api/app/v1/* served by the CMS —
 * canonical shapes live in packages/database (AppManifest, AppTab,
 * AppPageBlock, FeedPost) and lib/church-app-content.ts. This app is a thin
 * renderer over these types; never widen them here.
 */

export interface DirectoryEntry {
  public_app_id: string;
  app_name: string;
  theme_color: string;
  logo_url: string | null;
  organization_name: string;
}

export type AppTabKind = "home" | "events" | "sermons" | "groups" | "forms" | "giving";

export type AppTab =
  | { kind: AppTabKind }
  | { kind: "link"; label: string; url: string }
  | { kind: "livestream"; url: string }
  | { kind: "page"; pageId: string; label: string };

export interface AppManifest {
  appName: string;
  themeColor: string;
  logoUrl: string | null;
  welcome: string;
  givingUrl: string | null;
  allowMemberPosts: boolean;
  tabs: AppTab[];
}

export type AppLinkTarget =
  | { kind: "tab"; tab: AppTabKind }
  | { kind: "inapp"; url: string }
  | { kind: "external"; url: string };

export type AppPageBlock =
  | { type: "image"; url: string; alt: string; link: AppLinkTarget | null }
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "button"; label: string; target: AppLinkTarget }
  | { type: "divider" };

export interface AppEventItem {
  id: string;
  title: string;
  when: string;
  location: string | null;
}
export interface AppSermonItem {
  id: string;
  title: string;
  speaker: string | null;
  series: string | null;
  passage: string | null;
  when: string;
  videoUrl: string | null;
}
export interface AppGroupItem {
  id: string;
  name: string;
  description: string | null;
}
export interface AppFormItem {
  id: string;
  title: string;
  /** App-relative (/f/<publicId>) — resolve against the API base. */
  href: string;
}
export interface AppPageItem {
  id: string;
  title: string;
  blocks: AppPageBlock[];
}
export interface AppContent {
  events: AppEventItem[];
  sermons: AppSermonItem[];
  groups: AppGroupItem[];
  forms: AppFormItem[];
  pages: AppPageItem[];
}

export interface FeedComment {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorPersonId: string;
  body: string;
  replies: FeedComment[];
}

export interface FeedPost {
  id: string;
  kind: "CHURCH" | "MEMBER";
  authorName: string | null;
  authorAvatarUrl: string | null;
  authorPersonId: string | null;
  groupName: string | null;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  reactions: { emoji: string; count: number }[];
  myReaction: string | null;
  commentCount: number;
  comments: FeedComment[];
  mine: boolean;
}

export interface ApiMember {
  person_id: string;
  first_name: string;
  display_name: string;
  photo_url: string | null;
}

/**
 * The group space payload (docs/domain/groups.md) — served by
 * GET /api/app/v1/apps/[id]/groups/[groupId], camelCase like the feed since it
 * serializes the canonical GroupSpace from packages/database.
 */
export interface GroupStreamItem {
  id: string;
  kind: "MESSAGE" | "LINK" | "PRAYER";
  body: string;
  url: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  isStaff: boolean;
  anonymous: boolean;
  hidden: boolean;
  prayingCount: number;
  prayingByMe: boolean;
  createdAt: string;
}

export interface GroupSpaceEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  going: number;
  maybe: number;
  myRsvp: string | null;
  attendance: { personId: string; name: string; attended: boolean | null; rsvp: string }[];
}

export interface GroupSpacePoll {
  id: string;
  question: string;
  options: string[];
  closed: boolean;
  totalVotes: number;
  counts: number[];
  myVote: number | null;
}

export interface GroupSpace {
  group: {
    id: string;
    name: string;
    description: string | null;
    meetingSchedule: string | null;
    meetingLocation: string | null;
  };
  viewer: { personId: string | null; isLeader: boolean };
  members: { personId: string; name: string; avatarUrl: string | null; role: string }[];
  stream: GroupStreamItem[];
  events: GroupSpaceEvent[];
  polls: GroupSpacePoll[];
}

/** In-app giving options (never keys). `online: false` → fall back to givingUrl. */
export interface AppGiving {
  online: boolean;
  currency: string;
  funds: { id: string; name: string }[];
}

export interface AppPayload {
  public_app_id: string;
  organization_name: string;
  manifest: AppManifest;
  content: AppContent;
  /** Personalized when the request carries a Bearer member token; signed-out view otherwise. */
  feed: FeedPost[];
  /** Additive: present once the server ships online giving. */
  giving?: AppGiving;
  /** Present only on authenticated requests. */
  member?: ApiMember;
  my_groups?: { id: string; name: string }[];
}
