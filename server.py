from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from openai import OpenAI
from pydantic import BaseModel, Field

load_dotenv()

_raw_cors = (os.getenv("CORS_ALLOWED_ORIGINS") or "").strip()
_cors_origins: list[str] = (
    [o.strip() for o in _raw_cors.split(",") if o.strip()] if _raw_cors else ["*"]
)

app = FastAPI(title="Fizzylush Unified AI Office API")
openai_client: OpenAI | None = None
auto_worker_started = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-Office-Token"],
)


DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "ai_office.db"
DEFAULT_TOKEN_LIMIT = 500_000
ALLOWED_NAVER_SORTS = {"sim", "date", "asc", "dsc"}
MAX_PROXY_BODY_BYTES = 50 * 1024 * 1024
AUTO_OFFICE_POLL_SECONDS = 60

# 직원별 모델 — 정밀도가 중요한 직무는 gpt-4o, 속도가 중요한 직무는 mini
EMP_MODELS: dict[str, str] = {}  # populated after EMP constants are defined


EMP_PLANNING = "\uae30\ud68d"
EMP_RESEARCH = "\ub9ac\uc11c\uce58"
EMP_TRANSLATION = "\ubc88\uc5ed"
EMP_ANALYSIS = "\ubd84\uc11d"
EMP_ADMIN = "\ucd1d\ubb34"
EMP_DEVELOPMENT = "\uac1c\ubc1c"
EMP_QA = "\uac80\uc218"
EMP_DEPLOYMENT = "\ubc30\ud3ec"
EMP_GROWTH = "\uc9d1\ud589"
EMP_LEGAL = "\ubc95\ubb34"

# \ubaa8\ub378 \ub77c\uc6b0\ud305 \u2014 \ubcf5\uc7a1/\uc815\ubc00 \uc5c5\ubb34\ub294 gpt-4o, \ub2e8\uc21c/\ube60\ub978 \uc5c5\ubb34\ub294 gpt-4o-mini
EMP_MODELS = {
    EMP_PLANNING:    "gpt-4o",       # \uc804\ub7b5 \uae30\ud68d \u2014 \ud488\uc9c8 \uc911\uc694
    EMP_RESEARCH:    "gpt-4o",       # \ub9ac\uc11c\uce58 \u2014 \uae4a\uc774 \uc911\uc694
    EMP_ANALYSIS:    "gpt-4o",       # \ub370\uc774\ud130 \ubd84\uc11d \u2014 \uc815\ud655\ub3c4 \uc911\uc694
    EMP_QA:          "gpt-4o",       # \ud488\uc9c8 \uac80\uc218 \u2014 \uaf3c\uaf3c\ud568 \uc911\uc694
    EMP_LEGAL:       "gpt-4o",       # \ubc95\ubb34 \u2014 \uc815\ud655\ub3c4 \ucd5c\uc911\uc694
    EMP_DEVELOPMENT: "gpt-4o",       # \uac1c\ubc1c \u2014 \ucf54\ub4dc \ud488\uc9c8 \uc911\uc694
    EMP_TRANSLATION: "gpt-4o-mini",  # \ubc88\uc5ed \u2014 \ube60\ub978 \ucc98\ub9ac \uac00\ub2a5
    EMP_ADMIN:       "gpt-4o-mini",  # \ucd1d\ubb34 \u2014 \ub2e8\uc21c \ubb38\uc11c \uc791\uc5c5
    EMP_DEPLOYMENT:  "gpt-4o-mini",  # \ubc30\ud3ec \u2014 \uccb4\ud06c\ub9ac\uc2a4\ud2b8 \uc704\uc8fc
    EMP_GROWTH:      "gpt-4o-mini",  # \uc9d1\ud589 \u2014 \ub9c8\ucf00\ud305 \uce74\ud53c
}

EMP_AREA = {
    EMP_PLANNING: "employee_planning",
    EMP_RESEARCH: "employee_research",
    EMP_TRANSLATION: "employee_marketing",
    EMP_ANALYSIS: "employee_analysis",
    EMP_ADMIN: "employee_operations",
    EMP_DEVELOPMENT: "employee_development",
    EMP_QA: "employee_qa",
    EMP_DEPLOYMENT: "employee_deployment",
    EMP_GROWTH: "employee_growth",
    EMP_LEGAL: "employee_legal",
}

# Employee AI registry.
FIZZYLUSH_CONTEXT = """
Product context:
- fizzylush is an AI fashion app built with Expo and React Native.
- Core features: wardrobe upload, AI outfit recommendation, shopping recommendation,
  weather-aware styling, recommendation history, user profile, Firebase auth/storage,
  Naver Shopping search, OpenAI recommendation prompts, and optional Replicate virtual try-on.
- Business goal: validate the MVP, recruit early users, prove retention, define revenue,
  prepare launch assets, and improve recommendation quality.
- Operating rule: AI employees may prepare plans, research, documents, checklists,
  copy, and analysis. Real deployment, paid ads, customer messaging, legal publication,
  and production data changes require founder approval.
- IMPORTANT: Always write the final answer in natural Korean.
"""

OFFICE_REPORTING_RULES = """
Reporting rules:
- Never say "완료", "확인 완료", "준비 완료", "진행되었습니다", or "실행했습니다" unless this server/tool actually performed that action in this session.
- Separate every operational report into these sections:
  1. 실제 완료: actions actually performed by the server/tool in this session.
  2. 준비된 초안/제안: plans, drafts, assumptions, checklists, copy, or recommendations only.
  3. 승인 필요: store submission, paid ads, customer messaging, legal publication, credential changes, deployment, or production data changes.
  4. 다음 실행: concrete next actions and owner.
- If there is no verified execution, write "실제 완료: 없음".
- If something still requires manual testing, write "검증 필요" instead of "확인 완료".
- If you create an approval-gated action with propose_office_action, say it was "등록됨", not "실행됨".
"""

employees = {
    EMP_PLANNING: {
        "name": "\ubc15\uae30\ud68d",
        "role": "\uc0ac\uc5c5/\uc81c\ud488 \uae30\ud68d\uc790",
        "system_prompt": "",
    },
    EMP_RESEARCH: {
        "name": "\uc774\ub9ac\uc11c\uce58",
        "role": "\uc2dc\uc7a5/\uacbd\uc7c1 \ub9ac\uc11c\ucc98",
        "system_prompt": "",
    },
    EMP_TRANSLATION: {
        "name": "\uae40\ubc88\uc5ed",
        "role": "\ub9c8\ucf00\ud305/\uae00\ub85c\ubc8c \uce74\ud53c\ub77c\uc774\ud130",
        "system_prompt": "",
    },
    EMP_ANALYSIS: {
        "name": "\ucd5c\ubd84\uc11d",
        "role": "\uc131\uc7a5/\ub370\uc774\ud130 \ubd84\uc11d\uac00",
        "system_prompt": "",
    },
    EMP_ADMIN: {
        "name": "\uc815\ucd1d\ubb34",
        "role": "\uc6b4\uc601/\ub7f0\uce6d PM",
        "system_prompt": "",
    },
    EMP_DEVELOPMENT: {"name": "오개발", "role": "앱 개발/기술 수정", "system_prompt": ""},
    EMP_QA: {"name": "한검수", "role": "테스트/QA", "system_prompt": ""},
    EMP_DEPLOYMENT: {"name": "서배포", "role": "빌드/배포", "system_prompt": ""},
    EMP_GROWTH: {"name": "임집행", "role": "마케팅 집행", "system_prompt": ""},
    EMP_LEGAL: {"name": "유법무", "role": "법무/개인정보 점검", "system_prompt": ""},
}

employees[EMP_DEVELOPMENT]["system_prompt"] = (
    FIZZYLUSH_CONTEXT
    + OFFICE_REPORTING_RULES
    + "You are the app development employee for fizzylush. Create concrete implementation plans, file-level code-change tasks, and acceptance criteria. "
    "Use propose_office_action for code edits or engineering work. Direct code changes are performed by Codex in the shared workspace after founder approval or explicit request. Always answer in Korean."
)
employees[EMP_QA]["system_prompt"] = (
    FIZZYLUSH_CONTEXT
    + OFFICE_REPORTING_RULES
    + "You are the QA and release verification employee for fizzylush. Create smoke tests, regression tests, build checks, and launch-blocker reports. "
    "Use propose_office_action for test/build actions that should be run. Always answer in Korean."
)
employees[EMP_DEPLOYMENT]["system_prompt"] = (
    FIZZYLUSH_CONTEXT
    + OFFICE_REPORTING_RULES
    + "You are the build and deployment employee for fizzylush. Prepare EAS, Firebase, backend, web dashboard, and store-release runbooks. "
    "Deployment commands, store submissions, credential operations, and production changes require founder approval through propose_office_action. Always answer in Korean."
)
employees[EMP_GROWTH]["system_prompt"] = (
    FIZZYLUSH_CONTEXT
    + OFFICE_REPORTING_RULES
    + "You are the growth execution employee for fizzylush. Prepare beta recruiting, SNS posts, ad plans, customer messages, and campaign calendars. "
    "Paid ads and real customer messages require founder approval through propose_office_action. Always answer in Korean."
)
employees[EMP_LEGAL]["system_prompt"] = (
    FIZZYLUSH_CONTEXT
    + OFFICE_REPORTING_RULES
    + "You are the policy and legal review employee for fizzylush. Draft privacy, terms, consent, data handling, and store compliance checklists. "
    "You are not a lawyer; final publication requires founder/legal review through propose_office_action. Always answer in Korean."
)


# Short-term memory store.
employees[EMP_PLANNING]["system_prompt"] = (
    FIZZYLUSH_CONTEXT
    + OFFICE_REPORTING_RULES
    + "You are the product and business planner for fizzylush. "
    "Create MVP scope, launch strategy, feature priorities, pricing ideas, roadmaps, and executable plans. "
    "Always answer in Korean."
)
employees[EMP_RESEARCH]["system_prompt"] = (
    FIZZYLUSH_CONTEXT
    + OFFICE_REPORTING_RULES
    + "You are the market and competitor researcher for fizzylush. "
    "Research fashion apps, AI styling, shopping behavior, target users, and positioning. "
    "Use search_fashion_market when market context is useful. Always answer in Korean."
)
employees[EMP_TRANSLATION]["system_prompt"] = (
    FIZZYLUSH_CONTEXT
    + OFFICE_REPORTING_RULES
    + "You are the marketing, copywriting, localization, and global launch employee for fizzylush. "
    "Write app store copy, landing copy, social posts, ads, email templates, investor one-liners, and translations. "
    "Always answer in Korean unless another language is explicitly requested."
)
employees[EMP_ANALYSIS]["system_prompt"] = (
    FIZZYLUSH_CONTEXT
    + OFFICE_REPORTING_RULES
    + "You are the growth and data analyst for fizzylush. "
    "Define KPIs, funnels, retention metrics, experiment plans, risks, and product improvement insights. "
    "Use analyze_fizzylush_project when project context is useful. Always answer in Korean."
)
employees[EMP_ADMIN]["system_prompt"] = (
    FIZZYLUSH_CONTEXT
    + OFFICE_REPORTING_RULES
    + "You are the operations and launch PM for fizzylush. "
    "Create launch checklists, meeting notes, release readiness docs, task lists, policy drafts, and saved documents. "
    "Use create_launch_checklist for launch execution and save_business_doc for durable documents. Always answer in Korean."
)

# This is enough for local Swagger testing. Use Redis/DB for production.
chat_history: dict[str, list[dict[str, str]]] = {}
MAX_HISTORY_MESSAGES = 12


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_local_env() -> None:
    load_env_file(Path(".env"))
    load_env_file(Path("PJ01") / ".env")


def env_value(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return value.strip()
    return None


def json_response(status_code: int, payload: dict[str, Any]) -> Response:
    return Response(
        content=json.dumps(payload, ensure_ascii=False),
        status_code=status_code,
        media_type="application/json; charset=utf-8",
    )


def upstream_response(status_code: int, body: bytes, content_type: str = "application/json; charset=utf-8") -> Response:
    return Response(
        content=body,
        status_code=status_code,
        media_type=content_type,
        headers={"X-Content-Type-Options": "nosniff"},
    )


def fetch_upstream(url: str, method: str = "GET", headers: dict[str, str] | None = None, body: bytes | None = None) -> Response:
    request = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as res:
            content_type = res.headers.get("Content-Type", "application/json; charset=utf-8")
            return upstream_response(res.status, res.read(), content_type)
    except urllib.error.HTTPError as exc:
        content_type = exc.headers.get("Content-Type", "application/json; charset=utf-8")
        return upstream_response(exc.code, exc.read(), content_type)
    except urllib.error.URLError as exc:
        return json_response(502, {"error": str(exc.reason)})


def get_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS office_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_key TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'founder',
                token_limit INTEGER NOT NULL DEFAULT 500000,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS token_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                user_key TEXT NOT NULL DEFAULT 'founder',
                area TEXT NOT NULL,
                model TEXT NOT NULL,
                prompt_tokens INTEGER NOT NULL DEFAULT 0,
                completion_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS persistent_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS office_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                path TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'general',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS office_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_key TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                task TEXT NOT NULL,
                interval_minutes INTEGER NOT NULL DEFAULT 1440,
                enabled INTEGER NOT NULL DEFAULT 1,
                last_run_at TEXT,
                next_run_at TEXT NOT NULL,
                last_status TEXT NOT NULL DEFAULT 'pending',
                last_result TEXT NOT NULL DEFAULT '',
                run_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS office_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                title TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS office_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action_type TEXT NOT NULL,
                title TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                command TEXT NOT NULL DEFAULT '',
                risk_level TEXT NOT NULL DEFAULT 'medium',
                status TEXT NOT NULL DEFAULT 'pending_approval',
                requested_by TEXT NOT NULL DEFAULT 'ai_office',
                approved_at TEXT,
                completed_at TEXT,
                result TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS office_triggers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trigger_key TEXT NOT NULL UNIQUE,
                event_type TEXT NOT NULL,
                keyword TEXT NOT NULL DEFAULT '',
                employee_keys TEXT NOT NULL,
                task_template TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                cooldown_minutes INTEGER NOT NULL DEFAULT 60,
                last_triggered_at TEXT,
                trigger_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS office_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL UNIQUE,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO office_users
                (user_key, display_name, role, token_limit, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("founder", "Founder", "founder", DEFAULT_TOKEN_LIMIT, utc_now()),
        )
        now = utc_now()
        default_jobs = [
            (
                "daily_business_review",
                "Daily business review",
                "fizzylush의 현재 MVP/런칭 준비 상태를 점검하고 오늘 우선순위 5개, 위험요소, 필요한 문서를 정리해줘. 결과는 한국어 운영 메모로 작성해줘.",
                720,
            ),
            (
                "weekly_growth_review",
                "Growth and retention review",
                "fizzylush의 가입, 옷장 업로드, AI 추천, 쇼핑 클릭, 재방문 관점의 KPI를 점검하는 성장 분석 메모를 작성해줘. 아직 실제 수치가 없으면 추적해야 할 이벤트와 대시보드 항목을 제안해줘.",
                1440,
            ),
            (
                "launch_checklist_review",
                "Launch checklist review",
                "fizzylush 베타 출시 체크리스트를 최신 상태로 다시 점검하고 founder가 직접 승인해야 하는 항목과 AI 사무실이 준비할 항목을 분리해줘.",
                1440,
            ),
        ]
        for job_key, title, task, interval_minutes in default_jobs:
            conn.execute(
                """
                INSERT OR IGNORE INTO office_jobs
                    (job_key, title, task, interval_minutes, enabled, next_run_at, created_at)
                VALUES (?, ?, ?, ?, 1, ?, ?)
                """,
                (job_key, title, task, interval_minutes, now, now),
            )
            conn.execute(
                """
                UPDATE office_jobs
                SET title = ?, task = ?, interval_minutes = ?
                WHERE job_key = ?
                """,
                (title, task, interval_minutes, job_key),
            )

        default_triggers = [
            (
                "on_job_failed",
                "auto_job_failed",
                "",
                json.dumps([EMP_DEVELOPMENT, EMP_ADMIN]),
                "자동 업무 실패가 감지됐습니다: {detail}\n원인을 분석하고 복구 방안을 제시해주세요.",
                120,
            ),
            (
                "on_action_approved",
                "action_approved",
                "",
                json.dumps([EMP_DEVELOPMENT]),
                "창업자가 다음 액션을 승인했습니다: {detail}\n실행 준비 및 체크리스트를 작성해주세요.",
                30,
            ),
            (
                "on_webhook_error",
                "webhook",
                "error",
                json.dumps([EMP_DEVELOPMENT, EMP_QA]),
                "외부 시스템에서 오류가 보고됐습니다: {detail}\n영향 범위와 대응 방안을 분석해주세요.",
                60,
            ),
        ]
        for trigger_key, event_type, keyword, employee_keys, task_template, cooldown_minutes in default_triggers:
            conn.execute(
                """
                INSERT OR IGNORE INTO office_triggers
                    (trigger_key, event_type, keyword, employee_keys, task_template,
                     enabled, cooldown_minutes, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (trigger_key, event_type, keyword, employee_keys, task_template, cooldown_minutes, now),
            )


def _verify_office_token(request: Request) -> None:
    required = (os.getenv("OFFICE_TOKEN") or "").strip()
    if required and request.headers.get("X-Office-Token") != required:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Office-Token header")


@app.on_event("startup")
def startup() -> None:
    global auto_worker_started
    load_local_env()
    init_db()
    if not (os.getenv("OFFICE_TOKEN") or "").strip():
        print("[WARNING] OFFICE_TOKEN is not set - /command is open to anyone with the URL")
    if _cors_origins == ["*"]:
        print("[WARNING] CORS_ALLOWED_ORIGINS is not set - all origins are allowed")
    if not auto_worker_started and (env_value("AUTO_OFFICE_ENABLED") or "1") != "0":
        auto_worker_started = True
        threading.Thread(target=auto_office_loop, name="auto-office-worker", daemon=True).start()


def get_openai_client() -> OpenAI:
    global openai_client

    api_key = env_value("OPENAI_API_KEY", "EXPO_PUBLIC_OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY environment variable is not set.",
        )

    if openai_client is None:
        openai_client = OpenAI(api_key=api_key)

    return openai_client


async def read_proxy_json_body(request: Request) -> bytes:
    body = await request.body()
    if len(body) > MAX_PROXY_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body too large")
    if body:
        try:
            json.loads(body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON body") from exc
    return body or b"{}"


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "fizzylush-unified-ai-office",
        "version": env_value("PROXY_VERSION") or "1",
        "ts": utc_now(),
    }


@app.post("/api/openai/chat-completions")
async def proxy_openai_chat_completions(request: Request):
    api_key = env_value("OPENAI_API_KEY", "EXPO_PUBLIC_OPENAI_API_KEY")
    if not api_key:
        return json_response(500, {"error": "OPENAI_API_KEY is missing"})
    body = await read_proxy_json_body(request)
    return fetch_upstream(
        "https://api.openai.com/v1/chat/completions",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        body=body,
    )


@app.post("/api/openai/image-generation")
async def proxy_openai_image_generation(request: Request):
    api_key = env_value("OPENAI_API_KEY", "EXPO_PUBLIC_OPENAI_API_KEY")
    if not api_key:
        return json_response(500, {"error": "OPENAI_API_KEY is missing"})
    body = await read_proxy_json_body(request)
    payload = json.loads(body.decode("utf-8"))
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        return json_response(400, {"error": "Invalid image generation request: prompt required"})
    size = payload.get("size")
    if size not in {"1024x1024", "1024x1792", "1792x1024"}:
        size = "1024x1792"
    upstream_body = json.dumps(
        {
            "model": "dall-e-3",
            "prompt": prompt[:3800],
            "n": 1,
            "size": size,
            "quality": "standard",
            "response_format": "url",
        }
    ).encode("utf-8")
    return fetch_upstream(
        "https://api.openai.com/v1/images/generations",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        body=upstream_body,
    )


@app.get("/api/naver/shop-search")
def proxy_naver_shop_search(query: str = "", display: int = 5, sort: str = "sim"):
    client_id = env_value("NAVER_SHOPPING_CLIENT_ID", "EXPO_PUBLIC_NAVER_SHOPPING_CLIENT_ID")
    client_secret = env_value("NAVER_SHOPPING_CLIENT_SECRET", "EXPO_PUBLIC_NAVER_SHOPPING_CLIENT_SECRET")
    if not client_id or not client_secret:
        return json_response(500, {"error": "NAVER keys are missing"})
    query = query.strip()
    if not query or len(query) > 120:
        return json_response(400, {"error": "Invalid query"})
    safe_display = max(1, min(20, int(display or 5)))
    safe_sort = sort if sort in ALLOWED_NAVER_SORTS else "sim"
    params = urllib.parse.urlencode(
        {
            "query": query,
            "display": str(safe_display),
            "sort": safe_sort,
        }
    )
    return fetch_upstream(
        f"https://openapi.naver.com/v1/search/shop.json?{params}",
        headers={
            "X-Naver-Client-Id": client_id,
            "X-Naver-Client-Secret": client_secret,
        },
    )


@app.get("/api/weather/current")
def proxy_weather_current(lat: str = "", lon: str = ""):
    api_key = env_value("OPENWEATHER_API_KEY")
    if not api_key:
        return json_response(500, {"error": "OPENWEATHER_API_KEY is missing"})
    if not lat or not lon:
        return json_response(400, {"error": "lat and lon are required"})
    params = urllib.parse.urlencode(
        {
            "lat": lat,
            "lon": lon,
            "appid": api_key,
            "units": "metric",
            "lang": "kr",
        }
    )
    return fetch_upstream(f"https://api.openweathermap.org/data/2.5/weather?{params}")


@app.post("/api/replicate/tryon/start")
async def proxy_replicate_tryon_start(request: Request):
    token = env_value("REPLICATE_API_TOKEN")
    if not token:
        return json_response(500, {"error": "REPLICATE_API_TOKEN is missing"})
    body = await read_proxy_json_body(request)
    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        return json_response(400, {"error": "Invalid JSON body"})
    if not payload.get("garment_image") or not payload.get("human_image"):
        return json_response(400, {"error": "garment_image and human_image are required"})
    category = payload.get("category")
    if category not in {"upper_body", "lower_body", "dresses"}:
        category = "upper_body"
    upstream_body = json.dumps(
        {
            "input": {
                "garm_img": payload["garment_image"],
                "human_img": payload["human_image"],
                "garment_des": str(payload.get("garment_description") or "")[:200],
                "category": category,
                "is_checked": True,
                "is_checked_crop": False,
            }
        }
    ).encode("utf-8")
    return fetch_upstream(
        "https://api.replicate.com/v1/models/yisol/idm-vton/predictions",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Token {token}",
        },
        body=upstream_body,
    )


@app.post("/api/fal/tryon/start")
async def proxy_fal_tryon_start(request: Request):
    fal_key = env_value("FAL_API_KEY")
    if not fal_key:
        return json_response(500, {"error": "FAL_API_KEY is missing"})
    body = await read_proxy_json_body(request)
    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError:
        return json_response(400, {"error": "Invalid JSON body"})
    if not payload.get("human_image_url") or not payload.get("garment_image_url"):
        return json_response(400, {"error": "human_image_url and garment_image_url are required"})
    category = payload.get("category", "upper")
    if category not in {"upper", "lower", "dress"}:
        category = "upper"
    upstream_body = json.dumps({
        "human_image_url": payload["human_image_url"],
        "garment_image_url": payload["garment_image_url"],
        "category": category,
    }).encode("utf-8")
    return fetch_upstream(
        "https://queue.fal.run/fal-ai/kling/v1-5/kolors-virtual-try-on",
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Key {fal_key}"},
        body=upstream_body,
    )


@app.get("/api/fal/tryon/status")
def proxy_fal_tryon_status(id: str = ""):
    fal_key = env_value("FAL_API_KEY")
    if not fal_key:
        return json_response(500, {"error": "FAL_API_KEY is missing"})
    if not id:
        return json_response(400, {"error": "id is required"})
    safe_id = urllib.parse.quote(id)
    auth_headers = {"Authorization": f"Key {fal_key}"}
    status_req = urllib.request.Request(
        f"https://queue.fal.run/fal-ai/kling/v1-5/kolors-virtual-try-on/requests/{safe_id}/status",
        headers=auth_headers,
    )
    try:
        with urllib.request.urlopen(status_req, timeout=30) as res:
            status_data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return json_response(exc.code, {"error": exc.read().decode("utf-8", errors="ignore")})
    except urllib.error.URLError as exc:
        return json_response(502, {"error": str(exc.reason)})

    status = status_data.get("status", "")
    if status == "COMPLETED":
        result_req = urllib.request.Request(
            f"https://queue.fal.run/fal-ai/kling/v1-5/kolors-virtual-try-on/requests/{safe_id}",
            headers=auth_headers,
        )
        try:
            with urllib.request.urlopen(result_req, timeout=30) as res:
                result_data = json.loads(res.read().decode("utf-8"))
            images = result_data.get("images", [])
            output_url = images[0].get("url") if images else None
            return json_response(200, {"status": "COMPLETED", "output_url": output_url})
        except Exception:
            return json_response(200, {"status": "COMPLETED", "output_url": None})
    if status == "FAILED":
        return json_response(200, {"status": "FAILED", "error": status_data.get("error", "가상 착용 생성 실패")})
    return json_response(200, {"status": status})


@app.get("/api/replicate/tryon/status")
def proxy_replicate_tryon_status(id: str = ""):
    token = env_value("REPLICATE_API_TOKEN")
    if not token:
        return json_response(500, {"error": "REPLICATE_API_TOKEN is missing"})
    if not id or not id.isalnum():
        return json_response(400, {"error": "Invalid prediction ID"})
    return fetch_upstream(
        f"https://api.replicate.com/v1/predictions/{urllib.parse.quote(id)}",
        headers={"Authorization": f"Token {token}"},
    )


class CommandRequest(BaseModel):
    task: str = Field(..., description="User command")
    session_id: str = Field(
        default="default",
        description="Conversation memory key. Same session_id shares context.",
    )
    user_key: str = Field(
        default="founder",
        description="Office user key for token/account tracking.",
    )


class OfficeUserRequest(BaseModel):
    user_key: str = Field(..., description="Stable user key, for example founder or tester01")
    display_name: str = Field(..., description="Display name")
    role: str = Field(default="member", description="founder, operator, tester, etc.")
    token_limit: int = Field(default=DEFAULT_TOKEN_LIMIT, ge=0)


def get_recent_history(session_id: str) -> list[dict[str, str]]:
    memory_rows = chat_history.get(session_id, [])
    if memory_rows:
        return memory_rows[-MAX_HISTORY_MESSAGES:]

    init_db()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT role, content
            FROM persistent_history
            WHERE session_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (session_id, MAX_HISTORY_MESSAGES),
        ).fetchall()
    restored = [{"role": row["role"], "content": row["content"]} for row in reversed(rows)]
    if restored:
        chat_history[session_id] = restored
    return restored


def remember(session_id: str, role: str, content: str) -> None:
    chat_history.setdefault(session_id, []).append({"role": role, "content": content})
    chat_history[session_id] = chat_history[session_id][-MAX_HISTORY_MESSAGES:]
    init_db()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO persistent_history (session_id, role, content, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, role, content, utc_now()),
        )


def ensure_office_user(user_key: str) -> None:
    init_db()
    key = user_key.strip() or "founder"
    with get_db() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO office_users
                (user_key, display_name, role, token_limit, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (key, key, "member", DEFAULT_TOKEN_LIMIT, utc_now()),
        )


def record_token_usage(
    session_id: str,
    user_key: str,
    area: str,
    model: str,
    response: Any,
) -> None:
    usage = getattr(response, "usage", None)
    prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    total_tokens = int(getattr(usage, "total_tokens", 0) or 0)
    if total_tokens == 0:
        total_tokens = prompt_tokens + completion_tokens

    init_db()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO token_usage
                (session_id, user_key, area, model, prompt_tokens, completion_tokens, total_tokens, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                user_key.strip() or "founder",
                area,
                model,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                utc_now(),
            ),
        )


def token_summary(user_key: str) -> dict[str, Any]:
    init_db()
    key = user_key.strip() or "founder"
    with get_db() as conn:
        user = conn.execute(
            "SELECT * FROM office_users WHERE user_key = ?",
            (key,),
        ).fetchone()
        if user is None:
            ensure_office_user(key)
            user = conn.execute(
                "SELECT * FROM office_users WHERE user_key = ?",
                (key,),
            ).fetchone()
        total = conn.execute(
            """
            SELECT
                COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                COALESCE(SUM(total_tokens), 0) AS total_tokens
            FROM token_usage
            WHERE user_key = ?
            """,
            (key,),
        ).fetchone()
        by_area = conn.execute(
            """
            SELECT area, COALESCE(SUM(total_tokens), 0) AS total_tokens
            FROM token_usage
            WHERE user_key = ?
            GROUP BY area
            ORDER BY total_tokens DESC
            """,
            (key,),
        ).fetchall()

    limit = int(user["token_limit"])
    used = int(total["total_tokens"])
    return {
        "user_key": key,
        "display_name": user["display_name"],
        "role": user["role"],
        "token_limit": limit,
        "used_tokens": used,
        "remaining_tokens": max(limit - used, 0),
        "prompt_tokens": int(total["prompt_tokens"]),
        "completion_tokens": int(total["completion_tokens"]),
        "by_area": [dict(row) for row in by_area],
    }


def _fire_trigger(employee_keys: list[str], task: str, session_id: str) -> None:
    try:
        run_office_command(task, session_id=session_id, user_key="system_trigger")
    except Exception as exc:
        try:
            log_office_event("trigger_error", f"Trigger execution failed", str(exc))
        except Exception:
            pass


def process_event_triggers(event_type: str, combined_detail: str) -> None:
    """Check triggers matching this event and fire agents asynchronously."""
    try:
        init_db()
        now_dt = datetime.now(timezone.utc)
        with get_db() as conn:
            rows = conn.execute(
                """
                SELECT id, trigger_key, employee_keys, task_template, cooldown_minutes, last_triggered_at
                FROM office_triggers
                WHERE enabled = 1 AND (event_type = ? OR event_type = '*')
                  AND (keyword = '' OR ? LIKE '%' || keyword || '%')
                """,
                (event_type, combined_detail),
            ).fetchall()

        for row in rows:
            last = parse_dt(row["last_triggered_at"])
            if last:
                elapsed = (now_dt - last).total_seconds() / 60
                if elapsed < int(row["cooldown_minutes"]):
                    continue
            task = (
                str(row["task_template"])
                .replace("{event_type}", event_type)
                .replace("{detail}", combined_detail[:500])
            )
            try:
                emp_keys = [k for k in json.loads(row["employee_keys"] or "[]") if k in employees]
            except (json.JSONDecodeError, TypeError):
                emp_keys = [EMP_ADMIN]
            if not emp_keys:
                continue
            with get_db() as conn:
                conn.execute(
                    "UPDATE office_triggers SET last_triggered_at = ?, trigger_count = trigger_count + 1 WHERE id = ?",
                    (now_dt.isoformat(), row["id"]),
                )
            session_id = f"trigger-{row['trigger_key']}-{int(now_dt.timestamp())}"
            threading.Thread(
                target=_fire_trigger,
                args=(emp_keys, task, session_id),
                daemon=True,
            ).start()
    except Exception:
        pass


def log_office_event(event_type: str, title: str, detail: str = "") -> None:
    init_db()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO office_events (event_type, title, detail, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (event_type, title[:180], detail[:4000], utc_now()),
        )
    threading.Thread(
        target=process_event_triggers,
        args=(event_type, f"{title}: {detail}"),
        daemon=True,
    ).start()


def get_office_overview(user_key: str = "founder", session_id: str = "default") -> dict[str, Any]:
    init_db()
    with get_db() as conn:
        users = conn.execute(
            """
            SELECT user_key, display_name, role, token_limit, created_at
            FROM office_users
            ORDER BY id ASC
            """
        ).fetchall()
        documents = conn.execute(
            """
            SELECT title, path, category, created_at
            FROM office_documents
            ORDER BY id DESC
            LIMIT 20
            """
        ).fetchall()
        history = conn.execute(
            """
            SELECT session_id, role, content, created_at
            FROM persistent_history
            ORDER BY id DESC
            LIMIT 30
            """
        ).fetchall()
        jobs = conn.execute(
            """
            SELECT id, job_key, title, task, interval_minutes, enabled, last_run_at,
                   next_run_at, last_status, last_result, run_count, created_at
            FROM office_jobs
            ORDER BY enabled DESC, next_run_at ASC
            """
        ).fetchall()
        events = conn.execute(
            """
            SELECT event_type, title, detail, created_at
            FROM office_events
            ORDER BY id DESC
            LIMIT 50
            """
        ).fetchall()
        actions = conn.execute(
            """
            SELECT id, action_type, title, detail, command, risk_level, status,
                   requested_by, approved_at, completed_at, result, created_at
            FROM office_actions
            ORDER BY id DESC
            LIMIT 50
            """
        ).fetchall()
        usage = conn.execute(
            """
            SELECT area, model,
                   COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                   COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                   COALESCE(SUM(total_tokens), 0) AS total_tokens
            FROM token_usage
            GROUP BY area, model
            ORDER BY total_tokens DESC
            LIMIT 20
            """
        ).fetchall()
    return {
        "status": {
            "service": "fizzylush-ai-office",
            "db_path": DB_PATH.as_posix(),
            "session_id": session_id,
            "memory_count": len(get_recent_history(session_id)),
            "auto_office_enabled": (env_value("AUTO_OFFICE_ENABLED") or "1") != "0",
        },
        "user": token_summary(user_key),
        "users": [dict(row) for row in users],
        "documents": [dict(row) for row in documents],
        "history": [dict(row) for row in history],
        "jobs": [dict(row) for row in jobs],
        "events": [dict(row) for row in events],
        "actions": [dict(row) for row in actions],
        "usage": [dict(row) for row in usage],
    }


def search_fashion_market(query: str) -> str:
    """Local dummy market research tool for fizzylush launch planning."""
    return (
        f"[search_fashion_market 결과] 조사 주제: {query}\n"
        "이 결과는 구조화된 내부 리서치 초안이며, 실시간 인터넷 검색 결과는 아닙니다.\n"
        "- 관련 시장: AI 스타일링, 옷장 관리, 패션 커머스, 가상 피팅.\n"
        "- 경쟁/대체재: 코디 추천 앱, 쇼핑몰 스타일 큐레이션, Pinterest/Instagram 탐색 흐름, 가상 피팅 도구.\n"
        "- 고객 문제: 매일 입을 옷 선택, 보유 옷 조합, 어울리는 구매 아이템 찾기, 날씨/상황에 맞는 구매 확신 부족.\n"
        "- fizzylush 차별점: 보유 옷장 기반 추천, 날씨 반영 스타일링, 한국 쇼핑 검색, 피드백 학습, 가상 피팅 연결.\n"
        "- 검증 아이디어: 초기 사용자 20~50명의 주간 코디 추천 재사용률, 저장/공유율, 가상 피팅 사용률, 쇼핑 클릭률 측정.\n"
        "실제 런칭 의사결정에는 실시간 시장 데이터와 사용자 인터뷰를 추가로 연결해야 합니다."
    )


def _project_zip_path() -> Path | None:
    candidates = [
        Path("PJ01.zip"),
        Path("PJ01") / "PJ01.zip",
        Path.cwd().parent / "PJ01.zip",
        Path.home() / "Desktop" / "PJ01.zip",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def analyze_fizzylush_project() -> str:
    """Inspect local fizzylush project signals without extracting the full zip."""
    project_dir = Path("PJ01")
    important_paths = [
        "package.json",
        "App.tsx",
        "src/services/apiProxy.ts",
        "src/services/smartRecommendService.ts",
        "src/screens/RecommendScreen.tsx",
        "src/screens/ShoppingRecommendScreen.tsx",
        "src/screens/VirtualTryOnScreen.tsx",
        "proxy-server/server.mjs",
        "docs/release-readiness-checklist.md",
    ]

    found: list[str] = []
    if project_dir.exists():
        for rel_path in important_paths:
            if (project_dir / rel_path).exists():
                found.append(f"PJ01/{rel_path}")
    else:
        zip_path = _project_zip_path()
        if zip_path:
            with zipfile.ZipFile(zip_path) as archive:
                names = set(archive.namelist())
                for rel_path in important_paths:
                    name = f"PJ01/{rel_path}"
                    if name in names:
                        found.append(name)

    if not found:
        return (
            "[analyze_fizzylush_project 결과] PJ01 프로젝트 파일을 찾지 못했습니다. "
            "ai-office 작업 폴더 안에 PJ01 폴더가 있거나, PJ01.zip을 배치해 주세요."
        )

    return (
        "[analyze_fizzylush_project 결과]\n"
        "감지한 fizzylush 프로젝트 근거:\n"
        + "\n".join(f"- {path}" for path in found)
        + "\n\n추론 가능한 기능:\n"
        "- Expo / React Native 모바일 앱\n"
        "- Firebase 인증, 저장소, 프로필 데이터\n"
        "- OpenAI 기반 코디 추천 흐름\n"
        "- 네이버 쇼핑 추천 프록시\n"
        "- OpenWeather 날씨 맥락\n"
        "- Replicate 가상 피팅 프록시\n"
        "- 릴리즈 준비 문서\n\n"
        "추천 런칭 초점:\n"
        "1. 온보딩 -> 옷장 업로드 -> AI 추천 루프를 안정화합니다.\n"
        "2. 좋아요/별로 피드백으로 추천 만족도를 측정합니다.\n"
        "3. 쇼핑 추천은 첫 수익원이 아니라 수요 테스트로 둡니다.\n"
        "4. 가상 피팅은 코어 리텐션 검증 후 프리미엄 기능으로 강화합니다."
    )


def create_launch_checklist(stage: str = "mvp") -> str:
    """Create a fizzylush launch checklist."""
    return (
        f"[create_launch_checklist 결과] 단계: {stage}\n"
        "1. 제품 준비\n"
        "- 온보딩, 로그인, 옷장 업로드, AI 추천, 추천 기록, 피드백 흐름을 확인합니다.\n"
        "- OpenAI/Naver/Weather/Replicate API가 실패해도 사용자에게 자연스러운 오류 안내가 나오는지 확인합니다.\n"
        "- 데모 옷장 10개와 현실적인 테스트 시나리오 30개를 준비합니다.\n\n"
        "2. 사업 준비\n"
        "- 핵심 타깃을 정의합니다: 매일 코디 선택이 번거로운 패션 관심 사용자.\n"
        "- 첫 포지셔닝은 '내 옷장 기반 AI 코디 추천'으로 고정합니다.\n"
        "- 가격 가설을 준비합니다: 핵심 기능 무료, 고급 스타일링/가상 피팅은 추후 프리미엄.\n\n"
        "3. 마케팅 준비\n"
        "- 앱스토어 문구, 스크린샷 5장, 데모 영상 1개, SNS 게시물 14개를 만듭니다.\n"
        "- 지인, 대학/커뮤니티, 패션 커뮤니티에서 베타 사용자 30명을 모집합니다.\n"
        "- 사용자 인터뷰와 피드백 수집 폼을 준비합니다.\n\n"
        "4. 지표\n"
        "- 활성화: 첫 옷장 아이템 업로드 완료율\n"
        "- 핵심 가치: 첫 AI 코디 추천 저장 또는 좋아요 비율\n"
        "- 리텐션: D1/D7 재방문, 주간 추천 사용\n"
        "- 수익 신호: 쇼핑 클릭, 가상 피팅 관심, 프리미엄 설문 응답\n\n"
        "5. 창업자 승인 필요\n"
        "- 스토어 제출, 유료 광고, 공개 PR, 법적 정책 게시, 운영 DB 변경은 창업자 승인 후 진행합니다."
    )


def save_business_doc(filename: str, content: str) -> str:
    """Save fizzylush business output as a local text/markdown document."""
    safe_name = Path(filename).name or "fizzylush_doc.md"
    if not safe_name.endswith((".txt", ".md")):
        safe_name += ".md"

    output_dir = Path("generated_files") / "fizzylush"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / safe_name
    output_path.write_text(content, encoding="utf-8")
    init_db()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO office_documents (title, path, category, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (safe_name, output_path.as_posix(), "fizzylush", utc_now()),
        )

    return f"[save_business_doc 결과] fizzylush 문서를 저장했습니다: {output_path.as_posix()}"


def think(thought: str) -> str:
    """Record a reasoning/planning step before acting."""
    return f"[Thought recorded] {thought}"


def mark_complete(summary: str) -> str:
    """Signal that the task is complete with a summary."""
    return f"[TASK_COMPLETE] {summary}"


def read_project_file(path: str) -> str:
    """Read a file from the fizzylush project to understand current code state."""
    normalized = Path(path).as_posix().lstrip("/")
    if ".." in normalized:
        return f"[read_project_file 오류] 접근 불가 경로: {path}"
    safe_prefixes = (
        "PJ01/src/", "PJ01/docs/", "PJ01/package.json", "PJ01/app.json",
        "PJ01/eas.json", "server.py", "requirements.txt",
    )
    if not any(normalized.startswith(p) for p in safe_prefixes):
        return f"[read_project_file 오류] 허용되지 않는 경로: {path}"
    file_path = Path(normalized)
    if not file_path.exists():
        return f"[read_project_file 오류] 파일 없음: {path}"
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        if len(content) > 8000:
            content = content[:8000] + "\n...(너무 길어 잘렸습니다)"
        return f"[read_project_file 결과] {path}\n\n{content}"
    except Exception as exc:
        return f"[read_project_file 오류] {exc}"


def save_memory(key: str, value: str) -> str:
    """중요한 정보를 장기 메모리에 저장합니다. 세션이 바뀌어도 유지됩니다."""
    safe_key = key.strip()[:120]
    safe_val = value.strip()[:4000]
    if not safe_key:
        return "[save_memory 오류] key가 비어있습니다."
    init_db()
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO office_memory (key, value, updated_at) VALUES (?, ?, ?)",
            (safe_key, safe_val, utc_now()),
        )
    return f"[save_memory] '{safe_key}' 저장 완료."


def load_memories(query: str = "") -> str:
    """저장된 장기 메모리를 불러옵니다. query로 필터링 가능."""
    init_db()
    with get_db() as conn:
        if query.strip():
            rows = conn.execute(
                "SELECT key, value, updated_at FROM office_memory WHERE key LIKE ? OR value LIKE ? ORDER BY updated_at DESC LIMIT 15",
                (f"%{query}%", f"%{query}%"),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT key, value, updated_at FROM office_memory ORDER BY updated_at DESC LIMIT 15"
            ).fetchall()
    if not rows:
        return "[load_memories] 저장된 메모리가 없습니다."
    lines = [f"[{r['updated_at'][:10]}] {r['key']}: {r['value'][:200]}" for r in rows]
    return "[저장된 메모리]\n" + "\n".join(lines)


def search_web(query: str) -> str:
    """Search the web for real-time information. Uses DuckDuckGo instant + HTML fallback."""
    results: list[str] = []

    # ① DuckDuckGo Instant Answer API
    try:
        params = urllib.parse.urlencode({"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"})
        req = urllib.request.Request(
            f"https://api.duckduckgo.com/?{params}",
            headers={"User-Agent": "Mozilla/5.0 fizzylush-ai-office/1.0"},
        )
        with urllib.request.urlopen(req, timeout=8) as res:
            data = json.loads(res.read().decode("utf-8"))
        abstract = (data.get("AbstractText") or "").strip()
        if abstract:
            results.append(f"[요약] {abstract[:400]}")
        for item in (data.get("RelatedTopics") or [])[:4]:
            if isinstance(item, dict) and item.get("Text"):
                results.append(f"- {str(item['Text'])[:220]}")
    except Exception:
        pass

    # ② DuckDuckGo HTML 검색 결과 파싱 (fallback)
    if not results:
        try:
            enc_q = urllib.parse.quote_plus(query)
            req2 = urllib.request.Request(
                f"https://html.duckduckgo.com/html/?q={enc_q}",
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept-Language": "ko-KR,ko;q=0.9",
                },
            )
            with urllib.request.urlopen(req2, timeout=10) as res:
                html = res.read().decode("utf-8", errors="ignore")
            # 간단한 텍스트 추출 (result__snippet 클래스)
            import re as _re
            snippets = _re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', html, _re.S)
            for s in snippets[:5]:
                clean = _re.sub(r"<[^>]+>", "", s).strip()
                if clean:
                    results.append(f"- {clean[:220]}")
        except Exception:
            pass

    if not results:
        return f"[search_web] '{query}' — 검색 결과를 가져오지 못했습니다. 다른 키워드로 시도해보세요."
    return f"[search_web 결과] 검색어: '{query}'\n" + "\n".join(results[:6])


def propose_office_action(
    action_type: str,
    title: str,
    detail: str,
    command: str = "",
    risk_level: str = "medium",
) -> str:
    """Create an approval-gated execution action for development, deploy, ads, store, legal, or data work."""
    safe_type = (action_type or "general").strip()[:60]
    safe_risk = (risk_level or "medium").strip().lower()
    if safe_risk not in {"low", "medium", "high", "critical"}:
        safe_risk = "medium"
    status = "ready" if safe_risk == "low" and safe_type in {"code", "test", "build", "doc"} else "pending_approval"
    init_db()
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO office_actions
                (action_type, title, detail, command, risk_level, status, requested_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                safe_type,
                title.strip()[:180] or "Untitled action",
                detail.strip()[:8000],
                command.strip()[:2000],
                safe_risk,
                status,
                "ai_employee",
                utc_now(),
            ),
        )
        action_id = cur.lastrowid
    log_office_event("action_proposed", f"Action #{action_id}: {title}", f"{safe_type} / {safe_risk}")
    return f"[propose_office_action result] Action #{action_id} created with status={status}, type={safe_type}, risk={safe_risk}."


_thread_local = threading.local()


def ask_colleague(colleague_key: str, question: str) -> str:
    """Ask another employee a specific question. Used for inter-agent collaboration."""
    if colleague_key not in employees:
        return f"[ask_colleague 오류] 존재하지 않는 직원 키: {colleague_key}. 사용 가능: {list(employees.keys())}"
    depth = getattr(_thread_local, "colleague_depth", 0)
    if depth >= 1:
        return "[ask_colleague] 이미 동료 호출 중입니다. 재귀 호출은 허용되지 않습니다."
    _thread_local.colleague_depth = depth + 1
    try:
        result, _ = run_employee(
            emp_key=colleague_key,
            task=question,
            current_context=question,
            history=[],
            session_id="colleague_internal",
            user_key="system",
        )
    finally:
        _thread_local.colleague_depth = depth
    emp = employees[colleague_key]
    return f"[{emp['name']}({emp['role']}) 답변]\n{result[:3000]}"


tool_definitions = [
    {
        "type": "function",
        "function": {
            "name": "think",
            "description": "Record your reasoning and planning before taking action. Use this before every action to think step by step.",
            "parameters": {
                "type": "object",
                "properties": {
                    "thought": {"type": "string", "description": "Your reasoning, analysis, or next-step plan."},
                },
                "required": ["thought"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mark_complete",
            "description": "Signal that the task is fully complete. Call this only when all work is done.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "Summary of everything accomplished."},
                },
                "required": ["summary"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_project_file",
            "description": "Read a source file from the fizzylush project to understand the current code state before suggesting changes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path, e.g. 'PJ01/src/screens/HomeScreen.tsx' or 'server.py'."},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the web for real-time information about competitors, market trends, technologies, or any topic.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query."},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ask_colleague",
            "description": "Ask another employee a specific question to collaborate. Use when you need expertise from a different role.",
            "parameters": {
                "type": "object",
                "properties": {
                    "colleague_key": {
                        "type": "string",
                        "description": f"Employee key to ask. Options: {list(employees.keys()) if employees else '기획,리서치,번역,분석,총무,개발,검수,배포,집행,법무'}",
                    },
                    "question": {
                        "type": "string",
                        "description": "The specific question or sub-task for the colleague.",
                    },
                },
                "required": ["colleague_key", "question"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_fashion_market",
            "description": "Fizzylush launch research helper for fashion, AI styling, shopping, and competitor context. Dummy structured research, not live internet.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Market, competitor, user, or launch research question.",
                    },
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_fizzylush_project",
            "description": "Inspect available fizzylush project files or PJ01.zip and summarize app capabilities and launch implications.",
            "parameters": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_launch_checklist",
            "description": "Create a practical fizzylush launch checklist for MVP, beta, app store, or growth stage.",
            "parameters": {
                "type": "object",
                "properties": {
                    "stage": {
                        "type": "string",
                        "description": "Launch stage, for example mvp, beta, app_store, growth.",
                    },
                },
                "required": ["stage"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_business_doc",
            "description": "Save a fizzylush launch, business, marketing, or product document locally as .txt or .md.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "Document filename, for example fizzylush_launch_plan.md.",
                    },
                    "content": {
                        "type": "string",
                        "description": "Document content to save.",
                    },
                },
                "required": ["filename", "content"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_memory",
            "description": "Save important information to long-term memory. Persists across sessions. Use for key decisions, user preferences, project context, or anything worth remembering.",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "Short memorable key, e.g. '마케팅_전략_2025Q2'"},
                    "value": {"type": "string", "description": "The information to remember."},
                },
                "required": ["key", "value"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "load_memories",
            "description": "Retrieve stored long-term memories. Use at the start of tasks to recall past context. Filter by keyword.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Filter keyword. Leave blank to get all memories."},
                },
                "required": [],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_office_action",
            "description": "Create an approval-gated action for code changes, tests, builds, deploys, store submissions, ads, customer messages, legal review, or production data changes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action_type": {
                        "type": "string",
                        "description": "One of code, test, build, deploy, store_submit, ads, customer_message, legal, data, doc, general.",
                    },
                    "title": {
                        "type": "string",
                        "description": "Short action title.",
                    },
                    "detail": {
                        "type": "string",
                        "description": "Detailed action plan, acceptance criteria, risks, and owner notes.",
                    },
                    "command": {
                        "type": "string",
                        "description": "Optional shell command or operational instruction. Leave blank if not applicable.",
                    },
                    "risk_level": {
                        "type": "string",
                        "description": "low, medium, high, or critical.",
                    },
                },
                "required": ["action_type", "title", "detail", "risk_level"],
                "additionalProperties": False,
            },
        },
    },
]


available_functions = {
    "think": think,
    "mark_complete": mark_complete,
    "ask_colleague": ask_colleague,
    "read_project_file": read_project_file,
    "search_web": search_web,
    "search_fashion_market": search_fashion_market,
    "analyze_fizzylush_project": analyze_fizzylush_project,
    "create_launch_checklist": create_launch_checklist,
    "save_business_doc": save_business_doc,
    "propose_office_action": propose_office_action,
    "save_memory": save_memory,
    "load_memories": load_memories,
}


def run_tool_call(function_name: str, arguments: dict[str, Any]) -> str:
    function_to_call = available_functions.get(function_name)
    if function_to_call is None:
        return f"[tool error] Unknown function: {function_name}"

    try:
        return function_to_call(**arguments)
    except Exception as exc:
        return f"[tool error] Failed to run {function_name}: {exc}"


def parse_task_sequence(raw_content: str | None) -> list[str]:
    groups = parse_task_groups(raw_content)
    return [key for group in groups for key in group]


def parse_task_groups(raw_content: str | None) -> list[list[str]]:
    """Parse manager output into parallel groups. Supports both flat and grouped formats."""
    if not raw_content:
        return [[EMP_PLANNING]]
    try:
        parsed = json.loads(raw_content)
    except json.JSONDecodeError:
        return [[EMP_PLANNING]]
    if not isinstance(parsed, list):
        return [[EMP_PLANNING]]
    groups: list[list[str]] = []
    for item in parsed:
        if isinstance(item, list):
            valid = [k for k in item if k in employees]
            if valid:
                groups.append(valid)
        elif isinstance(item, str) and item in employees:
            groups.append([item])
    return groups or [[EMP_PLANNING]]


EVAL_PASS_THRESHOLD = 6
EVAL_MAX_RETRIES = 1  # 최대 1회 재시도 (총 2회 시도)


def evaluate_result(emp_key: str, task: str, result: str) -> dict[str, Any]:
    """Evaluate the quality of an employee's work. Returns pass/fail, score, feedback."""
    client = get_openai_client()
    emp = employees[emp_key]
    eval_prompt = (
        f"당신은 AI 직원 작업 결과를 평가하는 품질 검사관입니다.\n\n"
        f"직원 역할: {emp['role']}\n"
        f"원래 명령: {task[:500]}\n"
        f"작업 결과: {result[:2000]}\n\n"
        "다음 기준으로 1~10점 평가하세요:\n"
        "1. 명령에 직접 응답했는가 (관련성)\n"
        "2. 결과가 구체적이고 실행 가능한가 (구체성)\n"
        "3. 한국어로 작성됐는가 (언어)\n"
        "4. 내용이 충분한가 (완성도)\n"
        "5. 검증 안 된 주장에 '검증 필요'를 붙였는가 (정확성)\n\n"
        '{"passed": true/false, "score": 1-10, "feedback": "개선점 (통과 시 빈 문자열)"} 형식으로만 응답하세요.'
    )
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": eval_prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content or "{}")
        score = int(data.get("score", 7))
        return {
            "passed": score >= EVAL_PASS_THRESHOLD,
            "score": score,
            "feedback": str(data.get("feedback", "")),
        }
    except Exception:
        return {"passed": True, "score": 7, "feedback": ""}


def run_employee_with_eval(
    emp_key: str,
    task: str,
    current_context: str,
    history: list[dict[str, str]],
    session_id: str,
    user_key: str,
) -> tuple[str, list[dict[str, str]], list[dict[str, Any]]]:
    """Run an employee with automatic quality evaluation and retry on failure."""
    eval_logs: list[dict[str, Any]] = []
    ctx = current_context
    result = ""
    all_tool_logs: list[dict[str, str]] = []

    for attempt in range(EVAL_MAX_RETRIES + 1):
        result, tool_logs = run_employee(emp_key, task, ctx, history, session_id, user_key)
        all_tool_logs.extend(tool_logs)

        evaluation = evaluate_result(emp_key, task, result)
        eval_logs.append({
            "employee": employees[emp_key]["name"],
            "role": employees[emp_key]["role"],
            "attempt": attempt + 1,
            "score": evaluation["score"],
            "passed": evaluation["passed"],
            "feedback": evaluation["feedback"],
        })

        if evaluation["passed"] or attempt == EVAL_MAX_RETRIES:
            break

        ctx = (
            f"{current_context}\n\n"
            f"[재작업 요청 — 시도 {attempt + 1} 품질 미달 (점수: {evaluation['score']}/10)]\n"
            f"개선 필요: {evaluation['feedback']}\n"
            "위 피드백을 반드시 반영해 더 구체적이고 실행 가능한 결과를 작성하세요."
        )

    return result, all_tool_logs, eval_logs


def synthesize_parallel_results(task: str, results: dict[str, str]) -> str:
    """Merge results from parallel employees into one coherent report."""
    client = get_openai_client()
    combined = "\n\n".join(
        f"### {employees[k]['name']} ({employees[k]['role']}):\n{v}"
        for k, v in results.items()
    )
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": (
                f"다음은 여러 AI 직원들이 동시에 수행한 작업 결과입니다.\n"
                f"원래 명령: {task}\n\n{combined}\n\n"
                "위 결과들을 하나의 통합 보고서로 합쳐주세요. "
                "중복은 제거하고 각 직원의 핵심 기여를 보존하세요. 한국어로 작성하세요."
            ),
        }],
    )
    return response.choices[0].message.content or combined


def run_employees_parallel(
    emp_keys: list[str],
    task: str,
    current_context: str,
    history: list[dict[str, str]],
    session_id: str,
    user_key: str,
) -> tuple[str, list[dict[str, str]], list[dict[str, Any]]]:
    """Run a group of employees in parallel with evaluation, then synthesize results."""
    if len(emp_keys) == 1:
        return run_employee_with_eval(emp_keys[0], task, current_context, history, session_id, user_key)

    all_tool_logs: list[dict[str, str]] = []
    all_eval_logs: list[dict[str, Any]] = []
    results: dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=len(emp_keys)) as executor:
        futures = {
            executor.submit(run_employee_with_eval, key, task, current_context, history, session_id, user_key): key
            for key in emp_keys
        }
        for future in as_completed(futures):
            key = futures[future]
            try:
                result, tool_logs, eval_logs = future.result()
                results[key] = result
                all_tool_logs.extend(tool_logs)
                all_eval_logs.extend(eval_logs)
            except Exception as exc:
                results[key] = f"[오류] {exc}"

    synthesized = synthesize_parallel_results(task, results)
    return synthesized, all_tool_logs, all_eval_logs


def quick_route(task: str) -> list[list[str]] | None:
    normalized = task.lower()
    if any(word in normalized for word in ["code", "bug", "fix", "dev", "develop"]):
        return [[EMP_DEVELOPMENT, EMP_QA]]
    if any(word in normalized for word in ["test", "qa", "lint", "build"]):
        return [[EMP_QA, EMP_DEVELOPMENT]]
    if any(word in normalized for word in ["deploy", "release", "eas", "store", "submit", "upload"]):
        return [[EMP_DEPLOYMENT, EMP_QA], [EMP_ADMIN]]
    if any(word in normalized for word in ["ads", "campaign", "customer", "message", "growth"]):
        return [[EMP_GROWTH, EMP_TRANSLATION], [EMP_ANALYSIS]]
    if any(word in normalized for word in ["legal", "privacy", "terms", "policy", "compliance"]):
        return [[EMP_LEGAL, EMP_ADMIN]]
    if any(word in normalized for word in ["status", "summary"]):
        return [[EMP_ANALYSIS]]
    if any(word in normalized for word in ["save", "checklist", "document"]):
        return [[EMP_ADMIN]]
    return None


def ask_manager(task: str, history: list[dict[str, str]], session_id: str, user_key: str) -> list[list[str]]:
    routed = quick_route(task)
    if routed is not None:
        return routed

    client = get_openai_client()
    employee_keys = list(employees.keys())
    router_prompt = f"""
{FIZZYLUSH_CONTEXT}

You are the work-routing manager AI for the fizzylush founder office.
Analyze the user command and conversation context.
Choose which employees should work and in what order.

Employee keys: {employee_keys}

Routing guidance:
- Launch strategy, roadmap, MVP, business model: include {EMP_PLANNING}.
- Market, competitors, target users, shopping trends: include {EMP_RESEARCH}.
- App store copy, SNS, ads, translation, pitch wording: include {EMP_TRANSLATION}.
- KPIs, risks, funnels, project review, experiments: include {EMP_ANALYSIS}.
- Checklists, saved documents, operations, release prep: include {EMP_ADMIN}.
- Code edits, bug fixes, technical implementation: include {EMP_DEVELOPMENT} and {EMP_QA}.
- Tests, lint, builds, release verification: include {EMP_QA}.
- EAS, Firebase, backend deploys, store upload preparation: include {EMP_DEPLOYMENT}.
- Paid ads, customer messages, campaign execution: include {EMP_GROWTH}.
- Privacy, terms, compliance, legal publication: include {EMP_LEGAL}.
- Execution rule: code/test/build actions may be proposed. Deploys, store submissions, ads, customer messages, legal publication, credential changes, and production data changes must be proposed through approval-gated actions.
- For broad launch requests, use:
  ["{EMP_RESEARCH}", "{EMP_PLANNING}", "{EMP_DEVELOPMENT}", "{EMP_QA}", "{EMP_ANALYSIS}", "{EMP_TRANSLATION}", "{EMP_DEPLOYMENT}", "{EMP_GROWTH}", "{EMP_LEGAL}", "{EMP_ADMIN}"].

Rules:
- Output only a JSON array of groups. Each group is an array of employee keys that can run IN PARALLEL.
- Groups run sequentially in order, but employees within the same group run in parallel.
- Put independent employees (who don't need each other's output) in the same group.
- Put dependent employees (who need previous results) in separate groups.
- Use only keys from the employee list.
- Do not write markdown, code fences, or explanations.
- Example: [["리서치", "기획"], ["분석"], ["총무"]] means 리서치+기획 run in parallel first, then 분석, then 총무.
"""

    messages = [
        {"role": "system", "content": router_prompt},
        *history,
        {"role": "user", "content": task},
    ]

    model = "gpt-4o-mini"
    router_res = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0,
    )
    record_token_usage(session_id, user_key, "manager_routing", model, router_res)
    return parse_task_groups(router_res.choices[0].message.content)


REACT_INSTRUCTIONS = """
작업 방식 — ReAct 패턴 (Reasoning + Acting):
1. 행동 전 반드시 think 툴로 무엇을 할지 먼저 생각하세요.
2. 필요한 툴을 호출해 실제 작업을 실행하세요.
3. 툴 결과를 확인하고 다음 단계를 계획하세요.
4. 필요하면 read_project_file로 실제 코드를 읽고, search_web으로 실시간 정보를 조회하세요.
5. 모든 작업이 완료되면 mark_complete를 호출하세요.

한 번에 끝내려 하지 말고, 단계적으로 생각하며 실행하세요.
"""

REACT_MAX_ITERATIONS = 10


def run_employee(
    emp_key: str,
    task: str,
    current_context: str,
    history: list[dict[str, str]],
    session_id: str,
    user_key: str,
) -> tuple[str, list[dict[str, str]]]:
    client = get_openai_client()
    emp = employees[emp_key]
    tool_logs: list[dict[str, str]] = []

    # Pull relevant long-term memories to give employee context
    memories_context = load_memories(task[:60])
    memory_section = f"\n[장기 메모리]\n{memories_context}" if "없습니다" not in memories_context else ""

    work_prompt = f"""
Original user command:
{task}

Previous employee result or current context:
{current_context}{memory_section}

{REACT_INSTRUCTIONS}

Available tools:
- think: 행동 전 추론 기록 (필수)
- mark_complete: 작업 완료 신호
- read_project_file: 실제 프로젝트 파일 읽기
- search_web: 실시간 웹 검색
- search_fashion_market: 패션 시장 리서치
- analyze_fizzylush_project: 앱 구조 분석
- create_launch_checklist: 런칭 체크리스트
- save_business_doc: 문서 저장
- ask_colleague: 다른 직원에게 질문/협업 요청
- propose_office_action: 승인 필요 액션 등록
- save_memory: 중요한 정보를 장기 메모리에 저장 (세션 간 유지)
- load_memories: 저장된 장기 메모리 조회

Guardrail:
실제 배포, 유료 광고, 고객 메시지, 법적 게시, 프로덕션 DB 변경은 창업자 승인 필요.

최종 보고 형식:
1. 실제 완료
2. 준비된 초안/제안
3. 승인 필요
4. 다음 실행

Always answer in Korean.
"""

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": emp["system_prompt"]},
        *history,
        {"role": "user", "content": work_prompt},
    ]

    model = EMP_MODELS.get(emp_key, "gpt-4o-mini")
    completed = False

    for iteration in range(REACT_MAX_ITERATIONS):
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tool_definitions,
            tool_choice="auto",
        )
        record_token_usage(session_id, user_key, EMP_AREA.get(emp_key, "employee_unknown"), model, response)
        message = response.choices[0].message

        if not message.tool_calls:
            return message.content or "", tool_logs

        messages.append(message.model_dump(exclude_none=True))

        for tool_call in message.tool_calls:
            function_name = tool_call.function.name
            try:
                arguments = json.loads(tool_call.function.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}

            if function_name == "mark_complete":
                completed = True

            tool_result = run_tool_call(function_name, arguments)

            if function_name != "think":
                tool_logs.append({
                    "employee": emp["name"],
                    "function": function_name,
                    "arguments": json.dumps(arguments, ensure_ascii=False),
                    "result": tool_result,
                })

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": tool_result,
            })

        if completed:
            messages.append({"role": "user", "content": "작업이 완료됐습니다. 최종 결과를 한국어로 정리해주세요."})
            final_res = client.chat.completions.create(model=model, messages=messages)
            record_token_usage(session_id, user_key, EMP_AREA.get(emp_key, "employee_unknown"), model, final_res)
            return final_res.choices[0].message.content or "", tool_logs

    return "최대 반복 횟수에 도달했습니다. 더 구체적인 명령을 입력해주세요.", tool_logs


def run_office_command(task: str, session_id: str = "default", user_key: str = "founder") -> dict[str, Any]:
    ensure_office_user(user_key)
    history = get_recent_history(session_id)
    task_groups = ask_manager(task, history, session_id, user_key)

    current_context = task
    worked_employees: list[str] = []
    all_tool_logs: list[dict[str, str]] = []
    all_eval_logs: list[dict[str, Any]] = []
    execution_plan: list[list[str]] = []

    for group in task_groups:
        group_names = [employees[k]["name"] for k in group]
        worked_employees.extend(group_names)
        execution_plan.append(group_names)

        current_context, tool_logs, eval_logs = run_employees_parallel(
            emp_keys=group,
            task=task,
            current_context=current_context,
            history=history,
            session_id=session_id,
            user_key=user_key,
        )
        all_tool_logs.extend(tool_logs)
        all_eval_logs.extend(eval_logs)

    remember(session_id, "user", task)
    remember(session_id, "assistant", current_context)

    return {
        "session_id": session_id,
        "employee": " -> ".join(
            f"[{'+'.join(g)}]" if len(g) > 1 else g[0] for g in execution_plan
        ),
        "task_groups": execution_plan,
        "role": "\uc791\uc5c5 \ud504\ub85c\uc81d\ud2b8",
        "result": current_context,
        "tool_logs": all_tool_logs,
        "evaluation_logs": all_eval_logs,
        "memory_count": len(chat_history.get(session_id, [])),
        "token_summary": token_summary(user_key),
    }


@app.post("/command", dependencies=[Depends(_verify_office_token)])
def command(req: CommandRequest):
    result = run_office_command(req.task, req.session_id, req.user_key)
    log_office_event("manual_command", "Manual command processed", req.task)
    return result


def run_office_job(job_id: int, force: bool = False) -> dict[str, Any]:
    init_db()
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT id, job_key, title, task, interval_minutes, enabled, next_run_at
            FROM office_jobs
            WHERE id = ?
            """,
            (job_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Office job not found")
    if not force and not int(row["enabled"]):
        return {"ok": False, "skipped": True, "reason": "disabled", "job": dict(row)}

    title = str(row["title"])
    task = str(row["task"])
    session_id = f"auto-{row['job_key']}"
    log_office_event("auto_job_started", title, task)
    try:
        result = run_office_command(task, session_id=session_id, user_key="founder")
        status = "success"
        result_text = str(result.get("result") or "")
        log_office_event("auto_job_processed", title, result_text)
    except Exception as exc:
        status = "error"
        result_text = str(exc)
        log_office_event("auto_job_failed", title, result_text)
        result = {"error": result_text}

    now_dt = datetime.now(timezone.utc)
    next_dt = now_dt + timedelta(minutes=max(5, int(row["interval_minutes"] or 1440)))
    with get_db() as conn:
        conn.execute(
            """
            UPDATE office_jobs
            SET last_run_at = ?, next_run_at = ?, last_status = ?,
                last_result = ?, run_count = run_count + 1
            WHERE id = ?
            """,
            (now_dt.isoformat(), next_dt.isoformat(), status, result_text[:8000], job_id),
        )
    return {"ok": status == "success", "status": status, "result": result}


def run_due_office_jobs() -> None:
    init_db()
    now_dt = datetime.now(timezone.utc)
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, next_run_at
            FROM office_jobs
            WHERE enabled = 1
            ORDER BY next_run_at ASC
            LIMIT 3
            """
        ).fetchall()
    for row in rows:
        next_run = parse_dt(row["next_run_at"])
        if next_run and next_run <= now_dt:
            run_office_job(int(row["id"]))


def auto_office_loop() -> None:
    time.sleep(3)
    while True:
        try:
            run_due_office_jobs()
        except Exception as exc:
            try:
                log_office_event("auto_worker_error", "Auto office worker error", str(exc))
            except Exception:
                pass
        time.sleep(AUTO_OFFICE_POLL_SECONDS)


@app.get("/history/{session_id}")
def get_history(session_id: str):
    return {
        "session_id": session_id,
        "history": chat_history.get(session_id, []),
    }


@app.delete("/history/{session_id}")
def clear_history(session_id: str):
    chat_history.pop(session_id, None)
    init_db()
    with get_db() as conn:
        conn.execute("DELETE FROM persistent_history WHERE session_id = ?", (session_id,))
    return {
        "session_id": session_id,
        "cleared": True,
    }


@app.post("/office/users")
def upsert_office_user(req: OfficeUserRequest):
    init_db()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO office_users (user_key, display_name, role, token_limit, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_key) DO UPDATE SET
                display_name = excluded.display_name,
                role = excluded.role,
                token_limit = excluded.token_limit
            """,
            (
                req.user_key.strip(),
                req.display_name.strip(),
                req.role.strip() or "member",
                req.token_limit,
                utc_now(),
            ),
        )
    return {"ok": True, "user": token_summary(req.user_key)}


@app.get("/office/users")
def list_office_users():
    init_db()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT user_key, display_name, role, token_limit, created_at
            FROM office_users
            ORDER BY id ASC
            """
        ).fetchall()
    return {"users": [dict(row) for row in rows]}


@app.get("/office/tokens/{user_key}")
def get_office_tokens(user_key: str):
    return token_summary(user_key)


@app.get("/office/sessions/{session_id}/tokens")
def get_session_tokens(session_id: str):
    init_db()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT area, model,
                   COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                   COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
                   COALESCE(SUM(total_tokens), 0) AS total_tokens
            FROM token_usage
            WHERE session_id = ?
            GROUP BY area, model
            ORDER BY total_tokens DESC
            """,
            (session_id,),
        ).fetchall()
    return {"session_id": session_id, "usage": [dict(row) for row in rows]}


@app.get("/office/overview")
def office_overview(user_key: str = "founder", session_id: str = "default"):
    return get_office_overview(user_key, session_id)


@app.get("/office/history")
def list_office_history(limit: int = 50):
    safe_limit = max(1, min(200, int(limit or 50)))
    init_db()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT session_id, role, content, created_at
            FROM persistent_history
            ORDER BY id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    return {"history": [dict(row) for row in rows]}


@app.get("/office/jobs")
def list_office_jobs():
    init_db()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, job_key, title, task, interval_minutes, enabled, last_run_at,
                   next_run_at, last_status, last_result, run_count, created_at
            FROM office_jobs
            ORDER BY enabled DESC, next_run_at ASC
            """
        ).fetchall()
    return {"jobs": [dict(row) for row in rows]}


@app.post("/office/jobs/{job_id}/run", dependencies=[Depends(_verify_office_token)])
def run_office_job_now(job_id: int):
    return run_office_job(job_id, force=True)


@app.post("/office/jobs/{job_id}/toggle")
def toggle_office_job(job_id: int, enabled: bool = True):
    init_db()
    with get_db() as conn:
        row = conn.execute("SELECT id FROM office_jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Office job not found")
        conn.execute("UPDATE office_jobs SET enabled = ? WHERE id = ?", (1 if enabled else 0, job_id))
    log_office_event("auto_job_toggle", f"Job {job_id} {'enabled' if enabled else 'disabled'}")
    return {"ok": True, "id": job_id, "enabled": enabled}


@app.get("/office/events")
def list_office_events(limit: int = 50):
    safe_limit = max(1, min(200, int(limit or 50)))
    init_db()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT event_type, title, detail, created_at
            FROM office_events
            ORDER BY id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    return {"events": [dict(row) for row in rows]}


@app.get("/office/actions")
def list_office_actions(limit: int = 100):
    safe_limit = max(1, min(300, int(limit or 100)))
    init_db()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, action_type, title, detail, command, risk_level, status,
                   requested_by, approved_at, completed_at, result, created_at
            FROM office_actions
            ORDER BY id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    return {"actions": [dict(row) for row in rows]}


_ACTION_TYPE_TO_EMPLOYEE: dict[str, str] = {
    "code": EMP_DEVELOPMENT,
    "test": EMP_DEVELOPMENT,
    "build": EMP_DEPLOYMENT,
    "deploy": EMP_DEPLOYMENT,
    "store_submit": EMP_DEPLOYMENT,
    "ads": EMP_GROWTH,
    "customer_message": EMP_GROWTH,
    "legal": EMP_LEGAL,
    "data": EMP_ANALYSIS,
    "doc": EMP_PLANNING,
    "general": EMP_PLANNING,
}


def _execute_approved_action(action_id: int, action_type: str, title: str, detail: str, command: str) -> None:
    """Background thread: runs the appropriate AI employee to produce a real result for the approved action."""
    emp_key = _ACTION_TYPE_TO_EMPLOYEE.get(action_type, EMP_PLANNING)
    task = (
        f"[승인된 액션 실행]\n"
        f"액션 유형: {action_type}\n"
        f"제목: {title}\n"
        f"상세 내용:\n{detail}\n"
        + (f"\n실행 명령/지시:\n{command}" if command else "")
        + "\n\n위 내용을 실제로 실행하거나 구체적인 결과물을 작성하세요. "
        "코드라면 실제 코드를, 문서라면 완성된 문서를, 계획이라면 즉시 실행 가능한 단계별 계획을 제공하세요."
    )
    try:
        result, _tool_logs = run_employee(emp_key, task, detail, [], f"action_{action_id}", "system")
        with get_db() as conn:
            conn.execute(
                "UPDATE office_actions SET status = 'completed', completed_at = ?, result = ? WHERE id = ?",
                (utc_now(), result[:4000], action_id),
            )
        log_office_event("action_executed", f"Action #{action_id} executed by {employees[emp_key]['name']}", result[:300])
    except Exception as exc:
        with get_db() as conn:
            conn.execute(
                "UPDATE office_actions SET status = 'failed', result = ? WHERE id = ?",
                (f"실행 오류: {exc}", action_id),
            )
        log_office_event("action_failed", f"Action #{action_id} execution failed: {exc}")


@app.post("/office/actions/{action_id}/approve")
def approve_office_action(action_id: int):
    init_db()
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, action_type, title, detail, command FROM office_actions WHERE id = ?",
            (action_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Office action not found")
        conn.execute(
            "UPDATE office_actions SET status = 'executing', approved_at = ? WHERE id = ?",
            (utc_now(), action_id),
        )
    log_office_event("action_approved", f"Action #{action_id} approved — executing now")
    t = threading.Thread(
        target=_execute_approved_action,
        args=(row["id"], row["action_type"], row["title"], row["detail"], row["command"] or ""),
        daemon=True,
    )
    t.start()
    return {"ok": True, "id": action_id, "status": "executing", "message": "승인 완료. AI 직원이 실행 중입니다."}


@app.post("/office/actions/{action_id}/complete")
def complete_office_action(action_id: int, result: str = ""):
    init_db()
    with get_db() as conn:
        row = conn.execute("SELECT id FROM office_actions WHERE id = ?", (action_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Office action not found")
        conn.execute(
            """
            UPDATE office_actions
            SET status = 'completed', completed_at = ?, result = ?
            WHERE id = ?
            """,
            (utc_now(), result[:4000], action_id),
        )
    log_office_event("action_completed", f"Action #{action_id} completed", result)
    return {"ok": True, "id": action_id, "status": "completed"}


@app.get("/office/documents")
def list_office_documents(category: str | None = None):
    init_db()
    with get_db() as conn:
        if category:
            rows = conn.execute(
                """
                SELECT title, path, category, created_at
                FROM office_documents
                WHERE category = ?
                ORDER BY id DESC
                """,
                (category,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT title, path, category, created_at
                FROM office_documents
                ORDER BY id DESC
                """
            ).fetchall()
    return {"documents": [dict(row) for row in rows]}


@app.get("/office/status")
def office_status(user_key: str = "founder", session_id: str = "default"):
    return {
        "service": "fizzylush-ai-office",
        "db_path": DB_PATH.as_posix(),
        "user": token_summary(user_key),
        "memory_count": len(get_recent_history(session_id)),
        "session_id": session_id,
    }


# ─── Phase 4: Event-driven triggers & webhook ─────────────────────────────────

class TriggerRequest(BaseModel):
    trigger_key: str = Field(..., description="Unique trigger key")
    event_type: str = Field(..., description="Event type to match, or '*' for all")
    keyword: str = Field(default="", description="Optional keyword filter in event detail")
    employee_keys: list[str] = Field(..., description="Employee keys to fire")
    task_template: str = Field(..., description="Task text. Use {event_type} and {detail} as placeholders.")
    cooldown_minutes: int = Field(default=60, ge=1)


@app.get("/office/triggers")
def list_office_triggers():
    init_db()
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, trigger_key, event_type, keyword, employee_keys, task_template,
                   enabled, cooldown_minutes, last_triggered_at, trigger_count, created_at
            FROM office_triggers ORDER BY id ASC
            """
        ).fetchall()
    return {"triggers": [dict(row) for row in rows]}


@app.post("/office/triggers")
def create_office_trigger(req: TriggerRequest):
    invalid = [k for k in req.employee_keys if k not in employees]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown employee keys: {invalid}")
    init_db()
    with get_db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO office_triggers
                (trigger_key, event_type, keyword, employee_keys, task_template,
                 enabled, cooldown_minutes, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                req.trigger_key.strip(),
                req.event_type.strip(),
                req.keyword.strip(),
                json.dumps(req.employee_keys),
                req.task_template.strip(),
                req.cooldown_minutes,
                utc_now(),
            ),
        )
    return {"ok": True, "trigger_key": req.trigger_key}


@app.post("/office/triggers/{trigger_id}/toggle")
def toggle_office_trigger(trigger_id: int, enabled: bool = True):
    init_db()
    with get_db() as conn:
        row = conn.execute("SELECT id FROM office_triggers WHERE id = ?", (trigger_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Trigger not found")
        conn.execute("UPDATE office_triggers SET enabled = ? WHERE id = ?", (1 if enabled else 0, trigger_id))
    return {"ok": True, "id": trigger_id, "enabled": enabled}


@app.delete("/office/triggers/{trigger_id}")
def delete_office_trigger(trigger_id: int):
    init_db()
    with get_db() as conn:
        conn.execute("DELETE FROM office_triggers WHERE id = ?", (trigger_id,))
    return {"ok": True, "id": trigger_id}


@app.post("/webhook")
async def receive_webhook(request: Request):
    """Receive external events (Railway, Firebase, monitoring tools, etc.)"""
    try:
        body = await request.body()
        payload = json.loads(body.decode("utf-8")) if body else {}
    except (json.JSONDecodeError, UnicodeDecodeError):
        return json_response(400, {"error": "Invalid JSON body"})
    event_type = str(payload.get("event_type") or "webhook").strip()[:60]
    title = str(payload.get("title") or "External webhook event").strip()[:180]
    detail = str(payload.get("detail") or "").strip()[:4000]
    log_office_event(event_type, title, detail)
    return json_response(200, {"ok": True, "event_type": event_type, "triggered_at": utc_now()})

