package com.lostquest.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "community_reports", uniqueConstraints =
    @UniqueConstraint(name = "uq_report_user_post", columnNames = {"reporter_id", "item_type", "item_id"}))
public class CommunityReport extends BaseEntity {
    @Enumerated(EnumType.STRING) @Column(name = "item_type", nullable = false, length = 10)
    private CommunityItemType itemType;
    @Column(name = "item_id", nullable = false) private Long itemId;
    @Column(name = "item_title", nullable = false, length = 120) private String itemTitle;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "reporter_id", nullable = false)
    private User reporter;
    @Column(nullable = false, length = 1000) private String reason;
    @Column(name = "hidden_at") private Instant hiddenAt;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "moderator_id") private User moderator;

    protected CommunityReport() {}
    public CommunityReport(CommunityItemType type, Long itemId, String title, User reporter, String reason) {
        this.itemType = type; this.itemId = itemId; this.itemTitle = title; this.reporter = reporter; this.reason = reason;
    }
    public void markHidden(User user) { if (hiddenAt == null) { hiddenAt = Instant.now(); moderator = user; } }
    public CommunityItemType getItemType() { return itemType; }
    public Long getItemId() { return itemId; }
    public String getItemTitle() { return itemTitle; }
    public String getReason() { return reason; }
    public Instant getHiddenAt() { return hiddenAt; }
}
