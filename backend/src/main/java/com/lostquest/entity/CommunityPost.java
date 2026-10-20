package com.lostquest.entity;

import jakarta.persistence.*;

/** Public discussions have their own collection; an optional item reference never copies item details. */
@Entity
@Table(name = "community_posts", indexes = {
    @Index(name = "ix_community_post_newest", columnList = "created_at,id"),
    @Index(name = "ix_community_post_category", columnList = "category,created_at,id")
})
public class CommunityPost extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    private User author;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private CommunityCategory category;
    @Column(nullable = false, length = 120) private String title;
    @Column(nullable = false, length = 3000) private String content;
    @Column(name = "image_url", length = 2048) private String imageUrl;
    @Enumerated(EnumType.STRING) @Column(name = "linked_item_type", length = 10)
    private CommunityItemType linkedItemType;
    @Column(name = "linked_item_id") private Long linkedItemId;

    protected CommunityPost() {}
    public CommunityPost(User author, CommunityCategory category, String title, String content, String imageUrl,
            CommunityItemType linkedItemType, Long linkedItemId) {
        this.author = author; this.category = category; this.title = title; this.content = content;
        this.imageUrl = imageUrl; this.linkedItemType = linkedItemType; this.linkedItemId = linkedItemId;
    }
    public User getAuthor() { return author; }
    public CommunityCategory getCategory() { return category; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public String getImageUrl() { return imageUrl; }
    public CommunityItemType getLinkedItemType() { return linkedItemType; }
    public Long getLinkedItemId() { return linkedItemId; }
}
