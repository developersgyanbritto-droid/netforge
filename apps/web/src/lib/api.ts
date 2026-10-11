// Typed fetch wrapper for the NetForge API (proxied at /api/v1 by Next.js).

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { path: string; message: string }[] | unknown,
  ) {
    super(message);
  }
}

const BASE = '/api/v1';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      // CSRF defence: the API rejects mutations without this header.
      'X-NF-Request': '1',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = (json as { error?: { code: string; message: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (Array.isArray(e.details) && e.details.length) {
      return `${e.message}: ${(e.details as { path: string; message: string }[]).map((d) => (d.path ? `${d.path} — ${d.message}` : d.message)).join('; ')}`;
    }
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
