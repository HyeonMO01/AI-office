import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/RootNavigator";
import { colors, radius, spacing } from "../theme";
import { ShoppingProduct, VisionRecommendationResult } from "../types";
import { requestVisionRecommendation } from "../services/openai";
import {
  buildNaverSearchQuery,
  fetchNaverShoppingProducts,
  NAVER_SHOP_FETCH_CONCURRENCY,
} from "../services/naverShoppingService";
import { runWithConcurrency } from "../utils/concurrency";
import { FEATURE_VIRTUAL_TRY_ON_ENABLED } from "../constants/features";
import {
  VirtualTryOnBottomPlaceholder,
  VirtualTryOnRowPlaceholder,
} from "../components/VirtualTryOnDisabled";

type Props = NativeStackScreenProps<RootStackParamList, "StyleResult">;

const COLOR_MAP: Record<string, string> = {
  "블랙": "#1a1a1a", "검정": "#1a1a1a", "화이트": "#f5f5f5", "흰색": "#f5f5f5", "아이보리": "#FFFFF0",
  "네이비": "#1e3a5f", "베이지": "#D4B896", "카키": "#728C69", "그레이": "#808080", "회색": "#808080",
  "브라운": "#6B4423", "갈색": "#6B4423", "버건디": "#722F37", "와인": "#722F37", "레드": "#C0392B",
  "빨강": "#C0392B", "블루": "#2E86C1", "파랑": "#2E86C1", "그린": "#27AE60", "초록": "#27AE60",
  "핑크": "#E8A0BF", "옐로우": "#F4D03F", "노랑": "#F4D03F", "퍼플": "#7D3C98", "보라": "#7D3C98",
  "오렌지": "#E67E22", "크림": "#FFFDD0", "차콜": "#36454F", "올리브": "#808000", "라벤더": "#B57EDC",
  "민트": "#98FF98", "코랄": "#FF7F50", "카멜": "#C19A6B", "데님": "#4682B4", "인디고": "#3F51B5",
};

function resolveColorHex(colorName: string): string {
  if (!colorName) return colors.zinc400;
  const lower = colorName.toLowerCase().replace(/\s+/g, "");
  for (const [key, hex] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key.toLowerCase())) return hex;
  }
  return colors.zinc400;
}

export function StyleResultScreen({ route, navigation }: Props): React.JSX.Element {
  const {
    wardrobeImageUrl, occasion, weather,
    desiredStyle, budget, extraRequest, profileText,
  } = route.params;

  const [result, setResult] = useState<VisionRecommendationResult>(route.params.result);
  const [products, setProducts] = useState<Record<string, ShoppingProduct[]>>(route.params.products);
  const [shoppingError, setShoppingError] = useState<string | undefined>(route.params.shoppingError);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const toggleLike = (key: string) =>
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleExpand = (idx: number) =>
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const openNaver = (keyword: string, link?: string) => {
    const url = link || `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}`;
    void Linking.openURL(url);
  };

  const formatPrice = (price: string) => {
    const num = Number(price);
    if (!num || Number.isNaN(num)) return "가격 미정";
    return `${num.toLocaleString()}원`;
  };

  const handleShare = async () => {
    try {
      const itemList = result.items.map((i) => `• ${i.category}: ${i.title}`).join("\n");
      const text = `✨ AI 코디 추천\n\n${result.summary}\n\n${itemList}\n\n💡 ${result.styleTip}`;
      await Share.share({ message: text, title: "AI 코디 추천" });
    } catch { /* silent */ }
  };

  const handleRegenerate = async () => {
    if (!profileText) {
      Alert.alert("재추천 불가", "프로필 정보가 필요합니다. 뒤로 돌아가 다시 시도해주세요.");
      return;
    }
    setRegenerating(true);
    try {
      const newResult = await requestVisionRecommendation({
        imageUrl: wardrobeImageUrl,
        profileText,
        desiredStyle,
        occasion,
        weather,
        budget,
        extraRequest,
      });
      const budgetStr = budget || "제한 없음";
      const shopResults = await runWithConcurrency(
        newResult.items,
        NAVER_SHOP_FETCH_CONCURRENCY,
        async (item) =>
          fetchNaverShoppingProducts(
            buildNaverSearchQuery(item.searchKeyword, {
              category: item.category,
              color: item.colorInfo,
              material: item.materialInfo,
              title: item.title,
            }),
            8,
            { budget: budgetStr },
          ).then((r) => ({
            category: item.category,
            ...r,
          })),
      );
      const newProducts: Record<string, ShoppingProduct[]> = {};
      let shopErr: string | undefined;
      for (const r of shopResults) {
        newProducts[r.category] = r.products;
        if (r.error && !shopErr) {
          shopErr = r.error;
        }
      }
      setResult(newResult);
      setProducts(newProducts);
      setShoppingError(shopErr);
      setLiked(new Set());
      setExpandedItems(new Set());
    } catch (e) {
      Alert.alert("재추천 실패", e instanceof Error ? e.message : "다시 시도해주세요.");
    } finally {
      setRegenerating(false);
    }
  };

  const palette = result.colorPalette;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.zinc600} />
        </Pressable>
        <Text style={styles.headerTitle}>AI 코디 결과</Text>
        <Pressable style={styles.headerBtn} onPress={() => void handleShare()}>
          <Ionicons name="share-social-outline" size={18} color={colors.zinc600} />
        </Pressable>
      </View>

      {/* Hero */}
      <View style={styles.heroWrap}>
        <Image source={{ uri: wardrobeImageUrl }} style={styles.heroImage} resizeMode="cover" />
        <View style={styles.heroGradient}>
          <View style={styles.heroBadge}>
            <Ionicons name="sparkles" size={12} color={colors.amber} />
            <Text style={styles.heroBadgeText}>AI STYLING</Text>
          </View>
          {result.overallMood ? (
            <Text style={styles.heroMood}>{result.overallMood}</Text>
          ) : null}
          <Text style={styles.heroContext}>{occasion} · {weather}{desiredStyle ? ` · ${desiredStyle}` : ""}</Text>
        </View>
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryText}>{result.summary}</Text>
        {result.visualAnchorKo ? (
          <View style={styles.anchorWrap}>
            <Text style={styles.anchorLabel}>AI가 인식한 내 옷</Text>
            <Text style={styles.anchorText}>{result.visualAnchorKo}</Text>
          </View>
        ) : null}
      </View>

      {shoppingError ? (
        <View style={styles.shopErrorBanner}>
          <Ionicons name="warning-outline" size={18} color="#B45309" />
          <View style={styles.shopErrorTextWrap}>
            <Text style={styles.shopErrorTitle}>쇼핑 상품을 불러오지 못했습니다</Text>
            <Text style={styles.shopErrorBody}>{shoppingError}</Text>
            <Text style={styles.shopErrorHint}>
              프록시 서버가 켜져 있는지, .env의 EXPO_PUBLIC_API_BASE_URL(휴대폰에서는 PC IP 주소)과 서버의 네이버 쇼핑 API 키를 확인해주세요.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Color Palette */}
      {palette && (palette.primary || palette.secondary || palette.accent) && (
        <View style={styles.paletteCard}>
          <View style={styles.paletteHeader}>
            <Ionicons name="color-palette-outline" size={16} color={colors.zinc700} />
            <Text style={styles.paletteTitle}>컬러 팔레트</Text>
          </View>
          <View style={styles.paletteColors}>
            {[
              { label: "메인", name: palette.primary },
              { label: "서브", name: palette.secondary },
              { label: "포인트", name: palette.accent },
            ].filter((c) => c.name).map((c) => (
              <View key={c.label} style={styles.paletteItem}>
                <View style={[styles.paletteCircle, { backgroundColor: resolveColorHex(c.name) }]} />
                <Text style={styles.paletteColorLabel}>{c.label}</Text>
                <Text style={styles.paletteColorName}>{c.name}</Text>
              </View>
            ))}
          </View>
          {palette.harmony ? (
            <Text style={styles.paletteHarmony}>{palette.harmony}</Text>
          ) : null}
        </View>
      )}

      {/* Coordination Reason */}
      {result.coordinationReason ? (
        <View style={styles.reasonCard}>
          <View style={styles.reasonHeader}>
            <Ionicons name="bulb-outline" size={16} color="#D97706" />
            <Text style={styles.reasonTitle}>왜 이 조합이 어울릴까?</Text>
          </View>
          <Text style={styles.reasonText}>{result.coordinationReason}</Text>
        </View>
      ) : null}

      {/* Style Tips */}
      {result.styleTip ? (
        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="sparkles-outline" size={16} color="#7C3AED" />
            <Text style={styles.tipTitle}>스타일링 팁</Text>
          </View>
          <Text style={styles.tipText}>{result.styleTip}</Text>
        </View>
      ) : null}

      {/* Regenerate */}
      <Pressable
        style={({ pressed }) => [styles.regenBtn, pressed && { backgroundColor: colors.zinc50 }, regenerating && { opacity: 0.6 }]}
        onPress={() => void handleRegenerate()}
        disabled={regenerating}
      >
        {regenerating ? (
          <ActivityIndicator size="small" color={colors.zinc600} />
        ) : (
          <Ionicons name="refresh-outline" size={16} color={colors.zinc600} />
        )}
        <Text style={styles.regenText}>
          {regenerating ? "AI가 다시 추천 중..." : "다른 코디 추천받기"}
        </Text>
      </Pressable>

      {/* Items */}
      <Text style={styles.itemsTitle}>추천 아이템 {result.items.length}개</Text>

      {result.items.map((item, idx) => {
        const catProducts = products[item.category] ?? [];
        const firstProduct: ShoppingProduct | undefined = catProducts[0];
        const likeKey = `${item.category}-${idx}`;
        const isLiked = liked.has(likeKey);
        const isExpanded = expandedItems.has(idx);

        return (
          <Pressable key={likeKey} style={styles.itemCard} onPress={() => toggleExpand(idx)}>
            {/* Main row */}
            <View style={styles.itemRow}>
              {firstProduct?.image ? (
                <Image source={{ uri: firstProduct.image }} style={styles.productImg} />
              ) : (
                <View style={styles.productImgFallback}>
                  <Ionicons name="shirt-outline" size={20} color={colors.zinc400} />
                </View>
              )}
              <View style={styles.itemInfo}>
                <View style={styles.itemTopRow}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{item.category}</Text>
                  </View>
                  <Pressable style={styles.heartBtn} onPress={() => toggleLike(likeKey)}>
                    <Ionicons
                      name={isLiked ? "heart" : "heart-outline"}
                      size={16}
                      color={isLiked ? "#EF4444" : colors.zinc300}
                    />
                  </Pressable>
                </View>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.title}
                </Text>
                {firstProduct?.lprice ? (
                  <Text style={styles.itemPrice}>{formatPrice(firstProduct.lprice)}</Text>
                ) : item.priceRange ? (
                  <Text style={styles.itemPriceRange}>{item.priceRange}</Text>
                ) : null}
              </View>
            </View>

            {/* Match reason pill */}
            {item.matchReason ? (
              <View style={styles.matchReasonPill}>
                <Ionicons name="link-outline" size={12} color="#059669" />
                <Text style={styles.matchReasonText}>{item.matchReason}</Text>
              </View>
            ) : null}

            {/* Expanded details */}
            {isExpanded && (
              <View style={styles.expandedSection}>
                {item.description ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="chatbubble-outline" size={12} color={colors.zinc500} />
                    <Text style={styles.detailText}>{item.description}</Text>
                  </View>
                ) : null}
                {item.colorInfo ? (
                  <View style={styles.detailRow}>
                    <View style={[styles.detailDot, { backgroundColor: resolveColorHex(item.colorInfo) }]} />
                    <Text style={styles.detailText}>색상: {item.colorInfo}</Text>
                  </View>
                ) : null}
                {item.materialInfo ? (
                  <View style={styles.detailRow}>
                    <Ionicons name="layers-outline" size={12} color={colors.zinc500} />
                    <Text style={styles.detailText}>소재: {item.materialInfo}</Text>
                  </View>
                ) : null}

                {/* Product scroll */}
                {catProducts.length > 0 && (
                  <View style={styles.productsSection}>
                    <Text style={styles.productsLabel}>
                      쇼핑 검색 결과 {catProducts.length}개
                    </Text>
                    <FlatList
                      horizontal
                      data={catProducts}
                      keyExtractor={(p, i) => `${p.productLink}-${i}`}
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.productScroll}
                      renderItem={({ item: p }) => (
                        <Pressable
                          style={({ pressed }) => [styles.productSmallCard, pressed && { opacity: 0.8 }]}
                          onPress={() => openNaver(item.searchKeyword, p.productLink)}
                        >
                          <Image source={{ uri: p.image }} style={styles.productSmallImg} />
                          <View style={styles.productSmallInfo}>
                            <Text style={styles.productSmallTitle} numberOfLines={2}>{p.title}</Text>
                            <Text style={styles.productSmallPrice}>{formatPrice(p.lprice)}</Text>
                            {p.mallName ? <Text style={styles.productSmallMall}>{p.mallName}</Text> : null}
                          </View>
                        </Pressable>
                      )}
                    />
                  </View>
                )}

                {/* Action buttons */}
                <View style={styles.actionsRow}>
                  <Pressable
                    style={({ pressed }) => [styles.buyBtn, pressed && { backgroundColor: colors.zinc100 }]}
                    onPress={() => openNaver(item.searchKeyword, firstProduct?.productLink)}
                  >
                    <Ionicons name="open-outline" size={14} color={colors.zinc600} />
                    <Text style={styles.buyBtnText}>구매하기</Text>
                  </Pressable>
                  {FEATURE_VIRTUAL_TRY_ON_ENABLED ? (
                    <Pressable
                      style={({ pressed }) => [styles.tryOnBtn, pressed && { transform: [{ scale: 0.98 }] }]}
                      onPress={() =>
                        navigation.navigate("VirtualTryOn", {
                          item: {
                            category: item.category,
                            title: item.title,
                            description: item.description,
                            searchKeyword: item.searchKeyword,
                          },
                          initialProduct: firstProduct ?? null,
                          wardrobeImageUrl,
                        })
                      }
                    >
                      <Ionicons name="sparkles" size={14} color="#fff" />
                      <Text style={styles.tryOnBtnText}>착용해보기</Text>
                    </Pressable>
                  ) : (
                    <VirtualTryOnRowPlaceholder variant="dark" expand />
                  )}
                </View>
              </View>
            )}

            {/* Expand hint */}
            {!isExpanded && (
              <View style={styles.expandHint}>
                <Text style={styles.expandHintText}>탭하여 상세보기</Text>
                <Ionicons name="chevron-down" size={14} color={colors.zinc400} />
              </View>
            )}
          </Pressable>
        );
      })}

      {FEATURE_VIRTUAL_TRY_ON_ENABLED ? (
        <Pressable
          style={({ pressed }) => [styles.fullTryOnBtn, pressed && { transform: [{ scale: 0.98 }] }]}
          onPress={() => {
            const firstItem = result.items[0];
            const firstProduct = (products[firstItem?.category] ?? [])[0];
            if (firstItem) {
              navigation.navigate("VirtualTryOn", {
                item: {
                  category: firstItem.category,
                  title: `${result.summary} 전체 코디`,
                  description: result.styleTip,
                  searchKeyword: firstItem.searchKeyword,
                },
                initialProduct: firstProduct ?? null,
                wardrobeImageUrl,
              });
            }
          }}
        >
          <Ionicons name="body-outline" size={18} color="#fff" />
          <Text style={styles.fullTryOnText}>전체 코디 가상 착용해보기</Text>
        </Pressable>
      ) : (
        <VirtualTryOnBottomPlaceholder />
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 48 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.zinc100,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: "600", color: colors.zinc900 },

  heroWrap: {
    marginHorizontal: 20, borderRadius: radius.lg,
    overflow: "hidden", aspectRatio: 3 / 4,
    position: "relative", marginBottom: 16,
  },
  heroImage: { width: "100%", height: "100%" },
  heroGradient: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: spacing.md, paddingTop: 48,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  heroBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4,
  },
  heroBadgeText: { fontSize: 11, fontWeight: "700", color: colors.amber, letterSpacing: 0.5 },
  heroMood: { fontSize: 18, fontWeight: "800", color: "#fff", marginBottom: 2 },
  heroContext: { fontSize: 12, color: "rgba(255,255,255,0.75)" },

  summaryCard: {
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: colors.zinc50, borderRadius: radius.md,
    padding: 14,
  },
  summaryText: { fontSize: 14, fontWeight: "600", color: colors.zinc900, lineHeight: 21 },
  anchorWrap: {
    marginTop: 10,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.zinc200,
    backgroundColor: "#fff",
    gap: 4,
  },
  anchorLabel: { fontSize: 11, fontWeight: "700", color: colors.zinc500 },
  anchorText: { fontSize: 12, color: colors.zinc700, lineHeight: 18 },

  shopErrorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#FEF3C7",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  shopErrorTextWrap: { flex: 1, gap: 4 },
  shopErrorTitle: { fontSize: 13, fontWeight: "700", color: "#92400E" },
  shopErrorBody: { fontSize: 12, color: "#78350F", lineHeight: 18 },
  shopErrorHint: { fontSize: 11, color: "#A16207", lineHeight: 16, marginTop: 2 },

  /* Color Palette */
  paletteCard: {
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: "#fff", borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.zinc100,
    padding: 14, gap: 10,
  },
  paletteHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  paletteTitle: { fontSize: 13, fontWeight: "700", color: colors.zinc800 },
  paletteColors: { flexDirection: "row", gap: 16 },
  paletteItem: { alignItems: "center", gap: 4 },
  paletteCircle: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.zinc200 },
  paletteColorLabel: { fontSize: 10, color: colors.zinc400, fontWeight: "600" },
  paletteColorName: { fontSize: 11, color: colors.zinc700, fontWeight: "500" },
  paletteHarmony: {
    fontSize: 12, color: colors.zinc600, lineHeight: 18,
    backgroundColor: colors.zinc50, borderRadius: radius.sm,
    paddingVertical: 8, paddingHorizontal: 10,
  },

  /* Coordination Reason */
  reasonCard: {
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: "#FFFBEB", borderRadius: radius.md,
    padding: 14, gap: 8,
  },
  reasonHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  reasonTitle: { fontSize: 13, fontWeight: "700", color: "#92400E" },
  reasonText: { fontSize: 12, color: "#78350F", lineHeight: 19 },

  /* Style Tips */
  tipCard: {
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: "#F5F3FF", borderRadius: radius.md,
    padding: 14, gap: 8,
  },
  tipHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  tipTitle: { fontSize: 13, fontWeight: "700", color: "#5B21B6" },
  tipText: { fontSize: 12, color: "#4C1D95", lineHeight: 19 },

  regenBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, marginHorizontal: 20, marginBottom: 20,
    paddingVertical: 12,
    borderWidth: 1, borderColor: colors.zinc200, borderRadius: radius.md,
  },
  regenText: { fontSize: 13, fontWeight: "500", color: colors.zinc600 },

  itemsTitle: {
    fontSize: 16, fontWeight: "700", color: colors.zinc900,
    marginHorizontal: 20, marginBottom: 12,
  },

  itemCard: {
    backgroundColor: "#fff",
    marginHorizontal: 20, marginBottom: 12,
    borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: colors.zinc100,
    gap: 10,
  },
  itemRow: { flexDirection: "row", gap: 12 },
  productImg: {
    width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.zinc100,
  },
  productImgFallback: {
    width: 80, height: 80, borderRadius: radius.md,
    backgroundColor: colors.zinc100,
    alignItems: "center", justifyContent: "center",
  },
  itemInfo: { flex: 1 },
  itemTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  categoryBadge: {
    backgroundColor: colors.zinc900, borderRadius: radius.full,
    paddingVertical: 2, paddingHorizontal: 10,
  },
  categoryBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  heartBtn: { padding: 4 },
  itemName: { fontSize: 14, fontWeight: "600", color: colors.zinc900, marginTop: 6, lineHeight: 20 },
  itemPrice: { fontSize: 15, fontWeight: "700", color: colors.zinc900, marginTop: 2 },
  itemPriceRange: { fontSize: 12, color: colors.zinc500, marginTop: 2 },

  matchReasonPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#ECFDF5", borderRadius: radius.full,
    paddingVertical: 6, paddingHorizontal: 10,
    alignSelf: "flex-start",
  },
  matchReasonText: { fontSize: 11, color: "#065F46", fontWeight: "500" },

  expandedSection: { gap: 10, paddingTop: 4 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  detailDot: { width: 12, height: 12, borderRadius: 6, marginTop: 2 },
  detailText: { flex: 1, fontSize: 12, color: colors.zinc600, lineHeight: 18 },

  productsSection: { gap: 8 },
  productsLabel: { fontSize: 12, fontWeight: "600", color: colors.zinc500 },
  productScroll: { gap: 8, paddingRight: 4 },
  productSmallCard: {
    width: 120, borderRadius: radius.md, overflow: "hidden",
    backgroundColor: colors.zinc50,
  },
  productSmallImg: { width: 120, height: 120, backgroundColor: colors.zinc100 },
  productSmallInfo: { padding: 8, gap: 2 },
  productSmallTitle: { fontSize: 11, color: colors.zinc700, lineHeight: 15 },
  productSmallPrice: { fontSize: 12, fontWeight: "700", color: colors.zinc900 },
  productSmallMall: { fontSize: 10, color: colors.zinc400 },

  actionsRow: { flexDirection: "row", gap: 8, paddingTop: 4 },
  buyBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 10,
    backgroundColor: colors.zinc50, borderWidth: 1, borderColor: colors.zinc200, borderRadius: radius.md,
  },
  buyBtnText: { fontSize: 12, fontWeight: "600", color: colors.zinc600 },
  tryOnBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, paddingVertical: 10,
    backgroundColor: colors.zinc900, borderRadius: radius.md,
  },
  tryOnBtnText: { fontSize: 12, fontWeight: "600", color: "#fff" },

  expandHint: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
  },
  expandHintText: { fontSize: 11, color: colors.zinc400 },

  fullTryOnBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginHorizontal: 20, marginTop: 8,
    backgroundColor: colors.zinc900, borderRadius: radius.lg,
    paddingVertical: 16,
  },
  fullTryOnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
