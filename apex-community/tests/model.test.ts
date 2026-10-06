import { describe, expect, it } from "vitest";
import { extractJSON } from "../server/model";
import { SCHEMA_B, toGeminiSchema, toStrictSchema } from "../server/schema";
import { AppError } from "../server/errors";

describe("extractJSON", () => {
  it("parses plain, fenced and chatty replies", () => {
    expect(extractJSON('{"a":1}')).toEqual({ a: 1 });
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJSON('Sure! Here you go:\n{"a":{"b":[1,2]}}\nHope that helps.')).toEqual({ a: { b: [1, 2] } });
  });

  it("repairs trailing commas", () => {
    expect(extractJSON('{"a":[1,2,],"b":2,}')).toEqual({ a: [1, 2], b: 2 });
  });

  it("throws a model error when there is no usable JSON", () => {
    expect(() => extractJSON("no json here")).toThrow(AppError);
    expect(() => extractJSON("{broken: yes}")).toThrow(/malformed/);
  });
});

describe("schema converters", () => {
  it("Gemini: upper-case types, no additionalProperties, optional keys stay optional", () => {
    const g: any = toGeminiSchema(SCHEMA_B);
    expect(g.type).toBe("OBJECT");
    expect(JSON.stringify(g)).not.toContain("additionalProperties");
    const step = g.properties.rebuild.items.properties.steps.items;
    expect(step.required).toEqual(["action", "check", "source"]);
  });

  it("OpenAI strict: every key required and extras forbidden", () => {
    const s: any = toStrictSchema(SCHEMA_B);
    const step = s.properties.rebuild.items.properties.steps.items;
    expect(step.required).toEqual(["action", "command", "check", "source"]);
    expect(step.additionalProperties).toBe(false);
    expect(s.properties.projects.items.properties.minutes.type).toBe("integer");
  });
});
