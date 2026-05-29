import { proxyPost } from "./apiProxy";
import { getRecommendationHistory } from "./recommendationService";
import { getUserProfile } from "./userProfileService";
import { WardrobeItem } from "../types";

export interface DailyOutfitSuggestion {
  title: string;
  description: string;
  items: Array<{ category: string; wardrobeItemId?: string; suggestion: string; color?: string }>;
  mood: string;
  reason: string;
}

export async function generateDailySuggestions(params: {
  uid: string;
  wardrobeItems: WardrobeItem[];
  weatherDesc?: string;
  temperature?: number;
}): Promise<DailyOutfitSuggestion[]> {
  const { uid, wardrobeItems, weatherDesc, temperature } = params;

  const profile = await getUserProfile(uid);
  const style = profile?.preferredStyle || "캐주얼";
  const bodyInfo = profile
    ? `키 ${profile.height ?? "-"}cm, 몸무게 ${profile.weight ?? "-"}kg, 체형 ${profile.bodyType ?? "보통"}`
    : "정보 없음";

  const history = await getRecommendationHistory(uid);
  const withFb = history.filter((h) => h.feedback).slice(0, 12);
  const dislikeLines = withFb
    .filter((h) => h.feedback === "dislike")
    .map((h) => `- 피해야 할 방향(별로): ${h.occasion || "일상"}${h.desiredStyle ? ` · 스타일 ${h.desiredStyle}` : ""}`);
  const likeLines = withFb
    .filter((h) => h.feedback === "like")
    .map((h) => `- 선호(좋아함): ${h.occasion || "일상"}${h.desiredStyle ? ` · ${h.desiredStyle}` : ""}`);
  const feedbackBlock = [dislikeLines.join("\n"), likeLines.join("\n")].filter(Boolean).join("\n");

  const wardrobeDesc = wardrobeItems
    .slice(0, 30)
    .map((i, idx) => {
      const tag = (i.aiSummary || "").trim();
      return `[id:${i.id}] [${idx + 1}] ${i.category}${tag ? ` — ${tag}` : ""}`;
    })
    .join("\n");

  const month = new Date().getMonth() + 1;
  const season = month <= 2 || month === 12 ? "겨울" : month <= 5 ? "봄" : month <= 8 ? "여름" : "가을";
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dayOfWeek = dayNames[new Date().getDay()];

  const weatherInfo = temperature !== undefined
    ? `현재 날씨: ${weatherDesc || "맑음"}, 기온 ${temperature}°C`
    : `현재 계절: ${season}`;

  const data = await proxyPost<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/api/openai/chat-completions", {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `당신은 사용자의 옷장을 잘 아는 전문 패션 스타일리스트입니다.
사용자가 실제 보유한 옷 목록을 기반으로, 오늘 입기 좋은 코디를 추천합니다.
보유하지 않은 옷은 절대 추천하지 마세요. 실제 옷장 아이템만 활용하세요.

각 코디의 items에는 가능하면 보유 목록의 id를 wardrobeItemId에 정확히 넣으세요. 없으면 생략.
"별로" 피드백이 있으면 비슷한 톤·실루엣을 반복하지 마세요.`,
      },
      {
        role: "user",
        content: `오늘(${dayOfWeek}요일)의 코디 3벌을 추천해주세요.

[사용자 정보]
${bodyInfo}, 선호 스타일: ${style}

[오늘의 날씨]
${weatherInfo}

[보유 옷장 — 각 줄의 id는 Firestore 아이템 id]
${wardrobeDesc}

${feedbackBlock ? `[최근 코디 피드백 — 별로 우선 반영]\n${feedbackBlock}` : ""}

위 옷장의 아이템만 활용해서 3가지 다른 분위기의 코디를 추천해주세요.
각 코디마다 왜 이 조합이 좋은지 이유를 설명해주세요.
suggestion에는 해당 줄의 태그(aiSummary)를 참고해 어떤 실물 아이템인지 구체적으로 쓰세요.

반드시 아래 JSON 객체만 반환. 마크다운 코드블록 금지:
{
  "outfits": [
    {
      "title": "코디 제목 (감성적으로, 12자 이내)",
      "description": "오늘 이 코디를 추천하는 이유 (25자 이내)",
      "items": [
        {
          "category": "상의",
          "wardrobeItemId": "옵션 — 보유 목록 id",
          "suggestion": "옷장의 어떤 아이템인지 구체적으로",
          "color": "색상"
        }
      ],
      "mood": "분위기 키워드",
      "reason": "이 조합이 어울리는 이유 2-3문장"
    }
  ]
}`,
      },
    ],
  });

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return [];

  try {
    let text = content;
    if (text.startsWith("```")) text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(text) as unknown;
    let rows: DailyOutfitSuggestion[];
    if (Array.isArray(parsed)) {
      rows = parsed as DailyOutfitSuggestion[];
    } else if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { outfits?: unknown }).outfits)
    ) {
      rows = (parsed as { outfits: DailyOutfitSuggestion[] }).outfits;
    } else {
      return [];
    }
    return rows.slice(0, 3).map((s) => ({
      ...s,
      reason: s.reason || "",
    }));
  } catch {
    return [];
  }
}
