import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { createBottomTabNavigator, BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { HomeScreen } from "../screens/HomeScreen";
import { UploadScreen } from "../screens/UploadScreen";
import { MyPageScreen } from "../screens/MyPageScreen";
import { StyleRecommendScreen } from "../screens/StyleRecommendScreen";
import { ShoppingRecommendScreen } from "../screens/ShoppingRecommendScreen";
import { colors, shadow } from "../theme";

export type MainTabParamList = {
  Home: undefined;
  StyleRecommend: undefined;
  Upload: undefined;
  ShoppingRecommend: undefined;
  MyPage: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function FabButton({ onPress, children }: BottomTabBarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fabWrap, pressed && { opacity: 0.85, transform: [{ scale: 0.9 }] }]}
    >
      <View style={styles.fab}>{children}</View>
    </Pressable>
  );
}

export function MainTabNavigator(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={{
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontWeight: "700", color: colors.text, fontSize: 16 },
        headerShadowVisible: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.zinc900,
        tabBarInactiveTintColor: colors.zinc400,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          title: "홈",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="StyleRecommend"
        component={StyleRecommendScreen}
        options={{
          headerShown: false,
          title: "코디",
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Upload"
        component={UploadScreen}
        options={{
          headerShown: false,
          title: "",
          tabBarButton: FabButton,
          tabBarIcon: () => <Ionicons name="add" size={24} color="#FFFFFF" />,
        }}
      />
      <Tab.Screen
        name="ShoppingRecommend"
        component={ShoppingRecommendScreen}
        options={{
          headerShown: false,
          title: "추천",
          tabBarIcon: ({ color, size }) => <Ionicons name="bag-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MyPage"
        component={MyPageScreen}
        options={{
          headerShown: false,
          title: "MY",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderTopColor: colors.zinc100,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabLabel: { fontSize: 10, fontWeight: "500", marginTop: 2 },
  fabWrap: { top: -14, alignItems: "center", justifyContent: "center" },
  fab: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.zinc900,
    alignItems: "center", justifyContent: "center",
    ...shadow.lg,
  },
});
