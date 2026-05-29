import { proxyGet, proxyPost } from "./apiProxy";

export type FalTryOnCategory = "upper" | "lower" | "dress";
export type FalTryOnStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface FalTryOnJob {
  request_id: string;
  status: FalTryOnStatus;
}

export interface FalTryOnResult {
  status: FalTryOnStatus;
  output_url?: string;
  error?: string;
}

export function mapCategoryToFal(category: string): FalTryOnCategory {
  const lower = category.trim();
  if (lower.includes("하의") || lower.includes("바지") || lower.includes("스커트") || lower.includes("청바지")) {
    return "lower";
  }
  if (lower.includes("원피스") || lower.includes("드레스")) {
    return "dress";
  }
  return "upper";
}

export async function startKolorsTryOn(params: {
  humanImageUrl: string;
  garmentImageUrl: string;
  category: FalTryOnCategory;
}): Promise<FalTryOnJob> {
  return proxyPost<FalTryOnJob>(
    "/api/fal/tryon/start",
    {
      human_image_url: params.humanImageUrl,
      garment_image_url: params.garmentImageUrl,
      category: params.category,
    },
    15000,
  );
}

export async function pollKolorsTryOn(requestId: string): Promise<FalTryOnResult> {
  return proxyGet<FalTryOnResult>(
    `/api/fal/tryon/status?id=${encodeURIComponent(requestId)}`,
    { timeoutMs: 10000 },
  );
}
