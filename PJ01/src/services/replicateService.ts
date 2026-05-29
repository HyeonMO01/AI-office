import { proxyGet, proxyPost } from "./apiProxy";

export type TryOnCategory = "upper_body" | "lower_body" | "dresses";

export interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
  urls?: { get?: string };
}

/** Korean category → IDM-VTON category 매핑 */
export function mapCategoryToTryOn(category: string): TryOnCategory {
  const lower = category.trim();
  if (lower.includes("하의") || lower.includes("바지") || lower.includes("스커트") || lower.includes("청바지")) {
    return "lower_body";
  }
  if (lower.includes("원피스") || lower.includes("드레스")) {
    return "dresses";
  }
  return "upper_body";
}

/** 가상 착용 예측 시작 - 즉시 prediction ID 반환 (폴링 방식) */
export async function startTryOnPrediction(params: {
  garmentImageUrl: string;
  humanImageUrl: string;
  category: TryOnCategory;
  description?: string;
}): Promise<ReplicatePrediction> {
  const data = await proxyPost<ReplicatePrediction>(
    "/api/replicate/tryon/start",
    {
      garment_image: params.garmentImageUrl,
      human_image: params.humanImageUrl,
      category: params.category,
      garment_description: params.description ?? "",
    },
    10000,
  );
  if (!data.id) {
    const errMsg = (data as { error?: string }).error ?? "Replicate 예측 ID를 받지 못했습니다.";
    throw new Error(errMsg);
  }
  return data;
}

/** 예측 상태 폴링 */
export async function pollTryOnPrediction(predictionId: string): Promise<ReplicatePrediction> {
  return proxyGet<ReplicatePrediction>(
    `/api/replicate/tryon/status?id=${encodeURIComponent(predictionId)}`,
  );
}

/** 결과 URL 추출 헬퍼 */
export function extractOutputUrl(prediction: ReplicatePrediction): string | null {
  const out = prediction.output;
  if (typeof out === "string") return out;
  if (Array.isArray(out) && out.length > 0) return out[0] ?? null;
  return null;
}
