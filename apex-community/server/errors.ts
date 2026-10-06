export type ErrorKind = "invalid" | "not_found" | "rate_limited" | "model" | "unknown";

export class AppError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export const STATUS: Record<ErrorKind, number> = {
  invalid: 400,
  not_found: 404,
  rate_limited: 429,
  model: 502,
  unknown: 500,
};
