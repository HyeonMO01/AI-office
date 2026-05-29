export type BodyType = "슬림" | "보통" | "통통";
export type Gender = "남성" | "여성" | "선택 안 함";

export interface UserProfile {
  email: string;
  nickname: string;
  height?: number;
  weight?: number;
  bodyType?: BodyType;
  gender?: Gender;
  preferredStyle?: string;
  onboardingComplete: boolean;
  avatarUrl?: string;
  createdAt?: unknown;
}

export interface WardrobeItem {
  id: string;
  imageUrl: string;
  category: string;
  uploadedAt?: unknown;
  aiSummary: string;
}

export type RecommendationFeedback = "like" | "dislike";
export type RecommendationPayload = string;

export interface RecommendationHistory {
  id: string;
  wardrobeItemId: string;
  imageUrl: string;
  recommendation: RecommendationPayload;
  desiredStyle?: string;
  occasion?: string;
  weather?: string;
  budget?: string;
  feedback?: RecommendationFeedback;
  createdAt?: unknown;
}

export interface RecommendedProductItem {
  category: string;
  title: string;
  description: string;
  searchKeyword: string;
  colorInfo?: string;
  materialInfo?: string;
  matchReason?: string;
  priceRange?: string;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  harmony: string;
}

export interface VisionRecommendationResult {
  summary: string;
  styleTip: string;
  overallMood: string;
  colorPalette: ColorPalette;
  coordinationReason: string;
  items: RecommendedProductItem[];
  /** 사용자 사진 속 ‘내 옷’만 묘사(영어) — DALL·E 등 시각화 앵커 */
  visualAnchorEn?: string;
  /** 같은 내용 한국어(앱 표시·검수용) */
  visualAnchorKo?: string;
}

export interface GarmentBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedGarmentItem {
  category: string;
  position: string;
  color: string;
  style: string;
  boundingBox: GarmentBoundingBox;
}

export interface GarmentDetectionResult {
  items: DetectedGarmentItem[];
}

export interface ShoppingProduct {
  title: string;
  image: string;
  lprice: string;
  mallName: string;
  productLink: string;
}

export interface TryOnItemParam {
  category: string;
  title: string;
  description: string;
  searchKeyword: string;
}
