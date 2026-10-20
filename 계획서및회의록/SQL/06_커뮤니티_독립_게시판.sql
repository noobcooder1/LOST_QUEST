-- 2026-10-20: 독립 커뮤니티 게시판을 위한 추가 스키마.
-- 기존 물품/질문/신고 데이터는 이동·복사·삭제하지 않습니다.
-- 운영 환경에서는 백업 후 새 서버 실행 전에 적용합니다. dev의 ddl-auto=update는 자동 추가합니다.
USE lost_quest;

CREATE TABLE IF NOT EXISTS community_posts (
    id bigint NOT NULL AUTO_INCREMENT,
    created_at datetime(6) NOT NULL COMMENT '서버 생성 UTC 등록 시각',
    author_id bigint NOT NULL,
    category enum('CHAT','INFO','QUESTION','STORY') NOT NULL,
    title varchar(120) NOT NULL,
    content varchar(3000) NOT NULL,
    image_url varchar(2048) DEFAULT NULL,
    linked_item_type enum('FOUND','LOST') DEFAULT NULL,
    linked_item_id bigint DEFAULT NULL,
    PRIMARY KEY (id),
    KEY ix_community_post_newest (created_at, id),
    KEY ix_community_post_category (category, created_at, id),
    CONSTRAINT fk_community_post_author FOREIGN KEY (author_id) REFERENCES users (id),
    -- 종류별 두 물품 테이블을 참조하므로 연결의 존재·공개 상태는 서버에서 검증합니다.
    CONSTRAINT ck_community_post_link CHECK (
        (linked_item_type IS NULL AND linked_item_id IS NULL)
        OR (linked_item_type IS NOT NULL AND linked_item_id IS NOT NULL AND linked_item_id > 0)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
