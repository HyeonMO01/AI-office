import { fetchWithRetry } from "./httpClient";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const PROXY_TOKEN = process.env.EXPO_PUBLIC_PROXY_TOKEN;

export function isProxyConfigured(): boolean {
  return Boolean(API_BASE_URL?.trim());
}

function getProxyBaseUrl(): string {
  if (!API_BASE_URL?.trim()) {
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  return API_BASE_URL.replace(/\/+$/, "");
}

export async function proxyPost<T>(
  path: string,
  body: unknown,
  timeoutMs = 25000,
): Promise<T> {
  const baseUrl = getProxyBaseUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (PROXY_TOKEN?.trim()) {
    headers["x-proxy-token"] = PROXY_TOKEN;
  }
  const response = await fetchWithRetry(
    `${baseUrl}${path}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    { timeoutMs, retryCount: 0 },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`프록시 요청 실패 (${response.status}): ${text || "응답 없음"}`);
  }
  return (await response.json()) as T;
}

export type ProxyGetOptions = {
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
};

export async function proxyGet<T>(path: string, fetchOptions?: ProxyGetOptions): Promise<T> {
  const baseUrl = getProxyBaseUrl();
  const headers: Record<string, string> = {};
  if (PROXY_TOKEN?.trim()) {
    headers["x-proxy-token"] = PROXY_TOKEN;
  }
  const timeoutMs = fetchOptions?.timeoutMs ?? 18000;
  const retryCount = fetchOptions?.retryCount ?? 1;
  const retryDelayMs = fetchOptions?.retryDelayMs ?? 800;
  const response = await fetchWithRetry(
    `${baseUrl}${path}`,
    { method: "GET", headers },
    { timeoutMs, retryCount, retryDelayMs },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`프록시 요청 실패 (${response.status}): ${text || "응답 없음"}`);
  }
  return (await response.json()) as T;
}
