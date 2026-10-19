package com.lostquest.service;

import com.lostquest.dto.PublicItemPageResponse;
import com.lostquest.dto.PublicItemPageResponse.CacheInfo;
import com.lostquest.exception.ExternalApiException;
import org.springframework.stereotype.Component;
import java.time.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.function.Supplier;

/** Bounded public-list cache. No user data, detail responses or DB writes. */
@Component
public class PoliceListCache {
    static final Duration TTL = Duration.ofHours(12), COOLDOWN = Duration.ofMinutes(1), MAX_STALE = Duration.ofHours(24);
    public record Key(String type, int page, int size, LocalDate from, LocalDate to, String q, String place,
                      String region, String category, String subCategory, String color, LocalDate defaultDay) {
        Key scope() { return new Key(type, 0, size, from, to, q, place, region, category, subCategory, color, defaultDay); }
    }
    private static class Entry {
        PublicItemPageResponse data; Instant fetchedAt, attemptedAt; RuntimeException failure;
        CompletableFuture<PublicItemPageResponse> flight;
    }
    private final Clock clock;
    private final int capacity;
    private final Map<Key, Entry> entries = new LinkedHashMap<>(16, .75f, true);
    public PoliceListCache() { this(Clock.systemUTC(), 512); }
    PoliceListCache(Clock clock, int capacity) { this.clock = clock; this.capacity = capacity; }
    private static String text(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    public Key key(String type, int page, int size, LocalDate from, LocalDate to, String q, String place,
                   PoliceItemService.PoliceFilter filter) {
        boolean defaults = text(q) == null && text(place) == null && (from == null || to == null);
        return new Key(type, page, size, from, to, text(q), text(place), text(filter.region()), text(filter.category()),
                text(filter.subCategory()), text(filter.color()), defaults ? LocalDate.ofInstant(clock.instant(), ZoneId.of("Asia/Seoul")) : null);
    }
    public PublicItemPageResponse get(Key key, boolean refresh, Supplier<PublicItemPageResponse> loader) {
        Entry entry; CompletableFuture<PublicItemPageResponse> flight; boolean owner = false;
        synchronized (entries) {
            Instant now = clock.instant();
            entry = entries.get(key);
            if (entry == null) {
                if (entries.size() >= capacity) {
                    var iterator = entries.entrySet().iterator(); boolean removed = false;
                    while (iterator.hasNext()) { if (iterator.next().getValue().flight == null) { iterator.remove(); removed = true; break; } }
                    if (!removed) throw new ExternalApiException(ExternalApiException.Kind.RATE_LIMITED, "Public list cache is busy");
                }
                entry = new Entry(); entries.put(key, entry);
            }
            if (entry.flight != null) flight = entry.flight;
            else {
                boolean cooling = entry.attemptedAt != null && now.isBefore(entry.attemptedAt.plus(COOLDOWN));
                if (entry.data != null && ((!refresh && now.isBefore(entry.fetchedAt.plus(TTL))) || (cooling && now.isBefore(entry.fetchedAt.plus(MAX_STALE)))))
                    return view(entry, true);
                if (cooling && entry.failure != null) throw entry.failure;
                entry.attemptedAt = now; entry.flight = new CompletableFuture<>(); flight = entry.flight; owner = true;
            }
        }
        if (!owner) {
            try {
                PublicItemPageResponse result = flight.join();
                CacheInfo c = result.cache();
                return result.withCache(new CacheInfo(c.fetchedAt(), c.expiresAt(), c.refreshAllowedAt(), true, c.stale(), c.refreshError()));
            } catch (CompletionException ex) { if (ex.getCause() instanceof RuntimeException runtime) throw runtime; throw ex; }
        }
        try {
            PublicItemPageResponse data = loader.get();
            PublicItemPageResponse result;
            synchronized (entries) {
                entry.data = data.withCache(null); entry.fetchedAt = clock.instant(); entry.failure = null; result = view(entry, false);
                if (refresh && key.page() == 1) entries.entrySet().removeIf(other -> other.getKey().page() > 1 && other.getKey().scope().equals(key.scope()));
            }
            flight.complete(result); return result;
        } catch (RuntimeException ex) {
            PublicItemPageResponse stale = null;
            synchronized (entries) {
                entry.failure = ex;
                if (ex instanceof ExternalApiException && entry.data != null && clock.instant().isBefore(entry.fetchedAt.plus(MAX_STALE))) stale = view(entry, true);
            }
            if (stale != null) { flight.complete(stale); return stale; }
            flight.completeExceptionally(ex); throw ex;
        } finally { synchronized (entries) { entry.flight = null; } }
    }
    private PublicItemPageResponse view(Entry entry, boolean hit) {
        boolean stale = entry.failure != null || !clock.instant().isBefore(entry.fetchedAt.plus(TTL));
        String error = entry.failure == null ? null : "새 정보를 가져오지 못해 이전 조회 결과를 유지합니다. 잠시 후 다시 시도해 주세요.";
        return entry.data.withCache(new CacheInfo(entry.fetchedAt, entry.fetchedAt.plus(TTL), entry.attemptedAt.plus(COOLDOWN), hit, stale, error));
    }
}
