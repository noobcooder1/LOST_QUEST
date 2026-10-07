# LOST QUEST

분실물 통합 탐색 팀 프로젝트입니다. 기존 React 프론트엔드 프로토타입에 Java 21 + Spring Boot + JPA + MySQL 백엔드의 기본 틀을 추가했습니다.

현재 서버 기능은 **상태 확인, 회원가입·로그인(JWT Bearer)·내 정보 조회, 분실물·습득물 등록(로그인 필요, 사진 1장 선택)과 조회, 등록 사진 조회, 경찰청 유실물 공공데이터 실시간 조회, 내 분실물 기준 습득물 매칭 추천(규칙 기반 점수)**입니다. React의 로그인/회원가입, 물품 등록, 검색 화면(LOST QUEST 자체 등록 + 경찰청 분실물·습득물), 상세 화면, 매칭 추천 화면은 실제 API에 연결되어 있습니다. 반환·QR·경험치 기능과 이를 체험하기 위한 seed 예시 물품은 브라우저 가상 데이터로 동작합니다. 수정·삭제, S3 이미지 저장, AI, AWS 배포는 아직 범위에 포함하지 않습니다.

## 프로젝트 구조

```text
LOST_QUEST/
├── frontend/                    # 기존 React + TypeScript + Vite UI 유지
│   ├── src/components/ApiHealthStatus.tsx
│   ├── src/services/apiClient.ts # 서버 상태 조회, 타임아웃·응답 검증
│   ├── src/pages/               # 기존 페이지
│   ├── .env.example             # 공개 가능한 API 주소 예시
│   └── README.md                # 프로토타입 기능/체험 방법
├── backend/
│   ├── pom.xml                  # Java 21 / Spring Boot 3.5.16 / Maven
│   ├── mvnw, mvnw.cmd           # Maven Wrapper 3.9.14
│   ├── application-local.example.yml
│   └── src/
│       ├── main/java/com/lostquest/
│       │   ├── LostQuestApplication.java
│       │   ├── controller/      # HTTP 입력과 응답 DTO
│       │   ├── service/         # 조회 트랜잭션, 도메인 처리
│       │   ├── repository/      # Spring Data JPA 데이터 접근
│       │   ├── entity/          # User, LostItem, FoundItem, 상태 enum
│       │   ├── dto/             # 비밀번호·이메일을 제외한 응답
│       │   ├── config/          # 설정값 바인딩, CORS
│       │   ├── security/        # SecurityFilterChain, BCrypt, JWT 발급·검증 설정
│       │   └── exception/       # JSON 오류와 RestControllerAdvice
│       ├── main/resources/     # application.yml, application-dev.yml
│       └── test/               # H2 계약 테스트, 선택적 실제 MySQL 테스트
└── 계획서및회의록/                # 기존 기획 자료 유지
```

물품 조회는 `Controller → Service → Repository → MySQL` 순서입니다. Controller는 Repository를 직접 참조하지 않습니다. Service에서 읽기 전용 트랜잭션 안에 Entity를 DTO로 변환하고, Open Session In View는 사용하지 않습니다. User 연관관계는 지연 로딩이며 Entity를 JSON 응답으로 직접 반환하지 않습니다.

## 필요한 개발 환경

- JDK **21 LTS**: `java -version`과 `JAVA_HOME` 확인
- MySQL **8.x**: 로컬 개발은 8.4 LTS 권장
- Node.js **22.12 이상**, npm: 기존 lockfile 사용
- Maven은 Wrapper로 실행 가능하며, 최초 실행 시 다운로드를 위한 인터넷 연결이 필요합니다. 설치된 Maven 3.6.3 이상을 사용해도 됩니다.

Spring Boot 3.5.16은 Java 21을 지원합니다. [공식 요구 사항](https://docs.spring.io/spring-boot/3.5/system-requirements.html)

Windows에서 다른 Java가 기본값이면 **현재 터미널에서만** 변경하세요.

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

## MySQL 준비

MySQL을 설치하고 시작한 뒤 관리 계정으로 접속합니다. `mysql -u root -p`는 비밀번호를 터미널에 직접 입력받습니다. 앱에는 root 대신 별도 개발 계정을 사용합니다.

```sql
CREATE DATABASE lost_quest CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'lostquest_app'@'localhost' IDENTIFIED BY '<직접 정한 로컬 비밀번호>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON lost_quest.* TO 'lostquest_app'@'localhost';
```

`<직접 정한 로컬 비밀번호>`는 실행 전 바꿀 자리표시자입니다. 원격 DB를 사용할 때는 실제 접속 호스트에 맞는 계정·네트워크 설정을 별도로 준비하세요. 이번 구성은 기본적으로 같은 PC의 DB와 API를 사용합니다.

기본 개발 프로필 `dev`에서는 `ddl-auto=update`로 **테이블**을 만듭니다. 데이터베이스와 계정은 먼저 생성해야 합니다. 자동 샘플 데이터 삽입은 없으므로 초기 물품 조회는 `[]`입니다. 스키마를 만든 후 `JPA_DDL_AUTO=validate`로 검증 모드로 실행할 수 있습니다. 향후 운영 환경에는 Flyway 등의 명시적 마이그레이션을 도입하고 `validate`를 사용하세요.

## 백엔드 설정

환경변수 방식 또는 Git에서 제외되는 로컬 YAML 방식 중 하나를 선택합니다. **Spring Boot는 `.env`를 자동으로 읽지 않습니다.** 비밀번호는 Java 소스, 공유 YAML, 프론트엔드 환경변수에 넣지 않습니다.

| 설정 | 기본값/설명 |
| --- | --- |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_NAME` | `lost_quest` |
| `DB_USERNAME` | 필수, 로컬 DB 계정 |
| `DB_PASSWORD` | 필수, 로컬에서만 지정 |
| `DB_URL` | 선택, 전체 JDBC URL로 위 주소 설정을 대체 |
| `SERVER_ADDRESS` | `127.0.0.1`, 로컬에서만 수신 |
| `SERVER_PORT` | `8080` |
| `SPRING_PROFILES_ACTIVE` | 생략하면 `dev` |
| `JPA_DDL_AUTO` | `dev`: `update`, 그 외: `validate` |
| `APP_CORS_ALLOWED_ORIGINS` | `dev`: `http://localhost:5173,http://127.0.0.1:5173` |
| `JWT_SECRET` | **필수**, 32바이트 이상 임의 문자열. 기본값 없음 (미설정·짧으면 시작 실패) |
| `JWT_ACCESS_TOKEN_EXPIRATION` | `1h` (Spring Duration 형식, 예: `30m`, `2h`) |
| `POLICE_LOST_API_SERVICE_KEY` | 경찰청_분실물정보 조회 서비스 인증키. 없으면 분실물 공공데이터만 `503 EXTERNAL_API_NOT_CONFIGURED` |
| `POLICE_FOUND_API_SERVICE_KEY` | 경찰청_습득물정보 조회 서비스 인증키. 없으면 습득물 공공데이터만 503 |
| `POLICE_CODE_API_SERVICE_KEY` | 경찰청_공통코드조회 서비스 인증키. 없으면 지역·분류·색상 필터와 `/api/public-items/filters`만 503 |
| `POLICE_API_BASE_URL` | `https://apis.data.go.kr/1320000` |
| `POLICE_API_CONNECT_TIMEOUT` / `POLICE_API_READ_TIMEOUT` | `5s` / `20s` (분실물 목록은 실제로 7~9초 소요) |
| `IMAGE_STORAGE_LOCAL_DIR` | `./.local/uploads` (실행 디렉터리 기준, `.local/`은 Git 제외). 등록 사진 저장 위치 |

환경변수 방식의 PowerShell 예시:

```powershell
cd backend
$env:DB_USERNAME = 'lostquest_app'
$env:DB_PASSWORD = Read-Host '로컬 MySQL 비밀번호' -MaskInput
$env:APP_CORS_ALLOWED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
# 로컬 전용 JWT 서명 키: 실행할 때마다 새로 만들면 재시작 시 기존 토큰은 무효화됩니다.
$env:JWT_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
.\mvnw.cmd spring-boot:run
```

`-MaskInput`은 PowerShell 7.1 이상에서 지원합니다. 이전 PowerShell에서는 아래 로컬 YAML 방식을 사용하세요. macOS/Linux에서는 같은 환경변수를 설정한 터미널에서 `sh ./mvnw spring-boot:run`을 실행합니다.

로컬 YAML 방식:

```powershell
cd backend
Copy-Item application-local.example.yml application-local.yml
# application-local.yml의 DB 계정/비밀번호와 app.jwt.secret 자리표시자를 로컬 값으로 편집
.\mvnw.cmd spring-boot:run
```

`backend/`를 작업 디렉터리로 실행해야 `./application-local.yml`을 읽습니다. 두 방식을 동시에 사용하면 YAML의 직접 지정한 `spring.datasource.*` 값이 `DB_*` 자리표시자보다 우선하므로, 한 방식을 선택하세요. `.env*`, `application-local.*`, 개인 키, 빌드 결과는 루트 `.gitignore`로 제외합니다. 예시 파일은 추적 가능합니다.

인증 기능 추가 전에 만든 `application-local.yml`을 그대로 쓰는 경우, `JWT_SECRET` 환경변수가 없으면 `app.jwt.secret (JWT_SECRET) must be configured` 오류로 시작이 실패합니다. 예시 파일의 `app.jwt` 블록을 기존 파일에 추가하고, 위 PowerShell 명령으로 직접 생성한 값을 넣으세요. 이 값은 팀원끼리 공유하거나 Git 추적 파일에 적지 않습니다.

## API

| 메서드 | 경로 | 동작 |
| --- | --- | --- |
| GET | `/api/health` | `{"status":"OK","service":"LOST QUEST API"}` |
| GET | `/api/lost-items` | 분실물 DTO 배열, 비어 있으면 `[]` |
| GET | `/api/found-items` | 습득물 DTO 배열, 비어 있으면 `[]` |
| GET | `/api/lost-items/{id}` | 분실물 단건, 없으면 JSON 404 |
| GET | `/api/found-items/{id}` | 습득물 단건, 없으면 JSON 404 |
| GET | `/api/lost-items/{id}/matches` | 내 분실물의 습득물 매칭 추천(LOST QUEST + 경찰청), `Authorization: Bearer <token>` 필요, 작성자 본인만 |
| GET | `/api/notifications` | 내 매칭 알림 목록(최신순, `limit` 1~100) + 읽지 않은 개수, 인증 필요 |
| GET | `/api/notifications/unread-count` | 읽지 않은 매칭 알림 개수, 인증 필요 |
| POST | `/api/notifications/{id}/read` | 알림 읽음 처리(본인 알림만, 다른 사용자 알림은 404), 인증 필요 |
| POST | `/api/notifications/read-all` | 내 알림 모두 읽음, 인증 필요 |
| POST | `/api/notifications/refresh` | 내 최근 분실물 다시 매칭 → 새 후보 알림 생성(분실물별 10분 간격 제한), 인증 필요 |
| POST | `/api/lost-items` | 분실물 등록, `Authorization: Bearer <token>` 필요. `201` + 분실물 DTO |
| POST | `/api/found-items` | 습득물 등록, `Authorization: Bearer <token>` 필요. `201` + 습득물 DTO |
| GET | `/api/images/{filename}` | 등록 사진 조회(공개). 없으면 JSON 404 |
| GET | `/api/public-items/lost` | 경찰청 분실물 목록(공개, 실시간) |
| GET | `/api/public-items/found` | 경찰청 습득물 목록(공개, 실시간) |
| GET | `/api/public-items/lost/{atcId}` | 경찰청 분실물 상세 |
| GET | `/api/public-items/found/{atcId}/{fdSn}` | 경찰청 습득물 상세 |
| GET | `/api/public-items/filters` | 경찰청 공통코드 기반 지역·물품분류·색상 필터 목록 |
| POST | `/api/auth/signup` | 회원가입, 공개. `201` + 사용자 DTO |
| POST | `/api/auth/login` | 로그인, 공개. `200` + Access Token |
| GET | `/api/auth/me` | 현재 사용자, `Authorization: Bearer <token>` 필요 |

목록은 ID 오름차순이며 아직 필터·페이지네이션·수정·삭제 API는 없습니다. 응답에는 `id`, `userId`, 물품 정보, `region`, 문자열 상태, `createdAt`이 포함됩니다. 날짜는 `YYYY-MM-DD`, 생성 시각은 UTC ISO 8601입니다. 프론트엔드는 `frontend/src/services/itemApi.ts`에서 서버 DTO를 화면용 `Item`으로 변환하며, 서버 물품의 화면 ID는 `api-lost-12`/`api-found-7` 형식입니다.

### 물품 등록 API

```jsonc
// POST /api/lost-items   (습득물은 POST /api/found-items, 날짜 필드는 foundDate)
{ "title": "검은색 가죽 지갑", "category": "지갑", "color": "검정",
  "description": "겉면에 작은 스크래치가 있어요.", "lostDate": "2026-09-16",
  "region": "서울", "location": "서울 성동구 서울숲역 3번 출구" }
```

- 요청 본문에는 `userId`, `status`, `imageUrl`이 없습니다. 보내도 무시됩니다. 작성자는 JWT의 사용자 ID로 DB에서 조회한 사용자이고, 상태는 서버가 `LOST`/`STORED`로 정하며, 사진 없이 등록하면 `imageUrl`은 `null`입니다.
- **사진 포함 등록:** 같은 경로에 `multipart/form-data`로 보냅니다. `item` 파트는 위 JSON(`Content-Type: application/json`), `image` 파트는 선택 사항인 파일 1개입니다. 기존 JSON 요청은 그대로 동작합니다.
  - JPEG·PNG·WebP만, 10MB 이하. 클라이언트가 보낸 Content-Type과 **파일 시그니처(매직 넘버)가 모두 일치**해야 하며 SVG·HTML·GIF 등은 `400 INVALID_IMAGE`, 10MB 초과는 `413 IMAGE_TOO_LARGE`입니다.
  - 시그니처 검사 뒤에 **실제 디코드 검증**을 합니다(JPEG·PNG는 JDK ImageIO, WebP는 TwelveMonkeys `imageio-webp`). signature만 있는 파일·잘린 파일·손상된 파일은 `400 INVALID_IMAGE`입니다. 헤더의 해상도를 먼저 읽어 한 변 16,384px 또는 5천만 화소(WebP는 4096×4096) 초과면 디코드 없이 거부하고, JPEG·PNG는 약 100만 화소로 축소 디코드하며 동시 디코드는 2개로 제한해 메모리 사용을 묶어 둡니다. lossy WebP는 형식 특성상 내부 압축 데이터의 무작위 손상까지는 검출하지 못합니다.
  - 원본 파일명은 저장하지 않고 서버가 `UUID.확장자`로 이름을 만듭니다. DB `image_url`에는 `/api/images/{uuid}.{ext}` 형태의 **서버 기준 상대 경로**만 저장하며, 파일 시스템 경로나 `localhost` URL은 저장·응답하지 않습니다. 프론트엔드는 이 값을 `VITE_API_BASE_URL`과 결합해 표시하고, 그 외 형태의 값은 무시하고 종류별 기본 이미지를 씁니다.
  - 사진 저장 후 DB 등록 트랜잭션이 커밋되지 않으면 저장한 파일을 즉시 삭제합니다. 인증 실패·입력 오류는 파일을 저장하기 전에 거부됩니다.
  - 사진은 `GET /api/images/{filename}`로 제공되며 서버가 만든 UUID 형식 이름만 조회할 수 있습니다(경로 조작 불가). `nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, 장기 캐시 헤더를 붙입니다.
  - 저장소는 `ImageStorage` 인터페이스 뒤에 있습니다. 현재 구현은 로컬 디스크(`LocalImageStorage`)이며 S3 구현으로 교체할 수 있습니다. 로컬 사진은 서버를 실행한 PC에만 있으므로 팀원 간에 공유되지 않습니다.
- 검증: 물품명 ≤100자, 종류는 `지갑/전자기기/가방/액세서리/기타`, 색상 ≤30자, 상세 설명 10~2000자, 날짜는 오늘 이전(미래 금지, 서버 JVM 시간대 기준), 지역은 17개 광역 지역(`서울`, `경기` 등), 상세 장소 ≤200자. 위반 시 `400 VALIDATION_ERROR`, 토큰 없음·만료·변조는 `401`입니다.
- **DB 변경:** `lost_items`·`found_items`에 `region VARCHAR(20) NULL` 컬럼이 추가되었습니다. `dev` 프로필(`ddl-auto=update`)은 시작 시 자동으로 추가합니다. `JPA_DDL_AUTO=validate`로 실행하는 DB에는 먼저 다음을 실행하세요. 기존 행은 `region`이 `NULL`이며 화면에는 상세 장소만 표시됩니다.

```sql
ALTER TABLE lost_items ADD COLUMN region VARCHAR(20) NULL;
ALTER TABLE found_items ADD COLUMN region VARCHAR(20) NULL;
```

상태: User의 `USER / ADMIN`, 분실물의 `LOST / RETURNED / CLOSED`, 습득물의 `STORED / RETURNED / CLOSED`를 enum 문자열로 저장합니다. 이메일은 고유하며 비밀번호는 BCrypt 해시만 허용합니다.

### 인증 API

```jsonc
// POST /api/auth/signup  — email(형식, ≤254), password(8~64자, ≤72바이트), nickname(공백 불가, ≤20)
{ "email": "hunter@example.com", "password": "********", "nickname": "로스트헌터" }
// 201
{ "id": 1, "email": "hunter@example.com", "nickname": "로스트헌터", "role": "USER", "createdAt": "2026-09-29T01:30:49Z" }

// POST /api/auth/login
{ "email": "hunter@example.com", "password": "********" }
// 200
{ "accessToken": "<JWT>", "tokenType": "Bearer", "expiresIn": 3600,
  "user": { "id": 1, "email": "hunter@example.com", "nickname": "로스트헌터", "role": "USER", "createdAt": "..." } }

// GET /api/auth/me  (Authorization: Bearer <JWT>) → 200, signup 응답과 같은 사용자 DTO
```

- 이메일은 앞뒤 공백 제거·소문자로 저장하며 중복 가입은 `409 EMAIL_ALREADY_EXISTS`입니다.
- 회원가입 요청에는 권한 필드가 없으며 요청 JSON에 `role`을 넣어도 무시되고 항상 `USER`로 생성됩니다. `ADMIN`은 DB에서 직접 지정해야 합니다.
- 로그인 실패는 이메일 미존재와 비밀번호 불일치를 구분하지 않고 같은 `401 INVALID_CREDENTIALS`를 반환합니다.
- JWT(HS256)에는 `sub`(사용자 ID), `role`, `iat`, `exp`, `iss`만 담고 이메일·비밀번호는 넣지 않습니다. 서명·만료(허용 오차 60초)·발급자를 검증하며, `role`은 `ROLE_USER`/`ROLE_ADMIN` Authority로 매핑되어 `@PreAuthorize("hasRole('ADMIN')")` 등에 사용할 수 있습니다.
- 토큰 없음은 `401 UNAUTHORIZED`, 변조·만료·다른 키 서명은 `401 INVALID_TOKEN`, 인증은 되었지만 허용되지 않은 요청은 `403 FORBIDDEN`입니다.
- 공개 GET API도 잘못된 `Authorization` 헤더를 보내면 401이 됩니다. 공개 API에는 토큰을 붙이지 마세요.

`/api/health`는 HTTP 서버 응답 확인용이며 DB의 지속적인 readiness 점검은 아닙니다. **JPA·MySQL 경로 확인에는 목록 API도 호출하세요.** DB 연결 및 스키마 준비에 실패하면 정상 애플리케이션 시작이 완료되지 않습니다.

```powershell
Invoke-RestMethod http://localhost:8080/api/health
Invoke-WebRequest http://localhost:8080/api/lost-items | Select-Object -ExpandProperty Content
Invoke-WebRequest http://localhost:8080/api/found-items | Select-Object -ExpandProperty Content
```

### 경찰청 공공데이터 API

LOST QUEST 백엔드가 경찰청 OpenAPI(XML)를 실시간으로 호출해 JSON으로 정규화합니다. 브라우저는 경찰청 API나 인증키에 직접 접근하지 않으며, 경찰청 데이터는 MySQL에 저장하지 않습니다.

- 인증키는 `backend/application-local.yml`(Git 제외)의 `app.police-api.lost.service-key` / `app.police-api.found.service-key` / `app.police-api.code.service-key` 또는 위 환경변수로만 설정합니다. 세 키는 서로 독립적으로 사용되어 한쪽이 없거나 실패해도 다른 쪽은 동작합니다. 키·키가 포함된 요청 URL은 응답·로그에 남기지 않습니다.
- 목록 쿼리: `page`(1~1000), `size`(1~50, 기본 20), `from`/`to`(`YYYY-MM-DD`, 기본 최근 30일, 최대 90일, 미래 불가), 필터 `region`·`category`·`subCategory`·`color`(습득물만) 또는 검색어 `q`(물품명)와 `place`(분실물: 분실 장소) / `storagePlace`(습득물: 보관 장소). **경찰청 검색어 API는 날짜·지역·분류·색상 조건을 지원하지 않으므로** 검색어와 함께 보내면 400입니다.
- 필터 값은 `GET /api/public-items/filters`가 경찰청 공통코드조회 서비스(`CmmnCdService`)에서 실시간으로 가져와 12시간 캐시한 목록에서만 허용합니다(코드 하드코딩 없음). 지역은 실제 검색에 동작하는 시·도 코드(`LC?000`)만, 물품분류는 대분류와 세부 분류, 색상은 **같은 이름의 여러 코드를 하나로 묶은 그룹**입니다(예: 블랙(검정) = 2개 코드). 경찰청 API는 색상 코드를 한 번에 하나만 받으므로 색상 그룹은 코드별로 같은 페이지를 조회해 합치며, 한 페이지에 최대 `size × 코드 수`개가 올 수 있습니다. 경찰청 분실물 API는 색상 조건이 없어 분실물에 `color`를 보내면 400입니다.
- 응답 항목: `source=POLICE`, `type`, `sourceId`, `atcId`, `fdSn`, `title`, `subject`, `category`, `categoryPath`, `color`, `date`, `location`, `placeType`, `region`, `storagePlace`, `imageUrl`, `agencyName`, `agencyTel`, `status`, `hour`, `note`, `detail`. 경찰청이 주지 않는 값은 `null`입니다(예: 분실물 목록에는 색상·지역·이미지가 없고 상세에만 있음).
- 이미지: 실제 응답에서 확인한 `https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/...` 형식만 허용하고, "이미지 없음" placeholder나 다른 URL은 `null`(화면에서는 종류별 기본 이미지)로 바꿉니다.
- 외부 오류는 `ApiError` 형식으로 응답합니다: 미설정 503 `EXTERNAL_API_NOT_CONFIGURED`, 시간 초과 504 `EXTERNAL_API_TIMEOUT`, 연결 실패 502 `EXTERNAL_API_UNAVAILABLE`, 인증 실패 502 `EXTERNAL_API_AUTH_ERROR`, 요청 한도 503 `EXTERNAL_API_RATE_LIMITED`, 경찰청 처리 오류 502 `EXTERNAL_API_ERROR`, 해석 불가 응답 502 `EXTERNAL_API_INVALID_RESPONSE`.
- XML은 DTD·외부 엔티티를 거부하는 보안 파서로만 처리합니다(XXE 방지).
- 자세한 실제 API·공통코드 조사 결과는 `계획서및회의록/06_경찰청_OpenAPI_연동.md`를 참고하세요.

### 매칭 추천 API

`GET /api/lost-items/{id}/matches?limit=10` — 로그인한 사용자가 **자신이 등록한 분실물**에 대해 LOST QUEST 습득물과 경찰청 습득물을 함께 비교해 추천합니다. 다른 사용자의 분실물은 403, 없는 분실물은 404, `limit`은 1~20(기본 10)입니다. 사용자는 JWT에서만 결정합니다.

- 점수(총 100): 분류 35 · 지역 25 · 색상 20 · 날짜 20(분실 당일 20, 1~3일 18, 4~7일 12, 8~14일 6, 그 이후·분실 전 습득 0). 40점 미만은 제외하고 매칭도 → 날짜 차이 → ID 순으로 정렬합니다.
- 각 결과에는 `score`, 항목별 `scoreBreakdown`(`MATCH`/`PARTIAL`/`MISMATCH`/`UNKNOWN`), 점수를 받은 항목만 담은 `reasons`, 출처(`LOST_QUEST`/`POLICE`)와 출처별 ID가 포함됩니다. 이미지·AI 점수는 없습니다.
- 후보: LOST QUEST 보관 중 습득물(분실일~+30일, 최대 200건, 본인 등록 제외), 경찰청 습득물(분실일~+14일, 지역 조회 최대 2회 + 전국 1회, 각 50건, 병렬). 경찰청 습득물 목록에는 지역이 없어 지역 조회로 찾은 물품만 지역 점수를 받습니다.
- `sources`에 출처별 상태(`OK`/`PARTIAL`/`UNAVAILABLE`/`SKIPPED`)가 있으며, 경찰청이 실패해도 LOST QUEST 추천은 그대로 반환합니다.
- 자세한 규칙·한계는 `계획서및회의록/07_분실물_매칭_추천.md`를 참고하세요.

### 매칭 알림 API

내 분실물에 대해 **매칭도 70점 이상**의 새 후보가 발견되면 LOST QUEST 안에서 알림을 만듭니다(이메일·SMS·푸시·WebSocket·스케줄러 없음). 점수는 매칭 추천과 같은 엔진을 그대로 사용합니다.

- 생성 시점: ① LOST QUEST 습득물이 등록되어 커밋된 직후, 그 습득물을 기간이 맞는 진행 중 분실물과 비교(경찰청 호출 없음, 실패해도 등록에는 영향 없음) ② `POST /api/notifications/refresh` — 로그인·알림 화면·분실물 등록 시 프론트엔드가 호출하며, 최근 30일 안의 내 진행 중 분실물(최신 5개)을 LOST QUEST + 경찰청으로 다시 매칭해 분실물별 상위 5개 후보 중 새 후보를 기록합니다. 같은 분실물은 10분(`app.notifications.refresh-interval`)에 한 번만 다시 매칭합니다.
- 중복 방지: DB 유일 제약 `(lost_item_id, candidate_key)`. 반복·동시 요청에도 같은 후보 알림은 한 번만 생깁니다.
- 경찰청 장애 시에도 LOST QUEST 후보 알림은 생성되며, `refresh` 응답의 `sources`에 출처별 상태가 표시됩니다. 경찰청 관리번호는 확인된 형식(`F` + 숫자 16자리, 순번 1~999)만 저장합니다.
- 자세한 설계와 검증 결과는 `계획서및회의록/08_매칭_알림.md`를 참고하세요.

## 보안·오류 처리

위 공개 GET API와 `POST /api/auth/signup`·`/api/auth/login`만 인증 없이 허용하고, `GET /api/images/{filename}`과 `GET /api/public-items/...`도 공개하며, `GET /api/auth/me`, `GET /api/lost-items/{id}/matches`(작성자 본인만), `/api/notifications/...`(본인 알림만)와 `POST /api/lost-items`·`/api/found-items`(JSON·multipart)는 인증을 요구하며, 나머지 요청(수정·삭제 등)은 기본 차단합니다. 폼 로그인·HTTP Basic·기본 생성 계정·서버 세션은 사용하지 않습니다(Stateless). JWT 검증은 Spring Security OAuth2 Resource Server(Nimbus)를 사용하며 자체 토큰 파서는 없습니다.

**CSRF 비활성화 이유:** CSRF는 브라우저가 쿠키·세션 같은 자격증명을 요청에 *자동으로* 붙이는 점을 악용합니다. 이 API는 세션·인증 쿠키를 만들지 않고, 자격증명은 프론트엔드 코드가 명시적으로 설정하는 `Authorization: Bearer` 헤더로만 전달되며, 다른 사이트는 이 헤더를 붙인 요청을 만들 수 없습니다(CORS 허용 Origin 제한, `credentials: omit`). 따라서 CSRF 토큰 없이도 위조 요청이 인증되지 않아 CSRF 보호를 끕니다. 이후 쿠키 기반 인증(예: HttpOnly Refresh Token 쿠키)을 도입하면 CSRF 정책을 다시 설계해야 합니다.

CORS는 설정에 등록된 **정확한 Origin**만 허용합니다. 와일드카드는 거부하며 현재 GET/POST/OPTIONS만 허용합니다(POST는 인증 API용). 허용 헤더는 `Accept`, `Content-Type`, `Authorization`입니다. 쿠키 자격증명은 보내지 않습니다. 개발 서버 포트를 변경했다면 Origin도 변경해야 합니다. [Spring Security CORS 안내](https://docs.spring.io/spring-security/reference/6.5/servlet/integrations/cors.html)

정상 응답에는 불필요한 Wrapper를 사용하지 않습니다. MVC·Validation 및 인증/인가 오류는 다음 형태로 응답합니다. 필드의 원래 입력값이나 비밀번호는 오류 JSON에 포함하지 않습니다.

```json
{
  "timestamp": "2026-09-29T00:00:00Z",
  "status": 400,
  "code": "VALIDATION_ERROR",
  "message": "입력값을 확인해 주세요.",
  "path": "/api/lost-items/0",
  "errors": [{ "field": "getLostItem.id", "message": "0보다 커야 합니다" }]
}
```

필드 메시지는 Validation 언어 설정에 따라 달라질 수 있습니다. 존재하지 않는 ID는 404, 잘못된 타입·입력은 400, 인증 실패는 401, 권한 부족은 403, 데이터 충돌은 409, DB 접근 실패는 503으로 처리합니다. 허용되지 않은 Origin은 Spring의 CORS 계층에서 차단하며 위 MVC JSON 형식을 사용하지 않을 수 있습니다.

## React 실행 및 서버 연결 확인

새 터미널에서 기존 프론트엔드를 실행합니다.

```powershell
cd frontend
Copy-Item .env.example .env.local
npm.cmd ci
npm.cmd run dev
```

이미 의존성을 설치했다면 재설치는 필요 없습니다. 기존 `.env.local`이 있다면 덮어쓰지 말고 `VITE_API_BASE_URL=http://localhost:8080` 항목만 추가하세요. `.env.local`을 수정한 뒤에는 Vite를 재시작합니다. `VITE_*`는 브라우저에 공개되므로 DB 비밀번호·API 키를 넣으면 안 됩니다.

1. MySQL과 Spring Boot를 실행합니다.
2. `http://127.0.0.1:5173`의 페이지 하단 **서버 연결 확인** 버튼을 누릅니다.
3. 연결 성공 문구를 확인합니다. 서버 미실행·잘못된 주소·CORS 오류·시간 초과는 화면에 오류로 표시되며 기존 데모 화면은 계속 사용할 수 있습니다.
4. API 주소를 설정하지 않으면 설정 안내가 표시됩니다. 자동 폴링이나 가짜 성공 응답은 없습니다.

**로그인·회원가입**은 `/login`, `/signup` 화면에서 실제 서버 API를 호출합니다(서버가 꺼져 있으면 로그인할 수 없습니다). 가입 후 자동으로 로그인합니다. Access Token은 `sessionStorage`에만 저장되어 같은 탭 새로고침에는 유지되고, 탭·브라우저를 닫으면 사라집니다. 앱 시작 시 저장된 토큰은 `/api/auth/me`로 서버에 확인하며, 401이면 즉시 삭제합니다. 만료 시각이 되면 자동 로그아웃합니다. 토큰은 URL·로그·콘솔에 출력하지 않습니다. 인증이 필요한 요청은 `apiRequest(path, { accessToken })`(`frontend/src/services/apiClient.ts`)로 `Authorization` 헤더를 붙입니다. **매칭 추천**(`/matches`)은 로그인한 사용자의 서버 분실물을 기준으로 실제 추천 API를 호출하며 가상 데이터로 대체하지 않습니다. 헤더 알림 배지와 마이페이지 "알림" 탭의 **매칭 알림**도 서버 데이터만 사용합니다(반환 체험 소식은 별도 데모 섹션). 반환·경험치와 seed 예시 물품은 여전히 브라우저 데모 데이터입니다.

기존 화면과 체험 흐름은 [프론트엔드 README](frontend/README.md)를 참고하세요.

## 빌드와 테스트

```powershell
cd backend
.\mvnw.cmd verify
# 실행 가능한 JAR: target/lost-quest-api-0.1.0-SNAPSHOT.jar
# DB 설정이 있는 같은 터미널에서:
java -jar target/lost-quest-api-0.1.0-SNAPSHOT.jar

cd ../frontend
npm.cmd test
npm.cmd run build
```

기본 백엔드 테스트는 **test scope의 H2**로 실행하여 MySQL 없이 API·JPA 매핑·Validation·CORS·보안을 검증합니다. H2는 실행 JAR에 포함되지 않으며 실제 MySQL 호환성 검증을 대신하지 않습니다.

별도 MySQL 계약 테스트도 제공합니다. 테스트 계정이 접근 가능한 **`lost_quest_test` 또는 `lost_quest_smoke` 전용 DB**를 생성한 후 다음을 실행합니다. 이 테스트는 매 테스트 전에 해당 DB의 물품·사용자 데이터를 비우므로 개발 DB와 계정을 공유하지 마세요. 지정된 테스트 DB 이름이 아니면 연결 전에 실패하며 H2로 대체하지 않습니다.

```powershell
cd backend
$env:MYSQL_TEST_URL = 'jdbc:mysql://127.0.0.1:3306/lost_quest_test?connectionTimeZone=UTC'
$env:MYSQL_TEST_USERNAME = 'YOUR_TEST_DB_USER'
$env:MYSQL_TEST_PASSWORD = Read-Host '테스트 DB 비밀번호' -MaskInput
.\mvnw.cmd -Pmysql-it verify
```

## 다음 단계

1. 분실물/습득물 수정·삭제(작성자 권한 확인), 서버 측 필터·페이지네이션, 내 등록 물품 조회
2. 이미지 저장소 S3 전환, 경찰청 공공데이터 캐시, 매칭 추천에 이미지 유사도 항목 추가
3. DB 마이그레이션·트랜잭션 규칙을 정한 뒤 이미지 저장, 공공데이터, AI 매칭을 각각 추가

AWS·PWA·QR·반환·보상은 이후 별도 단계에서 구현합니다. 현재 저장소에는 이 기능의 서버 구현이나 실제 배포가 없습니다.
