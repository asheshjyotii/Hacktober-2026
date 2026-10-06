import { useState } from "react";
import type { Plan, Tour } from "../types";
import { blobUrl } from "../lib/github";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function Rebuild({ tour, plan, onRestart }: { tour: Tour; plan: Plan; onRestart: () => void }) {
  return (
    <section className="stage-head" aria-label="Rebuild guide">
      <p className="stage-kicker">step 4 of 4</p>
      <h2 className="stage-title">Rebuild {tour.repo}, end to end</h2>
      <p className="stage-intro">
        Every step cites the file it comes from in the original repo. Build it, check it, move on.
      </p>

      {plan.rebuild.map((phase, pi) => (
        <div key={phase.phase} className="rebuild-phase">
          <h3 className="phase-name">{phase.phase}</h3>
          <ol className="step-list">
            {phase.steps.map((step, si) => (
              <li key={step.action} className="step">
                <div className="step-head">
                  <span className="step-num">
                    {pi + 1}.{si + 1}
                  </span>
                  <span className="step-action">{step.action}</span>
                </div>
                {step.command && (
                  <div className="cmd-block">
                    {step.command}
                    <CopyButton text={step.command} />
                  </div>
                )}
                <p className="step-check">
                  <b>done when:</b> {step.check}
                </p>
                <p className="step-source">
                  <span className="src-label">source: </span>
                  <a href={blobUrl(tour.repo, tour.branch, step.source)} target="_blank" rel="noreferrer">
                    {step.source}
                  </a>
                </p>
              </li>
            ))}
          </ol>
        </div>
      ))}

      <div className="rebuild-final">
        <h3 className="phase-name">That's the whole thing.</h3>
        <p>
          You started with a repository and no idea where to begin. You end with your own version,
          {plan.rebuild.reduce((n, p) => n + p.steps.length, 0)} steps you can explain, and the habit of reading a repository the same way every time.
        </p>
        <button type="button" className="btn btn-ghost" onClick={onRestart}>
          Deconstruct another repository
        </button>
      </div>
    </section>
  );
}
