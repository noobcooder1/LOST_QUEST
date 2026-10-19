package com.lostquest.client;

import com.lostquest.config.PoliceApiProperties;
import com.lostquest.exception.ExternalApiException;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
import static com.lostquest.client.PoliceApiClient.Service.*;

class PoliceApiTrafficGuardTest {
    static class Time extends Clock {
        Instant now = Instant.parse("2026-10-15T14:59:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    final Time time = new Time();
    @Test void perMinuteBudgetSeparatesServicesAndResets() {
        var guard = new PoliceApiTrafficGuard(time, 1, 10, 4);
        guard.acquire(LOST).close(); guard.acquire(FOUND).close();
        assertThatThrownBy(() -> guard.acquire(LOST)).isInstanceOf(ExternalApiException.class);
        time.now = time.now.plusSeconds(60); guard.acquire(LOST).close();
    }
    @Test void dailyBudgetSurvivesMinuteResetAndResetsAtKoreanMidnight() {
        var guard = new PoliceApiTrafficGuard(time, 10, 1, 4); guard.acquire(LOST).close();
        time.now = time.now.plusSeconds(30);
        assertThatThrownBy(() -> guard.acquire(LOST)).isInstanceOf(ExternalApiException.class);
        time.now = Instant.parse("2026-10-15T15:00:00Z"); guard.acquire(LOST).close();
    }
    @Test void concurrentCapacityIsSharedAcrossServicesAndReleasedExactlyOnce() {
        var guard = new PoliceApiTrafficGuard(time, 10, 10, 1); var lease = guard.acquire(LOST);
        assertThatThrownBy(() -> guard.acquire(FOUND)).isInstanceOf(ExternalApiException.class);
        lease.close(); lease.close(); var other = guard.acquire(FOUND);
        assertThatThrownBy(() -> guard.acquire(LOST)).isInstanceOf(ExternalApiException.class); other.close();
    }
    @Test void overBudgetRequestsNeverReachTheMockUpstreamAndFailuresStillConsumeBudget() {
        try (var server = new MockPoliceServer()) {
            server.reply("getLostGoodsDetailInfo", 500, "failed".getBytes());
            var properties = new PoliceApiProperties(server.baseUrl(), Duration.ofSeconds(1), Duration.ofSeconds(1),
                    new PoliceApiProperties.Service("test"), new PoliceApiProperties.Service("test"), new PoliceApiProperties.Service("test"));
            var client = new PoliceApiClient(properties, new PoliceApiTrafficGuard(time, 2, 10, 1));
            for (int i = 0; i < 3; i++) assertThatThrownBy(() -> client.call(PoliceApiClient.Operation.LOST_DETAIL, Map.of("ATC_ID", "L2026100500001176"))).isInstanceOf(ExternalApiException.class);
            assertThat(server.requests()).hasSize(2);
        }
    }
}
