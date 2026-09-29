package com.lostquest.dto;

import com.lostquest.entity.LostItem;
import com.lostquest.entity.LostItemStatus;

import java.time.Instant;
import java.time.LocalDate;

public record LostItemResponse(
        Long id,
        Long userId,
        String title,
        String category,
        String color,
        String description,
        LocalDate lostDate,
        String location,
        String imageUrl,
        LostItemStatus status,
        Instant createdAt
) {
    public static LostItemResponse from(LostItem item) {
        return new LostItemResponse(item.getId(), item.getUser().getId(), item.getTitle(),
                item.getCategory(), item.getColor(), item.getDescription(), item.getLostDate(),
                item.getLocation(), item.getImageUrl(), item.getStatus(), item.getCreatedAt());
    }
}
