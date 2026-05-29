import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/RootNavigator";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";
import { createUserProfile } from "../services/userProfileService";
import { colors, spacing } from "../theme";
import { LoadingOverlay } from "../components/LoadingOverlay";

type Props = NativeStackScreenProps<RootStackParamList, "SignUp">;

export function SignUpScreen({ navigation }: Props): React.JSX.Element {
  const { signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSignUp = async () => {
    if (!email || !password || !nickname) {
      setError("모든 항목을 입력해주세요.");
      return;
    }
    if (!email.includes("@")) {
      setError("이메일 형식을 확인해주세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상 입력해주세요.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const uid = await signup(email, password);
      await createUserProfile({ uid, email, nickname });
      navigation.replace("Onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>회원가입</Text>
      <TextField label="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextField label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry />
      <TextField label="닉네임" value={nickname} onChangeText={setNickname} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="회원가입" onPress={onSignUp} loading={loading} />
      <LoadingOverlay visible={loading} message="가입 처리 중..." />
    </View>
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
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  error: {
    color: colors.error,
    fontWeight: "600",
  },
});
