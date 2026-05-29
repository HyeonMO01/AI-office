# fizzylush v2 Architecture

## 전체 구조

```text
ai-office/
  server.py                  # AI Office backend
  ai-office-design/          # AI Office web console
  fizzylush-v2/              # Rebuilt product workspace
    docs/
    app/                     # Future Expo/React Native app
    backend/                 # Future product API if needed
```

## 역할 분리

### AI Office

AI Office는 창업자/운영자용 백오피스입니다.

- AI 직원 명령 실행
- fizzylush 기획/마케팅/분석/운영 문서 생성
- 토큰 사용량 관리
- 운영 사용자 관리
- 세션별 작업 히스토리 관리
- 런칭 체크리스트와 문서 저장

### fizzylush App

사용자용 모바일 앱입니다.

- 회원가입/로그인
- 옷장 등록
- AI 코디 추천
- 추천 기록
- 피드백
- 쇼핑 추천

### Product Proxy

실제 배포 단계에서는 앱이 직접 OpenAI/Naver/Weather API를 호출하지 않고 프록시를 통합니다.

- API 키 보호
- CORS/토큰/레이트리밋
- 요청 로그와 비용 추적
- 실패 응답 표준화

## 데이터 관리

### AI Office DB

현재 `server.py`는 `data/ai_office.db` SQLite 파일을 사용합니다.

테이블:

- `office_users`: 운영 사용자
- `token_usage`: OpenAI 호출 토큰 사용량
- `persistent_history`: AI Office 대화 기억
- `office_documents`: 생성/저장 문서 목록

### fizzylush App DB

초기 v2는 Firebase를 유지하는 편이 좋습니다.

- Firebase Auth: 사용자 인증
- Firestore: 프로필, 옷장 메타데이터, 추천 기록, 피드백
- Firebase Storage: 옷 이미지

## 토큰 관리

AI Office는 OpenAI 응답의 `usage` 값을 저장합니다.

관리 단위:

- 사용자별 토큰 한도
- 사용자별 사용량
- 세션별 사용량
- 직원/작업 영역별 사용량

초기 기본 한도:

```text
500,000 tokens / user
```

## 런칭 전 필수 작업

- 깨진 한글 복구
- OpenAI 프롬프트 재작성
- Firebase 운영 프로젝트 분리
- 프록시 서버 배포
- EAS preview build
- 실제 기기 테스트
- 개인정보처리방침/이용약관 준비
