package com.lostquest.service;

import com.lostquest.client.PoliceApiClient;
import com.lostquest.client.PoliceApiClient.Operation;
import com.lostquest.exception.ExternalApiException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Search-filter codes from the 경찰청 common-code API (CmmnCdService), loaded live and cached. No code value is
 * hard-coded; only the code shapes verified against real responses are relied on:
 * <ul>
 *   <li>Regions (group "지역구분", LC0): only top-level codes {@code LC?000} filter results; sub-region codes
 *       such as LCA001 always return 0 rows upstream, so they are not offered.</li>
 *   <li>Colors (group "색상코드", CL1): several codes share one name (e.g. 블랙(검정) = CL1002 and CL1043) and
 *       all are in use, so colors are grouped by name and a filter expands to every code of the group.</li>
 *   <li>Item classes (getThngClCd): top level {@code PR?000} and their children.</li>
 * </ul>
 */
@Service
public class PoliceCodeService {

    static final Duration TTL = Duration.ofHours(12);
    /** After a failed load, wait before calling the code API again instead of hammering it. */
    static final Duration RETRY_AFTER_FAILURE = Duration.ofSeconds(60);
    static final String REGION_GROUP = "지역구분";
    static final String COLOR_GROUP = "색상코드";

    private static final Pattern TOP_REGION = Pattern.compile("LC[A-Z]000");
    private static final Pattern COLOR = Pattern.compile("CL[0-9]{4}");
    private static final Pattern TOP_CLASS = Pattern.compile("PR[A-Z]000");
    private static final Pattern SUB_CLASS = Pattern.compile("PR[A-Z][0-9]{3}");

    public record CodeOption(String code, String name) {
    }

    public record CategoryOption(String code, String name, List<CodeOption> children) {
    }

    /** {@code id} is the lowest code of the group; {@code codes} are all codes sharing the name. */
    public record ColorOption(String id, String name, List<String> codes) {
    }

    public record PoliceCodes(List<CodeOption> regions, List<CategoryOption> categories, List<ColorOption> colors) {

        public boolean hasRegion(String code) {
            return regions.stream().anyMatch(region -> region.code().equals(code));
        }

        public Optional<CategoryOption> category(String code) {
            return categories.stream().filter(category -> category.code().equals(code)).findFirst();
        }

        /** The top-level class that owns a sub-class code. */
        public Optional<CategoryOption> parentOf(String subCode) {
            return categories.stream()
                    .filter(category -> category.children().stream().anyMatch(child -> child.code().equals(subCode)))
                    .findFirst();
        }

        public Optional<ColorOption> color(String id) {
            return colors.stream().filter(color -> color.id().equals(id)).findFirst();
        }
    }

    private final PoliceApiClient client;
    private final Clock clock;
    private PoliceCodes cached;
    private Instant loadedAt;
    private ExternalApiException lastFailure;
    private Instant failedAt;

    @Autowired
    public PoliceCodeService(PoliceApiClient client) {
        this(client, Clock.systemUTC());
    }

    PoliceCodeService(PoliceApiClient client, Clock clock) {
        this.client = client;
        this.clock = clock;
    }

    public synchronized PoliceCodes codes() {
        Instant now = clock.instant();
        if (cached != null && loadedAt.plus(TTL).isAfter(now)) {
            return cached;
        }
        if (lastFailure != null && failedAt.plus(RETRY_AFTER_FAILURE).isAfter(now)) {
            throw lastFailure;
        }
        try {
            cached = load();
            loadedAt = now;
            lastFailure = null;
            return cached;
        } catch (ExternalApiException ex) {
            if (cached != null) {
                // Codes change rarely: keep serving the previous set rather than disabling filters.
                return cached;
            }
            lastFailure = ex;
            failedAt = now;
            throw ex;
        }
    }

    private PoliceCodes load() {
        List<CodeOption> regions = client.call(Operation.CODE_COMMON, Map.of("GRP_NM", REGION_GROUP)).items().stream()
                .filter(row -> "LC0".equals(row.get("commGrpCd")))
                .filter(row -> matches(TOP_REGION, row.get("commCd")) && row.get("cdNm") != null)
                .map(row -> new CodeOption(row.get("commCd"), row.get("cdNm")))
                .sorted(Comparator.comparing(CodeOption::code))
                .toList();

        Map<String, List<String>> colorsByName = new LinkedHashMap<>();
        client.call(Operation.CODE_COMMON, Map.of("GRP_NM", COLOR_GROUP)).items().stream()
                .filter(row -> "CL1".equals(row.get("commGrpCd")))
                .filter(row -> matches(COLOR, row.get("commCd")) && row.get("cdNm") != null)
                .sorted(Comparator.comparing(row -> row.get("commCd")))
                .forEach(row -> colorsByName.computeIfAbsent(row.get("cdNm"), name -> new ArrayList<>()).add(row.get("commCd")));
        List<ColorOption> colors = colorsByName.entrySet().stream()
                .map(entry -> new ColorOption(entry.getValue().get(0), entry.getKey(), List.copyOf(entry.getValue())))
                .sorted(Comparator.comparing(ColorOption::id))
                .toList();

        List<CategoryOption> categories = new ArrayList<>();
        for (Map<String, String> top : client.call(Operation.CODE_ITEM_CLASS, Map.of()).items()) {
            String code = top.get("prdtCd");
            if (!matches(TOP_CLASS, code) || top.get("prdtNm") == null) {
                continue;
            }
            List<CodeOption> children = client.call(Operation.CODE_ITEM_CLASS, Map.of("PRDT_CL_CD_01", code)).items().stream()
                    .filter(row -> code.equals(row.get("hiPrdtCd")) && matches(SUB_CLASS, row.get("prdtCd"))
                            && !code.equals(row.get("prdtCd")) && row.get("prdtNm") != null)
                    .map(row -> new CodeOption(row.get("prdtCd"), row.get("prdtNm")))
                    .sorted(Comparator.comparing(CodeOption::code))
                    .toList();
            categories.add(new CategoryOption(code, top.get("prdtNm"), children));
        }
        categories.sort(Comparator.comparing(CategoryOption::code));
        return new PoliceCodes(regions, List.copyOf(categories), colors);
    }

    private static boolean matches(Pattern pattern, String value) {
        return value != null && pattern.matcher(value).matches();
    }
}
