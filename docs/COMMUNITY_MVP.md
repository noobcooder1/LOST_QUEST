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
