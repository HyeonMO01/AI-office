import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SplashScreen } from "../screens/SplashScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { RecommendScreen } from "../screens/RecommendScreen";
import { OutfitTouchScreen } from "../screens/OutfitTouchScreen";
import { RecommendationHistoryScreen } from "../screens/RecommendationHistoryScreen";
import { VirtualTryOnScreen } from "../screens/VirtualTryOnScreen";
import { StyleResultScreen } from "../screens/StyleResultScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { OutfitCalendarScreen } from "../screens/OutfitCalendarScreen";
import { StyleAnalysisScreen } from "../screens/StyleAnalysisScreen";
import { WeeklyPlannerScreen } from "../screens/WeeklyPlannerScreen";
import { MainTabNavigator } from "./MainTabNavigator";
import { ShoppingProduct, TryOnItemParam, VisionRecommendationResult } from "../types";

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  SignUp: undefined;
  Onboarding: { isEdit?: boolean } | undefined;
  MainTabs: undefined;
  Recommend: {
    wardrobeItemId: string;
    imageUrl: string;
  };
  OutfitTouch: {
    wardrobeItemId: string;
    imageUrl: string;
  };
  RecommendationHistory: undefined;
  Settings: undefined;
  OutfitCalendar: undefined;
  StyleAnalysis: undefined;
  WeeklyPlanner: undefined;
  StyleResult: {
    result: VisionRecommendationResult;
    products: Record<string, ShoppingProduct[]>;
    /** 네이버 쇼핑 API/프록시 호출 실패 시 메시지 */
    shoppingError?: string;
    wardrobeImageUrl: string;
    occasion: string;
    weather: string;
    desiredStyle?: string;
    budget?: string;
    extraRequest?: string;
    profileText?: string;
  };
  VirtualTryOn: {
    item: TryOnItemParam;
    initialProduct: ShoppingProduct | null;
    wardrobeImageUrl?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerTitleAlign: "center",
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: "로그인" }} />
      <Stack.Screen name="SignUp" component={SignUpScreen} options={{ title: "회원가입" }} />
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ title: "온보딩" }}
      />
      <Stack.Screen name="MainTabs" component={MainTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen name="Recommend" component={RecommendScreen} options={{ title: "AI 추천" }} />
      <Stack.Screen
        name="OutfitTouch"
        component={OutfitTouchScreen}
        options={{ title: "옷 터치 추천" }}
      />
      <Stack.Screen
        name="RecommendationHistory"
        component={RecommendationHistoryScreen}
        options={{ title: "추천 히스토리" }}
      />
      <Stack.Screen
        name="StyleResult"
        component={StyleResultScreen}
        options={{ title: "AI 코디 결과" }}
      />
      <Stack.Screen
        name="VirtualTryOn"
        component={VirtualTryOnScreen}
        options={{ title: "가상 착용" }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "설정" }}
      />
      <Stack.Screen
        name="OutfitCalendar"
        component={OutfitCalendarScreen}
        options={{ title: "코디 캘린더" }}
      />
      <Stack.Screen
        name="StyleAnalysis"
        component={StyleAnalysisScreen}
        options={{ title: "스타일 분석" }}
      />
      <Stack.Screen
        name="WeeklyPlanner"
        component={WeeklyPlannerScreen}
        options={{ title: "주간 코디 플래너" }}
      />
    </Stack.Navigator>
  );
}
