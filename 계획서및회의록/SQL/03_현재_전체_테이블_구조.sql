-- 현재 SHOW CREATE TABLE / VIEW 기반의 전체 구조 재현 SQL (테이블 8개 + 뷰 2개)
-- 기준: 2026-10-10. DB 저장 시각은 UTC, *_kst 뷰의 created_at_kst는 한국 시간입니다.
-- 데이터 INSERT, DROP, 다음 AUTO_INCREMENT 값은 포함하지 않습니다.
-- 뷰의 특정 DEFINER 계정은 생략하여 실행하는 계정이 생성자가 됩니다 (INVOKER 유지).
-- 빈 DB의 구조를 만드는 용도이며, 이미 생성된 테이블에 대한 변경 스크립트가 아닙니다.
-- 기존 테이블에 한국 시간 뷰만 추가할 때는 05 SQL을 사용합니다.
CREATE DATABASE IF NOT EXISTS lost_quest
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lost_quest;

CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('ADMIN','USER') COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lost_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lost_date` date NOT NULL,
  `region` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('CLOSED','LOST','RETURNED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK11slsd8nol9y2rumxw558wlrc` (`user_id`),
  CONSTRAINT `FK11slsd8nol9y2rumxw558wlrc` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `found_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `found_date` date NOT NULL,
  `image_url` varchar(2048) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `region` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('CLOSED','RETURNED','STORED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint NOT NULL,
  `ownership_answer_hash` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ownership_question` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK16vh4dfup0xh35glm4ijw0o59` (`user_id`),
  CONSTRAINT `FK16vh4dfup0xh35glm4ijw0o59` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `match_notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `atc_id` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `candidate_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fd_sn` int DEFAULT NULL,
  `found_date` date DEFAULT NULL,
  `found_item_id` bigint DEFAULT NULL,
  `found_title` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `max_score` int NOT NULL,
  `read_at` datetime(6) DEFAULT NULL,
  `score` int NOT NULL,
  `source` enum('LOST_QUEST','POLICE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `lost_item_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_match_notification_lost_candidate` (`lost_item_id`,`candidate_key`),
  KEY `idx_match_notification_user_read` (`user_id`,`read_at`),
  CONSTRAINT `FKk55awhdecoh7av2bbd2seyfx7` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `FKovik599hgh9dw0xuwu74wtpaf` FOREIGN KEY (`lost_item_id`) REFERENCES `lost_items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `activity_notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `message` varchar(2000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `read_at` datetime(6) DEFAULT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_activity_user` (`user_id`),
  CONSTRAINT `FK1swngkkgp3057e7jeei8q5bn3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `experience_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `amount` int NOT NULL,
  `event_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_experience_user_event` (`user_id`,`event_key`),
  CONSTRAINT `FK6lmui7fxp96hq2eox8x0dw2m1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `item_images` (
  `filename` varchar(41) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` mediumblob NOT NULL,
  PRIMARY KEY (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `return_requests` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `qr_expires_at` datetime(6) DEFAULT NULL,
  `qr_token` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qr_used_at` datetime(6) DEFAULT NULL,
  `status` enum('APPROVED','COMPLETED','OWNER_VERIFIED','PENDING','QR_VERIFIED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `found_item_id` bigint NOT NULL,
  `lost_item_id` bigint DEFAULT NULL,
  `requester_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_return_requester` (`requester_id`),
  KEY `ix_return_found` (`found_item_id`),
  KEY `FKfqbn68r9ej0jn1g0ubm8pb5kv` (`lost_item_id`),
  CONSTRAINT `FK8khbbpale11e664hokef21qge` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`),
  CONSTRAINT `FKbr6rnsdn30qb25yxym2glni5x` FOREIGN KEY (`found_item_id`) REFERENCES `found_items` (`id`),
  CONSTRAINT `FKfqbn68r9ej0jn1g0ubm8pb5kv` FOREIGN KEY (`lost_item_id`) REFERENCES `lost_items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER
VIEW `lost_items_kst`
AS
SELECT
    `lost_items`.`id` AS `id`,
    `lost_items`.`title` AS `title`,
    `lost_items`.`user_id` AS `user_id`,
    `lost_items`.`created_at` AS `created_at_utc`,
    CONVERT_TZ(`lost_items`.`created_at`,'+00:00','+09:00') AS `created_at_kst`,
    `lost_items`.`lost_date` AS `lost_date`,
    `lost_items`.`category` AS `category`,
    `lost_items`.`color` AS `color`,
    `lost_items`.`description` AS `description`,
    `lost_items`.`region` AS `region`,
    `lost_items`.`location` AS `location`,
    `lost_items`.`image_url` AS `image_url`,
    `lost_items`.`status` AS `status`
FROM `lost_items`;

CREATE ALGORITHM=TEMPTABLE SQL SECURITY INVOKER
VIEW `found_items_kst`
AS
SELECT
    `found_items`.`id` AS `id`,
    `found_items`.`title` AS `title`,
    `found_items`.`user_id` AS `user_id`,
    `found_items`.`created_at` AS `created_at_utc`,
    CONVERT_TZ(`found_items`.`created_at`,'+00:00','+09:00') AS `created_at_kst`,
    `found_items`.`found_date` AS `found_date`,
    `found_items`.`category` AS `category`,
    `found_items`.`color` AS `color`,
    `found_items`.`description` AS `description`,
    `found_items`.`region` AS `region`,
    `found_items`.`location` AS `location`,
    `found_items`.`image_url` AS `image_url`,
    `found_items`.`status` AS `status`,
    `found_items`.`ownership_question` AS `ownership_question`
FROM `found_items`;
