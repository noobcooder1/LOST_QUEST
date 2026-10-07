package com.lostquest.service.matching;

import com.lostquest.dto.PublicItemPageResponse;
import com.lostquest.dto.PublicItemResponse;
import com.lostquest.exception.ExternalApiException;
import com.lostquest.service.PoliceCodeService;
import com.lostquest.service.PoliceCodeService.CategoryOption;
import com.lostquest.service.PoliceCodeService.CodeOption;
import com.lostquest.service.PoliceItemService;
import com.lostquest.service.PoliceItemService.PoliceFilter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PoliceCandidateCollectorTest {

    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 7);
    private static final Clock CLOCK = Clock.fixed(TODAY.atStartOfDay(KOREA).toInstant(), KOREA);

    // Names and codes as returned by the live 경찰청 common-code API.
    private static final PoliceCodeService.PoliceCodes CODES = new PoliceCodeService.PoliceCodes(
            List.of(new CodeOption("LCA000", "서울특별시"), new CodeOption("LCE000", "기타"),
                    new CodeOption("LCG000", "전남광주통합특별시"), new CodeOption("LCI000", "경기도"),
                    new CodeOption("LCL000", "전라남도"), new CodeOption("LCO000", "충청북도"),
                    new CodeOption("LCQ000", "광주광역시")),
            List.of(new CategoryOption("PRA000", "가방", List.of()), new CategoryOption("PRG000", "전자기기", List.of()),
                    new CategoryOption("PRH000", "지갑", List.of()), new CategoryOption("PRZ000", "기타물품", List.of())),
            List.of());

    record Call(LocalDate from, LocalDate to, PoliceFilter filter, int size) {
    }

    /** Records calls; returns items per region code ("" = nationwide) or fails for codes listed in {@code failing}. */
    static class FakePoliceItemService extends PoliceItemService {
        final List<Call> calls = Collections.synchronizedList(new ArrayList<>());
        final Map<String, List<PublicItemResponse>> itemsByRegion = new HashMap<>();
        final List<String> failing = new ArrayList<>();

        FakePoliceItemService() {
            super(null, null);
        }

        @Override
        public PublicItemPageResponse listFound(int page, int size, LocalDate from, LocalDate to, String keyword,
                                                String storagePlace, PoliceFilter filter) {
            calls.add(new Call(from, to, filter, size));
            String region = filter.region() == null ? "" : filter.region();
            if (failing.contains(region)) {
                throw new ExternalApiException(ExternalApiException.Kind.TIMEOUT, "test timeout");
            }
            List<PublicItemResponse> items = itemsByRegion.getOrDefault(region, List.of());
            return new PublicItemPageResponse(items, page, size, items.size(), 1, "DATE_RANGE", from, to);
        }
    }

    static class FakeCodeService extends PoliceCodeService {
        ExternalApiException failure;

        FakeCodeService() {
            super(null);
        }

        @Override
        public synchronized PoliceCodes codes() {
            if (failure != null) {
                throw failure;
            }
            return CODES;
        }
    }

    static PublicItemResponse found(String atcId, Integer fdSn, String category, String color, LocalDate date) {
        return new PublicItemResponse("POLICE", "FOUND", atcId + "-" + fdSn, atcId, fdSn, "습득물 " + atcId, null,
                category, category, color, date, null, null, null, "OO경찰서", null, "OO경찰서", null, null, null, null, false);
    }

    private final FakePoliceItemService items = new FakePoliceItemService();
    private final FakeCodeService codes = new FakeCodeService();
    private final PoliceCandidateCollector collector = new PoliceCandidateCollector(items, codes, CLOCK);

    private static MatchTarget target(String category, String region, LocalDate lostDate) {
        return new MatchTarget(1L, "지갑", category, "검정", region, lostDate);
    }

    @Test
    @DisplayName("지역 조회 1회 + 전국 조회 1회, 분류 코드는 이름으로 찾고 색상 필터는 보내지 않음, 기간은 분실일~+14일")
    void queriesWithRegionCategoryAndWindow() {
        items.itemsByRegion.put("LCA000", List.of(found("F1", 1, "지갑", "블랙(검정)", LocalDate.of(2026, 9, 11))));
        items.itemsByRegion.put("", List.of(found("F1", 1, "지갑", "블랙(검정)", LocalDate.of(2026, 9, 11)),
                found("F2", 1, "지갑", "레드(빨강)", LocalDate.of(2026, 9, 12))));

        SourceResult result = collector.collect(target("지갑", "서울", LocalDate.of(2026, 9, 10)));

        assertThat(result.status()).isEqualTo(SourceResult.Status.OK);
        assertThat(items.calls).hasSize(2);
        assertThat(items.calls).extracting(c -> c.filter().region()).containsExactlyInAnyOrder("LCA000", null);
        assertThat(items.calls).allSatisfy(call -> {
            assertThat(call.filter().category()).isEqualTo("PRH000");
            assertThat(call.filter().subCategory()).isNull();
            assertThat(call.filter().color()).isNull();
            assertThat(call.from()).isEqualTo(LocalDate.of(2026, 9, 10));
            assertThat(call.to()).isEqualTo(LocalDate.of(2026, 9, 24));
            assertThat(call.size()).isEqualTo(PoliceCandidateCollector.PAGE_SIZE);
        });
        // F1 appears in both queries: kept once, with the region of the region-filtered query.
        assertThat(result.candidates()).extracting(MatchCandidate::key).containsExactly("POLICE:F1-1", "POLICE:F2-1");
        assertThat(result.candidates().get(0).region()).isEqualTo("서울특별시");
        assertThat(result.candidates().get(1).region()).isNull();
        assertThat(result.candidates().get(0).atcId()).isEqualTo("F1");
        assertThat(result.candidates().get(0).fdSn()).isEqualTo(1);
        assertThat(result.candidates().get(0).storagePlace()).isEqualTo("OO경찰서");
    }

    @Test
    @DisplayName("광주는 경찰청 지역 2개(전남광주통합특별시, 광주광역시) + 전국 = 최대 3회")
    void twoRegionsAtMost() {
        collector.collect(target("지갑", "광주", LocalDate.of(2026, 9, 10)));
        assertThat(items.calls).extracting(c -> c.filter().region()).containsExactlyInAnyOrder("LCG000", "LCQ000", null);
        items.calls.clear();
        collector.collect(target("지갑", "충북", LocalDate.of(2026, 9, 10)));
        assertThat(items.calls).extracting(c -> c.filter().region()).containsExactlyInAnyOrder("LCO000", null);
    }

    @Test
    @DisplayName("이름이 같은 경찰청 분류가 없으면 분류 조건 없이 조회 (임의 매핑 없음)")
    void noCategoryCodeWhenNameDiffers() {
        collector.collect(target("액세서리", "서울", LocalDate.of(2026, 9, 10)));
        assertThat(items.calls).isNotEmpty().allSatisfy(call -> assertThat(call.filter().category()).isNull());
    }

    @Test
    @DisplayName("종료일은 오늘을 넘지 않음")
    void windowEndsToday() {
        collector.collect(target("지갑", "서울", TODAY.minusDays(3)));
        assertThat(items.calls).allSatisfy(call -> {
            assertThat(call.from()).isEqualTo(TODAY.minusDays(3));
            assertThat(call.to()).isEqualTo(TODAY);
        });
    }

    @Test
    @DisplayName("일부 조회 실패: PARTIAL, 성공한 조회 결과는 유지")
    void partialFailure() {
        items.failing.add("LCA000");
        items.itemsByRegion.put("", List.of(found("F2", 1, "지갑", "블랙(검정)", LocalDate.of(2026, 9, 12))));

        SourceResult result = collector.collect(target("지갑", "서울", LocalDate.of(2026, 9, 10)));

        assertThat(result.status()).isEqualTo(SourceResult.Status.PARTIAL);
        assertThat(result.candidates()).extracting(MatchCandidate::key).containsExactly("POLICE:F2-1");
        assertThat(result.message()).isNotBlank();
    }

    @Test
    @DisplayName("모든 조회 실패: UNAVAILABLE, 사용자용 메시지(키·URL 없음)")
    void totalFailure() {
        items.failing.addAll(List.of("LCA000", ""));
        SourceResult result = collector.collect(target("지갑", "서울", LocalDate.of(2026, 9, 10)));
        assertThat(result.status()).isEqualTo(SourceResult.Status.UNAVAILABLE);
        assertThat(result.candidates()).isEmpty();
        assertThat(result.message()).isEqualTo(ExternalApiException.Kind.TIMEOUT.message());
    }

    @Test
    @DisplayName("공통코드 실패: 목록 조회 없이 UNAVAILABLE")
    void codeFailure() {
        codes.failure = new ExternalApiException(ExternalApiException.Kind.NOT_CONFIGURED, "test");
        SourceResult result = collector.collect(target("지갑", "서울", LocalDate.of(2026, 9, 10)));
        assertThat(result.status()).isEqualTo(SourceResult.Status.UNAVAILABLE);
        assertThat(result.message()).isEqualTo(ExternalApiException.Kind.NOT_CONFIGURED.message());
        assertThat(items.calls).isEmpty();
    }

    @Test
    @DisplayName("분실일이 없거나 미래면 경찰청을 호출하지 않음")
    void skippedWithoutUsableDate() {
        assertThat(collector.collect(target("지갑", "서울", null)).status()).isEqualTo(SourceResult.Status.SKIPPED);
        assertThat(collector.collect(target("지갑", "서울", TODAY.plusDays(1))).status()).isEqualTo(SourceResult.Status.SKIPPED);
        assertThat(items.calls).isEmpty();
    }

    @Test
    @DisplayName("상세 링크에 필요한 atcId/fdSn이 없는 항목은 만들어내지 않고 제외")
    void dropsItemsWithoutIds() {
        items.itemsByRegion.put("", List.of(found("F1", null, "지갑", null, LocalDate.of(2026, 9, 11)),
                found(null, 1, "지갑", null, LocalDate.of(2026, 9, 11)),
                found("F3", 2, "지갑", null, LocalDate.of(2026, 9, 11))));
        SourceResult result = collector.collect(target("지갑", null, LocalDate.of(2026, 9, 10)));
        assertThat(items.calls).hasSize(1);
        assertThat(result.candidates()).extracting(MatchCandidate::key).containsExactly("POLICE:F3-2");
    }
}
