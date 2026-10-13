# Sites 배포 및 검증

검증일: 2026-10-13. React는 Sites에 배포되어 있으며 ngrok의 고정 개발 주소를 통해 로컬 Spring Boot·MySQL에 연결됩니다. PC의 MySQL·백엔드·터널 프로세스가 실행되는 동안 연결됩니다.

## 현재 ngrok 연결 결과

- 사이트: `https://lost-quest-seho-8e2c.yseho.chatgpt.site`
- API: `https://gratify-amuck-grove.ngrok-free.dev` → `http://localhost:8080`
- Sites 버전 4, 배포 상태 `succeeded`
- 배포 소스 커밋: `a93b8d584d91911d9db5cf65572b80de389766be`
- 배포 ID: `appgdep_6acd7d80a6bc8191a0d40e160b9c9543`
- 기존 Site ID와 공개 범위를 유지했습니다. 원본 `frontend/.env.local`과 기존 UI도 유지합니다.
- 프론트엔드 전체 테스트: 28개 파일·305개 통과. 배포 체크아웃에서 TypeScript·Vite 빌드 및 소스 패키징 성공.
- 백엔드 health·CORS 테스트: 7개 통과, Java 21 실행 JAR 빌드 성공. 사용자가 백엔드를 재시작하여 CORS 변경을 적용했습니다.
- 실제 ngrok 경유 health·분실물·습득물 조회: HTTP 200 JSON, 정확한 Sites Origin 허용.
- GET·POST·PUT·DELETE preflight: HTTP 200, Authorization·Content-Type·ngrok 헤더 허용. 미허용 Origin은 HTTP 403.
- 기존 물품 사진: HTTP 200 `image/jpeg`, 정확한 Sites Origin 허용. 검증 요청은 읽기 전용이며 개발 DB에 레코드를 생성·수정·삭제하지 않았습니다.
- 배포 HTML·JS: HTTP 200, 새 ngrok 주소와 우회 헤더 포함, 이전 Cloudflare API 주소 미포함. `/login` 직접 접근도 동일 React 진입 번들과 root를 반환합니다.

ngrok 개발 호스트에는 `ngrok-skip-browser-warning: 1`을 보내 방문 안내 페이지를 건너뜁니다. 이 헤더는 공개 값이며 인증 토큰이 아닙니다. 일반 `<img>`는 헤더를 보낼 수 없어 ngrok의 `/api/images/` 사진은 fetch로 가져와 임시 blob URL로 표시합니다. 출처 변경·컴포넌트 해제 시 요청을 중단하고 blob URL을 해제합니다. 일반 정적·경찰청 이미지는 기존 방식입니다. 전체 회원가입·반환 흐름의 실제 브라우저 체험은 별도 확인 항목입니다.

같은 ngrok 계정과 개발 도메인을 유지하면 터널 재실행 때마다 API 주소를 바꾸거나 Sites를 재배포할 필요가 없습니다. MySQL·Spring Boot·ngrok을 계속 실행해야 서버 기능을 사용할 수 있습니다. 최초 설정과 실행 방법은 [NGROK_SETUP.md](NGROK_SETUP.md)를 참고하세요.

## 이전 Cloudflare Quick Tunnel 연결 기록 (2026-10-12)

- 사이트: `https://lost-quest-seho-8e2c.yseho.chatgpt.site`
- API: `https://sustainability-algorithm-book-taking.trycloudflare.com` → `http://localhost:8080`
- Sites 배포: 버전 3, `succeeded`
- 배포 커밋: `ef9682af64b1a48e5302dc5ea6f3d44fcf16f578`
- 배포 ID: `appgdep_6accd00849ac8191b52025b399215c51`
- 현재 Sites 공개 설정을 유지했습니다. 접근 범위를 변경하지 않았습니다.
- 최초 연결 시 백엔드 CORS 테스트 7개·Java 21 JAR 빌드를 검증했습니다. 이번 업데이트는 충돌 해결 후의 프론트엔드 소스(워크스페이스 `129e879`)를 동기화하여 전체 테스트 26개 파일·290개와 배포 빌드가 통과했습니다.
- 물품글 수정·삭제 메뉴, 수정 페이지, PUT/DELETE API 호출 변경이 반영되었습니다. 의존성 입력은 변경되지 않아 중복 설치하지 않았습니다.
- 기존 Quick Tunnel이 530 오류로 종료되어 사용자가 새로 실행한 위 주소로 교체했습니다.

| 실제 연결 검증 | 결과 |
| --- | --- |
| Sites Origin으로 로컬·터널 `/api/health` 요청 | 양쪽 HTTP 200 및 정확한 `Access-Control-Allow-Origin` |
| Sites Origin으로 로컬·터널 분실물·습득물 조회 | 양쪽 HTTP 200, JSON 응답 |
| 로그인·물품 등록·반환 요청 POST preflight | 양쪽 HTTP 200, `Authorization`·`Content-Type` 허용 |
| 물품 수정·삭제 PUT/DELETE preflight | 새 터널과 로컬 서버에서 HTTP 200, 정확한 Sites Origin과 헤더 허용 |
| 미허용 Origin | HTTP 403, 기존 차단 유지 |
| 배포 HTML·React 번들 | HTTP 200, 터널 주소 포함, localhost API 주소 미포함 |
| `/login` 직접 접근 | HTTP 200, 동일 React 진입점 반환 |

최초 연결 시 백엔드는 사용자 콘솔에서 재시작하여 새 CORS를 적용했습니다. 이번 업데이트에서는 현재 실행 중인 서버의 응답을 읽기 전용으로 검증했으며 서버 재시작이나 개발 DB 레코드 생성·수정·삭제를 수행하지 않았습니다. 실제 회원가입부터 반환 및 물품 수정·삭제까지의 전체 브라우저 체험은 별도 확인 항목입니다.

## 로컬에서 확인한 항목

| 검증 | 결과 | 범위 |
| --- | --- | --- |
| `frontend`: `npm test` | 24개 파일, 255개 테스트 통과 | API 클라이언트·화면·인증·물품·반환 등 기존 자동 테스트 |
| `frontend`: `npm run build` | 성공 | TypeScript 검사와 Vite 정적 번들 |
| `backend`: Java 21, `mvnw.cmd verify` | 295개 테스트 통과, JAR 빌드 성공 | 기본 자동 테스트. DB는 테스트용 H2이며 실제 MySQL 전체 계약 테스트를 의미하지 않음 |
| `http://localhost:8080/api/health` | HTTP 200, `OK` | 현재 실행 중인 Spring Boot의 실제 응답 |
| `/api/lost-items`, `/api/found-items` | HTTP 200, JSON | 현재 로컬 서버를 통한 물품 DB 조회 |
| `/api/public-items/filters` | HTTP 200, JSON | 필터 코드 조회 엔드포인트. 경찰청 전체 조회의 정상 동작을 의미하지 않음 |
| 로컬 개발 Origin 2개 | HTTP 200, 해당 Origin 허용 | `http://localhost:5173`, `http://127.0.0.1:5173` |
| 미허용 Origin | HTTP 403 | `https://untrusted.example` 차단 |
| 최초 배포 시 Sites Origin preflight | HTTP 403 | 당시 미허용. 현재 연결 결과는 위 표에서 확인 |
| `http://127.0.0.1:5173/` | HTTP 200 | 현재 React 개발 서버 응답 |

이번 검증에서는 기존 개발 DB의 레코드를 생성·수정·삭제하지 않았습니다. 사용자 브라우저에서 전체 이용 흐름을 다시 수동 체험한 검증은 포함하지 않습니다.

## Sites 프론트엔드 구성

2026-10-12 Sites의 네이티브 배포 결과 `succeeded`와 접속 URL을 확인했습니다. 이 성공은 React 정적 프론트엔드 배포에 대한 결과입니다.

- 배포 소스 커밋: `e057c069a6ddcaefb0117fb044afccd24b38e8c6`
- 배포 ID: `appgdep_6accc509be4881919dc0ea493ade8c30`

- Site ID: `appgprj_6accc36c35108191a501f6061ba9d0e7`
- 주소: `https://lost-quest-seho-8e2c.yseho.chatgpt.site`
- 접근 범위: 현재 공개 설정을 유지합니다. 최초 배포 후 변경된 설정을 네이티브 Sites 조회로 확인했습니다.
- 정적 출력: `dist`, React Router 직접 접근·새로고침은 `single-page-application` fallback 사용
- 원본 연결 정보: `frontend/.openai/hosting.json`
- 배포용 소스: `.local/sites/lost-quest/`의 독립 체크아웃. 원본 프로젝트의 Git 저장소·백엔드·로컬 설정과 분리합니다.
- `.env.local`, DB 접속 정보, JWT·경찰청 키, 사용자 업로드 파일, 개발 DB 및 Spring Boot 소스는 업로드하지 않습니다.
- 배포용 체크아웃의 `.env.production`에 위 터널 API 주소를 지정했습니다. 이 파일에는 공개 API 주소만 들어 있으며 비밀값은 없습니다. 원본 프론트엔드의 코드와 로컬 API 설정은 유지합니다.
- `backend/src/main/resources/application-dev.yml`의 기본 CORS 목록에 Sites Origin을 추가했습니다. 기존 localhost Origin 2개를 유지하며 와일드카드는 사용하지 않습니다.

## 실제 서버 배포 후 확인할 항목

| 항목 | 필요한 준비 |
| --- | --- |
| 상시 Sites → Spring Boot 연결 | 현재 임시 터널 검증 완료. 상시 HTTPS 서버 또는 고정 터널 주소 준비 |
| 배포 환경의 CORS·OPTIONS | 현재 로컬 서버 검증 완료. 상시 서버에서도 동일한 Sites Origin 설정 |
| 회원가입·로그인·JWT·권한 | 배포 환경의 인증 설정 및 별도 테스트 계정 |
| 물품 CRUD·사진 업로드·이미지 조회 | 배포 DB와 영속 이미지 저장소, 업로드 제한 및 응답 확인 |
| 검색·공공데이터·매칭·반환·알림 | 실제 서버 데이터·API 설정과 각 기능의 이용 흐름 확인 |
| DB 영속성·재시작·동시 요청 | 배포 환경에서 MySQL 연결, 마이그레이션, 백업 정책 확인 |
| 모바일·브라우저 직접 접근 및 새로고침 | 로그인한 사용자의 배포 URL에서 `/search`, `/login`, `/matches` 등 확인 |

Sites는 정적 React를 호스팅하며 Spring Boot JVM과 MySQL은 현재 PC에서 실행됩니다. 현재는 위 ngrok 주소를 사용합니다. API 도메인을 변경하거나 상시 서버로 이전하면 배포용 체크아웃의 `.env.production`에서 **공개 API 기본 주소**를 수정하고 같은 Site ID에 다시 빌드·배포합니다. `/api` 경로는 붙이지 않습니다. `VITE_*`는 공개되므로 인증 비밀값을 넣지 않습니다.

배포용 체크아웃은 이번 시점의 소스 복사본입니다. 이후 원본 변경사항은 자동 동기화되지 않으므로 다음 배포 전에 수정된 프론트엔드 소스를 반영해야 합니다. Site를 새로 만들지 않고 기존 ID와 접근 범위를 유지합니다.
