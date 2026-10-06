import Generating, { PLAN_STEPS } from "./Generating";

export interface PlanState {
  status: "idle" | "loading" | "error";
  error?: { kind: string; message: string };
}

/** Shown in place of projects / rebuild until the learner's plan exists. */
export default function PlanGate({
  repo,
  state,
  onQuiz,
  onSkip,
  onRetry,
}: {
  repo: string;
  state: PlanState;
  onQuiz: () => void;
  onSkip: () => void;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <Generating
        repo={repo}
        title="Writing your plan"
        steps={PLAN_STEPS}
        note="Written for you, so this takes a moment. The same answers next time are instant."
      />
    );
  }
  if (state.status === "error") {
    return (
      <div className="err-panel" role="alert">
        <h2 className="gen-title">Couldn't write your plan</h2>
        <p>{state.error?.message}</p>
        <div className="err-actions">
          <button type="button" className="btn btn-solid" onClick={onRetry}>
            Try again
          </button>
          <button type="button" className="btn" onClick={onQuiz}>
            Back to the quiz
          </button>
        </div>
      </div>
    );
  }
  return (
    <section className="stage-head" aria-label="Plan needed">
      <h2 className="stage-title">Your plan is written for you</h2>
      <p className="stage-intro">
        The three projects and the rebuild guide are built from what you know about {repo} and what
        you don't. Take the five-question check, or skip it and start from the basics.
      </p>
      <div className="placement-actions">
        <button type="button" className="btn btn-solid" onClick={onQuiz}>
          Take the five questions
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSkip}>
          Skip, start from the basics
        </button>
      </div>
    </section>
  );
}
