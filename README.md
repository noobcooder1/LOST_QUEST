# LOST QUEST

분실물 통합 탐색 팀 프로젝트입니다. 기존 React 프론트엔드 프로토타입에 Java 21 + Spring Boot + JPA + MySQL 백엔드의 기본 틀을 추가했습니다.

현재 서버 기능은 **상태 확인과 분실물·습득물 조회**입니다. 기존 화면의 회원·물품 등록·매칭·반환·QR·경험치 기능은 여전히 브라우저 가상 데이터로 동작합니다. 이 데이터를 MySQL에 자동 전송하거나 서버 기능으로 바꾸지 않았습니다. 실제 회원가입/JWT, 쓰기 CRUD, 경찰청 API, AI, AWS 배포는 이번 범위에 포함하지 않습니다.

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
│       │   ├── security/        # SecurityFilterChain, BCrypt
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

환경변수 방식의 PowerShell 예시:

```powershell
cd backend
$env:DB_USERNAME = 'lostquest_app'
$env:DB_PASSWORD = Read-Host '로컬 MySQL 비밀번호' -MaskInput
$env:APP_CORS_ALLOWED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
.\mvnw.cmd spring-boot:run
```

`-MaskInput`은 PowerShell 7.1 이상에서 지원합니다. 이전 PowerShell에서는 아래 로컬 YAML 방식을 사용하세요. macOS/Linux에서는 같은 환경변수를 설정한 터미널에서 `sh ./mvnw spring-boot:run`을 실행합니다.

로컬 YAML 방식:

```powershell
cd backend
Copy-Item application-local.example.yml application-local.yml
# application-local.yml의 계정/비밀번호 자리표시자를 로컬 값으로 편집
.\mvnw.cmd spring-boot:run
```

`backend/`를 작업 디렉터리로 실행해야 `./application-local.yml`을 읽습니다. 두 방식을 동시에 사용하면 YAML의 직접 지정한 `spring.datasource.*` 값이 `DB_*` 자리표시자보다 우선하므로, 한 방식을 선택하세요. `.env*`, `application-local.*`, 개인 키, 빌드 결과는 루트 `.gitignore`로 제외합니다. 예시 파일은 추적 가능합니다.

## API

| 메서드 | 경로 | 동작 |
| --- | --- | --- |
| GET | `/api/health` | `{"status":"OK","service":"LOST QUEST API"}` |
| GET | `/api/lost-items` | 분실물 DTO 배열, 비어 있으면 `[]` |
| GET | `/api/found-items` | 습득물 DTO 배열, 비어 있으면 `[]` |
| GET | `/api/lost-items/{id}` | 분실물 단건, 없으면 JSON 404 |
| GET | `/api/found-items/{id}` | 습득물 단건, 없으면 JSON 404 |

목록은 ID 오름차순입니다. 아직 필터·페이지네이션·등록·수정·삭제 API는 없습니다. 응답에는 `id`, `userId`, 물품 정보, 문자열 상태, `createdAt`이 포함됩니다. 날짜는 `YYYY-MM-DD`, 생성 시각은 UTC ISO 8601입니다. 프론트엔드의 데모 ID·필드·상태와 서버 DTO는 아직 별개이므로 이후 CRUD 연동 단계에서 변환 계층을 추가해야 합니다.

상태: User의 `USER / ADMIN`, 분실물의 `LOST / RETURNED / CLOSED`, 습득물의 `STORED / RETURNED / CLOSED`를 enum 문자열로 저장합니다. 이메일은 고유하며 비밀번호는 BCrypt 해시만 허용합니다. 현재 실제 회원 생성·로그인 API는 제공하지 않습니다.

`/api/health`는 HTTP 서버 응답 확인용이며 DB의 지속적인 readiness 점검은 아닙니다. **JPA·MySQL 경로 확인에는 목록 API도 호출하세요.** DB 연결 및 스키마 준비에 실패하면 정상 애플리케이션 시작이 완료되지 않습니다.

```powershell
Invoke-RestMethod http://localhost:8080/api/health
Invoke-WebRequest http://localhost:8080/api/lost-items | Select-Object -ExpandProperty Content
Invoke-WebRequest http://localhost:8080/api/found-items | Select-Object -ExpandProperty Content
```

## 보안·오류 처리

위 GET API만 공개하며 나머지 요청은 기본 차단합니다. 폼 로그인·HTTP Basic·기본 생성 계정은 사용하지 않습니다. BCrypt `PasswordEncoder`와 메서드 권한 설정을 준비했으며 JWT 발급·검증은 구현하지 않았습니다. 기존 프론트엔드 테스트 로그인은 서버 권한을 부여하지 않습니다. CSRF 방어는 유지합니다. 인증 방식을 결정한 후 쓰기 API, CSRF 정책, CORS 허용 메서드를 함께 설계하세요.

CORS는 설정에 등록된 **정확한 Origin**만 허용합니다. 와일드카드는 거부하며 현재 GET/OPTIONS만 허용합니다. 쿠키 자격증명은 보내지 않습니다. 개발 서버 포트를 변경했다면 Origin도 변경해야 합니다. [Spring Security CORS 안내](https://docs.spring.io/spring-security/reference/6.5/servlet/integrations/cors.html)

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

필드 메시지는 Validation 언어 설정에 따라 달라질 수 있습니다. 존재하지 않는 ID는 404, 잘못된 타입·입력은 400, 데이터 충돌은 409, DB 접근 실패는 503으로 처리합니다. 허용되지 않은 Origin은 Spring의 CORS 계층에서 차단하며 위 MVC JSON 형식을 사용하지 않을 수 있습니다.

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

1. 회원가입·로그인 설계, BCrypt 저장, JWT/세션 방식 결정 및 USER/ADMIN·소유자 권한 테스트
2. 분실물/습득물 쓰기 CRUD, 필터·페이지네이션, DTO와 기존 React 서비스 연결
3. DB 마이그레이션·트랜잭션 규칙을 정한 뒤 이미지 저장, 공공데이터, AI 매칭을 각각 추가

AWS·PWA·QR·반환·보상은 이후 별도 단계에서 구현합니다. 현재 저장소에는 이 기능의 서버 구현이나 실제 배포가 없습니다.
