import React, { useMemo, useState } from "react";
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
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";
import { getUserProfile } from "../services/userProfileService";
import { generateOutfitVisualization, requestVisionRecommendation } from "../services/openai";
import { saveRecommendationHistory } from "../services/recommendationService";
import { buildNaverSearchQuery, fetchNaverShoppingProduct } from "../services/naverShoppingService";
import { colors, radius, shadow, spacing } from "../theme";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { ShoppingProduct, VisionRecommendationResult } from "../types";
import { TextField } from "../components/TextField";
import { reportError } from "../services/monitoringService";
import { runWithConcurrency } from "../utils/concurrency";
import { FEATURE_VIRTUAL_TRY_ON_ENABLED } from "../constants/features";
import { VirtualTryOnRowPlaceholder } from "../components/VirtualTryOnDisabled";

type Props = NativeStackScreenProps<RootStackParamList, "Recommend">;

const ACCENT_COLORS = ["#FF5C8A", "#6366F1", "#F59E0B", "#10B981", "#8B5CF6"];
const styleOptions = ["미니멀", "스트릿", "캐주얼", "포멀", "러블리", "오피스"];
const occasionOptions = ["데일리", "출근", "데이트", "여행", "하객"];
const weatherOptions = ["추움", "선선함", "더움", "비오는 날"];

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function RecommendScreen({ route }: Props): React.JSX.Element {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { imageUrl, wardrobeItemId } = route.params;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisionRecommendationResult | null>(null);
  const [occasion, setOccasion] = useState("데일리");
  const [weather, setWeather] = useState("선선함");
  const [desiredStyle, setDesiredStyle] = useState("");
  const [budget, setBudget] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [historyId, setHistoryId] = useState("");
  const [productMap, setProductMap] = useState<Record<string, ShoppingProduct | null>>({});
  const [shopFetchError, setShopFetchError] = useState<string | null>(null);
  const [outfitImageUrl, setOutfitImageUrl] = useState<string | null>(null);
  const [imageGenLoading, setImageGenLoading] = useState(false);

  const hasResult = useMemo(() => Boolean(result), [result]);

  const openNaverLink = async (keyword: string, productLink?: string | null) => {
    const url = productLink
      ? productLink
      : `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(keyword)}`;
    try { await Linking.openURL(url); } catch { /* ignore */ }
  };

  const runRecommend = async () => {
    if (!user) { Alert.alert("오류", "로그인이 필요합니다."); return; }
    if (loading) return;
    setLoading(true);
    setOutfitImageUrl(null);
    setShopFetchError(null);
    try {
      const profile = await getUserProfile(user.uid);
      const profileText = `키 ${profile?.height ?? "-"}cm, 몸무게 ${profile?.weight ?? "-"}kg, 체형 ${
        profile?.bodyType ?? "미입력"
      }, 선호 스타일 ${profile?.preferredStyle || "미입력"}`;
      const recommendationResult = await requestVisionRecommendation({
        imageUrl, profileText, desiredStyle, occasion, weather, budget,
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
        recommendation: JSON.stringify(recommendationResult),
        desiredStyle, occasion, weather, budget,
      });
      setHistoryId(savedHistoryId);
    } catch (error) {
      void reportError(error, "recommend_screen");
      const message = error instanceof Error ? error.message : "추천 생성에 실패했습니다.";
      Alert.alert("추천 생성 실패", message, [
        { text: "취소", style: "cancel" },
        { text: "다시 시도", onPress: () => { void runRecommend(); } },
      ]);
    } finally {
      setLoading(false);
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

  const submitFeedback = async (feedback: "like" | "dislike") => {
    if (!user) return;
    try {
      const { updateRecommendationFeedback } = await import("../services/recommendationService");
      await updateRecommendationFeedback({ uid: user.uid, historyId, feedback });
      Alert.alert(
        feedback === "like" ? "고마워요!" : "확인했어요",
        feedback === "like" ? "다음 추천에 반영할게요." : "다른 스타일로 조정해볼게요.",
      );
    } catch (error) {
      void reportError(error, `feedback_${feedback}`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ① 업로드 사진 크게 표시 */}
      <View style={[styles.imageCard, shadow.sm]}>
        <Image source={{ uri: imageUrl }} style={styles.heroImage} resizeMode="cover" />
        <View style={styles.imageOverlay}>
          <View style={styles.imageLabel}>
            <Ionicons name="shirt-outline" size={13} color="#fff" />
            <Text style={styles.imageLabelText}>업로드한 옷</Text>
          </View>
        </View>
      </View>

      {/* ② 조건 카드 */}
      <View style={[styles.condCard, shadow.sm]}>
        <View style={styles.condHeader}>
          <Ionicons name="options-outline" size={16} color={colors.primary} />
          <Text style={styles.condTitle}>어떤 코디를 원하나요?</Text>
          <Pressable style={styles.advToggle} onPress={() => setShowAdvanced((v) => !v)}>
            <Text style={styles.advToggleText}>{showAdvanced ? "접기" : "상세 설정 +"}</Text>
          </Pressable>
        </View>

        <View style={styles.condRow}>
          <Text style={styles.condLabel}>상황</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {occasionOptions.map((o) => (
              <Chip key={o} label={o} active={occasion === o} onPress={() => setOccasion(o)} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.condRow}>
          <Text style={styles.condLabel}>날씨</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
            {weatherOptions.map((w) => (
              <Chip key={w} label={w} active={weather === w} onPress={() => setWeather(w)} />
            ))}
          </ScrollView>
        </View>

        {showAdvanced ? (
          <>
            <View style={styles.condRow}>
              <Text style={styles.condLabel}>스타일</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {styleOptions.map((s) => (
                  <Chip key={s} label={s} active={desiredStyle === s} onPress={() => setDesiredStyle(s)} />
                ))}
              </ScrollView>
            </View>
            <TextField
              label="직접 입력"
              value={desiredStyle}
              onChangeText={setDesiredStyle}
              placeholder="소개팅룩, 힙한 스트릿..."
            />
            <TextField
              label="예산 (선택)"
              value={budget}
              onChangeText={setBudget}
              placeholder="10만원 이하, 상의 5만원..."
            />
          </>
        ) : null}
      </View>

      {/* ③ 추천받기 버튼 */}
      {!hasResult ? (
        <Button title="AI 코디 추천받기" onPress={() => void runRecommend()} loading={loading} size="lg" />
      ) : (
        <Pressable
          style={styles.reRunBtn}
          onPress={() => { setResult(null); setOutfitImageUrl(null); setHistoryId(""); }}
        >
          <Ionicons name="refresh" size={14} color={colors.primary} />
          <Text style={styles.reRunText}>조건 바꿔서 다시 추천받기</Text>
        </Pressable>
      )}

      {/* ④ 추천 결과 */}
      {hasResult && result ? (
        <View style={styles.resultWrap}>

          {/* AI 코디 시각화 */}
          {!outfitImageUrl && !imageGenLoading ? (
            <Pressable style={[styles.vizBtn, shadow.md]} onPress={() => void handleGenerateVisualization()}>
              <View style={styles.vizBtnInner}>
                <View style={styles.vizIcon}>
                  <Ionicons name="color-wand" size={22} color="#fff" />
                </View>
                <View style={styles.vizTextWrap}>
                  <Text style={styles.vizBtnTitle}>AI 코디 이미지 생성</Text>
                  <Text style={styles.vizBtnSub}>내 옷(사진) 외형을 고정하고 나머지 조각만 얹은 참고 이미지예요</Text>
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
                <Ionicons name="sparkles" size={15} color={colors.primary} />
                <Text style={styles.vizResultTitle}>AI 코디 시각화</Text>
                <Pressable onPress={() => void handleGenerateVisualization()} style={styles.vizRegenBtn}>
                  <Ionicons name="refresh" size={12} color={colors.subText} />
                  <Text style={styles.vizRegenText}>재생성</Text>
                </Pressable>
              </View>
              <Image source={{ uri: outfitImageUrl }} style={styles.vizImage} resizeMode="cover" />
              <Text style={styles.vizDisclaimer}>
                * 생성 이미지는 참고용입니다. 업로드한 옷과 완전히 같지 않을 수 있고, 아래 쇼핑 카드 실물·색상과도 다를 수 있어요.
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
                <Text style={styles.anchorLabel}>AI가 인식한 내 옷</Text>
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
                <Text style={styles.shopErrText}>
                  쇼핑 API: {shopFetchError}
                </Text>
              </View>
            ) : null}
          </View>

          {/* 아이템 카드 목록 */}
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
                  onPress={() => void submitFeedback("like")}
                >
                  <Text style={styles.feedbackLikeText}>👍  도움돼요</Text>
                </Pressable>
                <Pressable
                  style={[styles.feedbackBtn, styles.feedbackDislike]}
                  onPress={() => void submitFeedback("dislike")}
                >
                  <Text style={styles.feedbackDislikeText}>별로예요</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <LoadingOverlay visible={loading} message={"AI가 코디를 분석하는 중...\n잠시만 기다려주세요"} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: 48 },

  /* 이미지 */
  imageCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroImage: { width: "100%", height: 280, backgroundColor: colors.surfaceAlt },
  imageOverlay: {
    position: "absolute",
    bottom: 10,
    left: 10,
  },
  imageLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  imageLabelText: { fontSize: 12, color: "#fff", fontWeight: "600" },

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
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { color: colors.subText, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.primary },

  /* 다시 추천 */
  reRunBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  reRunText: { fontSize: 13, color: colors.primary, fontWeight: "600" },

  /* 결과 */
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
  vizTextWrap: { flex: 1 },
  vizBtnTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
  vizBtnSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },

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
