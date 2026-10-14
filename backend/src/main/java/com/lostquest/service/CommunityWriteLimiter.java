package com.lostquest.service;

import com.lostquest.exception.CommunityRateLimitException;
import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Bounded single-server MVP throttle. Restart resets the minute window; no write is queued or retried. */
@Component
public class CommunityWriteLimiter {
    private record Window(long startedAt, int count) {}
    private final Map<String, Window> windows = new HashMap<>();
    private final Clock clock;
    public CommunityWriteLimiter() { this(Clock.systemUTC()); }
    CommunityWriteLimiter(Clock clock) { this.clock = clock; }
    public synchronized void check(Long userId, String action, int limit) {
        long now = clock.millis();
        windows.entrySet().removeIf(e -> now - e.getValue().startedAt() >= 60_000);
        String key = userId + ":" + action;
        Window old = windows.get(key);
        if ((old != null && old.count() >= limit) || (old == null && windows.size() >= 10_000))
            throw new CommunityRateLimitException();
        windows.put(key, new Window(old == null ? now : old.startedAt(), old == null ? 1 : old.count() + 1));
    }
}
