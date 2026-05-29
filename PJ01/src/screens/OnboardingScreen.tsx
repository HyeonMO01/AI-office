import React, { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/RootNavigator";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";
import { BodyType, Gender } from "../types";
import { clearAvatarUrl, getUserProfile, updateOnboardingProfile } from "../services/userProfileService";
import { colors, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;
const BODY_TYPES: BodyType[] = ["슬림", "보통", "통통"];
const GENDERS: Gender[] = ["여성", "남성", "선택 안 함"];

export function OnboardingScreen({ navigation, route }: Props): React.JSX.Element {
  const { user } = useAuth();
  const isEdit = Boolean(route.params?.isEdit);
  const weightInputRef = useRef<TextInput>(null);
  const styleInputRef = useRef<TextInput>(null);
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [bodyType, setBodyType] = useState<BodyType>("보통");
  const [gender, setGender] = useState<Gender>("선택 안 함");
  const [preferredStyle, setPreferredStyle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const styleOptions = ["미니멀", "스트릿", "캐주얼", "포멀", "러블리"];

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      const profile = await getUserProfile(user.uid);
      if (!profile) return;
      setHeight(profile.height ? String(profile.height) : "");
      setWeight(profile.weight ? String(profile.weight) : "");
      setBodyType(profile.bodyType ?? "보통");
      setGender(profile.gender ?? "선택 안 함");
      setPreferredStyle(profile.preferredStyle ?? "");
    };
    if (isEdit) {
      loadProfile();
    }
  }, [isEdit, user]);

  const onSave = async () => {
    if (!user) {
      setError("로그인 정보가 없습니다.");
      return;
    }
    if (!height || !weight) {
      setError("키와 몸무게를 입력해주세요.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const prevProfile = isEdit ? await getUserProfile(user.uid) : null;
      await updateOnboardingProfile({
        uid: user.uid,
        height: Number(height),
        weight: Number(weight),
        bodyType,
        gender,
        preferredStyle,
      });
      if (isEdit && prevProfile?.gender !== gender) {
        await clearAvatarUrl(user.uid);
      }
      if (isEdit) {
        navigation.goBack();
      } else {
        navigation.replace("MainTabs");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
      <Text style={styles.title}>{isEdit ? "온보딩 정보 수정" : "체형 정보를 입력해주세요"}</Text>
      <TextField
        label="키 (cm)"
        value={height}
        onChangeText={setHeight}
        keyboardType="numeric"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => weightInputRef.current?.focus()}
      />
      <TextField
        label="몸무게 (kg)"
        value={weight}
        onChangeText={setWeight}
        keyboardType="numeric"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => styleInputRef.current?.focus()}
        inputRef={weightInputRef}
      />
      <TextField
        label="선호 스타일 (선택)"
        value={preferredStyle}
        onChangeText={setPreferredStyle}
        placeholder="예: 미니멀, 스트릿, 데이트룩"
        returnKeyType="done"
        onSubmitEditing={() => Keyboard.dismiss()}
        inputRef={styleInputRef}
      />
      <Text style={styles.label}>빠른 스타일 선택</Text>
      <View style={styles.row}>
        {styleOptions.map((item) => (
          <Pressable
            key={item}
            style={[styles.chip, preferredStyle === item && styles.chipActive]}
            onPress={() => setPreferredStyle(item)}
          >
            <Text style={[styles.chipText, preferredStyle === item && styles.chipTextActive]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>성별 (AI 아바타 생성에 사용)</Text>
      <View style={styles.row}>
        {GENDERS.map((item) => (
          <Pressable
            key={item}
            style={[styles.chip, gender === item && styles.chipActive]}
            onPress={() => setGender(item)}
          >
            <Text style={[styles.chipText, gender === item && styles.chipTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>체형 선택</Text>
      <View style={styles.row}>
        {BODY_TYPES.map((item) => (
          <Pressable
            key={item}
            style={[styles.chip, bodyType === item && styles.chipActive]}
            onPress={() => setBodyType(item)}
          >
            <Text style={[styles.chipText, bodyType === item && styles.chipTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={isEdit ? "수정 저장하기" : "저장하고 시작하기"} onPress={onSave} loading={loading} />
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
    gap: spacing.sm,
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: "#FFEAF1",
  },
  chipText: {
    color: colors.text,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.primary,
  },
  error: {
    color: colors.error,
    fontWeight: "600",
  },
});
