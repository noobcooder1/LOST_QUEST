package com.lostquest.service;

import com.lostquest.client.MockPoliceServer;
import com.lostquest.client.PoliceApiClient;
import com.lostquest.config.PoliceApiProperties;
import com.lostquest.exception.ExternalApiException;
import com.lostquest.exception.ExternalApiException.Kind;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PoliceCodeServiceTest {

    private MockPoliceServer server;
    private MutableClock clock;

    @BeforeEach
    void setUp() {
        server = new MockPoliceServer();
        clock = new MutableClock(Instant.parse("2026-10-06T00:00:00Z"));
    }

    @AfterEach
    void tearDown() {
        server.close();
    }

    private PoliceCodeService service(String codeKey) {
        PoliceApiClient client = new PoliceApiClient(new PoliceApiProperties(server.baseUrl(), Duration.ofSeconds(2), Duration.ofSeconds(3),
                new PoliceApiProperties.Service("test-lost-key"), new PoliceApiProperties.Service("test-found-key"),
                new PoliceApiProperties.Service(codeKey)));
        return new PoliceCodeService(client, clock);
    }

    @Test
    @DisplayName("지역: 지역구분(LC0) 중 실제 검색에 쓰이는 시·도 코드(LC?000)만, 하위 시군구·다른 그룹·이름 없는 코드는 제외")
    void regionsAreTopLevelOnly() {
        server.replyCommonCodes();
        PoliceCodeService.PoliceCodes codes = service("test-code-key").codes();
        assertThat(codes.regions()).extracting(PoliceCodeService.CodeOption::code).containsExactly("LCA000", "LCG000", "LCT000");
        assertThat(codes.regions()).extracting(PoliceCodeService.CodeOption::name).containsExactly("서울특별시", "전남광주통합특별시", "부산광역시");
        assertThat(server.requests()).anyMatch(r -> r.contains("getCmmnCd") && r.contains("GRP_NM=%EC%A7%80%EC%97%AD%EA%B5%AC%EB%B6%84"))
                .allMatch(r -> r.contains("serviceKey=test-code-key"));
    }

    @Test
    @DisplayName("색상: 같은 이름의 여러 코드를 하나의 그룹으로 묶고 id는 가장 작은 코드")
    void colorsAreGroupedByName() {
        server.replyCommonCodes();
        List<PoliceCodeService.ColorOption> colors = service("test-code-key").codes().colors();
        assertThat(colors).extracting(PoliceCodeService.ColorOption::name).containsExactly("화이트(흰)", "블랙(검정)", "오렌지(주황)");
        assertThat(colors.get(0).codes()).containsExactly("CL1001", "CL1018");
        assertThat(colors.get(1).id()).isEqualTo("CL1002");
        assertThat(colors.get(1).codes()).containsExactly("CL1002", "CL1043");
        assertThat(colors.get(2).codes()).containsExactly("CL1004");
    }

    @Test
    @DisplayName("물품분류: 대분류(PR?000)와 각 하위 분류, 잘못된 코드 제외, parentOf로 상위 분류 확인")
    void categoriesWithChildren() {
        server.replyCommonCodes();
        PoliceCodeService.PoliceCodes codes = service("test-code-key").codes();
        assertThat(codes.categories()).extracting(PoliceCodeService.CategoryOption::code).containsExactly("PRA000", "PRH000");
        assertThat(codes.category("PRH000").orElseThrow().children())
                .extracting(PoliceCodeService.CodeOption::name).containsExactly("여성용 지갑", "남성용 지갑", "기타 지갑");
        assertThat(codes.parentOf("PRH200").orElseThrow().code()).isEqualTo("PRH000");
        assertThat(codes.parentOf("PRZ100")).isEmpty();
    }

    @Test
    @DisplayName("12시간 캐시: 두 번째 조회는 공통코드 API를 다시 호출하지 않고, 만료 후 다시 조회")
    void cachesCodes() {
        server.replyCommonCodes();
        PoliceCodeService service = service("test-code-key");
        service.codes();
        int calls = server.requests().size();
        service.codes();
        assertThat(server.requests()).hasSize(calls);
        clock.advance(PoliceCodeService.TTL.plusSeconds(1));
        service.codes();
        assertThat(server.requests()).hasSize(calls * 2);
    }

    @Test
    @DisplayName("공통코드 키 누락: NOT_CONFIGURED, 외부 호출 없음")
    void missingCodeKey() {
        assertThatThrownBy(() -> service("").codes())
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(Kind.NOT_CONFIGURED));
        assertThat(server.requests()).isEmpty();
    }

    @Test
    @DisplayName("공통코드 API 실패: 오류 전달 후 60초 동안 재호출하지 않음, 이후 재시도")
    void failureIsRetriedAfterPause() {
        server.reply("getCmmnCd", 403, MockPoliceServer.fixture("gateway-not-registered.xml"));
        PoliceCodeService service = service("test-code-key");
        assertThatThrownBy(service::codes)
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(Kind.AUTH_FAILED));
        int calls = server.requests().size();
        assertThatThrownBy(service::codes).isInstanceOf(ExternalApiException.class);
        assertThat(server.requests()).hasSize(calls);

        server.reset();
        server.replyCommonCodes();
        clock.advance(PoliceCodeService.RETRY_AFTER_FAILURE.plusSeconds(1));
        assertThat(service.codes().regions()).isNotEmpty();
    }

    @Test
    @DisplayName("캐시가 있는 상태에서 갱신 실패 시 기존 코드를 계속 사용")
    void keepsStaleCodesWhenRefreshFails() {
        server.replyCommonCodes();
        PoliceCodeService service = service("test-code-key");
        PoliceCodeService.PoliceCodes first = service.codes();
        server.reset();
        server.reply("getCmmnCd", 500, new byte[0]);
        clock.advance(PoliceCodeService.TTL.plusSeconds(1));
        assertThat(service.codes()).isSameAs(first);
    }

    static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
