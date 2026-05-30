# Fizzylush AI Office

> AI가 대신 일해주는 패션 앱 운영 시스템

바이브코딩으로 혼자 만든 AI 패션 앱 **fizzylush**와, 그 앱을 운영하는 **AI 직원 10명짜리 가상 사무실**입니다.

---

## 이게 뭔가요?

크게 두 가지 프로젝트가 합쳐져 있습니다.

### 1. fizzylush — AI 패션 앱

내 옷 사진을 등록하면 AI가 오늘 날씨에 맞는 코디를 추천해주고, 쇼핑까지 연결해주는 모바일 앱입니다.

### 2. AI Office — AI 직원 오피스

박기획, 이리서치, 오개발 등 10명의 AI 직원이 실제로 기획서 작성, 경쟁사 분석, 마케팅 문구 작성 등의 업무를 수행합니다. 창업자(나)는 지시만 내리면 됩니다.

---

## fizzylush 앱 기능

| 기능 | 설명 |
|---|---|
| **홈 - 일일 코디 3벌** | 오늘 날씨를 자동으로 읽어서 내 옷장에서 AI가 3벌 추천 |
| **AI 코디 추천** | 스타일·상황·날씨·예산 선택 → 맞춤 코디 생성 |
| **옷 등록** | 사진 찍으면 AI가 카테고리 자동 분류 |
| **가상 피팅** | 체형 기반 AI 아바타 생성 → Kling Kolors로 옷 합성 |
| **쇼핑 추천** | AI 추천 아이템을 네이버 쇼핑에서 자동 검색 + 구매 링크 |
| **스타일 분석** | 옷장 카테고리 분포·스타일 진단 |
| **주간 코디 플래너** | 이번 주 7일치 코디 자동 계획 |
| **코디 캘린더** | 날짜별 착용 기록 |
| **추천 히스토리** | 이전 추천 다시보기 + 좋아요/별로 피드백 |

---

## AI Office — 픽셀 오피스 대시보드

브라우저에서 열면 이런 화면이 나옵니다:

```
┌─ FIZZYLUSH AI OFFICE ──────────────────────────────────┐
│ [화이트보드] [책장] [책장] [책장] [책장] [시계]        │  ▶ BOSS TERMINAL
│                                                        │
│  박기획  이리서치  김번역  최분석  정총무               │  BOSS> fizzylush 앱
│  [책상]  [책상]   [책상]  [책상]  [책상]               │         경쟁사 분석해줘
│                                                        │
│  오개발  한검수  서배포  임집행  유법무                  │  [ 지시 하달 ]
│  [책상]  [책상]  [책상]  [책상]  [책상]                │
│                                                        │
│         [소파] [의자] [의자]                           │
└────────────────────────────────────────────────────────┘
```

- 직원들이 실제로 책상에 앉아서 일합니다 (픽셀 아트 애니메이션)
- 오른쪽 터미널에 지시를 내리면 AI 직원들이 실행합니다
- 승인이 필요한 작업은 버튼 한 번으로 AI 직원이 실제 결과물을 생성합니다
- 각 직원 상태가 실시간으로 표시됩니다 (IDLE / WORKING / AWAITING / DONE)

---

## AI 직원 10명

| 직원 | 역할 | 모델 |
|---|---|---|
| 박기획 | 전략 기획, 문서 작성 | gpt-4o |
| 이리서치 | 시장·경쟁사 조사 | gpt-4o |
| 김번역 | 번역, 다국어 콘텐츠 | gpt-4o-mini |
| 최분석 | 데이터 분석, 인사이트 | gpt-4o |
| 정총무 | 총무, 행정 문서 | gpt-4o-mini |
| 오개발 | 코드 검토, 개발 계획 | gpt-4o |
| 한검수 | QA, 품질 검수 | gpt-4o |
| 서배포 | 배포, 체크리스트 | gpt-4o-mini |
| 임집행 | 마케팅 집행 | gpt-4o-mini |
| 유법무 | 법무, 약관 검토 | gpt-4o |

---

## 주요 기능 (AI Office)

### 승인 후 실제 실행
창업자가 승인 버튼을 누르면 적절한 AI 직원이 백그라운드에서 실제로 작업을 수행합니다.
단순 status 변경이 아닌 실제 결과물(코드, 문서, 분석 보고서)이 생성됩니다.

### 장기 메모리
직원들이 중요한 정보를 DB에 저장합니다. 세션이 바뀌어도 "지난번에 작성한 마케팅 전략"을 기억합니다.

### 직원별 모델 라우팅
복잡한 업무(기획·분석·법무·개발)는 gpt-4o, 단순한 업무(번역·총무·배포)는 gpt-4o-mini를 자동 선택합니다.

### ReAct 패턴
직원들이 생각(think) → 도구 사용(search_web, read_project_file 등) → 결과 확인 → 반복 방식으로 작업합니다.

---

## 실행 방법

### 백엔드 서버

```bash
pip install -r requirements.txt
python server.py
# → http://127.0.0.1:8000
```

### 대시보드 UI

```bash
cd ai-office-design
npm install
npm run dev
# → http://localhost:5173
```

### 환경변수

루트에 `.env` 파일을 만들고 아래 키를 넣습니다:

```env
OPENAI_API_KEY=sk-...
OFFICE_TOKEN=my-secret-token        # 대시보드 보안 토큰 (아무 문자열)
NAVER_SHOPPING_CLIENT_ID=
NAVER_SHOPPING_CLIENT_SECRET=
OPENWEATHER_API_KEY=
FAL_API_KEY=                        # 가상 피팅 (FAL.ai)
CORS_ALLOWED_ORIGINS=               # 비워두면 전체 허용
```

앱의 Firebase 설정은 `PJ01/.env`에 따로 넣습니다:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_API_BASE_URL=https://web-production-2b5e3.up.railway.app
```

---

## 배포 현황

| 서비스 | 주소 |
|---|---|
| AI Office 서버 | https://web-production-2b5e3.up.railway.app |
| GitHub | https://github.com/HyeonMO01/AI-office |

Railway에 GitHub 연동이 되어 있어서 `git push`하면 서버가 자동 업데이트됩니다.

---

## AI Office API

| 주소 | 설명 |
|---|---|
| `POST /command` | AI 직원에게 명령 보내기 (토큰 필요) |
| `GET /office/overview` | 사무실 전체 현황 조회 |
| `POST /office/actions/{id}/approve` | 승인 대기 작업 승인 → AI 즉시 실행 |
| `POST /office/actions/{id}/complete` | 작업 완료 처리 |
| `GET /office/documents` | 저장된 문서 목록 |
| `POST /api/openai/chat-completions` | OpenAI 채팅 프록시 |
| `POST /api/openai/image-generation` | DALL-E 3 이미지 생성 |
| `GET /api/naver/shop-search` | 네이버 쇼핑 검색 |
| `GET /api/weather/current` | 날씨 조회 |
| `POST /api/fal/tryon/start` | 가상 피팅 시작 |
| `GET /api/fal/tryon/status` | 가상 피팅 결과 확인 |

---

## 기술 스택

| 분류 | 기술 |
|---|---|
| 백엔드 | Python, FastAPI, SQLite, OpenAI API |
| 대시보드 | React, TypeScript, Vite, Framer Motion |
| 모바일 앱 | Expo, React Native, TypeScript |
| 인프라 | Railway, Firebase, EAS Build |
| AI | OpenAI GPT-4o / GPT-4o-mini, DALL-E 3, FAL.ai Kling Kolors |

---

## 다음 할 일

- [ ] FAL.ai $5 충전 → 가상 피팅 실제 테스트
- [ ] 베타 사용자 30명 모집
- [ ] Apple Developer 계정 ($99) → TestFlight 배포
- [ ] Google Play 계정 ($25) → APK 스토어 등록

---

*혼자 바이브코딩으로 만든 프로젝트입니다. AI 직원들이 실제로 일합니다.*
