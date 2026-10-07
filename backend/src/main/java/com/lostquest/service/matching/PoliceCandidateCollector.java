package com.lostquest.service.matching;

import com.lostquest.dto.PublicItemResponse;
import com.lostquest.exception.ExternalApiException;
import com.lostquest.service.PoliceCodeService;
import com.lostquest.service.PoliceCodeService.CodeOption;
import com.lostquest.service.PoliceCodeService.PoliceCodes;
import com.lostquest.service.PoliceItemService;
import com.lostquest.service.PoliceItemService.PoliceFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Collects 경찰청 found items for a lost item through the existing {@link PoliceItemService} (same key handling,
 * validation and normalization as /api/public-items; nothing is stored). The number of upstream calls is fixed:
 * at most {@link #MAX_REGION_QUERIES} region-filtered queries plus one nationwide query, one page each, run in
 * parallel. Colors are compared after fetching, so the per-color-code fan-out of the color filter is never used.
 */
@Component
public class PoliceCandidateCollector {

    private static final Logger log = LoggerFactory.getLogger(PoliceCandidateCollector.class);
    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");

    /** Found dates searched: from the lost date up to this many days later (and never after today). */
    public static final int WINDOW_DAYS = 14;
    /** One page per query; equals the page-size cap of the public police list API in LOST QUEST. */
    public static final int PAGE_SIZE = 50;
    /** A LOST QUEST region can denote two 경찰청 regions (e.g. 광주 → 광주광역시, 전남광주통합특별시). */
    public static final int MAX_REGION_QUERIES = 2;

    private final PoliceItemService policeItemService;
    private final PoliceCodeService policeCodeService;
    private final Clock clock;

    @Autowired
    public PoliceCandidateCollector(PoliceItemService policeItemService, PoliceCodeService policeCodeService) {
        this(policeItemService, policeCodeService, Clock.system(KOREA));
    }

    PoliceCandidateCollector(PoliceItemService policeItemService, PoliceCodeService policeCodeService, Clock clock) {
        this.policeItemService = policeItemService;
        this.policeCodeService = policeCodeService;
        this.clock = clock;
    }

    private record Query(String regionCode, String regionName) {
    }

    public SourceResult collect(MatchTarget target) {
        LocalDate today = LocalDate.now(clock);
        LocalDate from = target.lostDate();
        if (from == null || from.isAfter(today)) {
            return SourceResult.skipped(MatchSource.POLICE, "분실일을 확인할 수 없어 경찰청 습득물을 검색하지 않았습니다.");
        }
        LocalDate plusWindow = from.plusDays(WINDOW_DAYS);
        LocalDate to = plusWindow.isAfter(today) ? today : plusWindow;

        PoliceCodes codes;
        try {
            codes = policeCodeService.codes();
        } catch (ExternalApiException ex) {
            log.warn("Matching: police codes unavailable {}: {}", ex.getKind(), ex.getDetail());
            return SourceResult.unavailable(MatchSource.POLICE, ex.getKind().message());
        }
        String categoryCode = codes.categories().stream()
                .filter(category -> MatchText.normalize(category.name()) != null
                        && MatchText.normalize(category.name()).equals(MatchText.normalize(target.category())))
                .map(PoliceCodeService.CategoryOption::code)
                .findFirst().orElse(null);

        List<Query> queries = new ArrayList<>();
        codes.regions().stream()
                .filter(region -> MatchText.regionDenotes(region.name(), target.region()))
                .limit(MAX_REGION_QUERIES)
                .forEach((CodeOption region) -> queries.add(new Query(region.code(), region.name())));
        queries.add(new Query(null, null));

        Map<String, MatchCandidate> byKey = new LinkedHashMap<>();
        ExternalApiException firstFailure = null;
        int failures = 0;
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<List<PublicItemResponse>>> futures = queries.stream()
                    .map(query -> executor.submit(() -> policeItemService.listFound(1, PAGE_SIZE, from, to, null, null,
                            new PoliceFilter(query.regionCode(), categoryCode, null, null)).items()))
                    .toList();
            // Region queries come first, so an item seen with a known region keeps it over the nationwide copy.
            for (int i = 0; i < queries.size(); i++) {
                try {
                    for (PublicItemResponse item : futures.get(i).get()) {
                        MatchCandidate candidate = toCandidate(item, queries.get(i).regionName());
                        if (candidate != null) {
                            byKey.putIfAbsent(candidate.key(), candidate);
                        }
                    }
                } catch (ExecutionException ex) {
                    failures++;
                    ExternalApiException external = ex.getCause() instanceof ExternalApiException e ? e
                            : new ExternalApiException(ExternalApiException.Kind.UPSTREAM_ERROR,
                                    "matching: " + ex.getCause().getClass().getSimpleName());
                    log.warn("Matching: police query failed {}: {}", external.getKind(), external.getDetail());
                    if (firstFailure == null) {
                        firstFailure = external;
                    }
                }
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return SourceResult.unavailable(MatchSource.POLICE, ExternalApiException.Kind.UNAVAILABLE.message());
        }

        List<MatchCandidate> candidates = List.copyOf(byKey.values());
        if (failures == 0) {
            return SourceResult.ok(MatchSource.POLICE, candidates);
        }
        if (failures == queries.size()) {
            return SourceResult.unavailable(MatchSource.POLICE, firstFailure.getKind().message());
        }
        return new SourceResult(MatchSource.POLICE, SourceResult.Status.PARTIAL, candidates,
                "경찰청 습득물 일부 조회에 실패해 조회된 결과만 표시합니다.");
    }

    /** Items without the ids needed for a detail link are dropped rather than shown with an invented id. */
    static MatchCandidate toCandidate(PublicItemResponse item, String regionName) {
        if (item.atcId() == null || item.atcId().isBlank() || item.fdSn() == null) {
            return null;
        }
        return new MatchCandidate(
                MatchSource.POLICE,
                "POLICE:" + item.atcId() + "-" + item.fdSn(),
                null,
                item.atcId(),
                item.fdSn(),
                item.title(),
                item.category(),
                item.color(),
                item.date(),
                regionName,
                item.location(),
                item.storagePlace(),
                item.imageUrl());
    }
}
