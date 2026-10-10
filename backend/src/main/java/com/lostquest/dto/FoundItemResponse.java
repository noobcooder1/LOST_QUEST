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
        boolean ownershipConfigured
) {
    public static FoundItemResponse from(FoundItem item) {
        return new FoundItemResponse(item.getId(), item.getUser().getId(), item.getTitle(),
                item.getCategory(), item.getColor(), item.getDescription(), item.getFoundDate(),
                item.getRegion(), item.getLocation(), item.getImageUrl(), item.getStatus(), item.getCreatedAt(),
                item.getOwnershipQuestion(), item.isOwnershipConfigured());
    }
}
