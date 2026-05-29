import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { RootStackParamList } from "../navigation/RootNavigator";
import { FEATURE_VIRTUAL_TRY_ON_ENABLED } from "../constants/features";
import { useAuth } from "../hooks/useAuth";
import { getOrCreateAvatar, regenerateAvatar } from "../services/avatarService";
import { fetchNaverShoppingProducts } from "../services/naverShoppingService";
import {
  FalTryOnResult,
  mapCategoryToFal,
  pollKolorsTryOn,
  startKolorsTryOn,
} from "../services/falService";
import { colors, radius, shadow, spacing } from "../theme";
import { ShoppingProduct } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "VirtualTryOn">;
type Step = "setup" | "generating" | "done" | "error";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 40; // 2분

function CategoryBadge({ category }: { category: string }) {
  const color = category.includes("하의") || category.includes("바지")
    ? "#6366F1"
    : category.includes("신발")
    ? "#10B981"
    : category.includes("아우터")
    ? "#F59E0B"
    : category.includes("액세서리")
    ? "#8B5CF6"
    : "#FF5C8A";
  return (
    <View style={[styles.catBadge, { backgroundColor: color + "18" }]}>
      <View style={[styles.catDot, { backgroundColor: color }]} />
      <Text style={[styles.catText, { color }]}>{category}</Text>
    </View>
  );
}

export function VirtualTryOnScreen({ route, navigation }: Props): React.JSX.Element {
  const { user } = useAuth();
  const { item, initialProduct } = route.params;

  const [step, setStep] = useState<Step>("setup");
  const [errorMsg, setErrorMsg] = useState("");

  /* AI 아바타 */
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [avatarError, setAvatarError] = useState("");

  /* 착용할 상품 */
  const [product, setProduct] = useState<ShoppingProduct | null>(initialProduct);
  const [showSearch, setShowSearch] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState(item.searchKeyword);
  const [searchResults, setSearchResults] = useState<ShoppingProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  /* 결과 */
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);
  const unmountedRef = useRef(false);  // 컴포넌트 언마운트 여부
  const cancelledRef = useRef(false);  // 현재 요청 취소 여부 (재사용 가능)

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      cancelledRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  /* 아바타 자동 로드 */
  useEffect(() => {
    if (!user) return;
    setAvatarLoading(true);
    setAvatarError("");
    getOrCreateAvatar(user.uid)
      .then((url) => { setAvatarUrl(url); setAvatarLoading(false); })
      .catch((e) => {
        setAvatarError(e instanceof Error ? e.message : "아바타 생성 실패");
        setAvatarLoading(false);
      });
  }, [user]);

  const handleRegenerateAvatar = async () => {
    if (!user) return;
    setAvatarLoading(true);
    setAvatarError("");
    try {
      const url = await regenerateAvatar(user.uid);
      setAvatarUrl(url);
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : "아바타 재생성 실패");
    } finally {
      setAvatarLoading(false);
    }
  };

  /* 상품 재검색 */
  const runSearch = async () => {
    if (!searchKeyword.trim()) return;
    setSearchLoading(true);
    const { products, error } = await fetchNaverShoppingProducts(searchKeyword.trim(), 6);
    setSearchResults(products);
    if (error) Alert.alert("쇼핑 검색 실패", error);
    setSearchLoading(false);
  };

  const selectProduct = (p: ShoppingProduct) => {
    setProduct(p);
    setShowSearch(false);
    setSearchResults([]);
  };

  /* 폴링 루프 */
  const startPolling = useCallback((requestId: string) => {
    pollCountRef.current = 0;

    const poll = async () => {
      if (cancelledRef.current || unmountedRef.current) return;
      if (pollCountRef.current >= POLL_MAX_TRIES) {
        setErrorMsg("시간 초과: 착용 이미지 생성에 너무 오래 걸립니다. 다시 시도해주세요.");
        setStep("error");
        return;
      }
      pollCountRef.current += 1;
      try {
        const result: FalTryOnResult = await pollKolorsTryOn(requestId);
        if (cancelledRef.current || unmountedRef.current) return;
        if (result.status === "COMPLETED") {
          if (result.output_url) {
            setResultUrl(result.output_url);
            setStep("done");
          } else {
            setErrorMsg("결과 이미지를 가져오지 못했습니다.");
            setStep("error");
          }
          return;
        }
        if (result.status === "FAILED") {
          setErrorMsg(result.error ?? "가상 착용 생성에 실패했습니다.");
          setStep("error");
          return;
        }
        pollTimerRef.current = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch (e) {
        if (!cancelledRef.current && !unmountedRef.current) {
          setErrorMsg(e instanceof Error ? e.message : "상태 조회 실패");
          setStep("error");
        }
      }
    };

    void poll();
  }, []);

  /* 가상 착용 시작 */
  const startTryOn = async () => {
    if (!user) { Alert.alert("오류", "로그인이 필요합니다."); return; }
    if (!avatarUrl) { Alert.alert("아바타 필요", "AI 아바타가 아직 준비되지 않았습니다."); return; }
    if (!product?.image) { Alert.alert("상품 필요", "착용할 상품을 선택해주세요."); return; }

    setResultUrl(null);
    setErrorMsg("");
    setStep("generating");
    cancelledRef.current = false;

    try {
      const category = mapCategoryToFal(item.category);
      const job = await startKolorsTryOn({
        humanImageUrl: avatarUrl,
        garmentImageUrl: product.image,
        category,
      });

      if (!job.request_id) throw new Error("요청 ID를 받지 못했습니다.");
      startPolling(job.request_id);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "가상 착용 중 오류가 발생했습니다.");
      setStep("error");
    }
  };

  const reset = () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setResultUrl(null);
    setErrorMsg("");
    setStep("setup");
  };

  const cancelGeneration = () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    cancelledRef.current = true;
    setStep("setup");
  };

  const saveToGallery = async () => {
    if (!resultUrl) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") { Alert.alert("권한 필요", "갤러리 저장 권한을 허용해주세요."); return; }
      const downloaded = await File.downloadFileAsync(resultUrl, new File(Paths.cache, `tryon_${Date.now()}.jpg`));
      await MediaLibrary.saveToLibraryAsync(downloaded.uri);
      Alert.alert("저장 완료", "갤러리에 이미지가 저장되었습니다.");
    } catch {
      Alert.alert("저장 실패", "이미지 저장에 실패했습니다.");
    }
  };

  const shareResult = async () => {
    if (!resultUrl) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) { Alert.alert("공유 불가", "이 기기에서는 공유가 지원되지 않습니다."); return; }
      const downloaded = await File.downloadFileAsync(resultUrl, new File(Paths.cache, `tryon_${Date.now()}.jpg`));
      await Sharing.shareAsync(downloaded.uri, { mimeType: "image/jpeg" });
    } catch {
      Alert.alert("공유 실패", "이미지 공유에 실패했습니다.");
    }
  };

  const isGenerating = step === "generating";
  const canStart = Boolean(avatarUrl) && Boolean(product?.image) && !isGenerating && !avatarLoading;

  if (!FEATURE_VIRTUAL_TRY_ON_ENABLED) {
    return (
      <View style={styles.gateRoot}>
        <View style={styles.gateInner}>
          <Ionicons name="hourglass-outline" size={48} color={colors.zinc400} />
          <Text style={styles.gateTitle}>가상 착용</Text>
          <View style={styles.gatePill}><Text style={styles.gatePillText}>베타</Text></View>
          <Text style={styles.gateBody}>정식 출시 예정입니다.{"\n"}조금만 기다려 주세요.</Text>
          <Pressable style={styles.gateBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.gateBtnText}>돌아가기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* 아이템 헤더 */}
      <View style={[styles.itemHeader, shadow.sm]}>
        <CategoryBadge category={item.category} />
        <View style={styles.itemHeaderText}>
          <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
        </View>
      </View>

      {/* ① AI 아바타 */}
      <View style={[styles.section, shadow.sm]}>
        <View style={styles.sectionHeader}>
          <View style={styles.stepBadge}><Text style={styles.stepNum}>1</Text></View>
          <Text style={styles.sectionTitle}>내 AI 아바타</Text>
        </View>
        <Text style={styles.sectionDesc}>온보딩 체형 정보로 생성된 AI 모델입니다</Text>

        {avatarLoading ? (
          <View style={styles.avatarLoadingWrap}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.avatarLoadingText}>AI 아바타 생성 중...{"\n"}처음에는 20~30초 소요됩니다</Text>
          </View>
        ) : avatarError ? (
          <View style={styles.avatarErrorWrap}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.error} />
            <Text style={styles.avatarErrorText}>{avatarError}</Text>
            <Pressable style={styles.avatarRetryBtn} onPress={() => void handleRegenerateAvatar()}>
              <Ionicons name="refresh" size={14} color="#fff" />
              <Text style={styles.avatarRetryText}>다시 생성</Text>
            </Pressable>
          </View>
        ) : avatarUrl ? (
          <View style={styles.avatarWrap}>
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
            <Pressable style={styles.avatarRegenBtn} onPress={() => void handleRegenerateAvatar()}>
              <Ionicons name="refresh" size={13} color="#fff" />
              <Text style={styles.avatarRegenText}>아바타 재생성</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* ② 착용할 상품 */}
      <View style={[styles.section, shadow.sm]}>
        <View style={styles.sectionHeader}>
          <View style={styles.stepBadge}><Text style={styles.stepNum}>2</Text></View>
          <Text style={styles.sectionTitle}>착용할 상품 확인</Text>
        </View>

        {product ? (
          <View style={styles.productRow}>
            <Image source={{ uri: product.image }} style={styles.productImg} resizeMode="cover" />
            <View style={styles.productInfo}>
              <Text style={styles.productTitle} numberOfLines={3}>{product.title}</Text>
              {product.lprice ? (
                <Text style={styles.productPrice}>
                  {Number(product.lprice).toLocaleString()}원
                  <Text style={styles.productMall}> · {product.mallName}</Text>
                </Text>
              ) : null}
              <Pressable style={styles.productLinkBtn} onPress={() => void Linking.openURL(product.productLink)}>
                <Ionicons name="open-outline" size={12} color={colors.primary} />
                <Text style={styles.productLinkText}>네이버에서 보기</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.noProductBox}>
            <Ionicons name="shirt-outline" size={28} color={colors.subText} />
            <Text style={styles.noProductText}>검색된 상품이 없습니다</Text>
          </View>
        )}

        <Pressable
          style={styles.reSearchBtn}
          onPress={() => { setShowSearch((v) => !v); if (!showSearch) void runSearch(); }}
        >
          <Ionicons name="search-outline" size={14} color={colors.primary} />
          <Text style={styles.reSearchBtnText}>{showSearch ? "검색 닫기" : "다른 상품 찾기"}</Text>
        </Pressable>

        {showSearch ? (
          <View style={styles.searchBox}>
            <View style={styles.searchInputRow}>
              <TextInput
                style={styles.searchInput}
                value={searchKeyword}
                onChangeText={setSearchKeyword}
                placeholder="검색어 입력..."
                returnKeyType="search"
                onSubmitEditing={() => void runSearch()}
                placeholderTextColor={colors.subText}
              />
              <Pressable style={styles.searchRunBtn} onPress={() => void runSearch()}>
                {searchLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={16} color="#fff" />}
              </Pressable>
            </View>
            {searchResults.length > 0 ? (
              <View style={styles.searchResultGrid}>
                {searchResults.map((p, idx) => (
                  <Pressable
                    key={idx}
                    style={[styles.searchResultItem, product?.productLink === p.productLink && styles.searchResultItemActive]}
                    onPress={() => selectProduct(p)}
                  >
                    <Image source={{ uri: p.image }} style={styles.searchResultImg} resizeMode="cover" />
                    <Text style={styles.searchResultTitle} numberOfLines={2}>{p.title}</Text>
                    <Text style={styles.searchResultPrice}>{Number(p.lprice).toLocaleString()}원</Text>
                    {product?.productLink === p.productLink ? (
                      <View style={styles.selectedMark}><Ionicons name="checkmark" size={14} color="#fff" /></View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : searchLoading ? (
              <View style={styles.searchLoadingWrap}><ActivityIndicator color={colors.primary} /></View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* ③ 가상 착용 시작 */}
      <Pressable
        style={({ pressed }) => [styles.startBtn, shadow.lg, !canStart && styles.startBtnDisabled, pressed && canStart && { opacity: 0.85 }]}
        onPress={() => void startTryOn()}
        disabled={!canStart}
      >
        <Ionicons name="body-outline" size={20} color="#fff" />
        <Text style={styles.startBtnText}>AI 가상 착용 시작</Text>
      </Pressable>

      {/* 생성 중 */}
      {isGenerating ? (
        <View style={[styles.generatingCard, shadow.sm]}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.generatingTitle}>AI가 착용 이미지를 생성하는 중...</Text>
          <Text style={styles.generatingSub}>보통 30~60초 소요됩니다</Text>
          <View style={styles.generatingSteps}>
            {["아바타 분석", "의류 매핑", "이미지 합성", "마무리"].map((s) => (
              <View key={s} style={styles.generatingStep}>
                <View style={styles.generatingStepDot} />
                <Text style={styles.generatingStepText}>{s}</Text>
              </View>
            ))}
          </View>
          <Pressable style={styles.cancelBtn} onPress={cancelGeneration}>
            <Ionicons name="close-circle-outline" size={14} color={colors.zinc500} />
            <Text style={styles.cancelBtnText}>취소</Text>
          </Pressable>
        </View>
      ) : null}

      {/* 오류 */}
      {step === "error" ? (
        <View style={[styles.errorCard, shadow.sm]}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.error} />
          <Text style={styles.errorTitle}>착용 이미지 생성 실패</Text>
          <Text style={styles.errorMsg}>{errorMsg}</Text>
          <Pressable style={styles.errorRetryBtn} onPress={reset}>
            <Ionicons name="refresh" size={14} color="#fff" />
            <Text style={styles.errorRetryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}

      {/* 결과 */}
      {step === "done" && resultUrl ? (
        <View style={styles.resultWrap}>
          <View style={[styles.resultCard, shadow.md]}>
            <View style={styles.resultHeader}>
              <View style={styles.resultIconWrap}>
                <Ionicons name="sparkles" size={16} color={colors.primary} />
              </View>
              <Text style={styles.resultTitle}>가상 착용 결과</Text>
              <Pressable style={styles.reGenBtn} onPress={reset}>
                <Ionicons name="refresh" size={13} color={colors.subText} />
                <Text style={styles.reGenText}>다시 시도</Text>
              </Pressable>
            </View>
            <Image source={{ uri: resultUrl }} style={styles.resultImage} resizeMode="cover" />
            <Text style={styles.resultDisclaimer}>* AI가 시뮬레이션한 이미지입니다. 실제 착용감과 다를 수 있어요.</Text>
          </View>

          <View style={styles.resultActions}>
            <Pressable style={styles.resultActionBtn} onPress={() => void saveToGallery()}>
              <Ionicons name="download-outline" size={18} color={colors.zinc700} />
              <Text style={styles.resultActionText}>저장</Text>
            </Pressable>
            <Pressable style={styles.resultActionBtn} onPress={() => void shareResult()}>
              <Ionicons name="share-social-outline" size={18} color={colors.zinc700} />
              <Text style={styles.resultActionText}>공유</Text>
            </Pressable>
          </View>

          {product ? (
            <Pressable style={[styles.buyResultBtn, shadow.sm]} onPress={() => void Linking.openURL(product.productLink)}>
              <Ionicons name="storefront-outline" size={16} color="#fff" />
              <Text style={styles.buyResultBtnText}>네이버쇼핑에서 구매하기</Text>
              <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.8)" />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: 48 },

  itemHeader: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  itemHeaderText: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: "700", color: colors.text, lineHeight: 20 },
  itemDesc: { fontSize: 12, color: colors.subText, marginTop: 3, lineHeight: 17 },

  catBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.full, alignSelf: "flex-start" },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  catText: { fontSize: 12, fontWeight: "700" },

  section: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: 14, borderWidth: 1, borderColor: colors.border },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  stepNum: { fontSize: 13, fontWeight: "800", color: "#fff" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  sectionDesc: { fontSize: 12, color: colors.subText, lineHeight: 17, marginTop: -6 },

  /* 아바타 */
  avatarLoadingWrap: { alignItems: "center", paddingVertical: 32, gap: 14 },
  avatarLoadingText: { fontSize: 13, color: colors.subText, textAlign: "center", lineHeight: 20 },
  avatarErrorWrap: { alignItems: "center", paddingVertical: 24, gap: 10 },
  avatarErrorText: { fontSize: 13, color: colors.error, textAlign: "center" },
  avatarRetryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.error, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 20 },
  avatarRetryText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  avatarWrap: { position: "relative" },
  avatarImage: { width: "100%", height: 320, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  avatarRegenBtn: {
    position: "absolute", bottom: 10, right: 10,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,0,0,0.65)", borderRadius: radius.full,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  avatarRegenText: { fontSize: 12, color: "#fff", fontWeight: "600" },

  /* 상품 */
  productRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  productImg: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  productInfo: { flex: 1, gap: 5 },
  productTitle: { fontSize: 13, fontWeight: "700", color: colors.text, lineHeight: 19 },
  productPrice: { fontSize: 13, fontWeight: "800", color: colors.text },
  productMall: { fontSize: 12, fontWeight: "400", color: colors.subText },
  productLinkBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 2 },
  productLinkText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
  noProductBox: { height: 80, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.md },
  noProductText: { fontSize: 13, color: colors.subText },
  reSearchBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 14, backgroundColor: colors.primaryLight },
  reSearchBtnText: { fontSize: 13, color: colors.primary, fontWeight: "700" },

  searchBox: { gap: 12 },
  searchInputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: { flex: 1, height: 44, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  searchRunBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  searchResultGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  searchResultItem: { width: "30%", borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden", position: "relative" },
  searchResultItemActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  searchResultImg: { width: "100%", height: 80, backgroundColor: colors.surfaceAlt },
  searchResultTitle: { fontSize: 11, color: colors.text, padding: 5, paddingBottom: 2, lineHeight: 15 },
  searchResultPrice: { fontSize: 11, fontWeight: "700", color: colors.primary, paddingHorizontal: 5, paddingBottom: 5 },
  selectedMark: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  searchLoadingWrap: { alignItems: "center", paddingVertical: 20 },

  /* 시작 버튼 */
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 16 },
  startBtnDisabled: { backgroundColor: colors.border },
  startBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },

  /* 생성 중 */
  generatingCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 28, alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.border },
  generatingTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  generatingSub: { fontSize: 12, color: colors.subText },
  generatingSteps: { flexDirection: "row", gap: 16, marginTop: 4, flexWrap: "wrap", justifyContent: "center" },
  generatingStep: { flexDirection: "row", alignItems: "center", gap: 5 },
  generatingStepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  generatingStepText: { fontSize: 12, color: colors.subText },

  /* 오류 */
  errorCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24, alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.errorLight },
  errorTitle: { fontSize: 15, fontWeight: "700", color: colors.error },
  errorMsg: { fontSize: 13, color: colors.subText, textAlign: "center", lineHeight: 19 },
  errorRetryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.error, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 20, marginTop: 4 },
  errorRetryText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  /* 결과 */
  resultWrap: { gap: spacing.md },
  resultCard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md, paddingBottom: 10 },
  resultIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  resultTitle: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.text },
  reGenBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 9 },
  reGenText: { fontSize: 11, color: colors.subText, fontWeight: "600" },
  resultImage: { width: "100%", height: 480, backgroundColor: colors.surfaceAlt },
  resultDisclaimer: { fontSize: 11, color: colors.subText, textAlign: "center", padding: 10, paddingTop: 8 },
  cancelBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { fontSize: 13, fontWeight: "600", color: colors.subText },
  resultActions: { flexDirection: "row", justifyContent: "center", gap: 24, paddingVertical: 8 },
  resultActionBtn: { alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 16 },
  resultActionText: { fontSize: 12, fontWeight: "600", color: colors.text },
  buyResultBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 15 },
  buyResultBtnText: { fontSize: 15, fontWeight: "800", color: "#fff", flex: 1, textAlign: "center" },

  gateRoot: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: spacing.lg },
  gateInner: { alignItems: "center", gap: 12, padding: spacing.lg },
  gateTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  gatePill: { backgroundColor: colors.zinc200, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.full },
  gatePillText: { fontSize: 12, fontWeight: "800", color: colors.zinc600 },
  gateBody: { fontSize: 15, color: colors.subText, textAlign: "center", lineHeight: 22 },
  gateBtn: { marginTop: 8, backgroundColor: colors.zinc900, paddingVertical: 14, paddingHorizontal: 28, borderRadius: radius.lg },
  gateBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
