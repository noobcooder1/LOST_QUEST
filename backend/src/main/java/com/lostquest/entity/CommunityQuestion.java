package com.lostquest.entity;

import jakarta.persistence.*;
import java.time.Instant;

/** Private correspondence only; never returned by public item DTOs or list caches. */
@Entity
@Table(name = "community_questions", indexes = {
    @Index(name = "ix_question_post", columnList = "item_type,item_id"),
    @Index(name = "ix_question_author", columnList = "author_id"),
    @Index(name = "ix_question_requester", columnList = "requester_id")
})
public class CommunityQuestion extends BaseEntity {
    @Enumerated(EnumType.STRING) @Column(name = "item_type", nullable = false, length = 10)
    private CommunityItemType itemType;
    @Column(name = "item_id", nullable = false) private Long itemId;
    @Column(name = "item_title", nullable = false, length = 120) private String itemTitle;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "author_id", nullable = false)
    private User author;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "requester_id", nullable = false)
    private User requester;
    @Column(nullable = false, length = 1000) private String question;
    @Column(length = 1000) private String answer;
    @Column(name = "answered_at") private Instant answeredAt;

    protected CommunityQuestion() {}
    public CommunityQuestion(CommunityItemType type, Long itemId, String title, User author, User requester, String question) {
        this.itemType = type; this.itemId = itemId; this.itemTitle = title;
        this.author = author; this.requester = requester; this.question = question;
    }
    public void answer(String value) { answer = value; answeredAt = Instant.now(); }
    public CommunityItemType getItemType() { return itemType; }
    public Long getItemId() { return itemId; }
    public String getItemTitle() { return itemTitle; }
    public User getAuthor() { return author; }
    public User getRequester() { return requester; }
    public String getQuestion() { return question; }
    public String getAnswer() { return answer; }
    public Instant getAnsweredAt() { return answeredAt; }
}
