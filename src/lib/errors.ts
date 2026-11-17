export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Forbidden") => new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new AppError(404, "NOT_FOUND", message);
export const conflict = (message: string, details?: unknown) => new AppError(409, "CONFLICT", message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);
export const tooManyRequests = (message: string, retryAfterSec?: number) =>
  new AppError(429, "RATE_LIMITED", message, retryAfterSec ? { retryAfterSec } : undefined);
