import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../hooks/useAuth";
import { colors, radius, spacing } from "../theme";
import {
  loadNotifPrefs,
  saveNotifPrefs,
  scheduleDailyOutfitNotification,
} from "../services/notificationService";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen(): React.JSX.Element {
  const { user, logoutUser } = useAuth();
  const navigation = useNavigation<NavProp>();
  const [dailyNotif, setDailyNotif] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwStep, setPwStep] = useState<"current" | "new">("current");

  useEffect(() => {
    loadNotifPrefs().then((prefs) => {
      setDailyNotif(prefs.dailyOutfit);
    }).catch(() => {});
  }, []);

  const handleDailyNotifToggle = async (value: boolean) => {
    setDailyNotif(value);
    await saveNotifPrefs({ dailyOutfit: value, recommendations: false });
    await scheduleDailyOutfitNotification(value);
    if (value) {
      Alert.alert("알림 설정", "매일 오전 8시에 오늘의 코디 추천 알림을 보내드릴게요!");
    }
  };

  const handleChangePassword = () => {
    setCurrentPw("");
    setNewPw("");
    setPwStep("current");
    setShowPasswordModal(true);
  };

  const submitPassword = async () => {
    if (pwStep === "current") {
      if (!currentPw) return;
      setPwStep("new");
      return;
    }
    if (!newPw || newPw.length < 6) {
      Alert.alert("오류", "비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (!user?.email) return;
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPw);
      setShowPasswordModal(false);
      Alert.alert("완료", "비밀번호가 변경되었습니다.");
    } catch {
      Alert.alert("실패", "비밀번호 변경에 실패했습니다. 현재 비밀번호를 확인해주세요.");
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "계정 삭제",
      "계정을 삭제하면 모든 데이터가 영구적으로 삭제됩니다. 정말 삭제하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            try {
              await deleteUser(user);
              navigation.reset({ index: 0, routes: [{ name: "Login" }] });
            } catch {
              Alert.alert("실패", "계정 삭제에 실패했습니다. 다시 로그인 후 시도해주세요.");
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 알림 */}
      <Text style={styles.sectionTitle}>알림</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: "#DBEAFE" }]}>
            <Ionicons name="sunny-outline" size={16} color="#2563EB" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>오늘의 코디 추천 알림</Text>
            <Text style={styles.rowSub}>매일 오전 8시</Text>
          </View>
          <Switch
            value={dailyNotif}
            onValueChange={(v) => void handleDailyNotifToggle(v)}
            trackColor={{ true: colors.zinc900 }}
          />
        </View>
      </View>

      {/* 계정 */}
      <Text style={styles.sectionTitle}>계정</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: "#F3F4F6" }]}>
            <Ionicons name="mail-outline" size={16} color="#6B7280" />
          </View>
          <Text style={styles.rowLabel}>{user?.email ?? "-"}</Text>
        </View>
        <View style={styles.divider} />
        <Pressable style={styles.row} onPress={handleChangePassword}>
          <View style={[styles.iconWrap, { backgroundColor: "#EEF2FF" }]}>
            <Ionicons name="key-outline" size={16} color="#4F46E5" />
          </View>
          <Text style={styles.rowLabel}>비밀번호 변경</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.zinc200} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.row}
          onPress={async () => {
            await logoutUser();
            navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          }}
        >
          <View style={[styles.iconWrap, { backgroundColor: "#FEE2E2" }]}>
            <Ionicons name="log-out-outline" size={16} color="#EF4444" />
          </View>
          <Text style={[styles.rowLabel, { color: "#EF4444" }]}>로그아웃</Text>
        </Pressable>
      </View>

      {/* 데이터 */}
      <Text style={styles.sectionTitle}>데이터</Text>
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={handleDeleteAccount}>
          <View style={[styles.iconWrap, { backgroundColor: "#FEE2E2" }]}>
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </View>
          <Text style={[styles.rowLabel, { color: "#EF4444" }]}>계정 삭제</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.zinc200} />
        </Pressable>
      </View>

      {/* 정보 */}
      <View style={styles.infoSection}>
        <Text style={styles.infoText}>FIZZYLUSH v1.0.0</Text>
        <Text style={styles.infoText}>Made with AI</Text>
      </View>

      {/* Password change inline */}
      {showPasswordModal && (
        <View style={styles.pwModal}>
          <View style={styles.pwModalHeader}>
            <Text style={styles.pwModalTitle}>
              {pwStep === "current" ? "현재 비밀번호" : "새 비밀번호"}
            </Text>
            <Pressable onPress={() => setShowPasswordModal(false)}>
              <Ionicons name="close" size={20} color={colors.zinc400} />
            </Pressable>
          </View>
          <TextInput
            style={styles.pwInput}
            secureTextEntry
            placeholder={pwStep === "current" ? "현재 비밀번호 입력" : "새 비밀번호 입력 (6자 이상)"}
            placeholderTextColor={colors.zinc400}
            value={pwStep === "current" ? currentPw : newPw}
            onChangeText={pwStep === "current" ? setCurrentPw : setNewPw}
            autoFocus
          />
          <Pressable style={styles.pwSubmitBtn} onPress={() => void submitPassword()}>
            <Text style={styles.pwSubmitText}>{pwStep === "current" ? "다음" : "변경"}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },

  sectionTitle: {
    fontSize: 13, fontWeight: "600", color: colors.zinc400,
    textTransform: "uppercase", letterSpacing: 0.5,
    marginBottom: 8, marginTop: 20,
  },

  card: {
    backgroundColor: colors.zinc50,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 14, paddingHorizontal: 14,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { fontSize: 14, fontWeight: "500", color: colors.zinc700 },
  rowSub: { fontSize: 11, color: colors.zinc400, marginTop: 1 },
  divider: { height: 1, backgroundColor: colors.zinc100, marginLeft: 58 },

  infoSection: {
    alignItems: "center", marginTop: spacing.xl, gap: 4,
  },
  infoText: { fontSize: 11, color: colors.zinc200 },

  pwModal: {
    marginTop: 20,
    backgroundColor: colors.zinc50, borderRadius: radius.md,
    padding: 16, gap: 12,
  },
  pwModalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  pwModalTitle: { fontSize: 15, fontWeight: "700", color: colors.zinc900 },
  pwInput: {
    backgroundColor: "#fff", borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.zinc200,
    paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 14, color: colors.zinc900,
  },
  pwSubmitBtn: {
    backgroundColor: colors.zinc900, borderRadius: radius.md,
    paddingVertical: 14, alignItems: "center",
  },
  pwSubmitText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
