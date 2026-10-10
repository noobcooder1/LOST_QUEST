package com.lostquest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * No userId, status or imageUrl: the author comes from the JWT, the status is always STORED,
 * and an optional photo is uploaded through the multipart variant. Unknown JSON fields are ignored by Jackson.
 */
public record CreateFoundItemRequest(
        @NotBlank @Size(max = ItemFieldRules.TITLE_MAX) String title,
        @NotBlank @Pattern(regexp = ItemFieldRules.CATEGORY_PATTERN, message = ItemFieldRules.CATEGORY_MESSAGE) String category,
        @NotBlank @Size(max = ItemFieldRules.COLOR_MAX) String color,
        @NotBlank @Size(min = ItemFieldRules.DESCRIPTION_MIN, max = ItemFieldRules.DESCRIPTION_MAX) String description,
        @NotNull @PastOrPresent LocalDate foundDate,
        @NotBlank @Pattern(regexp = ItemFieldRules.REGION_PATTERN, message = ItemFieldRules.REGION_MESSAGE) String region,
        @NotBlank @Size(max = ItemFieldRules.LOCATION_MAX) String location,
        @Size(max = 200) String ownershipQuestion,
        @Size(max = 100) String ownershipAnswer
) {
}
