/* =========================================
   lib/api.ts
   ✅ Client API (fetch) aligné backend tpe-monitoring
   ✅ baseURL depuis lib/config.ts (local Wi-Fi)
   ✅ Endpoints pro: terminals + telemetry + register + rename
   ========================================= */

import { API_BASE_URL } from "./config";
import type {
  ApiErrorShape,
  TelemetryPushRequest,
  TelemetrySnapshot,
  Terminal,
  TerminalRegisterRequest,
  TerminalRegisterResponse,
  TerminalRenameRequest,
  TerminalSummary,
} from "./types";

export class ApiError extends Error {
  status: number;
  path?: string;
  payload?: any;

  constructor(message: string, status: number, path?: string, payload?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.payload = payload;
  }
}

type ApiConfig = {
  baseURL: string;
  timeoutMs: number;
  getToken?: () => string | null;
};

const DEFAULT_TIMEOUT = 15000;

const config: ApiConfig = {
  baseURL: API_BASE_URL.replace(/\/+$/, ""),
  timeoutMs: DEFAULT_TIMEOUT,
  getToken: undefined,
};

export function setApiBaseURL(url: string) {
  config.baseURL = url.replace(/\/+$/, "");
}

export function setApiTimeoutMs(ms: number) {
  config.timeoutMs = ms;
}

export function setApiTokenGetter(fn: () => string | null) {
  config.getToken = fn;
}

function joinURL(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function parseBody(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    return await res.text();
  } catch {
    return null;
  }
}

function buildErrorMessage(status: number, payload: any) {
  const p = payload as ApiErrorShape;

  if (p?.message) return p.message;
  if (typeof payload === "string" && payload.trim()) return payload;

  if (status === 0) return "Erreur réseau / timeout.";
  if (status >= 500) return "Erreur serveur.";
  if (status === 404) return "Route introuvable (404).";
  if (status === 401) return "Non autorisé (401).";
  if (status === 403) return "Accès interdit (403).";
  if (status === 400) return "Requête invalide (400).";

  return `Erreur HTTP (${status}).`;
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: any,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const url = joinURL(config.baseURL, path);

  const token = config.getToken?.() || null;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(extraHeaders || {}),
  };

  const hasBody = body !== undefined && body !== null;
  if (hasBody) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const payload = await parseBody(res);

    if (!res.ok) {
      const msg = buildErrorMessage(res.status, payload);
      throw new ApiError(msg, res.status, path, payload);
    }

    return payload as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new ApiError("Timeout API: requête trop longue.", 0, path, null);
    }
    if (e instanceof ApiError) throw e;

    throw new ApiError(e?.message || "Erreur réseau.", 0, path, null);
  } finally {
    clearTimeout(t);
  }
}

export const api = {
  // base
  get: <T>(path: string, headers?: Record<string, string>) =>
    request<T>("GET", path, undefined, headers),

  post: <T = any>(path: string, body?: any, headers?: Record<string, string>) =>
    request<T>("POST", path, body, headers),

  put: <T = any>(path: string, body?: any, headers?: Record<string, string>) =>
    request<T>("PUT", path, body, headers),

  patch: <T = any>(path: string, body?: any, headers?: Record<string, string>) =>
    request<T>("PATCH", path, body, headers),

  del: <T = any>(path: string, headers?: Record<string, string>) =>
    request<T>("DELETE", path, undefined, headers),
};

/* =========================================
   ✅ Endpoints métiers (alignés backend)
   ========================================= */

export const terminalsApi = {
  list: () => api.get<TerminalSummary[]>("/api/terminals"),
  getById: (id: number) => api.get<Terminal>(`/api/terminals/${id}`),

  /**
   * ✅ Enregistrement idempotent (backend modifié)
   * POST /api/terminals/register
   */
  register: (payload: TerminalRegisterRequest) =>
    api.post<TerminalRegisterResponse>("/api/terminals/register", payload),

  /**
   * ✅ Renommer un terminal (displayName)
   * PATCH /api/terminals/{id}/name
   */
  rename: (id: number, payload: TerminalRenameRequest) =>
    api.patch<Terminal>(`/api/terminals/${id}/name`, payload),
};

export const telemetryApi = {
  /**
   * POST /api/telemetry/push
   * payload = TelemetryPushRequest (backend)
   */
  push: (payload: TelemetryPushRequest) =>
    api.post<string>("/api/telemetry/push", payload),

  /**
   * GET /api/telemetry?size=50
   */
  listLatest: (size = 50) =>
    api.get<TelemetrySnapshot[]>(`/api/telemetry?size=${encodeURIComponent(size)}`),

  /**
   * GET /api/telemetry/{id}
   */
  getById: (id: number) => api.get<TelemetrySnapshot>(`/api/telemetry/${id}`),

  /**
   * GET /api/telemetry/terminal/{terminalId}?size=20
   */
  listByTerminal: (terminalId: number, size = 20) =>
    api.get<TelemetrySnapshot[]>(
      `/api/telemetry/terminal/${terminalId}?size=${encodeURIComponent(size)}`
    ),

  /**
   * ✅ URL SSE stream (si front consomme EventSource)
   * GET /api/telemetry/stream
   */
  streamUrl: () => joinURL(config.baseURL, "/api/telemetry/stream"),
};