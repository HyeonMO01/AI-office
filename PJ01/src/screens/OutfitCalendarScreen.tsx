import React, { useCallback, useState } from "react";
import {
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
import { colors, radius } from "../theme";
import { WardrobeItem } from "../types";

interface OutfitLog {
  id: string;
  date: string;
  itemIds: string[];
  note: string;
}

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { firstDay, daysInMonth };
}

function formatDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function OutfitCalendarScreen(): React.JSX.Element {
  const { user } = useAuth();
  const { items: wardrobeItems } = useWardrobeList(user?.uid);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(
    formatDate(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  const [logs, setLogs] = useState<OutfitLog[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const loadLogs = useCallback(async () => {
    if (!user) return;
    const startDate = formatDate(year, month, 1);
    const endDate = formatDate(year, month + 1, 0);
    try {
      const colRef = collection(db, "users", user.uid, "outfitLog");
      const q = query(colRef, where("date", ">=", startDate), where("date", "<=", endDate));
      const snap = await getDocs(q);
      setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OutfitLog, "id">) })));
    } catch {
      // silent
    }
  }, [user, year, month]);

  useFocusEffect(useCallback(() => { void loadLogs(); }, [loadLogs]));

  const { firstDay, daysInMonth } = getMonthDays(year, month);
  const logDates = new Set(logs.map((l) => l.date));
  const selectedLog = logs.find((l) => l.date === selectedDate);

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  };

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveOutfit = async () => {
    if (!user || selectedItems.size === 0) return;
    try {
      if (selectedLog) {
        await deleteDoc(doc(db, "users", user.uid, "outfitLog", selectedLog.id));
      }
      await addDoc(collection(db, "users", user.uid, "outfitLog"), {
        date: selectedDate,
        itemIds: [...selectedItems],
        note: "",
      });
      setShowPicker(false);
      setSelectedItems(new Set());
      void loadLogs();
      Alert.alert("저장 완료", `${selectedDate} 코디가 기록되었습니다.`);
    } catch {
      Alert.alert("오류", "저장에 실패했습니다.");
    }
  };

  const deleteOutfit = async () => {
    if (!user || !selectedLog) return;
    Alert.alert("기록 삭제", "이 날의 코디 기록을 삭제할까요?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제", style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "users", user.uid, "outfitLog", selectedLog.id));
            void loadLogs();
          } catch {
            Alert.alert("오류", "삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  const getItemsForLog = (log: OutfitLog): WardrobeItem[] =>
    log.itemIds.map((id) => wardrobeItems.find((w) => w.id === id)).filter(Boolean) as WardrobeItem[];

  const renderCalendar = () => {
    const cells: React.JSX.Element[] = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDate(year, month, d);
      const hasLog = logDates.has(dateStr);
      const isSelected = dateStr === selectedDate;
      const isToday = dateStr === formatDate(today.getFullYear(), today.getMonth(), today.getDate());
      cells.push(
        <Pressable
          key={d}
          style={[styles.dayCell, isSelected && styles.dayCellSelected]}
          onPress={() => setSelectedDate(dateStr)}
        >
          <Text style={[
            styles.dayText,
            isSelected && styles.dayTextSelected,
            isToday && !isSelected && styles.dayTextToday,
          ]}>
            {d}
          </Text>
          {hasLog && <View style={[styles.dayDot, isSelected && styles.dayDotSelected]} />}
        </Pressable>,
      );
    }
    return cells;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Month nav */}
      <View style={styles.monthNav}>
        <Pressable onPress={prevMonth} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={colors.zinc600} />
        </Pressable>
        <Text style={styles.monthTitle}>{year}년 {month + 1}월</Text>
        <Pressable onPress={nextMonth} hitSlop={12}>
          <Ionicons name="chevron-forward" size={20} color={colors.zinc600} />
        </Pressable>
      </View>

      {/* Day labels */}
      <View style={styles.dayLabels}>
        {DAYS.map((d) => (
          <Text key={d} style={styles.dayLabel}>{d}</Text>
        ))}
      </View>

      {/* Calendar grid */}
      <View style={styles.calendarGrid}>{renderCalendar()}</View>

      {/* Selected date detail */}
      <View style={styles.detailSection}>
        <View style={styles.detailHeader}>
          <Text style={styles.detailDate}>{selectedDate}</Text>
          <View style={styles.detailActions}>
            {selectedLog && (
              <Pressable onPress={deleteOutfit} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </Pressable>
            )}
            <Pressable
              style={styles.addBtn}
              onPress={() => {
                setShowPicker(true);
                if (selectedLog) {
                  setSelectedItems(new Set(selectedLog.itemIds));
                } else {
                  setSelectedItems(new Set());
                }
              }}
            >
              <Ionicons name={selectedLog ? "pencil" : "add"} size={14} color="#fff" />
              <Text style={styles.addBtnText}>{selectedLog ? "수정" : "코디 기록"}</Text>
            </Pressable>
          </View>
        </View>

        {selectedLog ? (
          <View style={styles.logItemsRow}>
            {getItemsForLog(selectedLog).map((item) => (
              <View key={item.id} style={styles.logItem}>
                <Image source={{ uri: item.imageUrl }} style={styles.logItemImage} />
                <Text style={styles.logItemCat}>{item.category}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyLog}>
            <Ionicons name="calendar-outline" size={28} color={colors.zinc200} />
            <Text style={styles.emptyLogText}>이 날의 코디 기록이 없습니다</Text>
          </View>
        )}
      </View>

      {/* Outfit Picker Modal */}
      {showPicker && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>코디 기록하기</Text>
              <Pressable onPress={() => setShowPicker(false)}>
                <Ionicons name="close" size={20} color={colors.zinc400} />
              </Pressable>
            </View>
            <Text style={styles.pickerSub}>입은 옷을 선택하세요</Text>
            <View style={styles.pickerGrid}>
              {wardrobeItems.map((item) => {
                const isChosen = selectedItems.has(item.id);
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.pickerItem, isChosen && styles.pickerItemActive]}
                    onPress={() => toggleItem(item.id)}
                  >
                    <Image source={{ uri: item.imageUrl }} style={styles.pickerItemImg} />
                    {isChosen && (
                      <View style={styles.pickerCheck}>
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[styles.pickerSaveBtn, selectedItems.size === 0 && { opacity: 0.4 }]}
              onPress={() => void saveOutfit()}
              disabled={selectedItems.size === 0}
            >
              <Text style={styles.pickerSaveBtnText}>
                {selectedItems.size}개 아이템 저장
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },

  monthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 16,
  },
  monthTitle: { fontSize: 18, fontWeight: "700", color: colors.zinc900 },

  dayLabels: { flexDirection: "row", marginBottom: 8 },
  dayLabel: {
    flex: 1, textAlign: "center",
    fontSize: 12, fontWeight: "600", color: colors.zinc400,
  },

  calendarGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 20 },
  dayCell: {
    width: `${100 / 7}%`, alignItems: "center",
    paddingVertical: 8, gap: 4,
  },
  dayCellSelected: {
    backgroundColor: colors.zinc900, borderRadius: radius.sm,
  },
  dayText: { fontSize: 14, fontWeight: "500", color: colors.zinc700 },
  dayTextSelected: { color: "#fff", fontWeight: "700" },
  dayTextToday: { color: colors.amber, fontWeight: "700" },
  dayDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: colors.amber,
  },
  dayDotSelected: { backgroundColor: "#fff" },

  detailSection: { marginBottom: 20 },
  detailHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12,
  },
  detailDate: { fontSize: 16, fontWeight: "700", color: colors.zinc900 },
  detailActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.zinc900, borderRadius: radius.full,
    paddingVertical: 6, paddingHorizontal: 14,
  },
  addBtnText: { fontSize: 12, fontWeight: "600", color: "#fff" },

  logItemsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  logItem: { alignItems: "center", gap: 4 },
  logItemImage: {
    width: 64, height: 64, borderRadius: radius.sm,
    backgroundColor: colors.zinc100,
  },
  logItemCat: { fontSize: 10, color: colors.zinc400 },

  emptyLog: { alignItems: "center", paddingVertical: 28, gap: 8 },
  emptyLogText: { fontSize: 13, color: colors.zinc400 },

  pickerOverlay: {
    marginTop: 12,
    backgroundColor: colors.zinc50, borderRadius: radius.lg,
    padding: 16,
  },
  pickerCard: { gap: 12 },
  pickerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  pickerTitle: { fontSize: 16, fontWeight: "700", color: colors.zinc900 },
  pickerSub: { fontSize: 12, color: colors.zinc400 },
  pickerGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 6,
  },
  pickerItem: {
    width: "23%", aspectRatio: 1,
    borderRadius: radius.sm, overflow: "hidden",
    borderWidth: 2, borderColor: "transparent",
    position: "relative",
  },
  pickerItemActive: { borderColor: colors.zinc900 },
  pickerItemImg: { width: "100%", height: "100%" },
  pickerCheck: {
    position: "absolute", top: 2, right: 2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.zinc900,
    alignItems: "center", justifyContent: "center",
  },
  pickerSaveBtn: {
    backgroundColor: colors.zinc900, borderRadius: radius.md,
    paddingVertical: 14, alignItems: "center",
  },
  pickerSaveBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
