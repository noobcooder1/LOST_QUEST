-- MySQL 8.4 / lost_quest / 2026-10-10 21:07:23 KST에 적용한 조회용 뷰
-- 기존 기본 테이블이 준비된 DB에서 추가·갱신하는 용도입니다 (반복 실행 가능).
-- 실제 실행 원문·DEFINER·시각은 01·02 이력 파일과 정리 문서 5절에서 확인합니다.
-- 특정 DEFINER를 지정하지 않아 다른 PC에서는 실행 계정이 생성자가 됩니다.
-- created_at: 서버가 생성한 실제 UTC 등록 시각 (DATETIME(6)).
-- created_at_kst: 원본을 한국 시간으로 변환한 조회 결과. 기존 데이터는 변경하지 않습니다.
-- lost_date / found_date: 글 등록 날짜와 별개인 분실·습득 사건 날짜입니다.
-- 숫자 오프셋을 사용하므로 이름 기반 시간대 테이블을 설치할 필요가 없습니다.
USE lost_quest;

CREATE OR REPLACE ALGORITHM = TEMPTABLE SQL SECURITY INVOKER
VIEW lost_items_kst AS
SELECT
    id, title, user_id,
    created_at AS created_at_utc,
    CONVERT_TZ(created_at, '+00:00', '+09:00') AS created_at_kst,
    lost_date, category, color, description, region, location, image_url, status
FROM lost_items;

CREATE OR REPLACE ALGORITHM = TEMPTABLE SQL SECURITY INVOKER
VIEW found_items_kst AS
SELECT
    id, title, user_id,
    created_at AS created_at_utc,
    CONVERT_TZ(created_at, '+00:00', '+09:00') AS created_at_kst,
    found_date, category, color, description, region, location, image_url, status,
    ownership_question
FROM found_items;

-- DBeaver에서 Views 항목을 새로고침한 다음 아래 조회를 실행합니다.
SELECT * FROM found_items_kst ORDER BY created_at_utc DESC, id DESC;
SELECT * FROM lost_items_kst ORDER BY created_at_utc DESC, id DESC;
