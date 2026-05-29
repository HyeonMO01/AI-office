import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radius, shadow } from "../theme";

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export function LoadingOverlay({
  visible,
  message = "로딩 중...",
}: LoadingOverlayProps): React.JSX.Element | null {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.box}>
        <View style={styles.spinnerWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99,
  },
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 28,
    paddingHorizontal: 32,
    alignItems: "center",
    gap: 14,
    minWidth: 180,
    ...shadow.md,
  },
  spinnerWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 200,
  },
});
