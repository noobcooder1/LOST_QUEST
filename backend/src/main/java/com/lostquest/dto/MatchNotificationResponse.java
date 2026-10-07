package com.lostquest.dto;

import com.lostquest.entity.MatchNotification;
import com.lostquest.service.matching.MatchSource;

import java.time.Instant;
import java.time.LocalDate;

/**
 * One match notification. {@code score} is the matching score when the candidate was found (rule-based metadata
 * score, not a probability). LOST_QUEST notifications carry {@code foundItemId}; POLICE ones {@code atcId}/{@code fdSn}.
 */
public record MatchNotificationResponse(
        Long id,
        Long lostItemId,
        String lostItemTitle,
        MatchSource source,
        Long foundItemId,
        String atcId,
        Integer fdSn,
        String foundTitle,
        LocalDate foundDate,
        int score,
        int maxScore,
        Instant createdAt,
        boolean read,
        Instant readAt
) {
    /** The lost item must be loaded (the repository queries fetch it). */
    public static MatchNotificationResponse from(MatchNotification n) {
        return new MatchNotificationResponse(n.getId(), n.getLostItem().getId(), n.getLostItem().getTitle(), n.getSource(),
                n.getFoundItemId(), n.getAtcId(), n.getFdSn(), n.getFoundTitle(), n.getFoundDate(), n.getScore(),
                n.getMaxScore(), n.getCreatedAt(), n.getReadAt() != null, n.getReadAt());
    }
}
