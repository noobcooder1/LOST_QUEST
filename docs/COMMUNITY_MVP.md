# LOST QUEST 사용자 물품 커뮤니티 MVP

## 2026-10-14 후속 검증 및 적용

아래 2026-10-13 보고서의 미적용·Java 21 미검증 상태는 이번 후속 작업으로 갱신합니다.

- 로컬 MySQL을 시작하고 `.local/community-before-migration.sql`에 mysqldump 백업을 저장한 뒤 새 백엔드를 실행했습니다. `dev` 프로필의 `ddl-auto=update`로 로컬 `lost_quest`에 커뮤니티 테이블과 숨김 컬럼을 추가했습니다. 기존 데이터는 초기화하지 않았습니다. 백업은 Git에 포함하지 않습니다.
- Java 21.0.10에서 백엔드 325개 테스트, 실제 MySQL 격리 테스트 62개, JAR 패키징 및 서버 실행이 통과했습니다. 프론트엔드 370개 테스트와 TypeScript/Vite 빌드도 다시 통과했습니다.
- 실제 Chrome의 분리된 작성자·질문자·제3자 세션으로 MySQL 게시글 상세 → 질문 전송 → 작성자 질문함 답변 → 질문자 답변 조회를 검증했습니다. 제3자의 비공개 질문 상세 접근은 HTTP 403입니다. 커뮤니티 목록과 모바일 화면도 확인했습니다.
- 전용 검증 계정 3개와 비공개 질문 기록은 로컬 DB에 남고, 검증 게시글은 기존 삭제 API로 소프트 삭제했습니다. 브라우저 스크립트와 캡처는 `.local/`에 보관합니다.
- 최종 ADMIN 반환·QR 재사용·XP 중복 지급 방지는 실제 MySQL 통합 테스트로 검증했습니다. 실제 ADMIN 계정으로 수행하는 전체 브라우저 반환 시연은 별도로 남습니다. 기존 계정의 관리자 권한은 변경하지 않았습니다.
- 사용자 요청에 따라 커뮤니티 구현을 GitHub에 커밋·푸시합니다. 기존 로고·레이아웃·배포 문서·회의록 변경은 이번 커밋에서 제외합니다. Sites 배포와 ngrok 변경은 진행하지 않습니다. 다른 운영 환경의 DB 스키마는 해당 환경에서 백업 후 적용해야 합니다.

---

## 독립 리뷰 후속 안정화 — 2026-10-14

- H1: 실제 TypeScript/Vite 파일 누락을 확인했습니다. 사용자 승인 후 5173 Vite만 종료하고 잠금 파일 기준 `npm ci`로 복구했습니다. 설치된 전역 Node 24.14.1은 jsdom 등의 최소 요구보다 낮으므로 `.local/h1-runtime`의 Node 24.15.0으로 설치·검증·개발 서버를 실행했습니다. `package.json`과 `package-lock.json`은 수정하지 않았습니다. PowerShell의 기존 npm 래퍼가 전역 node.exe를 선택하므로 검증 시에는 Node 24.15.0으로 `C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js`를 직접 실행했습니다.
- M1: `MatchNotificationWriter`가 기존 습득물 → 분실물 잠금 순서에서 두 물품의 `hidden`을 다시 확인합니다. 알림 목록·단건·읽지 않음 집계의 공통 `VISIBLE` 조건도 두 물품의 숨김 상태를 제외합니다. 기존 CLOSED 조건은 유지합니다.
- 경합 검증: `HiddenMatchNotificationRaceTest`는 실제 H2 트랜잭션 두 개를 서로 다른 스레드에서 실행합니다. 관리자의 `CommunityService.hide` 트랜잭션을 열린 채 유지하고 오래된 매칭 스냅샷으로 writer를 시작합니다. `INFORMATION_SCHEMA.SESSIONS`의 `BLOCKER_ID`와 `FOR UPDATE` 실행 문장을 확인한 뒤 숨김 트랜잭션을 커밋합니다. writer가 대기 후 false를 반환하고 행을 생성하지 않는지 분실물·습득물 각각 검증합니다. 이는 순차 호출 테스트가 아닙니다. 별도 3개 테스트는 남아 있는 오래된 행의 목록·단건·미읽음 제외를 검증합니다. MySQL/InnoDB 경합을 이번에 검증했다고 주장하지 않습니다.
- M2: 작성자 권한 확인 후 숨김 상태에는 정확한 409 메시지를 반환합니다. 마이페이지 API의 `hidden` 필드를 UI로 전달하고 숨김 글은 안내문이 있는 비링크 카드로 표시합니다. 공개 상세 404, 타인 수정/삭제 403, 비인증 삭제 401, 반환 내역·관리자 정책을 유지합니다.
- 이번 작업은 코드·의존성 복구·로컬 검증만 수행하며 commit/push/PR/Sites 배포/ngrok 변경과 실제 관리자 계정 변경을 하지 않습니다. 실행 중인 8080 서버는 이전 JAR이므로 이번 서버 수정은 승인된 재시작 때 적용해야 합니다.

검증 결과:

| 검증 | 결과 |
| --- | --- |
| 프론트엔드 전체 | 34개 파일, 373개 테스트 통과, 실패 0 |
| TypeScript | `tsc -b` 종료 코드 0 |
| Vite 빌드 | 성공 |
| Java 21 백엔드 전체/H2 | 332개 테스트, 실패/오류/스킵 0 |
| 신규 알림 검증 (전체에 포함) | 실제 잠금 경합 2개 + 조회 방어 3개 통과 |
| 커뮤니티 검증 (전체에 포함) | 13개 통과, 신규 숨김 권한/오류 검증 2개 포함 |
| Chrome 화면 | API fixture를 사용한 실제 데스크톱/모바일 표시, 숨김 글 링크 없음, 일반 글 링크 유지, 가로 넘침/JS 오류 없음 |
| MySQL 재실행 | 수행하지 않음: 별도 테스트 DB 미확인 |
| MySQL 실행 도구 | Java 21 컴파일, 필수 설정 누락/업무 DB명 거절 확인, JDBC 접속 없음 |
| 기존 작업 보존 | 로고·Layout·styles·배포 문서·회의록 및 package/lock 파일의 작업 전후 SHA-256 일치 |

위 Chrome 검증은 실제 DB 숨김 흐름을 수행한 결과와 구분합니다. 이번 작업에서 업무 MySQL에는 쓰지 않았습니다. 캡처와 로그는 `.local/stabilization-*`에 있습니다. 기존 커뮤니티·매칭·경찰청 실패 격리·반환 회귀 테스트는 전체 실행에 포함됩니다.

이번 안정화 변경 파일 (15개, 기존 미커밋 파일 제외):

- `backend/src/main/java/com/lostquest/dto/FoundItemResponse.java`
- `backend/src/main/java/com/lostquest/dto/LostItemResponse.java`
- `backend/src/main/java/com/lostquest/repository/MatchNotificationRepository.java`
- `backend/src/main/java/com/lostquest/service/FoundItemService.java`
- `backend/src/main/java/com/lostquest/service/LostItemService.java`
- `backend/src/main/java/com/lostquest/service/notification/MatchNotificationWriter.java`
- `backend/src/test/java/com/lostquest/controller/CommunityControllerTest.java`
- `backend/src/test/java/com/lostquest/service/notification/HiddenMatchNotificationRaceTest.java`
- `backend/scripts/CommunityMySqlCheck.java`
- `frontend/src/components/MyItemList.tsx`
- `frontend/src/components/myItemList.test.tsx`
- `frontend/src/services/itemApi.ts`
- `frontend/src/services/myItemsApi.test.ts`
- `frontend/src/types.ts`
- `docs/COMMUNITY_MVP.md`

남은 사항: 현재 8080의 이전 JAR을 새 코드로 빌드/재시작한 뒤 실제 ADMIN 계정으로 신고 → 숨김 → 마이페이지 표시/알림 제외 → 기존 진행 중 반환 유지 흐름을 두 브라우저에서 확인해야 합니다. MySQL 잠금 경합은 별도 테스트 DB에서 후속 검증해야 합니다. `npm audit`는 기존 잠금 파일의 전이 의존성 `source-map-js`에 high 1건을 보고했습니다. 이번 범위에서는 잠금 파일을 변경하지 않았습니다. 전역 Node 버전도 바꾸지 않았으므로 이후 실행에는 지원되는 Node를 선택해야 합니다. 코드 수준 시연 준비는 통과했으나 현재 8080 프로세스에 안정화 수정이 적용되었다고 볼 수는 없습니다.

Vite 재실행 (프로젝트 루트에서, 현재 서버가 종료되어 있을 때):

```powershell
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8080'
Set-Location frontend
& ../.local/h1-runtime/node_modules/node/bin/node.exe node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
```

### M3: 기존 MySQL 통합 테스트 재현

기존 **62개**는 아래 6개 클래스의 실행 결과입니다. `MySqlIntegrationIT`나 `mysql-test` 프로필을 실행한 결과가 아닙니다.

| 실행 클래스 | 19fd1db 당시 | 이번 수정 후 실행 대상 개수 |
| --- | ---: | ---: |
| `CommunityControllerTest` | 11 | 13 |
| `CommunityWriteLimiterTest` | 1 | 1 |
| `ItemControllerTest` | 12 | 12 |
| `ItemManagementControllerTest` | 12 | 12 |
| `ItemImageUploadTest` | 15 | 15 |
| `ReturnControllerTest` | 11 | 11 |
| 합계 | 62 | 64 |

이 클래스들은 `@ActiveProfiles("test")`로 실행합니다. 기본 `application-test.yml`은 H2이며, MySQL 재현 시 아래 환경변수로 datasource와 JPA 설정을 덮어씁니다. 커뮤니티 경합의 H2 세션 확인 테스트는 이 MySQL 실행 목록에 포함하지 않습니다.

기존 실행 도구는 Git에서 제외된 `.local/CommunityMySqlCheck.java`였고 로컬 설정의 업무 스키마 안에 접두사 테이블을 만들었습니다. **이번부터 그 도구를 재사용하지 마세요.** 재현 가능한 `backend/scripts/CommunityMySqlCheck.java`를 추가했습니다. 이 도구는 로컬의 별도 테스트 DB만 허용하며 `application-local.yml`을 읽지 않습니다.

실행 전 별도 MySQL 인스턴스 또는 `lost_quest_test`/`lq_test_*` 테스트 스키마와 그 스키마에만 권한이 있는 테스트 계정을 준비합니다. 업무 DB명 `lost_quest`는 도구에서 거절합니다. URL에 인증정보/옵션을 넣거나 원격 호스트를 지정하는 것도 거절합니다. 도구는 스키마를 생성하거나 초기화하지 않습니다. 준비된 DB가 없으면 아래 명령을 실행하지 마세요. 이번 안정화에서는 별도 DB가 확인되지 않아 MySQL 재실행을 하지 않았습니다.

PowerShell에서 `backend/`를 작업 디렉터리로 사용합니다. 아래 환경변수는 **테스트 전용**입니다. 비밀번호는 화면 출력·Git·명령 인자에 넣지 않습니다.

```powershell
$env:JAVA_HOME = 'C:/Program Files/Java/jdk-21.0.10' # 자신의 Java 21 경로
$env:Path = "$env:JAVA_HOME/bin;$env:Path"
$env:MYSQL_TEST_URL = 'jdbc:mysql://127.0.0.1:3306/lost_quest_test'
$env:MYSQL_TEST_USERNAME = 'lq_test_runner' # 테스트 스키마에만 권한이 있는 계정
$env:MYSQL_TEST_PASSWORD = Read-Host '테스트 DB 비밀번호' -MaskInput
$env:MYSQL_TEST_CONFIRM = 'isolated-test-database'
try {
    New-Item -ItemType Directory -Force ../.local | Out-Null
    .\mvnw.cmd dependency:build-classpath '-Dmdep.includeScope=test' '-Dmdep.outputFile=../.local/community-test-classpath.txt'
    if ($LASTEXITCODE -ne 0) { throw 'Classpath 생성 실패' }
    $taskClasspath = (Get-Content ../.local/community-test-classpath.txt -Raw).Trim()
    java --class-path $taskClasspath scripts/CommunityMySqlCheck.java
    if ($LASTEXITCODE -ne 0) { throw 'MySQL 검증 실패: ../.local/community-mysql-reproduction.log 확인' }
} finally {
    Remove-Item Env:MYSQL_TEST_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:MYSQL_TEST_URL,Env:MYSQL_TEST_USERNAME,Env:MYSQL_TEST_CONFIRM -ErrorAction SilentlyContinue
}
```

도구가 Maven 자식 프로세스에 설정하는 값:

| 환경변수 | 값/목적 |
| --- | --- |
| `SPRING_DATASOURCE_URL/USERNAME/PASSWORD` | 명시한 별도 테스트 DB, 테스트 계정 |
| `SPRING_DATASOURCE_DRIVER_CLASS_NAME` | `com.mysql.cj.jdbc.Driver` |
| `SPRING_CONFIG_IMPORT` | 빈 값: 로컬 업무 설정 import 차단 |
| `SPRING_JPA_HIBERNATE_DDL_AUTO` | `create-drop`: 아래 접두사 테이블에만 적용 |
| `SPRING_JPA_PROPERTIES_HIBERNATE_DIALECT` | `org.hibernate.dialect.MySQLDialect` |
| `SPRING_JPA_HIBERNATE_NAMING_PHYSICAL_STRATEGY` | `com.lostquest.IsolatedMySqlNamingStrategy` |
| `COMMUNITY_TEST_TABLE_PREFIX` | 실행마다 생성하는 `lq_test_<12자리 hex>_` |

NamingStrategy는 `src/test/java`에 있으므로 Maven test classpath에서만 사용하며 모든 JPA 테이블·시퀀스 이름에 접두사를 적용합니다. 접두사가 없거나 정규식과 다르면 Hibernate 시작을 거절합니다. 실행 전 DB에 접두사 없는 테이블이 있거나 이번 접두사가 이미 있으면 도구가 거절합니다. 클래스 목록은 도구 안에 고정되어 있으며 외부 `SPRING_*` 오버라이드는 제거합니다.

정상 종료에는 Hibernate `create-drop`이 정리합니다. 테스트 실패 때도 도구의 `finally`가 실제 DB 메타데이터에서 **이번 접두사** 테이블만 다시 확인하고 정확한 이름을 검증한 뒤 제거합니다. FK 검사 해제는 이 정리 JDBC 세션에만 적용하며 복원합니다. DB 자체·다른 실행의 접두사 테이블은 삭제하지 않습니다. 부모 프로세스를 강제 종료하면 `finally`가 실행되지 않을 수 있으므로 로그의 해당 접두사로 테스트 DB 관리자에게 잔여 테이블 정리를 요청합니다. 전체 스키마 초기화는 하지 않습니다.

도구는 Java 21로 컴파일 확인했고, 명시적 설정이 없거나 업무 DB명 `lost_quest`를 지정했을 때 JDBC 연결 전에 거절하는 보호 조건을 확인했습니다. 별도 DB에서의 실제 실행·정리 검증은 아직 수행하지 않았습니다.

---

2026-10-13 구현·로컬 검증 보고서. 커밋·푸시·PR 생성·Sites 배포를 하지 않았습니다. 기존 Sites 주소·ngrok 설정·실행 중인 서버·업무용 DB 테이블과 데이터를 유지했습니다.

## 1. 기존 코드 분석과 재사용

| 기능 | 작업 전 상태 | 구현 근거·이번 처리 |
| --- | --- | --- |
| React 라우팅·통합검색·상세·마이페이지 | 구현 완료 | `App`, `SearchPage`, `ItemDetailPage`, `MyPage` 재사용. 별도 게시판 CRUD를 만들지 않음 |
| 회원가입·로그인·JWT·BCrypt | 구현 완료 | `AuthService`, `CurrentUserReader`, `SecurityConfig`, JWT provider 재사용. 가입은 USER 고정, 작성자는 JWT subject로 DB에서 결정 |
| 자체 분실물·습득물 CRUD | 구현 완료 | 기존 Controller → Service → Repository → JPA 흐름, 본인 권한·소프트 삭제·반환 진행 중 편집 제한 재사용 |
| 이미지 첨부·조회 | 구현 완료 | 기존 10 MiB JPEG/PNG/WebP 제한·매직 바이트·실제 디코딩·해상도 제한·UUID 경로 재사용. `DatabaseImageStorage`가 DB에 바이트를 저장하고 기존 로컬 파일도 지원 |
| 소유자 확인 질문·답변 | 구현 완료 | 기존 습득물 확인 질문·BCrypt 답변 해시·5회 오답 제한 재사용. 공개 DTO의 확인 질문 노출을 제거하고 승인된 참여자/작성자 응답에서만 제공 |
| QR 반환·경험치 | 구현 완료 | 기존 DB 반환 상태 머신, 잠금, 30분 QR 만료·일회 사용, 최종 ADMIN 확인, XP 이벤트 중복 방지 재사용 |
| 레벨·업적 | 부분 구현 | XP·반환 수는 실제 DB 값. 프론트엔드가 레벨·배지 조건을 계산하며 별도 Achievement 엔티티는 없음 |
| 매칭 추천·매칭 알림 | 부분 구현 | 기존 실제 서버의 카테고리·색상·날짜 등 규칙 기반 추천/알림. 새로운 AI 이미지 모델은 없음. 숨김 물품만 후보에서 제외 |
| 등록 화면의 AI 이미지 분석 | 프론트엔드 데모 전용 | 기존 시뮬레이션 유지. 커뮤니티 등록·질문·반환은 AI 분석 성공에 의존하지 않음 |
| 경찰청 목록·상세 API | 구현 완료 | 기존 연동 유지. 키·상류 서비스 상태에 의존하지만 자체 게시판과 독립 |
| IndexedDB 공개 목록 캐시 | 구현 완료 | 기존 기능 유지. 새 질문·답변·신고·질문함은 절대 캐시하지 않음 |
| 사용자 간 질문·답변 | 미구현 | 이번에 DB 기반 비공개 질문·작성자 단일 답변·질문함 추가 |
| 관리자 인증 | 구현 완료 | DB의 USER/ADMIN 역할 재사용. 일반 회원의 임시 ADMIN 승격 없음 |
| 게시글 신고·숨김 | 미구현 | 이번에 DB 신고·중복 제한·ADMIN 검토·공개 숨김 추가 |
| 실제 지도·PWA 셸 오프라인 | 프론트엔드 데모 전용 / 미구현 | 기존 위치 텍스트 UI 유지. 이번 범위에서 구현하지 않음 |

## 2. 화면과 사용자 흐름

- `/community`는 기존 `/search?source=community`로 이동합니다. 검색·분실/습득·종류·지역·날짜 필터와 기존 전체 목록 로딩을 재사용하며, 기본 정렬은 실제 등록 시각의 최신순입니다. 이 화면에서는 경찰청 목록과 필터 API를 호출하지 않습니다.
- 상세 페이지에서 로그인 후 작성자에게 질문을 보냅니다. 글 작성자는 해당 게시글에 받은 질문을, 다른 사용자는 자신이 보낸 질문만 확인합니다.
- `/community-inbox`와 마이페이지의 **내 비공개 질문함** 링크에서 받은/보낸 질문과 답변 대기/완료 상태를 확인합니다. 20개씩 페이지를 이동하고 수동으로 새로고침합니다.
- 작성자만 한 번 답변할 수 있습니다. 답변을 수정하는 별도 채팅·댓글 기능은 없습니다.
- 습득물의 답변 후에는 기존 상세 → 반환 요청 → 비공개 특징 확인 → 습득자 승인 → QR 인증 → ADMIN 최종 완료로 연결합니다. 질문 답변만으로 소유자 인증·QR·최종 승인을 건너뛰지 않습니다.
- 분실물 게시글을 보고 질문한 습득자는 자신의 습득물과 확인 질문을 기존 등록 화면에서 작성하고, 분실자에게 그 글을 안내합니다. 분실자는 해당 습득물에서 기존 반환 절차를 시작합니다. 소유자만 아는 답변은 공개 설명에 쓰지 않습니다.
- 실제 서버 오류·빈 결과·로그인 안내를 표시합니다. 쓰기 요청은 자동 재전송하지 않으며 실패 후 재작성 전에 질문 목록을 조회하도록 안내합니다.
- 로그인 회원은 상세에서 신고합니다. `/admin`의 ADMIN 전용 신고 검토 영역에서 사유를 검토하고 숨김을 확정합니다. 신고 상세에 이메일·전화번호·사용자 객체를 포함하지 않습니다.

## 3. API·권한

모든 새 경로는 JWT 인증이 필요하며 기존 CORS·예외 JSON을 사용합니다. 양의 물품/질문/신고 ID와 0~10000 범위 페이지를 검증합니다.

| API | 서버 권한/동작 |
| --- | --- |
| GET `/api/community/{lost 또는 found}/{itemId}/questions?page=0` | 게시글 작성자는 받은 질문, 질문자는 본인 질문만. 20개씩 조회 |
| POST 위 경로 | 본인 글·종료/숨김 글에는 새 질문 불가. 작성자/질문자 ID는 서버에서 결정 |
| GET `/api/community/questions?page=0` | 로그인 사용자가 주고받은 질문만 |
| GET `/api/community/questions/{id}` | 질문자·게시글 작성자만. ADMIN에게도 비공개 질문 열람 우회 권한 없음 |
| POST `/api/community/questions/{id}/answer` | 게시글 작성자만, 행 잠금으로 중복 답변 409 |
| POST `/api/community/{lost 또는 found}/{itemId}/reports` | 로그인 회원, 본인의 동일 물품 중복 신고 409 |
| GET `/api/community/reports?page=0` | DB에서 현재 ADMIN인지 재확인 |
| POST `/api/community/reports/{id}/hide` | DB ADMIN 재확인, 신고/물품 행 잠금. 반환 상태·역사를 삭제하지 않음 |

새 질문·답변·신고의 JSON 본문은 `{ "message": "내용" }`입니다. 최대 1000자이며 HTML 태그·NUL을 차단합니다. 새 API와 기존 물품 JSON 쓰기는 본문 16 KiB로 제한하며, multipart 이미지는 기존 10 MiB/요청 11 MiB 제한을 유지합니다. 서버의 기존 Spring Security와 MVC JSON 예외 처리가 400·401·403·404·409·413·429를 구분합니다.

공개 게시글 작성/수정은 HTML 태그·NUL 및 일반적인 이메일·휴대전화 번호 패턴을 거부합니다. 사용자 객체·이메일·답변 해시는 공개 DTO에 포함하지 않습니다. React는 모든 메시지를 텍스트로 렌더링하며 `dangerouslySetInnerHTML`을 사용하지 않습니다.

계정별 1분 제한은 물품 등록 10회, 질문 20회, 답변 30회, 신고 10회입니다. 제한 초과는 429와 `Retry-After: 60`을 반환합니다. 최대 10,000개의 활성 사용자/작업 창을 관리하고 만료 창을 정리합니다.

## 4. DB 변경과 실행

추가 테이블:

- `community_questions`: 종류·물품 ID·제목 스냅샷, 작성자/질문자(User FK), 비공개 질문·답변, 생성/답변 시각. 게시글·참여자 인덱스.
- `community_reports`: 종류·물품 ID·제목 스냅샷, 신고자(User FK), 사유, 처리 관리자(User FK)·숨김 시각. `(reporter_id, item_type, item_id)` 유니크 제약.
- `lost_items`, `found_items`에 `hidden` boolean을 추가합니다. DB 기본값 0으로 기존 행이 자동 숨김되지 않게 합니다. 기존 상태 enum 값은 변경하지 않습니다.

두 종류의 기존 게시글은 소프트 삭제되고 작성자가 바뀌지 않으므로 새 엔티티는 물품 종류+ID로 참조합니다. 생성 시 기존 물품을 잠그고 확인합니다. 사용자 연관관계는 FK로 관리합니다. 물품을 DB에서 직접 강제 삭제하는 외부 작업은 이 MVP의 지원 범위가 아닙니다.

숨김 글은 공개 목록·공개 상세·새 질문·새 반환 요청·새 매칭 후보에서 제외합니다. 관련 기존 매칭 알림 스냅샷을 제거합니다. 작성자의 비공개 등록 내역과 이미 진행 중인 반환 기록은 보존합니다. 숨김과 반환 완료 상태를 혼용하지 않습니다.

**업무용 DB에는 이번 작업에서 새 테이블/컬럼을 적용하지 않았습니다.** 새 코드를 실행할 때 스키마를 반영해야 합니다. 기존 `dev` 프로필은 `JPA_DDL_AUTO=update`를 기본으로 사용하므로 시작 시 위 테이블·컬럼을 추가합니다. 로컬 DB도 백업 후 적용하며, 업무용 DB에 `create`/`create-drop`을 사용하지 마세요. 명시적으로 `validate`를 사용 중이면 관리자에게 추가 스키마 반영을 요청한 뒤 실행합니다. 설정 파일·접속 비밀번호는 변경하지 않았습니다.

기존 백엔드 실행창은 사용자가 종료한 뒤 실행합니다. 기존 `출근.bat`가 사용하는 JAR을 갱신하려면 평소 환경변수/JDK 설정에서 다음을 실행합니다. 이번 작업은 서버 재시작이나 실행 JAR 덮어쓰기를 하지 않았습니다.

```powershell
cd backend
.\mvnw.cmd -DskipTests package
# 새 JAR 또는 기존 실행 스크립트로 시작. 기존 DB·JWT 환경변수를 유지합니다.
# 개발 실행을 택하면 .\mvnw.cmd spring-boot:run
```

```powershell
cd frontend
npm.cmd run dev
```

사이트·ngrok 주소를 바꾸지 않습니다. 프론트엔드의 기존 `VITE_API_BASE_URL`을 유지합니다. Sites에 새 프론트엔드는 아직 배포하지 않았으므로 이번 기능의 시연은 새 로컬 프론트엔드에서 합니다.

## 5. 검증

- 프론트엔드 전체: **34개 파일·370개 테스트 통과**. TypeScript 검사와 Vite 빌드 통과.
- 백엔드 전체 H2: **325개 테스트 통과**. 새 커뮤니티 테스트 외에 기존 인증·CRUD·이미지 검증·매칭/경찰청 장애 격리·반환 동시성·QR 재사용·XP 중복 방지 포함.
- 실제 로컬 MySQL: **62개 통합 테스트 통과**. 질문·답변·신고·숨김·접근 권한·잘못된 입력·기존 CRUD/수정/삭제·이미지 첨부·반환 전체 흐름과 중복 지급 방지를 검증.
- MySQL 계정은 새 스키마 생성 권한이 없어 최초 독립 스키마 생성 시도가 1044로 거절됐습니다. 이후 테스트 전용 `IsolatedMySqlNamingStrategy`로 **모든 테스트 테이블**에 임의의 `lq_test_<12자리 hex>_` 접두사를 붙여 기존 업무 테이블을 대상으로 하지 않았습니다. 임시 테이블은 테스트 종료 후 정리했습니다. 접두사가 없거나 잘못되면 전략이 시작을 거부합니다. 업무 DB용 테이블의 초기화·삭제 및 실사용자 ADMIN 승격은 없습니다.
- 테스트 프로필은 경찰청 실 API 대신 비활성 주소/모의 서버를 사용하며 실제 사용자 정보를 사용하지 않습니다. 새 프론트엔드 API/상태 테스트는 private API 인증, 연락 객체 미전송, 잘못된 응답 거부, 자동 쓰기 재전송 없음, 로그아웃 시 비공개 화면 제거, 텍스트 이스케이프와 질문/답변 동작을 검증했습니다.
- 실행 환경은 현재 설치된 **Corretto JDK 25**이며 Maven은 프로젝트 설정의 **Java 21 대상 바이트코드(major version 65)**를 생성했습니다. Java 21 JVM에서 직접 실행하는 검증은 별도로 남습니다.
- 실제 사용자가 브라우저 2개로 MySQL 서버와 연결해 클릭하는 수동 시연·Sites 배포 검증은 이번 자동 테스트와 구분합니다. 자동 UI 테스트는 jsdom, 백엔드 통합 테스트는 실제 Spring Security/MockMvc/JPA를 사용합니다.

## 6. 남은 범위·위험

- 최종 반환 완료에는 기존 DB ADMIN 계정이 필요합니다. 일반 회원끼리는 승인·QR 확인까지 가능하며 자동 ADMIN 승격을 하지 않습니다.
- 실시간 채팅·푸시 알림·읽음 확인·질문 수정/삭제·답변 수정·신고 반려/숨김 해제는 구현하지 않았습니다. 받은 질문은 질문함을 새로고침해 확인합니다.
- 요청 빈도 제한은 단일 서버 메모리에 있으며 재시작 시 초기화됩니다. 다중 서버 운영·계정 대량 생성 악용 대응은 별도 작업입니다.
- 공개 텍스트의 연락처 패턴 검사는 모든 이름·개인정보 표현을 식별하지 못합니다. 이전 게시글의 개인정보도 자동 삭제하지 않으므로 필요한 글은 신고/검토해야 합니다.
- 과거 IndexedDB 공개 요약은 오프라인에서 새 숨김 상태를 알 수 없습니다. 재연결·캐시 갱신 전에는 저장 당시 읽기 전용 정보가 남을 수 있으며 기존 7일 만료 정책을 따릅니다. 비공개 질문/신고는 해당 캐시에 저장되지 않습니다.
- 숨김 글은 작성자의 개인 등록 내역에 역사로 남지만 공개 상세는 404입니다. 이미 진행 중인 반환의 승인된 참여자는 기존 반환 화면으로 진행합니다.
- MySQL에서 새로운 업무 테이블/컬럼을 추가하는 운영 마이그레이션, Java 21 JVM 실행, 실제 두 브라우저 시연은 적용 단계에서 확인해야 합니다. ngrok·업무 서버 프로세스는 이번 작업에서 시작/종료하지 않았습니다.

## 7. 엑스포 추천 시연

1. 새로운 로컬 백엔드 코드와 스키마를 실행하고 프론트엔드 `/community`를 엽니다. 경찰청 키가 없어도 목록이 정상 동작함을 보여 줍니다.
2. 회원 A가 검은 지갑 습득물과 소유자 확인 질문/비공개 답변을 등록합니다. 일반 공개 설명에는 정답을 쓰지 않습니다.
3. 다른 브라우저의 회원 B가 검색·유형 필터로 글을 찾고 비공개 질문을 보냅니다. 회원 C는 질문을 볼 수 없음을 보여 줍니다.
4. A의 질문함에서 질문을 확인하고 답변합니다. B가 답변을 읽고 기존 반환 요청으로 이동합니다.
5. B가 비공개 특징을 확인하고 A가 승인합니다. B의 QR 내용을 A가 확인하고 기존 ADMIN 계정이 최종 반환을 완료합니다.
6. 게시글의 반환 완료 상태와 A의 +50 XP를 보여 줍니다. QR 재사용이 거절되고 완료 재요청으로 XP가 늘지 않음을 설명합니다.
7. 별도 테스트용 글을 B가 신고하고 ADMIN이 숨겨 공개 목록에서 사라지는 것을 보여 줍니다. 반환 시연 글은 숨기지 않습니다.

## 8. PPT 기술 포인트

1. **JWT 사용자 + DB 권한 검사**: UI 버튼 숨김을 넘어 서비스에서 작성자·질문 참여자·현재 ADMIN 권한을 확인하여 ID 변경 공격과 관리자 토큰의 오래된 역할을 차단합니다.
2. **작은 DB 확장으로 기존 기능 재사용**: 기존 분실/습득 CRUD·이미지 저장·통합검색 위에 질문/신고 엔티티를 추가합니다. 경찰청 장애와 커뮤니티 이용 흐름을 분리합니다.
3. **중복·경합 방지**: 물품/질문/신고 행 잠금, 사용자-물품 신고 유니크 제약, 기존 QR 일회 사용·XP 이벤트 제약으로 반환 검증과 보상을 중복 처리하지 않습니다.
4. **검증 가능한 개인정보 경계**: 공개 DTO·IndexedDB 요약과 비공개 질문 API를 분리하고, H2 전체 회귀 테스트에 실제 MySQL 격리 테스트를 더해 안전성을 확인합니다.

## 9. 변경 파일

이 절 아래에는 이번 작업의 실제 변경 목록을 기록합니다. 기존 로고·favicon·Layout·공통 styles·배포 문서·회의록·scratch 변경은 이번 커뮤니티 구현에 포함하지 않았습니다.

- `backend/src/main/java/com/lostquest/config/CommunityRequestSizeFilter.java`
- `backend/src/main/java/com/lostquest/controller/CommunityController.java`
- `backend/src/main/java/com/lostquest/dto/CommunityMessageRequest.java`
- `backend/src/main/java/com/lostquest/dto/CommunityPage.java`
- `backend/src/main/java/com/lostquest/dto/CommunityQuestionResponse.java`
- `backend/src/main/java/com/lostquest/dto/CommunityReportResponse.java`
- `backend/src/main/java/com/lostquest/dto/FoundItemResponse.java`
- `backend/src/main/java/com/lostquest/dto/ReturnResponse.java`
- `backend/src/main/java/com/lostquest/entity/CommunityItemType.java`
- `backend/src/main/java/com/lostquest/entity/CommunityQuestion.java`
- `backend/src/main/java/com/lostquest/entity/CommunityReport.java`
- `backend/src/main/java/com/lostquest/entity/FoundItem.java`
- `backend/src/main/java/com/lostquest/entity/LostItem.java`
- `backend/src/main/java/com/lostquest/exception/CommunityRateLimitException.java`
- `backend/src/main/java/com/lostquest/exception/GlobalExceptionHandler.java`
- `backend/src/main/java/com/lostquest/repository/CommunityQuestionRepository.java`
- `backend/src/main/java/com/lostquest/repository/CommunityReportRepository.java`
- `backend/src/main/java/com/lostquest/repository/FoundItemRepository.java`
- `backend/src/main/java/com/lostquest/repository/LostItemRepository.java`
- `backend/src/main/java/com/lostquest/security/SecurityConfig.java`
- `backend/src/main/java/com/lostquest/service/CommunityService.java`
- `backend/src/main/java/com/lostquest/service/CommunityTextRules.java`
- `backend/src/main/java/com/lostquest/service/CommunityWriteLimiter.java`
- `backend/src/main/java/com/lostquest/service/FoundItemService.java`
- `backend/src/main/java/com/lostquest/service/LostItemService.java`
- `backend/src/main/java/com/lostquest/service/matching/MatchingService.java`
- `backend/src/main/java/com/lostquest/service/MyItemService.java`
- `backend/src/main/java/com/lostquest/service/notification/MatchNotificationService.java`
- `backend/src/main/java/com/lostquest/service/ReturnService.java`
- `backend/src/test/java/com/lostquest/controller/CommunityControllerTest.java`
- `backend/src/test/java/com/lostquest/IsolatedMySqlNamingStrategy.java`
- `backend/src/test/java/com/lostquest/service/CommunityWriteLimiterTest.java`
- `docs/COMMUNITY_MVP.md`
- `frontend/src/App.tsx`
- `frontend/src/components/community.css`
- `frontend/src/components/CommunityPanel.tsx`
- `frontend/src/components/communityQuestions.test.tsx`
- `frontend/src/components/CommunityQuestions.tsx`
- `frontend/src/components/CommunityReports.tsx`
- `frontend/src/pages/AdminPage.tsx`
- `frontend/src/pages/CommunityInboxPage.tsx`
- `frontend/src/pages/ItemDetailPage.tsx`
- `frontend/src/pages/MyPage.tsx`
- `frontend/src/pages/searchOffline.test.tsx`
- `frontend/src/pages/SearchPage.tsx`
- `frontend/src/services/communityApi.test.ts`
- `frontend/src/services/communityApi.ts`
- `README.md`
