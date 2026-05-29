# fizzylush v2

fizzylush v2는 기존 `PJ01` 앱에서 검증 가치가 있는 기능만 가져와 다시 구성하는 버전입니다.

목표는 "내 옷장 기반 AI 코디 추천"을 가장 빠르게 검증하고, AI Office가 제품/회원/데이터/토큰/문서 운영을 같이 관리할 수 있게 만드는 것입니다.

## v2 핵심 원칙

- 앱 화면 문구는 한국어 우선
- 코드 변수/함수/파일명은 영어 유지
- MVP는 기능을 줄이고 핵심 루프에 집중
- OpenAI, Naver, Weather, Replicate 키는 클라이언트 앱에 넣지 않음
- AI Office가 기획, 분석, 문서, 토큰 사용량, 회원 운영 상태를 관리

## MVP 핵심 루프

1. 회원가입 또는 로그인
2. 온보딩으로 체형/선호 스타일 입력
3. 옷장에 옷 사진 업로드
4. AI가 옷을 요약하고 태그 생성
5. 사용자가 AI 코디 추천 요청
6. 추천 결과 저장
7. 좋아요/별로 피드백 저장
8. 다음 추천에 피드백 반영

## 1차 포함 기능

- Firebase Auth 기반 회원 관리
- 사용자 프로필
- 옷장 업로드/목록/삭제/카테고리 변경
- AI 코디 추천
- 오늘의 코디
- 추천 기록
- 좋아요/별로 피드백
- 네이버 쇼핑 카드 일부
- AI Office 토큰 사용량 관리
- AI Office 문서 저장/조회

## 후순위 기능

- 가상 피팅
- AI 코디 이미지 생성
- 코디 캘린더
- 옷 터치 추천
- 푸시 알림
- 프리미엄 결제

## 현재 연결된 AI Office 기능

현재 `server.py`에 다음 운영 기능이 추가되어 있습니다.

- `POST /command`: AI 직원 실행
- `GET /office/status`: AI Office 상태와 토큰 요약
- `POST /office/users`: 운영 사용자 생성/수정
- `GET /office/users`: 운영 사용자 목록
- `GET /office/tokens/{user_key}`: 사용자별 토큰 사용량
- `GET /office/sessions/{session_id}/tokens`: 세션별 토큰 사용량
- `GET /office/documents`: 저장 문서 목록
- `GET /history/{session_id}`: 대화 기억 조회
- `DELETE /history/{session_id}`: 대화 기억 삭제

## 다음 구현 순서

1. 기존 PJ01의 깨진 한글/프롬프트 복구
2. v2 화면 구조 확정
3. v2 앱 프로젝트 생성
4. Firebase/Auth/Profile/Wardrobe부터 이식
5. OpenAI 추천 프롬프트 재작성
6. AI Office에서 v2 작업/토큰/문서 관리 강화
