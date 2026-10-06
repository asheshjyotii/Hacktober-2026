import { useState } from "react";
import type { Level, Tour } from "../types";
import { levelFromScore } from "../lib/profile";

const RESULT_LINE: Record<Level, string> = {
  novice:
    "You're starting fresh. The warm-up project is yours first, and the rebuild guide explains every step.",
  intermediate:
    "You know the shapes. Skim the warm-up, start on the core work, and the guide goes deeper where it matters.",
  advanced:
    "You'd rebuild this before lunch. The blind rebuild is your starting point, and the guide reads like a checklist.",
};

export default function Placement({
  tour,
  onSubmit,
  onSkip,
}: {
  tour: Tour;
  /** One answer index per question. */
  onSubmit: (answers: number[]) => void;
  onSkip: () => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(tour.placement.map(() => null));
  const [level, setLevel] = useState<Level | null>(null);
  const answered = answers.every((a) => a !== null);

  function seeLevel() {
    const score = answers.reduce<number>((sum, a, i) => sum + (a === tour.placement[i].answerIndex ? 1 : 0), 0);
    setLevel(levelFromScore(score, tour.placement.length));
  }

  function retake() {
    setAnswers(tour.placement.map(() => null));
    setLevel(null);
  }

  return (
    <section className="stage-head" aria-label="Placement questions">
      <p className="stage-kicker">step 2 of 4</p>
      <h2 className="stage-title">Check your level</h2>
      <p className="stage-intro">
        Five questions about {tour.repo}. Answer honestly — your projects and rebuild guide are
        written from what you miss, not a score to defend.
      </p>

      <div className="q-list">
        {tour.placement.map((q, qi) => (
          <article key={q.question} className="q-card">
            <p className="q-num">question {qi + 1} of {tour.placement.length} — tests: {q.tests.toLowerCase()}</p>
            <h3 className="q-text">{q.question}</h3>
            <div className="q-options">
              {q.options.map((opt, oi) => (
                <button
                  key={opt}
                  type="button"
                  className={`option ${answers[qi] === oi ? "option-picked" : ""}`}
                  onClick={() => {
                    const next = [...answers];
                    next[qi] = oi;
                    setAnswers(next);
                  }}
                  aria-pressed={answers[qi] === oi}
                >
                  {opt}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>

      {!level && (
        <div className="placement-actions">
          <button type="button" className="btn btn-solid" disabled={!answered} onClick={seeLevel}>
            See my level
          </button>
          <span className="cta-note">{answered ? "Ready when you are." : "Answer all five to continue."}</span>
          <button type="button" className="btn btn-ghost" onClick={onSkip}>
            Skip, start from the basics
          </button>
        </div>
      )}

      {level && (
        <>
          <div className="result-panel">
            <p className="result-label">your level</p>
            <p className="result-level">{level}</p>
            <p className="result-line">{RESULT_LINE[level]}</p>
          </div>
          <div className="placement-actions">
            <button type="button" className="btn btn-solid" onClick={() => onSubmit(answers.map((a) => a ?? 0))}>
              Build my projects
            </button>
            <button type="button" className="btn btn-ghost" onClick={retake}>
              Retake the five
            </button>
          </div>
        </>
      )}
    </section>
  );
}
