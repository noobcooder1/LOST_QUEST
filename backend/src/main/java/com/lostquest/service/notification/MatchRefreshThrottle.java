package com.lostquest.service.notification;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Re-matching a lost item calls the 경찰청 API, so each lost item is refreshed at most once per interval no matter
 * how often (or how concurrently) clients ask. State is in memory: a restart allows one early refresh, and
 * several server instances would each keep their own interval (acceptable for the current single server).
 */
@Component
public class MatchRefreshThrottle {

    private final Duration interval;
    private final Clock clock;
    private final Map<Long, Instant> lastStarted = new ConcurrentHashMap<>();

    @Autowired
    public MatchRefreshThrottle(@Value("${app.notifications.refresh-interval:PT10M}") Duration interval) {
        this(interval, Clock.systemUTC());
    }

    MatchRefreshThrottle(Duration interval, Clock clock) {
        if (interval.isNegative()) {
            throw new IllegalArgumentException("refresh interval must not be negative");
        }
        this.interval = interval;
        this.clock = clock;
    }

    /** Atomically claims a refresh of the lost item; false while the previous one is within the interval. */
    public boolean tryAcquire(Long lostItemId) {
        Instant now = clock.instant();
        AtomicBoolean acquired = new AtomicBoolean(false);
        lastStarted.compute(lostItemId, (id, previous) -> {
            if (previous == null || !previous.plus(interval).isAfter(now)) {
                acquired.set(true);
                return now;
            }
            return previous;
        });
        return acquired.get();
    }

    /** Gives the slot back after a refresh that failed before matching ran. */
    public void release(Long lostItemId) {
        lastStarted.remove(lostItemId);
    }
}
