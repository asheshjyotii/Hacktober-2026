import { AppError } from "./errors";
import { generatePlan } from "./generate";
import type { ModelEnv } from "./model";
import { fetchRaw } from "./repo";
import { loadMeta, loadPlan, loadTour, savePlan } from "./cache";
import { usablePlan, validatePlan } from "./validate";
import { buildProfile, skippedProfile } from "../src/lib/profile";
import type { Plan } from "../src/types";

export interface PlanRequest {
  repo: string;
  commit: string;
  /** One answer index per quiz question, or null when the learner skipped the quiz. */
  answers: unknown;
}

const EXCERPTS = 3;
const EXCERPT_LINES = 90;
const EXCERPT_CHARS = 2200;

const inflight = new Map<string, Promise<Plan>>();

/** Files worth showing the model: where the learner stumbled first, then the reading path. */
function excerptPaths(missed: { path?: string }[], reading: string[]): string[] {
  const out: string[] = [];
  for (const p of [...missed.map((m) => m.path ?? ""), ...reading]) {
    if (p && !out.includes(p) && !/readme/i.test(p)) out.push(p);
  }
  return out.slice(0, EXCERPTS);
}

export async function getPlan(env: ModelEnv, req: PlanRequest): Promise<Plan> {
  const repo = String(req.repo ?? "");
  const sha = String(req.commit ?? "");
  const meta = loadMeta(repo, sha);
  const tour = loadTour(repo, sha);
  if (!meta || !tour) {
    throw new AppError("not_found", "This tour is no longer cached on the server. Go back and generate it again.");
  }

  const profile = req.answers === null ? skippedProfile() : buildProfile(tour.placement, req.answers);
  if (!profile) throw new AppError("invalid", "Those quiz answers do not match the quiz.");

  const hit = loadPlan(repo, sha, profile.key);
  if (hit) return hit;

  const k = `${repo}@${sha.slice(0, 7)}#${profile.key}`.toLowerCase();
  const pending = inflight.get(k);
  if (pending) return pending;

  const p = (async () => {
    const wanted = excerptPaths(profile.missed, tour.readingPath.map((s) => s.path));
    const excerpts = (await Promise.all(wanted.map((x) => fetchRaw(meta.repo, meta.commit, x, EXCERPT_LINES, EXCERPT_CHARS)))).filter(
      (e): e is { path: string; text: string } => !!e,
    );
    const { p: projects, rb, metrics } = await generatePlan(env, { tour, paths: meta.ranked, profile, excerpts });
    const plan = validatePlan(projects, rb, { repo: meta.repo, commit: meta.commit, paths: new Set(meta.ranked) }, profile, { metrics });
    const bad = usablePlan(plan);
    if (bad) throw new AppError("model", bad);
    savePlan(meta.repo, meta.commit, plan);
    return plan;
  })();
  inflight.set(k, p);
  try {
    return await p;
  } finally {
    inflight.delete(k);
  }
}
