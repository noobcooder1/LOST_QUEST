package com.lostquest.controller;

import com.lostquest.dto.MatchNotificationListResponse;
import com.lostquest.dto.MatchNotificationRefreshResponse;
import com.lostquest.dto.MatchNotificationResponse;
import com.lostquest.dto.UnreadCountResponse;
import com.lostquest.service.notification.MatchNotificationService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in user's match notifications. Every operation is scoped to the JWT subject; no user id is accepted.
 * State changes use POST because CORS allows only GET/POST/OPTIONS.
 */
@Validated
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final MatchNotificationService notificationService;

    public NotificationController(MatchNotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public MatchNotificationListResponse getNotifications(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "" + MatchNotificationService.DEFAULT_LIST_LIMIT)
            @Min(1) @Max(MatchNotificationService.MAX_LIST_LIMIT) int limit) {
        return notificationService.list(jwt.getSubject(), limit);
    }

    @GetMapping("/unread-count")
    public UnreadCountResponse getUnreadCount(@AuthenticationPrincipal Jwt jwt) {
        return notificationService.unreadCount(jwt.getSubject());
    }

    @PostMapping("/{id}/read")
    public MatchNotificationResponse markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable @Positive Long id) {
        return notificationService.markRead(jwt.getSubject(), id);
    }

    @PostMapping("/read-all")
    public UnreadCountResponse markAllRead(@AuthenticationPrincipal Jwt jwt) {
        return notificationService.markAllRead(jwt.getSubject());
    }

    /** Re-matches the caller's recent open lost items and records new strong candidates (throttled per lost item). */
    @PostMapping("/refresh")
    public MatchNotificationRefreshResponse refresh(@AuthenticationPrincipal Jwt jwt) {
        return notificationService.refresh(jwt.getSubject());
    }
}
