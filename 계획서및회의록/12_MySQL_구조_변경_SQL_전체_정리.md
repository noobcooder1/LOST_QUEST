# MySQL 구조 변경 SQL 전체 정리

기준일: 2026-10-10, Asia/Seoul(KST). 실행 이력은 21:08:09까지 확인했다.

실행 중인 프로젝트 MySQL의 `SHOW CREATE TABLE`·`SHOW CREATE VIEW`, 변경 전 백업, `.local/mysql-data/binlog.000001`부터 `binlog.000007`까지의 기록을 비교했다. **실제로 실행된 구조 관련 DDL 42개**를 복원했다. 기존 정리의 35개에 등록일시 수정 이후 실행된 7개를 추가했다. 기록 파일에서는 줄바꿈과 문장 끝 구분자를 읽기 쉽게 정리했다.

이번 정리 작업에서는 DB를 조회하고 문서·SQL 파일만 수정했다.

등록일시 수정에서는 한국 시간 조회용 뷰 2개를 추가했다. 생성 SQL과 이후 서버 재시작 때 실행된 ENUM 재적용 SQL을 이 문서의 5절과 기존 이력 파일에 포함했다. 반복 실행용 뷰 생성 SQL은 [05_물품_등록시각_한국시간_조회뷰.sql](SQL/05_물품_등록시각_한국시간_조회뷰.sql), 화면·DBeaver 사용 방법은 [등록일시·테이블 구분 가이드](13_물품_등록일시_수정과_테이블_구분.md)에 정리했다.

## 1. 무엇이 변경됐는가

기존 4개 테이블에서 총 **테이블 8개와 조회용 뷰 2개**로 확장했다. 뷰는 원본 테이블을 조회하는 정의이며 물품 데이터를 별도로 복사해 저장하지 않는다.

| 테이블 | 최근 구조 변경 | 목적 |
| --- | --- | --- |
| `users` | 컬럼·키 변경 없음 | 기존 회원 정보 저장 유지 |
| `lost_items` | 컬럼·키 변경 없음 | 기존 분실물 저장 유지 |
| `found_items` | `ownership_answer_hash VARCHAR(60)`, `ownership_question VARCHAR(200)` 추가 | 소유 확인 답변 해시와 질문 저장 |
| `match_notifications` | 컬럼·키 변경 없음 | 기존 매칭 알림 저장 유지 |
| `return_requests` | 새 테이블, 인덱스 2개, 외래키 3개 | 요청자·습득물·분실물 연결, 진행 상태, QR·만료·사용 시각 |
| `experience_events` | 새 테이블, 고유 제약 1개, 외래키 1개 | 경험치 지급 이력 및 동일 이벤트 중복 방지 |
| `activity_notifications` | 새 테이블, 인덱스 1개, 외래키 1개 | 등록·반환 소식과 읽음 시각 |
| `item_images` | 새 테이블 | 이미지 파일 이름과 실제 사진 바이트 |
| `lost_items_kst` | 조회용 뷰 추가 | 분실 글 등록 시각의 UTC 값과 한국 시간 변환값 조회 |
| `found_items_kst` | 조회용 뷰 추가 | 습득 글 등록 시각의 UTC 값과 한국 시간 변환값 조회 |

사진 바이트 컬럼은 **`MEDIUMBLOB`**이다. 실제 DB 정의와 Hibernate 생성 쿼리 모두 이를 확인했다. `item_images.filename`은 기본 키이며, 물품에는 `/api/images/파일이름` 형태의 경로가 저장된다. 물품의 `image_url`과 이미지 테이블 사이에 새 외래키를 만들지는 않았다.

이메일 검증 강화는 프론트엔드와 Java 회원가입 DTO 변경이다. `users.email`의 타입은 기존 `VARCHAR(254)`이고, 별도 `ALTER TABLE` 또는 이메일 형식 `CHECK` 제약을 추가하지 않았다.

`region`, `image_url`, `users.email` 고유 키와 기존 매칭 알림 인덱스·외래키는 변경 전 백업에도 이미 존재했다. 최근에 새로 추가한 구조와 구분해야 한다.

기존 테이블의 `status`, `source`, `role`에 `MODIFY COLUMN ... ENUM(...)`이 실행됐지만 허용 값은 이전과 같다. Hibernate의 `ddl-auto=update`가 기존 정의를 재적용한 기록이다. `AUTO_INCREMENT` 다음 번호가 증가한 것은 데이터 등록·검증에 따른 것으로 새로운 컬럼이나 테이블 변경이 아니다.

등록일시 수정 이후에도 기존 8개 테이블의 컬럼·키·자료형은 동일하다. `created_at`을 한국 시간으로 덮어쓰는 `UPDATE`나 날짜·시각 컬럼을 변경하는 `ALTER TABLE`은 실행하지 않았다. `created_at_kst`는 뷰의 계산 결과이며 원본 테이블에 추가한 컬럼이 아니다. 날짜 기본값, 등록일시 표시, 한국 기준 미래 날짜 검증은 React·Java 코드 변경으로 처리했다.

## 2. 제공한 SQL 파일

| 파일 | 내용 | 사용 목적 |
| --- | --- | --- |
| [01_전체_구조_변경_실행이력.sql](SQL/01_전체_구조_변경_실행이력.sql) | 실제 DDL 전체 42개 | 초기 생성부터 등록일시 수정 이후까지 실행 이력 확인 |
| [02_최근_추가변경_실행이력.sql](SQL/02_최근_추가변경_실행이력.sql) | 최근 확장 19개 + 이후 7개 = 26개 | 계정별 저장 확장과 등록일시 수정 이후 실행 이력 확인 |
| [03_현재_전체_테이블_구조.sql](SQL/03_현재_전체_테이블_구조.sql) | 현재 테이블 8개와 뷰 2개의 전체 정의 | 비어 있는 DB에서 현재 구조 재현 |
| [04_접속_계정_권한_설정_기록.sql](SQL/04_접속_계정_권한_설정_기록.sql) | 초기·복구 과정의 계정 관련 명령 7개 | 테이블 변경과 접속 계정 변경 구분 |
| [05_물품_등록시각_한국시간_조회뷰.sql](SQL/05_물품_등록시각_한국시간_조회뷰.sql) | 한국 시간 조회용 뷰 생성 2개와 확인 SELECT 2개 | 기존 테이블에 조회용 뷰 추가·갱신 및 조회 |

01·02는 이미 실행된 이력이다. 현재 DB에서 다시 실행하면 기존 테이블·컬럼·키 이름이 겹쳐 오류가 날 수 있다. 03은 초기 구조 생성용이며 기존 DB 변경용 스크립트가 아니다. 어느 파일에도 기존 데이터를 삭제하는 `DROP TABLE`, `TRUNCATE`, 데이터 초기화 명령은 넣지 않았다.

05는 기본 테이블이 준비된 DB에서 반복 실행할 수 있다. 이력 파일의 뷰 SQL에는 MySQL이 기록한 생성자 `DEFINER`가 포함되어 있다. 다른 PC에서 사용할 03·05는 특정 생성자 계정을 생략하고 `SQL SECURITY INVOKER`를 유지한다. 현재 DB의 `SHOW CREATE VIEW` 정의에서 이 계정 표기만 생략한 것이며, 조회 계산과 읽기 전용 속성은 동일하다.

04의 인증 플러그인·인증 해시 부분은 `IDENTIFIED BY '<로컬 비밀번호>'`라는 설정 예시로 대체했다. 인증값을 그대로 재현하는 원문 파일은 아니다. 이전 초기 설정 로그에는 `root` 변경이 있지만, 14:12 접속 복구 작업은 `lostquest_app`만 동기화했으며 `root` 비밀번호는 변경하지 않았다.

## 3. 시간 순서와 쿼리 개수

| 시각(KST) | 실제 DDL | 내용 |
| --- | ---: | --- |
| 2026-10-10 14:12:43~14:13:01 | 12개 | DB 존재 확인, 기존 테이블 4개 생성, 인덱스 1개, 고유 제약 2개, 외래키 4개 |
| 2026-10-10 19:22:16 | 4개 | 기존 ENUM 컬럼 4개의 같은 정의 재적용 |
| 2026-10-10 20:14:33~20:14:34 | 19개 | 새 테이블 4개, 컬럼 2개 추가, ENUM 재적용 4개, 인덱스 3개, 고유 제약 1개, 외래키 5개 |
| 2026-10-10 21:07:23 | 2개 | `lost_items_kst`, `found_items_kst` 조회용 뷰 생성 |
| 2026-10-10 21:08:09 | 5개 | 서버 재시작 시 물품·매칭·반환·회원 ENUM의 같은 정의 재적용 |
| 합계 | **42개** | 구조 관련 DDL |

쿼리 수와 테이블 수는 다르다. 예를 들어 반환 테이블은 `CREATE TABLE` 한 번 뒤에 인덱스와 외래키를 별도 명령으로 추가했다. 외래키 이름이 `FKbr6rnsdn...`처럼 긴 것은 Hibernate가 자동 생성한 제약 이름이다.

## 4. 계정별 저장 기능 확장 시 실행한 SQL: 19개

아래 쿼리는 `2026-10-10 20:14:33~20:14:34 KST`의 실제 binlog 기록이다. `USE lost_quest`는 대상 DB를 명시하기 위해 문서에 넣은 안내용 구문이다.

```sql
-- 2026-10-10 20:14 KST / 기존 4개 테이블에서 8개 테이블로 확장한 DDL: 19개
-- mysqlbinlog에서 확인한 실제 DDL. 줄바꿈만 정리했습니다.
-- 현재 DB에 이미 반영된 실행 기록입니다. 재실행용 마이그레이션이 아닙니다.

USE lost_quest; -- 실행 대상 DB를 명시하는 안내용 구문

-- 261010 20:14:33 KST / binlog.000007
create table activity_notifications (
    id bigint not null auto_increment,
    created_at datetime(6) not null,
    message varchar(2000) not null,
    read_at datetime(6),
    title varchar(200) not null,
    user_id bigint not null,
    primary key (id)
) engine=InnoDB;

-- 261010 20:14:33 KST / binlog.000007
create table experience_events (
    id bigint not null auto_increment,
    created_at datetime(6) not null,
    amount integer not null,
    event_key varchar(100) not null,
    user_id bigint not null,
    primary key (id)
) engine=InnoDB;

-- 261010 20:14:33 KST / binlog.000007
alter table found_items add column ownership_answer_hash varchar(60);

-- 261010 20:14:33 KST / binlog.000007
alter table found_items add column ownership_question varchar(200);

-- 261010 20:14:33 KST / binlog.000007
alter table found_items modify column status enum ('CLOSED','RETURNED','STORED') not null;

-- 261010 20:14:33 KST / binlog.000007
create table item_images (
    filename varchar(41) not null,
    content mediumblob not null,
    primary key (filename)
) engine=InnoDB;

-- 261010 20:14:33 KST / binlog.000007
alter table lost_items modify column status enum ('CLOSED','LOST','RETURNED') not null;

-- 261010 20:14:33 KST / binlog.000007
alter table match_notifications modify column source enum ('LOST_QUEST','POLICE') not null;

-- 261010 20:14:33 KST / binlog.000007
create table return_requests (
    id bigint not null auto_increment,
    created_at datetime(6) not null,
    qr_expires_at datetime(6),
    qr_token varchar(64),
    qr_used_at datetime(6),
    status enum ('APPROVED','COMPLETED','OWNER_VERIFIED','PENDING','QR_VERIFIED','REJECTED') not null,
    updated_at datetime(6) not null,
    found_item_id bigint not null,
    lost_item_id bigint,
    requester_id bigint not null,
    primary key (id)
) engine=InnoDB;

-- 261010 20:14:33 KST / binlog.000007
alter table users modify column role enum ('ADMIN','USER') not null;

-- 261010 20:14:33 KST / binlog.000007
create index ix_activity_user on activity_notifications (user_id);

-- 261010 20:14:34 KST / binlog.000007
alter table experience_events add constraint uk_experience_user_event unique (user_id, event_key);

-- 261010 20:14:34 KST / binlog.000007
create index ix_return_requester on return_requests (requester_id);

-- 261010 20:14:34 KST / binlog.000007
create index ix_return_found on return_requests (found_item_id);

-- 261010 20:14:34 KST / binlog.000007
alter table activity_notifications add constraint FK1swngkkgp3057e7jeei8q5bn3 foreign key (user_id) references users (id);

-- 261010 20:14:34 KST / binlog.000007
alter table experience_events add constraint FK6lmui7fxp96hq2eox8x0dw2m1 foreign key (user_id) references users (id);

-- 261010 20:14:34 KST / binlog.000007
alter table return_requests add constraint FKbr6rnsdn30qb25yxym2glni5x foreign key (found_item_id) references found_items (id);

-- 261010 20:14:34 KST / binlog.000007
alter table return_requests add constraint FKfqbn68r9ej0jn1g0ubm8pb5kv foreign key (lost_item_id) references lost_items (id);

-- 261010 20:14:34 KST / binlog.000007
alter table return_requests add constraint FK8khbbpale11e664hokef21qge foreign key (requester_id) references users (id);

```

## 5. 등록일시 수정 이후 실행한 SQL 전부: 7개

기존 정리 이후 새 DB 객체를 만든 쿼리는 조회용 뷰 생성 2개다. 나머지 5개는 서버 재시작 시 Hibernate가 기존 ENUM 정의를 재적용한 기록이며 허용 상태값을 새로 추가하지 않았다. 모든 문장은 `binlog.000007`에서 실행 시각과 위치를 확인했다.

```sql
USE lost_quest; -- 대상 DB를 명시하는 안내용 구문

-- 261010 21:07:23 KST / binlog.000007 / position 890591
CREATE OR REPLACE ALGORITHM=TEMPTABLE DEFINER=`lostquest_app`@`localhost` SQL SECURITY INVOKER VIEW `lost_items_kst` AS SELECT
    id, title, user_id,
    created_at AS created_at_utc,
    CONVERT_TZ(created_at, '+00:00', '+09:00') AS created_at_kst,
    lost_date, category, color, description, region, location, image_url, status
FROM lost_items;

-- 261010 21:07:23 KST / binlog.000007 / position 891140
CREATE OR REPLACE ALGORITHM=TEMPTABLE DEFINER=`lostquest_app`@`localhost` SQL SECURITY INVOKER VIEW `found_items_kst` AS SELECT
    id, title, user_id,
    created_at AS created_at_utc,
    CONVERT_TZ(created_at, '+00:00', '+09:00') AS created_at_kst,
    found_date, category, color, description, region, location, image_url, status,
    ownership_question
FROM found_items;

-- 261010 21:08:09 KST / binlog.000007 / position 891716
alter table found_items modify column status enum ('CLOSED','RETURNED','STORED') not null;

-- 261010 21:08:09 KST / binlog.000007 / position 891984
alter table lost_items modify column status enum ('CLOSED','LOST','RETURNED') not null;

-- 261010 21:08:09 KST / binlog.000007 / position 892249
alter table match_notifications modify column source enum ('LOST_QUEST','POLICE') not null;

-- 261010 21:08:09 KST / binlog.000007 / position 892518
alter table return_requests modify column status enum ('APPROVED','COMPLETED','OWNER_VERIFIED','PENDING','QR_VERIFIED','REJECTED') not null;

-- 261010 21:08:09 KST / binlog.000007 / position 892834
alter table users modify column role enum ('ADMIN','USER') not null;
```

뷰의 `created_at_utc`는 원본 UTC 등록 시각이고 `created_at_kst`는 `CONVERT_TZ(created_at, '+00:00', '+09:00')` 계산 결과다. `found_date`·`lost_date`는 입력한 습득·분실 날짜 그대로다. 뷰는 저장된 물품 데이터를 복제하지 않으며, 새 물품이 등록되면 최신 원본을 조회한다. 비공개 소유자 답변 해시는 뷰에 포함하지 않는다.

`ALGORITHM=TEMPTABLE`은 뷰를 읽기 전용으로 만들고, `SQL SECURITY INVOKER`는 조회하는 계정의 원본 테이블 권한을 사용한다. 한국 시간 변환은 고정 숫자 오프셋을 사용하므로 MySQL의 이름 기반 시간대 테이블을 별도로 설치할 필요가 없다.

## 6. 현재 구조 조회에 사용하는 SQL

다음은 조회 명령이며 구조를 변경하지 않는다.

```sql
USE lost_quest;
SHOW FULL TABLES; -- BASE TABLE과 VIEW를 구분
SHOW CREATE DATABASE lost_quest;
SHOW CREATE TABLE users;
SHOW CREATE TABLE lost_items;
SHOW CREATE TABLE found_items;
SHOW CREATE TABLE match_notifications;
SHOW CREATE TABLE return_requests;
SHOW CREATE TABLE experience_events;
SHOW CREATE TABLE activity_notifications;
SHOW CREATE TABLE item_images;
SHOW CREATE VIEW lost_items_kst;
SHOW CREATE VIEW found_items_kst;

SELECT * FROM lost_items_kst ORDER BY created_at_utc DESC, id DESC;
SELECT * FROM found_items_kst ORDER BY created_at_utc DESC, id DESC;

SHOW COLUMNS FROM found_items;
SHOW INDEX FROM return_requests;
SHOW INDEX FROM experience_events;
SHOW INDEX FROM activity_notifications;
```

DBeaver의 테이블 아래 보이는 인덱스·제약 조건은 추가 테이블이 아니다. 현재 `lost_quest`에는 위 8개 사용자 테이블과 조회용 뷰 2개가 있다. DBeaver에서 Views 항목을 새로고침하면 뷰를 확인할 수 있다. 조회용 `SELECT`와 구조를 생성·변경하는 DDL은 서로 다르다.

## 7. 기록 범위와 확인 결과

이 문서는 **구조를 생성·변경한 DDL 전체**를 다룬다. 회원가입·물품 등록·반환 처리의 `INSERT`, `UPDATE`, 목록 조회 `SELECT`는 데이터 처리 쿼리이며 구조 변경이 아니다. MySQL의 `general_log`는 꺼져 있으므로 모든 조회와 준비된 SQL의 실행 원문 전체가 보관되어 있다고 주장할 수 없다. binlog에는 구조 변경 명령과 데이터 변경 기록이 남아 있어 이번 DDL을 확인할 수 있었다.

- 변경 전 백업의 기존 4개 테이블과 현재 정의를 대조했다.
- 다음 `AUTO_INCREMENT` 값을 제외하면 `users`, `lost_items`, `match_notifications`의 구조는 동일했다.
- `found_items`는 질문·답변 해시 컬럼 2개를 제외하면 동일했다.
- 새 테이블 4개의 컬럼·자료형·키는 현재 DB의 정의와 일치했다.
- 기존 정리 이후 8개 테이블의 정의는 다음 `AUTO_INCREMENT` 값을 제외하면 동일했다.
- 현재 뷰 2개는 `SQL SECURITY INVOKER`, `ALGORITHM=TEMPTABLE`이며 읽기 전용이다.
- 01의 42개 및 02의 26개 문장은 binlog 원문과 공백·마지막 구분자 이외의 내용이 같은지 확인했다.
- 03은 현재 `SHOW CREATE TABLE`·`SHOW CREATE VIEW`와 비교했다. 다음 `AUTO_INCREMENT` 값과 뷰의 특정 생성자 계정만 이식성을 위해 생략했다.
