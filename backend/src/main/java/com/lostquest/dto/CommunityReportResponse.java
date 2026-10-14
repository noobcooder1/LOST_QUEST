package com.lostquest.dto;

import com.lostquest.entity.CommunityReport;
import java.time.Instant;

public record CommunityReportResponse(Long id, String itemType, Long itemId, String itemTitle,
        String reason, Instant createdAt, Instant hiddenAt) {
    public static CommunityReportResponse from(CommunityReport r) {
        return new CommunityReportResponse(r.getId(), r.getItemType().path(), r.getItemId(), r.getItemTitle(),
            r.getReason(), r.getCreatedAt(), r.getHiddenAt());
    }
}
