import React from "react";
import { View, Text, StyleSheet, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../theme";

type RowVariant = "muted" | "dark";

/** 비활성화된 '착용해보기' 자리 (옆 네이버 버튼과 나란히) */
export function VirtualTryOnRowPlaceholder({
  variant = "muted",
  expand,
  style,
}: {
  variant?: RowVariant;
  /** StyleResult 액션 줄처럼 남은 너비를 채울 때 */
  expand?: boolean;
  style?: ViewStyle;
}) {
  const bg = variant === "dark" ? colors.zinc500 : colors.zinc400;
  return (
    <View
      style={[styles.row, { backgroundColor: bg }, expand ? { flex: 1 } : null, style]}
      accessibilityRole="text"
    >
      <Ionicons name="body-outline" size={13} color="rgba(255,255,255,0.9)" />
      <View>
        <Text style={styles.rowTitle}>착용해보기</Text>
        <Text style={styles.rowCap}>베타 · 정식 출시 예정</Text>
      </View>
    </View>
  );
}

/** 코디 결과 하단 — 전체 코디 가상 착용 자리 */
export function VirtualTryOnBottomPlaceholder() {
  return (
    <View style={styles.bottom}>
      <Ionicons name="hourglass-outline" size={20} color={colors.zinc500} />
      <View style={styles.bottomTexts}>
        <View style={styles.bottomTitleRow}>
          <Text style={styles.bottomTitle}>전체 코디 가상 착용</Text>
          <View style={styles.betaPill}>
            <Text style={styles.betaPillText}>베타</Text>
          </View>
        </View>
        <Text style={styles.bottomSub}>정식 출시 예정입니다</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  rowTitle: { fontSize: 12, fontWeight: "800", color: "#fff" },
  rowCap: { fontSize: 9, fontWeight: "600", color: "rgba(255,255,255,0.88)", marginTop: 1 },

  bottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.zinc100,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.zinc200,
  },
  bottomTexts: { flex: 1, gap: 4 },
  bottomTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  bottomTitle: { fontSize: 14, fontWeight: "700", color: colors.zinc800 },
  betaPill: {
    backgroundColor: colors.zinc200,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  betaPillText: { fontSize: 10, fontWeight: "800", color: colors.zinc600 },
  bottomSub: { fontSize: 12, color: colors.zinc500 },
});
