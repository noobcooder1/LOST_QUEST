package com.lostquest.dto;
import com.lostquest.entity.ActivityNotification;
import java.time.Instant;
public record ActivityNotificationResponse(Long id, String title, String message, Instant createdAt, boolean read) {
    public static ActivityNotificationResponse from(ActivityNotification n) {
        return new ActivityNotificationResponse(n.getId(), n.getTitle(), n.getMessage(), n.getCreatedAt(), n.getReadAt() != null);
    }
}
