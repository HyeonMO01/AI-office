import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/RootNavigator";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";
import { colors, spacing } from "../theme";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { getUserProfile } from "../services/userProfileService";
import { auth } from "../services/firebase";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation }: Props): React.JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      const uid = auth.currentUser?.uid;
      if (!uid) {
        throw new Error("로그인 사용자 정보를 확인할 수 없습니다.");
      }
      const profile = await getUserProfile(uid);
      navigation.replace(profile?.onboardingComplete ? "MainTabs" : "Onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FIZZYLUSH 로그인</Text>
      <TextField
        label="이메일"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="example@email.com"
      />
      <TextField
        label="비밀번호"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="비밀번호"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="로그인" onPress={onLogin} loading={loading} />
      <Button title="회원가입 하러가기" onPress={() => navigation.navigate("SignUp")} variant="ghost" />
      <LoadingOverlay visible={loading} message="로그인 중..." />
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
    fontSize: 26,
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
