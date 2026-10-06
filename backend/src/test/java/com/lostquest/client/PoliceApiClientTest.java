package com.lostquest.client;

import com.lostquest.client.PoliceApiClient.Operation;
import com.lostquest.config.PoliceApiProperties;
import com.lostquest.exception.ExternalApiException;
import com.lostquest.exception.ExternalApiException.Kind;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.ServerSocket;
import java.time.Duration;
import java.util.Map;

import static com.lostquest.client.MockPoliceServer.fixture;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PoliceApiClientTest {

    // Fake test keys only. "+/=" and "%" shapes check that each key is encoded exactly once.
    private static final String LOST_KEY = "lost-TEST+key/abc==";
    private static final String FOUND_KEY = "found-TEST-key-123";

    private MockPoliceServer server;

    @BeforeEach
    void start() {
        server = new MockPoliceServer();
    }

    @AfterEach
    void stop() {
        server.close();
    }

    private PoliceApiClient client(String lostKey, String foundKey, Duration readTimeout) {
        return new PoliceApiClient(new PoliceApiProperties(server.baseUrl(), Duration.ofSeconds(2), readTimeout,
                new PoliceApiProperties.Service(lostKey), new PoliceApiProperties.Service(foundKey), new PoliceApiProperties.Service("test-code-key")));
    }

    private PoliceApiClient client() {
        return client(LOST_KEY, FOUND_KEY, Duration.ofSeconds(3));
    }

    @Test
    @DisplayName("분실물 호출은 LOST 키, 습득물 호출은 FOUND 키를 각 서비스 경로로 1회 인코딩해 전송")
    void usesSeparateKeysPerService() {
        server.replyFixture("getLostGoodsInfoAccToClAreaPd", "lost-list.xml");
        server.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        PoliceApiClient client = client();

        assertThat(client.call(Operation.LOST_LIST, Map.of("START_YMD", "20260901", "END_YMD", "20261005", "pageNo", "1", "numOfRows", "2"))
                .items()).hasSize(2);
        assertThat(client.call(Operation.FOUND_LIST, Map.of("pageNo", "1")).items()).hasSize(2);

        String lostRequest = server.requests().get(0);
        String foundRequest = server.requests().get(1);
        assertThat(lostRequest).startsWith("/1320000/LostGoodsInfoInqireService/getLostGoodsInfoAccToClAreaPd?")
                .contains("serviceKey=lost-TEST%2Bkey%2Fabc%3D%3D")
                .contains("START_YMD=20260901").contains("END_YMD=20261005")
                .doesNotContain(FOUND_KEY);
        assertThat(foundRequest).startsWith("/1320000/LosfundInfoInqireService/getLosfundInfoAccToClAreaPd?")
                .contains("serviceKey=" + FOUND_KEY)
                .doesNotContain("lost-TEST");
    }

    @Test
    @DisplayName("이미 URL 인코딩된(Encoding) 키는 디코딩 후 다시 1회만 인코딩 (이중 인코딩 방지)")
    void doesNotDoubleEncodePreEncodedKey() {
        server.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        client(LOST_KEY, "abc%2Bdef%3D%3D", Duration.ofSeconds(3)).call(Operation.FOUND_LIST, Map.of());
        assertThat(server.requests().get(0)).contains("serviceKey=abc%2Bdef%3D%3D").doesNotContain("%252B");
    }

    @Test
    @DisplayName("한글 검색어는 UTF-8로 1회 인코딩, 공백은 %20, 빈 값은 전송하지 않음")
    void encodesKoreanKeyword() {
        server.replyFixture("getLosfundInfoAccTpNmCstdyPlace", "found-list.xml");
        java.util.LinkedHashMap<String, String> params = new java.util.LinkedHashMap<>();
        params.put("PRDT_NM", "검정 지갑");
        params.put("DEP_PLACE", null);
        client().call(Operation.FOUND_SEARCH, params);
        assertThat(server.requests().get(0)).contains("PRDT_NM=%EA%B2%80%EC%A0%95%20%EC%A7%80%EA%B0%91").doesNotContain("DEP_PLACE");
    }

    @Test
    @DisplayName("LOST 키 누락 시 분실물만 NOT_CONFIGURED(외부 호출 없음), 습득물은 정상")
    void missingLostKeyOnlyAffectsLost() {
        server.replyFixture("getLosfundInfoAccToClAreaPd", "found-list.xml");
        PoliceApiClient client = client("", FOUND_KEY, Duration.ofSeconds(3));
        assertThatThrownBy(() -> client.call(Operation.LOST_LIST, Map.of()))
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(Kind.NOT_CONFIGURED));
        assertThat(client.call(Operation.FOUND_LIST, Map.of()).items()).hasSize(2);
        assertThat(server.requests()).hasSize(1).allMatch(r -> r.contains("LosfundInfoInqireService"));
        assertThat(client.isConfigured(PoliceApiClient.Service.LOST)).isFalse();
    }

    @Test
    @DisplayName("FOUND 키 누락 시 습득물만 NOT_CONFIGURED, 분실물은 정상")
    void missingFoundKeyOnlyAffectsFound() {
        server.replyFixture("getLostGoodsDetailInfo", "lost-detail.xml");
        PoliceApiClient client = client(LOST_KEY, "  ", Duration.ofSeconds(3));
        assertThatThrownBy(() -> client.call(Operation.FOUND_DETAIL, Map.of("ATC_ID", "F2026100500001940", "FD_SN", "1")))
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(Kind.NOT_CONFIGURED));
        assertThat(client.call(Operation.LOST_DETAIL, Map.of("ATC_ID", "L2026100500001176")).items()).hasSize(1);
    }

    @Test
    @DisplayName("HTTP 401/403 게이트웨이 XML → AUTH_FAILED, 429 → RATE_LIMITED, 4xx/5xx → UPSTREAM_ERROR")
    void mapsHttpErrors() {
        PoliceApiClient client = client();
        server.reply("getLostGoodsDetailInfo", 401, fixture("gateway-key-null.xml"));
        assertKind(() -> client.call(Operation.LOST_DETAIL, Map.of()), Kind.AUTH_FAILED);
        server.reply("getLostGoodsDetailInfo", 403, fixture("gateway-not-registered.xml"));
        assertKind(() -> client.call(Operation.LOST_DETAIL, Map.of()), Kind.AUTH_FAILED);
        server.reply("getLostGoodsDetailInfo", 429, "Too Many Requests".getBytes());
        assertKind(() -> client.call(Operation.LOST_DETAIL, Map.of()), Kind.RATE_LIMITED);
        server.reply("getLostGoodsDetailInfo", 400, "<html>bad request</html>".getBytes());
        assertKind(() -> client.call(Operation.LOST_DETAIL, Map.of()), Kind.UPSTREAM_ERROR);
        server.reply("getLostGoodsDetailInfo", 500, "<html>error</html>".getBytes());
        assertKind(() -> client.call(Operation.LOST_DETAIL, Map.of()), Kind.UPSTREAM_ERROR);
        server.reply("getLostGoodsDetailInfo", 503, new byte[0]);
        assertKind(() -> client.call(Operation.LOST_DETAIL, Map.of()), Kind.UPSTREAM_ERROR);
    }

    @Test
    @DisplayName("HTTP 200 + 게이트웨이 HTTP_ERROR / resultCode 99 / 깨진 XML 처리")
    void mapsErrorsInsideHttp200() {
        PoliceApiClient client = client();
        server.replyFixture("getLostGoodsInfoAccToClAreaPd", "gateway-http-error.xml");
        assertKind(() -> client.call(Operation.LOST_LIST, Map.of()), Kind.UPSTREAM_ERROR);
        server.replyFixture("getLostGoodsInfoAccToClAreaPd", "result-99.xml");
        assertKind(() -> client.call(Operation.LOST_LIST, Map.of()), Kind.UPSTREAM_ERROR);
        server.replyFixture("getLostGoodsInfoAccToClAreaPd", "malformed.xml");
        assertKind(() -> client.call(Operation.LOST_LIST, Map.of()), Kind.INVALID_RESPONSE);
    }

    @Test
    @DisplayName("응답 지연(read timeout) → TIMEOUT")
    void readTimeout() {
        server.replySlow("getLostGoodsInfoAccToClAreaPd", "lost-list.xml", 2_000);
        PoliceApiClient client = client(LOST_KEY, FOUND_KEY, Duration.ofMillis(300));
        assertKind(() -> client.call(Operation.LOST_LIST, Map.of()), Kind.TIMEOUT);
    }

    @Test
    @DisplayName("연결 실패(닫힌 포트) → UNAVAILABLE")
    void connectionFailure() throws Exception {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        PoliceApiClient client = new PoliceApiClient(new PoliceApiProperties("http://127.0.0.1:" + closedPort + "/1320000",
                Duration.ofSeconds(2), Duration.ofSeconds(2), new PoliceApiProperties.Service(LOST_KEY), new PoliceApiProperties.Service(FOUND_KEY), new PoliceApiProperties.Service("test-code-key")));
        assertKind(() -> client.call(Operation.FOUND_LIST, Map.of()), Kind.UNAVAILABLE);
    }

    @Test
    @DisplayName("연결 타임아웃(응답 없는 주소) → TIMEOUT 또는 UNAVAILABLE, 메시지·상세에 키와 URL 미포함")
    void connectTimeoutDoesNotLeakKey() {
        // 10.255.255.1 is a non-routable address: the TCP connect never completes.
        PoliceApiClient client = new PoliceApiClient(new PoliceApiProperties("http://10.255.255.1/1320000",
                Duration.ofMillis(300), Duration.ofSeconds(1), new PoliceApiProperties.Service(LOST_KEY), new PoliceApiProperties.Service(FOUND_KEY), new PoliceApiProperties.Service("test-code-key")));
        assertThatThrownBy(() -> client.call(Operation.LOST_LIST, Map.of()))
                .isInstanceOfSatisfying(ExternalApiException.class, ex -> {
                    assertThat(ex.getKind()).isIn(Kind.TIMEOUT, Kind.UNAVAILABLE);
                    assertThat(ex.getMessage() + ex.getDetail()).doesNotContain("lost-TEST").doesNotContain("serviceKey").doesNotContain("10.255.255.1");
                });
    }

    @Test
    @DisplayName("어떤 오류에서도 예외 메시지·상세에 서비스키나 요청 URL이 포함되지 않음")
    void errorsNeverContainKey() {
        PoliceApiClient client = client();
        server.reply("getLostGoodsInfoAccToClAreaPd", 403, fixture("gateway-not-registered.xml"));
        server.reply("getLosfundInfoAccToClAreaPd", 500, ("echo " + FOUND_KEY).getBytes());
        for (Operation op : new Operation[] {Operation.LOST_LIST, Operation.FOUND_LIST}) {
            assertThatThrownBy(() -> client.call(op, Map.of()))
                    .isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getMessage() + " " + ex.getDetail())
                            .doesNotContain("lost-TEST").doesNotContain(FOUND_KEY).doesNotContain("serviceKey").doesNotContain("127.0.0.1"));
        }
    }

    private static void assertKind(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, Kind kind) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ExternalApiException.class, ex -> assertThat(ex.getKind()).isEqualTo(kind));
    }
}
