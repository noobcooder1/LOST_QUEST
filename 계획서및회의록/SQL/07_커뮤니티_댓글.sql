-- 2026-10-20: 커뮤니티 게시글 댓글을 위한 추가 스키마.
-- 기존 게시글·물품 데이터는 이동·복사·삭제하지 않습니다.
-- 운영 환경에서는 백업 후 새 서버 실행 전에 적용합니다. dev의 ddl-auto=update는 자동 추가합니다.
USE lost_quest;

CREATE TABLE IF NOT EXISTS community_comments (
    id bigint NOT NULL AUTO_INCREMENT,
    created_at datetime(6) NOT NULL COMMENT '서버 생성 UTC 등록 시각',
    post_id bigint NOT NULL,
    author_id bigint NOT NULL,
    content varchar(1000) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_community_comment_post (post_id, created_at, id),
    CONSTRAINT fk_community_comment_post FOREIGN KEY (post_id) REFERENCES community_posts (id),
    CONSTRAINT fk_community_comment_author FOREIGN KEY (author_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
