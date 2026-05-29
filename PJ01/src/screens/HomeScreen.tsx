import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { CompositeScreenProps, useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { MainTabParamList } from "../navigation/MainTabNavigator";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../hooks/useAuth";
import { useWardrobeList } from "../hooks/useWardrobeList";
import { deleteWardrobeItem, updateWardrobeItem } from "../services/wardrobeService";
import { colors, radius, shadow, spacing } from "../theme";
import { getUserProfile } from "../services/userProfileService";
import { WardrobeItem } from "../types";
import { FILTER_CATEGORIES, WARDROBE_CATEGORIES } from "../constants/categories";
import { DailyOutfitSuggestion, generateDailySuggestions } from "../services/smartRecommendService";
import { getCurrentWeather, getWeatherEmoji, getWeatherCategory, WeatherData } from "../services/weatherService";

function wardrobeKeysFingerprint(items: WardrobeItem[]): string {
  return [...items].map((i) => i.id).sort().join("|");
}

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Home">,
  NativeStackScreenProps<RootStackParamList>
>;

export function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { user } = useAuth();
  const { items, loading, refetch } = useWardrobeList(user?.uid);
  const [nickname, setNickname] = useState("사용자");
  const [activeCategory, setActiveCategory] = useState("전체");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [dailySuggestions, setDailySuggestions] = useState<DailyOutfitSuggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [dailyOutfitLoading, setDailyOutfitLoading] = useState(false);
  const [dailyGenExhausted, setDailyGenExhausted] = useState(false);
  const dailyGenInFlight = useRef(false);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const profile = await getUserProfile(user.uid);
      setNickname(profile?.nickname ?? "사용자");

      try {
        const w = await getCurrentWeather();
        setWeather(w);
      } catch { /* location permission not granted, fallback */ }
    };
    void load();
  }, [user]);

  /** 캐시 유효성 확인 → 무효화 → AI 생성을 순차적으로 실행 (레이스 컨디션 방지) */
  useEffect(() => {
    if (!user || items.length === 0) return;
    let cancelled = false;

    const run = async () => {
      const fp = wardrobeKeysFingerprint(items);
      const today = new Date().toISOString().slice(0, 10);
      const wKey = `${weather?.temp ?? ""}|${weather?.description ?? ""}`;
      let needsGeneration = dailySuggestions.length === 0 && !dailyGenExhausted;

      try {
        const [[, storedDate], [, storedFp], [, storedW]] = await AsyncStorage.multiGet([
          "@fizzylush/daily_outfit_date",
          "@fizzylush/daily_outfit_fp",
          "@fizzylush/daily_outfit_weather",
        ]);
        if (cancelled) return;
        if (storedDate !== today || storedFp !== fp || storedW !== wKey) {
          setDailySuggestions([]);
          setDailyGenExhausted(false);
          setActiveSuggestion(0);
          await AsyncStorage.multiSet([
            ["@fizzylush/daily_outfit_date", today],
            ["@fizzylush/daily_outfit_fp", fp],
            ["@fizzylush/daily_outfit_weather", wKey],
          ]);
          needsGeneration = true;
        }
      } catch {
        /* ignore cache errors */
      }

      if (cancelled || !needsGeneration || dailyGenInFlight.current) return;

      dailyGenInFlight.current = true;
      setDailyOutfitLoading(true);
      try {
        const s = await generateDailySuggestions({
          uid: user.uid,
          wardrobeItems: items,
          weatherDesc: weather?.description,
          temperature: weather?.temp,
        });
        if (cancelled) return;
        if (s.length > 0) setDailySuggestions(s);
        else setDailyGenExhausted(true);
      } catch {
        if (!cancelled) setDailyGenExhausted(true);
      } finally {
        dailyGenInFlight.current = false;
        if (!cancelled) setDailyOutfitLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      dailyGenInFlight.current = false;
    };
  }, [user, items, weather?.temp, weather?.description, dailySuggestions.length, dailyGenExhausted]);

  useFocusEffect(
    React.useCallback(() => { void refetch(); }, [refetch]),
  );

  const refreshDailyOutfit = () => {
    setDailyGenExhausted(false);
    setDailySuggestions([]);
    setActiveSuggestion(0);
  };

  const filtered = activeCategory === "전체"
    ? items
    : items.filter((i) => i.category === activeCategory);

  const displayItems = showAll ? filtered : filtered.slice(0, 6);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      "선택 삭제",
      `${selectedIds.size}개 아이템을 삭제할까요?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            try {
              const toDelete = items.filter((i) => selectedIds.has(i.id));
              await Promise.all(toDelete.map((i) => deleteWardrobeItem(user.uid, i.id, i.imageUrl)));
              exitSelectMode();
              void refetch();
            } catch {
              Alert.alert("오류", "일부 삭제에 실패했습니다.");
            }
          },
        },
      ],
    );
  };

  const handleLongPress = (item: WardrobeItem) => {
    if (selectMode) return;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["선택 모드", "카테고리 변경", "삭제", "취소"], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (idx) => {
          if (idx === 0) { setSelectMode(true); setSelectedIds(new Set([item.id])); }
          else if (idx === 1) handleChangeCategory(item);
          else if (idx === 2) handleDelete(item);
        },
      );
    } else {
      Alert.alert(
        "옷장 관리",
        `${item.category || "기타"} 아이템`,
        [
          { text: "선택 모드", onPress: () => { setSelectMode(true); setSelectedIds(new Set([item.id])); } },
          { text: "카테고리 변경", onPress: () => handleChangeCategory(item) },
          { text: "삭제", style: "destructive", onPress: () => handleDelete(item) },
          { text: "취소", style: "cancel" },
        ],
      );
    }
  };

  const handleDelete = (item: WardrobeItem) => {
    Alert.alert("옷 삭제", `"${item.category}" 아이템을 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          if (!user) return;
          try {
            await deleteWardrobeItem(user.uid, item.id, item.imageUrl);
            void refetch();
          } catch {
            Alert.alert("오류", "삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  const handleChangeCategory = (item: WardrobeItem) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...WARDROBE_CATEGORIES, "취소"], cancelButtonIndex: WARDROBE_CATEGORIES.length, title: "카테고리 변경" },
        async (idx) => {
          if (idx < WARDROBE_CATEGORIES.length && user) {
            await updateWardrobeItem(user.uid, item.id, { category: WARDROBE_CATEGORIES[idx] });
            void refetch();
          }
        },
      );
    } else {
      Alert.alert(
        "카테고리 변경",
        "새 카테고리를 선택하세요",
        [
          ...WARDROBE_CATEGORIES.map((cat) => ({
            text: cat,
            onPress: async () => {
              if (!user) return;
              await updateWardrobeItem(user.uid, item.id, { category: cat });
              void refetch();
            },
          })),
          { text: "취소", style: "cancel" as const },
        ],
      );
    }
  };

  const renderItem = ({ item }: { item: WardrobeItem }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <Pressable
        style={({ pressed }) => [styles.gridItem, pressed && { opacity: 0.9 }]}
        onPress={() => {
          if (selectMode) {
            toggleSelect(item.id);
          } else {
            if (Platform.OS === "ios") {
              ActionSheetIOS.showActionSheetWithOptions(
                { options: ["AI 코디 추천", "옷 터치 추천", "취소"], cancelButtonIndex: 2 },
                (idx) => {
                  if (idx === 0) navigation.navigate("Recommend", { wardrobeItemId: item.id, imageUrl: item.imageUrl });
                  else if (idx === 1) navigation.navigate("OutfitTouch", { wardrobeItemId: item.id, imageUrl: item.imageUrl });
                },
              );
            } else {
              Alert.alert("추천 방식 선택", "", [
                { text: "AI 코디 추천", onPress: () => navigation.navigate("Recommend", { wardrobeItemId: item.id, imageUrl: item.imageUrl }) },
                { text: "옷 터치 추천", onPress: () => navigation.navigate("OutfitTouch", { wardrobeItemId: item.id, imageUrl: item.imageUrl }) },
                { text: "취소", style: "cancel" },
              ]);
            }
          }
        }}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
      >
        <Image source={{ uri: item.imageUrl }} style={styles.gridImage} />
        <View style={styles.gridNameWrap}>
          <Text style={styles.gridName} numberOfLines={1}>{item.category || "기타"}</Text>
        </View>
        {selectMode && (
          <View style={styles.selectOverlay}>
            <View style={[styles.selectCircle, isSelected && styles.selectCircleActive]}>
              {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={displayItems}
        keyExtractor={(i) => i.id}
        numColumns={3}
        refreshing={loading}
        onRefresh={refetch}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* 인사 헤더 */}
            <View style={styles.header}>
              <View>
                <Text style={styles.greeting}>안녕하세요 👋</Text>
                <Text style={styles.nickname}>{nickname}님</Text>
              </View>
              <Pressable
                style={styles.bellBtn}
                onPress={() => navigation.navigate("RecommendationHistory")}
              >
                <Ionicons name="notifications-outline" size={18} color={colors.zinc600} />
              </Pressable>
            </View>

            {/* Weather + AI Hero */}
            {weather && (
              <View style={styles.weatherRow}>
                <Text style={styles.weatherEmoji}>{getWeatherEmoji(weather.description)}</Text>
                <Text style={styles.weatherText}>{weather.temp}° {weather.city}</Text>
                <Text style={styles.weatherCat}>{getWeatherCategory(weather.temp)}</Text>
              </View>
            )}

            {items.length > 0 && (dailySuggestions.length > 0 || dailyOutfitLoading) ? (
              <View style={styles.todayHeaderRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.todayLabel}>오늘의 코디</Text>
                  <Text style={styles.todaySub}>
                    {dailySuggestions.length > 0
                      ? "맞춤 3벌 — 마음에 들면 스타일 추천으로 이어가 보세요"
                      : "AI가 옷장과 날씨를 보고 조합 중이에요"}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.todayRefreshBtn, pressed && { opacity: 0.75 }]}
                  onPress={refreshDailyOutfit}
                  disabled={dailyOutfitLoading}
                  accessibilityRole="button"
                  accessibilityLabel="오늘의 코디 새로고침"
                >
                  <Ionicons name="refresh" size={20} color={dailyOutfitLoading ? colors.zinc300 : colors.zinc700} />
                </Pressable>
              </View>
            ) : null}

            {dailyOutfitLoading && dailySuggestions.length === 0 && items.length > 0 ? (
              <View style={styles.dailyLoadingCard}>
                <ActivityIndicator color={colors.zinc900} />
                <Text style={styles.dailyLoadingText}>오늘의 코디 준비 중…</Text>
              </View>
            ) : dailySuggestions.length > 0 ? (
              <View style={styles.suggestionsWrap}>
                <ScrollView
                  horizontal pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width);
                    setActiveSuggestion(idx);
                  }}
                >
                  {dailySuggestions.map((s, idx) => (
                    <Pressable
                      key={idx}
                      style={styles.suggestionCard}
                      onPress={() => {
                        const parent = navigation.getParent();
                        if (parent) parent.navigate("StyleRecommend");
                      }}
                    >
                      <View style={styles.suggestionTopRow}>
                        <View style={styles.suggestionBadge}>
                          <Ionicons name="sparkles" size={11} color={colors.amber} />
                          <Text style={styles.suggestionBadgeText}>AI 추천 #{idx + 1}</Text>
                        </View>
                        {s.mood ? <Text style={styles.suggestionMood}>{s.mood}</Text> : null}
                      </View>
                      <Text style={styles.suggestionTitle}>{s.title}</Text>
                      <Text style={styles.suggestionDesc}>{s.description}</Text>
                      <View style={styles.suggestionItems}>
                        {s.items.map((item, i) => (
                          <View key={i} style={styles.suggestionItem}>
                            <Text style={styles.suggestionItemCat}>{item.category}</Text>
                            <Text style={styles.suggestionItemText} numberOfLines={1}>{item.suggestion}</Text>
                          </View>
                        ))}
                      </View>
                      {s.reason ? (
                        <Text style={styles.suggestionReason} numberOfLines={2}>{s.reason}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.dotsRow}>
                  {dailySuggestions.map((_, i) => (
                    <View key={i} style={[styles.dot, i === activeSuggestion && styles.dotActive]} />
                  ))}
                </View>
              </View>
            ) : (
              <Pressable
                style={styles.heroCard}
                onPress={() => {
                  if (items.length > 0) {
                    const last = items[0];
                    navigation.navigate("Recommend", { wardrobeItemId: last.id, imageUrl: last.imageUrl });
                  }
                }}
              >
                {items.length > 0 ? (
                  <Image source={{ uri: items[0].imageUrl }} style={styles.heroImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.heroImage, { backgroundColor: colors.zinc100 }]} />
                )}
                <View style={styles.heroGradient}>
                  <View style={styles.heroBadge}>
                    <Ionicons name="sparkles" size={12} color={colors.amber} />
                    <Text style={styles.heroBadgeText}>AI PICK</Text>
                  </View>
                  <Text style={styles.heroTitle}>오늘의 AI 추천 코디</Text>
                  <Text style={styles.heroSub}>내 옷장에서 최고의 조합을 찾아보세요</Text>
                </View>
              </Pressable>
            )}

            {/* 내 옷장 헤더 */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>내 옷장</Text>
              <View style={styles.sectionActions}>
                {selectMode ? (
                  <>
                    <Pressable onPress={handleBulkDelete}>
                      <Text style={styles.deleteText}>삭제 ({selectedIds.size})</Text>
                    </Pressable>
                    <Pressable onPress={exitSelectMode}>
                      <Text style={styles.cancelText}>취소</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable onPress={() => setSelectMode(true)}>
                      <Text style={styles.selectText}>선택</Text>
                    </Pressable>
                    <Pressable onPress={() => setShowAll(!showAll)}>
                      <View style={styles.seeAllRow}>
                        <Text style={styles.seeAllText}>{showAll ? "접기" : "전체보기"}</Text>
                        <Ionicons name={showAll ? "chevron-up" : "chevron-forward"} size={14} color={colors.zinc400} />
                      </View>
                    </Pressable>
                  </>
                )}
              </View>
            </View>

            {/* 카테고리 필터 */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catScroll}
            >
              {FILTER_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.catChip, activeCategory === cat && styles.catChipActive]}
                  onPress={() => setActiveCategory(cat)}
                >
                  <Text style={[styles.catChipText, activeCategory === cat && styles.catChipTextActive]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="shirt-outline" size={44} color={colors.zinc400} />
            <Text style={styles.emptyTitle}>아직 옷이 없어요</Text>
            <Text style={styles.emptyDesc}>하단 + 버튼을 눌러 첫 번째 옷을 추가해보세요</Text>
          </View>
        }
        renderItem={renderItem}
        ListFooterComponent={<View style={{ height: 100 }} />}
      />

      {/* 하단 AI CTA */}
      {!selectMode && (
        <Pressable
          style={({ pressed }) => [styles.bottomCta, shadow.lg, pressed && { transform: [{ scale: 0.98 }] }]}
          onPress={() => {
            const parent = navigation.getParent();
            if (parent) parent.navigate("StyleRecommend");
          }}
        >
          <View style={styles.ctaIconWrap}>
            <Ionicons name="sparkles" size={20} color={colors.amber} />
          </View>
          <View style={styles.ctaTextWrap}>
            <Text style={styles.ctaTitle}>AI 코디 추천받기</Text>
            <Text style={styles.ctaSub}>내 옷으로 스타일링</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.zinc500} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingHorizontal: 20 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  greeting: { fontSize: 13, color: colors.zinc400, marginBottom: 2 },
  nickname: { fontSize: 22, fontWeight: "700", color: colors.zinc900, letterSpacing: -0.5 },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.zinc100,
    alignItems: "center", justifyContent: "center",
  },

  weatherRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginBottom: 12,
  },
  weatherEmoji: { fontSize: 20 },
  weatherText: { fontSize: 14, fontWeight: "600", color: colors.zinc700 },
  weatherCat: {
    fontSize: 11, fontWeight: "600", color: colors.amber,
    backgroundColor: "#FFFBEB", paddingVertical: 2, paddingHorizontal: 8,
    borderRadius: radius.full, overflow: "hidden",
  },

  todayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  todayLabel: { fontSize: 16, fontWeight: "700", color: colors.zinc900, letterSpacing: -0.3 },
  todaySub: { fontSize: 12, color: colors.zinc500, marginTop: 2 },
  todayRefreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.zinc100,
    alignItems: "center",
    justifyContent: "center",
  },
  dailyLoadingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.zinc50,
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  dailyLoadingText: { fontSize: 14, fontWeight: "600", color: colors.zinc600 },

  suggestionsWrap: { marginBottom: spacing.lg },
  suggestionCard: {
    width: 320,
    backgroundColor: colors.zinc900,
    borderRadius: radius.lg, padding: spacing.md,
    marginRight: 12,
  },
  suggestionTopRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  suggestionBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  suggestionBadgeText: { fontSize: 11, fontWeight: "600", color: colors.amber },
  suggestionMood: {
    fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.6)",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, overflow: "hidden",
  },
  suggestionTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 4 },
  suggestionDesc: { fontSize: 12, color: colors.zinc400, marginBottom: 12 },
  suggestionReason: {
    fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 16, marginTop: 8,
  },
  suggestionItems: { gap: 6 },
  suggestionItem: {
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  suggestionItemCat: {
    fontSize: 10, fontWeight: "700", color: colors.amber,
    backgroundColor: "rgba(251,191,36,0.15)",
    paddingVertical: 2, paddingHorizontal: 6,
    borderRadius: 4, overflow: "hidden",
    width: 52, textAlign: "center",
  },
  suggestionItemText: { fontSize: 12, color: "rgba(255,255,255,0.7)", flex: 1 },
  dotsRow: {
    flexDirection: "row", justifyContent: "center",
    gap: 6, marginTop: 10,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.zinc200,
  },
  dotActive: { backgroundColor: colors.zinc900, width: 18 },

  heroCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.lg,
    aspectRatio: 16 / 9,
    position: "relative",
  },
  heroImage: { width: "100%", height: "100%" },
  heroGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: spacing.md,
    paddingTop: 48,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  heroBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    marginBottom: 6,
  },
  heroBadgeText: { fontSize: 11, fontWeight: "700", color: colors.amber, letterSpacing: 0.5, textTransform: "uppercase" },
  heroTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  heroSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 },

  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: colors.zinc900 },
  sectionActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  seeAllRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 13, color: colors.zinc400 },
  selectText: { fontSize: 13, fontWeight: "600", color: colors.zinc500 },
  deleteText: { fontSize: 13, fontWeight: "700", color: "#EF4444" },
  cancelText: { fontSize: 13, fontWeight: "600", color: colors.zinc500 },

  catScroll: { gap: 8, marginBottom: spacing.md, paddingRight: 4 },
  catChip: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: radius.full, backgroundColor: colors.zinc100,
  },
  catChipActive: { backgroundColor: colors.zinc900 },
  catChipText: { fontSize: 13, fontWeight: "500", color: colors.zinc500 },
  catChipTextActive: { color: "#fff" },

  gridRow: { gap: 1, marginBottom: 1 },
  gridItem: {
    flex: 1,
    maxWidth: "33.33%",
    aspectRatio: 1,
    overflow: "hidden",
    position: "relative",
    backgroundColor: colors.zinc100,
  },
  gridImage: { width: "100%", height: "100%" },
  gridNameWrap: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  gridName: { fontSize: 11, color: "#fff" },
  selectOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.15)",
    justifyContent: "flex-start", alignItems: "flex-end",
    padding: 6,
  },
  selectCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  selectCircleActive: {
    backgroundColor: colors.zinc900,
    borderColor: colors.zinc900,
  },

  emptyWrap: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.zinc900 },
  emptyDesc: { fontSize: 13, color: colors.zinc400, textAlign: "center" },

  bottomCta: {
    position: "absolute", bottom: 16, left: 20, right: 20,
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.zinc900, borderRadius: radius.lg,
    padding: 16,
  },
  ctaIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  ctaTextWrap: { flex: 1 },
  ctaTitle: { fontSize: 14, fontWeight: "700", color: "#fff" },
  ctaSub: { fontSize: 12, color: colors.zinc400, marginTop: 1 },
});
