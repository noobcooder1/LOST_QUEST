package com.lostquest.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "return_requests", indexes = {
    @Index(name = "ix_return_requester", columnList = "requester_id"),
    @Index(name = "ix_return_found", columnList = "found_item_id")
})
public class ReturnRequest extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "found_item_id", nullable = false)
    private FoundItem foundItem;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_id", nullable = false)
    private User requester;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lost_item_id")
    private LostItem lostItem;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReturnStatus status = ReturnStatus.PENDING;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
    @Column(name = "qr_token", length = 64)
    private String qrToken;
    @Column(name = "qr_expires_at")
    private Instant qrExpiresAt;
    @Column(name = "qr_used_at")
    private Instant qrUsedAt;
    protected ReturnRequest() {}
    public ReturnRequest(FoundItem foundItem, User requester, LostItem lostItem) {
        this.foundItem = foundItem; this.requester = requester; this.lostItem = lostItem;
    }
    public FoundItem getFoundItem() { return foundItem; }
    public User getRequester() { return requester; }
    public LostItem getLostItem() { return lostItem; }
    public ReturnStatus getStatus() { return status; }
    public Instant getUpdatedAt() { return updatedAt; }
    public String getQrToken() { return qrToken; }
    public Instant getQrExpiresAt() { return qrExpiresAt; }
    public Instant getQrUsedAt() { return qrUsedAt; }
    public void transition(ReturnStatus next) { status = next; updatedAt = Instant.now(); }
    public void issueQr(String token, Instant expiry) { qrToken = token; qrExpiresAt = expiry; updatedAt = Instant.now(); }
    public void consumeQr() { qrUsedAt = Instant.now(); transition(ReturnStatus.QR_VERIFIED); }
}
