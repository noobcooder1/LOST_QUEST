# 모바일 Sites 배포

- PC용 사이트: https://lost-quest-seho-8e2c.yseho.chatgpt.site
- 모바일 사이트: https://lost-quest-mobile-seho.yseho.chatgpt.site
- 모바일 프로젝트 ID는 `.openai/hosting.json`을 사용한다. PC 프로젝트 ID로 덮어쓰지 않는다.
- 두 화면은 같은 Spring Boot API와 MySQL을 사용한다. 로그인 상태는 사이트별로 별도 저장된다.

## 빌드

PowerShell에서 `frontend-mobile` 폴더로 이동한 후 실행한다.

```powershell
$env:VITE_API_BASE_URL = "https://mining-possibility-manufacture-objective.trycloudflare.com"
$env:VITE_REMOTE_VISION_MODELS = "true"
npm test
npm run build
```

Cloudflare 임시 주소가 바뀌면 `VITE_API_BASE_URL`을 실제 주소로 바꿔 빌드하고, 모바일과 PC Sites를 각각 업데이트한다. 배포 대상은 모바일의 `dist`이다. 모델은 브라우저가 다운로드하므로 `dist/models`는 포함하지 않는다. `.env.local`의 개발용 5174 프록시 주소를 배포에 사용하지 않는다.

## 백엔드 CORS

백엔드의 기존 PC·로컬 개발 허용 주소를 유지하면서 다음 주소를 추가해야 한다.

```text
https://lost-quest-mobile-seho.yseho.chatgpt.site
```

개발 프로필 `backend/src/main/resources/application-dev.yml`의 기본 허용 목록에도 모바일 주소를 추가했다. 현재 실행 중인 기존 JAR에는 승인 후 다음 실행 인자를 추가하여 반영했다. 같은 기존 JAR을 수동으로 다시 실행할 때도 이 인자를 유지해야 하며, 최신 소스로 재빌드하면 개발 프로필의 기본 목록에 포함된다.

```text
--app.cors.allowed-origins=http://localhost:5173,http://127.0.0.1:5173,https://lost-quest-seho-8e2c.yseho.chatgpt.site,https://lost-quest-mobile-seho.yseho.chatgpt.site
```

`APP_CORS_ALLOWED_ORIGINS`를 별도로 지정할 때도 기존 목록과 모바일 주소를 함께 설정한다. 와일드카드로 모든 사이트를 허용하지 않는다. DB 스키마나 사용자 데이터를 바꿀 필요는 없다.

## 확인

모바일 사이트의 홈·탐색·로그인 화면과 상세 주소 직접 접속을 확인한다. 모바일 브라우저의 API 요청이 Cloudflare 주소로 전송되고 정상 응답하는지, PC 사이트도 계속 연결되는지 확인한다. 로그인·등록 등 쓰기 검증은 승인된 전용 계정·데이터로만 한다.
