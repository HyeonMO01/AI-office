# fizzylush

AI 기반 옷장 관리 + 코디 추천 모바일 앱입니다.  
사용자가 등록한 옷장 이미지를 바탕으로 AI 코디 추천, 가상 피팅, 쇼핑 추천, 스타일 분석 등을 제공합니다.

## 주요 기능

### AI 추천
- **AI 코디 추천** — GPT-4o 비전으로 옷 사진 분석 후 코디 제안
- **옷 터치 추천** — 사진 위 의류 뱃지 탭으로 해당 옷 기준 코디 추천
- **일일 AI 코디** — 날씨 + 옷장 기반 매일 3벌 자동 추천 (홈 카드)
- **피드백 학습** — 좋아요/별로 피드백이 다음 추천에 자동 반영

### 가상 피팅
- **AI 아바타 생성** — 온보딩 체형 정보로 DALL-E 3 아바타 자동 생성
- **Kling Kolors 가상 착용** — FAL.ai Kling Kolors v1.5로 아바타에 옷 합성
- **구매 연동** — 결과 이미지에서 바로 네이버쇼핑 구매 가능

### 옷장 관리
- 카메라/갤러리로 옷 업로드 → AI 의류 영역 자동 감지 → 크롭 → 등록
- 카테고리 필터, 일괄 삭제, 카테고리 변경

### 쇼핑
- AI 추천 아이템 기반 네이버 쇼핑 자동 검색
- 예산 필터, 상품 링크 외부 브라우저 열기

### 분석 및 기록
- **스타일 분석** — 카테고리 분포 차트, 옷장 완성도 점수, AI 진단
- **추천 히스토리** — 과거 추천 기록 조회, 피드백 재반영
- **코디 캘린더** — 날짜별 착용 기록
- **주간 코디 플래너** — 이번 주 코디 계획, AI 자동 주간 플랜

### 기타
- 날씨 연동 (OpenWeatherMap) — 위치 기반 실시간 날씨 코디 반영
- 푸시 알림 — 매일 오전 8시 오늘의 코디 추천 알림
- Firebase 인증 (이메일/비밀번호), Firestore, Storage

## 기술 스택

| 분류 | 기술 |
|---|---|
| Framework | Expo SDK 54, React Native 0.81, React 19 |
| Language | TypeScript 5.9 |
| Navigation | React Navigation (Stack + Bottom Tab) |
| Backend/DB | Firebase Auth, Firestore, Storage |
| AI | OpenAI GPT-4o / GPT-4o-mini, DALL-E 3 |
| 가상 피팅 | FAL.ai Kling Kolors v1.5 |
| 쇼핑 | 네이버 쇼핑 검색 API |
| 날씨 | OpenWeatherMap API |
| 알림 | expo-notifications |
| 모니터링 | Sentry |

## 프로젝트 구조

```
PJ01/
├── App.tsx                        # 앱 진입점, 알림 리스너
├── src/
│   ├── screens/                   # 화면 컴포넌트
│   │   ├── HomeScreen.tsx         # 옷장 + 일일 코디 홈
│   │   ├── UploadScreen.tsx       # 옷 업로드
│   │   ├── RecommendScreen.tsx    # AI 코디 추천
│   │   ├── OutfitTouchScreen.tsx  # 옷 터치 추천
│   │   ├── StyleRecommendScreen.tsx
│   │   ├── StyleResultScreen.tsx
│   │   ├── VirtualTryOnScreen.tsx # AI 아바타 + 가상 피팅
│   │   ├── StyleAnalysisScreen.tsx # 스타일 분석
│   │   ├── WeeklyPlannerScreen.tsx # 주간 플래너
│   │   ├── OutfitCalendarScreen.tsx
│   │   ├── RecommendationHistoryScreen.tsx
│   │   ├── MyPageScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   ├── OnboardingScreen.tsx
│   │   ├── LoginScreen.tsx
│   │   └── SignUpScreen.tsx
│   ├── services/
│   │   ├── apiProxy.ts            # 백엔드 프록시 클라이언트
│   │   ├── openai.ts              # GPT-4o 추천/분석
│   │   ├── avatarService.ts       # AI 아바타 생성
│   │   ├── falService.ts          # FAL.ai 가상 착용
│   │   ├── smartRecommendService.ts # 일일 코디 추천
│   │   ├── recommendationService.ts
│   │   ├── naverShoppingService.ts
│   │   ├── weatherService.ts
│   │   ├── wardrobeService.ts
│   │   ├── storageService.ts
│   │   ├── userProfileService.ts
│   │   ├── notificationService.ts # 푸시 알림
│   │   ├── authService.ts
│   │   └── firebase.ts
│   ├── navigation/
│   ├── hooks/
│   ├── components/
│   ├── constants/
│   ├── utils/
│   ├── types/
│   └── theme/
└── docs/
```

## 개발 환경 설정

### 1. 의존성 설치

```bash
cd PJ01
npm install
```

### 2. 환경변수 설정

`.env.example`을 복사해 `.env`를 만들고 값을 채웁니다.

```bash
cp .env.example .env
```

```env
# Firebase
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=

# 백엔드 서버 (로컬: http://localhost:8000, 배포: Railway URL)
EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
```

### 3. 백엔드 서버 실행

루트 `ai-office/` 폴더에서:

```bash
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 4. 앱 실행

```bash
npx expo start
```

Expo Go 앱으로 QR코드 스캔하거나 에뮬레이터에서 실행합니다.

## EAS 빌드

```bash
# EAS CLI 설치
npm install -g eas-cli

# 로그인
eas login

# Android APK (내부 배포)
eas build --platform android --profile preview

# iOS (Apple Developer 계정 필요)
eas build --platform ios --profile preview
```

EAS ProjectId: `23d09349-87d2-4356-b226-4e813d55e8b1`

## 배포된 백엔드

```
https://web-production-2b5e3.up.railway.app
```

## 가상 피팅 활성화

`src/constants/features.ts`:

```typescript
export const FEATURE_VIRTUAL_TRY_ON_ENABLED = true;
```

FAL.ai 크레딧 필요 (~$0.07/회). [fal.ai](https://fal.ai)에서 가입 후 `FAL_API_KEY`를 백엔드 환경변수에 설정.

## 라이선스

Private — fizzylush 전용
