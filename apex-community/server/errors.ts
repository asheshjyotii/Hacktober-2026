export type ErrorKind =
  | "invalid"
  | "not_found"
  | "private"
  | "rate_limited"
  | "timeout"
  | "model"
  | "unknown";

export class AppError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    /** Seconds until a retry is likely to work (rate limits). */
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export const STATUS: Record<ErrorKind, number> = {
  invalid: 400,
  not_found: 404,
  private: 403,
  rate_limited: 429,
  timeout: 504,
  model: 502,
  unknown: 500,
};
