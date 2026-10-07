package com.lostquest.dto;

import java.util.List;

/** The caller's newest notifications plus the total number of unread ones (not only those in the list). */
public record MatchNotificationListResponse(List<MatchNotificationResponse> notifications, long unreadCount) {
}
