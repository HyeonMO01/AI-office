# Fizzylush AI Office

**fizzylush** — AI 기반 옷장 관리 + 코디 추천 모바일 앱과, 이를 운영하는 AI 직원 오피스 백엔드입니다.

10명의 AI 직원이 병렬·자율 실행되는 멀티 에이전트 시스템과 fizzylush 앱의 외부 API 프록시 서버를 포함합니다.

## 구조

```
ai-office/
├── server.py          # FastAPI 서버 (AI 에이전트 + API 프록시)
├── requirements.txt   # Python 의존성
├── Procfile           # Railway 배포 설정
├── PJ01/              # fizzylush Expo/React Native 앱
└── ai-office-design/  # 오피스 대시보드 UI (Vite + React)
```

---

## fizzylush 앱 (PJ01/)

### 소개

사용자가 등록한 옷장 이미지를 바탕으로 AI 코디 추천, AI 아바타 기반 가상 피팅, 쇼핑 추천, 스타일 분석을 제공하는 React Native 패션 앱입니다.

### 주요 기능

| 기능 | 설명 |
|---|---|
| AI 코디 추천 | GPT-4o 비전으로 옷 사진 분석 후 코디 제안 + DALL-E 3 시각화 |
| 옷 터치 추천 | 사진 위 의류 뱃지 탭 → 해당 옷 기준 코디 추천 |
| 일일 AI 코디 | 날씨 + 옷장 기반 매일 3벌 자동 추천 (홈 카드) |
| AI 아바타 가상 피팅 | 체형 정보로 DALL-E 3 아바타 생성 → Kling Kolors로 옷 합성 |
| 네이버 쇼핑 연동 | AI 추천 아이템 기반 자동 쇼핑 검색 + 구매 링크 |
| 날씨 연동 | OpenWeatherMap 실시간 날씨 반영 코디 |
| 스타일 분석 | 카테고리 분포 차트, 옷장 완성도 점수, AI 진단 |
| 주간 코디 플래너 | 주간 코디 계획 + AI 자동 주간 플랜 생성 |
| 코디 캘린더 | 날짜별 착용 기록 |
| 추천 히스토리 | 과거 추천 기록 조회 + 피드백 재반영 |
| 푸시 알림 | 매일 오전 8시 오늘의 코디 추천 알림 |
| 피드백 학습 | 좋아요/별로 피드백이 다음 추천에 자동 반영 |

### 기술 스택 (앱)

| 분류 | 기술 |
|---|---|
| Framework | Expo SDK 54, React Native 0.81, React 19 |
| Language | TypeScript 5.9 |
| Backend/DB | Firebase Auth, Firestore, Storage |
| AI | OpenAI GPT-4o / GPT-4o-mini, DALL-E 3 |
| 가상 피팅 | FAL.ai Kling Kolors v1.5 |
| 쇼핑 | 네이버 쇼핑 검색 API |
| 날씨 | OpenWeatherMap API |
| 알림 | expo-notifications |

### 앱 환경변수 (PJ01/.env)

```env
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_API_BASE_URL=https://web-production-2b5e3.up.railway.app
```

### 앱 실행

```bash
cd PJ01
npm install
npx expo start
```

### EAS 빌드

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview  # Android APK
eas build --platform ios --profile preview       # iOS (Apple Developer 계정 필요)
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
이벤트 발생 시 트리거가 매칭된 직원을 자동으로 비동기 실행합니다. `/webhook`으로 외부 시스템(Railway, Firebase 등)에서 이벤트 전송 가능.

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

## API 프록시 엔드포인트

| 엔드포인트 | 설명 |
|---|---|
| `POST /command` | AI 직원에게 명령 (X-Office-Token 필요) |
| `POST /api/openai/chat-completions` | OpenAI 채팅 프록시 |
| `POST /api/openai/image-generation` | DALL-E 3 이미지 생성 |
| `GET /api/naver/shop-search` | 네이버 쇼핑 검색 |
| `GET /api/weather/current` | OpenWeatherMap 날씨 |
| `POST /api/fal/tryon/start` | FAL.ai Kling Kolors 가상 착용 |
| `GET /api/fal/tryon/status` | 가상 착용 결과 폴링 |
| `POST /webhook` | 외부 이벤트 수신 |
| `GET /office/triggers` | 이벤트 트리거 목록 |
| `GET /office/overview` | 오피스 전체 현황 |

## 사용 도구 (Tools)

직원이 사용할 수 있는 도구:

- `think` — 행동 전 추론 기록 (ReAct 패턴)
- `mark_complete` — 작업 완료 신호
- `ask_colleague` — 다른 직원에게 협업 요청
- `read_project_file` — 프로젝트 소스 파일 읽기
- `search_web` — 실시간 웹 검색 (DuckDuckGo)
- `search_fashion_market` — 패션 시장 리서치
- `analyze_fizzylush_project` — 앱 구조 분석
- `create_launch_checklist` — 런칭 체크리스트
- `save_business_doc` — 문서 저장
- `propose_office_action` — 승인 필요 액션 등록

## 환경변수

```env
OPENAI_API_KEY=          # OpenAI API 키 (필수)
OFFICE_TOKEN=            # /command 엔드포인트 보안 토큰
AUTO_OFFICE_ENABLED=0    # 자동 스케줄 (0=비활성, 1=활성)
NAVER_SHOPPING_CLIENT_ID=
NAVER_SHOPPING_CLIENT_SECRET=
OPENWEATHER_API_KEY=
FAL_API_KEY=             # FAL.ai Kling Kolors 가상 착용
CORS_ALLOWED_ORIGINS=    # 쉼표 구분, 비워두면 전체 허용
```

## 실행

```bash
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

## Railway 배포

```
https://web-production-2b5e3.up.railway.app
```

Procfile에 `web: uvicorn server:app --host 0.0.0.0 --port $PORT` 설정. GitHub 연동으로 자동 배포.

## 기술 스택

- **Runtime**: Python 3.13, FastAPI, Uvicorn
- **AI**: OpenAI GPT-4o-mini, DALL-E 3
- **DB**: SQLite (token_usage, office_jobs, office_triggers 등)
- **외부 API**: OpenAI, Naver Shopping, OpenWeatherMap, FAL.ai, DuckDuckGo
- **배포**: Railway
