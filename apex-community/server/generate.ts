import { generateJSON, type ModelEnv } from "./model";
import { SCHEMA_A, SCHEMA_P, SCHEMA_Q, SCHEMA_R, type JsonSchema } from "./schema";
import { auditA, auditProjects, auditQuiz, auditRebuild, problems, type Audit } from "./validate";
import type { Level, Profile, Tour, TourMetrics } from "../src/types";
import { buildContext, type RepoData } from "./repo";

const RULES = `HARD RULES:
- Output ONE JSON object and nothing else. No markdown fences, no commentary.
- Every file path you output MUST be copied verbatim from the PATH LIST. Never invent or guess a path. Never output a directory as a path.
- Be specific to THIS repository. Plain language, no hype. Write for someone who just opened the repo.
- Keep strings short (under 200 characters each).`;

const SHAPE_A = `{
  "overview": { "summary": "2-3 sentences: what this project is and does", "stack": ["languages/frameworks"], "audience": "who uses it" },
  "components": [ { "id": "short-kebab-id", "name": "Name", "role": "one sentence", "paths": ["PATH from list"] } ],   // 3-6 items
  "edges": [ { "from": "component id", "to": "component id", "label": "how they connect" } ],                        // 2-8 items, ids must exist in components
  "readingPath": [ { "order": 1, "path": "PATH from list", "why": "why read this at this point" } ],                 // 6-10 steps, start with README if it exists, then entry points, then deeper
  "glossary": [ { "term": "project-specific term", "plain": "plain-English meaning", "seenIn": "PATH from list" } ]    // 8-12 items
}`;

const SHAPE_Q = `{
  "placement": [ { "question": "...", "options": ["A","B","C","D"], "answerIndex": 0, "tests": "the idea tested, e.g. 'request lifecycle'", "path": "PATH from list where that idea lives" } ]  // EXACTLY 5 questions, 4 options each, answerIndex 0-3, vary the position of the right answer, about this repo's concepts, easy to hard. Each question tests a DIFFERENT idea. "path" is the one file a learner should open to learn it.
}`;

const SHAPE_P = `{
  "projects": [
    { "n": 1, "tag": "warm-up", "title": "...", "goal": "one sentence", "focus": "why this suits THIS learner, naming the idea(s) it targets", "study": ["PATH from list"], "steps": ["do this..."], "checklist": ["done when..."], "minutes": 30 },
    { "n": 2, "tag": "core", "title": "...", "goal": "...", "focus": "...", "study": ["PATH"], "steps": ["..."], "checklist": ["..."], "minutes": 60 },
    { "n": 3, "tag": "blind rebuild", "title": "...", "goal": "rebuild the core of the repo from memory without looking at the source", "focus": "...", "study": ["PATH"], "steps": ["..."], "checklist": ["..."], "minutes": 120 }
  ]  // EXACTLY 3 projects in that order, getting harder each time. Each is a small project the learner builds or changes themselves. 2-4 study paths each.
}`;

const SHAPE_R = `{
  "rebuild": [ { "phase": "Phase name", "steps": [ { "action": "what to do", "command": "optional shell command", "check": "how to verify it worked", "source": "PATH from list that this step mirrors" } ] } ]  // recreate the repo's core from an empty folder, in order
}`;

export type LevelGuide = Record<Level, string>;

const PROJECT_GUIDE: LevelGuide = {
  novice:
    "Keep scope small. Warm-up ~20-30 min: one tiny change. Core ~45-60 min. Blind rebuild is the smallest working core only, ~90 min. Each project has 4-5 steps, each concrete, saying where to look. Explain any term the learner may not know.",
  intermediate:
    "Warm-up is a quick ~15 min skim-and-tweak. Core is a meaningful feature or change, ~60 min. Blind rebuild is the full core, ~120 min. 3-4 steps per project with fewer hints.",
  advanced:
    "Be terse. Warm-up and core are short, ~15-30 min, aimed at the trickiest parts of the repo. Blind rebuild is the full core including edge cases, ~150-180 min. 3 steps per project, written as goals, not instructions.",
};

const REBUILD_GUIDE: LevelGuide = {
  novice: "4-5 phases, 3-4 steps each, building only the smallest working core. Every step says what to type or create and how to check it.",
  intermediate: "3-5 phases, 2-4 steps each, covering the full core of the repo.",
  advanced: "3 phases, 2-3 steps each, written as goals. Include the edge cases and the parts that are easy to get wrong.",
};

export function prompt(task: string, shape: string, context: string): string {
  return `You are analysing a GitHub repository to build a learning tour for a newcomer.\n\n${RULES}\n\nTASK: ${task}\n\nOUTPUT SHAPE (comments after // are instructions, do not output them):\n${shape}\n\n${context}\n\nNow output the JSON object.`;
}

export function repairPrompt(original: string, list: string[]): string {
  return `${original}\n\nYOUR PREVIOUS ANSWER HAD THESE PROBLEMS:\n${list.map((p) => `- ${p}`).join("\n")}\n\nOutput the COMPLETE corrected JSON object again. Copy paths only from the PATH LIST.`;
}

const score = (au: Audit) => au.invalid.length + au.errors.length;

interface Pass {
  data: any;
  first: Audit;
  last: Audit;
  retries: number;
}

/** Generate, audit, and retry once with the concrete problems before giving up. */
async function pass(
  env: ModelEnv,
  text: string,
  schema: JsonSchema,
  name: string,
  audit: (d: any) => Audit,
): Promise<Pass> {
  const data = await generateJSON(env, text, { schema, schemaName: name });
  const first = audit(data);
  const list = problems(first);
  if (!list.length) return { data, first, last: first, retries: 0 };
  console.warn(`[generate] ${name}: ${list.length} problem(s), retrying once`);
  try {
    const again = await generateJSON(env, repairPrompt(text, list), { schema, schemaName: name });
    const second = audit(again);
    // only keep the retry if it is actually better
    if (score(second) < score(first)) return { data: again, first, last: second, retries: 1 };
  } catch (e) {
    console.warn(`[generate] ${name}: retry failed (${e instanceof Error ? e.message : e}), keeping first answer`);
  }
  return { data, first, last: first, retries: 1 };
}

function metricsOf(passes: Pass[], t0: number): TourMetrics {
  return {
    preOk: passes.reduce((n, x) => n + x.first.ok, 0),
    preTotal: passes.reduce((n, x) => n + x.first.total, 0),
    retries: passes.reduce((n, x) => n + x.retries, 0),
    ms: Date.now() - t0,
  };
}

/** The base tour and the placement quiz, in parallel. Projects come later, once we know the learner. */
export async function generate(env: ModelEnv, r: RepoData): Promise<{ a: any; q: any; metrics: TourMetrics }> {
  const t0 = Date.now();
  const [a, q] = await Promise.all([
    pass(env, prompt("Explain the architecture, reading order and vocabulary.", SHAPE_A, buildContext(r, { maxPaths: 200, files: 5, chars: 2600 })), SCHEMA_A, "tour_a", (d) => auditA(d, r.paths)),
    pass(env, prompt("Write the placement quiz that tests whether a learner understands this repo.", SHAPE_Q, buildContext(r, { maxPaths: 150, files: 3, chars: 2000 })), SCHEMA_Q, "tour_quiz", (d) => auditQuiz(d, r.paths)),
  ]);
  return { a: a.data, q: q.data, metrics: metricsOf([a, q], t0) };
}

/** What the plan prompts need to know about the learner. */
export function learnerBlock(profile: Profile, guide: LevelGuide): string {
  const lines: string[] = ["LEARNER PROFILE:"];
  if (profile.skipped) {
    lines.push("- They skipped the placement quiz. Treat them as new to this repo: start from the basics.");
  } else {
    lines.push(`- Level: ${profile.level} (quiz score ${profile.score}/${profile.total}).`);
    if (profile.missed.length) {
      lines.push("- They MISSED these ideas. Build the work around them and point `study` at the file shown:");
      for (const m of profile.missed) lines.push(`  * ${m.tests}${m.path ? ` (file: ${m.path})` : ""}`);
    }
    if (profile.known.length) lines.push(`- They already KNOW: ${profile.known.join("; ")}. Do not re-teach these.`);
  }
  lines.push(`LEVEL GUIDANCE (${profile.level}): ${guide[profile.level]}`);
  return lines.join("\n");
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A short summary of the tour, enough to ground plan prompts without blowing the token budget. */
export function compactTour(t: Tour): string {
  return clip(
    [
      `SUMMARY: ${t.overview.summary}`,
      `STACK: ${t.overview.stack.join(", ")}`,
      "COMPONENTS:",
      ...t.components.map((c) => `- ${c.name}: ${c.role} [${c.paths.join(", ")}]`),
      "CONNECTIONS:",
      ...t.edges.map((e) => `- ${e.from} -> ${e.to}: ${e.label}`),
      "READING PATH:",
      ...t.readingPath.map((s) => `${s.order}. ${s.path}: ${s.why}`),
      "GLOSSARY:",
      ...t.glossary.map((g) => `- ${g.term}: ${g.plain}`),
    ].join("\n"),
    5000,
  );
}

export interface PlanInput {
  tour: Tour;
  /** Verified tree for this commit (ranked, most important first). */
  paths: string[];
  profile: Profile;
  excerpts: { path: string; text: string }[];
}

function planContext(i: PlanInput): string {
  return [
    `REPO: ${i.tour.repo}`,
    `TOUR NOTES:\n${compactTour(i.tour)}`,
    `PATH LIST (${Math.min(150, i.paths.length)} of ${i.paths.length} files, most important first):\n${i.paths.slice(0, 150).join("\n")}`,
    `FILE EXCERPTS:\n${i.excerpts.map((e) => `=== FILE: ${e.path} ===\n${e.text}`).join("\n\n")}`,
  ].join("\n\n");
}

const PLAN_INTRO = "You are a mentor writing a personalised learning plan for a developer studying this GitHub repository.";

function planPrompt(task: string, shape: string, i: PlanInput, guide: LevelGuide): string {
  return prompt(task, shape, `${learnerBlock(i.profile, guide)}\n\n${planContext(i)}`).replace(
    "You are analysing a GitHub repository to build a learning tour for a newcomer.",
    PLAN_INTRO,
  );
}

/** The three projects and the rebuild guide for one learner, in parallel. */
export async function generatePlan(env: ModelEnv, i: PlanInput): Promise<{ p: any; rb: any; metrics: TourMetrics }> {
  const t0 = Date.now();
  const paths = new Set(i.paths);
  const [p, rb] = await Promise.all([
    pass(env, planPrompt("Write three projects for this learner, each harder than the last.", SHAPE_P, i, PROJECT_GUIDE), SCHEMA_P, "plan_projects", (d) => auditProjects(d, paths)),
    pass(env, planPrompt("Write the step-by-step guide to rebuild the core of this repo from an empty folder.", SHAPE_R, i, REBUILD_GUIDE), SCHEMA_R, "plan_rebuild", (d) => auditRebuild(d, paths)),
  ]);
  return { p: p.data, rb: rb.data, metrics: metricsOf([p, rb], t0) };
}
