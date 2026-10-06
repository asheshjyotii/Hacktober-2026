import { describe, expect, it } from "vitest";
import { auditA, auditB, problems, validate } from "../server/validate";
import type { RepoData } from "../server/repo";

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

const goodB = () => ({
  placement: Array.from({ length: 5 }, () => ({ question: "q?", options: ["a", "b", "c", "d"], answerIndex: 1, tests: "x" })),
  projects: [1, 2, 3].map((n) => ({ n, tag: "t", title: `P${n}`, goal: "g", study: ["src/app.js"], steps: ["1", "2", "3"], checklist: ["c"], minutes: 30 })),
  rebuild: [1, 2, 3].map((n) => ({ phase: `ph${n}`, steps: [{ action: "a", check: "c", source: "src/db.js" }] })),
});

describe("audit", () => {
  it("passes clean output", () => {
    const a = auditA(goodA(), paths);
    expect(a.invalid).toEqual([]);
    expect(a.errors).toEqual([]);
    expect(a.ok).toBe(a.total);
    const b = auditB(goodB(), paths);
    expect(problems(b)).toEqual([]);
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

    const b: any = goodB();
    b.placement = b.placement.slice(0, 3);
    b.placement[0].answerIndex = 9;
    b.projects = b.projects.slice(0, 2);
    const errs = auditB(b, paths).errors.join("\n");
    expect(errs).toMatch(/exactly 5/);
    expect(errs).toMatch(/answerIndex is out of range/);
    expect(errs).toMatch(/exactly 3/);
  });
});

describe("validate", () => {
  it("drops items with bad paths and reports honest verified counts", () => {
    const a: any = goodA();
    a.readingPath[0].path = "made/up.js";
    a.components[0].paths = ["src/app.js", "made/up.js"];
    const tour = validate(a, goodB(), repo);
    expect(tour.readingPath).toHaveLength(5);
    expect(tour.readingPath.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
    expect(tour.components[0].paths).toEqual(["src/app.js"]);
    expect(tour.verified.total - tour.verified.ok).toBe(2);
    expect(tour.commit).toBe("abcdef1");
  });

  it("clamps answer indexes, renumbers projects and passes metrics and notices through", () => {
    const b: any = goodB();
    b.placement[0].answerIndex = 99;
    b.projects[0].n = 7;
    const tour = validate(goodA(), b, repo, { metrics: { preOk: 1, preTotal: 2, retries: 1, ms: 5 }, notices: ["note"] });
    expect(tour.placement[0].answerIndex).toBe(3);
    expect(tour.projects.map((p) => p.n)).toEqual([1, 2, 3]);
    expect(tour.metrics?.retries).toBe(1);
    expect(tour.notices).toEqual(["note"]);
  });

  it("omits empty notices", () => {
    expect(validate(goodA(), goodB(), repo, { notices: [] })).not.toHaveProperty("notices");
  });
});
