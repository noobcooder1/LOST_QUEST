package com.lostquest.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.ColumnDefault;
import java.time.Instant;

@Entity
@Table(name = "return_requests", indexes = {
    @Index(name = "ix_return_requester", columnList = "requester_id"),
    @Index(name = "ix_return_found", columnList = "found_item_id")
})
public class ReturnRequest extends BaseEntity {
    /** Wrong ownership answers allowed per return request before verification is blocked. */
    public static final int MAX_OWNERSHIP_ATTEMPTS = 5;
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
    /** Legacy: raw QR tokens of requests approved before QR hardening. New issues leave it null (see qrNonce). */
    @Column(name = "qr_token", length = 64)
    private String qrToken;
    /** Random per-issue value; the QR token is derived from it with a server key and is never stored. */
    @Column(name = "qr_nonce", length = 64)
    private String qrNonce;
    @Column(name = "qr_expires_at")
    private Instant qrExpiresAt;
    @Column(name = "qr_used_at")
    private Instant qrUsedAt;
    /** Wrong ownership answers for this request; kept in the database so a restart does not reset the limit. */
    @ColumnDefault("0")
    @Column(name = "ownership_failed_attempts", nullable = false)
    private int ownershipFailedAttempts;
    protected ReturnRequest() {}
    public ReturnRequest(FoundItem foundItem, User requester, LostItem lostItem) {
        this.foundItem = foundItem; this.requester = requester; this.lostItem = lostItem;
    }
    public FoundItem getFoundItem() { return foundItem; }
    public User getRequester() { return requester; }
    public LostItem getLostItem() { return lostItem; }
    public ReturnStatus getStatus() { return status; }
    public Instant getUpdatedAt() { return updatedAt; }
    /** Legacy raw token (null for QRs issued after hardening). */
    public String getQrToken() { return qrToken; }
    public String getQrNonce() { return qrNonce; }
    public int getOwnershipFailedAttempts() { return ownershipFailedAttempts; }
    public int ownershipAttemptsRemaining() { return Math.max(0, MAX_OWNERSHIP_ATTEMPTS - ownershipFailedAttempts); }
    public boolean isOwnershipLocked() { return ownershipFailedAttempts >= MAX_OWNERSHIP_ATTEMPTS; }
    public void recordFailedOwnershipAttempt() { ownershipFailedAttempts++; updatedAt = Instant.now(); }
    public Instant getQrExpiresAt() { return qrExpiresAt; }
    public Instant getQrUsedAt() { return qrUsedAt; }
    public void transition(ReturnStatus next) { status = next; updatedAt = Instant.now(); }
    /** A new nonce replaces the previous one (and any legacy raw token), so older QRs stop working. */
    public void issueQr(String nonce, Instant expiry) { qrNonce = nonce; qrToken = null; qrExpiresAt = expiry; updatedAt = Instant.now(); }
    /** Single use: the credential material is cleared together with the status change. */
    public void consumeQr() { qrUsedAt = Instant.now(); qrNonce = null; qrToken = null; transition(ReturnStatus.QR_VERIFIED); }
}
