package com.lostquest.service;

import com.lostquest.exception.ExternalApiException;
import com.lostquest.exception.InvalidRequestParameterException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;

/** Bounded, read-only, single-JVM photo cache. No DB/files, forced refresh or prefetch. */
@Service
public class PolicePhotoService {
    static final Duration TTL = Duration.ofHours(12), FAILURE_TTL = Duration.ofMinutes(1);
    static final long MAX_CACHE_BYTES = 32L * 1024 * 1024;
    static final int MAX_ENTRIES = 128, MAX_CONCURRENT = 2, PER_MINUTE = 30, PER_DAY = 1000;
    public record Photo(byte[] bytes, String contentType) {}
    public record CachedPhoto(Photo photo, boolean hit) {}
    private static class Entry {
        Photo photo; RuntimeException failure; Instant expires; CompletableFuture<Photo> flight;
    }
    private final PolicePhotoDownloader downloader;
    private final Clock clock;
    private final long maxBytes;
    private final int maxEntries, perMinute, perDay;
    private final Map<String, Entry> entries = new LinkedHashMap<>(16, .75f, true);
    private long bytes;
    private int active, minuteCount, dayCount;
    private Instant minuteStart;
    private LocalDate day;

    @Autowired public PolicePhotoService(PolicePhotoDownloader downloader) {
        this(downloader, Clock.systemUTC(), MAX_CACHE_BYTES, MAX_ENTRIES, PER_MINUTE, PER_DAY);
    }
    PolicePhotoService(PolicePhotoDownloader downloader, Clock clock, long maxBytes, int maxEntries, int perMinute, int perDay) {
        this.downloader = downloader; this.clock = clock; this.maxBytes = maxBytes; this.maxEntries = maxEntries;
        this.perMinute = perMinute; this.perDay = perDay;
    }

    public CachedPhoto get(String url) {
        String safe = PoliceImagePolicy.safeImageUrl(url);
        if (safe == null) throw new InvalidRequestParameterException("url", "허용된 경찰청 첨부 이미지 주소만 사용할 수 있어요.");
        Entry entry; CompletableFuture<Photo> flight; boolean owner = false;
        synchronized (entries) {
            removeExpired();
            entry = entries.get(safe);
            if (entry != null && entry.flight == null) {
                if (entry.failure != null) throw entry.failure;
                return new CachedPhoto(entry.photo, true);
            }
            if (entry != null) flight = entry.flight;
            else {
                consumeBudget();
                trim(maxEntries - 1, maxBytes);
                entry = new Entry(); entry.flight = new CompletableFuture<>(); flight = entry.flight;
                entries.put(safe, entry); active++; owner = true;
            }
        }
        if (!owner) {
            try { return new CachedPhoto(flight.join(), true); }
            catch (CompletionException ex) { if (ex.getCause() instanceof RuntimeException cause) throw cause; throw ex; }
        }
        try {
            Photo photo = validate(downloader.download(safe));
            synchronized (entries) {
                entry.photo = photo; entry.expires = clock.instant().plus(TTL); entry.flight = null;
                bytes += photo.bytes().length; active--; trim(maxEntries, maxBytes);
            }
            flight.complete(photo);
            return new CachedPhoto(photo, false);
        } catch (RuntimeException ex) {
            RuntimeException failure = ex instanceof ExternalApiException ? ex : new ExternalApiException(ExternalApiException.Kind.INVALID_RESPONSE, "police photo decode failure");
            synchronized (entries) { entry.failure = failure; entry.expires = clock.instant().plus(FAILURE_TTL); entry.flight = null; active--; }
            flight.completeExceptionally(failure); throw failure;
        }
    }
    private Photo validate(PolicePhotoDownloader.Download data) {
        byte[] content = data.bytes();
        if (content == null || content.length == 0 || content.length > PolicePhotoDownloader.MAX_BYTES) throw new IllegalArgumentException("photo size");
        String type = data.contentType(), format;
        if ("image/jpeg".equals(type) && content.length >= 3 && (content[0] & 255) == 255 && (content[1] & 255) == 216 && (content[2] & 255) == 255) format = "jpeg";
        else if ("image/png".equals(type) && content.length >= 8 && java.util.Arrays.equals(java.util.Arrays.copyOf(content, 8), new byte[]{(byte)137,80,78,71,13,10,26,10})) format = "png";
        else if ("image/webp".equals(type) && content.length >= 12 && new String(content, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF") && new String(content, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")) format = "webp";
        else throw new IllegalArgumentException("photo format");
        ImageDecodeValidator.validate(content, format);
        return new Photo(content, type);
    }
    private void consumeBudget() {
        Instant now = clock.instant(); LocalDate today = LocalDate.ofInstant(now, ZoneId.of("Asia/Seoul"));
        if (minuteStart == null || !now.isBefore(minuteStart.plusSeconds(60))) { minuteStart = now; minuteCount = 0; }
        if (!today.equals(day)) { day = today; dayCount = 0; }
        if (active >= MAX_CONCURRENT || minuteCount >= perMinute || dayCount >= perDay) throw new ExternalApiException(ExternalApiException.Kind.RATE_LIMITED, "police photo local traffic budget");
        minuteCount++; dayCount++;
    }
    private void removeExpired() {
        var it = entries.values().iterator();
        while (it.hasNext()) { Entry e = it.next(); if (e.flight == null && !clock.instant().isBefore(e.expires)) { if (e.photo != null) bytes -= e.photo.bytes().length; it.remove(); } }
    }
    private void trim(int capacity, long byteLimit) {
        var it = entries.values().iterator();
        while ((entries.size() > capacity || bytes > byteLimit) && it.hasNext()) {
            Entry e = it.next(); if (e.flight == null) { if (e.photo != null) bytes -= e.photo.bytes().length; it.remove(); }
        }
    }
}
