package com.lostquest.dto;

import com.lostquest.entity.FoundItem;
import com.lostquest.entity.FoundItemStatus;

import java.time.Instant;
import java.time.LocalDate;

public record FoundItemResponse(
        Long id,
        Long userId,
        String title,
        String category,
        String color,
        String description,
        LocalDate foundDate,
        String region,
        String location,
        String imageUrl,
        FoundItemStatus status,
        Instant createdAt,
        String ownershipQuestion,
        boolean ownershipConfigured,
        boolean hidden
) {
    public static FoundItemResponse from(FoundItem item) {
        return view(item, false);
    }

    /** Call only after author/return-participant authorization; never for anonymous lists/details. */
    public static FoundItemResponse withOwnershipQuestion(FoundItem item) {
        return view(item, true);
    }

    private static FoundItemResponse view(FoundItem item, boolean includeQuestion) {
        return new FoundItemResponse(item.getId(), item.getUser().getId(), item.getTitle(),
                item.getCategory(), item.getColor(), item.getDescription(), item.getFoundDate(),
                item.getRegion(), item.getLocation(), item.getImageUrl(), item.getStatus(), item.getCreatedAt(),
                includeQuestion ? item.getOwnershipQuestion() : null, item.isOwnershipConfigured(), item.isHidden());
    }
}
