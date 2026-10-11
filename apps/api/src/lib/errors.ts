import type { ZodTypeAny, output } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please sign in') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have access to this resource', code = 'FORBIDDEN') => new AppError(403, code, message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const unprocessable = (message: string, details?: unknown) => new AppError(422, 'UNPROCESSABLE', message, details);

/** Validates untrusted input; throws a 400 with field-level details. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Some fields are invalid',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}
