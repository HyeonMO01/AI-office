import { ShoppingProduct } from "../types";
import { normalizeFetchError } from "./httpClient";
import { proxyGet } from "./apiProxy";
import { reportError } from "./monitoringService";

/** 코디 결과에서 네이버 쇼핑 병렬 호출 상한 */
export const NAVER_SHOP_FETCH_CONCURRENCY = 3;

interface NaverShoppingResponse {
  items?: Array<{
    title: string;
    link: string;
    image: string;
    lprice: string;
    hprice: string;
    mallName: string;
    brand: string;
    category1: string;
    category2: string;
  }>;
  errorMessage?: string;
  errorCode?: string;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

function parseBudgetToWon(budget?: string): number | null {
  if (!budget || budget === "제한 없음" || budget === "제한없음") return null;
  const num = budget.replace(/[^0-9]/g, "");
  if (!num) return null;
  const val = parseInt(num, 10);
  if (budget.includes("만")) return val * 10000;
  return val;
}

export type NaverProductsFetchResult = {
  products: ShoppingProduct[];
  /** 프록시/HTTP/네이버 API 오류. 검색 결과 0건과 구분됨 */
  error?: string;
};

export type NaverSingleFetchResult = {
  product: ShoppingProduct | null;
  error?: string;
};

function formatNaverFetchError(e: unknown): string {
  const err = normalizeFetchError(e);
  if (err.message.includes("요청 시간이 초과")) {
    return `${err.message} 프록시 URL(EXPO_PUBLIC_API_BASE_URL)과 PC·폰 동일 Wi‑Fi를 확인해주세요.`;
  }
  return err.message;
}

const NAVER_PROXY_GET_OPTS = {
  timeoutMs: 30000,
  retryCount: 2,
  retryDelayMs: 1000,
} as const;

function naverApiErrorMessage(data: NaverShoppingResponse): string | undefined {
  if (data.errorMessage && String(data.errorMessage).trim()) {
    return String(data.errorMessage).trim();
  }
  if (data.errorCode && String(data.errorCode).trim()) {
    return `네이버 쇼핑 API 오류 (${data.errorCode})`;
  }
  return undefined;
}

/**
 * 네이버 쇼핑 검색. 실패 시 `error`에 이유가 담기고 `products`는 빈 배열.
 * (과거에는 예외를 삼켜 빈 배열만 반환해 원인 파악이 불가능했음.)
 */
export async function fetchNaverShoppingProducts(
  query: string,
  count = 8,
  options?: { budget?: string; sort?: "sim" | "asc" | "dsc" | "date" },
): Promise<NaverProductsFetchResult> {
  try {
    const n = Math.max(1, Math.min(20, count));
    const sort = options?.sort || "sim";
    const data = await proxyGet<NaverShoppingResponse>(
      `/api/naver/shop-search?query=${encodeURIComponent(query)}&display=${n}&sort=${sort}`,
      NAVER_PROXY_GET_OPTS,
    );

    const apiErr = naverApiErrorMessage(data);
    if (apiErr) {
      void reportError(new Error(`Naver shop: ${apiErr}`), "naver_shopping_api");
      return { products: [], error: apiErr };
    }

    let items = (data.items ?? []).map((item) => ({
      title: stripHtml(item.title),
      image: item.image,
      lprice: item.lprice,
      mallName: item.mallName,
      productLink: item.link,
    }));

    const maxPrice = parseBudgetToWon(options?.budget);
    if (maxPrice) {
      const filtered = items.filter((item) => {
        const price = Number(item.lprice);
        return price > 0 && price <= maxPrice;
      });
      if (filtered.length >= 2) {
        items = filtered;
      }
    }

    return { products: items };
  } catch (e) {
    const msg = formatNaverFetchError(e);
    void reportError(e instanceof Error ? e : new Error(msg), "naver_shopping_fetch");
    return { products: [], error: msg };
  }
}

export async function searchNaverShoppingProducts(
  query: string,
  count = 8,
  options?: { budget?: string; sort?: "sim" | "asc" | "dsc" | "date" },
): Promise<ShoppingProduct[]> {
  const { products } = await fetchNaverShoppingProducts(query, count, options);
  return products;
}

function compactToken(v?: string): string {
  return (v || "").replace(/\s+/g, " ").trim();
}

function dedupeTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const t = compactToken(token);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * 네이버 쇼핑 검색 정확도 보강용 키워드 조합.
 * 기본 searchKeyword + 색상/소재/카테고리 힌트를 합쳐 노이즈를 줄인다.
 */
export function buildNaverSearchQuery(
  baseQuery: string,
  hints?: { category?: string; color?: string; material?: string; title?: string },
): string {
  const base = compactToken(baseQuery);
  const category = compactToken(hints?.category);
  const color = compactToken(hints?.color);
  const material = compactToken(hints?.material);
  const title = compactToken(hints?.title);
  const colorHead = color.split(/[,\-/]/)[0];
  const materialHead = material.split(/[,\-/]/)[0];
  const titleHead = title.split(/[,\-/]/)[0];
  const merged = dedupeTokens([base, colorHead, materialHead, category, titleHead]);
  return merged.join(" ").trim().slice(0, 120);
}

export async function fetchNaverShoppingProduct(
  query: string,
  hints?: { category?: string; color?: string; material?: string; title?: string },
): Promise<NaverSingleFetchResult> {
  try {
    const finalQuery = buildNaverSearchQuery(query, hints);
    const data = await proxyGet<NaverShoppingResponse>(
      `/api/naver/shop-search?query=${encodeURIComponent(finalQuery || query)}&display=5&sort=sim`,
      NAVER_PROXY_GET_OPTS,
    );
    const apiErr = naverApiErrorMessage(data);
    if (apiErr) {
      void reportError(new Error(`Naver shop: ${apiErr}`), "naver_shopping_api");
      return { product: null, error: apiErr };
    }
    const first = data.items?.[0];
    if (!first) return { product: null };

    return {
      product: {
        title: stripHtml(first.title),
        image: first.image,
        lprice: first.lprice,
        mallName: first.mallName,
        productLink: first.link,
      },
    };
  } catch (e) {
    const msg = formatNaverFetchError(e);
    void reportError(e instanceof Error ? e : new Error(msg), "naver_shopping_fetch");
    return { product: null, error: msg };
  }
}

export async function searchNaverShoppingProduct(query: string): Promise<ShoppingProduct | null> {
  const { product } = await fetchNaverShoppingProduct(query);
  return product;
}
