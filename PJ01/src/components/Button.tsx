import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, shadow } from "../theme";

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "ghost" | "danger" | "secondary";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

export function Button({
  title,
  onPress,
  loading = false,
  variant = "primary",
  size = "md",
  fullWidth = true,
}: ButtonProps): React.JSX.Element {
  const isGhost = variant === "ghost";
  const isDanger = variant === "danger";
  const isSecondary = variant === "secondary";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        isGhost && styles.ghost,
        isDanger && styles.danger,
        isSecondary && styles.secondary,
        !isGhost && !isDanger && !isSecondary && styles.primary,
        !isGhost && !isDanger && !isSecondary && shadow.lg,
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        loading && styles.disabled,
      ]}
      disabled={loading}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isGhost || isSecondary ? colors.primary : isDanger ? colors.error : "#FFFFFF"}
        />
      ) : (
        <Text
          style={[
            styles.text,
            sizeTextStyles[size],
            isGhost && styles.ghostText,
            isDanger && styles.dangerText,
            isSecondary && styles.secondaryText,
            !isGhost && !isDanger && !isSecondary && styles.primaryText,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: {
    width: "100%",
  },
  primary: {
    backgroundColor: colors.primary,
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.primaryLight,
    borderWidth: 0,
  },
  danger: {
    backgroundColor: colors.error,
  },
  text: {
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  primaryText: {
    color: "#FFFFFF",
  },
  ghostText: {
    color: colors.primary,
  },
  secondaryText: {
    color: colors.primary,
  },
  dangerText: {
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.65,
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  md: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  lg: {
    paddingVertical: 17,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
});

const sizeTextStyles = StyleSheet.create({
  sm: { fontSize: 13 },
  md: { fontSize: 15 },
  lg: { fontSize: 17 },
});
