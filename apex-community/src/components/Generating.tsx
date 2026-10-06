import { useEffect, useState } from "react";

const STEPS = [
  "Reading the repo tree",
  "Picking the key files",
  "Asking the model to map architecture, projects and rebuild",
  "Checking every cited path against the real tree",
];

export default function Generating({ repo }: { repo: string }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => Math.min(i + 1, STEPS.length - 1)), 9000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="gen" role="status" aria-live="polite">
      <h2 className="gen-title">Taking it apart</h2>
      <p className="gen-repo">{repo}</p>
      <ol className="gen-lines">
        {STEPS.slice(0, idx + 1).map((line, i) => (
          <li key={line} className={`gen-line ${i < idx ? "done" : "live"}`}>
            <span className="gen-mark">{i < idx ? "\u2713" : "\u2022"}</span>
            {line}
          </li>
        ))}
      </ol>
      <p className="cta-note">A fresh repo takes up to a minute. Repeat visits are instant.</p>
    </div>
  );
}
