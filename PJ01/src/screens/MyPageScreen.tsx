import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/RootNavigator";
import { colors, radius, spacing } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { UserProfile } from "../types";
import { getUserProfile } from "../services/userProfileService";
import { useWardrobeList } from "../hooks/useWardrobeList";
import { getRecommendationHistory } from "../services/recommendationService";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function MyPageScreen(): React.JSX.Element {
  const { user, logoutUser } = useAuth();
  const navigation = useNavigation<NavProp>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const { items } = useWardrobeList(user?.uid);
  const [historyCount, setHistoryCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setProfile(await getUserProfile(user.uid));
    };
    void load();
  }, [user]);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    void getRecommendationHistory(user.uid).then((h) => setHistoryCount(h.length)).catch(() => {});
  }, [user]));

  const initial = (profile?.nickname ?? "U").charAt(0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>마이페이지</Text>

      {/* Profile */}
      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{profile?.nickname ?? "-"}</Text>
          <Text style={styles.profileEmail}>{user?.email ?? ""}</Text>
        </View>
      </View>

      {/* Body Info */}
      <View style={styles.bodyInfoRow}>
        {[
          { label: "키", value: profile?.height ? `${profile.height}cm` : "-" },
          { label: "몸무게", value: profile?.weight ? `${profile.weight}kg` : "-" },
          { label: "체형", value: profile?.bodyType ?? "-" },
          { label: "스타일", value: profile?.preferredStyle || "-" },
        ].map((info) => (
          <View key={info.label} style={styles.bodyInfoCard}>
            <Text style={styles.bodyInfoLabel}>{info.label}</Text>
            <Text style={styles.bodyInfoValue}>{info.value}</Text>
          </View>
        ))}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statDark}>
          <Text style={styles.statDarkNum}>{items.length}</Text>
          <Text style={styles.statDarkLabel}>등록된 옷</Text>
        </View>
        <View style={styles.statLight}>
          <Text style={styles.statLightNum}>{historyCount}</Text>
          <Text style={styles.statLightLabel}>AI 추천 횟수</Text>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.menuWrap}>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.zinc50 }]}
          onPress={() => navigation.navigate("RecommendationHistory")}
        >
          <View style={[styles.menuIcon, { backgroundColor: "#FEF3C7" }]}>
            <Ionicons name="time-outline" size={18} color="#D97706" />
          </View>
          <Text style={styles.menuLabel}>추천 히스토리</Text>
          {historyCount > 0 && (
            <View style={styles.menuBadge}>
              <Text style={styles.menuBadgeText}>{historyCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.zinc200} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.zinc50 }]}
          onPress={() => navigation.navigate("Onboarding", { isEdit: true })}
        >
          <View style={[styles.menuIcon, { backgroundColor: "#DBEAFE" }]}>
            <Ionicons name="document-text-outline" size={18} color="#2563EB" />
          </View>
          <Text style={styles.menuLabel}>프로필 수정</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.zinc200} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.zinc50 }]}
          onPress={() => navigation.navigate("StyleAnalysis")}
        >
          <View style={[styles.menuIcon, { backgroundColor: "#EEF2FF" }]}>
            <Ionicons name="bar-chart-outline" size={18} color="#6366F1" />
          </View>
          <Text style={styles.menuLabel}>스타일 분석</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.zinc200} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.zinc50 }]}
          onPress={() => navigation.navigate("WeeklyPlanner")}
        >
          <View style={[styles.menuIcon, { backgroundColor: "#FFF7ED" }]}>
            <Ionicons name="calendar-number-outline" size={18} color="#EA580C" />
          </View>
          <Text style={styles.menuLabel}>주간 코디 플래너</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.zinc200} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.zinc50 }]}
          onPress={() => navigation.navigate("OutfitCalendar")}
        >
          <View style={[styles.menuIcon, { backgroundColor: "#ECFDF5" }]}>
            <Ionicons name="calendar-outline" size={18} color="#10B981" />
          </View>
          <Text style={styles.menuLabel}>코디 캘린더</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.zinc200} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.zinc50 }]}
          onPress={() => navigation.navigate("Settings")}
        >
          <View style={[styles.menuIcon, { backgroundColor: "#F4F4F5" }]}>
            <Ionicons name="settings-outline" size={18} color="#52525B" />
          </View>
          <Text style={styles.menuLabel}>설정</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.zinc200} />
        </Pressable>

        <View style={styles.menuDivider} />

        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: "#FEF2F2" }]}
          onPress={async () => {
            await logoutUser();
            navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          }}
        >
          <View style={[styles.menuIcon, { backgroundColor: "#FEE2E2" }]}>
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          </View>
          <Text style={[styles.menuLabel, { color: "#EF4444" }]}>로그아웃</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>FIZZYLUSH v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },

  pageTitle: { fontSize: 22, fontWeight: "700", color: colors.zinc900, letterSpacing: -0.5, marginBottom: spacing.lg },

  profileRow: {
    flexDirection: "row", alignItems: "center", gap: 16,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.zinc900,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "700", color: "#fff" },
  profileName: { fontSize: 16, fontWeight: "700", color: colors.zinc900 },
  profileEmail: { fontSize: 13, color: colors.zinc400, marginTop: 2 },

  bodyInfoRow: { flexDirection: "row", gap: 8, marginBottom: spacing.lg },
  bodyInfoCard: {
    flex: 1, backgroundColor: colors.zinc50, borderRadius: radius.md,
    paddingVertical: 12, alignItems: "center",
  },
  bodyInfoLabel: { fontSize: 11, color: colors.zinc400 },
  bodyInfoValue: { fontSize: 14, fontWeight: "700", color: colors.zinc900, marginTop: 2 },

  statsRow: { flexDirection: "row", gap: 12, marginBottom: spacing.lg },
  statDark: {
    flex: 1, backgroundColor: colors.zinc900, borderRadius: radius.lg, padding: spacing.md,
  },
  statDarkNum: { fontSize: 28, fontWeight: "700", color: "#fff" },
  statDarkLabel: { fontSize: 12, color: colors.zinc400, marginTop: 4 },
  statLight: {
    flex: 1, backgroundColor: colors.zinc50, borderRadius: radius.lg, padding: spacing.md,
  },
  statLightNum: { fontSize: 28, fontWeight: "700", color: colors.zinc900 },
  statLightLabel: { fontSize: 12, color: colors.zinc400, marginTop: 4 },

  menuWrap: { marginBottom: spacing.lg },
  menuItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, paddingHorizontal: 4, borderRadius: radius.md,
  },
  menuIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.zinc700 },
  menuBadge: {
    backgroundColor: colors.zinc900, borderRadius: 10,
    paddingVertical: 2, paddingHorizontal: 8, marginRight: 4,
  },
  menuBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  menuDivider: { height: 1, backgroundColor: colors.zinc100, marginVertical: 8 },

  version: { textAlign: "center", fontSize: 11, color: colors.zinc200, marginTop: spacing.lg },
});
