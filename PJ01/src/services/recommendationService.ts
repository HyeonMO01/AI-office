import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { RecommendationFeedback, RecommendationHistory, VisionRecommendationResult } from "../types";

function isValidRecommendationResult(value: unknown): value is VisionRecommendationResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.summary !== "string" || typeof row.styleTip !== "string" || !Array.isArray(row.items)) {
    return false;
  }
  return row.items.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const i = item as Record<string, unknown>;
    return (
      typeof i.category === "string" &&
      typeof i.title === "string" &&
      typeof i.description === "string" &&
      typeof i.searchKeyword === "string"
    );
  });
}

export function ensureFullResult(parsed: VisionRecommendationResult): VisionRecommendationResult {
  return {
    ...parsed,
    overallMood: parsed.overallMood || "",
    colorPalette: parsed.colorPalette || { primary: "", secondary: "", accent: "", harmony: "" },
    coordinationReason: parsed.coordinationReason || "",
    visualAnchorEn: parsed.visualAnchorEn || "",
    visualAnchorKo: parsed.visualAnchorKo || "",
    items: parsed.items.map((item) => ({
      ...item,
      colorInfo: item.colorInfo || "",
      materialInfo: item.materialInfo || "",
      matchReason: item.matchReason || "",
      priceRange: item.priceRange || "",
    })),
  };
}

export function parseRecommendationPayload(payload: string): VisionRecommendationResult | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (isValidRecommendationResult(parsed)) return parsed;
    if (
      parsed &&
      typeof parsed === "object" &&
      "payload" in parsed &&
      isValidRecommendationResult((parsed as { payload?: unknown }).payload)
    ) {
      return (parsed as { payload: VisionRecommendationResult }).payload;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveRecommendationHistory(params: {
  uid: string;
  wardrobeItemId: string;
  imageUrl: string;
  recommendation: string;
  desiredStyle?: string;
  occasion?: string;
  weather?: string;
  budget?: string;
}): Promise<string> {
  const colRef = collection(db, "users", params.uid, "recommendationHistory");
  const docRef = await addDoc(colRef, {
    wardrobeItemId: params.wardrobeItemId,
    imageUrl: params.imageUrl,
    recommendation: params.recommendation,
    desiredStyle: params.desiredStyle ?? "",
    occasion: params.occasion ?? "",
    weather: params.weather ?? "",
    budget: params.budget ?? "",
    feedback: "",
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateRecommendationFeedback(params: {
  uid: string;
  historyId: string;
  feedback: RecommendationFeedback;
}): Promise<void> {
  const historyRef = doc(db, "users", params.uid, "recommendationHistory", params.historyId);
  await updateDoc(historyRef, { feedback: params.feedback });
}

export async function deleteRecommendationHistory(uid: string, historyId: string): Promise<void> {
  const docRef = doc(db, "users", uid, "recommendationHistory", historyId);
  await deleteDoc(docRef);
}

export async function getRecommendationHistory(uid: string): Promise<RecommendationHistory[]> {
  const colRef = collection(db, "users", uid, "recommendationHistory");
  const q = query(colRef, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<RecommendationHistory, "id">),
  }));
}
