import type { Plan, Stage, Tour } from "../types";
import Verified from "./Verified";

const STAGES: Stage[] = ["understand", "placement", "projects", "rebuild"];

const NODES: { stage: Stage; name: string; sub: string }[] = [
  { stage: "understand", name: "Understand", sub: "What it is, how it fits together" },
  { stage: "placement", name: "Check your level", sub: "Five questions, five answers" },
  { stage: "projects", name: "Three projects", sub: "Written from your answers" },
  { stage: "rebuild", name: "Rebuild guide", sub: "End to end, from an empty folder" },
];

export default function Trail({
  stage,
  tour,
  plan,
  onPick,
}: {
  stage: Stage;
  tour: Tour;
  plan: Plan | null;
  onPick: (s: Stage) => void;
}) {
  const current = STAGES.indexOf(stage);

  return (
    <>
      <aside className="rail">
        <div className="rail-title">the trail</div>
        <ol className="rail-list">
          {NODES.map((node, i) => {
            const state = i < current ? "done" : i === current ? "current" : "next";
            return (
              <li key={node.stage}>
                <button
                  type="button"
                  className={[
                    "rail-node",
                    state === "done" ? "rail-node-done" : "",
                    state === "current" ? "rail-node-current" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onPick(node.stage)}
                  aria-current={state === "current" ? "step" : undefined}
                >
                  <span className="rail-dot" aria-hidden="true" />
                  <span className="rail-name">{node.name}</span>
                  <span className="rail-sub">{node.sub}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="rail-meta">
          <span>
            repo <b>{tour.repo}</b>
          </span>
          <span>
            {tour.branch} @ {tour.commit}
          </span>
          <Verified ok={tour.verified.ok + (plan?.verified.ok ?? 0)} total={tour.verified.total + (plan?.verified.total ?? 0)} />
        </div>
      </aside>
      <p className="crumb">
        step {current + 1} of {STAGES.length} — <b>{NODES[current].name}</b>
      </p>
    </>
  );
}
