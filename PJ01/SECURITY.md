# 보안·시크릿 가이드

## 원칙

- **OpenAI·네이버 시크릿·Replicate 토큰**은 **프록시 서버 환경 변수에만** 둡니다. `EXPO_PUBLIC_*`로 넣으면 앱 번들에 노출됩니다.
- **`EXPO_PUBLIC_PROXY_TOKEN`**은 클라이언트에 포함되므로 “완전 비밀”은 아닙니다. 프로덕션에서는 **HTTPS**, **짧은 만료·로테이션**, **남용 방지(레이트 리밋)** 와 함께 쓰는 것을 권장합니다.
- **Firebase**: [firebase/firestore.rules](firebase/firestore.rules), [firebase/storage.rules](firebase/storage.rules)를 콘솔에 배포해 사용자별 격리를 확인하세요.

## 배포 체크리스트

1. `CORS_ALLOWED_ORIGINS`에 실제 앱/Expo 개발 Origin만 허용 (가능하면).
2. `PROXY_TOKEN` 설정 후 앱 `EXPO_PUBLIC_PROXY_TOKEN`과 일치 확인.
3. Sentry DSN은 공개되어도 되는 키이지만, 프로젝트별로 분리 권장.
