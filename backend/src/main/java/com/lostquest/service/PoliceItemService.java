package com.lostquest.service;

import com.lostquest.client.PoliceApiClient;
import com.lostquest.client.PoliceApiClient.Operation;
import com.lostquest.client.PoliceXmlResponse;
import com.lostquest.dto.PublicItemPageResponse;
import com.lostquest.dto.PublicItemResponse;
import com.lostquest.exception.ExternalApiException;
import com.lostquest.exception.InvalidRequestParameterException;
import com.lostquest.exception.ResourceNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;

/**
 * Real-time 경찰청 lookups normalized for LOST QUEST. Nothing is stored in MySQL.
 * Region / item-class / color filters accept only codes that the police common-code API currently returns
 * (see {@link PoliceCodeService}); nothing is guessed.
 */
@Service
public class PoliceItemService {

    static final int DEFAULT_RANGE_DAYS = 30;
    static final int MAX_RANGE_DAYS = 90;
    /** Upper bound of parallel upstream calls when one color name spans several codes. */
    static final int MAX_PARALLEL_COLOR_CALLS = 4;
    private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");

    /** Code filters as sent by the UI (values from GET /api/public-items/filters). All optional. */
    public record PoliceFilter(String region, String category, String subCategory, String color) {
        public static final PoliceFilter NONE = new PoliceFilter(null, null, null, null);

        boolean isEmpty() {
            return blankToNull(region) == null && blankToNull(category) == null
                    && blankToNull(subCategory) == null && blankToNull(color) == null;
        }
    }

    private final PoliceApiClient client;
    private final PoliceCodeService codeService;
    private final Clock clock;

    @Autowired
    public PoliceItemService(PoliceApiClient client, PoliceCodeService codeService) {
        this(client, codeService, Clock.system(KOREA));
    }

    PoliceItemService(PoliceApiClient client, PoliceCodeService codeService, Clock clock) {
        this.client = client;
        this.codeService = codeService;
        this.clock = clock;
    }

    public PublicItemPageResponse listLost(int page, int size, LocalDate from, LocalDate to, String keyword, String place) {
        return listLost(page, size, from, to, keyword, place, PoliceFilter.NONE);
    }

    public PublicItemPageResponse listLost(int page, int size, LocalDate from, LocalDate to, String keyword, String place,
                                           PoliceFilter filter) {
        return list("LOST", page, size, from, to, keyword, place, "LST_PRDT_NM", "LST_PLACE",
                Operation.LOST_LIST, Operation.LOST_SEARCH, filter, "LST_LCT_CD");
    }

    public PublicItemPageResponse listFound(int page, int size, LocalDate from, LocalDate to, String keyword, String storagePlace) {
        return listFound(page, size, from, to, keyword, storagePlace, PoliceFilter.NONE);
    }

    public PublicItemPageResponse listFound(int page, int size, LocalDate from, LocalDate to, String keyword, String storagePlace,
                                            PoliceFilter filter) {
        return list("FOUND", page, size, from, to, keyword, storagePlace, "PRDT_NM", "DEP_PLACE",
                Operation.FOUND_LIST, Operation.FOUND_SEARCH, filter, "N_FD_LCT_CD");
    }

    public PublicItemResponse lostDetail(String atcId) {
        return detail("LOST", client.call(Operation.LOST_DETAIL, Map.of("ATC_ID", atcId)), "경찰청 분실물 정보를 찾을 수 없습니다.");
    }

    public PublicItemResponse foundDetail(String atcId, int fdSn) {
        return detail("FOUND", client.call(Operation.FOUND_DETAIL, Map.of("ATC_ID", atcId, "FD_SN", String.valueOf(fdSn))),
                "경찰청 습득물 정보를 찾을 수 없습니다.");
    }

    private PublicItemPageResponse list(String type, int page, int size, LocalDate from, LocalDate to,
                                        String keyword, String place, String keywordParam, String placeParam,
                                        Operation listOperation, Operation searchOperation,
                                        PoliceFilter filter, String regionParam) {
        String trimmedKeyword = blankToNull(keyword);
        String trimmedPlace = blankToNull(place);
        Map<String, String> params = new LinkedHashMap<>();
        params.put("pageNo", String.valueOf(page));
        params.put("numOfRows", String.valueOf(size));

        if (trimmedKeyword != null || trimmedPlace != null) {
            // The name/place operation has no date parameters (verified: dates are ignored upstream).
            if (from != null || to != null) {
                throw new InvalidRequestParameterException("from", "검색어 검색은 경찰청 API에서 날짜 조건을 지원하지 않습니다. 날짜 또는 검색어 중 하나만 사용해 주세요.");
            }
            if (!filter.isEmpty()) {
                // The name/place operation has no region, class or color parameters either.
                throw new InvalidRequestParameterException("q", "검색어 검색은 경찰청 API에서 지역·물품분류·색상 조건을 지원하지 않습니다. 검색어 또는 조건 중 하나만 사용해 주세요.");
            }
            params.put(keywordParam, trimmedKeyword);
            params.put(placeParam, trimmedPlace);
            return page(type, client.call(searchOperation, params), page, size, "KEYWORD", null, null);
        }

        LocalDate today = LocalDate.now(clock);
        LocalDate end = to != null ? to : today;
        LocalDate start = from != null ? from : end.minusDays(DEFAULT_RANGE_DAYS - 1L);
        if (end.isAfter(today)) {
            throw new InvalidRequestParameterException("to", "종료 날짜는 오늘 이후일 수 없습니다.");
        }
        if (start.isAfter(end)) {
            throw new InvalidRequestParameterException("from", "시작 날짜는 종료 날짜보다 늦을 수 없습니다.");
        }
        if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_RANGE_DAYS) {
            throw new InvalidRequestParameterException("from", "조회 기간은 최대 " + MAX_RANGE_DAYS + "일입니다.");
        }
        if (blankToNull(filter.color()) != null && "LOST".equals(type)) {
            throw new InvalidRequestParameterException("color", "경찰청 분실물 API는 색상 조건을 지원하지 않습니다.");
        }
        // The lost-item list fails upstream (gateway HTTP_ERROR) without a date range, so one is always sent.
        params.put("START_YMD", start.format(YMD));
        params.put("END_YMD", end.format(YMD));
        List<String> colorCodes = applyCodeFilters(filter, regionParam, params);
        if (colorCodes.size() <= 1) {
            if (colorCodes.size() == 1) {
                params.put("FD_COL_CD", colorCodes.get(0));
            }
            return page(type, client.call(listOperation, params), page, size, "DATE_RANGE", start, end);
        }
        return colorGroupPage(type, listOperation, params, colorCodes, page, size, start, end);
    }

    /** Validates filter values against the live common codes and adds the matching API parameters. */
    private List<String> applyCodeFilters(PoliceFilter filter, String regionParam, Map<String, String> params) {
        if (filter.isEmpty()) {
            return List.of();
        }
        PoliceCodeService.PoliceCodes codes = codeService.codes();
        String region = blankToNull(filter.region());
        if (region != null) {
            if (!codes.hasRegion(region)) {
                throw new InvalidRequestParameterException("region", "지원하지 않는 지역 코드입니다.");
            }
            params.put(regionParam, region);
        }
        String category = blankToNull(filter.category());
        String subCategory = blankToNull(filter.subCategory());
        if (category != null && codes.category(category).isEmpty()) {
            throw new InvalidRequestParameterException("category", "지원하지 않는 물품 분류입니다.");
        }
        if (subCategory != null) {
            PoliceCodeService.CategoryOption parent = codes.parentOf(subCategory)
                    .orElseThrow(() -> new InvalidRequestParameterException("subCategory", "지원하지 않는 세부 물품 분류입니다."));
            if (category != null && !parent.code().equals(category)) {
                throw new InvalidRequestParameterException("subCategory", "세부 분류가 선택한 물품 분류에 속하지 않습니다.");
            }
            category = parent.code();
            params.put("PRDT_CL_CD_02", subCategory);
        }
        if (category != null) {
            params.put("PRDT_CL_CD_01", category);
        }
        String color = blankToNull(filter.color());
        if (color == null) {
            return List.of();
        }
        return codes.color(color)
                .orElseThrow(() -> new InvalidRequestParameterException("color", "지원하지 않는 색상입니다."))
                .codes();
    }

    /**
     * One color name maps to several police codes and the API accepts exactly one code per request (verified:
     * comma/repeated values return 0). Each code is queried with the same page number and the pages are merged,
     * so every matching item appears on exactly one merged page; a merged page can hold up to size x codes items.
     */
    private PublicItemPageResponse colorGroupPage(String type, Operation operation, Map<String, String> params,
                                                  List<String> colorCodes, int page, int size, LocalDate from, LocalDate to) {
        List<PoliceXmlResponse> responses = new ArrayList<>();
        Semaphore permits = new Semaphore(MAX_PARALLEL_COLOR_CALLS);
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<PoliceXmlResponse>> futures = colorCodes.stream().map(code -> executor.submit(() -> {
                permits.acquire();
                try {
                    Map<String, String> perCode = new LinkedHashMap<>(params);
                    perCode.put("FD_COL_CD", code);
                    return client.call(operation, perCode);
                } finally {
                    permits.release();
                }
            })).toList();
            for (Future<PoliceXmlResponse> future : futures) {
                responses.add(future.get());
            }
        } catch (ExecutionException ex) {
            if (ex.getCause() instanceof ExternalApiException external) {
                throw external;
            }
            throw new ExternalApiException(ExternalApiException.Kind.UPSTREAM_ERROR, "color group: " + ex.getCause().getClass().getSimpleName());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ExternalApiException(ExternalApiException.Kind.UNAVAILABLE, "color group: interrupted");
        }

        int totalCount = responses.stream().mapToInt(PoliceXmlResponse::totalCount).sum();
        int totalPages = responses.stream().mapToInt(r -> (int) Math.ceil(r.totalCount() / (double) size)).max().orElse(0);
        List<PublicItemResponse> items = responses.stream()
                .flatMap(r -> r.items().stream())
                .map(item -> toItem(type, item, false))
                .sorted(Comparator.comparing(PublicItemResponse::date, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(PublicItemResponse::sourceId, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        return new PublicItemPageResponse(items, page, size, totalCount, totalPages, "DATE_RANGE", from, to);
    }

    private PublicItemPageResponse page(String type, PoliceXmlResponse response, int page, int size,
                                        String mode, LocalDate from, LocalDate to) {
        List<PublicItemResponse> items = response.items().stream().map(item -> toItem(type, item, false)).toList();
        int totalPages = response.totalCount() == 0 ? 0 : (int) Math.ceil(response.totalCount() / (double) size);
        return new PublicItemPageResponse(items, page, size, response.totalCount(), totalPages, mode, from, to);
    }

    private PublicItemResponse detail(String type, PoliceXmlResponse response, String notFoundMessage) {
        // Unknown ids come back as resultCode 00 with no item.
        if (response.items().isEmpty()) {
            throw new ResourceNotFoundException(notFoundMessage);
        }
        return toItem(type, response.items().get(0), true);
    }

    static PublicItemResponse toItem(String type, Map<String, String> f, boolean detail) {
        boolean lost = "LOST".equals(type);
        String atcId = f.get("atcId");
        Integer fdSn = lost ? null : parseInt(f.get("fdSn"));
        String categoryPath = f.get("prdtClNm");
        return new PublicItemResponse(
                "POLICE",
                type,
                lost ? atcId : atcId + "-" + (fdSn == null ? "" : fdSn),
                atcId,
                fdSn,
                f.get(lost ? "lstPrdtNm" : "fdPrdtNm"),
                f.get(lost ? "lstSbjt" : "fdSbjt"),
                topCategory(categoryPath),
                categoryPath,
                f.get("clrNm"),
                parseDate(f.get(lost ? "lstYmd" : "fdYmd")),
                f.get(lost ? "lstPlace" : "fdPlace"),
                lost ? f.get("lstPlaceSeNm") : null,
                lost ? f.get("lstLctNm") : null,
                lost ? null : f.get("depPlace"),
                PoliceImagePolicy.safeImageUrl(f.get(lost ? "lstFilePathImg" : "fdFilePathImg")),
                f.get("orgNm"),
                f.get("tel"),
                f.get(lost ? "lstSteNm" : "csteSteNm"),
                f.get(lost ? "lstHor" : "fdHor"),
                f.get("uniq"),
                detail);
    }

    private static String topCategory(String path) {
        if (path == null) {
            return null;
        }
        String top = path.split(">", 2)[0].strip();
        return top.isEmpty() ? null : top;
    }

    /** Dates arrive as yyyy-MM-dd (lists) or possibly yyyyMMdd; anything else becomes null rather than invented. */
    private static LocalDate parseDate(String value) {
        if (value == null) {
            return null;
        }
        try {
            return value.length() == 8 ? LocalDate.parse(value, YMD) : LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    private static Integer parseInt(String value) {
        try {
            return value == null ? null : Integer.valueOf(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
