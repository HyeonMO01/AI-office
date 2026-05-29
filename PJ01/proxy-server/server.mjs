import { createServer } from "node:http";
import { URL } from "node:url";

const port = Number(process.env.PORT || 8787);
const openAiApiKey =
  process.env.OPENAI_API_KEY || process.env.EXPO_PUBLIC_OPENAI_API_KEY;
const replicateToken = process.env.REPLICATE_API_TOKEN;
const openWeatherKey = process.env.OPENWEATHER_API_KEY;
const naverClientId =
  process.env.NAVER_SHOPPING_CLIENT_ID || process.env.EXPO_PUBLIC_NAVER_SHOPPING_CLIENT_ID;
const naverClientSecret =
  process.env.NAVER_SHOPPING_CLIENT_SECRET || process.env.EXPO_PUBLIC_NAVER_SHOPPING_CLIENT_SECRET;
const proxyToken = process.env.PROXY_TOKEN;
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const allowedSortValues = new Set(["sim", "date", "asc", "dsc"]);
const proxyVersion = process.env.PROXY_VERSION || "1";

function buildCorsHeaders(origin) {
  const allowAny = allowedOrigins.length === 0;
  const allowed = allowAny || (origin ? allowedOrigins.includes(origin) : false);
  return {
    allowed,
    headers: {
      "Access-Control-Allow-Origin": allowed ? origin || "*" : "null",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,x-proxy-token",
      Vary: "Origin",
    },
  };
}

function sendJson(res, status, body, corsHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...corsHeaders,
  });
  res.end(payload);
}

async function readBody(req) {
  const maxBytes = 50 * 1024 * 1024;
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

const windowHits = new Map();
function allowRequest(ip) {
  const now = Date.now();
  const prev = windowHits.get(ip);
  if (!prev || now - prev.startedAt > 60_000) {
    windowHits.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (prev.count >= 60) {
    return false;
  }
  prev.count += 1;
  return true;
}

if (!proxyToken) {
  console.warn("[proxy] WARNING: PROXY_TOKEN is not set — all requests are unauthenticated");
}
if (allowedOrigins.length === 0) {
  console.warn("[proxy] WARNING: CORS_ALLOWED_ORIGINS is not set — all origins are allowed");
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  /* 로드밸런서·업타임 체크 — CORS/토큰/레이트리밋 없음 */
  if (req.method === "GET" && requestUrl.pathname === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.end(
      JSON.stringify({
        ok: true,
        service: "fizzylush-proxy",
        version: proxyVersion,
        ts: new Date().toISOString(),
      }),
    );
    return;
  }

  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const cors = buildCorsHeaders(origin);
  if (req.method === "OPTIONS") {
    if (!cors.allowed) {
      sendJson(res, 403, { error: "Origin not allowed" }, cors.headers);
      return;
    }
    sendJson(res, 204, {}, cors.headers);
    return;
  }
  if (!cors.allowed) {
    sendJson(res, 403, { error: "Origin not allowed" }, cors.headers);
    return;
  }
  if (proxyToken && req.headers["x-proxy-token"] !== proxyToken) {
    sendJson(res, 401, { error: "Unauthorized proxy token" }, cors.headers);
    return;
  }

  const ip = req.socket.remoteAddress || "unknown";
  if (!allowRequest(ip)) {
    sendJson(res, 429, { error: "Too many requests" }, cors.headers);
    return;
  }

  try {
    if (req.method === "POST" && requestUrl.pathname === "/api/openai/chat-completions") {
      if (!openAiApiKey) {
        sendJson(res, 500, { error: "OPENAI_API_KEY is missing" }, cors.headers);
        return;
      }
      const body = await readBody(req);
      if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
        sendJson(res, 400, { error: "Invalid OpenAI request body" }, cors.headers);
        return;
      }
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiApiKey}`,
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      res.writeHead(response.status, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        ...cors.headers,
      });
      res.end(text);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/naver/shop-search") {
      if (!naverClientId || !naverClientSecret) {
        sendJson(res, 500, { error: "NAVER keys are missing" }, cors.headers);
        return;
      }
      const query = requestUrl.searchParams.get("query") || "";
      const displayRaw = Number(requestUrl.searchParams.get("display") || "5");
      const sortRaw = requestUrl.searchParams.get("sort") || "sim";
      if (!query.trim() || query.length > 120) {
        sendJson(res, 400, { error: "Invalid query" }, cors.headers);
        return;
      }
      const display = String(Math.max(1, Math.min(20, Number.isNaN(displayRaw) ? 5 : displayRaw)));
      const sort = allowedSortValues.has(sortRaw) ? sortRaw : "sim";
      const upstream = await fetch(
        `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=${encodeURIComponent(display)}&sort=${encodeURIComponent(sort)}`,
        {
          headers: {
            "X-Naver-Client-Id": naverClientId,
            "X-Naver-Client-Secret": naverClientSecret,
          },
        },
      );
      const text = await upstream.text();
      res.writeHead(upstream.status, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        ...cors.headers,
      });
      res.end(text);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/replicate/tryon/start") {
      if (!replicateToken) {
        sendJson(res, 500, { error: "REPLICATE_API_TOKEN is missing" }, cors.headers);
        return;
      }
      const body = await readBody(req);
      if (!body || !body.garment_image || !body.human_image) {
        sendJson(res, 400, { error: "garment_image and human_image are required" }, cors.headers);
        return;
      }
      const allowedCategories = new Set(["upper_body", "lower_body", "dresses"]);
      const category = allowedCategories.has(body.category) ? body.category : "upper_body";
      const response = await fetch("https://api.replicate.com/v1/models/yisol/idm-vton/predictions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${replicateToken}`,
        },
        body: JSON.stringify({
          input: {
            garm_img: body.garment_image,
            human_img: body.human_image,
            garment_des: typeof body.garment_description === "string"
              ? body.garment_description.slice(0, 200)
              : "",
            category,
            is_checked: true,
            is_checked_crop: false,
          },
        }),
      });
      const text = await response.text();
      res.writeHead(response.status, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        ...cors.headers,
      });
      res.end(text);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/replicate/tryon/status") {
      if (!replicateToken) {
        sendJson(res, 500, { error: "REPLICATE_API_TOKEN is missing" }, cors.headers);
        return;
      }
      const predictionId = requestUrl.searchParams.get("id") || "";
      if (!predictionId || !/^[a-zA-Z0-9]+$/.test(predictionId)) {
        sendJson(res, 400, { error: "Invalid prediction ID" }, cors.headers);
        return;
      }
      const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { Authorization: `Token ${replicateToken}` },
      });
      const text = await response.text();
      res.writeHead(response.status, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        ...cors.headers,
      });
      res.end(text);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/openai/image-generation") {
      if (!openAiApiKey) {
        sendJson(res, 500, { error: "OPENAI_API_KEY is missing" }, cors.headers);
        return;
      }
      const body = await readBody(req);
      if (!body || typeof body !== "object" || typeof body.prompt !== "string" || !body.prompt.trim()) {
        sendJson(res, 400, { error: "Invalid image generation request: prompt required" }, cors.headers);
        return;
      }
      const prompt = body.prompt.slice(0, 3800);
      const size = ["1024x1024", "1024x1792", "1792x1024"].includes(body.size) ? body.size : "1024x1792";
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiApiKey}`,
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size,
          quality: "standard",
          response_format: "url",
        }),
      });
      const text = await response.text();
      res.writeHead(response.status, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        ...cors.headers,
      });
      res.end(text);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/weather/current") {
      if (!openWeatherKey) {
        sendJson(res, 500, { error: "OPENWEATHER_API_KEY is missing" }, cors.headers);
        return;
      }
      const lat = requestUrl.searchParams.get("lat") || "";
      const lon = requestUrl.searchParams.get("lon") || "";
      if (!lat || !lon) {
        sendJson(res, 400, { error: "lat and lon are required" }, cors.headers);
        return;
      }
      const upstream = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&appid=${openWeatherKey}&units=metric&lang=kr`,
      );
      const text = await upstream.text();
      res.writeHead(upstream.status, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        ...cors.headers,
      });
      res.end(text);
      return;
    }

    sendJson(res, 404, { error: "Not found" }, cors.headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    sendJson(res, 500, { error: message }, cors.headers);
  }
});

server.listen(port, () => {
  console.log(`[proxy] running on http://localhost:${port}`);
});
