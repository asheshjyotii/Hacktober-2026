import { describe, expect, it } from "vitest";
import { buildProfile, levelFromScore, skippedProfile } from "../src/lib/profile";
import type { PlacementQuestion } from "../src/types";

const qs: PlacementQuestion[] = [0, 1, 2, 3, 4].map((i) => ({
  question: `q${i}`,
  options: ["a", "b", "c", "d"],
  answerIndex: 1,
  tests: `idea ${i}`,
  ...(i % 2 === 0 ? { path: `src/f${i}.js` } : {}),
}));

describe("levelFromScore", () => {
  it("maps 0-1 novice, 2-3 intermediate, 4-5 advanced", () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => levelFromScore(s, 5))).toEqual(["novice", "novice", "intermediate", "intermediate", "advanced", "advanced"]);
  });
});

describe("buildProfile", () => {
  it("records what was missed and known, with files, and a stable key", () => {
    const p = buildProfile(qs, [1, 0, 1, 1, 3])!;
    expect(p.score).toBe(3);
    expect(p.level).toBe("intermediate");
    expect(p.missed).toEqual([{ tests: "idea 1" }, { tests: "idea 4", path: "src/f4.js" }]);
    expect(p.known).toEqual(["idea 0", "idea 2", "idea 3"]);
    expect(p.key).toBe("intermediate-01001");
    expect(buildProfile(qs, [1, 0, 1, 1, 3])!.key).toBe(p.key);
  });

  it("gives different keys for different mistakes at the same level", () => {
    expect(buildProfile(qs, [0, 1, 1, 1, 1])!.key).not.toBe(buildProfile(qs, [1, 0, 1, 1, 1])!.key);
  });

  it("rejects answers that do not fit the quiz", () => {
    expect(buildProfile(qs, [1, 1, 1])).toBeNull();
    expect(buildProfile(qs, [1, 1, 1, 1, 9])).toBeNull();
    expect(buildProfile(qs, [1, 1, 1, 1, "1"])).toBeNull();
    expect(buildProfile(qs, null)).toBeNull();
    expect(buildProfile([], [])).toBeNull();
  });
});

describe("skippedProfile", () => {
  it("is a novice with a fixed key", () => {
    expect(skippedProfile()).toMatchObject({ level: "novice", skipped: true, key: "skip" });
  });
});
