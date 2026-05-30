# Fizzylush AI Office

**fizzylush** — AI 기반 옷장 관리 + 코디 추천 모바일 앱과, 이를 운영하는 AI 직원 오피스 백엔드입니다.

10명의 AI 직원이 픽셀 아트 사무실에서 병렬·자율 실행되는 멀티 에이전트 시스템 + fizzylush 앱의 외부 API 프록시 서버를 포함합니다.

---

## fizzylush 앱

AI가 내 옷장을 분석해 코디를 추천하고, 쇼핑까지 연결해주는 React Native 패션 앱입니다.

### 스크린샷

<div align="center">
  <img src="docs/screenshots/app_home.png" width="180" alt="홈">
  <img src="docs/screenshots/app_recommendation.png" width="180" alt="AI 코디 추천">
  <img src="docs/screenshots/app_wardrobe.png" width="180" alt="옷 목록">
  <img src="docs/screenshots/app_shopping.png" width="180" alt="쇼핑 추천">
  <img src="docs/screenshots/app_mypage.png" width="180" alt="마이페이지">
</div>

> 홈 · AI 코디 추천 · 옷 목록 · 쇼핑 추천 · 마이페이지

### 주요 기능

| 기능 | 설명 |
|---|---|
| 일일 AI 코디 | 날씨 + 옷장 기반 매일 3벌 자동 추천 (홈 카드) |
| AI 코디 추천 | 스타일·상황·날씨·예산 선택 → GPT-4o 코디 생성 |
| 옷 터치 추천 | 사진 위 의류 뱃지 탭 → 해당 옷 기준 코디 추천 |
| AI 아바타 가상 피팅 | 체형 정보로 DALL-E 3 아바타 생성 → Kling Kolors로 옷 합성 |
| 네이버 쇼핑 연동 | AI 추천 아이템 기반 자동 쇼핑 검색 + 구매 링크 |
| 날씨 연동 | OpenWeatherMap 실시간 날씨 반영 코디 |
| 스타일 분석 | 카테고리 분포 차트, 옷장 완성도 점수, AI 진단 |
| 주간 코디 플래너 | 주간 코디 계획 + AI 자동 주간 플랜 생성 |
| 추천 히스토리 | 과거 추천 기록 조회 + 피드백 재반영 |

### 기술 스택

| 분류 | 기술 |
|---|---|
| Framework | Expo SDK 54, React Native 0.81 |
| Language | TypeScript |
| Backend/DB | Firebase Auth, Firestore, Storage |
| AI | OpenAI GPT-4o / GPT-4o-mini, DALL-E 3 |
| 가상 피팅 | FAL.ai Kling Kolors v1.5 |
| 쇼핑 | 네이버 쇼핑 검색 API |
| 날씨 | OpenWeatherMap API |

### 앱 실행

```bash
cd PJ01
npm install
npx expo start
```

---

## AI Office Dashboard

픽셀 아트 스타일 실시간 오피스 대시보드. AI 직원 10명이 사무실 안에서 실제로 일하는 모습을 보여줍니다.

- **실시간 픽셀 룸**: Canvas 2D로 렌더링된 탑뷰 사무실, 직원들이 책상에 앉아 상태별 애니메이션
- **Boss Terminal**: 창업자가 직원들에게 직접 지시를 내리는 레트로 터미널 UI
- **승인 큐**: AI가 올린 승인 대기 작업을 창업자가 원클릭으로 결정
- **실시간 상태 LED**: IDLE · WORKING · AWAITING · DONE 상태 실시간 반영
- **이벤트 Ticker**: 하단에 사무실 이벤트가 흘러가는 실시간 피드

```bash
cd ai-office-design
npm install
npm run dev   # http://localhost:5173
```

---

## 프로젝트 구조

```
ai-office/
├── server.py              # FastAPI 서버 (AI 에이전트 + API 프록시)
├── requirements.txt
├── Procfile               # Railway 배포 설정
├── PJ01/                  # fizzylush Expo/React Native 앱
├── ai-office-design/      # 픽셀 오피스 대시보드 (Vite + React)
│   ├── src/app/App.tsx         # 메인 대시보드
│   └── src/app/OfficeRoom.tsx  # Canvas 2D 픽셀 룸 렌더러
└── docs/screenshots/      # fizzylush 앱 스크린샷
```

---

## AI Agent 시스템

총 4개 Phase로 구성된 멀티 에이전트 아키텍처입니다.

### Phase 1 — ReAct 루프
직원들이 **생각(think) → 행동 → 관찰 → 반복** 패턴으로 작업합니다. 최대 10회 반복, `mark_complete` 호출 시 완료.

### Phase 2 — 병렬 실행 + 직원 간 협업
매니저 AI가 독립적인 직원들을 그룹으로 묶어 `ThreadPoolExecutor`로 병렬 실행합니다. `ask_colleague` 툴로 직원끼리 실시간 질문 가능.

### Phase 3 — 자동 품질 평가 + 재시도
각 직원의 결과물을 GPT가 1~10점으로 자동 평가합니다. 6점 미만이면 피드백을 전달해 재시도합니다.

### Phase 4 — 이벤트 기반 자율 실행
이벤트 발생 시 트리거가 매칭된 직원을 자동으로 비동기 실행합니다. `/webhook`으로 외부 시스템에서 이벤트 전송 가능.

```
이벤트 발생 (자율)          명령 입력 (수동)
      ↓                          ↓
process_event_triggers    ask_manager
      ↓                          ↓
   트리거 매칭          병렬 그룹 분배 (Phase 2)
      ↓                          ↓
비동기 에이전트 실행    [직원A + 직원B] 병렬 실행
                               ↓
                    think → act → observe (Phase 1)
                               ↓
                        자동 품질 평가 (Phase 3)
                          미달 시 재시도
```

## AI 직원 10명

| 키 | 이름 | 역할 |
|---|---|---|
| 기획 | 박기획 | 사업/제품 기획자 |
| 리서치 | 이리서치 | 시장/경쟁 리서처 |
| 번역 | 김번역 | 마케팅/글로벌 카피라이터 |
| 분석 | 최분석 | 성장/데이터 분석가 |
| 총무 | 정총무 | 운영/런칭 PM |
| 개발 | 오개발 | 앱 개발/기술 수정 |
| 검수 | 한검수 | 테스트/QA |
| 배포 | 서배포 | 빌드/배포 |
| 집행 | 임집행 | 마케팅 집행 |
| 법무 | 유법무 | 법무/개인정보 점검 |

---

## API 엔드포인트

| 엔드포인트 | 설명 |
|---|---|
| `POST /command` | AI 직원에게 명령 |
| `POST /api/openai/chat-completions` | OpenAI 채팅 프록시 |
| `POST /api/openai/image-generation` | DALL-E 3 이미지 생성 |
| `GET /api/naver/shop-search` | 네이버 쇼핑 검색 |
| `GET /api/weather/current` | 날씨 |
| `POST /api/fal/tryon/start` | FAL.ai 가상 착용 |
| `GET /api/fal/tryon/status` | 가상 착용 결과 폴링 |
| `POST /webhook` | 외부 이벤트 수신 |
| `GET /office/overview` | 오피스 전체 현황 |

## 환경변수

```env
OPENAI_API_KEY=
OFFICE_TOKEN=
NAVER_SHOPPING_CLIENT_ID=
NAVER_SHOPPING_CLIENT_SECRET=
OPENWEATHER_API_KEY=
FAL_API_KEY=
CORS_ALLOWED_ORIGINS=
```

## 서버 실행

```bash
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

## 배포

- **백엔드**: Railway — `https://web-production-2b5e3.up.railway.app`
- **대시보드**: `npm run build` 후 정적 호스팅

## 기술 스택 (서버)

- Python 3.13, FastAPI, Uvicorn
- OpenAI GPT-4o-mini, DALL-E 3
- SQLite (token_usage, office_jobs, office_triggers 등)
- Railway
