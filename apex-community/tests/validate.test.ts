import { describe, expect, it } from "vitest";
import { auditA, auditProjects, auditQuiz, auditRebuild, problems, usablePlan, validatePlan, validateTour } from "../server/validate";
import type { RepoData } from "../server/repo";
import { skippedProfile } from "../src/lib/profile";

const paths = new Set(["README.md", "src/app.js", "src/db.js", "package.json"]);
const repo: RepoData = {
  repo: "o/r",
  branch: "main",
  commit: "abcdef1234567",
  paths,
  ranked: [...paths],
  summary: "",
  excerpts: [],
  partial: false,
  notices: [],
};

const goodA = () => ({
  overview: { summary: "A thing.", stack: ["js"], audience: "devs" },
  components: [1, 2, 3].map((n) => ({ id: `c${n}`, name: `C${n}`, role: "r", paths: ["src/app.js"] })),
  edges: [{ from: "c1", to: "c2", label: "calls" }],
  readingPath: Array.from({ length: 6 }, () => ({ order: 1, path: "README.md", why: "w" })),
  glossary: Array.from({ length: 8 }, (_, i) => ({ term: `t${i}`, plain: "p", seenIn: "src/db.js" })),
});

const goodQ = () => ({
  placement: Array.from({ length: 5 }, () => ({ question: "q?", options: ["a", "b", "c", "d"], answerIndex: 1, tests: "x", path: "src/app.js" })),
});

const goodP = () => ({
  projects: [1, 2, 3].map((n) => ({ n, tag: "t", title: `P${n}`, goal: "g", focus: "f", study: ["src/app.js"], steps: ["1", "2", "3"], checklist: ["c"], minutes: 30 })),
});

const goodR = () => ({
  rebuild: [1, 2, 3].map((n) => ({ phase: `ph${n}`, steps: [{ action: "a", check: "c", source: "src/db.js" }] })),
});

describe("audit", () => {
  it("passes clean output", () => {
    const a = auditA(goodA(), paths);
    expect(a.invalid).toEqual([]);
    expect(a.errors).toEqual([]);
    expect(a.ok).toBe(a.total);
    expect(problems(auditQuiz(goodQ(), paths))).toEqual([]);
    expect(problems(auditProjects(goodP(), paths))).toEqual([]);
    expect(problems(auditRebuild(goodR(), paths))).toEqual([]);
  });

  it("reports invented paths once each and counts them", () => {
    const a: any = goodA();
    a.components[0].paths = ["src/app.js", "src/ghost.js", "src/ghost.js"];
    a.glossary[0].seenIn = "lib/other.js";
    const au = auditA(a, paths);
    expect(au.invalid.sort()).toEqual(["lib/other.js", "src/ghost.js"]);
    expect(au.total - au.ok).toBe(3);
    expect(problems(au)[0]).toContain("src/ghost.js");
  });

  it("reports shape problems the model can fix", () => {
    const a: any = goodA();
    a.edges.push({ from: "c1", to: "nope", label: "x" });
    a.readingPath = a.readingPath.slice(0, 2);
    expect(auditA(a, paths).errors.join("\n")).toMatch(/unknown component id[\s\S]*readingPath/);

    const q: any = goodQ();
    q.placement = q.placement.slice(0, 3);
    q.placement[0].answerIndex = 9;
    const qe = auditQuiz(q, paths).errors.join("\n");
    expect(qe).toMatch(/exactly 5/);
    expect(qe).toMatch(/answerIndex is out of range/);

    const p: any = goodP();
    p.projects = p.projects.slice(0, 2);
    expect(auditProjects(p, paths).errors.join("\n")).toMatch(/exactly 3/);
  });

  it("treats an empty quiz path as absent but flags an invented one", () => {
    const q: any = goodQ();
    q.placement[0].path = "";
    q.placement[1].path = "ghost.js";
    const au = auditQuiz(q, paths);
    expect(au.invalid).toEqual(["ghost.js"]);
    expect(au.total).toBe(4);
  });
});

describe("validateTour", () => {
  it("drops items with bad paths and reports honest verified counts", () => {
    const a: any = goodA();
    a.readingPath[0].path = "made/up.js";
    a.components[0].paths = ["src/app.js", "made/up.js"];
    const tour = validateTour(a, goodQ(), repo);
    expect(tour.readingPath).toHaveLength(5);
    expect(tour.readingPath.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
    expect(tour.components[0].paths).toEqual(["src/app.js"]);
    expect(tour.verified.total - tour.verified.ok).toBe(2);
    expect(tour.commit).toBe("abcdef1");
    expect(tour).not.toHaveProperty("projects");
  });

  it("clamps answer indexes, keeps only verified quiz paths, passes metrics and notices through", () => {
    const q: any = goodQ();
    q.placement[0].answerIndex = 99;
    q.placement[1].path = "ghost.js";
    q.placement[2].path = "";
    const tour = validateTour(goodA(), q, repo, { metrics: { preOk: 1, preTotal: 2, retries: 1, ms: 5 }, notices: ["note"] });
    expect(tour.placement[0].answerIndex).toBe(3);
    expect(tour.placement[0].path).toBe("src/app.js");
    expect(tour.placement[1]).not.toHaveProperty("path");
    expect(tour.placement[2]).not.toHaveProperty("path");
    expect(tour.metrics?.retries).toBe(1);
    expect(tour.notices).toEqual(["note"]);
  });

  it("omits empty notices", () => {
    expect(validateTour(goodA(), goodQ(), repo, { notices: [] })).not.toHaveProperty("notices");
  });
});

describe("validatePlan", () => {
  const known = { repo: "o/r", commit: "abcdef1234567", paths };

  it("renumbers projects, drops invented study paths and rebuild steps, keeps the profile", () => {
    const p: any = goodP();
    p.projects[0].n = 7;
    p.projects[1].study = ["src/app.js", "ghost.js"];
    const rb: any = goodR();
    rb.rebuild[0].steps.push({ action: "x", check: "y", source: "ghost.js" });
    const plan = validatePlan(p, rb, known, skippedProfile(), { metrics: { preOk: 1, preTotal: 1, retries: 0, ms: 3 } });
    expect(plan.projects.map((x) => x.n)).toEqual([1, 2, 3]);
    expect(plan.projects[1].study).toEqual(["src/app.js"]);
    expect(plan.rebuild[0].steps).toHaveLength(1);
    expect(plan.verified.total - plan.verified.ok).toBe(2);
    expect(plan.profile.key).toBe("skip");
    expect(plan.commit).toBe("abcdef1");
    expect(plan.projects[0].focus).toBe("f");
    expect(usablePlan(plan)).toBeNull();
  });

  it("drops rebuild phases left with no verified steps and then calls the plan unusable", () => {
    const rb = { rebuild: [{ phase: "only", steps: [{ action: "a", check: "c", source: "ghost.js" }] }] };
    const plan = validatePlan(goodP(), rb, known, skippedProfile());
    expect(plan.rebuild).toEqual([]);
    expect(usablePlan(plan)).toMatch(/rebuild/);
  });
});
