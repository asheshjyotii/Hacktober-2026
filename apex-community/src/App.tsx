import { useEffect, useState } from "react";
import type { Level, Stage, Tour } from "./types";
import Home from "./components/Home";
import Generating from "./components/Generating";
import Trail from "./components/Trail";
import Understand from "./components/Understand";
import Placement from "./components/Placement";
import Projects from "./components/Projects";
import Rebuild from "./components/Rebuild";
import Settings from "./components/Settings";
import Chat from "./components/Chat";
import { loadSettings, saveSettings, settingsHeaders, type LlmSettings } from "./lib/settings";

interface ApiFailure {
  kind: string;
  message: string;
  retryAfter?: number;
}

/** Errors worth a plain "try again" button; the others need a different repo or settings. */
const RETRYABLE = new Set(["rate_limited", "timeout", "model", "unknown"]);

const ERROR_TITLE: Record<string, string> = {
  not_found: "Couldn't find that repository",
  private: "That repository isn't public",
  rate_limited: "Slow down a moment",
  timeout: "That took too long",
  invalid: "That isn't a repository",
};

export default function App() {
  const [view, setView] = useState<"home" | "generating" | "tour">("home");
  const [stage, setStage] = useState<Stage>("understand");
  const [level, setLevel] = useState<Level | null>(null);
  const [repo, setRepo] = useState<string>("");
  const [tour, setTour] = useState<Tour | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [llm, setLlm] = useState<LlmSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [server, setServer] = useState({ serverKey: false, model: "" });

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        setServer({ serverKey: !!c.serverKey, model: String(c.model ?? "") });
        if (!c.serverKey && !loadSettings().key) setShowSettings(true);
      })
      .catch(() => undefined);
  }, []);

  function changeLlm(s: LlmSettings) {
    setLlm(s);
    saveSettings(s);
  }

  async function start(nextRepo: string) {
    setRepo(nextRepo);
    setLevel(null);
    setStage("understand");
    setTour(null);
    setError(null);
    setView("generating");
    setShowChat(false);
    const minWait = new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(`/api/tour?repo=${encodeURIComponent(nextRepo)}`, { headers: settingsHeaders(llm) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const f = body?.error;
        throw { kind: f?.kind ?? "unknown", message: f?.message ?? `Request failed (${res.status}).`, retryAfter: f?.retryAfter } as ApiFailure;
      }
      await minWait;
      setTour(body as Tour);
      setView("tour");
    } catch (e) {
      await minWait;
      const f = e as Partial<ApiFailure>;
      setError({
        kind: f?.kind ?? "unknown",
        message: f?.message ?? (e instanceof Error ? e.message : "Something went wrong."),
        retryAfter: f?.retryAfter,
      });
    }
  }

  function restart() {
    setView("home");
    setRepo("");
    setTour(null);
    setError(null);
    setLevel(null);
    setStage("understand");
    setShowChat(false);
  }

  return (
    <div className="shell">
      <header className="site-head">
        <div className="wordmark">
          Destruct<b>GitHub</b>
        </div>
        <div className="head-meta">
          live repo analysis ·{" "}
          {view === "tour" && tour && (
            <>
              <button type="button" className="link-btn" onClick={() => setShowChat((v) => !v)} aria-expanded={showChat}>
                Ask
              </button>{" "}
              ·{" "}
            </>
          )}
          <button type="button" className="link-btn" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
            Settings
          </button>
        </div>
      </header>

      {showSettings && (
        <Settings
          value={llm}
          serverKey={server.serverKey}
          serverModel={server.model}
          onChange={changeLlm}
          onClose={() => setShowSettings(false)}
        />
      )}

      {view === "home" && <Home onStart={start} />}

      {view === "generating" && !error && <Generating repo={repo} />}

      {view === "generating" && error && (
        <div className="err-panel" role="alert">
          <h2 className="gen-title">{ERROR_TITLE[error.kind] ?? `Couldn't take ${repo} apart`}</h2>
          <p className="gen-repo">{repo}</p>
          <p>{error.message}</p>
          <div className="err-actions">
            {RETRYABLE.has(error.kind) && (
              <button type="button" className="btn btn-solid" onClick={() => start(repo)}>
                Try again
              </button>
            )}
            {error.kind === "model" && (
              <button type="button" className="btn" onClick={() => setShowSettings(true)}>
                Open Settings
              </button>
            )}
            <button type="button" className={`btn ${RETRYABLE.has(error.kind) ? "" : "btn-solid"}`} onClick={restart}>
              Try another repo
            </button>
          </div>
        </div>
      )}

      {view === "tour" && tour && (
        <Chat tour={tour} stage={stage} level={level} llm={llm} open={showChat} onClose={() => setShowChat(false)} />
      )}

      {view === "tour" && tour && (
        <div className="shell-main">
          <Trail stage={stage} tour={tour} onPick={setStage} />
          <main className="content" id="main">
            {tour.notices && tour.notices.length > 0 && (
              <aside className="notice" role="note">
                <b>Heads up</b>
                <ul>
                  {tour.notices.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </aside>
            )}
            {stage === "understand" && <Understand tour={tour} onNext={() => setStage("placement")} />}
            {stage === "placement" && (
              <Placement
                tour={tour}
                onLevel={(l) => {
                  setLevel(l);
                  setStage("projects");
                }}
              />
            )}
            {stage === "projects" && <Projects tour={tour} level={level} onNext={() => setStage("rebuild")} />}
            {stage === "rebuild" && <Rebuild tour={tour} onRestart={restart} />}
          </main>
        </div>
      )}
    </div>
  );
}
