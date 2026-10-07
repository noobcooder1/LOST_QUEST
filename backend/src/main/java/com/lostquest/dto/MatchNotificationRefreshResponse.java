package com.lostquest.dto;

import com.lostquest.service.matching.MatchSource;
import com.lostquest.service.matching.SourceResult;

import java.util.List;

/**
 * Result of re-matching the caller's recent open lost items.
 *
 * @param checkedLostItems   lost items matched in this request
 * @param throttledLostItems lost items skipped because they were refreshed recently
 * @param failedLostItems    lost items whose refresh failed unexpectedly (they can be retried right away)
 * @param created            new notifications created (duplicates are never counted)
 * @param sources            per source: OK when every check succeeded, PARTIAL when some did, UNAVAILABLE when none did
 */
public record MatchNotificationRefreshResponse(
        int checkedLostItems,
        int throttledLostItems,
        int failedLostItems,
        int created,
        long unreadCount,
        List<Source> sources
) {
    public record Source(MatchSource source, SourceResult.Status status, String message) {
    }
}
