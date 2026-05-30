# Fizzylush AI Office

> 혼자 창업하는데 AI 직원 10명이 대신 일해줍니다

---

## 한 줄 요약

**fizzylush**는 AI가 날씨·체형에 맞는 코디를 추천해주는 패션 모바일 앱이고,  
**AI Office**는 그 앱을 운영하는 데 필요한 모든 업무(기획, 분석, 마케팅, 법무 등)를  
AI 직원 10명이 대신 처리해주는 가상 사무실 시스템입니다.

혼자 만들고 혼자 운영하기 위해 만들었습니다.

---

## 목차

1. [fizzylush 앱이 뭔가요?](#fizzylush-앱이-뭔가요)
2. [AI Office가 뭔가요?](#ai-office가-뭔가요)
3. [앱 화면](#앱-화면)
4. [AI 직원 소개](#ai-직원-소개)
5. [실행 방법](#실행-방법)
6. [환경변수 설명](#환경변수-설명)
7. [API 목록](#api-목록)
8. [기술 스택](#기술-스택)
9. [배포 현황](#배포-현황)
10. [다음 할 일](#다음-할-일)

---

## fizzylush 앱이 뭔가요?

스마트폰 앱입니다. iOS / Android 둘 다 됩니다.

**핵심 흐름:**
1. 내 옷을 사진 찍어서 등록합니다
2. AI가 오늘 날씨를 자동으로 확인합니다
3. 오늘 날씨 + 내 옷장에서 어울리는 코디 3벌을 추천해줍니다
4. 마음에 드는 옷이 없으면 네이버 쇼핑에서 비슷한 걸 바로 찾아줍니다

**주요 기능 전체:**

| 기능 | 어떻게 동작하나요 |
|---|---|
| 홈 — 일일 코디 3벌 | 앱을 켜면 오늘 날씨를 자동으로 읽고, 내 옷장에서 어울리는 코디 3벌을 AI가 추천합니다 |
| AI 코디 추천 | 원하는 스타일(캐주얼/포멀 등), 상황(데이트/출근 등), 날씨, 예산을 고르면 AI가 맞춤 코디를 만들어줍니다 |
| 옷 등록 | 카메라나 갤러리에서 옷 사진을 찍으면 AI가 상의/하의/아우터 등 카테고리를 자동으로 분류합니다 |
| 가상 피팅 | 내 키·몸무게를 입력하면 AI가 나와 비슷한 체형의 아바타를 만들고, 그 아바타에 옷을 입혀서 보여줍니다 |
| 쇼핑 추천 | AI가 추천한 스타일의 실제 상품을 네이버 쇼핑에서 검색해서 구매 링크까지 보여줍니다 |
| 스타일 분석 | 내 옷장의 카테고리 분포, 자주 입는 스타일을 AI가 분석해서 진단해줍니다 |
| 주간 코디 플래너 | 이번 주 7일치 코디 계획을 AI가 자동으로 짜줍니다 |
| 코디 캘린더 | 오늘 뭐 입었는지 날짜별로 기록할 수 있습니다 |
| 추천 히스토리 | 이전에 받은 AI 추천을 다시 볼 수 있고, 좋아요/별로 피드백을 주면 다음 추천이 개선됩니다 |

---

## 앱 화면

<div align="center">
  <img src="docs/screenshots/app_home.png" width="170" alt="홈">
  <img src="docs/screenshots/app_recommendation.png" width="170" alt="AI 코디 추천">
  <img src="docs/screenshots/app_wardrobe.png" width="170" alt="옷 목록">
  <img src="docs/screenshots/app_shopping.png" width="170" alt="쇼핑 추천">
  <img src="docs/screenshots/app_mypage.png" width="170" alt="마이페이지">
</div>

| 홈 화면 | AI 코디 추천 | 옷 목록 | 쇼핑 추천 | 마이페이지 |
|:---:|:---:|:---:|:---:|:---:|
| 오늘 날씨 + 코디 3벌 | 스타일·상황 선택 | 내 옷 등록 | AI 추천 쇼핑 | 키·몸무게·스타일 |

---

## AI Office가 뭔가요?

앱을 운영하다 보면 코딩 외에도 할 일이 엄청 많습니다.

> 경쟁사 분석, 앱스토어 소개글 작성, 마케팅 카피 제작, 약관 검토, 베타 테스터 모집 전략...

혼자 다 하기엔 시간이 부족합니다. 그래서 AI 직원 10명을 만들었습니다.

**이렇게 사용합니다:**

```
나: "fizzylush 경쟁앱 3개 분석하고 우리 차별점 정리해줘"

→ 이리서치(리서치 담당)가 웹 검색으로 경쟁앱 조사
→ 최분석(분석 담당)이 데이터를 정리해서 보고서 작성
→ 결과물이 대시보드에 저장됨
```

브라우저에서 열면 픽셀 아트 사무실이 나옵니다. 직원들이 실제로 책상에 앉아서 일하고, 일이 없으면 소파에서 쉬기도 합니다.

```
┌─ FIZZYLUSH AI OFFICE ──────────────────────────────────────────┐
│  [화이트보드]  [책장][책장][책장][책장][책장]  [시계]          │
│                                                                │  ▶ BOSS TERMINAL
│   박기획     이리서치   김번역    최분석    정총무              │
│  [책상💻]   [책상💻]  [책상💻]  [책상💻]  [책상💻]            │  나: fizzylush
│                                                                │     경쟁사 분석해줘
│   오개발     한검수    서배포    임집행    유법무               │
│  [책상💻]   [책상💻]  [책상💻]  [책상💻]  [책상💻]            │  [ 지시 입력 ]
│                                                                │
│              [소파🛋️]  [의자]  [의자]                         │
└────────────────────────────────────────────────────────────────┘
  ● 박기획 DONE   ● 이리서치 WORKING   ● 최분석 AWAITING 승인
```

**상태 표시 의미:**
- `IDLE` — 대기 중 (책상에 앉아 있거나 돌아다님)
- `WORKING` — 지금 일하는 중 (모니터 화면 켜짐)
- `AWAITING` — 내 승인을 기다리는 중
- `DONE` — 작업 완료

---

## AI 직원 소개

총 10명입니다. 각자 전문 분야가 있고, 복잡한 업무는 더 똑똑한 모델(gpt-4o)이, 빠르게 처리할 수 있는 업무는 빠른 모델(gpt-4o-mini)이 담당합니다.

| 이름 | 역할 | 주요 업무 | AI 모델 |
|---|---|---|---|
| 박기획 | 전략 기획 | 사업 계획서, 로드맵, 기능 기획서 작성 | gpt-4o |
| 이리서치 | 시장 조사 | 경쟁사 분석, 트렌드 조사, 사용자 리서치 | gpt-4o |
| 김번역 | 번역·현지화 | 영문 번역, 앱스토어 다국어 설명 | gpt-4o-mini |
| 최분석 | 데이터 분석 | 지표 분석, 인사이트 도출, 보고서 작성 | gpt-4o |
| 정총무 | 총무·행정 | 일정 정리, 회의록, 행정 문서 | gpt-4o-mini |
| 오개발 | 개발 지원 | 코드 리뷰, 버그 분석, 기술 문서 | gpt-4o |
| 한검수 | QA·품질 | 테스트 케이스 작성, 버그 리포트 | gpt-4o |
| 서배포 | 배포·운영 | 배포 체크리스트, 스토어 제출 준비 | gpt-4o-mini |
| 임집행 | 마케팅 집행 | 마케팅 카피, SNS 콘텐츠, 광고 문안 | gpt-4o-mini |
| 유법무 | 법무 검토 | 이용약관, 개인정보처리방침, 계약서 초안 | gpt-4o |

**AI Office의 핵심 기능:**

**승인 후 실제 실행**
직원이 제안한 작업(예: 앱스토어 설명글 작성)을 내가 승인 버튼을 누르면, AI 직원이 실제로 결과물을 만들어서 저장합니다. 단순히 "승인됨" 상태만 바꾸는 게 아닙니다.

**장기 메모리**
직원들이 중요한 내용을 기억합니다. 오늘 마케팅 전략을 짰으면, 다음 주에 "지난번 마케팅 전략 기반으로 카피 써줘"라고 하면 이전 내용을 기억하고 이어서 작업합니다.

**직원 간 협업**
복잡한 명령은 여러 직원이 동시에 나눠서 일합니다. 예를 들어 "런칭 전략 짜줘"라고 하면 이리서치와 박기획이 동시에 일하고, 결과를 합쳐서 최종 보고서를 만듭니다.

**웹 검색**
직원들이 실시간으로 인터넷을 검색할 수 있습니다. "최근 AI 패션 앱 트렌드"를 물어보면 직접 검색해서 답합니다.

---

## 실행 방법

이 프로젝트는 두 부분으로 나뉩니다. 둘 다 실행해야 대시보드가 작동합니다.

### 준비물

- Python 3.10 이상
- Node.js 18 이상
- OpenAI API 키 (필수)

### 1단계 — 저장소 받기

```bash
git clone https://github.com/HyeonMO01/AI-office.git
cd AI-office
```

### 2단계 — 환경변수 설정

루트 폴더에 `.env` 파일을 만들고 아래 내용을 넣습니다.  
(아래 [환경변수 설명](#환경변수-설명) 섹션에서 각 항목이 뭔지 설명합니다)

```env
OPENAI_API_KEY=sk-...
OFFICE_TOKEN=원하는아무문자열
NAVER_SHOPPING_CLIENT_ID=
NAVER_SHOPPING_CLIENT_SECRET=
OPENWEATHER_API_KEY=
FAL_API_KEY=
CORS_ALLOWED_ORIGINS=
```

### 3단계 — 백엔드 서버 실행

```bash
# AI Office 루트 폴더에서
pip install -r requirements.txt
python server.py
```

성공하면 터미널에 이런 메시지가 나옵니다:

```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### 4단계 — 대시보드 실행

새 터미널 창을 열고:

```bash
cd ai-office-design
npm install
npm run dev
```

성공하면:

```
  VITE v6  ready in 500ms
  ➜  Local:   http://localhost:5173/
```

브라우저에서 `http://localhost:5173` 을 열면 픽셀 오피스가 나옵니다.

---

## 환경변수 설명

`.env` 파일에 들어가는 각 항목이 정확히 뭔지 설명합니다.

| 변수명 | 필수 여부 | 설명 | 어디서 받나요 |
|---|---|---|---|
| `OPENAI_API_KEY` | **필수** | AI 직원들의 두뇌. 이게 없으면 아무것도 안 됩니다 | platform.openai.com |
| `OFFICE_TOKEN` | **필수** | 대시보드 보안 비밀번호. 아무 문자열이나 써도 됩니다 (예: `mysecret123`) | 직접 설정 |
| `NAVER_SHOPPING_CLIENT_ID` | 선택 | 쇼핑 추천 기능에 필요. 없으면 쇼핑 검색이 안 됩니다 | developers.naver.com |
| `NAVER_SHOPPING_CLIENT_SECRET` | 선택 | 위와 세트 | developers.naver.com |
| `OPENWEATHER_API_KEY` | 선택 | 날씨 기반 코디 추천에 필요. 없으면 날씨 기능이 안 됩니다 | openweathermap.org |
| `FAL_API_KEY` | 선택 | 가상 피팅 기능에 필요. 없으면 가상 피팅이 안 됩니다 | fal.ai |
| `CORS_ALLOWED_ORIGINS` | 선택 | 외부 도메인에서 API를 쓸 때 허용할 주소. 로컬 개발 시 비워도 됩니다 | 직접 설정 |

**모바일 앱(fizzylush) 환경변수**는 `PJ01/.env`에 따로 설정합니다:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=         # Firebase 프로젝트 키
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=     # Firebase 인증 도메인
EXPO_PUBLIC_FIREBASE_PROJECT_ID=      # Firebase 프로젝트 ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=  # Firebase 스토리지 버킷
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_API_BASE_URL=https://web-production-2b5e3.up.railway.app
```

Firebase는 Google의 앱 백엔드 서비스입니다. 로그인, 사진 저장 등에 사용합니다.

---

## API 목록

서버가 제공하는 주소(엔드포인트) 목록입니다.  
`(토큰 필요)`라고 적힌 건 요청 헤더에 `X-Office-Token` 값을 넣어야 합니다.

**AI Office (명령·관리)**

| 주소 | 방식 | 설명 |
|---|---|---|
| `/command` | POST | AI 직원에게 명령 보내기 (토큰 필요) |
| `/office/overview` | GET | 사무실 전체 현황 — 직원 상태, 문서, 이벤트 |
| `/office/actions` | GET | 승인 대기 중인 작업 목록 |
| `/office/actions/{id}/approve` | POST | 특정 작업 승인 → AI가 즉시 실행 |
| `/office/actions/{id}/complete` | POST | 작업 완료 처리 |
| `/office/documents` | GET | 저장된 문서 목록 |

**앱 프록시 (fizzylush 앱에서 사용)**

| 주소 | 방식 | 설명 |
|---|---|---|
| `/api/openai/chat-completions` | POST | OpenAI 채팅 API 프록시 |
| `/api/openai/image-generation` | POST | DALL-E 3 이미지 생성 |
| `/api/naver/shop-search` | GET | 네이버 쇼핑 검색 |
| `/api/weather/current` | GET | 현재 날씨 조회 |
| `/api/fal/tryon/start` | POST | 가상 피팅 작업 시작 |
| `/api/fal/tryon/status` | GET | 가상 피팅 결과 확인 |

---

## 기술 스택

각 기술이 이 프로젝트에서 어떤 역할을 하는지 설명합니다.

**백엔드 서버 (`server.py`)**

| 기술 | 역할 |
|---|---|
| Python | 서버 언어 |
| FastAPI | 웹 서버 프레임워크. API 주소를 만들어줍니다 |
| SQLite | 데이터베이스. 문서, 이벤트, 메모리, 토큰 사용량을 저장합니다 |
| OpenAI API | AI 직원들의 두뇌. GPT-4o / GPT-4o-mini를 씁니다 |
| Railway | 클라우드 서버 호스팅. GitHub에 push하면 자동 배포됩니다 |

**대시보드 UI (`ai-office-design/`)**

| 기술 | 역할 |
|---|---|
| React + TypeScript | UI 프레임워크 |
| Vite | 빌드 도구. 개발 서버를 빠르게 실행해줍니다 |
| Framer Motion | 애니메이션 라이브러리 |
| Canvas API | 픽셀 아트 오피스 렌더링 |

**모바일 앱 (`PJ01/`)**

| 기술 | 역할 |
|---|---|
| Expo | React Native 앱 빌드 도구 |
| React Native | iOS·Android 동시 개발 프레임워크 |
| TypeScript | 타입 안전한 JavaScript |
| Firebase | 로그인(Auth) + 사진 저장(Storage) |
| EAS Build | 앱스토어 제출용 빌드 서비스 |

**AI 서비스**

| 서비스 | 역할 |
|---|---|
| OpenAI GPT-4o | 복잡한 업무 담당 직원 (기획·분석·법무·개발·검수) |
| OpenAI GPT-4o-mini | 빠른 업무 담당 직원 (번역·총무·배포·집행) |
| OpenAI DALL-E 3 | 사용자 체형 기반 AI 아바타 이미지 생성 |
| FAL.ai Kling Kolors | 아바타에 옷을 합성하는 가상 피팅 AI |

---

## 배포 현황

| 서비스 | 주소 | 상태 |
|---|---|---|
| AI Office 서버 | https://web-production-2b5e3.up.railway.app | 운영 중 |
| GitHub | https://github.com/HyeonMO01/AI-office | 공개 |
| iOS 앱 | TestFlight 준비 중 | 미출시 |
| Android 앱 | Google Play 준비 중 | 미출시 |

Railway는 GitHub 저장소와 연동되어 있어서, `main` 브랜치에 push하면 서버가 자동으로 업데이트됩니다. 별도로 서버를 재시작할 필요가 없습니다.

---

## 폴더 구조

```
AI-office/
│
├── server.py                  # 메인 서버 — AI 직원 로직, API 전체
├── requirements.txt           # Python 패키지 목록
├── .env                       # 환경변수 (git에 올리지 않음)
│
├── ai-office-design/          # 픽셀 오피스 대시보드 (React)
│   ├── src/
│   │   └── app/
│   │       ├── App.tsx        # 대시보드 메인 UI
│   │       └── OfficeRoom.tsx # 픽셀 아트 오피스 캔버스
│   └── public/assets/         # 픽셀 아트 스프라이트 (캐릭터, 가구)
│
└── PJ01/                      # fizzylush 모바일 앱 (Expo/React Native)
    └── src/
        ├── screens/           # 각 화면 컴포넌트
        ├── services/          # API 호출 로직
        └── components/        # 공통 UI 컴포넌트
```

---

## 다음 할 일

- [ ] FAL.ai 크레딧 충전 → 가상 피팅 실제 테스트 (현재 잔액 $0)
- [ ] 베타 사용자 30명 모집 (지인·커뮤니티)
- [ ] Apple Developer 계정 등록 ($99/년) → EAS 빌드 → TestFlight 배포
- [ ] Google Play 계정 등록 ($25) → APK 빌드 → 스토어 등록

---

*혼자 바이브코딩으로 만든 프로젝트입니다. AI 직원들이 실제로 일합니다.*
