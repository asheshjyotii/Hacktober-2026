import type { Tour } from "../src/types";
import type { RepoData } from "./repo";

const arr = (x: any): any[] => (Array.isArray(x) ? x : []);
const str = (x: any, d = ""): string => (typeof x === "string" ? x : d);

export function validate(a: any, b: any, r: RepoData): Tour {
  let ok = 0;
  let total = 0;
  const check = (p: unknown): p is string => {
    total++;
    const good = typeof p === "string" && r.paths.has(p);
    if (good) ok++;
    return good;
  };
  const checkAll = (xs: unknown): string[] => arr(xs).filter(check) as string[];

  const components = arr(a?.components)
    .map((c) => ({ id: str(c?.id), name: str(c?.name), role: str(c?.role), paths: checkAll(c?.paths) }))
    .filter((c) => c.id && c.name);
  const ids = new Set(components.map((c) => c.id));
  const edges = arr(a?.edges)
    .map((e) => ({ from: str(e?.from), to: str(e?.to), label: str(e?.label) }))
    .filter((e) => ids.has(e.from) && ids.has(e.to));

  const readingPath = arr(a?.readingPath)
    .filter((s) => check(s?.path))
    .map((s, i) => ({ order: i + 1, path: str(s.path), why: str(s.why) }));
  const glossary = arr(a?.glossary)
    .filter((g) => str(g?.term) && check(g?.seenIn))
    .map((g) => ({ term: str(g.term), plain: str(g.plain), seenIn: str(g.seenIn) }));

  const placement = arr(b?.placement)
    .map((q) => {
      const options = arr(q?.options).map((o) => str(o)).filter(Boolean);
      const ai = Number.isInteger(q?.answerIndex) ? q.answerIndex : 0;
      return {
        question: str(q?.question),
        options,
        answerIndex: Math.max(0, Math.min(options.length - 1, ai)),
        tests: str(q?.tests, "the basics"),
      };
    })
    .filter((q) => q.question && q.options.length >= 2)
    .slice(0, 5);

  const projects = arr(b?.projects)
    .slice(0, 3)
    .map((p, i) => ({
      n: i + 1,
      tag: str(p?.tag, ["warm-up", "core", "blind rebuild"][i]),
      title: str(p?.title),
      goal: str(p?.goal),
      study: checkAll(p?.study),
      steps: arr(p?.steps).map((s) => str(s)).filter(Boolean),
      checklist: arr(p?.checklist).map((s) => str(s)).filter(Boolean),
      minutes: Number.isFinite(p?.minutes) ? Math.round(p.minutes) : [30, 60, 120][i],
    }));

  const rebuild = arr(b?.rebuild)
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

  const tree = r.ranked.slice(0, 40).sort().map((p) => ({
    path: p,
    depth: p.split("/").length - 1,
    kind: "file" as const,
  }));
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
    verified: { ok, total },
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
    projects,
    rebuild,
    tree: withDirs,
  };
}

/** Throws-worthy if the model gave us nothing usable. */
export function usable(t: Tour): string | null {
  if (t.placement.length < 3) return "Model returned too few placement questions.";
  if (t.projects.length < 3 || t.projects.some((p) => !p.title)) return "Model returned incomplete projects.";
  if (!t.overview.summary || t.readingPath.length === 0) return "Model returned an incomplete overview.";
  return null;
}
