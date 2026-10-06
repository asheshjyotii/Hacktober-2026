import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/model", () => ({ generateJSON: vi.fn() }));

import { generateJSON } from "../server/model";
import { generate, repairPrompt } from "../server/generate";
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
const b = (path: string) => ({
  placement: Array.from({ length: 5 }, () => ({ question: "q", options: ["a", "b", "c", "d"], answerIndex: 0, tests: "t" })),
  projects: [1, 2, 3].map((n) => ({ n, tag: "t", title: "T", goal: "g", study: [path], steps: ["1", "2", "3"], checklist: [], minutes: 1 })),
  rebuild: [1, 2, 3].map((n) => ({ phase: `p${n}`, steps: [{ action: "a", check: "c", source: path }] })),
});

const mock = vi.mocked(generateJSON);
beforeEach(() => {
  mock.mockReset();
});

describe("generate", () => {
  it("does not retry clean answers", async () => {
    mock.mockImplementation(async (...x: unknown[]) => (String(x[1]).includes("placement quiz") ? b("src/app.js") : a("README.md")));
    const r = await generate(env, repo);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(r.metrics.retries).toBe(0);
    expect(r.metrics.preOk).toBe(r.metrics.preTotal);
  });

  it("retries once with the concrete problems and keeps the better answer", async () => {
    let aCalls = 0;
    mock.mockImplementation(async (...x: unknown[]) => {
      const prompt = String(x[1]);
      if (prompt.includes("placement quiz")) return b("src/app.js");
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
      if (prompt.includes("placement quiz")) return b("src/app.js");
      if (prompt.includes("THESE PROBLEMS")) throw new Error("boom");
      return a("ghost/file.js");
    });
    const r = await generate(env, repo);
    expect(r.metrics.retries).toBe(1);
    expect(r.a.components[0].paths).toEqual(["ghost/file.js"]);
  });
});

describe("repairPrompt", () => {
  it("lists every problem after the original prompt", () => {
    const p = repairPrompt("ORIGINAL", ["one", "two"]);
    expect(p.startsWith("ORIGINAL")).toBe(true);
    expect(p).toContain("- one\n- two");
  });
});
