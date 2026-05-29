import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../hooks/useAuth";
import { useWardrobeList } from "../hooks/useWardrobeList";
import { getUserProfile } from "../services/userProfileService";
import { requestVisionRecommendation } from "../services/openai";
import {
  buildNaverSearchQuery,
  fetchNaverShoppingProducts,
  NAVER_SHOP_FETCH_CONCURRENCY,
} from "../services/naverShoppingService";
import { runWithConcurrency } from "../utils/concurrency";
import { colors, radius, spacing } from "../theme";
import { ShoppingProduct, WardrobeItem } from "../types";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { getRecommendationHistory, saveRecommendationHistory } from "../services/recommendationService";

const situations = ["데일리", "출근", "데이트", "여행", "운동", "파티", "면접", "결혼식"];
const weathers = ["🥶 추움", "🍃 선선함", "☀️ 더움", "🌧 비"];
const weatherValueMap: Record<string, string> = {
  "🥶 추움": "추움", "🍃 선선함": "선선함", "☀️ 더움": "더움", "🌧 비": "비오는 날",
};
const styleOptions = ["캐주얼", "스트릿", "미니멀", "포멀", "스포티", "빈티지", "러블리", "모던"];
const budgetOptions = ["제한없음", "~3만원", "~5만원", "~10만원", "~20만원", "20만원+"];

export function StyleRecommendScreen(): React.JSX.Element {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { items: wardrobeItems, loading: wardrobeLoading, refetch } = useWardrobeList(user?.uid);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [desiredStyle, setDesiredStyle] = useState("캐주얼");
  const [situation, setSituation] = useState("데일리");
  const [weather, setWeather] = useState("🍃 선선함");
  const [budget, setBudget] = useState("제한없음");
  const [extraRequest, setExtraRequest] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const selectedItem: WardrobeItem | null = wardrobeItems.find((i) => i.id === selectedId) ?? null;

  const runRecommend = async () => {
    if (!user) { Alert.alert("오류", "로그인이 필요합니다."); return; }
    if (!selectedItem) { Alert.alert("옷 선택", "기준이 될 옷을 먼저 선택해주세요."); return; }

    setAnalyzing(true);
    try {
      const profile = await getUserProfile(user.uid);
      const profileText = `키 ${profile?.height ?? "-"}cm, 몸무게 ${profile?.weight ?? "-"}kg, 체형 ${
        profile?.bodyType ?? "미입력"
      }, 선호 스타일 ${profile?.preferredStyle || "미입력"}`;

      const weatherValue = weatherValueMap[weather] ?? "선선함";

      const history = await getRecommendationHistory(user.uid);
      const recentFeedback = history
        .filter((h) => h.feedback)
        .slice(0, 5)
        .map((h) => `${h.occasion || "일상"}: ${h.feedback === "like" ? "좋아했음" : "별로였음"} - ${h.desiredStyle || ""}`);

      const budgetStr = budget === "제한없음" ? "제한 없음" : budget;

      const result = await requestVisionRecommendation({
        imageUrl: selectedItem.imageUrl,
        profileText,
        desiredStyle,
        occasion: situation,
        weather: weatherValue,
        budget: budgetStr,
        extraRequest: extraRequest.trim() || undefined,
        wardrobeItems: wardrobeItems.map((w) => ({ category: w.category, aiSummary: w.aiSummary })),
        recentFeedback: recentFeedback.length > 0 ? recentFeedback : undefined,
      });

      const shopResults = await runWithConcurrency(
        result.items,
        NAVER_SHOP_FETCH_CONCURRENCY,
        async (item) =>
          fetchNaverShoppingProducts(
            buildNaverSearchQuery(item.searchKeyword, {
              category: item.category,
              color: item.colorInfo,
              material: item.materialInfo,
              title: item.title,
            }),
            8,
            { budget: budgetStr },
          ).then((r) => ({
            category: item.category,
            ...r,
          })),
      );
      const products: Record<string, ShoppingProduct[]> = {};
      let shoppingError: string | undefined;
      for (const r of shopResults) {
        products[r.category] = r.products;
        if (r.error && !shoppingError) {
          shoppingError = r.error;
        }
      }

      void saveRecommendationHistory({
        uid: user.uid,
        wardrobeItemId: selectedItem.id,
        imageUrl: selectedItem.imageUrl,
        recommendation: JSON.stringify(result),
        desiredStyle,
        occasion: situation,
        weather: weatherValue,
        budget: budget === "제한없음" ? "제한 없음" : budget,
      });

      navigation.navigate("StyleResult", {
        result,
        products,
        shoppingError,
        wardrobeImageUrl: selectedItem.imageUrl,
        occasion: situation,
        weather: weatherValue,
        desiredStyle,
        budget: budget === "제한없음" ? "제한 없음" : budget,
        extraRequest: extraRequest.trim() || undefined,
        profileText,
      });
    } catch (e) {
      Alert.alert("추천 실패", e instanceof Error ? e.message : "다시 시도해주세요.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>AI 코디 추천</Text>
      <Text style={styles.pageSub}>기준 옷을 고르고 조건을 설정하세요</Text>

      {/* Step 1 — 기준 옷 선택 */}
      <View style={styles.section}>
        <StepHeader num={1} label="기준 옷 선택" sub={selectedItem ? selectedItem.category : undefined} />

        {wardrobeLoading ? (
          <ActivityIndicator color={colors.zinc900} style={{ marginVertical: 20 }} />
        ) : wardrobeItems.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="shirt-outline" size={28} color={colors.zinc400} />
            <Text style={styles.emptyText}>옷장에 옷을 먼저 등록해주세요</Text>
          </View>
        ) : (
          <View style={styles.clothesGrid}>
            {wardrobeItems.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.clothesItem, isSelected && styles.clothesItemSelected]}
                  onPress={() => setSelectedId(isSelected ? null : item.id)}
                >
                  <Image source={{ uri: item.imageUrl }} style={styles.clothesImage} />
                  {isSelected && (
                    <View style={styles.clothesOverlay}>
                      <View style={styles.checkCircle}>
                        <Ionicons name="checkmark" size={16} color={colors.zinc900} />
                      </View>
                    </View>
                  )}
                  <View style={styles.clothesNameWrap}>
                    <Text style={styles.clothesName} numberOfLines={1}>{item.category || "기타"}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Step 2 — 원하는 스타일 */}
      <View style={styles.section}>
        <StepHeader num={2} label="원하는 스타일" />
        <View style={styles.chipRow}>
          {styleOptions.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, desiredStyle === s && styles.chipActive]}
              onPress={() => setDesiredStyle(s)}
            >
              <Text style={[styles.chipText, desiredStyle === s && styles.chipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Step 3 — 상황 */}
      <View style={styles.section}>
        <StepHeader num={3} label="상황" />
        <View style={styles.chipRow}>
          {situations.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, situation === s && styles.chipActive]}
              onPress={() => setSituation(s)}
            >
              <Text style={[styles.chipText, situation === s && styles.chipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Step 4 — 날씨 */}
      <View style={styles.section}>
        <StepHeader num={4} label="날씨" />
        <View style={styles.chipRow}>
          {weathers.map((w) => (
            <Pressable
              key={w}
              style={[styles.chip, weather === w && styles.chipActive]}
              onPress={() => setWeather(w)}
            >
              <Text style={[styles.chipText, weather === w && styles.chipTextActive]}>{w}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Step 5 — 예산 */}
      <View style={styles.section}>
        <StepHeader num={5} label="예산" />
        <View style={styles.chipRow}>
          {budgetOptions.map((b) => (
            <Pressable
              key={b}
              style={[styles.chip, budget === b && styles.chipActive]}
              onPress={() => setBudget(b)}
            >
              <Text style={[styles.chipText, budget === b && styles.chipTextActive]}>{b}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Step 6 — 추가 요청 */}
      <View style={styles.section}>
        <StepHeader num={6} label="추가 요청 (선택)" />
        <TextInput
          style={styles.textInput}
          placeholder="예: 블랙톤 위주로, 오버핏 좋아해요, 상의는 제외해줘..."
          placeholderTextColor={colors.zinc400}
          value={extraRequest}
          onChangeText={setExtraRequest}
          multiline
          maxLength={200}
        />
      </View>

      {/* Selected preview */}
      {selectedItem && (
        <View style={styles.previewCard}>
          <Image source={{ uri: selectedItem.imageUrl }} style={styles.previewImage} />
          <View style={styles.previewInfo}>
            <Text style={styles.previewLabel}>선택된 기준 옷</Text>
            <Text style={styles.previewCat}>{selectedItem.category}</Text>
            <View style={styles.previewTags}>
              <Text style={styles.previewTag}>{desiredStyle}</Text>
              <Text style={styles.previewTag}>{situation}</Text>
              <Text style={styles.previewTag}>{weather}</Text>
              {budget !== "제한없음" && <Text style={styles.previewTag}>{budget}</Text>}
            </View>
          </View>
        </View>
      )}

      {/* CTA */}
      <Pressable
        style={({ pressed }) => [
          styles.ctaBtn,
          (!selectedItem || analyzing) && styles.ctaBtnDisabled,
          pressed && selectedItem && !analyzing && { transform: [{ scale: 0.98 }] },
        ]}
        onPress={() => void runRecommend()}
        disabled={!selectedItem || analyzing}
      >
        {analyzing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name="sparkles" size={20} color="#fff" />
        )}
        <Text style={styles.ctaBtnText}>
          {analyzing ? "AI가 코디를 분석 중..." : "AI 코디 추천받기"}
        </Text>
      </Pressable>

      <View style={{ height: 40 }} />
      <LoadingOverlay visible={analyzing} message={"AI가 코디를 분석하는 중...\n잠시만 기다려주세요"} />
    </ScrollView>
  );
}

function StepHeader({ num, label, sub }: { num: number; label: string; sub?: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{num}</Text></View>
      <Text style={styles.stepLabel}>{label}</Text>
      {sub && <Text style={styles.stepSub}>{sub} 선택됨</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },

  pageTitle: { fontSize: 22, fontWeight: "700", color: colors.zinc900, letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: colors.zinc400, marginTop: 4, marginBottom: spacing.lg },

  section: { marginBottom: 20 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  stepBadge: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.zinc900, alignItems: "center", justifyContent: "center",
  },
  stepBadgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  stepLabel: { fontSize: 14, fontWeight: "600", color: colors.zinc700 },
  stepSub: { marginLeft: "auto", fontSize: 12, color: colors.amber, fontWeight: "600" },

  emptyBox: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: colors.zinc400 },

  clothesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  clothesItem: {
    width: "31.5%",
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  clothesItemSelected: { borderColor: colors.zinc900 },
  clothesImage: { width: "100%", height: "100%" },
  clothesOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center", justifyContent: "center",
  },
  checkCircle: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  clothesNameWrap: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingVertical: 4, paddingHorizontal: 6,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  clothesName: { fontSize: 10, color: "#fff" },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: radius.full, backgroundColor: colors.zinc100,
  },
  chipActive: { backgroundColor: colors.zinc900 },
  chipText: { fontSize: 13, fontWeight: "500", color: colors.zinc500 },
  chipTextActive: { color: "#fff" },

  textInput: {
    backgroundColor: colors.zinc50, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.zinc200,
    paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 14, color: colors.zinc900,
    minHeight: 72, textAlignVertical: "top",
  },

  previewCard: {
    flexDirection: "row", gap: 12, alignItems: "center",
    backgroundColor: colors.zinc50, borderRadius: radius.md,
    padding: 12, marginBottom: 16,
  },
  previewImage: { width: 56, height: 56, borderRadius: radius.sm },
  previewInfo: { flex: 1, gap: 4 },
  previewLabel: { fontSize: 11, color: colors.zinc400, fontWeight: "600" },
  previewCat: { fontSize: 14, fontWeight: "700", color: colors.zinc900 },
  previewTags: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  previewTag: {
    fontSize: 10, color: colors.zinc500, fontWeight: "600",
    backgroundColor: colors.zinc100, paddingVertical: 2, paddingHorizontal: 8,
    borderRadius: radius.full, overflow: "hidden",
  },

  ctaBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: colors.zinc900,
    borderRadius: radius.lg, paddingVertical: 16,
  },
  ctaBtnDisabled: { backgroundColor: colors.zinc200 },
  ctaBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
