# LOST QUEST — Mac 전체 실행 가이드

확인일: 2026-10-10 (한국 시간). 현재 작업 PC의 실제 설정을 기준으로 작성했다.

## 현재 확인 결과

MySQL, Spring 백엔드, Vite 프론트엔드가 모두 정상 실행 중이다. 실행 중인 서버를 다시 시작할 필요 없이 아래 화면 주소로 접속할 수 있다.

| 구성 | 주소 / 포트 | 확인 결과 |
| --- | --- | --- |
| 프로젝트용 MySQL | `127.0.0.1:3306` | 이 프로젝트의 `.local/mysql-data` 사용 |
| Spring 백엔드 | `http://127.0.0.1:8080` | 상태 확인·분실물·습득물 API 모두 HTTP 200 |
| React 프론트엔드 | `http://127.0.0.1:5173` | LOST QUEST 개발 페이지 HTTP 200 |
| 프론트엔드 → 백엔드 연결 | Origin `http://127.0.0.1:5173` | 백엔드 응답의 CORS 허용 주소 확인 |

확인한 환경은 Microsoft Java 21.0.9, MySQL 8.4.11, Node.js 24.11.1, npm 11.6.2이다. Maven은 프로젝트 Wrapper로 실행한다.

## 매번 실행하는 순서

**터미널 창 또는 탭 두 개**를 사용한다. 첫 번째에서 MySQL을 시작한 뒤 백엔드를 실행하고, 두 번째에서 프론트엔드를 실행한다. MySQL은 백그라운드 서비스이므로 별도 터미널을 계속 열어둘 필요가 없다.

### 첫 번째 터미널: MySQL → 백엔드

```bash
cd /Users/a1/teamProject/lost_quest/LOST_QUEST

# 기존 프로젝트용 MySQL 시작
sh backend/scripts/local-mysql.sh start

# 상태 확인
sh backend/scripts/local-mysql.sh status

# 백엔드 실행
cd backend
JAVA_HOME=$(/usr/libexec/java_home -v 21) \
SPRING_PROFILES_ACTIVE=dev,local sh ./mvnw spring-boot:run
```

- MySQL이 이미 실행 중이면 `start`는 그대로 유지하고 실행 중이라는 메시지를 출력한다.
- `status`에 프로젝트의 `.local/mysql-data`가 표시되는지 확인한다.
- 백엔드 로그에 `Started LostQuestApplication`이 나오면 정상 시작이다.
- 백엔드가 실행되는 동안 첫 번째 터미널을 열어 둔다.
- 시작 과정에서 MySQL `stop` 명령을 실행하지 않는다. 종료할 때 사용한다.

### 두 번째 터미널: 프론트엔드

```bash
cd /Users/a1/teamProject/lost_quest/LOST_QUEST/frontend
npm run dev
```

터미널에 `http://127.0.0.1:5173/`가 표시되면 브라우저에서 접속한다. 프론트엔드가 실행되는 동안 두 번째 터미널도 열어 둔다.

## 최초 준비와 설정 파일

현재 PC에는 아래 두 설정 파일과 프론트엔드 의존성이 이미 준비되어 있다.

### 백엔드 로컬 설정

파일: `/Users/a1/teamProject/lost_quest/LOST_QUEST/backend/application-local.yml`

이 파일에 프로젝트용 DB 접속 정보, JWT 키, 경찰청 API 설정이 들어 있다. 기존 파일을 그대로 사용한다. `backend/`에서 백엔드를 실행해야 이 파일을 읽는다.

- DB: `127.0.0.1:3306/lost_quest`
- 사용자: `lostquest_app`
- 비밀번호: 이 파일의 `spring.datasource.password` 값
- 프로필: `dev,local`
- 개발용 테이블 생성 설정: `dev`의 `ddl-auto=update`

MySQL 시작 스크립트는 현재 PC에 이미 있는 `.local/mysql-data`를 재사용한다. 해당 폴더가 없으면 새 DB를 자동 생성하지 않는다. 다른 PC의 최초 DB 준비는 `09_MySQL_로컬_연결_점검.md`의 안내를 참고한다.

### 프론트엔드 설정

파일: `/Users/a1/teamProject/lost_quest/LOST_QUEST/frontend/.env.local`

```dotenv
VITE_API_BASE_URL=http://localhost:8080
```

현재 파일에는 끝에 `/`가 붙어 있으며, 프로젝트 코드가 이를 정리하므로 정상 동작한다. 이 파일을 수정하면 실행 중인 프론트엔드를 종료한 뒤 `npm run dev`로 다시 실행한다.

새로 받은 프로젝트에서 `.env.local`이 없을 때만 아래 명령을 사용한다. 이미 있는 파일은 유지한다.

```bash
cd /Users/a1/teamProject/lost_quest/LOST_QUEST/frontend
if [ ! -f .env.local ]; then
  cp .env.example .env.local
fi
```

프론트엔드 패키지는 최초 설치 또는 의존성 변경 후에 설치한다. 매번 서버를 실행할 때 설치할 필요는 없다.

```bash
cd /Users/a1/teamProject/lost_quest/LOST_QUEST/frontend
npm ci
```

## 정상 실행 확인

브라우저에서 `http://127.0.0.1:5173`을 열고, 페이지 하단의 서버 연결 확인 버튼을 누른다. 터미널로도 다음을 확인할 수 있다.

```bash
curl -i http://127.0.0.1:8080/api/health
curl -i http://127.0.0.1:8080/api/lost-items
curl -i http://127.0.0.1:8080/api/found-items
```

각각 HTTP 200이면 정상이다. Health 본문은 `{"status":"OK","service":"LOST QUEST API"}`다. 물품 목록은 등록된 데이터가 있으면 배열에 표시되고, 없으면 `[]`가 나온다.

DBeaver에서는 MySQL 연결의 Host를 `127.0.0.1`, Port를 `3306`, Database를 `lost_quest`, Username을 `lostquest_app`으로 설정한다. 비밀번호는 백엔드 로컬 설정의 값과 맞춘다. 이 문서의 확인은 MySQL과 HTTP 응답 기준이며 DBeaver UI 연결 테스트는 별도로 수행해야 한다.

## 종료 방법

1. 프론트엔드 터미널에서 `Ctrl+C`를 누른다.
2. 백엔드 터미널에서 `Ctrl+C`를 누른다.
3. 마지막으로 MySQL을 종료한다.

```bash
cd /Users/a1/teamProject/lost_quest/LOST_QUEST
sh backend/scripts/local-mysql.sh stop
```

백엔드와 프론트엔드만 종료하면 MySQL은 계속 실행된다. Mac 재로그인 후에는 프로젝트용 MySQL `start` 명령을 다시 실행한다.

## 실행 중 문제가 생길 때

| 증상 | 확인할 내용 |
| --- | --- |
| MySQL의 3306 포트가 이미 사용 중 | 다른 MySQL이 실행 중인지 확인. 프로젝트용 DB는 위 스크립트로 실행 |
| `Access denied` | DBeaver와 백엔드의 사용자·비밀번호 및 접속 중인 MySQL 데이터 폴더 확인 |
| 백엔드 8080 포트가 이미 사용 중 | 기존 백엔드 터미널이 실행 중인지 확인 |
| 프론트엔드 5173 포트가 이미 사용 중 | 기존 프론트엔드 터미널이 실행 중인지 확인 |
| 프론트엔드에서 서버 연결 실패 | 백엔드 정상 기동 여부와 `.env.local`의 API 주소 확인 |

Homebrew 기본 MySQL을 `brew services start mysql@8.4`로 실행하면 `/opt/homebrew/var/mysql`의 별도 DB가 3306을 사용할 수 있다. 해당 기본 서비스가 실행된 경우 중지하고 프로젝트용 DB를 시작한다.

```bash
brew services stop mysql@8.4
cd /Users/a1/teamProject/lost_quest/LOST_QUEST
sh backend/scripts/local-mysql.sh start
```

## 전체 DB 저장 확인

회원·물품·매칭 알림에 더해 반환·QR·경험치·활동 알림·사진을 DB에 저장하도록 확장했다. 백엔드를 `dev,local`로 실행하면 총 8개 테이블이 준비된다. DBeaver에서 연결을 새로고침하면 확인할 수 있다. 자세한 테이블과 반환 이용 방법은 [전체 DB 저장 가이드](11_이메일_검증과_전체_DB_저장.md)를 참고한다.
