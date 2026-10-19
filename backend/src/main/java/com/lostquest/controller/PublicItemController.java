package com.lostquest.controller;

import com.lostquest.dto.PublicItemFiltersResponse;
import com.lostquest.dto.PublicItemPageResponse;
import com.lostquest.dto.PublicItemResponse;
import com.lostquest.service.PoliceCodeService;
import com.lostquest.service.PoliceItemService;
import com.lostquest.service.PoliceListCache;
import com.lostquest.service.PoliceItemService.PoliceFilter;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * 경찰청 공공데이터 (public data) read API. Kept separate from /api/lost-items and /api/found-items, which
 * serve LOST QUEST's own registrations. Public lists share a bounded 12-hour memory cache; details stay live.
 */
@Validated
@RestController
@RequestMapping("/api/public-items")
public class PublicItemController {

    // Shapes of the codes returned by the police common-code API (format check only).
    private static final String REGION = "LC[A-Z]000";
    private static final String CATEGORY = "PR[A-Z]000";
    private static final String SUB_CATEGORY = "PR[A-Z][0-9]{3}";
    private static final String COLOR = "CL[0-9]{4}";

    private final PoliceItemService policeItemService;
    private final PoliceCodeService policeCodeService;
    private final PoliceListCache listCache;

    public PublicItemController(PoliceItemService policeItemService, PoliceCodeService policeCodeService, PoliceListCache listCache) {
        this.policeItemService = policeItemService;
        this.policeCodeService = policeCodeService;
        this.listCache = listCache;
    }

    /**
     * Date mode (default: last 30 days, max 90) with optional region / category / subCategory filters, or keyword
     * mode (q / place; the police API supports neither dates nor code filters there). Filter values come from
     * {@code GET /api/public-items/filters}; their format is checked here and their existence in the service.
     */
    @GetMapping("/lost")
    public PublicItemPageResponse getLostItems(
            @RequestParam(defaultValue = "1") @Min(1) @Max(1000) int page,
            @RequestParam(defaultValue = "50") @Min(1) @Max(50) int size,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) @Size(max = 50) String q,
            @RequestParam(required = false) @Size(max = 50) String place,
            @RequestParam(required = false) @Pattern(regexp = REGION) String region,
            @RequestParam(required = false) @Pattern(regexp = CATEGORY) String category,
            @RequestParam(required = false) @Pattern(regexp = SUB_CATEGORY) String subCategory,
            @RequestParam(required = false) @Pattern(regexp = COLOR) String color,
            @RequestParam(defaultValue = "false") boolean refresh) {
        var filter = new PoliceFilter(region, category, subCategory, color);
        return listCache.get(listCache.key("lost", page, size, from, to, q, place, filter), refresh,
                () -> policeItemService.listLost(page, size, from, to, q, place, filter));
    }

    /** Same as lost items plus {@code color} (a color group id; the lost-item API has no color condition). */
    @GetMapping("/found")
    public PublicItemPageResponse getFoundItems(
            @RequestParam(defaultValue = "1") @Min(1) @Max(1000) int page,
            @RequestParam(defaultValue = "50") @Min(1) @Max(50) int size,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) @Size(max = 50) String q,
            @RequestParam(required = false) @Size(max = 50) String storagePlace,
            @RequestParam(required = false) @Pattern(regexp = REGION) String region,
            @RequestParam(required = false) @Pattern(regexp = CATEGORY) String category,
            @RequestParam(required = false) @Pattern(regexp = SUB_CATEGORY) String subCategory,
            @RequestParam(required = false) @Pattern(regexp = COLOR) String color,
            @RequestParam(defaultValue = "false") boolean refresh) {
        var filter = new PoliceFilter(region, category, subCategory, color);
        return listCache.get(listCache.key("found", page, size, from, to, q, storagePlace, filter), refresh,
                () -> policeItemService.listFound(page, size, from, to, q, storagePlace, filter));
    }

    /** Region / item-class / color options from the live 경찰청 common-code API (cached). */
    @GetMapping("/filters")
    public PublicItemFiltersResponse getFilters() {
        PoliceCodeService.PoliceCodes codes = policeCodeService.codes();
        return new PublicItemFiltersResponse(
                codes.regions().stream().map(r -> new PublicItemFiltersResponse.Option(r.code(), r.name())).toList(),
                codes.categories().stream().map(c -> new PublicItemFiltersResponse.Category(c.code(), c.name(),
                        c.children().stream().map(child -> new PublicItemFiltersResponse.Option(child.code(), child.name())).toList())).toList(),
                codes.colors().stream().map(c -> new PublicItemFiltersResponse.Option(c.id(), c.name())).toList());
    }

    @GetMapping("/lost/{atcId}")
    public PublicItemResponse getLostItem(@PathVariable @Pattern(regexp = "L[0-9]{16}") String atcId) {
        return policeItemService.lostDetail(atcId);
    }

    @GetMapping("/found/{atcId}/{fdSn}")
    public PublicItemResponse getFoundItem(@PathVariable @Pattern(regexp = "F[0-9]{16}") String atcId,
                                           @PathVariable @Min(1) @Max(999) int fdSn) {
        return policeItemService.foundDetail(atcId, fdSn);
    }
}
