import React, { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { MainTabParamList } from "../navigation/MainTabNavigator";
import { colors, radius, spacing } from "../theme";
import { useAuth } from "../hooks/useAuth";
import { uploadWardrobeImage } from "../services/storageService";
import { addWardrobeItem } from "../services/wardrobeService";
import { analyzeGarmentRegions, polishWardrobeSummaryLine } from "../services/openai";
import { cropGarmentRegion } from "../utils/cropGarment";
import { LoadingOverlay } from "../components/LoadingOverlay";
import { normalizeImageToPng } from "../utils/normalizeImageToPng";
import { DetectedGarmentItem } from "../types";
import { WARDROBE_CATEGORIES, getCategoryColor } from "../constants/categories";

type Props = BottomTabScreenProps<MainTabParamList, "Upload">;

type Step = "pick" | "analyze" | "select" | "preview";

export function UploadScreen({ navigation }: Props): React.JSX.Element {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("pick");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [detectedItems, setDetectedItems] = useState<DetectedGarmentItem[]>([]);
  const [croppedUri, setCroppedUri] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  /** 크롭 전 선택한 감지 항목 — 색·스타일로 aiSummary 보강 */
  const [garmentMeta, setGarmentMeta] = useState<DetectedGarmentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("처리 중...");

  const pickImage = async (type: "camera" | "library") => {
    const permission =
      type === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("권한 필요", "이미지 접근 권한을 허용해주세요.");
      return;
    }
    const result =
      type === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      setImageSize({ width: asset.width, height: asset.height });
      setDetectedItems([]);
      setCroppedUri(null);
      setCategory(null);
      setGarmentMeta(null);
      void analyzeImage(asset.uri);
    }
  };

  const analyzeImage = async (uri: string) => {
    setStep("analyze");
    setLoading(true);
    setLoadingMessage("AI가 옷을 분석하는 중...");
    try {
      const result = await analyzeGarmentRegions(uri);
      setDetectedItems(result.items);
      if (result.items.length === 1) {
        setCategory(result.items[0].category);
      }
      setStep("select");
    } catch {
      Alert.alert("분석 실패", "AI 분석에 실패했습니다. 카테고리를 직접 선택해주세요.");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGarment = async (idx: number) => {
    if (!imageUri || !imageSize) return;
    const item = detectedItems[idx];
    setGarmentMeta(item);
    setCategory(item.category);
    setLoading(true);
    setLoadingMessage("옷 영역을 크롭하는 중...");
    try {
      const cropped = await cropGarmentRegion(imageUri, item.boundingBox, imageSize);
      setCroppedUri(cropped);
      setStep("preview");
    } catch {
      Alert.alert("크롭 실패", "전체 사진으로 등록됩니다.");
      setStep("preview");
    } finally {
      setLoading(false);
    }
  };

  const handleSkipCrop = () => {
    setGarmentMeta(null);
    setCroppedUri(null);
    setStep("preview");
  };

  const onRegister = async () => {
    if (!user) { Alert.alert("오류", "로그인이 필요합니다."); return; }
    const finalUri = croppedUri ?? imageUri;
    if (!finalUri || !category) return;

    setLoading(true);
    setLoadingMessage("이미지를 최적화하는 중...");
    try {
      const pngUri = await normalizeImageToPng(finalUri);
      setLoadingMessage("옷장에 저장하는 중...");
      const imageUrl = await uploadWardrobeImage(user.uid, pngUri);
      const hintParts = garmentMeta
        ? [garmentMeta.color, garmentMeta.style, garmentMeta.position].filter(Boolean)
        : [];
      let aiSummary = hintParts.length
        ? `${category} — ${hintParts.join(" · ")}`
        : `${category} (옷장 등록)`;
      aiSummary = aiSummary.slice(0, 120);
      try {
        const polished = await polishWardrobeSummaryLine({
          category,
          color: garmentMeta?.color,
          style: garmentMeta?.style,
          position: garmentMeta?.position,
        });
        if (polished.replace(/\s/g, "").length >= 4) {
          aiSummary = polished;
        }
      } catch {
        /* 휴리스틱 유지 */
      }
      await addWardrobeItem({ uid: user.uid, imageUrl, category, aiSummary });
      resetState();
      Alert.alert("등록 완료", "옷이 옷장에 추가되었어요!");
      navigation.navigate("Home");
    } catch (e) {
      Alert.alert("업로드 실패", e instanceof Error ? e.message : "업로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setImageUri(null);
    setImageSize(null);
    setDetectedItems([]);
    setCroppedUri(null);
    setCategory(null);
    setGarmentMeta(null);
    setStep("pick");
  };

  const canRegister = (croppedUri || imageUri) && category;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>옷 등록</Text>
      <Text style={styles.sub}>사진을 찍거나 갤러리에서 불러오세요</Text>

      {/* Upload / Preview area */}
      <View style={styles.uploadArea}>
        {!imageUri ? (
          <View style={styles.uploadPrompt}>
            <View style={styles.uploadIcon}>
              <Ionicons name="cloud-upload-outline" size={28} color={colors.zinc400} />
            </View>
            <Text style={styles.uploadText}>사진을 등록해주세요</Text>
            <View style={styles.btnRow}>
              <Pressable
                style={({ pressed }) => [styles.cameraBtn, pressed && { transform: [{ scale: 0.95 }] }]}
                onPress={() => void pickImage("camera")}
              >
                <Ionicons name="camera-outline" size={16} color="#fff" />
                <Text style={styles.cameraBtnText}>카메라</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.galleryBtn, pressed && { transform: [{ scale: 0.95 }] }]}
                onPress={() => void pickImage("library")}
              >
                <Ionicons name="images-outline" size={16} color={colors.zinc700} />
                <Text style={styles.galleryBtnText}>갤러리</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.previewWrap}>
            <Image
              source={{ uri: croppedUri ?? imageUri }}
              style={styles.previewImage}
              resizeMode={croppedUri ? "contain" : "cover"}
            />
            <Pressable style={styles.closeBtn} onPress={resetState}>
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
            {croppedUri && (
              <View style={styles.croppedBadge}>
                <Ionicons name="crop" size={11} color="#fff" />
                <Text style={styles.croppedBadgeText}>AI 크롭</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* AI detected garments */}
      {step === "select" && detectedItems.length > 0 && (
        <View style={styles.detectSection}>
          <Text style={styles.detectLabel}>AI가 감지한 옷 — 등록할 항목 선택</Text>
          {detectedItems.map((item, idx) => (
            <Pressable
              key={idx}
              style={({ pressed }) => [styles.detectCard, pressed && { opacity: 0.8 }]}
              onPress={() => void handleSelectGarment(idx)}
            >
              <View style={[styles.detectDot, { backgroundColor: getCategoryColor(item.category) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.detectCat}>{item.category}</Text>
                <Text style={styles.detectDetail} numberOfLines={1}>
                  {[item.color, item.style].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.zinc400} />
            </Pressable>
          ))}
          <Pressable onPress={handleSkipCrop}>
            <Text style={styles.skipText}>크롭 없이 전체 사진 등록 →</Text>
          </Pressable>
        </View>
      )}

      {/* Category */}
      {(step === "preview" || (step === "select" && detectedItems.length === 0)) && (
        <View style={styles.catSection}>
          <Text style={styles.catLabel}>카테고리</Text>
          <View style={styles.catRow}>
            {WARDROBE_CATEGORIES.map((cat) => (
              <Pressable
                key={cat}
                style={[styles.catChip, category === cat && styles.catChipActive]}
                onPress={() => setCategory(cat)}
              >
                <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>{cat}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Register button */}
      {(step === "preview" || (step === "select" && detectedItems.length === 0)) && (
        <>
          <Pressable
            style={({ pressed }) => [
              styles.registerBtn,
              !canRegister && styles.registerBtnDisabled,
              pressed && canRegister && { transform: [{ scale: 0.98 }] },
            ]}
            onPress={() => void onRegister()}
            disabled={!canRegister || loading}
          >
            <Text style={styles.registerBtnText}>등록하기</Text>
          </Pressable>

          {step === "preview" && croppedUri && (
            <Pressable style={styles.backLink} onPress={() => setStep("select")}>
              <Text style={styles.backLinkText}>← 다시 선택</Text>
            </Pressable>
          )}
        </>
      )}

      <Text style={styles.footer}>등록한 사진은 AI 코디 추천에 활용됩니다</Text>
      <LoadingOverlay visible={loading} message={loadingMessage} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 48 },

  title: { fontSize: 22, fontWeight: "700", color: colors.zinc900, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.zinc400, marginTop: 4, marginBottom: spacing.lg },

  uploadArea: {
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.zinc200,
    backgroundColor: colors.zinc50,
    aspectRatio: 1,
    marginBottom: spacing.lg,
  },
  uploadPrompt: {
    flex: 1,
    alignItems: "center", justifyContent: "center", gap: 12,
  },
  uploadIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.zinc100,
    alignItems: "center", justifyContent: "center",
  },
  uploadText: { fontSize: 13, color: colors.zinc400 },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  cameraBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.zinc900, borderRadius: radius.full,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  cameraBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  galleryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.zinc100, borderRadius: radius.full,
    paddingVertical: 10, paddingHorizontal: 20,
  },
  galleryBtnText: { fontSize: 13, fontWeight: "600", color: colors.zinc700 },

  previewWrap: { flex: 1, position: "relative" },
  previewImage: { width: "100%", height: "100%" },
  closeBtn: {
    position: "absolute", top: 12, right: 12,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center",
  },
  croppedBadge: {
    position: "absolute", top: 12, left: 12,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: radius.full,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  croppedBadgeText: { fontSize: 11, fontWeight: "600", color: "#fff" },

  detectSection: { marginBottom: spacing.lg, gap: 8 },
  detectLabel: { fontSize: 14, fontWeight: "600", color: colors.zinc700, marginBottom: 4 },
  detectCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.zinc50, borderRadius: radius.md,
    padding: 14,
  },
  detectDot: { width: 10, height: 10, borderRadius: 5 },
  detectCat: { fontSize: 14, fontWeight: "600", color: colors.zinc900 },
  detectDetail: { fontSize: 12, color: colors.zinc400, marginTop: 2 },
  skipText: { fontSize: 13, color: colors.zinc500, textAlign: "center", paddingVertical: 8 },

  catSection: { marginBottom: spacing.lg },
  catLabel: { fontSize: 14, fontWeight: "600", color: colors.zinc700, marginBottom: 12 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: radius.full, backgroundColor: colors.zinc100,
  },
  catChipActive: { backgroundColor: colors.zinc900 },
  catChipText: { fontSize: 13, fontWeight: "500", color: colors.zinc500 },
  catChipTextActive: { color: "#fff" },

  registerBtn: {
    paddingVertical: 16, borderRadius: radius.lg,
    backgroundColor: colors.zinc900, alignItems: "center",
  },
  registerBtnDisabled: { backgroundColor: colors.zinc200 },
  registerBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  backLink: { alignSelf: "center", paddingVertical: 12 },
  backLinkText: { fontSize: 13, fontWeight: "600", color: colors.zinc500 },

  footer: {
    fontSize: 11, color: colors.zinc200, textAlign: "center", marginTop: spacing.md,
  },
});
