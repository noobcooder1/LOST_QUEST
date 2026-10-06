package com.lostquest.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * One page of 경찰청 items. {@code searchMode} is DATE_RANGE (classification/area/period operation) or
 * KEYWORD (name/place operation, which the police API serves without date filtering; from/to are null).
 */
public record PublicItemPageResponse(
        List<PublicItemResponse> items,
        int page,
        int size,
        int totalCount,
        int totalPages,
        String searchMode,
        LocalDate from,
        LocalDate to
) {
}
