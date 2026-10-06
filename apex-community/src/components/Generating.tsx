import { useEffect, useState } from "react";

const TOUR_STEPS = [
  "Reading the repo tree",
  "Picking the key files",
  "Asking the model to map the architecture and write your quiz",
  "Checking every cited path against the real tree",
];

export const PLAN_STEPS = [
  "Reading your quiz answers",
  "Opening the files you stumbled on",
  "Writing three projects at your level",
  "Writing your rebuild guide, then checking every cited path",
];

export default function Generating({
  repo,
  title = "Taking it apart",
  steps = TOUR_STEPS,
  note = "A fresh repo takes up to a minute. Repeat visits are instant.",
}: {
  repo: string;
  title?: string;
  steps?: string[];
  note?: string;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => Math.min(i + 1, steps.length - 1)), 9000);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="gen" role="status" aria-live="polite">
      <h2 className="gen-title">{title}</h2>
      <p className="gen-repo">{repo}</p>
      <ol className="gen-lines">
        {steps.slice(0, idx + 1).map((line, i) => (
          <li key={line} className={`gen-line ${i < idx ? "done" : "live"}`}>
            <span className="gen-mark">{i < idx ? "\u2713" : "\u2022"}</span>
            {line}
          </li>
        ))}
      </ol>
      <p className="cta-note">{note}</p>
    </div>
  );
}
