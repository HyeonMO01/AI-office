import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../hooks/useAuth";
import {
  deleteRecommendationHistory,
  getRecommendationHistory,
  parseRecommendationPayload,
} from "../services/recommendationService";
import { RecommendationHistory } from "../types";
import { colors, radius } from "../theme";

export function RecommendationHistoryScreen(): React.JSX.Element {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [list, setList] = useState<RecommendationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getRecommendationHistory(user.uid);
      setList(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
      return () => {
        setSelectMode(false);
        setSelectedIds(new Set());
      };
    }, [loadHistory]),
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === list.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.map((i) => i.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      "히스토리 삭제",
      `${selectedIds.size}개의 기록을 삭제할까요?`,
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            try {
              const promises = [...selectedIds].map((id) =>
                deleteRecommendationHistory(user.uid, id),
              );
              await Promise.all(promises);
              setList((prev) => prev.filter((h) => !selectedIds.has(h.id)));
              exitSelectMode();
            } catch {
              Alert.alert("오류", "일부 삭제에 실패했습니다.");
            }
          },
        },
      ],
    );
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        list.length > 0 ? (
          selectMode ? (
            <View style={styles.headerActions}>
              <Pressable onPress={selectAll} hitSlop={8}>
                <Text style={styles.headerActionText}>
                  {selectedIds.size === list.length ? "전체 해제" : "전체 선택"}
                </Text>
              </Pressable>
              <Pressable onPress={exitSelectMode} hitSlop={8}>
                <Text style={styles.headerCancelText}>취소</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setSelectMode(true)} hitSlop={8}>
              <Text style={styles.headerActionText}>선택</Text>
            </Pressable>
          )
        ) : null,
    });
  }, [navigation, list.length, selectMode, selectedIds.size]);

  const formatDate = (ts: unknown) => {
    if (!ts) return "";
    const millis = typeof ts === "number" ? ts : typeof ts === "object" && ts !== null && "toMillis" in ts ? (ts as { toMillis: () => number }).toMillis() : Number(ts);
    const d = new Date(millis);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  };

  const renderItem = ({ item }: { item: RecommendationHistory }) => {
    const rec = parseRecommendationPayload(item.recommendation);
    const isSelected = selectedIds.has(item.id);
    const categories = rec?.items?.map((i) => i.category).filter(Boolean) ?? [];

    return (
      <Pressable
        style={[styles.card, isSelected && styles.cardSelected]}
        onPress={() => {
          if (selectMode) toggleSelect(item.id);
        }}
        onLongPress={() => {
          if (!selectMode) {
            setSelectMode(true);
            setSelectedIds(new Set([item.id]));
          }
        }}
      >
        {selectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        )}

        <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />

        <View style={styles.cardContent}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
            {item.occasion && (
              <View style={styles.tagChip}>
                <Text style={styles.tagText}>{item.occasion}</Text>
              </View>
            )}
            {item.weather && (
              <View style={styles.tagChip}>
                <Text style={styles.tagText}>{item.weather}</Text>
              </View>
            )}
          </View>

          <Text style={styles.cardSummary} numberOfLines={2}>
            {rec?.summary || "코디 추천 결과"}
          </Text>

          {categories.length > 0 && (
            <Text style={styles.cardCategories} numberOfLines={1}>
              {categories.join(" · ")}
            </Text>
          )}
          {item.feedback === "dislike" ? (
            <Pressable
              style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}
              onPress={() => {
                navigation.navigate("Recommend", {
                  wardrobeItemId: item.wardrobeItemId,
                  imageUrl: item.imageUrl,
                });
              }}
            >
              <Ionicons name="refresh" size={13} color="#fff" />
              <Text style={styles.retryBtnText}>이 조건으로 다시 추천</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.zinc900} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          list.length === 0 && { flex: 1 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="time-outline" size={40} color={colors.zinc200} />
            <Text style={styles.emptyTitle}>추천 기록이 없습니다</Text>
            <Text style={styles.emptySub}>AI 코디 추천을 받아보세요</Text>
          </View>
        }
      />

      {selectMode && selectedIds.size > 0 && (
        <View style={styles.bottomBar}>
          <Pressable style={styles.deleteBtn} onPress={handleBulkDelete}>
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={styles.deleteBtnText}>
              {selectedIds.size}개 삭제
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerActions: { flexDirection: "row", gap: 16 },
  headerActionText: { fontSize: 14, fontWeight: "600", color: colors.zinc900 },
  headerCancelText: { fontSize: 14, fontWeight: "500", color: colors.zinc400 },

  listContent: { padding: 20, paddingBottom: 100 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.zinc50,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  cardSelected: {
    backgroundColor: "#EEF2FF",
    borderWidth: 1.5,
    borderColor: colors.zinc900,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.zinc200,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: colors.zinc900,
    borderColor: colors.zinc900,
  },

  cardImage: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.zinc100,
  },
  cardContent: { flex: 1, gap: 4 },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardDate: { fontSize: 11, color: colors.zinc400, fontWeight: "500" },
  tagChip: {
    backgroundColor: colors.zinc100,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { fontSize: 10, color: colors.zinc500, fontWeight: "500" },

  cardSummary: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.zinc900,
    lineHeight: 18,
  },
  cardCategories: { fontSize: 11, color: colors.zinc400 },
  retryBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.zinc900,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  retryBtnText: { fontSize: 11, fontWeight: "700", color: "#fff" },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: colors.zinc900 },
  emptySub: { fontSize: 13, color: colors.zinc400 },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.zinc100,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EF4444",
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  deleteBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
