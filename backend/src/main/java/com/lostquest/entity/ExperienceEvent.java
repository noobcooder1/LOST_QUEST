package com.lostquest.entity;
import jakarta.persistence.*;
@Entity
@Table(name = "experience_events", uniqueConstraints =
    @UniqueConstraint(name = "uk_experience_user_event", columnNames = {"user_id", "event_key"}))
public class ExperienceEvent extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    @Column(name = "event_key", nullable = false, length = 100)
    private String eventKey;
    @Column(nullable = false)
    private int amount;
    protected ExperienceEvent() {}
    public ExperienceEvent(User user, String eventKey, int amount) {
        this.user = user; this.eventKey = eventKey; this.amount = amount;
    }
    public int getAmount() { return amount; }
}
