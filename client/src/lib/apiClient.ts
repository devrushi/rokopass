import { clearTokens, getAccessToken, getRefreshToken, setAccessToken } from "./tokenStorage";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// Media URLs from the API are relative (e.g. "/uploads/activities/x.png") — <img> tags need an
// absolute URL since the frontend runs on a different origin than the API in dev.
export function apiAssetUrl(path: string): string {
  return `${API_URL}${path}`;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  skipAuth?: boolean;
}

async function rawRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  // Don't set Content-Type for FormData — the browser adds the multipart boundary itself, and
  // an explicit header here would omit it and break the upload.
  const headers: Record<string, string> = isFormData ? {} : { "Content-Type": "application/json" };
  const accessToken = getAccessToken();
  if (accessToken && !options.skipAuth) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: isFormData ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

// Multiple 401s in flight at once should trigger a single refresh, not one per request.
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const res = await rawRequest("/auth/refresh", {
    method: "POST",
    body: { refreshToken },
    skipAuth: true,
  });
  if (!res.ok) return false;

  const data = await res.json();
  setAccessToken(data.accessToken);
  return true;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await rawRequest(path, options);

  if (res.status === 401 && !options.skipAuth && getRefreshToken()) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const refreshed = await refreshPromise;

    if (refreshed) {
      res = await rawRequest(path, options);
    } else {
      clearTokens();
    }
  }

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : undefined;

  if (!res.ok) {
    const message = data?.error?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}
