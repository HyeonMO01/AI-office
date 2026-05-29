# Proxy Server

이 서버는 앱 클라이언트에서 비밀키를 제거하기 위한 최소 프록시 예시입니다.

## 1) 환경변수

- `OPENAI_API_KEY`
- `NAVER_SHOPPING_CLIENT_ID`
- `NAVER_SHOPPING_CLIENT_SECRET`
- `PROXY_TOKEN` (앱에서 전달할 프록시 토큰)
- `CORS_ALLOWED_ORIGINS` (쉼표로 구분, 예: `https://app.example.com,exp://192.168.0.2:8081`)
- `PORT` (기본값: `8787`)

## 2) 실행

```bash
node proxy-server/server.mjs
```

## 3) 앱 설정

앱 `.env`에 아래 값을 설정합니다.

```bash
EXPO_PUBLIC_API_BASE_URL=http://<YOUR_PROXY_HOST>:8787
EXPO_PUBLIC_PROXY_TOKEN=<YOUR_PROXY_TOKEN>
```

## 4) 엔드포인트

- `GET /health` — 로드밸런서·업타임용 (CORS/토큰 없음)
- `POST /api/openai/chat-completions`
- `GET /api/naver/shop-search?query=...&display=5&sort=sim`
- 기타: `server.mjs` 참고

## 4.1) Docker

```bash
docker build -t fizzylush-proxy -f proxy-server/Dockerfile proxy-server
docker run -p 8787:8787 --env-file .env fizzylush-proxy
```

배포 절차는 [DEPLOY.md](./DEPLOY.md) 참고.

## 5) 참고

- 기본 보안 포함: IP 레이트 제한, CORS allowlist, body size 제한, proxy token 검사.
- 실제 운영에서는 WAF/CDN 레이트 제한, 토큰 로테이션, 인증 연동을 추가하세요.
