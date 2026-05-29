# 프록시 서버 배포 (고정 URL)

로컬 IP 대신 **HTTPS 고정 URL**을 쓰면 집/카페/실기기 환경이 달라도 앱의 `EXPO_PUBLIC_API_BASE_URL`을 바꿀 필요가 없습니다.

## 빌드

```bash
cd proxy-server
docker build -t fizzylush-proxy .
```

## 헬스체크

배포 후:

```text
GET https://<your-host>/health
```

`200` + JSON(`ok`, `service`, `version`, `ts`)이면 정상입니다.

## 환경 변수 (배포 플랫폼에 설정)

| 변수 | 필수 | 설명 |
|------|------|------|
| `PORT` | 아니오 | 기본 `8787` (플랫폼이 주입하면 그 값 사용) |
| `OPENAI_API_KEY` | 예* | OpenAI |
| `NAVER_SHOPPING_CLIENT_ID` / `NAVER_SHOPPING_CLIENT_SECRET` | 예* | 네이버 쇼핑 |
| `OPENWEATHER_API_KEY` | 날씨 기능 시 | |
| `REPLICATE_API_TOKEN` | 가상 착용 시 | |
| `PROXY_TOKEN` | **프로덕션 권장** | 앱 `EXPO_PUBLIC_PROXY_TOKEN`과 동일 |
| `CORS_ALLOWED_ORIGINS` | **프로덕션 권장** | 쉼표로 구분, 예: `https://expo.dev` |
| `PROXY_VERSION` | 아니오 | `/health`에 표시할 버전 문자열 |

\* 사용하는 API에 맞게 설정.

## 플랫폼 예시

- **Railway / Render / Fly.io**: Dockerfile 배포, `PORT`는 보통 자동 설정.
- **HTTPS**: 플랫폼 기본 TLS 사용. 앱에는 `https://...` 만 넣으면 됩니다.

앱 `.env` / EAS Secret:

- `EXPO_PUBLIC_API_BASE_URL=https://<your-host>` (끝에 `/` 없이)
