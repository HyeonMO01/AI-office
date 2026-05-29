import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../hooks/useAuth";
import { getUserProfile } from "../services/userProfileService";
import { fetchNaverShoppingProducts } from "../services/naverShoppingService";
import { useWardrobeList } from "../hooks/useWardrobeList";
import { colors, radius } from "../theme";
import { ShoppingProduct } from "../types";

interface RecommendCategory {
  label: string;
  query: string;
}

export function ShoppingRecommendScreen(): React.JSX.Element {
  const { user } = useAuth();
  const { items: wardrobeItems } = useWardrobeList(user?.uid);

  const [categories, setCategories] = useState<RecommendCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [products, setProducts] = useState<ShoppingProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const buildCategories = useCallback(async () => {
    const profile = user ? await getUserProfile(user.uid) : null;
    const style = profile?.preferredStyle || "캐주얼";
    const wardrobeCats = [...new Set(wardrobeItems.map((i) => i.category))];

    const cats: RecommendCategory[] = [
      { label: "나에게 어울리는", query: `${style} 코디 추천` },
      { label: "오늘의 인기", query: "인기 패션 데일리룩" },
    ];

    if (wardrobeCats.includes("상의")) cats.push({ label: "상의 추천", query: `${style} 상의 추천` });
    if (wardrobeCats.includes("하의")) cats.push({ label: "하의 추천", query: `${style} 하의 추천` });
    if (wardrobeCats.includes("아우터")) cats.push({ label: "아우터 추천", query: `${style} 아우터` });
    cats.push({ label: "신발", query: `${style} 신발 추천` });
    cats.push({ label: "악세서리", query: `${style} 악세서리 패션` });

    setCategories(cats);
    if (cats.length > 0) {
      setActiveCategory(cats[0].label);
      void fetchProducts(cats[0].query);
    }
    setInitialLoading(false);
  }, [user, wardrobeItems]);

  useFocusEffect(useCallback(() => { void buildCategories(); }, [buildCategories]));

  const fetchProducts = async (query: string) => {
    setLoading(true);
    setError(null);
    const { products, error } = await fetchNaverShoppingProducts(query, 20);
    setProducts(products);
    if (error) {
      setError(error);
    }
    setLoading(false);
  };

  const handleCategoryPress = (cat: RecommendCategory) => {
    setActiveCategory(cat.label);
    void fetchProducts(cat.query);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const active = categories.find((c) => c.label === activeCategory);
    if (active) await fetchProducts(active.query);
    else await buildCategories();
    setRefreshing(false);
  };

  const openProduct = (product: ShoppingProduct) => {
    void Linking.openURL(product.productLink);
  };

  const formatPrice = (price: string) => {
    const num = Number(price);
    if (!num || Number.isNaN(num)) return "가격 미정";
    return `${num.toLocaleString()}원`;
  };

  const renderProduct = ({ item }: { item: ShoppingProduct }) => (
    <Pressable
      style={({ pressed }) => [styles.productCard, pressed && { transform: [{ scale: 0.98 }] }]}
      onPress={() => openProduct(item)}
    >
      <Image source={{ uri: item.image }} style={styles.productImage} resizeMode="cover" />
      <View style={styles.productInfo}>
        <Text style={styles.productMall}>{item.mallName}</Text>
        <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.productPrice}>{formatPrice(item.lprice)}</Text>
      </View>
    </Pressable>
  );

  if (initialLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.zinc900} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.headerWrap}>
        <Text style={styles.pageTitle}>추천</Text>
        <Text style={styles.pageSub}>내 스타일에 맞는 아이템을 추천해드려요</Text>
      </View>

      <View>
        <FlatList
          horizontal
          data={categories}
          keyExtractor={(c) => c.label}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catScroll}
          renderItem={({ item: cat }) => (
            <Pressable
              style={[styles.catChip, activeCategory === cat.label && styles.catChipActive]}
              onPress={() => handleCategoryPress(cat)}
            >
              <Text style={[styles.catChipText, activeCategory === cat.label && styles.catChipTextActive]}>
                {cat.label}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.zinc900} />
          <Text style={styles.loadingText}>추천 상품을 찾는 중...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerWrap}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.zinc400} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              const active = categories.find((c) => c.label === activeCategory);
              if (active) void fetchProducts(active.query);
            }}
          >
            <Ionicons name="refresh-outline" size={14} color="#fff" />
            <Text style={styles.retryBtnText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.centerWrap}>
          <Ionicons name="bag-outline" size={40} color={colors.zinc400} />
          <Text style={styles.emptyText}>추천 상품이 없습니다</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p, i) => `${p.productLink}-${i}`}
          numColumns={2}
          columnWrapperStyle={styles.productRow}
          contentContainerStyle={styles.productList}
          showsVerticalScrollIndicator={false}
          renderItem={renderProduct}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.zinc900}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },

  headerWrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  pageTitle: { fontSize: 22, fontWeight: "700", color: colors.zinc900, letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: colors.zinc400, marginTop: 4 },

  catScroll: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  catChip: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: radius.full, backgroundColor: colors.zinc100,
  },
  catChipActive: { backgroundColor: colors.zinc900 },
  catChipText: { fontSize: 13, fontWeight: "500", color: colors.zinc500 },
  catChipTextActive: { color: "#fff" },

  loadingText: { fontSize: 13, color: colors.zinc400 },
  emptyText: { fontSize: 14, color: colors.zinc400 },
  errorText: { fontSize: 14, color: colors.zinc500, fontWeight: "500" },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.zinc900, borderRadius: radius.md,
    paddingVertical: 10, paddingHorizontal: 20, marginTop: 4,
  },
  retryBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },

  productList: { paddingHorizontal: 20, paddingBottom: 100 },
  productRow: { gap: 12, marginBottom: 16 },
  productCard: {
    flex: 1, maxWidth: "48%",
    borderRadius: radius.md, overflow: "hidden",
    backgroundColor: colors.zinc50,
  },
  productImage: {
    width: "100%", aspectRatio: 1,
    backgroundColor: colors.zinc100,
  },
  productInfo: { padding: 10, gap: 2 },
  productMall: { fontSize: 11, color: colors.zinc400 },
  productTitle: { fontSize: 12, fontWeight: "500", color: colors.zinc900, lineHeight: 17 },
  productPrice: { fontSize: 14, fontWeight: "700", color: colors.zinc900, marginTop: 4 },
});
