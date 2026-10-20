package com.lostquest.dto;

import com.lostquest.entity.CommunityComment;
import java.time.Instant;

/** Never exposes author ids or emails; {@code mine} only tells the current viewer whether they may delete it. */
public record CommunityCommentResponse(Long id, String content, String authorNickname, Instant createdAt, boolean mine) {
    public static CommunityCommentResponse from(CommunityComment comment, Long viewerId) {
        return new CommunityCommentResponse(comment.getId(), comment.getContent(), comment.getAuthor().getNickname(),
            comment.getCreatedAt(), viewerId != null && viewerId.equals(comment.getAuthor().getId()));
    }
}
