-- 2026-10-10 최근 추가·변경 실행 이력: 26개
-- 20:14 테이블 확장 19개 + 21:07~21:08 등록일시 수정 이후 7개.
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

-- 등록일시 수정 이후 추가 실행 이력: 7개

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
