import { fetchWithRetry } from "./httpClient";

const MONITORING_ENDPOINT = process.env.EXPO_PUBLIC_MONITORING_ENDPOINT;

export async function reportError(error: unknown, context: string): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[monitoring] ${context}: ${message}`);

  if (!MONITORING_ENDPOINT?.trim()) {
    return;
  }

  try {
    await fetchWithRetry(
      MONITORING_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          context,
          message,
          timestamp: new Date().toISOString(),
        }),
      },
      { timeoutMs: 5000, retryCount: 0 },
    );
  } catch {
    // Monitoring transport failure should not affect user flow.
  }
}
