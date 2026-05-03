import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchChatMessages,
  fetchChatSince,
  sendChatMessage,
  type ChatMessage,
} from "../utils/api";
import { useT } from "../i18n/LanguageContext";

// ─────────────────────────────────────────────────────────────────────
// HOME — Global Chat panel (Phase 5b).
//
// Pixel-styled scrollable list + single-line input. Polls the server
// every POLL_MS for new messages (delta poll once we know the highest id).
// Auto-scrolls to the bottom when new messages arrive AND the user was
// already at/near the bottom — so reading older history isn't yanked.
// ─────────────────────────────────────────────────────────────────────

const POLL_MS = 4000;
const MAX_LEN = 200;

interface Props {
  telegramId: string | null;
  /** Display name to send with each message (Telegram username/first name). */
  username: string;
}

export function GlobalChat({ telegramId, username }: Props) {
  const { t } = useT();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track high-water id for delta polls without re-rendering on each tick.
  const highestIdRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Whether the user is "pinned" near the bottom — drives auto-scroll on
  // new messages. Updated on every scroll event.
  const pinnedToBottomRef = useRef(true);

  // Initial load + polling loop. The poll cadence stays at POLL_MS even
  // when the tab is hidden — chat is cheap and keeps recent context warm
  // for when the user re-focuses.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return;
      const since = highestIdRef.current;
      const incoming = since > 0 ? await fetchChatSince(since) : await fetchChatMessages();
      if (cancelled) return;
      if (incoming.length > 0) {
        setMessages((prev) => {
          if (since === 0) {
            // Initial load — replace the list and seed the high-water id.
            const top = incoming[incoming.length - 1];
            if (top) highestIdRef.current = top.id;
            return incoming;
          }
          // Delta — append, dedupe by id (in case of overlap with our own
          // optimistic insert from sendChatMessage).
          const seen = new Set(prev.map((m) => m.id));
          const merged = [...prev];
          for (const m of incoming) {
            if (!seen.has(m.id)) merged.push(m);
            if (m.id > highestIdRef.current) highestIdRef.current = m.id;
          }
          // Cap retained history at 200 to keep the DOM light over long sessions.
          return merged.length > 200 ? merged.slice(merged.length - 200) : merged;
        });
      }
      timer = window.setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  // Auto-scroll to bottom on message arrival if the user was pinned.
  useEffect(() => {
    if (!pinnedToBottomRef.current) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.clientHeight - el.scrollTop;
    pinnedToBottomRef.current = dist < 40;
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending || !telegramId) return;
    setSending(true);
    setError(null);
    const result = await sendChatMessage(telegramId, username || "", trimmed);
    setSending(false);
    if (result.ok && result.message) {
      // Optimistic append: avoids the 0–4s wait for the next poll. Delta
      // poll dedupes by id so we won't show it twice.
      setMessages((prev) => {
        if (prev.some((m) => m.id === result.message!.id)) return prev;
        const merged = [...prev, result.message!];
        if (result.message!.id > highestIdRef.current) {
          highestIdRef.current = result.message!.id;
        }
        return merged.length > 200 ? merged.slice(merged.length - 200) : merged;
      });
      setDraft("");
      pinnedToBottomRef.current = true;
    } else if (result.error === "COOLDOWN") {
      const secs = Math.ceil((result.retryAfterMs ?? 3000) / 1000);
      setError(t("chat.cooldown", { n: secs }));
    } else if (result.error === "EMPTY") {
      setError(t("chat.empty2"));
    } else {
      setError(t("chat.failed"));
    }
  }, [draft, sending, telegramId, username]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div
      className="flex-shrink-0 mx-3 my-3 rounded-xl"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="font-black text-xs tracking-widest" style={{ color: "rgba(255,255,255,0.7)" }}>
          {t("chat.title")}
        </div>
        <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          {messages.length} {t("chat.msg")}
        </div>
      </div>

      {/* Message list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{
          maxHeight: 220,
          minHeight: 140,
          overflowY: "auto",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {messages.length === 0 ? (
          <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)", padding: "8px 0" }}>
            {t("chat.empty")}
          </div>
        ) : (
          messages.map((m) => {
            const mine = telegramId !== null && m.telegramId === telegramId;
            return (
              <div key={m.id} style={{ lineHeight: 1.35 }}>
                <span
                  className="font-black text-[11px] tracking-wide"
                  style={{ color: mine ? "#ffd740" : "#7fdf7f" }}
                >
                  {m.username || `user${m.telegramId.slice(-4)}`}
                </span>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.85)", marginLeft: 6 }}>
                  {m.text}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div
        className="px-3 py-2 flex items-center gap-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.slice(0, MAX_LEN));
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          maxLength={MAX_LEN}
          placeholder={telegramId ? t("chat.placeholder") : t("chat.placeholderTg")}
          disabled={!telegramId || sending}
          className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
          style={{
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.9)",
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!telegramId || sending || draft.trim().length === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-black tracking-wider transition-all active:scale-95"
          style={{
            background: "rgba(255,215,64,0.20)",
            color: "#ffd740",
            border: "1px solid rgba(255,215,64,0.5)",
            cursor: !telegramId || sending || draft.trim().length === 0 ? "not-allowed" : "pointer",
            opacity: !telegramId || sending || draft.trim().length === 0 ? 0.5 : 1,
          }}
        >
          {sending ? "…" : t("chat.send")}
        </button>
      </div>

      {error && (
        <div
          className="text-[11px] px-3 pb-2"
          style={{ color: "#ff8b8b" }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
