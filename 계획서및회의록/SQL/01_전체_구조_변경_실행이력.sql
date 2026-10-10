-- 2026-10-10 구조 변경 DDL 전체 이력: 42개
-- mysqlbinlog에서 확인한 실제 DDL. 줄바꿈만 정리했습니다.
-- 2026-10-10 21:08:09 KST까지: 기존 35개 + 조회용 뷰 2개 + ENUM 재적용 5개.
-- 현재 DB에 이미 반영된 실행 기록입니다. 재실행용 마이그레이션이 아닙니다.

-- 261010 14:12:43 KST / binlog.000003
CREATE DATABASE IF NOT EXISTS lost_quest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE lost_quest; -- 실행 대상 DB를 명시하는 안내용 구문

-- 261010 14:13:01 KST / binlog.000004
create table found_items (
    id bigint not null auto_increment,
    created_at datetime(6) not null,
    category varchar(50) not null,
    color varchar(30),
    description varchar(2000),
    found_date date not null,
    image_url varchar(2048),
    location varchar(255) not null,
    region varchar(20),
    status enum ('CLOSED','RETURNED','STORED') not null,
    title varchar(120) not null,
    user_id bigint not null,
    primary key (id)
) engine=InnoDB;

-- 261010 14:13:01 KST / binlog.000004
create table lost_items (
    id bigint not null auto_increment,
    created_at datetime(6) not null,
    category varchar(50) not null,
    color varchar(30),
    description varchar(2000),
    image_url varchar(2048),
    location varchar(255) not null,
    lost_date date not null,
    region varchar(20),
    status enum ('CLOSED','LOST','RETURNED') not null,
    title varchar(120) not null,
    user_id bigint not null,
    primary key (id)
) engine=InnoDB;

-- 261010 14:13:01 KST / binlog.000004
create table match_notifications (
    id bigint not null auto_increment,
    created_at datetime(6) not null,
    atc_id varchar(20),
    candidate_key varchar(64) not null,
    fd_sn integer,
    found_date date,
    found_item_id bigint,
    found_title varchar(120),
    max_score integer not null,
    read_at datetime(6),
    score integer not null,
    source enum ('LOST_QUEST','POLICE') not null,
    lost_item_id bigint not null,
    user_id bigint not null,
    primary key (id)
) engine=InnoDB;

-- 261010 14:13:01 KST / binlog.000004
create table users (
    id bigint not null auto_increment,
    created_at datetime(6) not null,
    email varchar(254) not null,
    nickname varchar(50) not null,
    password varchar(60) not null,
    role enum ('ADMIN','USER') not null,
    primary key (id)
) engine=InnoDB;

-- 261010 14:13:01 KST / binlog.000004
create index idx_match_notification_user_read on match_notifications (user_id, read_at);

-- 261010 14:13:01 KST / binlog.000004
alter table match_notifications add constraint uk_match_notification_lost_candidate unique (lost_item_id, candidate_key);

-- 261010 14:13:01 KST / binlog.000004
alter table users add constraint uk_users_email unique (email);

-- 261010 14:13:01 KST / binlog.000004
alter table found_items add constraint FK16vh4dfup0xh35glm4ijw0o59 foreign key (user_id) references users (id);

-- 261010 14:13:01 KST / binlog.000004
alter table lost_items add constraint FK11slsd8nol9y2rumxw558wlrc foreign key (user_id) references users (id);

-- 261010 14:13:01 KST / binlog.000004
alter table match_notifications add constraint FKovik599hgh9dw0xuwu74wtpaf foreign key (lost_item_id) references lost_items (id);

-- 261010 14:13:01 KST / binlog.000004
alter table match_notifications add constraint FKk55awhdecoh7av2bbd2seyfx7 foreign key (user_id) references users (id);

-- 261010 19:22:16 KST / binlog.000007
alter table found_items modify column status enum ('CLOSED','RETURNED','STORED') not null;

-- 261010 19:22:16 KST / binlog.000007
alter table lost_items modify column status enum ('CLOSED','LOST','RETURNED') not null;

-- 261010 19:22:16 KST / binlog.000007
alter table match_notifications modify column source enum ('LOST_QUEST','POLICE') not null;

-- 261010 19:22:16 KST / binlog.000007
alter table users modify column role enum ('ADMIN','USER') not null;

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
