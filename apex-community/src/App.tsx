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
import { loadSettings, saveSettings, settingsHeaders, type LlmSettings } from "./lib/settings";

export default function App() {
  const [view, setView] = useState<"home" | "generating" | "tour">("home");
  const [stage, setStage] = useState<Stage>("understand");
  const [level, setLevel] = useState<Level | null>(null);
  const [repo, setRepo] = useState<string>("");
  const [tour, setTour] = useState<Tour | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [llm, setLlm] = useState<LlmSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
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
    const minWait = new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(`/api/tour?repo=${encodeURIComponent(nextRepo)}`, { headers: settingsHeaders(llm) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status}).`);
      await minWait;
      setTour(body as Tour);
      setView("tour");
    } catch (e) {
      await minWait;
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  function restart() {
    setView("home");
    setRepo("");
    setTour(null);
    setError(null);
    setLevel(null);
    setStage("understand");
  }

  return (
    <div className="shell">
      <header className="site-head">
        <div className="wordmark">
          Destruct<b>GitHub</b>
        </div>
        <div className="head-meta">
          live repo analysis ·{" "}
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
          <h2 className="gen-title">Couldn't take {repo} apart</h2>
          <p>{error}</p>
          <button type="button" className="btn btn-solid" onClick={restart}>
            Try another repo
          </button>
        </div>
      )}

      {view === "tour" && tour && (
        <div className="shell-main">
          <Trail stage={stage} tour={tour} onPick={setStage} />
          <main className="content" id="main">
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
