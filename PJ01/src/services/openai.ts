import { GarmentBoundingBox, GarmentDetectionResult, VisionRecommendationResult } from "../types";
import { proxyPost } from "./apiProxy";
import { fetchWithRetry } from "./httpClient";

const SYSTEM_PROMPT = `당신은 15년 경력의 한국 최고 패션 스타일리스트입니다.
사용자가 업로드한 옷 사진을 정밀 분석(색상, 패턴, 소재, 핏, 시즌감)하고,
사용자 체형·상황·예산·취향을 모두 반영해 **왜 이 조합이 어울리는지** 근거와 함께 코디를 추천합니다.

## 분석 원칙
1. 업로드된 옷의 색상 톤(웜/쿨/뉴트럴), 채도, 명도를 먼저 파악
2. 컬러 하모니 이론(보색, 유사색, 톤온톤, 톤인톤) 적용
3. 체형 장점은 부각, 단점은 시각적 보완
4. 상황(TPO)에 맞는 격식 수준 조절
5. 예산 범위 내 현실적 아이템 (예산이 있으면 반드시 준수)
6. 검색 키워드는 "브랜드+소재+색상+아이템명+핏" 형태로 구체적 작성 (네이버 쇼핑 검색 최적화)

## 피드백 반영
최근 추천에 대한 사용자 피드백이 주어지면 **반드시 최우선으로 반영**합니다.
"별로"·비슷한 부정 표현이 있으면 같은 색조·실루엣·무드·카테고리 조합을 반복하지 말고, 무엇을 어떻게 바꿀지 구체적으로 제안하세요.
좋아요가 있으면 그 방향의 톤과 완성도를 유지하세요.

## 응답 형식
반드시 아래 JSON 형식 하나만 반환. 마크다운 코드블록 금지:
{
  "summary": "이 코디의 전체 컨셉 한 줄 요약 (감성적이고 매력적으로)",
  "styleTip": "실용적인 스타일링 팁 2-3가지 (액세서리 활용법, 레이어링, 컬러매칭 등)",
  "overallMood": "코디 전체 분위기 키워드 (예: 시크 캐주얼, 로맨틱 페미닌, 미니멀 모던 등)",
  "colorPalette": {
    "primary": "메인 컬러 (예: 네이비)",
    "secondary": "서브 컬러 (예: 베이지)",
    "accent": "포인트 컬러 (예: 버건디)",
    "harmony": "컬러 조합 설명 (예: 톤온톤으로 차분하면서 버건디 포인트로 세련미 추가)"
  },
  "coordinationReason": "이 아이템들이 함께 어울리는 이유를 3-4문장으로 상세 설명 (색상 조화, 실루엣 밸런스, 소재 매치 관점)",
  "visualAnchorKo": "사진에 보이는 사용자의 그 의류 한 벌만 1~2문장 (정확한 색명·패턴·넥/기장·핏·질감·로고 유무). items와 중복 금지.",
  "visualAnchorEn": "Same single garment only, 40–90 words English for image generation: exact colors (e.g. heather charcoal melange), pattern, neckline, silhouette, hem length, fabric hand-feel, logos. Not the whole outfit.",
  "items": [
    {
      "category": "상의",
      "title": "구체적 아이템명 (예: 오버사이즈 크루넥 니트)",
      "description": "왜 이 아이템이 업로드된 옷과 어울리는지 + 착용 팁",
      "searchKeyword": "네이버쇼핑 검색 최적화 키워드 (예: 남성 오버핏 크루넥 니트 아이보리)",
      "colorInfo": "추천 색상과 이유 (예: 아이보리 - 하의의 네이비와 톤온톤 조화)",
      "materialInfo": "추천 소재 (예: 캐시미어 혼방 울 - 고급스러운 질감)",
      "matchReason": "이 옷과의 매칭 포인트 한 줄",
      "priceRange": "예상 가격대 (예: 3~5만원)"
    }
  ]
}

카테고리는 상의, 하의, 아우터, 신발, 가방, 악세서리 중 상황에 맞게 4-6개를 추천하세요.
이미 업로드된 옷의 카테고리는 제외하고 나머지를 추천하세요.
items의 title·searchKeyword는 **사용자가 아직 갖고 있지 않은 조각**만 다루고, 업로드된 그 한 벌의 묘사는 visualAnchor*에만 담으세요.

## 코디 아이템과 업로드 옷의 연결
먼저 visualAnchorKo·En을 사진에 맞게 채운 뒤, items의 description·colorInfo·matchReason·searchKeyword에는 **그 앵커와 색·톤·무드가 맞는** 조각만 적으세요. 엇갈리는 색 조합은 피하세요.`;

function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function dataUrlWithOpenAiSupportedMime(dataUrl: string): string {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) {
    return dataUrl;
  }
  const headerMime = m[1].toLowerCase();
  if (/^(image\/(png|jpeg|gif|webp))$/i.test(headerMime)) {
    return dataUrl;
  }
  const b64 = m[2];
  let prefixLen = Math.min(b64.length, 64);
  prefixLen -= prefixLen % 4;
  let binary = "";
  try {
    binary = globalThis.atob(b64.slice(0, prefixLen));
  } catch {
    return dataUrl;
  }
  const prefix = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    prefix[i] = binary.charCodeAt(i);
  }
  const detected = detectImageMime(prefix);
  if (!detected) {
    throw new Error(
      "지원되지 않는 이미지 형식입니다. PNG, JPEG, GIF, WEBP 사진을 사용해주세요.",
    );
  }
  return `data:${detected};base64,${b64}`;
}

/** OpenAI는 외부 URL에서 이미지를 못 받는 경우가 있어, 앱에서 불러 data URL로 보냅니다. */
async function imageUriToDataUrl(uri: string): Promise<string> {
  if (uri.startsWith("data:")) {
    return dataUrlWithOpenAiSupportedMime(uri);
  }
  const imageRes = await fetchWithRetry(uri, { method: "GET" }, { timeoutMs: 12000, retryCount: 1 });
  if (!imageRes.ok) {
    throw new Error("이미지를 불러오지 못했습니다. 네트워크와 사진 URL을 확인해주세요.");
  }
  // RN/Expo에서 response.arrayBuffer()가 없거나 깨지는 환경이 있어 blob + FileReader만 사용합니다.
  const blob = await imageRes.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("이미지를 인코딩하지 못했습니다."));
      }
    };
    reader.onerror = () => reject(new Error("이미지를 인코딩하지 못했습니다."));
    reader.readAsDataURL(blob);
  });
  return dataUrlWithOpenAiSupportedMime(dataUrl);
}

const GARMENT_DETECTION_USER_PROMPT = `이 사진에서 착용한 의류의 각 부위를 분석해줘.
상의, 하의, 신발, 아우터, 액세서리가 있으면
각각의 대략적인 위치(상단/중단/하단)와
색상, 스타일을 JSON 형식으로 반환해줘.

색상은 한국어로 구체적으로(예: 쿨톤 네이비, 웜 베이지, 차콜 그레이).
스타일에는 핏·소재 느낌·디테일(스트라이프/로고/니트 짜임 등)을 짧게 넣어줘.

형식: 
{
  items: [
    {
      category: '상의',
      position: 'top',
      color: '흰색',
      style: '오버핏 티셔츠',
      boundingBox: { 
        x: 0.1, y: 0.1, 
        width: 0.8, height: 0.3 
      }
    }
  ]
}`;

const CATEGORY_RECOMMEND_SYSTEM_PROMPT = `당신은 15년 경력의 한국 최고 패션 스타일리스트입니다.
사용자가 전신 사진에서 터치로 선택한 한 가지 의류를 기준으로, 색상·소재·핏을 정밀 분석 후 어울리는 전체 코디를 제안합니다.

## 응답 형식
반드시 아래 JSON 형식 하나만 반환. 마크다운 코드블록 금지:
{
  "summary": "코디 컨셉 한 줄 요약",
  "styleTip": "실용적 스타일링 팁 2-3가지",
  "overallMood": "코디 분위기 키워드",
  "colorPalette": {
    "primary": "메인 컬러",
    "secondary": "서브 컬러",
    "accent": "포인트 컬러",
    "harmony": "컬러 조합 설명"
  },
  "coordinationReason": "아이템 조합이 어울리는 이유 상세 설명",
  "visualAnchorKo": "터치로 선택한 그 의류만 1~2문장 (색·패턴·핏·소재·로고)",
  "visualAnchorEn": "That garment only, 40–90 words English for image gen (exact colors, pattern, neckline, silhouette)",
  "items": [
    {
      "category": "카테고리",
      "title": "구체적 아이템명",
      "description": "추천 이유와 착용 팁",
      "searchKeyword": "네이버쇼핑 검색 최적화 키워드",
      "colorInfo": "추천 색상과 이유",
      "materialInfo": "추천 소재",
      "matchReason": "매칭 포인트 한 줄",
      "priceRange": "예상 가격대"
    }
  ]
}

선택된 아이템의 카테고리는 제외하고 나머지 4-5개 카테고리를 추천하세요.

선택 영역의 색·핏·소재를 사진에서 다시 확인하고, 스타일 키워드는 구체적으로(예: 슬림 데님, 헤비 울 코트).`;

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }
  return null;
}

function parseModelJson<T>(raw: string): T {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const extracted = extractJsonObject(text);
    if (!extracted) {
      throw new Error("JSON을 찾을 수 없습니다.");
    }
    return JSON.parse(extracted) as T;
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeBoundingBox(box: GarmentBoundingBox | undefined): GarmentBoundingBox {
  if (!box || typeof box !== "object") {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  return {
    x: clamp01(Number(box.x)),
    y: clamp01(Number(box.y)),
    width: clamp01(Number(box.width) || 0.3),
    height: clamp01(Number(box.height) || 0.3),
  };
}

function normalizeCategory(category: string): string {
  return category.trim().replace(/\s+/g, "");
}

const MIN_RECOMMENDATION_ITEMS = 2;

function validateRecommendationResult(parsed: VisionRecommendationResult): VisionRecommendationResult {
  if (!parsed.summary || !parsed.styleTip || !Array.isArray(parsed.items)) {
    throw new Error("추천 응답 형식이 올바르지 않습니다.");
  }

  const seenCategory = new Set<string>();
  const normalizedItems: VisionRecommendationResult["items"] = [];
  for (const item of parsed.items) {
    const category = normalizeCategory(item.category || "");
    const title = item.title?.trim();
    const description = item.description?.trim();
    const searchKeyword = item.searchKeyword?.trim();
    if (!category || !title || !description || !searchKeyword) {
      continue;
    }
    if (seenCategory.has(category)) {
      continue;
    }
    seenCategory.add(category);
    normalizedItems.push({
      ...item,
      category,
      title,
      description,
      searchKeyword,
      colorInfo: item.colorInfo?.trim() || "",
      materialInfo: item.materialInfo?.trim() || "",
      matchReason: item.matchReason?.trim() || "",
      priceRange: item.priceRange?.trim() || "",
    });
  }

  if (normalizedItems.length < MIN_RECOMMENDATION_ITEMS) {
    throw new Error(
      `추천 아이템이 충분하지 않습니다(유효 ${normalizedItems.length}개). 다시 시도해주세요.`,
    );
  }

  const defaultPalette = { primary: "", secondary: "", accent: "", harmony: "" };
  const palette = parsed.colorPalette && typeof parsed.colorPalette === "object"
    ? {
        primary: parsed.colorPalette.primary?.trim() || "",
        secondary: parsed.colorPalette.secondary?.trim() || "",
        accent: parsed.colorPalette.accent?.trim() || "",
        harmony: parsed.colorPalette.harmony?.trim() || "",
      }
    : defaultPalette;

  const rawRow = parsed as unknown as Record<string, unknown>;
  let visualAnchorEn =
    typeof rawRow.visualAnchorEn === "string" ? rawRow.visualAnchorEn.trim() : "";
  let visualAnchorKo =
    typeof rawRow.visualAnchorKo === "string" ? rawRow.visualAnchorKo.trim() : "";

  if (!visualAnchorEn) {
    const paletteBits = [palette.primary, palette.secondary, palette.harmony].filter(Boolean).join("; ");
    visualAnchorEn = [
      paletteBits && `User garment color direction: ${paletteBits}.`,
      parsed.summary.trim().slice(0, 500),
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 900);
  }
  if (!visualAnchorKo) {
    visualAnchorKo = parsed.summary.trim().slice(0, 160) || "";
  }

  return {
    summary: parsed.summary.trim(),
    styleTip: parsed.styleTip.trim(),
    overallMood: parsed.overallMood?.trim() || "",
    colorPalette: palette,
    coordinationReason: parsed.coordinationReason?.trim() || "",
    visualAnchorEn,
    visualAnchorKo,
    items: normalizedItems,
  };
}

export async function requestVisionRecommendation(params: {
  imageUrl: string;
  profileText: string;
  desiredStyle?: string;
  occasion?: string;
  weather?: string;
  budget?: string;
  extraRequest?: string;
  wardrobeItems?: Array<{ category: string; aiSummary: string }>;
  recentFeedback?: string[];
}): Promise<VisionRecommendationResult> {
  const visionImageUrl = await imageUriToDataUrl(params.imageUrl);

  const wardrobeContext = params.wardrobeItems?.length
    ? `\n[보유 옷장 — aiSummary는 검색·매칭용 태그이니 반드시 참고]\n${params.wardrobeItems
        .slice(0, 15)
        .map((w) => {
          const tag = (w.aiSummary || "").trim() || "태그 없음";
          return `- ${w.category}: ${tag.slice(0, 90)}`;
        })
        .join("\n")}`
    : "";
  const feedbackContext = params.recentFeedback?.length
    ? `\n[중요: 최근 피드백 — 최우선 반영]\n${params.recentFeedback.map((f) => `- ${f}`).join("\n")}\n"별로"가 있는 경우 그 방향(색·핏·상황)은 피하고 개선안을 제시하세요.`
    : "";

  const lines = [
    `[사용자 프로필]`,
    params.profileText,
    ``,
    `[요청 조건]`,
    `- 원하는 스타일: ${params.desiredStyle?.trim() || "자유"}`,
    `- 상황/TPO: ${params.occasion?.trim() || "일상"}`,
    `- 날씨/계절: ${params.weather?.trim() || "보통"}`,
    `- 예산 한도: ${params.budget?.trim() || "제한 없음"}`,
  ];
  if (params.extraRequest?.trim()) {
    lines.push(`- 추가 요청: ${params.extraRequest.trim()}`);
  }
  if (wardrobeContext) lines.push(wardrobeContext);
  if (feedbackContext) lines.push(feedbackContext);
  lines.push(`\n위 사진의 옷을 정밀 분석하고, 이 옷을 중심으로 완성도 높은 코디를 제안해주세요.
색상 조화, 실루엣 밸런스, 소재 매칭을 모두 고려하고, 검색 키워드는 네이버 쇼핑에서 실제로 좋은 결과가 나올 만큼 구체적으로 작성해주세요.

[필수] JSON에 visualAnchorKo, visualAnchorEn 포함.
- 둘 다 **이 사진에 보이는 사용자의 그 한 벌만** 묘사합니다. items 배열은 그 옷과 다른 카테고리 조각만 다룹니다.
- visualAnchorEn은 이미지 생성용 영어로, 색·패턴·넥·기장·핏·질감·로고를 빠짐없이 쓰고 다른 아이템은 넣지 마세요.`);

  const data = await proxyPost<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/api/openai/chat-completions", {
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          { type: "text", text: lines.join("\n") },
          { type: "image_url", image_url: { url: visionImageUrl } },
        ],
      },
    ],
  });
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("추천 결과를 받지 못했습니다.");
  }
  try {
    const parsed = parseModelJson<VisionRecommendationResult>(content);
    return validateRecommendationResult(parsed);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`AI 추천 결과를 사용할 수 없습니다: ${error.message}`);
    }
    throw new Error("AI 추천 결과를 해석하지 못했습니다. 다시 시도해주세요.");
  }
}

/** 옷장 등록용 한 줄 태그(검색·일일 코디 매칭). 실패 시 호출부에서 휴리스틱을 쓰면 됨. */
export async function polishWardrobeSummaryLine(params: {
  category: string;
  color?: string;
  style?: string;
  position?: string;
}): Promise<string> {
  const hints = [params.color?.trim(), params.style?.trim(), params.position?.trim()].filter(Boolean).join(" · ");
  const data = await proxyPost<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/api/openai/chat-completions", {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "한국어 패션 옷장 태그 전문가. 출력은 한 줄 텍스트만(따옴표·머리말·JSON·불릿 금지, 공백 포함 72자 이내). 색·핏·무드·소재 느낌 위주로 검색에 쓰기 좋게.",
      },
      {
        role: "user",
        content: `카테고리: ${params.category}
${hints ? `시각 단서: ${hints}` : "시각 단서 없음(카테고리만으로 일반적 특징)"}

위를 반영한 옷장 검색용 태그 한 줄.`,
      },
    ],
  });
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return "";
  return raw
    .replace(/^["'`「]|[」'"`]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export async function analyzeGarmentRegions(imageUrl: string): Promise<GarmentDetectionResult> {
  const visionImageUrl = await imageUriToDataUrl(imageUrl);
  const data = await proxyPost<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/api/openai/chat-completions", {
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "의류 영역 분석 전문가입니다. 사용자가 요청한 형식의 JSON만 출력하세요. 설명 문장, 마크다운, 코드 블록을 넣지 마세요.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: GARMENT_DETECTION_USER_PROMPT },
          { type: "image_url", image_url: { url: visionImageUrl } },
        ],
      },
    ],
  });
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("의류 영역 분석 결과를 받지 못했습니다.");
  }

  try {
    const parsed = parseModelJson<{ items?: unknown[] }>(content);
    const rawItems = parsed.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new Error("감지된 의류가 없습니다.");
    }
    const items = rawItems.map((row) => {
      const r = row as Record<string, unknown>;
      const box = r.boundingBox as GarmentBoundingBox | undefined;
      return {
        category: String(r.category ?? "기타"),
        position: String(r.position ?? ""),
        color: String(r.color ?? ""),
        style: String(r.style ?? ""),
        boundingBox: normalizeBoundingBox(box),
      };
    });
    return { items };
  } catch (e) {
    if (e instanceof Error && e.message === "감지된 의류가 없습니다.") {
      throw e;
    }
    throw new Error("의류 영역 분석 결과를 해석하지 못했습니다. 다시 시도해주세요.");
  }
}

function buildOutfitVisualizationPrompt(result: VisionRecommendationResult): string {
  const anchor = (result.visualAnchorEn || "").trim();
  const complement = result.items
    .map(
      (item) =>
        `${item.category}: ${item.title} (colors: ${item.colorInfo || "harmonize with base"}; fabric: ${item.materialInfo || "natural"})`,
    )
    .join(" | ");

  const baseClause = anchor
    ? `NON-NEGOTIABLE user-owned base garment — keep exact colors, pattern, silhouette, neckline, length, texture; do not swap for a different garment: ${anchor}`
    : `Base styling brief: ${result.summary}. Palette: ${result.colorPalette.primary}, ${result.colorPalette.secondary}.`;

  return (
    `Photorealistic full-body Korean fashion editorial, adult model, seamless white cyclorama, soft diffused studio light, magazine quality, no text, no watermark. ` +
    `${baseClause} ` +
    `The model wears that base piece correctly for its category, then adds these complementary coordinated items only as additions (must color-match the base): ${complement}. ` +
    `Mood: ${result.overallMood || "polished"}. ${result.coordinationReason ? `Styling: ${result.coordinationReason.slice(0, 500)}` : ""}`
  ).slice(0, 3800);
}

export async function generateOutfitVisualization(
  result: VisionRecommendationResult,
): Promise<string> {
  const prompt = buildOutfitVisualizationPrompt(result);

  const data = await proxyPost<{
    data?: Array<{ url?: string }>;
    error?: { message?: string };
  }>("/api/openai/image-generation", {
    prompt,
    size: "1024x1792",
  });

  const url = data.data?.[0]?.url;
  if (!url) {
    throw new Error("이미지를 생성하지 못했습니다. 다시 시도해주세요.");
  }
  return url;
}

export async function requestCategoryOutfitRecommendation(params: {
  imageUrl: string;
  profileText: string;
  desiredStyle?: string;
  occasion?: string;
  weather?: string;
  budget?: string;
  focusCategory: string;
  garmentColor: string;
  garmentStyle: string;
  garmentPosition: string;
}): Promise<VisionRecommendationResult> {
  const visionImageUrl = await imageUriToDataUrl(params.imageUrl);

  const selectionText = `사용자가 사진에서 선택한 옷
- 카테고리: ${params.focusCategory}
- 위치(대략): ${params.garmentPosition || "미입력"}
- 색상: ${params.garmentColor || "미입력"}
- 스타일: ${params.garmentStyle || "미입력"}

위 선택 아이템을 중심으로 어울리는 코디를 추천하세요.

응답 JSON에 visualAnchorKo, visualAnchorEn 필수. 둘 다 **터치로 선택한 그 의류만** 묘사하고(선택 정보·사진과 일치), items는 다른 카테고리만.`;

  const data = await proxyPost<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/api/openai/chat-completions", {
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: CATEGORY_RECOMMEND_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${selectionText}
사용자 체형 정보: ${params.profileText}
원하는 스타일: ${params.desiredStyle?.trim() ? params.desiredStyle : "미입력"}
상황: ${params.occasion?.trim() ? params.occasion : "일반"}
날씨: ${params.weather?.trim() ? params.weather : "보통"}
예산: ${params.budget?.trim() ? params.budget : "제한 없음"}`,
          },
          { type: "image_url", image_url: { url: visionImageUrl } },
        ],
      },
    ],
  });
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("추천 결과를 받지 못했습니다.");
  }
  try {
    const parsed = parseModelJson<VisionRecommendationResult>(content);
    return validateRecommendationResult(parsed);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`AI 추천 결과를 사용할 수 없습니다: ${error.message}`);
    }
    throw new Error("AI 추천 결과를 해석하지 못했습니다. 다시 시도해주세요.");
  }
}
