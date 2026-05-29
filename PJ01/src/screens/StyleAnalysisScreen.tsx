import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../hooks/useAuth";
import { useWardrobeList } from "../hooks/useWardrobeList";
import { getUserProfile } from "../services/userProfileService";
import { proxyPost } from "../services/apiProxy";
import { colors, radius, shadow, spacing } from "../theme";
import { WardrobeItem } from "../types";

const CATEGORY_COLORS: Record<string, string> = {
  "상의": "#FF5C8A",
  "하의": "#6366F1",
  "아우터": "#F59E0B",
  "신발": "#10B981",
  "액세서리": "#8B5CF6",
  "원피스/드레스": "#EC4899",
  "기타": "#9CA3AF",
};

const CORE_CATEGORIES = ["상의", "하의", "아우터", "신발", "액세서리"];

function getCategoryColor(cat: string): string {
  for (const key of Object.keys(CATEGORY_COLORS)) {
    if (cat.includes(key) || key.includes(cat)) return CATEGORY_COLORS[key];
  }
  return CATEGORY_COLORS["기타"];
}

function buildCategoryMap(items: WardrobeItem[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) {
    const cat = item.category || "기타";
    map[cat] = (map[cat] ?? 0) + 1;
  }
  return map;
}

function computeCoverageScore(categoryMap: Record<string, number>): number {
  const covered = CORE_CATEGORIES.filter((c) =>
    Object.keys(categoryMap).some((k) => k.includes(c) || c.includes(k))
  ).length;
  return Math.round((covered / CORE_CATEGORIES.length) * 100);
}

function extractKeywords(items: WardrobeItem[]): string[] {
  const freq: Record<string, number> = {};
  for (const item of items) {
    const words = (item.aiSummary || "")
      .split(/[\s,]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2);
    for (const w of words) {
      freq[w] = (freq[w] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);
}

export function StyleAnalysisScreen(): React.JSX.Element {
  const { user } = useAuth();
  const { items } = useWardrobeList(user?.uid);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [nickname, setNickname] = useState("");

  useFocusEffect(useCallback(() => {
    if (!user) return;
    getUserProfile(user.uid).then((p) => setNickname(p?.nickname ?? "")).catch(() => {});
  }, [user]));

  const categoryMap = buildCategoryMap(items);
  const sortedCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(...Object.values(categoryMap), 1);
  const coverageScore = computeCoverageScore(categoryMap);
  const keywords = extractKeywords(items);

  const runDiagnosis = async () => {
    if (!user || items.length === 0) return;
    setDiagnosisLoading(true);
    setDiagnosis(null);
    try {
      const profile = await getUserProfile(user.uid);
      const categoryList = sortedCategories
        .map(([cat, cnt]) => `${cat} ${cnt}벌`)
        .join(", ");
      const prompt = `
fizzylush 패션 앱 사용자의 옷장을 분석해주세요.

사용자 정보: 키 ${profile?.height ?? "-"}cm, 체형 ${profile?.bodyType ?? "미입력"}, 선호 스타일 ${profile?.preferredStyle || "미입력"}
옷장 구성 (총 ${items.length}벌): ${categoryList}
주요 키워드: ${keywords.slice(0, 8).join(", ")}

다음 3가지를 간결하게 한국어로 분석해주세요:
1. 옷장 강점 (잘 갖춰진 부분)
2. 보완 포인트 (부족한 카테고리나 스타일)
3. 맞춤 추천 한 줄 (이 옷장으로 만들 수 있는 최고의 코디 방향)

각 항목은 2~3문장으로 요약해주세요.
      `.trim();

      const res = await proxyPost<{ choices: Array<{ message: { content: string } }> }>(
        "/api/openai/chat-completions",
        {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 400,
        },
        30000,
      );
      setDiagnosis(res.choices[0]?.message?.content ?? "분석 결과를 가져오지 못했습니다.");
    } catch (e) {
      Alert.alert("분석 실패", e instanceof Error ? e.message : "다시 시도해주세요.");
    } finally {
      setDiagnosisLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="shirt-outline" size={48} color={colors.zinc300} />
        <Text style={styles.emptyTitle}>옷장이 비어있어요</Text>
        <Text style={styles.emptyDesc}>옷을 먼저 등록하면 스타일 분석을 받을 수 있어요</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* 요약 통계 */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, shadow.sm, { backgroundColor: colors.zinc900 }]}>
          <Text style={styles.summaryNumDark}>{items.length}</Text>
          <Text style={styles.summaryLabelDark}>총 옷 수</Text>
        </View>
        <View style={[styles.summaryCard, shadow.sm]}>
          <Text style={styles.summaryNum}>{sortedCategories.length}</Text>
          <Text style={styles.summaryLabel}>카테고리 수</Text>
        </View>
        <View style={[styles.summaryCard, shadow.sm, { backgroundColor: coverageScore >= 80 ? "#ECFDF5" : coverageScore >= 60 ? "#FFFBEB" : "#FEF2F2" }]}>
          <Text style={[styles.summaryNum, { color: coverageScore >= 80 ? "#059669" : coverageScore >= 60 ? "#D97706" : "#DC2626" }]}>
            {coverageScore}%
          </Text>
          <Text style={styles.summaryLabel}>옷장 완성도</Text>
        </View>
      </View>

      {/* 카테고리 분포 */}
      <View style={[styles.section, shadow.sm]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="bar-chart-outline" size={16} color={colors.primary} />
          <Text style={styles.sectionTitle}>카테고리 분포</Text>
        </View>
        {sortedCategories.map(([cat, cnt]) => {
          const color = getCategoryColor(cat);
          const pct = cnt / maxCount;
          return (
            <View key={cat} style={styles.barRow}>
              <Text style={styles.barLabel}>{cat}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
              </View>
              <Text style={[styles.barCount, { color }]}>{cnt}벌</Text>
            </View>
          );
        })}
      </View>

      {/* 핵심 카테고리 커버리지 */}
      <View style={[styles.section, shadow.sm]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
          <Text style={styles.sectionTitle}>핵심 카테고리 보유 현황</Text>
        </View>
        <View style={styles.coverageGrid}>
          {CORE_CATEGORIES.map((core) => {
            const has = Object.keys(categoryMap).some((k) => k.includes(core) || core.includes(k));
            return (
              <View key={core} style={[styles.coverageChip, has ? styles.coverageChipOn : styles.coverageChipOff]}>
                <Ionicons
                  name={has ? "checkmark-circle" : "ellipse-outline"}
                  size={14}
                  color={has ? "#059669" : colors.zinc300}
                />
                <Text style={[styles.coverageChipText, { color: has ? "#059669" : colors.zinc400 }]}>
                  {core}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* 스타일 키워드 */}
      {keywords.length > 0 && (
        <View style={[styles.section, shadow.sm]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
            <Text style={styles.sectionTitle}>내 옷장 키워드</Text>
          </View>
          <View style={styles.keywordWrap}>
            {keywords.map((kw, i) => (
              <View key={i} style={[styles.keyword, { opacity: 1 - i * 0.06 }]}>
                <Text style={styles.keywordText}>{kw}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* AI 옷장 진단 */}
      <View style={[styles.section, shadow.sm]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
          <Text style={styles.sectionTitle}>AI 옷장 진단</Text>
        </View>

        {diagnosis ? (
          <View style={styles.diagnosisResult}>
            <Text style={styles.diagnosisText}>{diagnosis}</Text>
            <Pressable style={styles.reDiagBtn} onPress={() => void runDiagnosis()}>
              <Ionicons name="refresh" size={13} color={colors.primary} />
              <Text style={styles.reDiagText}>다시 분석</Text>
            </Pressable>
          </View>
        ) : diagnosisLoading ? (
          <View style={styles.diagnosisLoading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.diagnosisLoadingText}>AI가 옷장을 분석하는 중...</Text>
          </View>
        ) : (
          <Pressable style={styles.diagnosisBtn} onPress={() => void runDiagnosis()}>
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.diagnosisBtnText}>AI 옷장 진단 받기</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: 48 },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.zinc700 },
  emptyDesc: { fontSize: 13, color: colors.zinc400, textAlign: "center", lineHeight: 20 },

  summaryRow: { flexDirection: "row", gap: 10 },
  summaryCard: {
    flex: 1, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: 14,
    alignItems: "center", borderWidth: 1, borderColor: colors.border,
  },
  summaryNum: { fontSize: 26, fontWeight: "700", color: colors.zinc900 },
  summaryNumDark: { fontSize: 26, fontWeight: "700", color: "#fff" },
  summaryLabel: { fontSize: 11, color: colors.zinc400, marginTop: 3 },
  summaryLabelDark: { fontSize: 11, color: colors.zinc400, marginTop: 3 },

  section: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, gap: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },

  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barLabel: { fontSize: 13, color: colors.text, width: 72 },
  barTrack: {
    flex: 1, height: 10, backgroundColor: colors.surfaceAlt,
    borderRadius: 5, overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 5 },
  barCount: { fontSize: 12, fontWeight: "700", width: 32, textAlign: "right" },

  coverageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  coverageChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.full,
    borderWidth: 1,
  },
  coverageChipOn: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  coverageChipOff: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  coverageChipText: { fontSize: 13, fontWeight: "600" },

  keywordWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  keyword: {
    backgroundColor: colors.primaryLight, borderRadius: radius.full,
    paddingVertical: 6, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.primary + "40",
  },
  keywordText: { fontSize: 13, color: colors.primary, fontWeight: "600" },

  diagnosisBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 14,
  },
  diagnosisBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  diagnosisLoading: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 14, justifyContent: "center",
  },
  diagnosisLoadingText: { fontSize: 14, color: colors.subText },
  diagnosisResult: { gap: 12 },
  diagnosisText: { fontSize: 14, color: colors.text, lineHeight: 22 },
  reDiagBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    borderWidth: 1, borderColor: colors.primary, borderRadius: radius.full,
    paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.primaryLight,
  },
  reDiagText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
});
