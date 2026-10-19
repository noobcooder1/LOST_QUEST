package com.lostquest.client;

import com.lostquest.exception.ExternalApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.time.*;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/** Counts actual outbound calls, including detail/code/color fan-out and failed requests. Single JVM only. */
@Component
public class PoliceApiTrafficGuard {
    private final Clock clock;
    private final int perMinute, perDay, concurrent;
    private final Map<PoliceApiClient.Service, Usage> usage = new EnumMap<>(PoliceApiClient.Service.class);
    private int active;
    private static class Usage { Instant window; LocalDate day; int minuteCount, dayCount; }
    public PoliceApiTrafficGuard() { this(Clock.systemUTC(), 60, 5000, 4); }
    @Autowired
    public PoliceApiTrafficGuard(@Value("${app.police-api.traffic.per-minute:60}") int perMinute,
            @Value("${app.police-api.traffic.per-day:5000}") int perDay,
            @Value("${app.police-api.traffic.concurrent:4}") int concurrent) {
        this(Clock.systemUTC(), perMinute, perDay, concurrent);
    }
    PoliceApiTrafficGuard(Clock clock, int perMinute, int perDay, int concurrent) {
        if (perMinute < 1 || perDay < 1 || concurrent < 1) throw new IllegalArgumentException("Positive traffic limits required");
        this.clock = clock; this.perMinute = perMinute; this.perDay = perDay; this.concurrent = concurrent;
    }
    synchronized Lease acquire(PoliceApiClient.Service service) {
        Instant now = clock.instant(); LocalDate day = LocalDate.ofInstant(now, ZoneId.of("Asia/Seoul"));
        Usage current = usage.computeIfAbsent(service, key -> new Usage());
        if (current.window == null || !now.isBefore(current.window.plusSeconds(60))) { current.window = now; current.minuteCount = 0; }
        if (!day.equals(current.day)) { current.day = day; current.dayCount = 0; }
        if (active >= concurrent || current.minuteCount >= perMinute || current.dayCount >= perDay)
            throw new ExternalApiException(ExternalApiException.Kind.RATE_LIMITED, "Local outbound police traffic budget reached");
        active++; current.minuteCount++; current.dayCount++;
        return new Lease();
    }
    final class Lease implements AutoCloseable {
        private final AtomicBoolean closed = new AtomicBoolean();
        @Override public void close() { if (closed.compareAndSet(false, true)) synchronized (PoliceApiTrafficGuard.this) { active--; } }
    }
}
