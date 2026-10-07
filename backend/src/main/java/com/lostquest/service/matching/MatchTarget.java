package com.lostquest.service.matching;

import com.lostquest.entity.LostItem;

import java.time.LocalDate;

/** The lost item being matched, reduced to the fields the criteria compare. */
public record MatchTarget(Long lostItemId, String title, String category, String color, String region, LocalDate lostDate) {

    public static MatchTarget of(LostItem item) {
        return new MatchTarget(item.getId(), item.getTitle(), item.getCategory(), item.getColor(), item.getRegion(), item.getLostDate());
    }
}
