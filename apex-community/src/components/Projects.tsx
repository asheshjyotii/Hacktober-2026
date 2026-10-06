import { useState } from "react";
import type { Level, Tour } from "../types";
import { blobUrl } from "../lib/github";

const START_AT: Record<Level, number> = { novice: 1, intermediate: 2, advanced: 3 };

const NOTE_FOR: Record<Level, Record<number, string>> = {
  novice: { 1: "for you: do this one first", 2: "next, after the warm-up", 3: "the goal — take your time" },
  intermediate: { 1: "for you: optional — skim the pattern", 2: "for you: start here", 3: "after this one" },
  advanced: { 1: "for you: skim", 2: "for you: skim", 3: "for you: start here" },
};

export default function Projects({
  tour,
  level,
  onNext,
}: {
  tour: Tour;
  level: Level | null;
  onNext: () => void;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    const next = new Set(done);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDone(next);
  }

  return (
    <section className="stage-head" aria-label="Three projects">
      <p className="stage-kicker">step 3 of 4</p>
      <h2 className="stage-title">Three projects, in order</h2>
      <p className="stage-intro">
        Each one uses real files from {tour.repo}. Finish all three and you've rebuilt the idea of
        the project — then the guide does the whole thing end to end.
      </p>

      {level && (
        <div className="calibrate">
          Calibrated for <b>{level}</b>: start at project {START_AT[level]}. The notes below mark
          which ones are yours.
        </div>
      )}
      {!level && (
        <div className="calibrate">
          Answer the five placement questions in step 2 and these projects tune themselves to your
          level.
        </div>
      )}

      {tour.projects.map((p) => (
        <article key={p.n} className="project">
          <header className="project-head">
            <span className="project-kicker">project {p.n}</span>
            <span className="project-tag">{p.tag}</span>
            <span className="section-note">{p.minutes} min</span>
          </header>
          <h3 className="project-title">{p.title}</h3>
          <p className="project-goal">{p.goal}</p>
          {level && <p className="project-note" style={{ padding: "8px 22px 0" }}>{NOTE_FOR[level][p.n]}</p>}
          <div className="project-body">
            <div className="project-cols">
              <div>
                <p className="mini-head">study these first — all verified</p>
                <ul className="study-paths">
                  {p.study.map((s) => (
                    <li key={s}>
                      <a href={blobUrl(tour.repo, tour.branch, s)} target="_blank" rel="noreferrer">
                        {s}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mini-head" style={{ marginTop: 16 }}>do this</p>
                <ol className="do-list">
                  {p.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="mini-head">done when</p>
                <ul className="check-list">
                  {p.checklist.map((c, ci) => {
                    const key = `${p.n}-${ci}`;
                    const checked = done.has(key);
                    return (
                      <li key={key} className={`check-item ${checked ? "check-item-done" : ""}`}>
                        <button
                          type="button"
                          className="check-box"
                          aria-pressed={checked}
                          aria-label={`Mark done: ${c}`}
                          onClick={() => toggle(key)}
                        >
                          ✓
                        </button>
                        <span className="check-label">{c}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </article>
      ))}

      <div className="stage-cta">
        <button type="button" className="btn btn-solid" onClick={onNext}>
          Open the rebuild guide
        </button>
        <span className="cta-note">The guide rebuilds {tour.repo} end to end, from an empty folder.</span>
      </div>
    </section>
  );
}
