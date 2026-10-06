package com.lostquest.service;

import com.lostquest.client.MockPoliceServer;
import com.lostquest.client.PoliceApiClient;
import com.lostquest.config.PoliceApiProperties;
import com.lostquest.dto.PublicItemPageResponse;
import com.lostquest.dto.PublicItemResponse;
import com.lostquest.exception.ExternalApiException;
import com.lostquest.exception.InvalidRequestParameterException;
import com.lostquest.service.PoliceItemService.PoliceFilter;
import com.lostquest.exception.ResourceNotFoundException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PoliceItemServiceTest {

    /** 2026-10-06 00:30 KST is still 2026-10-05 in UTC: "today" must follow Korea time. */
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-05T15:30:00Z"), ZoneId.of("Asia/Seoul"));

    private MockPoliceServer server;
    private PoliceItemService service;

    @BeforeEach
    void setUp() {
        server = new MockPoliceServer();
        PoliceApiClient client = new PoliceApiClient(new PoliceApiProperties(server.baseUrl(), Duration.ofSeconds(2), Duration.ofSeconds(3),
                new PoliceApiProperties.Service("test-lost-key"), new PoliceApiProperties.Service("test-found-key"), new PoliceApiProperties.Service("test-code-key")));
        service = new PoliceItemService(client, new PoliceCodeService(client, CLOCK), CLOCK);
    }

    @AfterEach
    void tearDown() {
        server.close();
    }

    @Test
    @DisplayName("기본 조회: 최근 30일(KST 기준 오늘 포함)을 START_YMD/END_YMD로 보내고 pagination 계산")
    void defaultDateRangeAndPaging() {
        server.replyFixture("getLostGoodsInfoAccToClAreaPd", "lost-list.xml");
        PublicItemPageResponse page = service.listLost(2, 20, null, null, null, null);
        assertThat(server.requests().get(0)).contains("START_YMD=20260907").contains("END_YMD=20261006")
                .contains("pageNo=2").contains("numOfRows=20");
        assertThat(page.searchMode()).isEqualTo("DATE_RANGE");
        assertThat(page.from()).isEqualTo(LocalDate.of(2026, 9, 7));
        assertThat(page.to()).isEqualTo(LocalDate.of(2026, 10, 6));
        assertThat(page.totalCount()).isEqualTo(33100);
        assertThat(page.totalPages()).isEqualTo(1655);
        assertThat(page.page()).isEqualTo(2);
        assertThat(page.items()).hasSize(2);
    }

    @Test
    @DisplayName("분실물 목록 정규화: 목록에 없는 색상·지역·이미지는 null (임의 생성 금지)")
    void normalizesLostListItem() {
        server.replyFixture("getLostGoodsInfoAccToClAreaPd", "lost-list.xml");
        PublicItemResponse item = service.listLost(1, 20, null, null, null, null).items().get(0);
        assertThat(item.source()).isEqualTo("POLICE");
        assertThat(item.type()).isEqualTo("LOST");
        assertThat(item.sourceId()).isEqualTo("L2026100500001176");
        assertThat(item.fdSn()).isNull();
        assertThat(item.title()).isEqualTo("오토바이 차키");
        assertThat(item.subject()).isEqualTo("오토바이 차키 분실");
        assertThat(item.category()).isEqualTo("자동차");
        assertThat(item.categoryPath()).isEqualTo("자동차 > 자동차열쇠");
        assertThat(item.date()).isEqualTo(LocalDate.of(2026, 9, 30));
        assertThat(item.location()).isEqualTo("이동 중 떨굼 추정");
        assertThat(item.color()).isNull();
        assertThat(item.region()).isNull();
        assertThat(item.imageUrl()).isNull();
        assertThat(item.storagePlace()).isNull();
        assertThat(item.detail()).isFalse();
    }

    @Test
    @DisplayName("습득물 목록 정규화: sourceId=atcId-fdSn, 색상·보관장소, placeholder 이미지는 null, 실제 첨부 이미지는 유지")
    void normalizesFoundListItems() {
        server.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        var items = service.listFound(1, 20, null, null, null, null).items();
        PublicItemResponse noImage = items.get(0);
        assertThat(noImage.sourceId()).isEqualTo("F2026100500001940-1");
        assertThat(noImage.fdSn()).isEqualTo(1);
        assertThat(noImage.color()).isEqualTo("블랙(검정)");
        assertThat(noImage.storagePlace()).isEqualTo("남강지구대");
        assertThat(noImage.imageUrl()).isNull();
        assertThat(noImage.region()).isNull();
        assertThat(items.get(1).imageUrl())
                .isEqualTo("https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/F2026100500001930/1/C2026100500419868/1.do");
    }

    @Test
    @DisplayName("누락·이상 필드는 null로 남김 (빈 제목, 잘못된 날짜, javascript: 이미지)")
    void toleratesMissingFields() {
        server.replyFixture("getLosfundInfoAccToClAreaPd", "found-list-missing-fields.xml");
        PublicItemResponse item = service.listFound(1, 20, null, null, null, null).items().get(0);
        assertThat(item.title()).isNull();
        assertThat(item.date()).isNull();
        assertThat(item.imageUrl()).isNull();
        assertThat(item.category()).isNull();
        assertThat(item.sourceId()).isEqualTo("F2026100500001941-2");
    }

    @Test
    @DisplayName("빈 결과는 items=[], totalPages=0")
    void emptyResult() {
        server.replyFixture("getLosfundInfoAccToClAreaPd", "list-empty.xml");
        PublicItemPageResponse page = service.listFound(1, 20, LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 6), null, null);
        assertThat(page.items()).isEmpty();
        assertThat(page.totalPages()).isZero();
    }

    @Test
    @DisplayName("날짜 검증: 시작>종료, 미래 종료일, 90일 초과는 400(경찰청 호출 없음), 90일은 허용")
    void validatesDates() {
        assertInvalid(() -> service.listLost(1, 20, LocalDate.of(2026, 10, 5), LocalDate.of(2026, 9, 1), null, null), "from");
        assertInvalid(() -> service.listLost(1, 20, null, LocalDate.of(2026, 10, 7), null, null), "to");
        assertInvalid(() -> service.listFound(1, 20, LocalDate.of(2026, 7, 7), LocalDate.of(2026, 10, 5), null, null), "from");
        assertThat(server.requests()).isEmpty();

        server.replyFixture("getLosfundInfoAccToClAreaPd", "list-empty.xml");
        service.listFound(1, 20, LocalDate.of(2026, 7, 8), LocalDate.of(2026, 10, 5), null, null);
        assertThat(server.requests().get(0)).contains("START_YMD=20260708").contains("END_YMD=20261005");
    }

    @Test
    @DisplayName("검색어 모드: 이름/장소 오퍼레이션 사용, 날짜 미전송, 날짜와 함께 쓰면 400")
    void keywordMode() {
        server.replyFixture("getLostGoodsInfoAccTpNmCstdyPlace", "lost-list.xml");
        server.replyFixture("getLosfundInfoAccTpNmCstdyPlace", "found-list.xml");
        PublicItemPageResponse lost = service.listLost(1, 10, null, null, " 오토바이 ", "강남");
        assertThat(lost.searchMode()).isEqualTo("KEYWORD");
        assertThat(lost.from()).isNull();
        assertThat(server.requests().get(0)).contains("getLostGoodsInfoAccTpNmCstdyPlace").contains("LST_PRDT_NM=%EC%98%A4%ED%86%A0%EB%B0%94%EC%9D%B4")
                .contains("LST_PLACE=").doesNotContain("START_YMD");
        service.listFound(1, 10, null, null, null, "강남경찰서");
        assertThat(server.requests().get(1)).contains("getLosfundInfoAccTpNmCstdyPlace").contains("DEP_PLACE=").doesNotContain("PRDT_NM");

        assertInvalid(() -> service.listFound(1, 10, LocalDate.of(2026, 10, 1), null, "지갑", null), "from");
        assertThat(server.requests()).hasSize(2);
    }

    @Test
    @DisplayName("분실물 상세: 색상·지역·이미지·기관 정보 포함, 없는 ID는 404")
    void lostDetail() {
        server.replyFixture("getLostGoodsDetailInfo", "lost-detail.xml");
        PublicItemResponse item = service.lostDetail("L2026100500001176");
        assertThat(server.requests().get(0)).contains("ATC_ID=L2026100500001176");
        assertThat(item.detail()).isTrue();
        assertThat(item.color()).isEqualTo("핑크(분홍)");
        assertThat(item.region()).isEqualTo("서울특별시");
        assertThat(item.placeType()).isEqualTo("택시");
        assertThat(item.imageUrl()).startsWith("https://minwon24.police.go.kr/lost112/find/getOpenapiAttachFileImage/L2026100500001176/");
        assertThat(item.agencyName()).isEqualTo("서울영등포경찰서");
        assertThat(item.status()).isEqualTo("온라인 접수");

        server.replyFixture("getLostGoodsDetailInfo", "detail-empty.xml");
        assertThatThrownBy(() -> service.lostDetail("L2000010100000000")).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("습득물 상세: ATC_ID+FD_SN 전송, 상세에는 색상이 없으므로 null, placeholder 이미지는 null")
    void foundDetail() {
        server.replyFixture("getLosfundDetailInfo", "found-detail.xml");
        PublicItemResponse item = service.foundDetail("F2026100500001940", 1);
        assertThat(server.requests().get(0)).contains("ATC_ID=F2026100500001940").contains("FD_SN=1");
        assertThat(item.location()).isEqualTo("노상");
        assertThat(item.storagePlace()).isEqualTo("남강지구대");
        assertThat(item.status()).isEqualTo("보관중");
        assertThat(item.color()).isNull();
        assertThat(item.imageUrl()).isNull();
        assertThat(item.note()).contains("특이사항 : 없음");
    }

    @Test
    @DisplayName("지역·대분류·세부분류 필터: 공통코드로 검증 후 분실물 LST_LCT_CD, 습득물 N_FD_LCT_CD와 PRDT_CL_CD_01/02로 전송")
    void regionAndCategoryFilters() {
        server.replyCommonCodes();
        server.replyFixture("getLostGoodsInfoAccToClAreaPd", "lost-list.xml");
        server.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        service.listLost(1, 20, null, null, null, null, new PoliceFilter("LCA000", "PRH000", "PRH200", null));
        String lost = last("getLostGoodsInfoAccToClAreaPd");
        assertThat(lost).contains("LST_LCT_CD=LCA000").contains("PRDT_CL_CD_01=PRH000").contains("PRDT_CL_CD_02=PRH200")
                .contains("START_YMD=").doesNotContain("FD_COL_CD");

        // A sub-class alone: its parent class is filled in from the common codes.
        service.listFound(1, 20, null, null, null, null, new PoliceFilter("LCT000", null, "PRA100", null));
        assertThat(last("getLosfundInfoAccToClAreaPd")).contains("N_FD_LCT_CD=LCT000").contains("PRDT_CL_CD_01=PRA000")
                .contains("PRDT_CL_CD_02=PRA100");
    }

    @Test
    @DisplayName("필터가 없으면 공통코드 API를 호출하지 않음")
    void noFilterNoCodeCall() {
        server.replyFixture("getLostGoodsInfoAccToClAreaPd", "lost-list.xml");
        service.listLost(1, 20, null, null, null, null, PoliceFilter.NONE);
        assertThat(server.requests()).noneMatch(r -> r.contains("CmmnCdService"));
    }

    @Test
    @DisplayName("색상 그룹(블랙=CL1002+CL1043): 코드별로 같은 페이지를 조회해 합치고 totalCount 합산, totalPages는 최댓값, 날짜 내림차순")
    void colorGroupFansOut() {
        server.replyCommonCodes();
        server.replyFixtureWhen("getLosfundInfoAccToClAreaPd", "FD_COL_CD=CL1002", "found-list-black-cl1002.xml");
        server.replyFixtureWhen("getLosfundInfoAccToClAreaPd", "FD_COL_CD=CL1043", "found-list-black-cl1043.xml");
        PublicItemPageResponse page = service.listFound(1, 20, null, null, null, null, new PoliceFilter(null, null, null, "CL1002"));
        assertThat(server.requests().stream().filter(r -> r.contains("getLosfundInfoAccToClAreaPd")))
                .hasSize(2).anyMatch(r -> r.contains("FD_COL_CD=CL1002")).anyMatch(r -> r.contains("FD_COL_CD=CL1043"));
        assertThat(page.totalCount()).isEqualTo(199 + 9929);
        assertThat(page.totalPages()).isEqualTo(497);
        assertThat(page.items()).extracting(PublicItemResponse::sourceId).containsExactly("F2026100500001940-1", "F2026100500001936-1");
        assertThat(page.items()).allMatch(item -> "블랙(검정)".equals(item.color()));
    }

    @Test
    @DisplayName("색상 코드가 하나뿐인 그룹은 한 번만 호출")
    void singleCodeColor() {
        server.replyCommonCodes();
        server.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        service.listFound(1, 20, null, null, null, null, new PoliceFilter(null, null, null, "CL1004"));
        assertThat(server.requests().stream().filter(r -> r.contains("getLosfundInfoAccToClAreaPd"))).singleElement()
                .satisfies(r -> assertThat(r).contains("FD_COL_CD=CL1004"));
    }

    @Test
    @DisplayName("색상 그룹 중 하나라도 실패하면 부분 결과 대신 오류")
    void colorGroupFailure() {
        server.replyCommonCodes();
        server.replyFixtureWhen("getLosfundInfoAccToClAreaPd", "FD_COL_CD=CL1002", "found-list-black-cl1002.xml");
        server.replyFixtureWhen("getLosfundInfoAccToClAreaPd", "FD_COL_CD=CL1043", "result-99.xml");
        assertThatThrownBy(() -> service.listFound(1, 20, null, null, null, null, new PoliceFilter(null, null, null, "CL1002")))
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(ExternalApiException.Kind.UPSTREAM_ERROR));
    }

    @Test
    @DisplayName("필터 검증: 공통코드에 없는 지역·분류·색상, 하위 지역 코드, 다른 대분류의 세부분류, 분실물 색상, 검색어와 함께 사용은 400")
    void filterValidation() {
        server.replyCommonCodes();
        assertInvalid(() -> service.listLost(1, 20, null, null, null, null, new PoliceFilter("LCZ000", null, null, null)), "region");
        assertInvalid(() -> service.listLost(1, 20, null, null, null, null, new PoliceFilter("LCA001", null, null, null)), "region");
        assertInvalid(() -> service.listFound(1, 20, null, null, null, null, new PoliceFilter(null, "PRZ000", null, null)), "category");
        assertInvalid(() -> service.listFound(1, 20, null, null, null, null, new PoliceFilter(null, null, "PRZ100", null)), "subCategory");
        assertInvalid(() -> service.listFound(1, 20, null, null, null, null, new PoliceFilter(null, "PRA000", "PRH200", null)), "subCategory");
        assertInvalid(() -> service.listFound(1, 20, null, null, null, null, new PoliceFilter(null, null, null, "CL9999")), "color");
        assertInvalid(() -> service.listFound(1, 20, null, null, null, null, new PoliceFilter(null, null, null, "CL1043")), "color");
        assertInvalid(() -> service.listLost(1, 20, null, null, null, null, new PoliceFilter(null, null, null, "CL1002")), "color");
        assertInvalid(() -> service.listFound(1, 20, null, null, "지갑", null, new PoliceFilter("LCA000", null, null, null)), "q");
        assertThat(server.requests()).noneMatch(r -> r.contains("LostGoodsInfoInqireService") || r.contains("LosfundInfoInqireService"));
    }

    @Test
    @DisplayName("공통코드 키 누락이어도 필터 없는 목록은 정상, 필터 사용 시에만 503 NOT_CONFIGURED")
    void codeKeyMissingOnlyAffectsFilters() {
        PoliceApiClient client = new PoliceApiClient(new PoliceApiProperties(server.baseUrl(), Duration.ofSeconds(2), Duration.ofSeconds(3),
                new PoliceApiProperties.Service("test-lost-key"), new PoliceApiProperties.Service("test-found-key"), new PoliceApiProperties.Service("")));
        PoliceItemService noCodes = new PoliceItemService(client, new PoliceCodeService(client, CLOCK), CLOCK);
        server.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        assertThat(noCodes.listFound(1, 20, null, null, null, null, PoliceFilter.NONE).items()).hasSize(2);
        assertThatThrownBy(() -> noCodes.listFound(1, 20, null, null, null, null, new PoliceFilter("LCA000", null, null, null)))
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(ExternalApiException.Kind.NOT_CONFIGURED));
    }

    private String last(String operation) {
        return server.requests().stream().filter(r -> r.contains(operation)).reduce((a, b) -> b).orElseThrow();
    }

    private static void assertInvalid(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, String field) {
        assertThatThrownBy(call).isInstanceOfSatisfying(InvalidRequestParameterException.class,
                ex -> assertThat(ex.getField()).isEqualTo(field));
    }
}
