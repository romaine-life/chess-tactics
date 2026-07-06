// Shared HTTP error for the net clients. Carrying the status code lets callers
// distinguish "sign-in required" (401) from other failures and react — e.g. the
// editors redirect to sign-in instead of showing a generic error.
export class HttpError extends Error {
  readonly status: number;
  readonly details?: string;

  constructor(action: string, status: number, details?: string) {
    super(`${action} failed (${status})${details ? `: ${details}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }

  static async fromResponse(action: string, response: Response): Promise<HttpError> {
    let details: string | undefined;
    try {
      const body = await response.clone().json() as { error?: unknown; details?: unknown };
      const parts = [body.error, body.details].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      details = parts.length ? parts.join(': ') : undefined;
    } catch {
      try {
        const text = await response.text();
        details = text.trim() || undefined;
      } catch {
        details = undefined;
      }
    }
    return new HttpError(action, response.status, details);
  }
}
