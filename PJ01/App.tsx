import React, { useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import * as Sentry from "@sentry/react-native";
import { AuthProvider } from "./src/hooks/useAuth";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { initSentry } from "./src/instrument/sentry";
import { isProxyConfigured } from "./src/services/apiProxy";
import { setupAndroidChannel } from "./src/services/notificationService";
import { RootStackParamList } from "./src/navigation/RootNavigator";

initSentry();
void setupAndroidChannel();

function AppRoot(): React.JSX.Element {
  const proxyMissing = !isProxyConfigured();
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (screen === "Home" && navRef.current) {
        navRef.current.navigate("MainTabs");
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
      <NavigationContainer ref={navRef}>
        <StatusBar style="dark" />
        {proxyMissing && (
          <View style={{
            backgroundColor: "#DC2626",
            paddingVertical: 8,
            paddingHorizontal: 16,
            paddingTop: 48,
          }}>
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600", textAlign: "center" }}>
              ⚠️ 서버 미연결 — AI 추천·쇼핑 기능이 작동하지 않습니다
            </Text>
          </View>
        )}
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

export default process.env.EXPO_PUBLIC_SENTRY_DSN?.trim()
  ? Sentry.wrap(AppRoot)
  : AppRoot;
