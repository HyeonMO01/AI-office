import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

let initialized = false;

export function initSentry(): void {
  if (!dsn || initialized) {
    return;
  }
  Sentry.init({
    dsn,
    debug: __DEV__,
    environment: __DEV__ ? "development" : "production",
    tracesSampleRate: __DEV__ ? 1 : 0.2,
    enableAutoSessionTracking: true,
  });
  initialized = true;
}
