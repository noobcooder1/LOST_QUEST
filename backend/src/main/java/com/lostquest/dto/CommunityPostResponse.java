package com.lostquest.dto;

import com.lostquest.entity.CommunityPost;
import java.time.Instant;

public record CommunityPostResponse(Long id, String category, String title, String content,
        String authorNickname, Instant createdAt, String imageUrl, LinkedItem linkedItem, long commentCount) {
    public record LinkedItem(Long id, String type, String title) {}
    public static CommunityPostResponse from(CommunityPost post, LinkedItem linkedItem, long commentCount) {
        return new CommunityPostResponse(post.getId(), post.getCategory().path(), post.getTitle(), post.getContent(),
            post.getAuthor().getNickname(), post.getCreatedAt(), post.getImageUrl(), linkedItem, commentCount);
    }
}
