package com.lostquest.service.notification;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MatchRefreshThrottleTest {

    static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-10-07T00:00:00Z");

        @Override
        public ZoneOffset getZone() {
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

    @Test
    @DisplayName("같은 분실물은 간격 안에 한 번만, 간격이 지나면 다시 허용, 분실물끼리는 독립")
    void oncePerInterval() {
        MutableClock clock = new MutableClock();
        MatchRefreshThrottle throttle = new MatchRefreshThrottle(Duration.ofMinutes(10), clock);

        assertThat(throttle.tryAcquire(1L)).isTrue();
        assertThat(throttle.tryAcquire(1L)).isFalse();
        assertThat(throttle.tryAcquire(2L)).isTrue();
        clock.now = clock.now.plus(Duration.ofMinutes(9));
        assertThat(throttle.tryAcquire(1L)).isFalse();
        clock.now = clock.now.plus(Duration.ofMinutes(1));
        assertThat(throttle.tryAcquire(1L)).isTrue();
    }

    @Test
    @DisplayName("실패 후 release 하면 바로 다시 시도 가능, 간격 0이면 항상 허용, 음수 간격 거부")
    void releaseAndZeroInterval() {
        MatchRefreshThrottle throttle = new MatchRefreshThrottle(Duration.ofMinutes(10), new MutableClock());
        assertThat(throttle.tryAcquire(1L)).isTrue();
        throttle.release(1L);
        assertThat(throttle.tryAcquire(1L)).isTrue();

        MatchRefreshThrottle always = new MatchRefreshThrottle(Duration.ZERO, new MutableClock());
        assertThat(always.tryAcquire(1L)).isTrue();
        assertThat(always.tryAcquire(1L)).isTrue();

        assertThatThrownBy(() -> new MatchRefreshThrottle(Duration.ofMinutes(-1))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("동시 요청 16개 중 정확히 1개만 갱신 권한을 얻음")
    void concurrentAcquire() throws Exception {
        MatchRefreshThrottle throttle = new MatchRefreshThrottle(Duration.ofMinutes(10), new MutableClock());
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        try (ExecutorService executor = Executors.newFixedThreadPool(16)) {
            for (int i = 0; i < 16; i++) {
                Callable<Boolean> task = () -> {
                    start.await();
                    return throttle.tryAcquire(7L);
                };
                results.add(executor.submit(task));
            }
            start.countDown();
            int acquired = 0;
            for (Future<Boolean> result : results) {
                acquired += result.get() ? 1 : 0;
            }
            assertThat(acquired).isEqualTo(1);
        }
    }
}
