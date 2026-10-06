import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/model", () => ({ generateJSON: vi.fn() }));

import { generateJSON } from "../server/model";
import { compactTour, generate, generatePlan, learnerBlock, repairPrompt } from "../server/generate";
import type { RepoData } from "../server/repo";

const paths = new Set(["README.md", "src/app.js"]);
const repo: RepoData = { repo: "o/r", branch: "main", commit: "abc1234", paths, ranked: [...paths], summary: "", excerpts: [], partial: false, notices: [] };
const env = { provider: "openrouter", apiKey: "k", model: "m" } as const;

const a = (path: string) => ({
  overview: { summary: "s", stack: [], audience: "a" },
  components: [1, 2, 3].map((n) => ({ id: `c${n}`, name: "n", role: "r", paths: [path] })),
  edges: [],
  readingPath: Array.from({ length: 6 }, () => ({ order: 1, path, why: "w" })),
  glossary: Array.from({ length: 8 }, () => ({ term: "t", plain: "p", seenIn: path })),
});
const quiz = (path: string) => ({
  placement: Array.from({ length: 5 }, () => ({ question: "q", options: ["a", "b", "c", "d"], answerIndex: 0, tests: "t", path })),
});
const plan = (path: string) => ({
  projects: [1, 2, 3].map((n) => ({ n, tag: "t", title: "T", goal: "g", study: [path], steps: ["1", "2", "3"], checklist: [], minutes: 1 })),
  rebuild: [1, 2, 3].map((n) => ({ phase: `p${n}`, steps: [{ action: "a", check: "c", source: path }] })),
});

const mock = vi.mocked(generateJSON);
beforeEach(() => {
  mock.mockReset();
});

describe("generate", () => {
  it("does not retry clean answers", async () => {
    mock.mockImplementation(async (...x: unknown[]) => (String(x[1]).includes("placement quiz") ? quiz("src/app.js") : a("README.md")));
    const r = await generate(env, repo);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(r.metrics.retries).toBe(0);
    expect(r.metrics.preOk).toBe(r.metrics.preTotal);
  });

  it("retries once with the concrete problems and keeps the better answer", async () => {
    let aCalls = 0;
    mock.mockImplementation(async (...x: unknown[]) => {
      const prompt = String(x[1]);
      if (prompt.includes("placement quiz")) return quiz("src/app.js");
      aCalls++;
      return prompt.includes("PREVIOUS ANSWER HAD THESE PROBLEMS") ? a("README.md") : a("ghost/file.js");
    });
    const r = await generate(env, repo);
    expect(aCalls).toBe(2);
    expect(r.metrics.retries).toBe(1);
    expect(r.metrics.preOk).toBeLessThan(r.metrics.preTotal);
    expect(r.a.components[0].paths).toEqual(["README.md"]);
    const retryPrompt = String(mock.mock.calls.find((c) => String(c[1]).includes("THESE PROBLEMS"))?.[1]);
    expect(retryPrompt).toContain("ghost/file.js");
  });

  it("keeps the first answer when the retry is no better or fails", async () => {
    mock.mockImplementation(async (...x: unknown[]) => {
      const prompt = String(x[1]);
      if (prompt.includes("placement quiz")) return quiz("src/app.js");
      if (prompt.includes("THESE PROBLEMS")) throw new Error("boom");
      return a("ghost/file.js");
    });
    const r = await generate(env, repo);
    expect(r.metrics.retries).toBe(1);
    expect(r.a.components[0].paths).toEqual(["ghost/file.js"]);
  });
});

const profile = {
  level: "novice" as const,
  skipped: false,
  score: 1,
  total: 5,
  missed: [{ tests: "request lifecycle", path: "src/app.js" }],
  known: ["config loading"],
  key: "novice-10111",
};
const tour: any = {
  repo: "o/r",
  overview: { summary: "sum", stack: ["js"], audience: "a" },
  components: [{ id: "c", name: "Core", role: "r", paths: ["src/app.js"] }],
  edges: [],
  readingPath: [{ order: 1, path: "README.md", why: "start" }],
  glossary: [{ term: "t", plain: "p", seenIn: "README.md" }],
};
const input = { tour, paths: ["README.md", "src/app.js"], profile, excerpts: [{ path: "src/app.js", text: "const x = 1;" }] };

describe("generatePlan", () => {
  it("builds both calls around what the learner missed and knows, at their level", async () => {
    mock.mockImplementation(async (...x: unknown[]) => (String(x[1]).includes("three projects") ? plan("src/app.js") : { rebuild: plan("src/app.js").rebuild }));
    const r = await generatePlan(env, input);
    expect(mock).toHaveBeenCalledTimes(2);
    for (const c of mock.mock.calls) {
      const prompt = String(c[1]);
      expect(prompt).toContain("request lifecycle (file: src/app.js)");
      expect(prompt).toContain("config loading");
      expect(prompt).toContain("LEVEL GUIDANCE (novice)");
      expect(prompt).toContain("=== FILE: src/app.js ===");
      expect(prompt).toContain("personalised learning plan");
    }
    expect(r.metrics.retries).toBe(0);
    expect(r.p.projects).toHaveLength(3);
    expect(r.rb.rebuild.length).toBeGreaterThan(0);
  });

  it("repairs invented study paths with one retry", async () => {
    let calls = 0;
    mock.mockImplementation(async (...x: unknown[]) => {
      const prompt = String(x[1]);
      if (!prompt.includes("three projects")) return { rebuild: plan("src/app.js").rebuild };
      calls++;
      return plan(prompt.includes("THESE PROBLEMS") ? "src/app.js" : "ghost.js");
    });
    const r = await generatePlan(env, input);
    expect(calls).toBe(2);
    expect(r.metrics.retries).toBe(1);
    expect(r.p.projects[0].study).toEqual(["src/app.js"]);
  });
});

describe("learnerBlock", () => {
  it("treats a skipped quiz as new to the repo", () => {
    const text = learnerBlock({ level: "novice", skipped: true, score: 0, total: 0, missed: [], known: [], key: "skip" }, { novice: "N", intermediate: "I", advanced: "A" });
    expect(text).toContain("skipped the placement quiz");
    expect(text).not.toContain("quiz score");
    expect(text).toContain("LEVEL GUIDANCE (novice): N");
  });
});

describe("compactTour", () => {
  it("stays under its cap", () => {
    const big = { ...tour, glossary: Array.from({ length: 500 }, (_, i) => ({ term: `t${i}`, plain: "x".repeat(50), seenIn: "a" })) };
    expect(compactTour(big).length).toBeLessThanOrEqual(5000);
  });
});

describe("repairPrompt", () => {
  it("lists every problem after the original prompt", () => {
    const p = repairPrompt("ORIGINAL", ["one", "two"]);
    expect(p.startsWith("ORIGINAL")).toBe(true);
    expect(p).toContain("- one\n- two");
  });
});
