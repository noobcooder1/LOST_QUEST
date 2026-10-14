package com.lostquest.dto;

import com.lostquest.entity.CommunityQuestion;
import java.time.Instant;

public record CommunityQuestionResponse(Long id, String itemType, Long itemId, String itemTitle,
        String question, String answer, Instant createdAt, Instant answeredAt, boolean canAnswer) {
    public static CommunityQuestionResponse from(CommunityQuestion q, Long userId) {
        return new CommunityQuestionResponse(q.getId(), q.getItemType().path(), q.getItemId(), q.getItemTitle(),
            q.getQuestion(), q.getAnswer(), q.getCreatedAt(), q.getAnsweredAt(), q.getAuthor().getId().equals(userId));
    }
}
