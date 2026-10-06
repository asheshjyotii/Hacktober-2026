import type { Plan, Profile, Tour } from "../src/types";
import type { RepoData } from "./repo";

/** The minimum needed to verify paths: a real tree for one commit. */
export type Known = Pick<RepoData, "repo" | "commit" | "paths">;

const arr = (x: any): any[] => (Array.isArray(x) ? x : []);
const str = (x: any, d = ""): string => (typeof x === "string" ? x : d);

export interface Audit {
  /** Cited paths that are not in the real tree. */
  invalid: string[];
  /** Structural problems, phrased so they can be fed back to the model. */
  errors: string[];
  ok: number;
  total: number;
}

function auditPaths(cited: unknown[], paths: Set<string>): Pick<Audit, "invalid" | "ok" | "total"> {
  const invalid = new Set<string>();
  let ok = 0;
  for (const p of cited) {
    if (typeof p === "string" && paths.has(p)) ok++;
    else invalid.add(typeof p === "string" ? p : String(p));
  }
  return { invalid: [...invalid], ok, total: cited.length };
}

export function auditA(a: any, paths: Set<string>): Audit {
  const components = arr(a?.components);
  const cited = [
    ...components.flatMap((c) => arr(c?.paths)),
    ...arr(a?.readingPath).map((s) => s?.path),
    ...arr(a?.glossary).map((g) => g?.seenIn),
  ];
  const errors: string[] = [];
  if (!str(a?.overview?.summary)) errors.push("overview.summary is missing");
  if (components.length < 3) errors.push(`components: need 3-6 items, got ${components.length}`);
  const ids = new Set(components.map((c) => str(c?.id)));
  for (const e of arr(a?.edges)) {
    if (!ids.has(str(e?.from)) || !ids.has(str(e?.to))) errors.push(`edge ${str(e?.from)} -> ${str(e?.to)} uses an unknown component id`);
  }
  if (arr(a?.readingPath).length < 6) errors.push(`readingPath: need 6-10 steps, got ${arr(a?.readingPath).length}`);
  if (arr(a?.glossary).length < 8) errors.push(`glossary: need 8-12 items, got ${arr(a?.glossary).length}`);
  return { ...auditPaths(cited, paths), errors: errors.slice(0, 12) };
}

export function auditQuiz(q: any, paths: Set<string>): Audit {
  const placement = arr(q?.placement);
  const errors: string[] = [];
  if (placement.length !== 5) errors.push(`placement: need exactly 5 questions, got ${placement.length}`);
  placement.forEach((x, i) => {
    const n = arr(x?.options).length;
    if (n < 4) errors.push(`placement[${i}] needs 4 options, got ${n}`);
    if (!Number.isInteger(x?.answerIndex) || x.answerIndex < 0 || x.answerIndex >= n) errors.push(`placement[${i}].answerIndex is out of range`);
    if (!str(x?.tests)) errors.push(`placement[${i}] has no "tests" concept`);
  });
  const cited = placement.map((x) => x?.path).filter((p) => p !== undefined && p !== "");
  return { ...auditPaths(cited, paths), errors: errors.slice(0, 12) };
}

export function auditProjects(p: any, paths: Set<string>): Audit {
  const projects = arr(p?.projects);
  const errors: string[] = [];
  if (projects.length !== 3) errors.push(`projects: need exactly 3, got ${projects.length}`);
  projects.forEach((x, i) => {
    if (!str(x?.title)) errors.push(`projects[${i}] has no title`);
    if (arr(x?.steps).length < 3) errors.push(`projects[${i}] needs 3-5 steps`);
    if (arr(x?.study).length < 1) errors.push(`projects[${i}] needs at least one study path`);
  });
  return { ...auditPaths(projects.flatMap((x) => arr(x?.study)), paths), errors: errors.slice(0, 12) };
}

export function auditRebuild(r: any, paths: Set<string>): Audit {
  const rebuild = arr(r?.rebuild);
  const errors: string[] = [];
  if (rebuild.length < 3) errors.push(`rebuild: need 3-5 phases, got ${rebuild.length}`);
  return { ...auditPaths(rebuild.flatMap((ph) => arr(ph?.steps).map((s) => s?.source)), paths), errors };
}

export function problems(au: Audit): string[] {
  return [
    ...(au.invalid.length ? [`These paths are NOT in the PATH LIST, replace or remove them: ${au.invalid.slice(0, 20).join(", ")}`] : []),
    ...au.errors,
  ];
}

/** Counts every cited path and keeps only the real ones. */
function counter(r: Known) {
  const c = { ok: 0, total: 0 };
  const check = (p: unknown): p is string => {
    c.total++;
    const good = typeof p === "string" && r.paths.has(p);
    if (good) c.ok++;
    return good;
  };
  return { c, check, checkAll: (xs: unknown): string[] => arr(xs).filter(check) as string[] };
}

export function validateTour(a: any, q: any, r: RepoData, extra: Pick<Tour, "metrics" | "notices"> = {}): Tour {
  const { c, check, checkAll } = counter(r);

  const components = arr(a?.components)
    .map((x) => ({ id: str(x?.id), name: str(x?.name), role: str(x?.role), paths: checkAll(x?.paths) }))
    .filter((x) => x.id && x.name);
  const ids = new Set(components.map((x) => x.id));
  const edges = arr(a?.edges)
    .map((e) => ({ from: str(e?.from), to: str(e?.to), label: str(e?.label) }))
    .filter((e) => ids.has(e.from) && ids.has(e.to));
  const readingPath = arr(a?.readingPath)
    .filter((s) => check(s?.path))
    .map((s, i) => ({ order: i + 1, path: str(s.path), why: str(s.why) }));
  const glossary = arr(a?.glossary)
    .filter((g) => str(g?.term) && check(g?.seenIn))
    .map((g) => ({ term: str(g.term), plain: str(g.plain), seenIn: str(g.seenIn) }));

  const placement = arr(q?.placement)
    .map((x) => {
      const options = arr(x?.options).map((o) => str(o)).filter(Boolean);
      const ai = Number.isInteger(x?.answerIndex) ? x.answerIndex : 0;
      const hasPath = x?.path !== undefined && x?.path !== "";
      const path = hasPath && check(x.path) ? str(x.path) : "";
      return {
        question: str(x?.question),
        options,
        answerIndex: Math.max(0, Math.min(options.length - 1, ai)),
        tests: str(x?.tests, "the basics"),
        ...(path ? { path } : {}),
      };
    })
    .filter((x) => x.question && x.options.length >= 2)
    .slice(0, 5);

  const tree = r.ranked.slice(0, 40).sort().map((p) => ({ path: p, depth: p.split("/").length - 1, kind: "file" as const }));
  // add parent dirs so the illustration nests properly
  const withDirs: Tour["tree"] = [];
  const seen = new Set<string>();
  for (const t of tree) {
    const parts = t.path.split("/");
    for (let d = 1; d < parts.length; d++) {
      const dir = parts.slice(0, d).join("/");
      if (!seen.has(dir)) {
        seen.add(dir);
        withDirs.push({ path: dir, depth: d - 1, kind: "dir" });
      }
    }
    withDirs.push(t);
  }

  return {
    repo: r.repo,
    branch: r.branch,
    commit: r.commit.slice(0, 7),
    fetchedAt: new Date().toISOString(),
    verified: { ok: c.ok, total: c.total },
    overview: {
      summary: str(a?.overview?.summary),
      stack: arr(a?.overview?.stack).map((s) => str(s)).filter(Boolean),
      audience: str(a?.overview?.audience),
    },
    components,
    edges,
    readingPath,
    glossary,
    placement,
    tree: withDirs,
    ...(extra.metrics ? { metrics: extra.metrics } : {}),
    ...(extra.notices?.length ? { notices: extra.notices } : {}),
  };
}

export function validatePlan(p: any, rb: any, r: Known, profile: Profile, extra: Pick<Plan, "metrics"> = {}): Plan {
  const { c, check, checkAll } = counter(r);

  const projects = arr(p?.projects)
    .slice(0, 3)
    .map((x, i) => ({
      n: i + 1,
      tag: str(x?.tag, ["warm-up", "core", "blind rebuild"][i]),
      title: str(x?.title),
      goal: str(x?.goal),
      study: checkAll(x?.study),
      steps: arr(x?.steps).map((s) => str(s)).filter(Boolean),
      checklist: arr(x?.checklist).map((s) => str(s)).filter(Boolean),
      minutes: Number.isFinite(x?.minutes) ? Math.round(x.minutes) : [30, 60, 120][i],
      ...(str(x?.focus) ? { focus: str(x.focus) } : {}),
    }));

  const rebuild = arr(rb?.rebuild)
    .map((ph) => ({
      phase: str(ph?.phase),
      steps: arr(ph?.steps)
        .filter((s) => check(s?.source))
        .map((s) => ({
          action: str(s.action),
          ...(str(s.command) ? { command: str(s.command) } : {}),
          check: str(s.check),
          source: str(s.source),
        })),
    }))
    .filter((ph) => ph.phase && ph.steps.length);

  return {
    repo: r.repo,
    commit: r.commit.slice(0, 7),
    profile,
    fetchedAt: new Date().toISOString(),
    verified: { ok: c.ok, total: c.total },
    projects,
    rebuild,
    ...(extra.metrics ? { metrics: extra.metrics } : {}),
  };
}

export function usableTour(t: Tour): string | null {
  if (t.placement.length < 3) return "Model returned too few placement questions.";
  if (!t.overview.summary || t.readingPath.length === 0) return "Model returned an incomplete overview.";
  return null;
}

export function usablePlan(p: Plan): string | null {
  if (p.projects.length < 3 || p.projects.some((x) => !x.title || x.steps.length === 0)) return "Model returned incomplete projects.";
  if (p.rebuild.length === 0) return "Model returned an empty rebuild guide.";
  return null;
}
