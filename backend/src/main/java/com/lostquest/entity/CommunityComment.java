package com.lostquest.entity;

import jakarta.persistence.*;

/** A plain-text public reply under one discussion post. */
@Entity
@Table(name = "community_comments", indexes = @Index(name = "ix_community_comment_post", columnList = "post_id,created_at,id"))
public class CommunityComment extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "post_id", nullable = false)
    private CommunityPost post;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    private User author;
    @Column(nullable = false, length = 1000) private String content;

    protected CommunityComment() {}
    public CommunityComment(CommunityPost post, User author, String content) {
        this.post = post; this.author = author; this.content = content;
    }
    public CommunityPost getPost() { return post; }
    public User getAuthor() { return author; }
    public String getContent() { return content; }
}
