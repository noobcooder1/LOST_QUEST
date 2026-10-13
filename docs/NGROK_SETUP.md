# ngrok 고정 개발 주소로 로컬 API 연결

Sites의 React → ngrok HTTPS 주소 → PC의 Spring Boot `8080` → MySQL 순서로 연결합니다. MySQL 포트를 외부에 공개하지 않습니다.

## 최초 설정 (Windows)

1. [ngrok 대시보드](https://dashboard.ngrok.com/)에서 무료 계정에 가입하고 로그인합니다.
2. 백엔드를 실행하는 PC의 터미널에서 설치합니다. Microsoft Store 약관은 직접 확인하고 동의합니다.

   ```powershell
   winget install ngrok -s msstore
   ```

3. 새 터미널을 열고 `ngrok version`으로 설치를 확인합니다. 대시보드에 표시되는 `ngrok config add-authtoken` 명령을 본인 터미널에서 실행합니다. 토큰은 채팅·Git·README·`VITE_*` 환경변수에 넣지 않습니다. 계정 설정은 ngrok이 관리하는 사용자 로컬 설정에 저장합니다.
4. MySQL과 Spring Boot를 실행하고 `http://localhost:8080/api/health`의 `OK` 응답을 확인합니다.
5. 다음 명령을 실행하고 터미널을 켜 둡니다.

   ```powershell
   ngrok http 8080
   ```

   프로젝트 루트에서 `& ./scripts/start-api-tunnel.ps1`을 실행해도 됩니다. 스크립트는 ngrok 설치 여부와 백엔드 health를 확인한 뒤 터널을 실행하며, 인증 토큰을 읽거나 저장하지 않습니다.

6. `Forwarding`에 표시되는 HTTPS 기본 주소만 공유합니다. `/api/health` 경로나 인증 토큰은 포함하지 않습니다.

## Sites에 반영

기존 Site ID와 공개 범위를 유지합니다. 배포용 체크아웃 `.local/sites/lost-quest/.env.production`의 `VITE_API_BASE_URL`에 위 HTTPS 기본 주소를 지정하고 React를 다시 빌드·배포합니다. 원본 `frontend/.env.local`의 localhost 설정은 유지합니다. Vite 설정은 빌드 시 포함되므로 파일만 수정해서는 배포된 사이트에 적용되지 않습니다.

백엔드 CORS는 요청을 보내는 **Sites 주소**(`https://lost-quest-seho-8e2c.yseho.chatgpt.site`)를 허용해야 합니다. API 터널 주소를 CORS Origin에 추가하는 방식이 아닙니다. 현재 개발 설정에는 위 Sites Origin이 포함되어 있습니다.

배포 전 health·물품 조회 JSON과 Sites Origin의 OPTIONS 응답을 확인하고, 배포 후 이미지 조회와 로그인·물품 이용 흐름도 확인합니다. API 클라이언트는 `Accept: application/json`을 사용하며, ngrok 개발 호스트(`*.ngrok-free.dev`, `*.ngrok-free.app`)에는 공개 헤더 `ngrok-skip-browser-warning: 1`을 추가합니다. 이 값은 인증 토큰이 아닙니다. 백엔드 CORS에서 해당 헤더를 허용하며, 변경 후에는 백엔드를 재시작합니다. ngrok의 물품 사진은 헤더를 붙인 fetch로 가져와 임시 blob URL로 표시하고, 화면 전환 시 해제합니다. 일반 정적·경찰청 이미지는 기존 방식으로 표시합니다.

## 다음 실행부터

동일 계정의 자동 할당 개발 도메인을 유지하면 `ngrok http 8080`을 다시 실행해도 API 주소를 매번 교체할 필요가 없습니다. MySQL·Spring Boot·ngrok이 모두 실행되어 있어야 서버 기능을 사용할 수 있습니다. PC 종료나 터널 종료 시 연결이 끊깁니다. 계정 또는 개발 도메인을 바꾸는 경우에는 Sites의 API 주소를 다시 빌드·배포합니다.

무료 요금제는 사용량 제한이 있는 개발·시연용 연결입니다. [고정 개발 도메인과 무료 제한](https://ngrok.com/docs/pricing-limits/free-plan-limits), [Windows 설치 공식 안내](https://ngrok.com/download/windows)를 참고하세요.

2026-10-13 기존 Sites를 버전 4로 업데이트하여 `https://gratify-amuck-grove.ngrok-free.dev` 연결을 검증했습니다. 배포와 테스트 기록은 [SITES_DEPLOYMENT.md](SITES_DEPLOYMENT.md)에서 확인합니다.
