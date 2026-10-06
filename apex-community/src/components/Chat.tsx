import { useEffect, useRef, useState } from "react";
import type { Level, Stage, Tour } from "../types";
import { settingsHeaders, type LlmSettings } from "../lib/settings";
import { renderMarkdown, type PathRef } from "../lib/markdown";

interface Msg {
  role: "user" | "assistant";
  content: string;
  refs?: PathRef[];
  sources?: string[];
}

const STARTERS: Record<Stage, string[]> = {
  understand: ["Explain this repo in simple words", "Where does execution start?", "Which part should I read first, and why?"],
  placement: ["What should I know before taking the quiz?", "Explain the core idea of this repo"],
  projects: ["Give me a hint for the first project", "Which file should I open first?", "How do the three projects connect?"],
  rebuild: ["Walk me through the first rebuild phase", "Why is the rebuild in this order?"],
};

const storeKey = (t: Tour) => `dg_chat:${t.repo}@${t.commit}`;

function load(t: Tour): Msg[] {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(t)) ?? "[]");
    return Array.isArray(v) ? v.filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string") : [];
  } catch {
    return [];
  }
}

export default function Chat({
  tour,
  stage,
  level,
  llm,
  open,
  onClose,
}: {
  tour: Tour;
  stage: Stage;
  level: Level | null;
  llm: LlmSettings;
  open: boolean;
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(() => load(tour));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMsgs(load(tour));
    setError(null);
  }, [tour.repo, tour.commit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(storeKey(tour), JSON.stringify(msgs.slice(-40)));
    } catch {
      /* storage full or blocked: the chat still works */
    }
  }, [msgs, tour]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy, error, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function send(history: Msg[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", ...settingsHeaders(llm) },
        body: JSON.stringify({
          repo: tour.repo,
          commit: tour.commit,
          stage,
          level,
          messages: history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status}).`);
      setMsgs([...history, { role: "assistant", content: String(body.reply), refs: body.refs ?? [], sources: body.sources ?? [] }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    void send(next);
  }

  function clear() {
    setMsgs([]);
    setError(null);
  }

  const last = msgs[msgs.length - 1];
  const canRetry = !!error && last?.role === "user";

  return (
    <aside className={`chat ${open ? "chat-open" : ""}`} role="dialog" aria-label={`Ask about ${tour.repo}`} aria-hidden={!open}>
      <header className="chat-head">
        <div>
          <b>Ask about this repo</b>
          <span className="chat-sub">{tour.repo}</span>
        </div>
        <div className="chat-head-actions">
          {msgs.length > 0 && (
            <button type="button" className="link-btn" onClick={clear} disabled={busy}>
              Clear
            </button>
          )}
          <button type="button" className="chat-x" onClick={onClose} aria-label="Close chat" tabIndex={open ? 0 : -1}>
            ×
          </button>
        </div>
      </header>

      <div className="chat-log" aria-live="polite">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <p>
              Ask anything about <b>{tour.repo}</b>. I know this tour, the file list, and I can read the files you ask about.
            </p>
            <div className="chat-starters">
              {STARTERS[stage].map((s) => (
                <button key={s} type="button" className="chat-chip" onClick={() => ask(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`chat-msg chat-${m.role}`}>
            {m.role === "assistant" ? (
              <>
                {renderMarkdown(m.content, { refs: m.refs ?? [], repo: tour.repo, branch: tour.branch })}
                {m.sources && m.sources.length > 0 && <p className="chat-src">read: {m.sources.join(", ")}</p>}
              </>
            ) : (
              <p>{m.content}</p>
            )}
          </div>
        ))}
        {busy && (
          <div className="chat-msg chat-assistant chat-think" role="status">
            Reading and thinking…
          </div>
        )}
        {error && (
          <div className="chat-error" role="alert">
            {error}
            {canRetry && (
              <button type="button" className="link-btn" onClick={() => void send(msgs)}>
                Retry
              </button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          maxLength={2000}
          rows={2}
          placeholder="Ask about a file, a concept, or your project…"
          aria-label="Your question"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(input);
            }
          }}
          tabIndex={open ? 0 : -1}
        />
        <button type="submit" className="btn btn-solid" disabled={busy || !input.trim()} tabIndex={open ? 0 : -1}>
          Send
        </button>
      </form>
    </aside>
  );
}
