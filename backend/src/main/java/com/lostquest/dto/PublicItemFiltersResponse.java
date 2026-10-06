package com.lostquest.dto;

import java.util.List;

/**
 * Filter options for 경찰청 search, taken from the police common-code API. The UI shows {@code name} and sends
 * {@code value} back unchanged; it never needs to know the police code system.
 */
public record PublicItemFiltersResponse(
        List<Option> regions,
        List<Category> categories,
        /** Found items only: the 경찰청 lost-item API has no color condition. */
        List<Option> colors
) {
    public record Option(String value, String name) {
    }

    public record Category(String value, String name, List<Option> children) {
    }
}
