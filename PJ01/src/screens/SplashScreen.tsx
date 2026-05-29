import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../hooks/useAuth";
import { colors } from "../theme";
import { getUserProfile } from "../services/userProfileService";

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

export function SplashScreen({ navigation }: Props): React.JSX.Element {
  const { user, initializing } = useAuth();

  useEffect(() => {
    const moveNext = async () => {
      if (initializing) return;
      if (!user) {
        navigation.replace("Login");
        return;
      }
      const profile = await getUserProfile(user.uid);
      if (profile?.onboardingComplete) {
        navigation.replace("MainTabs");
      } else {
        navigation.replace("Onboarding");
      }
    };

    moveNext();
  }, [initializing, navigation, user]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>FIZZYLUSH</Text>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  logo: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.primary,
  },
});
