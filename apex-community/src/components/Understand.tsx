import type { Tour } from "../types";
import { blobUrl } from "../lib/github";
import Verified from "./Verified";

export default function Understand({
  tour,
  onNext,
}: {
  tour: Tour;
  onNext: () => void;
}) {
  const nameOf = (id: string) => tour.components.find((c) => c.id === id)?.name ?? id;

  return (
    <section className="stage-head" aria-label="Understand the repository">
      <p className="stage-kicker">step 1 of 4</p>
      <h2 className="stage-title">How {tour.repo} works</h2>
      <p className="stage-intro">{tour.overview.summary}</p>

      <div className="section">
        <div className="section-rule">
          <span className="section-name">The stack</span>
          <span className="section-note">read from manifests, not guessed</span>
        </div>
        <div className="stack-chips">
          {tour.overview.stack.map((s) => (
            <span key={s} className="stack-chip">
              {s}
            </span>
          ))}
        </div>
        <p className="audience">Built for: {tour.overview.audience}</p>
      </div>

      <div className="section">
        <div className="section-rule">
          <span className="section-name">Start here</span>
          <span className="section-note">
            <Verified ok={tour.verified.ok} total={tour.verified.total} />
          </span>
        </div>
        <ol className="path-list">
          {tour.readingPath.map((step) => (
            <li key={step.path} className="path-item">
              <span className="path-num">{String(step.order).padStart(2, "0")}</span>
              <div className="path-main">
                <a className="path-link" href={blobUrl(tour.repo, tour.branch, step.path)} target="_blank" rel="noreferrer">
                  {step.path}
                </a>
                <p className="path-why">{step.why}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="section">
        <div className="section-rule">
          <span className="section-name">How it fits together</span>
          <span className="section-note">{tour.components.length} parts, {tour.edges.length} connections</span>
        </div>
        <div className="comp-grid">
          {tour.components.map((c) => (
            <article key={c.id} className="comp">
              <h3 className="comp-name">{c.name}</h3>
              <p className="comp-role">{c.role}</p>
              <div className="comp-paths">
                {c.paths.map((p) => (
                  <a key={p} className="comp-path" href={blobUrl(tour.repo, tour.branch, p)} target="_blank" rel="noreferrer">
                    {p}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
        <ul className="wiring">
          {tour.edges.map((e) => (
            <li key={`${e.from}-${e.to}`} className="wiring-line">
              <span className="wiring-a">{nameOf(e.from)}</span>
              <span className="wiring-arrow">──</span>
              <span className="wiring-label">{e.label}</span>
              <span className="wiring-arrow">──▶</span>
              <span className="wiring-b">{nameOf(e.to)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="section">
        <div className="section-rule">
          <span className="section-name">Words you'll see</span>
          <span className="section-note">from this repo's own files</span>
        </div>
        <div className="glossary-grid">
          {tour.glossary.map((g) => (
            <article key={g.term} className="gloss">
              <h3 className="gloss-term">{g.term}</h3>
              <p className="gloss-plain">{g.plain}</p>
              <p className="gloss-seen">
                <span className="seen-label">seen in </span>
                <a href={blobUrl(tour.repo, tour.branch, g.seenIn)} target="_blank" rel="noreferrer">
                  {g.seenIn}
                </a>
              </p>
            </article>
          ))}
        </div>
      </div>

      <div className="stage-cta">
        <button type="button" className="btn btn-solid" onClick={onNext}>
          Check my level
        </button>
        <span className="cta-note">Five questions. Your answers tune the projects below.</span>
      </div>
    </section>
  );
}
