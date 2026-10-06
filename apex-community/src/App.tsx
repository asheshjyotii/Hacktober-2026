import { useEffect, useState } from "react";
import type { Plan, Stage, Tour } from "./types";
import Home from "./components/Home";
import Generating from "./components/Generating";
import Trail from "./components/Trail";
import Understand from "./components/Understand";
import Placement from "./components/Placement";
import Projects from "./components/Projects";
import Rebuild from "./components/Rebuild";
import PlanGate, { type PlanState } from "./components/PlanGate";
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
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planState, setPlanState] = useState<PlanState>({ status: "idle" });
  /** The answers the current plan (or attempt) came from; null = skipped. */
  const [lastAnswers, setLastAnswers] = useState<number[] | null | undefined>(undefined);
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

  function resetPlan() {
    setPlan(null);
    setPlanState({ status: "idle" });
    setLastAnswers(undefined);
  }

  /** Ask the server for projects and a rebuild guide written for these answers (null = skipped). */
  async function requestPlan(answers: number[] | null) {
    if (!tour) return;
    setLastAnswers(answers);
    setPlan(null);
    setPlanState({ status: "loading" });
    setStage("projects");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json", ...settingsHeaders(llm) },
        body: JSON.stringify({ repo: tour.repo, commit: tour.commit, answers }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status}).`);
      setPlan(body as Plan);
      setPlanState({ status: "idle" });
    } catch (e) {
      setPlanState({ status: "error", error: { kind: "unknown", message: e instanceof Error ? e.message : "Something went wrong." } });
    }
  }

  async function start(nextRepo: string) {
    setRepo(nextRepo);
    resetPlan();
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
    resetPlan();
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
        <Chat tour={tour} stage={stage} level={plan?.profile.level ?? null} planKey={plan?.profile.key ?? null} llm={llm} open={showChat} onClose={() => setShowChat(false)} />
      )}

      {view === "tour" && tour && (
        <div className="shell-main">
          <Trail stage={stage} tour={tour} plan={plan} onPick={setStage} />
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
              <Placement tour={tour} onSubmit={(a) => requestPlan(a)} onSkip={() => requestPlan(null)} />
            )}
            {(stage === "projects" || stage === "rebuild") && !plan && (
              <PlanGate
                repo={tour.repo}
                state={planState}
                onQuiz={() => setStage("placement")}
                onSkip={() => requestPlan(null)}
                onRetry={() => requestPlan(lastAnswers ?? null)}
              />
            )}
            {stage === "projects" && plan && (
              <Projects tour={tour} plan={plan} onNext={() => setStage("rebuild")} onRetake={() => setStage("placement")} />
            )}
            {stage === "rebuild" && plan && <Rebuild tour={tour} plan={plan} onRestart={restart} />}
          </main>
        </div>
      )}
    </div>
  );
}
