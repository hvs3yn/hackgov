import type { AuthResponse, ProblemDetails } from "./types";
import { clearTokens, loadTokens, rotateTokens } from "./tokens";

/**
 * In development requests go to `/api/v1` and Vite proxies them to the
 * backend (see vite.config.ts), which avoids CORS. Set VITE_API_URL to call
 * a backend directly, e.g. `http://localhost:8080/api/v1`.
 */
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly fieldErrors: { field: string; message: string }[];
  readonly retryAfter: number | null;

  constructor(status: number, code: string, detail: string, fieldErrors: { field: string; message: string }[] = [], retryAfter: number | null = null) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
    this.retryAfter = retryAfter;
  }
}

/** True when the server could not be reached at all (as opposed to answering with an error). */
export const isNetworkError = (e: unknown): boolean => e instanceof ApiError && (e.status === 0 || e.status >= 502);

/** Human-readable message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (isNetworkError(e)) return "Cannot reach the Foresight API. Is the backend running on port 8080?";
    if (e.fieldErrors.length) return e.fieldErrors.map((f) => `${f.field}: ${f.message}`).join(" · ");
    return e.detail || e.code;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Public endpoints (login, register, refresh, logout) skip the Bearer header and refresh logic. */
  auth?: boolean;
  signal?: AbortSignal;
}

let onAuthLost: (() => void) | null = null;
/** Called when the session can no longer be refreshed, so the UI can sign out. */
export function setAuthLostHandler(fn: (() => void) | null) {
  onAuthLost = fn;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.append(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ""}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  const retry = Number(res.headers.get("Retry-After"));
  const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : null;
  let problem: ProblemDetails | null = null;
  try {
    problem = (await res.json()) as ProblemDetails;
  } catch {
    /* empty or non-JSON body (e.g. a proxy error page) */
  }
  return new ApiError(
    res.status,
    problem?.code ?? `HTTP_${res.status}`,
    problem?.detail ?? problem?.title ?? `Request failed (${res.status})`,
    problem?.errors ?? [],
    retryAfter,
  );
}

async function send(path: string, opts: RequestOptions, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK", "Cannot reach the Foresight API.");
  }
}

/* One refresh at a time: concurrent 401s all wait for the same rotation. */
let refreshing: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  refreshing ??= (async () => {
    const tokens = loadTokens();
    if (!tokens) throw new ApiError(401, "UNAUTHENTICATED", "Not signed in.");
    const res = await send("/auth/refresh", { method: "POST", body: { refreshToken: tokens.refreshToken } }, null);
    if (!res.ok) throw await toApiError(res);
    const data = (await res.json()) as AuthResponse;
    rotateTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const authed = opts.auth !== false;
  let res = await send(path, opts, authed ? (loadTokens()?.accessToken ?? null) : null);

  if (res.status === 401 && authed) {
    try {
      const fresh = await refreshAccessToken();
      res = await send(path, opts, fresh);
    } catch (e) {
      // A network blip during refresh must not sign the user out.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        clearTokens();
        onAuthLost?.();
      }
      throw e;
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal });
export const post = <T>(path: string, body?: unknown, opts: Omit<RequestOptions, "method" | "body"> = {}) => request<T>(path, { ...opts, method: "POST", body: body ?? undefined });
export const put = <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body });
export const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body });
export const del = <T = void>(path: string, query?: Query) => request<T>(path, { method: "DELETE", query });
