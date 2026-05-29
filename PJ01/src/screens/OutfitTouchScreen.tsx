import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../hooks/useAuth";
import { getUserProfile } from "../services/userProfileService";
import {
  analyzeGarmentRegions,
  generateOutfitVisualization,
  requestCategoryOutfitRecommendation,
} from "../services/openai";
import { saveRecommendationHistory } from "../services/recommendationService";
import { buildNaverSearchQuery, fetchNaverShoppingProduct } from "../services/naverShoppingService";
import { runWithConcurrency } from "../utils/concurrency";
import { colors, radius, shadow, spacing } from "../theme";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { DetectedGarmentItem, ShoppingProduct, VisionRecommendationResult } from "../types";
import { TextField } from "../components/TextField";
import { FEATURE_VIRTUAL_TRY_ON_ENABLED } from "../constants/features";
import { VirtualTryOnRowPlaceholder } from "../components/VirtualTryOnDisabled";

type Props = NativeStackScreenProps<RootStackParamList, "OutfitTouch">;

type ImageNatural = { w: number; h: number };
type ContainerSize = { w: number; h: number };

function computeContainLayout(container: ContainerSize, natural: ImageNatural | null) {
  if (!natural || natural.w <= 0 || natural.h <= 0 || container.w <= 0 || container.h <= 0) return null;
  const scale = Math.min(container.w / natural.w, container.h / natural.h);
  const dw = natural.w * scale;
  const dh = natural.h * scale;
  const ox = (container.w - dw) / 2;
  const oy = (container.h - dh) / 2;
  return { dw, dh, ox, oy };
}

const BADGE_COLORS = ["#FF5C8A", "#6366F1", "#F59E0B", "#10B981", "#8B5CF6"];
const ACCENT_COLORS = ["#FF5C8A", "#6366F1", "#F59E0B", "#10B981", "#8B5CF6"];
const styleOptions = ["미니멀", "스트릿", "캐주얼", "포멀", "러블리", "오피스"];
const occasionOptions = ["데일리", "출근", "데이트", "여행", "하객"];
const weatherOptions = ["추움", "선선함", "더움", "비오는 날"];

function Chip({
  label,
  active,
  onPress,
  small,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive, small && styles.chipSmall]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive, small && styles.chipTextSmall]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function OutfitTouchScreen({ route }: Props): React.JSX.Element {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { imageUrl, wardrobeItemId } = route.params;

  const [naturalSize, setNaturalSize] = useState<ImageNatural | null>(null);
  const [containerSize, setContainerSize] = useState<ContainerSize>({ w: 0, h: 0 });
  const [detectLoading, setDetectLoading] = useState(true);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [regions, setRegions] = useState<DetectedGarmentItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [recommendLoading, setRecommendLoading] = useState(false);

  const [occasion, setOccasion] = useState("데일리");
  const [weather, setWeather] = useState("선선함");
  const [desiredStyle, setDesiredStyle] = useState("");
  const [budget, setBudget] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [result, setResult] = useState<VisionRecommendationResult | null>(null);
  const [historyId, setHistoryId] = useState("");
  const [productMap, setProductMap] = useState<Record<string, ShoppingProduct | null>>({});
  const [shopFetchError, setShopFetchError] = useState<string | null>(null);

  const [outfitImageUrl, setOutfitImageUrl] = useState<string | null>(null);
  const [imageGenLoading, setImageGenLoading] = useState(false);
  const [conditionsChanged, setConditionsChanged] = useState(false);

  const layout = useMemo(
    () => computeContainLayout(containerSize, naturalSize),
    [containerSize, naturalSize],
  );

  const runDetection = useCallback(async () => {
    setDetectLoading(true);
    setDetectError(null);
    setRegions([]);
    setSelectedIndex(null);
    setResult(null);
    setOutfitImageUrl(null);
    try {
      const detection = await analyzeGarmentRegions(imageUrl);
      setRegions(detection.items);
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : "의류 영역을 분석하지 못했습니다.");
    } finally {
      setDetectLoading(false);
    }
  }, [imageUrl]);

  useEffect(() => { void runDetection(); }, [runDetection]);

  const openNaverLink = async (keyword: string, productLink?: string | null) => {
    const url = productLink
      ? productLink
      : `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}`;
    try { await Linking.openURL(url); } catch { /* ignore */ }
  };

  const onSelectGarment = async (index: number) => {
    if (!user) { Alert.alert("오류", "로그인이 필요합니다."); return; }
    const garment = regions[index];
    if (!garment) return;

    setSelectedIndex(index);
    setRecommendLoading(true);
    setResult(null);
    setProductMap({});
    setShopFetchError(null);
    setHistoryId("");
    setOutfitImageUrl(null);
    setConditionsChanged(false);

    try {
      const profile = await getUserProfile(user.uid);
      const profileText = `키 ${profile?.height ?? "-"}cm, 몸무게 ${profile?.weight ?? "-"}kg, 체형 ${
        profile?.bodyType ?? "미입력"
      }, 선호 스타일 ${profile?.preferredStyle || "미입력"}`;

      const recommendationResult = await requestCategoryOutfitRecommendation({
        imageUrl, profileText, desiredStyle, occasion, weather, budget,
        focusCategory: garment.category,
        garmentColor: garment.color,
        garmentStyle: garment.style,
        garmentPosition: garment.position,
      });
      setResult(recommendationResult);

      const nextMap: Record<string, ShoppingProduct | null> = {};
      let shopErr: string | null = null;
      const fetchResults = await runWithConcurrency(
        recommendationResult.items,
        3,
        async (item) => {
          const query = buildNaverSearchQuery(item.searchKeyword, {
            category: item.category,
            color: item.colorInfo,
            material: item.materialInfo,
            title: item.title,
          });
          return fetchNaverShoppingProduct(query);
        },
      );
      fetchResults.forEach((fetched, idx) => {
        nextMap[String(idx)] = fetched.product;
        if (fetched.error && !shopErr) shopErr = fetched.error;
      });
      setProductMap(nextMap);
      setShopFetchError(shopErr);

      const savedHistoryId = await saveRecommendationHistory({
        uid: user.uid, wardrobeItemId, imageUrl,
        recommendation: JSON.stringify({
          mode: "touch",
          focusCategory: garment.category,
          payload: recommendationResult,
        }),
        desiredStyle, occasion, weather, budget,
      });
      setHistoryId(savedHistoryId);
    } catch (e) {
      Alert.alert("추천 실패", e instanceof Error ? e.message : "추천 생성에 실패했습니다.", [
        { text: "취소", style: "cancel" },
        { text: "다시 시도", onPress: () => void onSelectGarment(index) },
      ]);
    } finally {
      setRecommendLoading(false);
    }
  };

  const handleGenerateVisualization = async () => {
    if (!result) return;
    setImageGenLoading(true);
    try {
      const url = await generateOutfitVisualization(result);
      setOutfitImageUrl(url);
    } catch (e) {
      Alert.alert(
        "이미지 생성 실패",
        e instanceof Error ? e.message : "다시 시도해주세요.",
        [
          { text: "취소", style: "cancel" },
          { text: "다시 시도", onPress: () => void handleGenerateVisualization() },
        ],
      );
    } finally {
      setImageGenLoading(false);
    }
  };

  const badgePositions = useMemo(() => {
    if (!layout) return [];
    return regions.map((item, index) => {
      const { x, y, width, height } = item.boundingBox;
      const centerX = layout.ox + (x + width / 2) * layout.dw;
      const centerY = layout.oy + (y + height / 2) * layout.dh;
      return { index, centerX, centerY, item };
    });
  }, [layout, regions]);

  const selectedGarment = selectedIndex !== null ? regions[selectedIndex] : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ① 조건 설정 (이미지 위에 배치) */}
      <View style={[styles.condCard, shadow.sm]}>
        <View style={styles.condHeader}>
          <Ionicons name="options-outline" size={16} color={colors.primary} />
          <Text style={styles.condTitle}>코디 조건</Text>
          <Pressable style={styles.advToggle} onPress={() => setShowAdvanced((v) => !v)}>
            <Text style={styles.advToggleText}>
              {showAdvanced ? "접기" : "스타일·예산 +"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.condRow}>
          <Text style={styles.condLabel}>상황</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {occasionOptions.map((o) => (
              <Chip key={o} label={o} active={occasion === o} onPress={() => { setOccasion(o); if (result) setConditionsChanged(true); }} small />
            ))}
          </ScrollView>
        </View>

        <View style={styles.condRow}>
          <Text style={styles.condLabel}>날씨</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {weatherOptions.map((w) => (
              <Chip key={w} label={w} active={weather === w} onPress={() => { setWeather(w); if (result) setConditionsChanged(true); }} small />
            ))}
          </ScrollView>
        </View>

        {showAdvanced ? (
          <>
            <View style={styles.condRow}>
              <Text style={styles.condLabel}>스타일</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {styleOptions.map((s) => (
                  <Chip key={s} label={s} active={desiredStyle === s} onPress={() => setDesiredStyle(s)} small />
                ))}
              </ScrollView>
            </View>
            <TextField
              label="예산 (선택)"
              value={budget}
              onChangeText={setBudget}
              placeholder="10만원 이하, 상의 5만원..."
            />
          </>
        ) : null}
      </View>

      {/* ② 이미지 + 터치 뱃지 */}
      <View style={styles.stageWrap}>
        <View
          style={styles.imageStage}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setContainerSize({ w: width, h: height });
          }}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.stageImage}
            resizeMode="contain"
            onLoad={(e) => {
              const { width, height } = e.nativeEvent.source;
              if (width > 0 && height > 0) setNaturalSize({ w: width, h: height });
            }}
          />

          {!detectLoading && !detectError && badgePositions.map(({ index, centerX, centerY, item }) => {
            const selected = selectedIndex === index;
            const color = BADGE_COLORS[index % BADGE_COLORS.length];
            return (
              <Pressable
                key={`badge-${index}`}
                onPress={() => void onSelectGarment(index)}
                style={[
                  styles.garmentBadge,
                  {
                    left: centerX,
                    top: centerY,
                    backgroundColor: selected ? color : "rgba(15,23,42,0.72)",
                    borderColor: selected ? color : "rgba(255,255,255,0.45)",
                    transform: [{ translateX: -40 }, { translateY: -16 }],
                  },
                ]}
              >
                <View style={[styles.badgeDot, { backgroundColor: selected ? "#fff" : color }]} />
                <Text style={styles.badgeText}>{item.category}</Text>
                {selected
                  ? <Ionicons name="checkmark-circle" size={13} color="#fff" />
                  : <Ionicons name="hand-right-outline" size={12} color="rgba(255,255,255,0.7)" />}
              </Pressable>
            );
          })}

          {detectLoading ? (
            <View style={styles.stageOverlay}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.stageOverlayText}>옷 영역 분석 중...</Text>
            </View>
          ) : null}
        </View>

        {!detectLoading && !detectError && regions.length > 0 && !result ? (
          <View style={styles.hintRow}>
            <Ionicons name="hand-right-outline" size={14} color={colors.primary} />
            <Text style={styles.hintText}>뱃지를 탭하면 해당 옷 기준으로 코디를 추천해줘요</Text>
          </View>
        ) : null}

        {conditionsChanged && result ? (
          <View style={styles.condChangedBanner}>
            <Ionicons name="refresh-circle-outline" size={16} color="#D97706" />
            <Text style={styles.condChangedText}>조건이 바뀌었어요. 뱃지를 다시 탭하면 새 조건으로 추천받아요.</Text>
          </View>
        ) : null}

        {detectError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.error} />
            <Text style={styles.errorText}>{detectError}</Text>
            <Pressable onPress={() => void runDetection()} style={styles.retryBtn}>
              <Text style={styles.retryText}>다시 분석</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* ③ 선택된 의류 배너 */}
      {selectedGarment && result ? (
        <View style={[styles.selectedBanner, shadow.sm]}>
          <View style={[styles.selectedDot, { backgroundColor: BADGE_COLORS[selectedIndex! % BADGE_COLORS.length] }]} />
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedCategory}>{selectedGarment.category} 기준 코디</Text>
            <Text style={styles.selectedDetail}>{selectedGarment.color} · {selectedGarment.style}</Text>
          </View>
          <Pressable
            style={styles.rePickBtn}
            onPress={() => { setResult(null); setOutfitImageUrl(null); setSelectedIndex(null); }}
          >
            <Ionicons name="refresh-outline" size={13} color={colors.primary} />
            <Text style={styles.rePickText}>다른 옷 선택</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ④ 추천 결과 */}
      {result ? (
        <View style={styles.resultWrap}>

          {/* AI 코디 시각화 */}
          {!outfitImageUrl && !imageGenLoading ? (
            <Pressable style={[styles.vizBtn, shadow.md]} onPress={() => void handleGenerateVisualization()}>
              <View style={styles.vizBtnInner}>
                <View style={styles.vizIcon}>
                  <Ionicons name="color-wand" size={22} color="#fff" />
                </View>
                <View style={styles.vizBtnText}>
                  <Text style={styles.vizBtnTitle}>AI 코디 이미지 생성</Text>
                  <Text style={styles.vizBtnSub}>선택한 옷 외형을 고정하고 나머지 조각만 얹은 참고 이미지예요</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
              </View>
            </Pressable>
          ) : null}

          {imageGenLoading ? (
            <View style={[styles.vizLoadingCard, shadow.sm]}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.vizLoadingTitle}>AI가 코디 이미지를 그리는 중...</Text>
              <Text style={styles.vizLoadingSub}>보통 15~25초 소요됩니다</Text>
            </View>
          ) : null}

          {outfitImageUrl ? (
            <View style={[styles.vizResultCard, shadow.sm]}>
              <View style={styles.vizResultHeader}>
                <Ionicons name="sparkles" size={16} color={colors.primary} />
                <Text style={styles.vizResultTitle}>AI 코디 시각화</Text>
                <Pressable onPress={() => void handleGenerateVisualization()} style={styles.vizRegenBtn}>
                  <Ionicons name="refresh" size={13} color={colors.subText} />
                  <Text style={styles.vizRegenText}>재생성</Text>
                </Pressable>
              </View>
              <Image source={{ uri: outfitImageUrl }} style={styles.vizImage} resizeMode="cover" />
              <Text style={styles.vizDisclaimer}>
                * 생성 이미지는 참고용입니다. 사진 속 옷·쇼핑 카드 실물과 완전히 같지 않을 수 있어요.
              </Text>
            </View>
          ) : null}

          {/* 코디 요약 */}
          <View style={[styles.summaryCard, shadow.sm]}>
            <View style={styles.summaryHeader}>
              <View style={styles.summaryIcon}>
                <Ionicons name="sparkles" size={16} color={colors.primary} />
              </View>
              <Text style={styles.summaryTitle}>AI 코디 요약</Text>
            </View>
            <Text style={styles.summaryText}>{result.summary}</Text>
            {result.visualAnchorKo ? (
              <View style={styles.anchorWrap}>
                <Text style={styles.anchorLabel}>AI가 인식한 선택 옷</Text>
                <Text style={styles.anchorText}>{result.visualAnchorKo}</Text>
              </View>
            ) : null}
            <View style={styles.tipRow}>
              <Ionicons name="bulb-outline" size={13} color={colors.warning} />
              <Text style={styles.tipText}>{result.styleTip}</Text>
            </View>
            {shopFetchError ? (
              <View style={styles.shopErrBox}>
                <Ionicons name="warning-outline" size={14} color="#B45309" />
                <Text style={styles.shopErrText}>쇼핑 API: {shopFetchError}</Text>
              </View>
            ) : null}
          </View>

          {/* 아이템 카드 */}
          <Text style={styles.itemsTitle}>추천 아이템 {result.items.length}개</Text>
          {result.items.map((item, idx) => {
            const product = productMap[String(idx)];
            const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length];
            return (
              <View key={`${item.category}-${idx}`} style={[styles.itemCard, shadow.sm]}>
                <View style={styles.itemHeader}>
                  <View style={[styles.categoryTag, { backgroundColor: accent + "18" }]}>
                    <View style={[styles.categoryDot, { backgroundColor: accent }]} />
                    <Text style={[styles.categoryText, { color: accent }]}>{item.category}</Text>
                  </View>
                </View>
                <View style={styles.itemBody}>
                  {product?.image ? (
                    <Image source={{ uri: product.image }} style={styles.productImg} />
                  ) : (
                    <View style={[styles.productImgFallback, { borderColor: accent + "40" }]}>
                      <Ionicons name="shirt-outline" size={22} color={accent} />
                    </View>
                  )}
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={2}>{product?.title || item.title}</Text>
                    {product?.lprice ? (
                      <Text style={styles.priceText}>
                        최저가 {Number(product.lprice).toLocaleString()}원
                        <Text style={styles.mallName}> · {product.mallName}</Text>
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.descBox}>
                  <Text style={styles.descText}>{item.description}</Text>
                </View>
                <View style={styles.itemActions}>
                  <Pressable
                    style={({ pressed }) => [styles.naverBtn, { borderColor: accent, flex: 1 }, pressed && { opacity: 0.8 }]}
                    onPress={() => void openNaverLink(item.searchKeyword, product?.productLink)}
                  >
                    <Ionicons name="storefront-outline" size={13} color={accent} />
                    <Text style={[styles.naverBtnText, { color: accent }]} numberOfLines={1}>
                      {product?.productLink ? "네이버 구매" : "네이버 검색"}
                    </Text>
                  </Pressable>
                  {FEATURE_VIRTUAL_TRY_ON_ENABLED ? (
                    <Pressable
                      style={styles.tryOnBtn}
                      onPress={() =>
                        navigation.navigate("VirtualTryOn", {
                          item: {
                            category: item.category,
                            title: item.title,
                            description: item.description,
                            searchKeyword: item.searchKeyword,
                          },
                          initialProduct: product ?? null,
                        })
                      }
                    >
                      <Ionicons name="body-outline" size={13} color="#fff" />
                      <Text style={styles.tryOnBtnText}>착용해보기</Text>
                    </Pressable>
                  ) : (
                    <VirtualTryOnRowPlaceholder variant="muted" />
                  )}
                </View>
              </View>
            );
          })}

          {/* 피드백 */}
          {historyId ? (
            <View style={[styles.feedbackCard, shadow.sm]}>
              <Text style={styles.feedbackTitle}>이 추천이 도움이 됐나요?</Text>
              <View style={styles.feedbackRow}>
                <Pressable
                  style={[styles.feedbackBtn, styles.feedbackLike]}
                  onPress={async () => {
                    if (!user) return;
                    const { updateRecommendationFeedback } = await import("../services/recommendationService");
                    await updateRecommendationFeedback({ uid: user.uid, historyId, feedback: "like" });
                    Alert.alert("고마워요!", "다음 추천에 반영할게요.");
                  }}
                >
                  <Text style={styles.feedbackLikeText}>👍  도움돼요</Text>
                </Pressable>
                <Pressable
                  style={[styles.feedbackBtn, styles.feedbackDislike]}
                  onPress={async () => {
                    if (!user) return;
                    const { updateRecommendationFeedback } = await import("../services/recommendationService");
                    await updateRecommendationFeedback({ uid: user.uid, historyId, feedback: "dislike" });
                    Alert.alert("확인했어요", "다른 스타일로 조정해볼게요.");
                  }}
                >
                  <Text style={styles.feedbackDislikeText}>별로예요</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <LoadingOverlay visible={detectLoading} message={"착용 의류를 분석하는 중..."} />
      <LoadingOverlay visible={recommendLoading} message={"선택한 옷 기준으로\nAI 코디를 완성하는 중..."} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: 48 },

  /* 조건 카드 */
  condCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  condHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  condTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.text },
  advToggle: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  advToggleText: { fontSize: 12, color: colors.primary, fontWeight: "700" },
  condRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  condLabel: { fontSize: 12, fontWeight: "700", color: colors.subText, width: 32 },
  chipScroll: { gap: 7, paddingRight: 4 },

  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  chipSmall: { paddingVertical: 5, paddingHorizontal: 11 },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { color: colors.subText, fontSize: 13, fontWeight: "600" },
  chipTextSmall: { fontSize: 12 },
  chipTextActive: { color: colors.primary },

  /* 이미지 스테이지 */
  stageWrap: { gap: 10 },
  imageStage: {
    width: "100%",
    height: 380,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#0F172A",
    position: "relative",
    ...shadow.sm,
  },
  stageImage: { width: "100%", height: "100%" },
  garmentBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.full,
    borderWidth: 1.5,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  stageOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    gap: 8,
  },
  stageOverlayText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hintText: { flex: 1, fontSize: 12, color: colors.primary, fontWeight: "600" },
  condChangedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#FEF3C7",
    borderRadius: radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  condChangedText: { flex: 1, fontSize: 12, color: "#92400E", fontWeight: "600", lineHeight: 18 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.errorLight,
    borderRadius: radius.sm,
    padding: 12,
  },
  errorText: { flex: 1, color: colors.error, fontSize: 13 },
  retryBtn: {
    backgroundColor: colors.error,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  /* 선택 배너 */
  selectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  selectedInfo: { flex: 1 },
  selectedCategory: { fontSize: 14, fontWeight: "800", color: colors.text },
  selectedDetail: { fontSize: 12, color: colors.subText, marginTop: 1 },
  rePickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  rePickText: { fontSize: 12, color: colors.primary, fontWeight: "600" },

  /* 결과 영역 */
  resultWrap: { gap: spacing.md },

  /* AI 코디 시각화 버튼 */
  vizBtn: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.primary,
  },
  vizBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: spacing.md,
  },
  vizIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  vizBtnText: { flex: 1 },
  vizBtnTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
  vizBtnSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },

  /* 로딩 */
  vizLoadingCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 28,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vizLoadingTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  vizLoadingSub: { fontSize: 12, color: colors.subText },

  /* 시각화 결과 */
  vizResultCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  vizResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: spacing.md,
    paddingBottom: 10,
  },
  vizResultTitle: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.text },
  vizRegenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  vizRegenText: { fontSize: 11, color: colors.subText, fontWeight: "600" },
  vizImage: { width: "100%", height: 440, backgroundColor: colors.surfaceAlt },
  vizDisclaimer: {
    fontSize: 11,
    color: colors.subText,
    textAlign: "center",
    padding: 10,
    paddingTop: 8,
  },

  /* 요약 */
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  summaryText: { fontSize: 14, color: colors.text, lineHeight: 22 },
  anchorWrap: {
    marginTop: 10,
    marginBottom: 2,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.zinc200,
    backgroundColor: colors.zinc50,
    gap: 4,
  },
  anchorLabel: { fontSize: 11, fontWeight: "700", color: colors.zinc500 },
  anchorText: { fontSize: 12, lineHeight: 18, color: colors.zinc700 },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#FFFBEB",
    borderRadius: radius.sm,
    padding: 10,
  },
  tipText: { flex: 1, fontSize: 13, color: "#92400E", lineHeight: 19 },
  shopErrBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  shopErrText: { flex: 1, fontSize: 12, color: "#78350F", lineHeight: 18 },

  /* 아이템 */
  itemsTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemHeader: { flexDirection: "row" },
  categoryTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
  },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
  categoryText: { fontSize: 12, fontWeight: "700" },
  itemBody: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  productImg: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  productImgFallback: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  itemInfo: { flex: 1, gap: 5 },
  itemTitle: { fontSize: 14, fontWeight: "700", color: colors.text, lineHeight: 20 },
  priceText: { fontSize: 13, fontWeight: "800", color: colors.text },
  mallName: { fontSize: 12, fontWeight: "400", color: colors.subText },
  descBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  descText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  itemActions: { flexDirection: "row", gap: 8 },
  naverBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  naverBtnText: { fontSize: 12, fontWeight: "700" },
  tryOnBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  tryOnBtnText: { fontSize: 12, fontWeight: "800", color: "#fff" },

  /* 피드백 */
  feedbackCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  feedbackTitle: { fontSize: 14, fontWeight: "700", color: colors.text, textAlign: "center" },
  feedbackRow: { flexDirection: "row", gap: 10 },
  feedbackBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  feedbackLike: { backgroundColor: colors.primaryLight },
  feedbackDislike: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  feedbackLikeText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  feedbackDislikeText: { fontSize: 14, fontWeight: "600", color: colors.subText },
});
