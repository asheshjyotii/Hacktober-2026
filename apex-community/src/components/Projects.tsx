import { useState } from "react";
import type { Plan, Tour } from "../types";
import { blobUrl } from "../lib/github";

export default function Projects({
  tour,
  plan,
  onNext,
  onRetake,
}: {
  tour: Tour;
  plan: Plan;
  onNext: () => void;
  onRetake: () => void;
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

      <div className="calibrate">
        {plan.profile.skipped ? (
          <>You skipped the check, so this plan starts from the basics.</>
        ) : (
          <>
            Built for <b>{plan.profile.level}</b> ({plan.profile.score}/{plan.profile.total} on the check)
            {plan.profile.missed.length > 0 && (
              <>
                , aimed at what you missed: {plan.profile.missed.map((m) => m.tests.toLowerCase()).join(", ")}
              </>
            )}
            .
          </>
        )}{" "}
        <button type="button" className="link-btn" onClick={onRetake}>
          {plan.profile.skipped ? "Take the check instead" : "Retake the check"}
        </button>
      </div>

      {plan.projects.map((p) => (
        <article key={p.n} className="project">
          <header className="project-head">
            <span className="project-kicker">project {p.n}</span>
            <span className="project-tag">{p.tag}</span>
            <span className="section-note">{p.minutes} min</span>
          </header>
          <h3 className="project-title">{p.title}</h3>
          <p className="project-goal">{p.goal}</p>
          {p.focus && <p className="project-note" style={{ padding: "8px 22px 0" }}>for you: {p.focus}</p>}
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
