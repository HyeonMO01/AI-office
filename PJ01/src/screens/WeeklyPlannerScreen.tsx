import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../hooks/useAuth";
import { useWardrobeList } from "../hooks/useWardrobeList";
import { getUserProfile } from "../services/userProfileService";
import { proxyPost } from "../services/apiProxy";
import { colors, radius, shadow, spacing } from "../theme";
import { WardrobeItem } from "../types";

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

interface DayPlan {
  id?: string;
  date: string;
  itemIds: string[];
  note: string;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonthDay(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getWeekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return formatDate(d);
  });
}

function isToday(dateStr: string): boolean {
  return dateStr === formatDate(new Date());
}

function isPast(dateStr: string): boolean {
  return dateStr < formatDate(new Date());
}

interface AISuggestion {
  day: string;
  items: string[];
  reason: string;
}

export function WeeklyPlannerScreen(): React.JSX.Element {
  const { user } = useAuth();
  const { items: wardrobeItems } = useWardrobeList(user?.uid);

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const weekDates = getWeekDates(weekStart);

  const [plans, setPlans] = useState<Record<string, DayPlan>>({});
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [aiLoading, setAiLoading] = useState(false);

  const loadPlans = useCallback(async () => {
    if (!user) return;
    try {
      const colRef = collection(db, "users", user.uid, "outfitLog");
      const q = query(
        colRef,
        where("date", ">=", weekDates[0]),
        where("date", "<=", weekDates[6]),
      );
      const snap = await getDocs(q);
      const map: Record<string, DayPlan> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as Omit<DayPlan, "id">;
        map[data.date] = { id: d.id, ...data };
      });
      setPlans(map);
    } catch { /* silent */ }
  }, [user, weekDates[0], weekDates[6]]);

  useFocusEffect(useCallback(() => { void loadPlans(); }, [loadPlans]));

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const openPicker = (date: string) => {
    setPickerDate(date);
    const existing = plans[date];
    setSelectedItems(new Set(existing?.itemIds ?? []));
  };

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const savePlan = async () => {
    if (!user || !pickerDate) return;
    try {
      const existing = plans[pickerDate];
      if (existing?.id) {
        await deleteDoc(doc(db, "users", user.uid, "outfitLog", existing.id));
      }
      if (selectedItems.size > 0) {
        await addDoc(collection(db, "users", user.uid, "outfitLog"), {
          date: pickerDate,
          itemIds: [...selectedItems],
          note: "",
        });
      }
      setPickerDate(null);
      setSelectedItems(new Set());
      void loadPlans();
    } catch {
      Alert.alert("오류", "저장에 실패했습니다.");
    }
  };

  const deletePlan = async (date: string) => {
    if (!user) return;
    const plan = plans[date];
    if (!plan?.id) return;
    Alert.alert("계획 삭제", "이 날의 코디 계획을 삭제할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제", style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, "users", user.uid, "outfitLog", plan.id!));
          void loadPlans();
        },
      },
    ]);
  };

  const generateAIPlan = async () => {
    if (!user || wardrobeItems.length === 0) return;
    setAiLoading(true);
    try {
      const profile = await getUserProfile(user.uid);
      const itemList = wardrobeItems
        .slice(0, 20)
        .map((i) => `${i.category}(${i.aiSummary?.slice(0, 30) ?? ""})`)
        .join(", ");
      const daysLeft = weekDates.filter((d) => !isPast(d) || isToday(d));
      const dayNames = daysLeft.map((d, i) => `${DAY_LABELS[weekDates.indexOf(d)]}요일(${formatMonthDay(d)})`).join(", ");

      const prompt = `
패션 앱 fizzylush 사용자의 주간 코디 계획을 세워주세요.

사용자 정보: 키 ${profile?.height ?? "-"}cm, 체형 ${profile?.bodyType ?? "미입력"}, 선호 스타일 ${profile?.preferredStyle || "미입력"}
옷장 (상위 20개): ${itemList}
계획할 요일: ${dayNames}

각 요일별로 옷장에서 2~3개 아이템을 선택해서 코디를 제안해주세요.
아이템은 옷장 목록에 있는 카테고리 이름으로 지정해주세요.

JSON 배열 형식으로만 응답해주세요:
[{"day": "월요일", "items": ["상의", "하의"], "reason": "한 줄 이유"}, ...]
      `.trim();

      const res = await proxyPost<{ choices: Array<{ message: { content: string } }> }>(
        "/api/openai/chat-completions",
        {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 600,
          response_format: { type: "json_object" },
        },
        30000,
      );

      let suggestions: AISuggestion[] = [];
      try {
        const raw = res.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw);
        suggestions = Array.isArray(parsed) ? parsed : (parsed.days ?? parsed.plan ?? []);
      } catch { /* ignore parse */ }

      if (suggestions.length === 0) {
        Alert.alert("AI 플랜", "제안을 생성하지 못했습니다. 다시 시도해주세요.");
        return;
      }

      Alert.alert(
        "AI 주간 플랜 완성",
        suggestions.map((s) => `${s.day}: ${s.items.join(" + ")}`).join("\n"),
        [
          { text: "취소", style: "cancel" },
          {
            text: "적용",
            onPress: async () => {
              if (!user) return;
              for (const s of suggestions) {
                const dayIdx = ["월요일","화요일","수요일","목요일","금요일","토요일","일요일"].indexOf(s.day);
                if (dayIdx === -1) continue;
                const date = weekDates[dayIdx];
                if (!date || isPast(date)) continue;
                const matchedIds = wardrobeItems
                  .filter((item) => s.items.some((cat: string) => item.category.includes(cat) || cat.includes(item.category)))
                  .slice(0, 3)
                  .map((i) => i.id);
                if (matchedIds.length === 0) continue;
                const existing = plans[date];
                if (existing?.id) await deleteDoc(doc(db, "users", user.uid, "outfitLog", existing.id));
                await addDoc(collection(db, "users", user.uid, "outfitLog"), {
                  date,
                  itemIds: matchedIds,
                  note: s.reason ?? "",
                });
              }
              void loadPlans();
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert("실패", e instanceof Error ? e.message : "다시 시도해주세요.");
    } finally {
      setAiLoading(false);
    }
  };

  const getItemsForPlan = (plan: DayPlan): WardrobeItem[] =>
    plan.itemIds.map((id) => wardrobeItems.find((w) => w.id === id)).filter(Boolean) as WardrobeItem[];

  const weekLabel = `${weekDates[0].slice(5).replace("-", "/")} ~ ${weekDates[6].slice(5).replace("-", "/")}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* 주간 네비게이션 */}
      <View style={styles.weekNav}>
        <Pressable onPress={prevWeek} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={colors.zinc600} />
        </Pressable>
        <Text style={styles.weekLabel}>{weekLabel}</Text>
        <Pressable onPress={nextWeek} hitSlop={12}>
          <Ionicons name="chevron-forward" size={20} color={colors.zinc600} />
        </Pressable>
      </View>

      {/* AI 플랜 버튼 */}
      <Pressable
        style={[styles.aiBtn, shadow.sm, aiLoading && { opacity: 0.6 }]}
        onPress={() => void generateAIPlan()}
        disabled={aiLoading}
      >
        {aiLoading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Ionicons name="sparkles" size={16} color="#fff" />}
        <Text style={styles.aiBtnText}>
          {aiLoading ? "AI 플랜 생성 중..." : "AI 주간 코디 자동 생성"}
        </Text>
      </Pressable>

      {/* 주간 그리드 */}
      <View style={[styles.weekGrid, shadow.sm]}>
        {weekDates.map((date, i) => {
          const plan = plans[date];
          const dayItems = plan ? getItemsForPlan(plan) : [];
          const today = isToday(date);
          const past = isPast(date) && !today;

          return (
            <View key={date} style={[styles.dayCol, i < 6 && styles.dayColBorder]}>
              {/* 요일 헤더 */}
              <View style={[styles.dayHeader, today && styles.dayHeaderToday]}>
                <Text style={[styles.dayLabel, today && styles.dayLabelToday, i >= 5 && styles.dayLabelWeekend]}>
                  {DAY_LABELS[i]}
                </Text>
                <Text style={[styles.dayDate, today && styles.dayLabelToday]}>
                  {formatMonthDay(date)}
                </Text>
              </View>

              {/* 코디 아이템 미리보기 */}
              <Pressable
                style={[styles.dayBody, past && styles.dayBodyPast]}
                onPress={() => !past && openPicker(date)}
                onLongPress={() => plan && deletePlan(date)}
              >
                {dayItems.length > 0 ? (
                  <View style={styles.dayItemsWrap}>
                    {dayItems.slice(0, 2).map((item) => (
                      <Image key={item.id} source={{ uri: item.imageUrl }} style={styles.dayItemImg} />
                    ))}
                    {dayItems.length > 2 && (
                      <View style={styles.moreChip}>
                        <Text style={styles.moreChipText}>+{dayItems.length - 2}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.emptyDay}>
                    {past
                      ? <Ionicons name="remove-outline" size={16} color={colors.zinc200} />
                      : <Ionicons name="add" size={18} color={colors.zinc300} />}
                  </View>
                )}
              </Pressable>
            </View>
          );
        })}
      </View>

      <Text style={styles.hint}>탭: 코디 추가 · 길게 누르기: 삭제</Text>

      {/* 당일 계획 상세 */}
      {weekDates.map((date) => {
        const plan = plans[date];
        if (!plan) return null;
        const dayItems = getItemsForPlan(plan);
        const dayIdx = weekDates.indexOf(date);
        return (
          <View key={date} style={[styles.planCard, shadow.sm]}>
            <View style={styles.planCardHeader}>
              <View style={[styles.planDayBadge, isToday(date) && { backgroundColor: colors.zinc900 }]}>
                <Text style={[styles.planDayBadgeText, isToday(date) && { color: "#fff" }]}>
                  {DAY_LABELS[dayIdx]}요일
                </Text>
              </View>
              <Text style={styles.planDate}>{formatMonthDay(date)}</Text>
              {plan.note ? <Text style={styles.planNote} numberOfLines={1}>{plan.note}</Text> : null}
            </View>
            <View style={styles.planItems}>
              {dayItems.map((item) => (
                <View key={item.id} style={styles.planItem}>
                  <Image source={{ uri: item.imageUrl }} style={styles.planItemImg} />
                  <Text style={styles.planItemCat}>{item.category}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {/* 옷 선택 피커 */}
      {pickerDate ? (
        <View style={[styles.pickerWrap, shadow.md]}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{formatMonthDay(pickerDate)} 코디 선택</Text>
            <Pressable onPress={() => setPickerDate(null)}>
              <Ionicons name="close" size={20} color={colors.zinc400} />
            </Pressable>
          </View>
          <View style={styles.pickerGrid}>
            {wardrobeItems.map((item) => {
              const chosen = selectedItems.has(item.id);
              return (
                <Pressable
                  key={item.id}
                  style={[styles.pickerItem, chosen && styles.pickerItemActive]}
                  onPress={() => toggleItem(item.id)}
                >
                  <Image source={{ uri: item.imageUrl }} style={styles.pickerItemImg} />
                  {chosen && (
                    <View style={styles.pickerCheck}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={[styles.pickerSave, selectedItems.size === 0 && { opacity: 0.4 }]}
            onPress={() => void savePlan()}
            disabled={selectedItems.size === 0}
          >
            <Text style={styles.pickerSaveText}>{selectedItems.size}개 저장</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: 48 },

  weekNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  weekLabel: { fontSize: 16, fontWeight: "700", color: colors.zinc900 },

  aiBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 13,
  },
  aiBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  weekGrid: {
    flexDirection: "row", backgroundColor: colors.surface,
    borderRadius: radius.lg, overflow: "hidden",
    borderWidth: 1, borderColor: colors.border,
  },
  dayCol: { flex: 1 },
  dayColBorder: { borderRightWidth: 1, borderRightColor: colors.border },
  dayHeader: { paddingVertical: 8, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  dayHeaderToday: { backgroundColor: colors.primaryLight },
  dayLabel: { fontSize: 12, fontWeight: "700", color: colors.zinc600 },
  dayLabelToday: { color: colors.primary },
  dayLabelWeekend: { color: "#EF4444" },
  dayDate: { fontSize: 10, color: colors.zinc400, marginTop: 1 },

  dayBody: { height: 72, alignItems: "center", justifyContent: "center", padding: 4 },
  dayBodyPast: { opacity: 0.4 },
  dayItemsWrap: { alignItems: "center", gap: 2 },
  dayItemImg: { width: 28, height: 28, borderRadius: 4 },
  moreChip: {
    backgroundColor: colors.zinc200, borderRadius: 4,
    paddingVertical: 1, paddingHorizontal: 4,
  },
  moreChipText: { fontSize: 9, fontWeight: "700", color: colors.zinc600 },
  emptyDay: { alignItems: "center", justifyContent: "center" },

  hint: { fontSize: 11, color: colors.zinc400, textAlign: "center" },

  planCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, gap: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  planCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  planDayBadge: {
    backgroundColor: colors.zinc100, borderRadius: radius.sm,
    paddingVertical: 3, paddingHorizontal: 8,
  },
  planDayBadgeText: { fontSize: 12, fontWeight: "700", color: colors.zinc700 },
  planDate: { fontSize: 13, color: colors.zinc500 },
  planNote: { flex: 1, fontSize: 12, color: colors.subText },
  planItems: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  planItem: { alignItems: "center", gap: 4 },
  planItemImg: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  planItemCat: { fontSize: 10, color: colors.zinc400 },

  pickerWrap: {
    backgroundColor: colors.zinc50, borderRadius: radius.lg,
    padding: 16, gap: 12,
  },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerTitle: { fontSize: 15, fontWeight: "700", color: colors.zinc900 },
  pickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pickerItem: {
    width: "23%", aspectRatio: 1, borderRadius: radius.sm,
    overflow: "hidden", borderWidth: 2, borderColor: "transparent", position: "relative",
  },
  pickerItemActive: { borderColor: colors.zinc900 },
  pickerItemImg: { width: "100%", height: "100%" },
  pickerCheck: {
    position: "absolute", top: 2, right: 2, width: 18, height: 18,
    borderRadius: 9, backgroundColor: colors.zinc900,
    alignItems: "center", justifyContent: "center",
  },
  pickerSave: {
    backgroundColor: colors.zinc900, borderRadius: radius.md,
    paddingVertical: 13, alignItems: "center",
  },
  pickerSaveText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
