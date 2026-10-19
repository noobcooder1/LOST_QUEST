package com.lostquest.service;

import com.lostquest.dto.PublicItemPageResponse;
import com.lostquest.exception.ExternalApiException;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;

class PoliceListCacheTest {
    static class Time extends Clock {
        Instant now = Instant.parse("2026-10-15T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
        void advance(Duration duration) { now = now.plus(duration); }
    }
    final Time time = new Time();
    final PoliceListCache cache = new PoliceListCache(time, 3);
    final AtomicInteger calls = new AtomicInteger();
    PoliceListCache.Key key(int page) { return cache.key("lost", page, 50, null, null, "지갑", null, PoliceItemService.PoliceFilter.NONE); }
    PublicItemPageResponse data() { calls.incrementAndGet(); return new PublicItemPageResponse(List.of(), 1, 50, 0, 0, "KEYWORD", null, null); }
    @Test void readsReuseOriginalTimestampForTwelveHours() {
        var first = cache.get(key(1), false, this::data);
        time.advance(Duration.ofHours(11)); var hit = cache.get(key(1), false, this::data);
        assertThat(calls).hasValue(1); assertThat(hit.cache().hit()).isTrue();
        assertThat(hit.cache().fetchedAt()).isEqualTo(first.cache().fetchedAt());
        time.advance(Duration.ofHours(1)); var fresh = cache.get(key(1), false, this::data);
        assertThat(calls).hasValue(2); assertThat(fresh.cache().hit()).isFalse();
    }
    @Test void manualRefreshCannotBypassOneMinuteCooldown() {
        var first = cache.get(key(1), false, this::data);
        for (int i = 0; i < 20; i++) cache.get(key(1), true, this::data);
        assertThat(calls).hasValue(1);
        time.advance(Duration.ofSeconds(60)); var refreshed = cache.get(key(1), true, this::data);
        assertThat(calls).hasValue(2); assertThat(refreshed.cache().fetchedAt()).isAfter(first.cache().fetchedAt());
    }
    @Test void keysSeparatePagesSourcesSizeAndConditionsAndNormalizeWhitespace() {
        assertThat(key(1)).isEqualTo(cache.key("lost", 1, 50, null, null, " 지갑 ", " ", PoliceItemService.PoliceFilter.NONE));
        assertThat(key(1)).isNotEqualTo(key(2));
        assertThat(key(1)).isNotEqualTo(cache.key("found", 1, 50, null, null, "지갑", null, PoliceItemService.PoliceFilter.NONE));
        assertThat(key(1)).isNotEqualTo(cache.key("lost", 1, 20, null, null, "지갑", null, PoliceItemService.PoliceFilter.NONE));
        assertThat(key(1)).isNotEqualTo(cache.key("lost", 1, 50, null, null, "가방", null, PoliceItemService.PoliceFilter.NONE));
    }
    @Test void defaultDateKeysChangeAtKoreanMidnight() {
        time.now = Instant.parse("2026-10-15T14:59:59Z");
        var before = cache.key("lost", 1, 50, null, null, null, null, PoliceItemService.PoliceFilter.NONE);
        time.advance(Duration.ofSeconds(1));
        assertThat(before).isNotEqualTo(cache.key("lost", 1, 50, null, null, null, null, PoliceItemService.PoliceFilter.NONE));
    }
    @Test void refreshFailureKeepsOldDataAndTimestampAndBacksOff() {
        var first = cache.get(key(1), false, this::data); time.advance(Duration.ofMinutes(2));
        var attempts = new AtomicInteger();
        var result = cache.get(key(1), true, () -> { attempts.incrementAndGet(); throw new ExternalApiException(ExternalApiException.Kind.TIMEOUT, "test"); });
        assertThat(result.cache().stale()).isTrue(); assertThat(result.cache().refreshError()).isNotBlank();
        assertThat(result.cache().fetchedAt()).isEqualTo(first.cache().fetchedAt());
        cache.get(key(1), true, this::data); assertThat(attempts).hasValue(1); assertThat(calls).hasValue(1);
    }
    @Test void emptyCacheFailuresAreNotRepeatedDuringCooldown() {
        var attempts = new AtomicInteger();
        for (int i = 0; i < 10; i++) assertThatThrownBy(() -> cache.get(key(1), true, () -> {
            attempts.incrementAndGet(); throw new ExternalApiException(ExternalApiException.Kind.UNAVAILABLE, "test");
        })).isInstanceOf(ExternalApiException.class);
        assertThat(attempts).hasValue(1);
    }
    @Test void staleDataOlderThan24HoursIsNeverServedEvenOnRepeatedFailures() {
        cache.get(key(1), false, this::data); time.advance(Duration.ofHours(25));
        for (int i = 0; i < 2; i++) assertThatThrownBy(() -> cache.get(key(1), false, () -> {
            throw new ExternalApiException(ExternalApiException.Kind.UNAVAILABLE, "test");
        })).isInstanceOf(ExternalApiException.class);
    }
    @Test void successfulFirstPageRefreshInvalidatesFollowingPagesButFailureDoesNot() {
        cache.get(key(1), false, this::data); cache.get(key(2), false, this::data);
        time.advance(Duration.ofMinutes(2)); cache.get(key(1), true, this::data);
        cache.get(key(2), false, this::data); assertThat(calls).hasValue(4);
        time.advance(Duration.ofMinutes(2));
        cache.get(key(1), true, () -> { throw new ExternalApiException(ExternalApiException.Kind.UNAVAILABLE, "test"); });
        cache.get(key(2), false, this::data); assertThat(calls).hasValue(4);
    }
    @Test void boundedCacheEvictsOldestUnusedPage() {
        cache.get(key(1), false, this::data); cache.get(key(2), false, this::data); cache.get(key(3), false, this::data);
        cache.get(key(4), false, this::data); cache.get(key(1), false, this::data); assertThat(calls).hasValue(5);
    }
    @Test void concurrentRequestsShareOnePendingLoad() throws Exception {
        var start = new CountDownLatch(1); var loaded = new CountDownLatch(1); var release = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newFixedThreadPool(8)) {
            var futures = java.util.stream.IntStream.range(0, 8).mapToObj(i -> executor.submit(() -> {
                start.await(); return cache.get(key(1), false, () -> { loaded.countDown();
                    try { if (!release.await(5, TimeUnit.SECONDS)) throw new AssertionError("Barrier timeout"); }
                    catch (InterruptedException e) { throw new AssertionError(e); } return data(); });
            })).toList();
            try { start.countDown(); assertThat(loaded.await(5, TimeUnit.SECONDS)).isTrue(); assertThat(futures).noneMatch(Future::isDone); }
            finally { release.countDown(); }
            for (var future : futures) assertThat(future.get(5, TimeUnit.SECONDS).cache().fetchedAt()).isEqualTo(time.now);
            assertThat(calls).hasValue(1);
        }
    }
}
