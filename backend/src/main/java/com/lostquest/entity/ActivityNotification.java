package com.lostquest.entity;
import jakarta.persistence.*;
import java.time.Instant;
@Entity
@Table(name = "activity_notifications", indexes = @Index(name = "ix_activity_user", columnList = "user_id"))
public class ActivityNotification extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    @Column(nullable = false, length = 200)
    private String title;
    @Column(nullable = false, length = 2000)
    private String message;
    @Column(name = "read_at")
    private Instant readAt;
    protected ActivityNotification() {}
    public ActivityNotification(User user, String title, String message) {
        this.user = user; this.title = title; this.message = message;
    }
    public String getTitle() { return title; }
    public String getMessage() { return message; }
    public Instant getReadAt() { return readAt; }
}
