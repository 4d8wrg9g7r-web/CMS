"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, MessageCircle, Send } from "lucide-react";

/**
 * Livestream chat panel (docs/domain/app.md) for the public PWA. Polls the
 * chat endpoint every few seconds with an afterId cursor; signed-in members
 * post, and members holding a HOST/MODERATOR role get a badge and a hide
 * control. Auth rides the PWA's session cookie.
 */

interface ChatMessage {
  id: string;
  person_id: string | null;
  display_name: string;
  body: string;
  role: "HOST" | "MODERATOR" | "STAFF" | null;
  created_at: string;
}

const POLL_MS = 4000;

function roleBadge(role: ChatMessage["role"], accent: string) {
  if (!role) return null;
  const label = role === "HOST" ? "Host" : role === "MODERATOR" ? "Mod" : "Team";
  return (
    <span
      className="rounded px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
      style={{ backgroundColor: accent }}
      data-chat-badge={role}
    >
      {label}
    </span>
  );
}

export function LivestreamChat({ publicAppId, accent, signedIn }: { publicAppId: string; accent: string; signedIn: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewerRole, setViewerRole] = useState<"HOST" | "MODERATOR" | null>(null);
  const [slowMode, setSlowMode] = useState(0);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const lastIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const base = `/api/app/v1/apps/${publicAppId}/chat`;

  const poll = useCallback(async () => {
    try {
      const url = lastIdRef.current ? `${base}?after=${encodeURIComponent(lastIdRef.current)}` : base;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: ChatMessage[];
        slow_mode_seconds: number;
        viewer: { role: "HOST" | "MODERATOR" | null } | null;
      };
      setSlowMode(data.slow_mode_seconds);
      setViewerRole(data.viewer?.role ?? null);
      if (data.messages.length > 0) {
        lastIdRef.current = data.messages[data.messages.length - 1]!.id;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev, ...data.messages.filter((m) => !seen.has(m.id))];
          return merged.slice(-200);
        });
        queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
      }
    } catch {
      /* transient network errors: next poll retries */
    }
  }, [base]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  const send = async () => {
    if (sending || !draft.trim()) return;
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setNotice(data.message ?? "Could not send that message.");
      } else {
        setDraft("");
        await poll();
      }
    } catch {
      setNotice("Could not send — check your connection.");
    } finally {
      setSending(false);
    }
  };

  const hide = async (messageId: string) => {
    const res = await fetch(`${base}/hide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message_id: messageId }),
    });
    if (res.ok) setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-white" data-section="livestream-chat">
      <p className="flex items-center gap-1.5 border-b border-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-900">
        <MessageCircle size={15} style={{ color: accent }} /> Live chat
        {slowMode > 0 && <span className="ml-auto text-[11px] font-normal text-neutral-400">Slow mode: {slowMode}s</span>}
      </p>

      <div ref={listRef} className="max-h-72 space-y-2 overflow-y-auto px-4 py-3" data-chat-messages>
        {messages.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-400">No messages yet — say hello!</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="group flex items-start gap-2 text-sm" data-chat-message={m.id}>
              <div className="min-w-0 flex-1">
                <span className="mr-1.5 inline-flex items-center gap-1 font-semibold text-neutral-900">
                  {m.display_name} {roleBadge(m.role, accent)}
                </span>
                <span className="break-words text-neutral-700">{m.body}</span>
              </div>
              {viewerRole && (
                <button
                  type="button"
                  onClick={() => void hide(m.id)}
                  aria-label="Hide message"
                  className="mt-0.5 shrink-0 text-neutral-300 hover:text-neutral-600"
                  data-chat-hide={m.id}
                >
                  <EyeOff size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-neutral-100 p-3">
        {signedIn ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder="Send a message…"
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
              data-chat-input
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              aria-label="Send"
              className="rounded-lg p-2 text-white disabled:opacity-40"
              style={{ backgroundColor: accent }}
              data-chat-send
            >
              <Send size={16} />
            </button>
          </form>
        ) : (
          <p className="text-center text-xs text-neutral-400">Sign in to join the conversation.</p>
        )}
        {notice && <p className="mt-1.5 text-xs text-red-600" data-chat-notice>{notice}</p>}
      </div>
    </div>
  );
}
