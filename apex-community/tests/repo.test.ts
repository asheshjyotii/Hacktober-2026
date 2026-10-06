import { describe, expect, it } from "vitest";
import { importedPaths, parseRepo, rankPaths, rateLimitMessage, retryAfterSeconds, score } from "../server/repo";
import { AppError } from "../server/errors";

describe("parseRepo", () => {
  it.each([
    ["expressjs/express", "expressjs/express"],
    ["https://github.com/pallets/click", "pallets/click"],
    ["https://www.github.com/pallets/click/tree/main/src", "pallets/click"],
    ["github.com/sirupsen/logrus.git", "sirupsen/logrus"],
    ["  psf/requests/  ", "psf/requests"],
  ])("normalises %s", (input, want) => {
    expect(parseRepo(input)).toBe(want);
  });

  it.each(["", "justaname", "a b/c", "https://example.com/x/y z"])("rejects %j", (input) => {
    expect(() => parseRepo(input)).toThrow(AppError);
  });
});

describe("ranking", () => {
  it("puts README, manifests and entry points before everything else", () => {
    const ranked = rankPaths(["lib/util/deep/helper.js", "tests/a.test.js", "index.js", "package.json", "README.md", "docs/x.md"]);
    expect(ranked.slice(0, 3)).toEqual(["README.md", "package.json", "index.js"]);
    expect(ranked.indexOf("lib/util/deep/helper.js")).toBeLessThan(ranked.indexOf("tests/a.test.js"));
  });

  it("recognises per-language entry points and test files", () => {
    expect(score("cmd/tool/main.go")).toBeLessThan(score("internal/x/y.go"));
    expect(score("src/main.rs")).toBeLessThan(score("src/other.rs"));
    expect(score("pkg/foo_test.go")).toBeGreaterThan(score("pkg/foo.go"));
    expect(score("tests/test_core.py")).toBeGreaterThan(score("src/pkg/core.py"));
    expect(score("src/pkg/cli.py")).toBeLessThan(score("src/pkg/other.py"));
  });

  it("boosts files imported by entry points", () => {
    const all = ["src/a.js", "src/b.js", "src/c.js"];
    expect(rankPaths(all)[0]).toBe("src/a.js");
    expect(rankPaths(all, new Set(["src/c.js"]))[0]).toBe("src/c.js");
  });
});

describe("importedPaths", () => {
  const paths = new Set(["lib/router/index.js", "lib/utils.js", "lib/app.js", "pkg/core.py", "pkg/sub/__init__.py", "pkg/util.py", "src/net.rs", "src/db/mod.rs"]);

  it("resolves relative JS imports, including index files and require()", () => {
    const text = `import u from "./utils"; const r = require('./router'); import x from "lodash";`;
    expect(importedPaths("lib/app.js", text, paths).sort()).toEqual(["lib/router/index.js", "lib/utils.js"]);
  });

  it("resolves Python relative and absolute imports", () => {
    const text = `from .util import helper\nfrom pkg.sub import thing\nimport os\n`;
    expect(importedPaths("pkg/core.py", text, paths).sort()).toEqual(["pkg/sub/__init__.py", "pkg/util.py"]);
  });

  it("resolves Rust mod declarations", () => {
    expect(importedPaths("src/main.rs", "mod net;\npub mod db;\nmod missing;", paths).sort()).toEqual(["src/db/mod.rs", "src/net.rs"]);
  });

  it("never returns the file itself or unknown paths", () => {
    expect(importedPaths("lib/app.js", `import a from "./app"; import b from "./nope"`, paths)).toEqual([]);
  });
});

describe("GitHub rate limit helpers", () => {
  const headers = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

  it("prefers retry-after, then the reset time", () => {
    expect(retryAfterSeconds(headers({ "retry-after": "42" }))).toBe(42);
    expect(retryAfterSeconds(headers({ "x-ratelimit-reset": "1100" }), 1_000_000)).toBe(100);
    expect(retryAfterSeconds(headers({}))).toBeUndefined();
  });

  it("words the wait and suggests a token only when none is set", () => {
    expect(rateLimitMessage(30, false)).toContain("in about 30s");
    expect(rateLimitMessage(600, false)).toContain("10 min");
    expect(rateLimitMessage(600, false)).toContain("GITHUB_TOKEN");
    expect(rateLimitMessage(undefined, true)).not.toContain("GITHUB_TOKEN");
  });
});
