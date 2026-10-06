# LOST QUEST 발표자료 개발 기록

## 06. 경찰청 공공데이터 OpenAPI 연동

### 1. 구현 목적

검색 화면의 "공공데이터"는 지금까지 형식만 흉내 낸 가상 seed 데이터였다.

이번 단계에서는 공공데이터포털의 **경찰청 분실물·습득물 OpenAPI**와 **경찰청 공통코드조회 OpenAPI**를 실제로 연동하여,

React
→ LOST QUEST Spring Boot
→ 경찰청 OpenAPI
→ XML
→ Backend 파싱·정규화
→ LOST QUEST JSON
→ React 검색 화면

흐름으로 실제 경찰청 유실물 데이터를 날짜·검색어·지역·물품분류·색상 조건으로 실시간 조회하도록 구현하였다.

경찰청 데이터는 MySQL에 복제하지 않고, 기존 LostItem / FoundItem 엔티티와도 섞지 않았다.

---

### 2. 사용한 경찰청 공공데이터 API

| 서비스 | 공공데이터포털 | 서비스 URL | 용도 |
| --- | --- | --- | --- |
| 경찰청_분실물정보 조회 서비스 | data.go.kr/data/15000799 | `https://apis.data.go.kr/1320000/LostGoodsInfoInqireService` | 분실물 목록·검색·상세 |
| 경찰청_습득물정보 조회 서비스 | data.go.kr/data/15058696 | `https://apis.data.go.kr/1320000/LosfundInfoInqireService` | 습득물 목록·검색·상세 |
| 경찰청_공통코드조회 서비스 | data.go.kr/data/15000651 | `https://apis.data.go.kr/1320000/CmmnCdService` | 지역·색상·물품분류 코드 |

명세는 공공데이터포털 상세 페이지의 오퍼레이션별 명세와 첨부된 공식 활용가이드(hwp)를 직접 확인하였다.
이후 **실제 인증키로 실제 API를 호출하여 응답을 확인한 뒤** 구현하였다.
공통코드 서비스는 분실물·습득물 연동 중 코드표가 필요하다는 것을 확인하고 별도로 신청·승인받았다.

---

### 3. 실제 API endpoint 및 요청 구조

#### 분실물

| 오퍼레이션 | 용도 | 요청 파라미터 |
| --- | --- | --- |
| `getLostGoodsInfoAccToClAreaPd` | 분류·지역·기간별 목록 | `START_YMD`, `END_YMD`, `PRDT_CL_CD_01/02`, `LST_LCT_CD`, `pageNo`, `numOfRows` |
| `getLostGoodsInfoAccTpNmCstdyPlace` | 물품명·분실장소 검색 | `LST_PRDT_NM`, `LST_PLACE`, `pageNo`, `numOfRows` |
| `getLostGoodsDetailInfo` | 상세 | `ATC_ID` |

#### 습득물

| 오퍼레이션 | 용도 | 요청 파라미터 |
| --- | --- | --- |
| `getLosfundInfoAccToClAreaPd` | 분류·색상·지역·기간별 목록 | `PRDT_CL_CD_01/02`, `FD_COL_CD`, `START_YMD`, `END_YMD`, `N_FD_LCT_CD`, `pageNo`, `numOfRows` |
| `getLosfundInfoAccTpNmCstdyPlace` | 물품명·보관장소 검색 | `PRDT_NM`, `DEP_PLACE`, `pageNo`, `numOfRows` |
| `getLosfundDetailInfo` | 상세 | `ATC_ID`, `FD_SN` |
| `getLosfundInfoAccToLc` | 위치 기반 (이번 단계 미사용) | `PRDT_NM`, `ADDR` |

#### 공통코드

| 오퍼레이션 | 용도 | 요청 파라미터 (실제 동작) |
| --- | --- | --- |
| `getCmmnCd` | 공통코드 전체 또는 그룹 | `GRP_NM`(그룹명, 예: "지역구분", "색상코드"), `CD_NM`(코드명) |
| `getThngClCd` | 물품분류 | 없음 = 대분류, `PRDT_CL_CD_01` = 해당 대분류의 하위 분류 |

인증키 파라미터는 `serviceKey`이며, 실제 호출에서 `ServiceKey` 대소문자도 모두 인식되었다.

---

### 4. 실제 XML 응답 구조

정상 응답 (UTF-8, XML 선언 없음, Content-Type에 charset 없음):

```xml
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <numOfRows>3</numOfRows><pageNo>1</pageNo><totalCount>33100</totalCount>
    <items><item>…</item></items>
  </body>
</response>
```

- 결과 없음: `<items/>`, `totalCount=0`
- 상세 응답: `body`에 `items/item` 하나 (paging 값 없음). 없는 ID는 `resultCode=00` + item 없음
- 공통코드 응답: `body`에 `items`만 있고 paging 값 없음. `numOfRows`를 무시하고 전체를 반환 (전체 799건, 45개 그룹)

```xml
<item><cdNm>서울특별시</cdNm><commCd>LCA000</commCd><commGrpCd>LC0</commGrpCd><grpNm>지역구분</grpNm></item>
<item><prdtCd>PRH200</prdtCd><prdtNm>남성용 지갑</prdtNm><hiPrdtCd>PRH000</hiPrdtCd></item>
```

공공데이터포털 게이트웨이 오류 (**HTTP 200으로 오는 경우도 있음**):

```xml
<OpenAPI_ServiceResponse><cmmMsgHeader>
  <errMsg>HTTP_ERROR</errMsg><returnAuthMsg>HTTP 에러</returnAuthMsg><returnReasonCode>04</returnReasonCode>
</cmmMsgHeader></OpenAPI_ServiceResponse>
```

실제로 확인한 오류:

| 상황 | HTTP | 응답 |
| --- | --- | --- |
| 인증키 없음 | 401 | `SERVICE_KEY_IS_NULL` (20) |
| 미등록 인증키 / 미승인 서비스 | 403 | `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` (30) |
| 분실물 목록을 날짜 없이 호출 | 200 | `HTTP_ERROR` (04) |
| 분실물 물품명을 "지갑"처럼 넓게 검색 | 200 | `HTTP_ERROR` (04) |
| 날짜 형식 오류 (`2026-10-05`) | 200 | `HTTP_ERROR` (04) |
| 습득물 상세에서 `FD_SN` 누락 | 200 | `HTTP_ERROR` (04) |
| `numOfRows=abc` | 200 | `resultCode=99` "시스템 오류가 발생했습니다" |

공식 활용가이드에는 게이트웨이 오류코드 표가 없어, 요청 한도 초과 등 직접 재현하지 못한 오류는 `errMsg`의 `LIMITED_NUMBER` 포함 여부와 HTTP 429로만 분류하였다. (실제 재현은 하지 않음)

---

### 5. 분실물 / 습득물 API 차이 (실제 데이터 기준)

2026-09-01 ~ 2026-10-05 기준 분실물 100건·습득물 100건 목록과 각 20건 상세를 직접 확인하였다.

| 항목 | 분실물 목록 | 분실물 상세 | 습득물 목록 | 습득물 상세 |
| --- | --- | --- | --- | --- |
| 고유 식별자 | `atcId` 100% | `atcId` | `atcId` + `fdSn` 100% | `atcId` + `fdSn` |
| 물품명 | `lstPrdtNm` 100% | O | `fdPrdtNm` 100% | O |
| 게시 제목 | `lstSbjt` 100% | O | `fdSbjt` 100% | X |
| 물품 분류 | `prdtClNm` 100% (문자열 "지갑 > 남성용 지갑") | O | `prdtClNm` 100% | O |
| 색상 | **없음** | `clrNm` 20/20 (명세에 없음) | `clrNm` 100% | **없음** |
| 날짜 | `lstYmd` 100% | O + 시간대 `lstHor` | `fdYmd` 100% | O + `fdHor` |
| 장소 | `lstPlace` 자유 텍스트 100% | O + 장소 유형 `lstPlaceSeNm` | **습득 장소 없음** | `fdPlace` (장소 유형, 예: "노상") |
| 지역 | **없음** | `lstLctNm` 20/20 (문자열, 예: "서울특별시", 명세에 없음) | **없음** | **없음** |
| 보관 장소 | 해당 없음 | 해당 없음 | `depPlace` 100% | O |
| 이미지 | **없음** | `lstFilePathImg` 실제 사진 7/20 | `fdFilePathImg` 실제 사진 29/100 (나머지 placeholder) | 실제 사진 4/20 |
| 담당 기관·전화 | 없음 | `orgNm`, `tel` | 없음 | `orgNm`, `tel` |
| 상태 | 없음 | `lstSteNm` (예: "온라인 접수") | 없음 | `csteSteNm` (예: "보관중") |
| 특이사항 | 없음 | `uniq` = "개인정보보호정책에 의해 정보가 제공되지 않습니다." | 없음 | `uniq` 안내문 |
| 검색 조건 | 날짜·지역·물품분류 (**색상 없음**) | | 날짜·지역·물품분류·색상 | |

#### 공식 명세와 실제 응답의 차이

- 결과 메시지 필드: 명세 `resultMag` → 실제 `resultMsg`
- 이미지 host: 명세 예시 `www.lost112.go.kr` → 실제 `minwon24.police.go.kr`
- 실제 이미지 URL 형식: `https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/{atcId}/{n}/{파일ID}/{n}.do` (JPEG, HTTPS 200, redirect 없음, 최대 약 6MB)
- 사진 없음 placeholder: `https://minwon24.police.go.kr/images/sub/img02_no_img.gif`(목록), `img04_no_img.gif`(상세)
- 분실물 상세에 명세에 없는 `clrNm`, `lstLctNm`, `lstPlaceSeNm` 존재
- 습득물 상세에는 색상(`clrNm`)이 없음
- 분실물 목록은 날짜 범위 없이 호출하면 실패 (명세상 선택 항목)
- 경찰청 API가 입력을 검증하지 않음: 존재하지 않는 날짜(`20261340`)도 정상 결과, 시작>종료는 0건
- 검색어(물품명·장소) 오퍼레이션은 날짜 조건을 무시함
- **공통코드 `getCmmnCd`**: 명세 샘플은 `commCd`=코드명("서울특별시"), `cdNm`=코드("LCV000")로 되어 있으나 **실제로는 `commCd`=코드, `cdNm`=코드명** (반대)
- 공통코드는 `numOfRows`를 무시하고 paging 값 없이 전체를 반환

---

### 6. 경찰청 공통코드 체계 (실제 응답 기준)

#### 지역 — `getCmmnCd` 그룹 "지역구분"(`LC0`), 284개

- 시·도 수준 `LC?000` 20개: 서울특별시(`LCA000`), 기타(`LCE000`), 해외(`LCF000`), 전남광주통합특별시(`LCG000`), 강원도, 경기도, 경상남·북도, 전라남·북도, 충청남·북도, 제주특별자치도, 광주·대구·대전·부산·울산·인천광역시, 세종특별자치시
- 시·군·구 수준 264개 (예: `LCA001` 강남구)
- 실제 검색 확인 (습득물 최근 30일): 서울 13,308건, 부산 5,895건, **전남광주통합특별시 1,854건**, 광주광역시 150건, 전라남도 16건
- **시·군·구 코드(`LCA001` 등)로 검색하면 분실물·습득물 모두 항상 0건** → 시·도 코드만 사용
- 지역명은 경찰청 코드명을 그대로 사용하고 LOST QUEST의 지역(서울·경기 등)과 임의로 매핑하지 않음

#### 색상 — `getCmmnCd` 그룹 "색상코드"(`CL1`), 123개

- 이름이 같은 코드가 여러 개: 30개 이름이 중복 (예: 블랙(검정) = `CL1002`, `CL1043` / 그레이(회) = 15개 코드)
- 최근 30일 습득물 46,113건을 색상 코드 123개로 각각 조회한 합계가 정확히 46,113건 → **모든 습득물은 정확히 하나의 색상 코드를 가지며, 같은 이름의 여러 코드가 실제로 모두 사용됨** (예: 블랙 199건 + 9,929건)
- 경찰청 API는 색상 코드를 **한 번에 하나만** 받음 (쉼표·반복 파라미터·구분자·접두어 모두 0건)
- 분실물 API는 색상 조건이 없음 (보내도 무시되어 전체 결과)

#### 물품분류 — `getThngClCd`

- 대분류 21개 (`PRA000` 가방 … `PRZ000` 기타물품), 각 대분류의 하위 분류 1~9개 (총 85개, 예: `PRH200` 남성용 지갑)
- 하위 분류 아래 단계는 없음
- 실제 검색: 대분류(`PRDT_CL_CD_01`)와 하위 분류(`PRDT_CL_CD_02`) 모두 동작 (지갑 10,485건 / 남성용 지갑 3,732건)

---

### 7. Backend 연동 구조

```
PublicItemController   GET /api/public-items/...  (입력 형식 검증)
        ↓
PoliceItemService      날짜·검색 모드 결정, 필터 코드 검증, 색상 그룹 병렬 조회, XML → DTO 정규화
        ↓                ↘
PoliceApiClient          PoliceCodeService  공통코드 실시간 조회 + 12시간 캐시
        ↓                ↙
PoliceXmlParser        XXE 차단 XML 파서, 정상/게이트웨이 오류 구분
        ↓
경찰청 OpenAPI (분실물 / 습득물 / 공통코드)
```

- 설정: `PoliceApiProperties` (`base-url`, `connect-timeout`, `read-timeout`, `lost`/`found`/`code` 각 `service-key`)
- 기본 타임아웃: 연결 5초, 응답 20초 (실제 분실물 목록 응답이 7~10초)
- HTTP Client: JDK `HttpClient` (redirect 비허용, 응답 최대 5MB)
- 공통코드 캐시: 12시간. 조회 실패 시 60초 동안 재호출하지 않고, 이미 캐시가 있으면 이전 코드를 계속 사용

---

### 8. XML → LOST QUEST JSON 정규화

| LOST QUEST 필드 | 분실물 | 습득물 |
| --- | --- | --- |
| `source` | `POLICE` | `POLICE` |
| `type` | `LOST` | `FOUND` |
| `sourceId` | `atcId` | `atcId-fdSn` |
| `title` | `lstPrdtNm` | `fdPrdtNm` |
| `subject` | `lstSbjt` | `fdSbjt` |
| `category` / `categoryPath` | `prdtClNm`의 첫 단계 / 원문 | 동일 |
| `color` | `clrNm` (상세만) | `clrNm` (목록만) |
| `date` | `lstYmd` | `fdYmd` |
| `location` | `lstPlace` | `fdPlace` (상세만) |
| `placeType` | `lstPlaceSeNm` (상세만) | - |
| `region` | `lstLctNm` (상세만) | - |
| `storagePlace` | - | `depPlace` |
| `imageUrl` | 검증된 `lstFilePathImg` (상세만) | 검증된 `fdFilePathImg` |
| `agencyName` / `agencyTel` / `status` / `hour` / `note` | 상세만 | 상세만 |

경찰청이 주지 않는 값은 만들지 않고 `null`로 두었다. 화면에서는 "정보 없음"으로 표시한다.

---

### 9. Pagination / 검색 조건

| 내부 API | 설명 |
| --- | --- |
| `GET /api/public-items/lost` | `page`(1~1000), `size`(1~50), `from`/`to`, `region`, `category`, `subCategory` 또는 `q`(물품명), `place`(분실 장소) |
| `GET /api/public-items/found` | 위와 같고 `color` 추가, 검색어는 `q`(물품명), `storagePlace`(보관 장소) |
| `GET /api/public-items/lost/{atcId}` | 분실물 상세 |
| `GET /api/public-items/found/{atcId}/{fdSn}` | 습득물 상세 |
| `GET /api/public-items/filters` | 지역(시·도) / 물품분류(대·하위) / 색상 그룹 목록 |

- 날짜 모드: 기본 최근 30일(한국 시간 기준), 최대 90일, 미래 종료일·시작>종료는 400 (경찰청이 검증하지 않으므로 LOST QUEST가 검증)
- 검색어 모드: 경찰청 검색 API가 날짜·지역·분류·색상을 지원하지 않으므로 검색어와 함께 보내면 400
- 필터 값 검증: 형식(`LC?000`, `PR?000`, `PR???`, `CL????`)과 **현재 공통코드 목록에 존재하는지**를 모두 검사. 시·군·구 코드, 다른 대분류의 하위 분류, 그룹 대표가 아닌 색상 코드, 분실물 색상은 400
- 하위 분류만 선택하면 공통코드에서 상위 대분류를 찾아 함께 전송
- **색상 그룹**: 같은 이름의 코드마다 같은 페이지 번호로 병렬 조회(최대 4개 동시)한 뒤 날짜 내림차순으로 합침
  - `totalCount` = 코드별 합계, `totalPages` = 코드별 최댓값
  - 각 코드의 결과가 서로 겹치지 않으므로 모든 결과가 정확히 한 페이지에만 나타남
  - 대신 한 페이지에 최대 `size × 코드 수`개가 올 수 있음 (그레이(회) 15개 코드: size 5 → 최대 75건)
  - 하나라도 실패하면 부분 결과를 보여주지 않고 오류
- 응답: `items`, `page`, `size`, `totalCount`, `totalPages`, `searchMode`(`DATE_RANGE`/`KEYWORD`), `from`, `to`

---

### 10. Frontend 연동

- `services/publicItemApi.ts`: LOST QUEST Backend의 정규화 JSON과 필터 목록만 호출 (경찰청 API·인증키·XML을 브라우저가 알지 못함)
- `services/searchSources.ts`: LOST QUEST 자체 데이터, 경찰청 분실물, 경찰청 습득물을 **각각 독립적으로** 로딩
- 검색 화면
  - 출처 탭: 전체 / LOST QUEST / 경찰청 공공데이터
  - 출처별 상태: 로딩 / 건수(불러온 수 / 전체 수) / 결과 없음 / 오류 + 다시 시도 / 조건 미지원
  - 경찰청 분실물·습득물 각각 "더 보기" 페이지네이션
  - **"경찰청 공공데이터 조건"**: 시·도, 물품 분류, 세부 분류(분류 선택 후 활성화), 색상(습득물). 목록은 `/filters`에서 받아 표시하고 값은 그대로 다시 전송 (프론트에 코드 하드코딩 없음)
  - 기존 지역·카테고리 필터는 "LOST QUEST" 물품에만 적용 (경찰청 물품은 경찰청 코드로 서버에서 필터)
  - 검색어 입력 시 경찰청 조건은 비활성화하고 안내 표시
  - 색상 선택 시 경찰청 분실물은 필터 없이 보여주지 않고 "색상 조건 미지원"으로 표시
  - 조건은 URL(`pRegion`, `pCategory`, `pSub`, `pColor`)에 유지
- 상세 화면: `/items/police-lost-{atcId}`, `/items/police-found-{atcId}-{fdSn}`
- 카드·상세 출처 표시: "LOST QUEST" / "경찰청 공공데이터"

#### Prototype seed 정리

- 공공데이터를 흉내 내던 seed 3건(`public-phone-1`, `public-keys-1`, `public-wallet-1`) 제거
- 이전 버전 브라우저에 저장된 같은 seed도 불러올 때 제거 (체험 데이터 전체를 초기화하지 않음)
- 반환·AI 매칭 체험용 LOST QUEST seed 물품은 유지
- 경찰청 API 오류 시 seed로 대체하지 않고 실제 오류 상태를 표시

---

### 11. 이미지 처리

- 실제 응답에서 확인한 `https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/...` 형식만 허용 (Backend와 Frontend에서 각각 검증)
- placeholder, `http`, 다른 host, 사용자 정보·포트·query 포함 URL, `javascript:`, `data:`, protocol-relative URL은 모두 차단 → 종류별 기본 이미지
- 기존 LOST QUEST 업로드 이미지 규칙(`/api/images/{uuid}.{ext}`)은 변경하지 않음
- 브라우저에서 경찰청 이미지가 실제로 로드되는 것을 확인 (예: 3468×4624, 1280×720)

---

### 12. 외부 API 오류 처리

| 상황 | LOST QUEST 응답 |
| --- | --- |
| 해당 서비스 인증키 미설정 | 503 `EXTERNAL_API_NOT_CONFIGURED` (경찰청 호출 안 함) |
| 연결·응답 시간 초과 | 504 `EXTERNAL_API_TIMEOUT` |
| 연결 실패 | 502 `EXTERNAL_API_UNAVAILABLE` |
| 인증키 오류 (401/403 게이트웨이) | 502 `EXTERNAL_API_AUTH_ERROR` |
| 요청 한도 (429 또는 LIMITED_NUMBER) | 503 `EXTERNAL_API_RATE_LIMITED` |
| resultCode≠00, 게이트웨이 HTTP_ERROR, 기타 4xx/5xx | 502 `EXTERNAL_API_ERROR` |
| 깨진 XML, 예상 밖 응답 | 502 `EXTERNAL_API_INVALID_RESPONSE` |
| 없는 상세 ID | 404 `NOT_FOUND` |

모든 오류는 기존 `ApiError` 형식이며, 일반 500으로 처리되지 않는다.
분실물 API가 실패해도 습득물 API와 LOST QUEST 자체 데이터는 정상 표시되고,
공통코드 API가 실패해도 필터 없는 목록 조회는 정상 동작한다.

---

### 13. 인증키 관리 및 보안

- 분실물·습득물·공통코드 키를 **각각 별도 설정**으로 관리하고, 각 오퍼레이션은 자기 서비스의 키만 사용
- 설정 위치: Git에서 제외된 `backend/application-local.yml` 또는 환경변수 (`POLICE_LOST_API_SERVICE_KEY`, `POLICE_FOUND_API_SERVICE_KEY`, `POLICE_CODE_API_SERVICE_KEY`)
- 키가 없어도 서버는 시작되며, 해당 서비스 기능만 503으로 응답
- 인코딩: 모든 값을 정확히 한 번만 URL 인코딩. 포털의 "Encoding" 키(`%` 포함)는 먼저 디코딩하여 이중 인코딩 방지
  - 실제 사용 키는 16진수 64자로 특수문자가 없어, 원문·1회·2회 인코딩 모두 실제 호출 성공 확인
  - `%` 포함 키의 이중 인코딩 방지는 mock 서버 테스트로 검증
- 키와 키가 포함된 요청 URL은 응답·로그·예외 메시지·테스트·문서에 남기지 않음
- 실제 검증 후 서버 로그, git diff, 신규 파일에서 키 값이 없음을 확인

참고: 확인 결과 세 서비스의 인증키는 같은 값(계정 단위 일반 인증키)이었지만, 요구사항대로 별도 설정을 유지하였다.

---

### 14. XML 보안

JDK `DocumentBuilderFactory`를 다음과 같이 설정하였다.

- `disallow-doctype-decl = true` → DOCTYPE이 있는 XML은 즉시 거부
- 외부 일반·파라미터 엔티티 비활성화, 외부 DTD 로딩 비활성화
- `ACCESS_EXTERNAL_DTD`, `ACCESS_EXTERNAL_SCHEMA` 빈 값, `FEATURE_SECURE_PROCESSING`
- XInclude·엔티티 확장 비활성화, 빈 EntityResolver

실제 경찰청 응답에는 DOCTYPE이 없으므로 정상 응답 처리에는 영향이 없다.
악성 XML fixture(로컬 파일을 읽는 외부 엔티티, billion laughs, 외부 DTD)로 거부되는 것과
파일 내용이 노출되지 않는 것을 테스트하였다.

---

### 15. 테스트 및 실제 검증

#### Backend: 129/129 통과 (기존 55 + 신규 74)

- `PoliceXmlParserTest`(8): 분실물·습득물 parsing, 단일/여러/빈 item, totalCount, nullable/누락 필드, 깨진 XML, resultCode 오류, 게이트웨이 오류, XXE·DTD·billion laughs
- `PoliceApiClientTest`(11): 서비스별 키 분리, 1회 인코딩, 이중 인코딩 방지, 한글 검색어, 키 누락 격리, 401/403/429/4xx/5xx, read timeout, 연결 실패, 연결 타임아웃, 예외에 키·URL 미포함
- `PoliceCodeServiceTest`(7): 시·도 코드만 추출, 색상 이름별 그룹, 대·하위 분류, 12시간 캐시, 키 누락, 실패 후 재시도 간격, 갱신 실패 시 기존 코드 유지
- `PoliceItemServiceTest`(16): 기본 날짜 범위(한국 시간), pagination, 정규화, 누락 필드, 날짜 검증, 검색어 모드, 상세·404, 지역·분류·하위 분류 파라미터, 필터 없으면 공통코드 미호출, 색상 그룹 병렬 조회·합산·정렬, 그룹 일부 실패, 필터 값 검증, 공통코드 키 누락 격리
- `PoliceImagePolicyTest`(20): 허용/차단 URL
- `PublicItemControllerTest`(10), `PublicItemKeyIsolationTest`(2): 실제 HTTP mock 서버, 공개 접근, 입력·필터 검증, `/filters`, ApiError, 응답에 키 미노출, 분실물·공통코드 키 누락 격리
- 기존 인증·물품·이미지 API 테스트 전체 회귀 통과
- `mvnw clean package` 성공

#### Frontend: 120/120 통과 (기존 86 + 신규 34), TypeScript 검사·`npm run build` 성공

- 경찰청 DTO → Item 변환, route id, 이미지 URL 정책과 fallback
- LOST QUEST/경찰청 출처별 독립 로딩·오류, 빈 결과, "더 보기"
- 필터 목록 로딩·검증, 필터 파라미터 전송, 분실물 색상 미전송, 검색어 모드에서 필터 미전송, 분실물 색상 미지원 처리
- 카드·상세 사진의 출처 표시
- 공공데이터 seed 제거와 이전 저장 데이터 정리, 반환·매칭 seed 유지

#### 실제 경찰청 API 검증 (LOST QUEST API 경유, 최근 30일)

| 조건 | 분실물 | 습득물 |
| --- | --- | --- |
| 없음 | 27,122건 | 46,113건 |
| 서울특별시 | 9,186건 | 13,308건 |
| 서울 + 지갑 | 3,598건 | 3,168건 |
| 서울 + 남성용 지갑 | 1,314건 | 1,058건 |
| 부산 + 휴대폰 | 369건 | 210건 |
| 전남광주통합특별시 | - | 1,854건 |
| 색상 블랙(검정) 그룹 | 미지원(400) | 10,128건 (= 199 + 9,929) |
| 색상 그레이(회) 그룹 | - | 2,871건 (15개 코드 합계와 일치) |

- `/filters`: 시·도 20개, 대분류 21개(하위 85개), 색상 그룹 49개. 첫 조회 3.3초, 이후 캐시 0.01초
- 상세: 분실물 색상·지역·사진·기관, 습득물 장소 유형·상태·특이사항 확인
- 검색어: 습득물 "지갑" 109,993건, 분실물 "오토바이 차키" 8건
- 오류: 분실물 "지갑" 검색 → 경찰청 게이트웨이 오류 → 502 `EXTERNAL_API_ERROR` (습득물은 정상)

#### 브라우저 종단 간 검증

React 검색 화면
→ LOST QUEST Backend
→ 경찰청 OpenAPI

- 검색 화면에 LOST QUEST 물품과 경찰청 분실물·습득물이 출처 표시와 함께 표시
- 경찰청 조건 UI: 시·도 20개, 물품 분류 21개, 세부 분류(지갑 → 여성용/남성용/기타), 색상 49개
- 서울 → 지갑 → 남성용 지갑 → 블랙 순서로 조건을 좁히며 건수 변화 확인, 색상 선택 시 분실물은 "색상 조건 미지원"
- 검색어 입력 시 경찰청 조건 비활성화와 안내
- 경찰청 사진이 브라우저에서 실제로 로드됨, "더 보기"로 추가 로딩
- 경찰청 분실물·습득물 상세 화면 표시, 없는 ID는 "찾을 수 없어요"
- "지갑" 검색 시 경찰청 분실물만 오류 + 다시 시도, 습득물·LOST QUEST 물품은 계속 표시

---

### 16. 발견한 문제와 해결

#### 문제 1. 공식 명세와 다른 실제 응답

`resultMag` vs `resultMsg`, 이미지 host, 명세에 없는 필드, HTTP 200 게이트웨이 오류, 공통코드의 `commCd`/`cdNm` 설명 반대 등 차이가 있었다.

#### 해결

명세만 보고 구현하지 않고 실제 응답을 먼저 확인한 뒤, 실제 응답 기준으로 파서·분류·이미지 정책·코드 처리를 작성하였다.

---

#### 문제 2. 분실물 목록이 날짜 없이 실패하고 응답이 느림

날짜 범위가 없으면 게이트웨이 오류가 발생하고, 정상 응답도 7~10초가 걸렸다.

#### 해결

항상 날짜 범위를 보내도록 기본값(최근 30일)을 두고, 응답 타임아웃을 20초로 설정하였다.
화면에서는 출처별 로딩 상태를 따로 보여 주어 느린 분실물 응답이 다른 데이터 표시를 막지 않게 하였다.

---

#### 문제 3. 지역·분류·색상 코드표 부재

검색 조건이 코드를 요구하지만 공식 문서에 코드표가 없었다.

#### 해결

추측한 코드를 넣지 않고 공통코드조회 서비스를 신청·승인받아, 코드를 서버에서 실시간으로 조회하고 캐시하도록 구현하였다.

---

#### 문제 4. 같은 이름의 색상 코드가 여러 개

"블랙(검정)"은 `CL1002`(199건)와 `CL1043`(9,929건) 두 코드로 나뉘어 있었고, 경찰청 API는 색상 코드를 하나만 받았다.
한 코드만 사용하면 대부분의 결과가 빠진다.

#### 해결

123개 색상 코드를 모두 실제로 조회해 모든 코드가 사용 중임을 확인한 뒤,
색상을 이름 기준 그룹으로 보여주고 그룹의 코드별로 병렬 조회해 합치도록 구현하였다.

---

#### 문제 5. 시·군·구 지역 코드가 동작하지 않음

공통코드에는 시·군·구 코드가 있지만, 이 코드로 검색하면 항상 0건이었다.

#### 해결

실제 검색에 동작하는 시·도 코드만 필터 선택지로 제공하였다.

---

#### 문제 6. 경찰청 API가 입력을 검증하지 않음

존재하지 않는 날짜도 정상 결과가 나오고, 시작>종료는 오류 없이 0건이었다.

#### 해결

LOST QUEST Backend에서 날짜 형식·범위·순서·미래 날짜와 필터 코드를 검증하여 400으로 응답한다.

---

#### 문제 7. 테스트 mock 서버 관련 테스트 간 간섭

시간 초과 테스트의 지연 응답이 다음 요청을 막거나, 테스트끼리 요청 기록을 공유해 실패하였다.

#### 해결

mock 서버가 요청을 동시에 처리하도록 하고 테스트마다 기록을 초기화하였다. (제품 코드 문제 아님)

---

### 17. 현재 제한사항

- 지역 필터는 시·도 단위만 지원 (경찰청 API가 시·군·구 코드 검색을 지원하지 않음)
- 경찰청 지역(예: "전남광주통합특별시")과 LOST QUEST 지역(17개 시·도 약칭)은 서로 다른 체계라 필터를 따로 제공함
- 경찰청 물품 분류(휴대폰, 카드, 현금 등)와 LOST QUEST 카테고리도 다르며 임의로 매핑하지 않음
- 색상 그룹 필터는 한 페이지에 최대 `size × 코드 수`개가 올 수 있고, 그룹 코드 수만큼 경찰청을 호출함 (그레이(회) 15회)
- 분실물은 색상 조건을 지원하지 않음 (경찰청 API 제약)
- 분실물 목록에는 색상·지역·사진이 없고 상세에서만 제공됨. 습득물 상세에는 색상이 없어 상세 화면에서 "정보 없음"으로 표시됨
- 분실물 물품명 검색은 "지갑"처럼 넓은 검색어에서 경찰청 쪽 오류가 발생함
- 검색어 검색은 날짜·지역·분류·색상 조건을 함께 쓸 수 없음 (경찰청 API 제약)
- 분실물 목록 응답이 7~10초로 느림. 목록 캐시는 아직 없음 (공통코드만 캐시)
- 경찰청 사진 중 수 MB의 원본이 그대로 목록 카드에 로드될 수 있음 (lazy loading만 적용)
- 요청 한도 초과 오류는 실제로 재현하지 못함
- 경찰청 데이터는 반환 요청·AI 매칭과 아직 연결되지 않음
- 공식 사이트 `www.lost112.go.kr`은 개발 PC에서 연결되지 않음 (이미지는 `minwon24.police.go.kr`에서 정상 로드)

---

### 18. 향후 AI 매칭에 사용할 수 있는 필드

| 필드 | 분실물 | 습득물 | 비고 |
| --- | --- | --- | --- |
| 물품명 | 목록 100% | 목록 100% | 자유 텍스트 |
| 물품 분류 | 목록 100% | 목록 100% | "대분류 > 소분류" 문자열, 공통코드(대 21 / 하위 85)로 검색 가능 |
| 날짜 | 목록 100% | 목록 100% | 시간대는 상세 |
| 색상 | **상세만** | **목록만** | 이름이 같은 코드 여러 개, 이름 기준 비교 필요 |
| 지역 | 상세의 시·도명 + 시·도 코드 검색 | 시·도 코드 검색만 (목록·상세에 지역명 없음) | 시·도 단위까지만 |
| 장소 | 자유 텍스트(목록) + 장소 유형(상세) | 보관장소(목록) + 장소 유형(상세) | 직접 비교가 어려움 |
| 사진 | 상세, 약 35% | 목록, 약 29% | 이미지 비교에는 별도 다운로드 필요 |
| 설명 | 게시 제목 | 게시 제목 | 특이사항은 분실물은 비공개, 습득물은 정형 안내문 |
| 식별자 | `atcId` | `atcId` + `fdSn` | |

분실물과 습득물의 장소·색상 제공 위치가 서로 달라, 매칭 후보는 시·도·물품분류·날짜 코드 조건으로 좁히고
색상·물품명은 이름 기준으로 비교하는 방식이 현실적이다.

---

### 19. 발표 강조점

- 공공데이터 "예시"를 실제 경찰청 데이터 수만 건으로 교체하여 실서비스 검색 화면 완성
- 명세만 믿지 않고 실제 응답을 조사하여, 명세와 다른 필드·이미지 host·오류 형식·공통코드 구조를 찾아 반영
- 코드값을 추측하지 않고 공통코드 API를 추가 신청해 실시간 코드로 지역·분류·색상 검색 구현
- 같은 이름의 색상 코드가 여러 개라는 점을 실제 데이터 46,113건 전수 조사로 확인하고 그룹 검색으로 해결
- 인증키는 서버에만 두고, 응답·로그·문서·Git 어디에도 노출되지 않도록 설계·검증
- XXE 등 외부 XML 공격을 막는 보안 파서 적용
- 외부 API 장애가 서비스 전체 장애로 번지지 않도록 출처별·서비스별 독립 처리 (실제 브라우저에서 부분 장애 상황 확인)

---

### 20. 시연 / 스크린샷 후보

- 검색 화면: LOST QUEST + 경찰청 분실물·습득물 함께 표시, 출처 탭과 출처별 건수
- 경찰청 조건으로 서울 → 지갑 → 남성용 지갑 → 블랙 순서로 좁혀지는 건수
- 색상 선택 시 경찰청 분실물 "색상 조건 미지원" 표시
- 경찰청 습득물 카드의 실제 사진
- 경찰청 분실물 상세: 지역·색상·담당 경찰서·연락처
- "지갑" 검색 시 경찰청 분실물만 오류 + 다시 시도, 나머지는 정상 표시
- `GET /api/public-items/filters`와 `GET /api/public-items/found?color=…` 정규화 JSON
- 색상 코드 조사 결과 (블랙 199 + 9,929 = 10,128)
- 악성 XML(XXE) fixture 테스트 통과 화면
- Backend 129개 / Frontend 120개 테스트 통과 화면
