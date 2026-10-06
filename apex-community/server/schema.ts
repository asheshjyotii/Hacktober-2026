/** Small JSON-schema subset describing the two model outputs, plus per-provider converters. */
export interface JsonSchema {
  type: "object" | "array" | "string" | "integer";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
}

const S: JsonSchema = { type: "string" };
const I: JsonSchema = { type: "integer" };
const list = (items: JsonSchema): JsonSchema => ({ type: "array", items });
const obj = (properties: Record<string, JsonSchema>, required = Object.keys(properties)): JsonSchema => ({
  type: "object",
  properties,
  required,
});

export const SCHEMA_A: JsonSchema = obj({
  overview: obj({ summary: S, stack: list(S), audience: S }),
  components: list(obj({ id: S, name: S, role: S, paths: list(S) })),
  edges: list(obj({ from: S, to: S, label: S })),
  readingPath: list(obj({ order: I, path: S, why: S })),
  glossary: list(obj({ term: S, plain: S, seenIn: S })),
});

export const SCHEMA_B: JsonSchema = obj({
  placement: list(obj({ question: S, options: list(S), answerIndex: I, tests: S })),
  projects: list(
    obj({ n: I, tag: S, title: S, goal: S, study: list(S), steps: list(S), checklist: list(S), minutes: I }),
  ),
  rebuild: list(
    obj({
      phase: S,
      steps: list(obj({ action: S, command: S, check: S, source: S }, ["action", "check", "source"])),
    }),
  ),
});

/** Gemini wants upper-case type names and rejects `additionalProperties`. */
export function toGeminiSchema(s: JsonSchema): unknown {
  const out: Record<string, unknown> = { type: s.type.toUpperCase() };
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
    if (s.required?.length) out.required = s.required;
  }
  if (s.items) out.items = toGeminiSchema(s.items);
  return out;
}

/** OpenAI-style strict mode: every key required, no extra keys. */
export function toStrictSchema(s: JsonSchema): unknown {
  const out: Record<string, unknown> = { type: s.type };
  if (s.properties) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toStrictSchema(v)]));
    out.required = Object.keys(s.properties);
    out.additionalProperties = false;
  }
  if (s.items) out.items = toStrictSchema(s.items);
  return out;
}
