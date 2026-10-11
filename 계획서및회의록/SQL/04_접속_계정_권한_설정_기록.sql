-- 로컬 접속 계정·권한 설정 이력 (테이블 DDL과 별개)
-- 인증 플러그인·인증 해시 부분을 IDENTIFIED BY '<로컬 비밀번호>'라는 동등한 설정 예시로 대체했습니다.
-- 비밀번호를 복원하는 파일이나 그대로 재실행할 파일이 아닙니다.
-- binlog.000001의 root 변경은 이전 초기 설정 기록이며, 14:12 접속 복구에서는 root를 변경하지 않았습니다.

-- 261010 13:31:24 KST / binlog.000001
ALTER USER 'root'@'localhost' IDENTIFIED BY '<로컬 비밀번호>';

-- 261010 13:47:37 KST / binlog.000001
CREATE USER IF NOT EXISTS 'lostquest_app'@'localhost' IDENTIFIED BY '<로컬 비밀번호>';

-- 261010 13:47:44 KST / binlog.000001
CREATE USER IF NOT EXISTS 'lostquest_app'@'localhost' IDENTIFIED BY '<로컬 비밀번호>';

-- 261010 13:47:55 KST / binlog.000001
GRANT ALL PRIVILEGES ON `lost_quest`.* TO 'lostquest_app'@'localhost';

-- 261010 14:12:43 KST / binlog.000003
CREATE USER IF NOT EXISTS 'lostquest_app'@'localhost' IDENTIFIED BY '<로컬 비밀번호>';

-- 261010 14:12:43 KST / binlog.000003
ALTER USER 'lostquest_app'@'localhost' IDENTIFIED BY '<로컬 비밀번호>';

-- 261010 14:12:43 KST / binlog.000003
GRANT ALL PRIVILEGES ON `lost_quest`.* TO 'lostquest_app'@'localhost';

