# LOST QUEST 로컬 DB 연결 점검 기록

## 09. MySQL 로컬 연결 및 DBeaver 확인

점검일: **2026-10-10 (한국 시간)**  
점검 대상: 현재 작업 PC의 macOS 환경. 팀원의 Windows PC에서 직접 실행한 결과는 아니다.

### 0. 이후 MySQL 서버 전환 및 현재 사용 방법

이후 DBeaver 재접속 오류를 확인했을 때, Homebrew 기본 서비스가 `/opt/homebrew/var/mysql`을 사용하며 3306 포트를 점유하고 있었다. 이 서버는 아래에서 복구한 프로젝트용 `.local/mysql-data`와 별도의 DB·계정을 사용한다.

Homebrew 기본 `mysql@8.4` 서비스를 중지하고, 기존 프로젝트 데이터 폴더를 사용하는 MySQL을 `127.0.0.1:3306`에서 다시 실행했다. 앱 계정으로 접속하여 `@@datadir`가 이 프로젝트의 `.local/mysql-data/`임을 확인했고, 기존 테이블 네 개를 확인했다. 이 전환에서 비밀번호나 데이터를 변경하지 않았다.

macOS에서 프로젝트 루트 기준 다음 명령을 사용한다.

```sh
# 프로젝트용 MySQL 시작
sh backend/scripts/local-mysql.sh start

# 실행 상태 확인
sh backend/scripts/local-mysql.sh status

# 프로젝트용 MySQL 종료
sh backend/scripts/local-mysql.sh stop
```

이 명령은 macOS 서비스 관리자를 통해 프로젝트용 MySQL을 실행한다. 기존 데이터 폴더가 없으면 새 DB를 자동 생성하지 않으며, 다른 서버가 3306을 사용하면 중단한다. 현재 로그인 세션에서 실행을 유지하며, Mac 재로그인 후에는 `start` 명령을 다시 실행한다. Homebrew 기본 DB를 사용하는 `brew services start mysql@8.4` 대신 위 프로젝트용 명령을 사용한다.

DBeaver에서는 기존 연결의 사용자 이름을 `lostquest_app`으로 설정하고, Host `127.0.0.1`, Port `3306`, Database `lost_quest`, 비밀번호는 `backend/application-local.yml`의 `spring.datasource.password` 값으로 맞춘다. `root`는 별도 계정이며 이번 전환에서도 비밀번호를 변경하지 않았다. DBeaver 화면의 실제 연결 테스트는 수행하지 않았고, 동일한 앱 계정으로 MySQL 클라이언트의 TCP 접속을 검증했다.

MySQL 실행과 Spring 실행은 별도다. 이 전환 작업에서는 MySQL만 다시 실행했다. Spring은 `backend/`에서 Java 21과 `dev,local`로 아래 4절에 따라 실행하면 된다. 아래 1절의 PID와 HTTP 검증 결과는 최초 복구 당시의 기록이다.

### 1. 최초 복구 시 실행 결과 및 복구 기록

**프로젝트 DB 계정의 비밀번호를 기존 로컬 설정과 맞춘 뒤, 실제 MySQL을 사용하는 Spring 서버가 정상 실행되었다.** 2026-10-10 **14:13:03 (한국 시간)**에 기동했으며, `127.0.0.1:8080`에서 Health와 DB 조회 API의 HTTP 200 응답을 확인했다. DBeaver UI의 연결 저장·접속 테스트는 수행하지 않았다.

| 항목 | 복구 후 실제 확인 결과 |
| --- | --- |
| MySQL Server | 8.4.11, `127.0.0.1:3306`에서 정상 실행, PID `16806` |
| Java / Maven | Microsoft Java 21.0.9 / Maven Wrapper 3.9.14 |
| Spring Boot | `backend/`에서 `dev,local` 프로필로 정상 기동, PID `16957` |
| DB 인증 | 기존 로컬 설정의 계정·비밀번호로 MySQL CLI와 Spring JDBC 모두 성공 |
| 데이터베이스 | `lost_quest`, 문자 집합 `utf8mb4`, collation `utf8mb4_unicode_ci` |
| 스키마 생성 | `ddl-auto=update`로 `found_items`, `lost_items`, `match_notifications`, `users` 생성 확인 |
| 데이터 | 네 개 테이블 모두 `COUNT(*) = 0` |
| Health | `/api/health` → HTTP 200, `{"status":"OK","service":"LOST QUEST API"}` |
| DB 조회 API | `/api/lost-items`, `/api/found-items` → 각각 HTTP 200, `[]` |
| 기존 로컬 설정 | DB URL·비밀번호·JWT·경찰청 API 값 변경 없음 |
| 소스코드 | 변경 없음 |
| 실행 로그 | `backend/.local/spring-startup-fixed.log` |
| DBeaver | 이번 복구에서도 UI 조작·연결 테스트는 수행하지 않음 |

#### 1.1. 서버 실행 실패 원인

**이미 존재하던 `'lostquest_app'@'localhost'` 계정의 비밀번호가 `backend/application-local.yml`의 비밀번호와 일치하지 않았다.** 복구 전 계정이 존재하고, 인증 플러그인은 `caching_sha2_password`, 잠금은 `N`, 비밀번호 만료도 `N`임을 확인했다. `lost_quest` 데이터베이스도 이미 존재했지만 테이블은 없었다.

계정의 비밀번호를 기존 로컬 파일의 값과 동기화한 뒤 동일한 설정으로 MySQL CLI 인증과 Spring 기동이 성공했다. 따라서 계정 미생성·잠금·만료가 이번 실패의 원인은 아니었다.

Hibernate의 `Unable to determine Dialect without JDBC metadata`는 인증 실패 때문에 MySQL 정보를 읽지 못해 발생한 후속 오류였다. DB 인증을 해결하자 Dialect 오류도 사라졌으며, Dialect 설정을 강제로 추가하지 않았다.

#### 1.2. 어떻게 수정했는지

1. 이 프로젝트의 `.local/mysql-data`를 사용하는 기존 MySQL 프로세스(PID `9238`)를 정상 종료했다.
2. 서버가 정지한 상태에서 데이터 디렉터리 전체를 `.local/mysql-backups/20261010T051239Z`에 백업했다.
3. MySQL의 공식 `init-file` 방식으로 시작 시 계정·DB 상태를 확인하고 복구 SQL을 실행했다. 복구 전 테이블 목록을 저장한 `before-tables.tsv`가 비어 있어 기존 테이블이 없었음을 확인했다. [MySQL 8.4 공식 init_file 문서](https://dev.mysql.com/doc/refman/8.4/en/server-system-variables.html#sysvar_init_file)
4. `CREATE DATABASE IF NOT EXISTS`, `CREATE USER IF NOT EXISTS`를 적용하고, `ALTER USER`로 앱 계정의 비밀번호를 **기존 `backend/application-local.yml`의 값**에 맞췄다. 새 비밀번호는 생성하지 않았고, `root` 관리자 비밀번호도 변경하지 않았다.
5. 앱 계정에 개발용 `lost_quest.*` 권한을 부여했다. 기존 계정의 인증 플러그인은 변경하지 않았다.
6. 비밀번호가 포함된 임시 `init.sql`을 삭제하고, 복구용 시작 옵션을 제거한 뒤 MySQL을 정상 모드로 다시 실행했다.
7. Java 21과 `dev,local`로 Spring을 실행하고, HTTP 응답·실제 MySQL 테이블·행 개수를 검증했다.

수정 대상은 MySQL의 앱 계정 비밀번호와 해당 DB 권한이었다. `backend/application-local.yml`, JDBC URL, JWT·경찰청 API 설정 및 애플리케이션 소스코드는 그대로 유지했다. 실제 비밀번호·API 키는 이 문서에 기록하지 않는다.

#### 1.3. 최초 실패 점검 이력

아래는 복구 **이전**의 기록이다. 당시 MySQL 서버는 실행 중이었지만 앱 계정 인증 실패로 백엔드가 종료되어, 테이블 생성과 DBeaver 접속 성공을 확인하지 못했다.

| 항목 | 실제 확인 결과 |
| --- | --- |
| MySQL Server | 8.4.11 실행 중, `127.0.0.1:3306`에서 응답 |
| 기본 Java | 25.0.2 |
| 이번 실행에 사용한 Java | 설치된 Microsoft Java 21.0.9 |
| Spring Boot 실행 | `backend/`에서 `dev,local` 프로필로 실행 시도 |
| 컴파일 | 성공 |
| Hikari/JDBC DB 연결 | `1045 Access denied`로 실패 |
| MySQL CLI 재검증 | 기존 `backend/application-local.yml`의 계정·비밀번호로 같은 1045 오류 재현 |
| 기존 자동 테스트 | Java 21로 기본 기동·Entity 매핑·Health 테스트 4개 성공. H2 기반이며 실제 MySQL 성공을 의미하지 않음 |
| 관리자 접근 | `root`의 비밀번호 없는 접속도 1045. 사용 가능한 관리자 비밀번호는 확인되지 않음 |
| 저장된 MySQL 로그인 | `mysql_config_editor`에 저장된 로그인 항목 없음 |
| 기존 로컬 설정 | DB 설정을 변경하지 않았으며, 기존 JWT 설정(64바이트)과 경찰청 API 설정 보존 |
| DBeaver | 설치 확인. UI 제어 권한이 없어 연결 화면 확인·연결 저장·접속 테스트는 수행하지 못함 |
| 점검 후 백엔드 상태 | 실패 후 종료됨. `8080` 포트에서 수신 중인 프로세스 없음 |

대표 오류는 다음과 같다. 실제 비밀번호와 API 키는 기록하지 않는다.

```text
Access denied for user 'lostquest_app'@'localhost' (using password: YES)
```

`using password: YES`는 비밀번호를 전송했다는 뜻이며, 그 비밀번호가 맞다는 뜻은 아니다. JDBC와 MySQL CLI에서 같은 오류가 발생했으므로 Spring 설정만의 문제가 아니라 **현재 계정 정보로 MySQL 인증이 통과하지 않는 문제**까지 확인했다.

인증 실패 후 Hibernate에서 발생한 Dialect/JDBC metadata 관련 오류는 DB 정보를 읽지 못해 이어진 후속 오류다. 이번 결과에서는 Dialect를 강제로 지정하기보다 선행 인증 문제를 해결한 뒤 다시 실행해야 한다.

최초 점검 당시 다음 항목은 관리자 인증 문제로 **미검증**이었다. 복구 후 DBeaver를 제외한 항목은 위 1절에서 확인했다.

- `lost_quest` 데이터베이스 존재 여부
- `'lostquest_app'@'localhost'` 계정 존재 여부와 인증 정책
- 해당 계정의 `lost_quest` 접근·DDL 권한
- 네 개 테이블의 존재 또는 신규 생성 여부
- 백엔드 정상 시작 및 DB를 조회하는 API 응답
- DBeaver의 실제 연결 성공 여부

최초 점검만으로는 비밀번호 불일치, 계정 미생성, 다른 호스트 조건 중 원인을 확정할 수 없었다. 이후 복구 전 계정 상태 조회와 비밀번호 동기화 후 성공으로 비밀번호 불일치를 확인했다.

### 2. 이 프로젝트에서 사용하는 설정 위치

현재 프로젝트는 `backend/src/main/resources/application.yml`에서 다음 파일을 가져온다.

```yaml
spring:
  config:
    import: optional:file:./application-local.yml
```

따라서 기존 설정을 이어 쓰려면 **`backend/application-local.yml`을 유지하고 `backend/`에서 실행**한다. 이 파일은 Git 추적에서 제외된다. JWT·경찰청 설정이 들어 있는 파일 전체를 DB 예제로 덮어쓰면 안 된다.

`backend/src/main/resources/application-local.yml`도 `local` 프로필이 활성화되면 프로필 설정으로 읽힐 수 있다. 그러나 현재 외부 로컬 파일과 별도 파일을 동시에 두면 어떤 값이 적용되는지 혼동할 수 있으므로, 이번 안내에서는 기존 `backend/application-local.yml`을 기준으로 한다.

`application-dev.yml`에는 이미 다음 설정이 있다.

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: ${JPA_DDL_AUTO:update}
```

`dev` 프로필에서 기본값은 `update`이며, `JPA_DDL_AUTO` 환경변수를 지정했다면 그 값이 우선한다. `dev`가 활성화되지 않으면 공통 설정의 기본값은 `validate`다.

이번에 정상 동작을 확인한 기존 로컬 파일의 `spring.datasource` 구조는 다음과 같다. 복구 과정에서 변경하지 않았다. 아래 비밀번호 표시는 자리표시자이며 실제 값은 Git에서 제외된 로컬 파일에만 둔다. 다른 PC에 적용할 때 기존 `spring:`을 중복 작성하지 않는다.

```yaml
spring:
  datasource:
    url: "jdbc:mysql://127.0.0.1:3306/lost_quest?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&characterEncoding=UTF-8"
    username: lostquest_app
    password: "<이 PC의 실제 DB 비밀번호>"
```

기존 URL 그대로 연결에 성공했으므로 `allowPublicKeyRetrieval`이나 `sslMode=DISABLED`를 추가할 필요가 없었다. 인증 옵션을 추가해도 잘못된 자격증명으로 발생한 1045 오류는 해결되지 않는다.

JWT 키는 기존 값을 유지한다. 키가 없거나 32바이트 미만이면 DB 문제를 해결해도 별도의 시작 오류가 생긴다. 경찰청 API 키가 없으면 해당 공공 API 기능이 실패할 수 있으나 네 개 Entity 테이블 생성과는 별개다.

### 3. 다른 PC에서 관리자 계정으로 확인할 사항

아래는 다른 PC에서 동일한 문제가 발생했을 때의 일반 확인 절차다. 현재 작업 PC의 복구 결과는 1절에 기록했다. 이번 복구에서 관리자 비밀번호는 변경하지 않았고 앱 계정의 비밀번호를 기존 로컬 설정에 맞췄다.

MySQL을 설치·관리한 사용자가 알고 있는 관리자 비밀번호로 직접 접속한다.

```sh
mysql -u root -p
```

다른 관리자 계정을 사용하는 PC라면 해당 계정으로 접속한다. `-p` 뒤에 비밀번호를 붙이지 않고 입력 프롬프트에서 입력한다.

관리자 세션에서 계정과 DB를 먼저 확인한다. 인증 문자열·비밀번호 해시는 조회하거나 공유할 필요가 없다.

```sql
SELECT User, Host, plugin, account_locked, password_expired
FROM mysql.user
WHERE User = 'lostquest_app';

SELECT SCHEMA_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'lost_quest';
```

`'lostquest_app'@'localhost'` 계정이 존재하면 권한도 확인한다.

```sql
SHOW GRANTS FOR 'lostquest_app'@'localhost';
```

DB와 계정이 없어서 새로 만들기로 결정한 경우에는 관리자가 다음을 실행한다. 비밀번호는 이 PC에서 직접 정한 값으로 바꾼다.

```sql
CREATE DATABASE IF NOT EXISTS lost_quest
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'lostquest_app'@'localhost'
IDENTIFIED BY '<이 PC에서 직접 정한 비밀번호>';

GRANT ALL PRIVILEGES ON lost_quest.*
TO 'lostquest_app'@'localhost';
```

권한 범위는 개발용 `lost_quest` DB에 한정된다. 기존 README에는 필요한 권한을 개별 부여하는 예제도 있으므로 팀의 DB 운영 방침에 맞춰 선택한다.

**`CREATE USER IF NOT EXISTS`는 이미 존재하는 계정의 비밀번호를 변경하지 않는다.** 계정이 있으면 경고를 반환한다. [MySQL 8.4 공식 CREATE USER 문서](https://dev.mysql.com/doc/refman/8.4/en/create-user.html)

기존 DB가 있으면 `CREATE DATABASE IF NOT EXISTS`도 해당 DB의 기존 collation을 바꾸지 않는다.

기존 계정의 실제 비밀번호를 알고 있다면 로컬 YAML과 DBeaver에 그 값을 맞춘다. 계정의 비밀번호를 로컬 설정과 동기화해야 한다면 다음처럼 `ALTER USER`를 사용한다. `ALTER USER`는 기존 자격증명을 변경하므로 같은 계정을 사용하는 프로그램도 해당 값과 일치해야 한다. 이번 작업 PC에서는 로컬 파일을 바꾸지 않고 앱 계정을 로컬 파일의 기존 값에 맞췄다.

```sql
ALTER USER 'lostquest_app'@'localhost'
IDENTIFIED BY '<이 PC의 로컬 설정과 일치하는 비밀번호>';
```

계정의 `Host`, 잠금·만료 상태가 예상과 다르다면 해당 결과를 기준으로 관리자가 원인을 확인한다. 이번 기록만으로 계정을 삭제하거나 인증 플러그인을 변경할 근거는 없다.

### 4. 백엔드 재실행

아래 명령은 인증 문제를 해결한 후 수행하는 절차다. Windows에서 직접 검증한 결과는 아니다. 두 환경 모두 JDK 21과 기존 로컬 설정을 사용한다.

Windows PowerShell:

```powershell
cd backend
# Java 기본 버전이 21이 아니라면 설치된 JDK 21 경로를 사용
$env:JAVA_HOME = 'C:\path\to\jdk-21'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version

$env:SPRING_PROFILES_ACTIVE = 'dev,local'
.\mvnw.cmd spring-boot:run
```

macOS 터미널:

```sh
cd backend
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
java -version

SPRING_PROFILES_ACTIVE=dev,local sh ./mvnw spring-boot:run
```

macOS의 명령은 설치된 Java 21을 선택한다. 이번 실행에서는 Microsoft Java 21.0.9를 사용했다. `sh ./mvnw`로 실행하면 Wrapper 파일의 실행 권한에 의존하지 않는다.

정상 시작 로그가 나온 다음 `/api/health`와 물품 목록을 확인한다. Health는 DB를 직접 조회하지 않으므로 목록 API까지 확인해야 한다.

```powershell
# Windows PowerShell
Invoke-RestMethod http://127.0.0.1:8080/api/health
Invoke-RestMethod http://127.0.0.1:8080/api/lost-items
Invoke-RestMethod http://127.0.0.1:8080/api/found-items
```

```sh
# macOS
curl -i http://127.0.0.1:8080/api/health
curl -i http://127.0.0.1:8080/api/lost-items
curl -i http://127.0.0.1:8080/api/found-items
```

초기 데이터가 없다면 목록 API의 HTTP 200과 `[]` 응답은 정상이다.

### 5. DBeaver 접속 입력값

최초 점검에서 DBeaver UI 접근 시 `Computer Use permissions are not granted`가 반환되었다. 이번 백엔드 복구에서도 DBeaver UI 조작·연결 테스트는 수행하지 않았다. 아래는 사용자가 입력할 설정이며, 연결을 저장하거나 성공을 확인한 결과가 아니다.

| 입력 항목 | 값 |
| --- | --- |
| 데이터베이스 종류 | MySQL (8 이상용) |
| 연결 이름 | 예: `LOST QUEST Local` |
| Host | `127.0.0.1` |
| Port | `3306` |
| Database | `lost_quest` |
| Username | `lostquest_app` |
| Password | 관리자가 확인한 실제 비밀번호. 로컬 YAML과 같은 값 |

현재 백엔드는 기존 JDBC URL로 정상 연결된다. DBeaver에서 별도로 `Public Key Retrieval is not allowed` 등 인증 관련 오류가 발생하고 루프백 개발 연결을 사용한다면 다음 옵션을 검토할 수 있다. 이번에 DBeaver에서 적용하거나 검증한 값은 아니다.

| 속성 | 로컬 개발용 값 |
| --- | --- |
| `allowPublicKeyRetrieval` | `true` |
| `sslMode` | `DISABLED` |
| `connectionTimeZone` | `UTC` |
| `forceConnectionTimeZoneToSession` | `true` |
| `characterEncoding` | `UTF-8` |

화면에 표시되는 SSL 옵션은 드라이버에 따라 다를 수 있다. SSL 탭 또는 Driver properties에서 설정하고 **Test Connection**으로 실제 연결을 확인한다. 위 TLS 해제 값은 같은 PC의 루프백 개발 연결에만 사용한다. [DBeaver 공식 SSL configuration 문서](https://dbeaver.com/docs/dbeaver/SSL-Configuration/)

접속에 성공하면 SQL 편집기에서 확인한다.

```sql
SELECT VERSION(), CURRENT_USER();
USE lost_quest;
SHOW TABLES;
```

Entity에 지정된 테이블은 다음 네 개다. `lost_quest`는 테이블이 아니라 데이터베이스 이름이다.

```text
found_items
lost_items
match_notifications
users
```

`ddl-auto=update`는 Entity 구조를 반영하며 기존 PC의 회원·물품 데이터를 복사하지 않는다. 다른 PC의 데이터까지 필요하다면 별도의 덤프·복원 작업이 필요하다.

### 6. 테스트 안내 참고 사항

`LostQuestApplicationTests`, `EntityMappingTest`, `HealthControllerTest`를 Java 21로 실행했다. **총 4개 테스트, Failures 0, Errors 0, BUILD SUCCESS**였다. 실행 기록은 Git에서 제외되는 `backend/.local/db-check-tests.log`에 저장했다. 이 결과는 H2에서 기본 기동·Entity 매핑·Health 동작을 확인한 것이며 실제 MySQL 인증·테이블 생성 성공을 증명하지 않는다.

현재 `MySqlIntegrationIT.java`는 `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD` 환경변수를 읽어 소켓·JDBC 연결만 확인한다. 기본 DB 이름은 `lost_quest`이며 로컬 YAML을 직접 읽지 않는다.

README의 `MYSQL_TEST_*` 기반 전용 DB 안내와 현재 구현은 다르다. 현재 테스트에는 안내된 DB 이름 보호나 JPA/API 계약 검증이 없으므로, README의 예제만으로 이번 네 개 테이블 생성을 검증했다고 판단하면 안 된다. 이번 작업에서는 테스트 코드와 README를 변경하지 않았다.

### 7. 완료 판단 기준

아래 조건이 모두 확인되면 팀원의 로컬 DB 연결 준비가 끝난다.

1. 실제 비밀번호로 `lostquest_app` 인증 성공
2. `dev,local` 백엔드 정상 시작
3. `SHOW TABLES`에서 네 개 Entity 테이블 확인
4. 물품 목록 API의 HTTP 200 응답 확인
5. DBeaver Test Connection 성공 및 같은 DB의 테이블 확인

**2026-10-10 최초 복구 직후 작업 PC에서 1~4번 조건이 모두 성공했다.** 실제 MySQL 인증과 Spring 정상 기동, 네 개 테이블 생성 및 DB 조회 API 응답을 확인했다. 이후 서버 전환 시의 현재 상태와 실행 방법은 0절에 기록했다. DBeaver 연결 테스트인 5번은 수행하지 않았으며, 팀원의 Windows PC도 직접 검증하지 않았다.
