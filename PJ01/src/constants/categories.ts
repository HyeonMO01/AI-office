export const WARDROBE_CATEGORIES = [
  "상의", "하의", "아우터", "원피스", "신발", "가방", "악세서리", "기타",
] as const;

export const FILTER_CATEGORIES = ["전체", ...WARDROBE_CATEGORIES] as const;

export type WardrobeCategory = (typeof WARDROBE_CATEGORIES)[number];

export function getCategoryColor(cat: string): string {
  const map: Record<string, string> = {
    상의: "#3B82F6",
    하의: "#8B5CF6",
    아우터: "#F59E0B",
    원피스: "#EC4899",
    신발: "#10B981",
    가방: "#6366F1",
    악세서리: "#F97316",
    기타: "#71717A",
  };
  return map[cat] ?? "#A1A1AA";
}
